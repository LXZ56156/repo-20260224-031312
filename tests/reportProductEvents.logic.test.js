const test = require('node:test');
const assert = require('node:assert/strict');

const clientConfig = require('../miniprogram/config/productEvents');
const logic = require('../cloudfunctions/reportProductEvents/logic');

const NOW_MS = 1700000000000;

function validEvent(extra = {}) {
  return {
    eventId: 'event_0123456789abcdef0123456789abcdef',
    name: 'share_entry_view',
    occurredAtMs: NOW_MS,
    anonymousInstallId: 'install_0123456789abcdef0123456789abcdef',
    properties: {
      t: 'deadbeef',
      s: 'running',
      m: 'multi_rotate',
      src: 'share_entry',
      a: 'view'
    },
    ...extra
  };
}

function createMemoryDb(options = {}) {
  const docs = options.docs || new Map();
  const writes = [];
  const serverDates = [];
  let transactionCalls = 0;
  const db = {
    serverDate() {
      const value = { $serverDate: serverDates.length + 1 };
      serverDates.push(value);
      return value;
    },
    async runTransaction(handler) {
      transactionCalls += 1;
      if (options.transactionError) throw options.transactionError;
      return handler({
        collection(name) {
          assert.equal(name, logic.COLLECTION_NAME);
          return {
            doc(id) {
              return {
                async get() {
                  if (options.getError) throw options.getError;
                  if (!docs.has(id)) {
                    throw new Error('document.get:fail document does not exist');
                  }
                  return { data: docs.get(id) };
                },
                async set(payload) {
                  if (options.setError) throw options.setError;
                  assert.deepEqual(Object.keys(payload), ['data']);
                  assert.equal(Object.prototype.hasOwnProperty.call(payload.data, '_id'), false);
                  const saved = JSON.parse(JSON.stringify(payload.data));
                  docs.set(id, saved);
                  writes.push({ id, data: saved });
                  return { stats: { created: 1 } };
                }
              };
            }
          };
        }
      });
    }
  };
  return {
    db,
    docs,
    writes,
    serverDates,
    get transactionCalls() { return transactionCalls; }
  };
}

test('client and cloud share the same explicit event and property dictionaries', () => {
  assert.deepEqual(logic.EVENT_NAMES, clientConfig.eventNames);
  assert.deepEqual(logic.EVENT_DEFINITIONS, clientConfig.eventDefinitions);
  assert.deepEqual(logic.PROPERTY_KEYS, clientConfig.propertyKeys);
  assert.equal(logic.MAX_BATCH_SIZE, clientConfig.maxBatchSize);
});

test('server feature flag is strict and false unless the exact value is true', () => {
  assert.equal(logic.isServerEnabled({}), false);
  assert.equal(logic.isServerEnabled({ PRODUCT_EVENTS_ENABLED: '' }), false);
  assert.equal(logic.isServerEnabled({ PRODUCT_EVENTS_ENABLED: '1' }), false);
  assert.equal(logic.isServerEnabled({ PRODUCT_EVENTS_ENABLED: 'TRUE' }), false);
  assert.equal(logic.isServerEnabled({ PRODUCT_EVENTS_ENABLED: 'yes' }), false);
  assert.equal(logic.isServerEnabled({ PRODUCT_EVENTS_ENABLED: 'true' }), true);
});

test('valid events are stored with irreversible identifiers and server receive time only', async () => {
  const memory = createMemoryDb();
  const event = validEvent();
  const result = await logic.processBatch(memory.db, [event], NOW_MS);

  assert.deepEqual(result, {
    ok: true,
    accepted: 1,
    deduped: 0,
    rejected: 0,
    rejections: []
  });
  assert.equal(memory.transactionCalls, 1);
  assert.equal(memory.writes.length, 1);
  assert.match(memory.writes[0].id, /^pe_[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(memory.writes[0].data).sort(), [
    'anonymousInstallHash',
    'eventIdHash',
    'name',
    'occurredAtMs',
    'properties',
    'receivedAt',
    'receivedAtMs',
    'schemaVersion'
  ]);
  assert.deepEqual(memory.writes[0].data.receivedAt, { $serverDate: 1 });
  assert.equal(memory.writes[0].data.receivedAtMs, NOW_MS);
  assert.match(memory.writes[0].data.anonymousInstallHash, /^[0-9a-f]{64}$/);
  assert.match(memory.writes[0].data.eventIdHash, /^[0-9a-f]{64}$/);
  assert.equal(memory.writes[0].data.eventId, undefined);
  assert.equal(memory.writes[0].data.anonymousInstallId, undefined);
  assert.equal(memory.writes[0].data.OPENID, undefined);
  assert.equal(memory.writes[0].data._id, undefined);

  const serialized = JSON.stringify(memory.writes);
  assert.equal(serialized.includes(event.eventId), false);
  assert.equal(serialized.includes(event.anonymousInstallId), false);
  assert.equal(serialized.includes('raw_tournament'), false);
});

test('same event is idempotent within and across batches while different installs stay distinct', async () => {
  const memory = createMemoryDb();
  const firstEvent = validEvent();
  const sameEvent = JSON.parse(JSON.stringify(firstEvent));

  const first = await logic.processBatch(memory.db, [firstEvent, sameEvent], NOW_MS);
  assert.deepEqual(first, {
    ok: true,
    accepted: 1,
    deduped: 1,
    rejected: 0,
    rejections: []
  });
  assert.equal(memory.writes.length, 1);

  const retry = await logic.processBatch(memory.db, [sameEvent], NOW_MS + 1);
  assert.deepEqual(retry, {
    ok: true,
    accepted: 0,
    deduped: 1,
    rejected: 0,
    rejections: []
  });
  assert.equal(memory.writes.length, 1);

  const otherInstall = validEvent({
    anonymousInstallId: 'install_fedcba9876543210fedcba9876543210'
  });
  const distinct = await logic.processBatch(memory.db, [otherInstall], NOW_MS + 2);
  assert.equal(distinct.accepted, 1);
  assert.equal(distinct.deduped, 0);
  assert.equal(memory.writes.length, 2);
  assert.notEqual(memory.writes[0].id, memory.writes[1].id);
});

test('one invalid item does not block valid events and rejection metadata never echoes payloads', async () => {
  const memory = createMemoryDb();
  const secret = 'openid_and_nickname_secret';
  const result = await logic.processBatch(memory.db, [
    validEvent(),
    validEvent({
      eventId: 'event_11111111111111111111111111111111',
      name: 'dynamic_free_text_event'
    }),
    validEvent({
      eventId: 'event_22222222222222222222222222222222',
      properties: {
        t: 'deadbeef',
        src: 'share_entry',
        a: 'view',
        openid: secret
      }
    })
  ], NOW_MS);

  assert.deepEqual(result, {
    ok: true,
    accepted: 1,
    deduped: 0,
    rejected: 2,
    rejections: [
      { index: 1, code: 'EVENT_NAME_NOT_ALLOWED' },
      { index: 2, code: 'PROPERTY_KEY_NOT_ALLOWED' }
    ]
  });
  assert.equal(memory.writes.length, 1);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(memory.writes).includes(secret), false);
});

test('PII aliases, raw ids, URLs, free text, arrays, and nested values are rejected', async () => {
  const invalidEvents = [
    validEvent({
      eventId: 'event_00000000000000000000000000000001',
      OPENID: 'openid_secret'
    }),
    validEvent({
      eventId: 'event_00000000000000000000000000000002',
      properties: { t: 'raw_tournament_id', src: 'share_entry', a: 'view' }
    }),
    validEvent({
      eventId: 'event_00000000000000000000000000000003',
      properties: { t: 'deadbeef', src: 'https://example.com/private', a: 'view' }
    }),
    validEvent({
      eventId: 'event_00000000000000000000000000000004',
      properties: { t: 'deadbeef', src: 'share_entry', a: '球友昵称正文' }
    }),
    validEvent({
      eventId: 'event_00000000000000000000000000000005',
      properties: { t: 'deadbeef', src: 'share_entry', a: ['view'] }
    }),
    validEvent({
      eventId: 'event_00000000000000000000000000000006',
      properties: { t: 'deadbeef', src: 'share_entry', a: { value: 'view' } }
    })
  ];
  const memory = createMemoryDb();
  const result = await logic.processBatch(memory.db, invalidEvents, NOW_MS);

  assert.equal(result.accepted, 0);
  assert.equal(result.deduped, 0);
  assert.equal(result.rejected, invalidEvents.length);
  assert.deepEqual(result.rejections.map((item) => item.index), [0, 1, 2, 3, 4, 5]);
  assert.equal(memory.transactionCalls, 0);
  assert.equal(memory.writes.length, 0);
});

test('batch size and client timestamps are validated at exact boundaries', () => {
  const tooOld = validEvent({
    eventId: 'event_00000000000000000000000000000001',
    occurredAtMs: NOW_MS - logic.MAX_EVENT_AGE_MS - 1
  });
  const oldBoundary = validEvent({
    eventId: 'event_00000000000000000000000000000002',
    occurredAtMs: NOW_MS - logic.MAX_EVENT_AGE_MS
  });
  const futureBoundary = validEvent({
    eventId: 'event_00000000000000000000000000000003',
    occurredAtMs: NOW_MS + logic.MAX_FUTURE_SKEW_MS
  });
  const tooFuture = validEvent({
    eventId: 'event_00000000000000000000000000000004',
    occurredAtMs: NOW_MS + logic.MAX_FUTURE_SKEW_MS + 1
  });

  assert.equal(logic.validateEvent(tooOld, NOW_MS).code, 'EVENT_TIME_INVALID');
  assert.equal(logic.validateEvent(oldBoundary, NOW_MS).ok, true);
  assert.equal(logic.validateEvent(futureBoundary, NOW_MS).ok, true);
  assert.equal(logic.validateEvent(tooFuture, NOW_MS).code, 'EVENT_TIME_INVALID');

  assert.deepEqual(logic.validateBatch(null, NOW_MS), {
    ok: false,
    code: 'BATCH_NOT_ARRAY',
    rejected: 0,
    rejections: []
  });
  assert.deepEqual(logic.validateBatch([], NOW_MS), {
    ok: false,
    code: 'BATCH_EMPTY',
    rejected: 0,
    rejections: []
  });

  const oversized = Array.from({ length: logic.MAX_BATCH_SIZE + 1 }, (_, index) => validEvent({
    eventId: `event_${String(index).padStart(32, '0')}`
  }));
  assert.deepEqual(logic.validateBatch(oversized, NOW_MS), {
    ok: false,
    code: 'BATCH_TOO_LARGE',
    rejected: logic.MAX_BATCH_SIZE + 1,
    rejections: []
  });
});

test('valid writes require real transaction support and propagate database failures for stable index mapping', async () => {
  await assert.rejects(
    () => logic.processBatch({ serverDate() { return {}; } }, [validEvent()], NOW_MS),
    /transaction/i
  );

  const failedRead = createMemoryDb({ getError: new Error('database sdk read failure') });
  await assert.rejects(
    () => logic.processBatch(failedRead.db, [validEvent()], NOW_MS),
    /database sdk read failure/
  );

  const failedWrite = createMemoryDb({ setError: new Error('database sdk write failure') });
  await assert.rejects(
    () => logic.processBatch(failedWrite.db, [validEvent()], NOW_MS),
    /database sdk write failure/
  );
});
