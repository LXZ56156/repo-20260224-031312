const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const indexPath = require.resolve('../cloudfunctions/reportProductEvents/index.js');
const logicPath = require.resolve('../cloudfunctions/reportProductEvents/logic.js');
const commonPath = require.resolve('../cloudfunctions/reportProductEvents/lib/common.js');

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
  const docs = new Map();
  let transactionCalls = 0;
  return {
    docs,
    get transactionCalls() { return transactionCalls; },
    serverDate() {
      return { $serverDate: true };
    },
    async runTransaction(handler) {
      transactionCalls += 1;
      if (options.error) throw options.error;
      return handler({
        collection(name) {
          assert.equal(name, 'product_events');
          return {
            doc(id) {
              return {
                async get() {
                  if (!docs.has(id)) throw new Error('document.get:fail document does not exist');
                  return { data: docs.get(id) };
                },
                async set({ data }) {
                  docs.set(id, JSON.parse(JSON.stringify(data)));
                }
              };
            }
          };
        }
      });
    }
  };
}

function loadIndex(defaultDb) {
  const originalLoad = Module._load;
  let getContextCalls = 0;
  const mockSdk = {
    init() {},
    database() {
      return defaultDb;
    },
    getWXContext() {
      getContextCalls += 1;
      throw new Error('reportProductEvents must never read OPENID');
    },
    DYNAMIC_CURRENT_ENV: 'test-env'
  };

  delete require.cache[indexPath];
  delete require.cache[logicPath];
  delete require.cache[commonPath];
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const loaded = require(indexPath);
    return {
      ...loaded,
      get getContextCalls() { return getContextCalls; }
    };
  } finally {
    Module._load = originalLoad;
  }
}

test('missing server flag is disabled with an exact non-blocking response and zero database work', async () => {
  const db = createMemoryDb();
  const loaded = loadIndex(db);
  const previous = process.env.PRODUCT_EVENTS_ENABLED;
  delete process.env.PRODUCT_EVENTS_ENABLED;

  try {
    const result = await loaded.main({
      __traceId: 'trace-events_1',
      events: [validEvent()]
    });
    assert.deepEqual(result, {
      ok: true,
      code: 'EVENT_PIPELINE_DISABLED',
      message: '事件管道未启用',
      state: 'disabled',
      traceId: 'trace-events_1',
      data: {
        accepted: 0,
        deduped: 0,
        rejected: 0
      }
    });
    assert.equal(db.transactionCalls, 0);
    assert.equal(loaded.getContextCalls, 0);
  } finally {
    if (previous === undefined) delete process.env.PRODUCT_EVENTS_ENABLED;
    else process.env.PRODUCT_EVENTS_ENABLED = previous;
  }
});

test('only the exact true server flag enables writes and accepted contract stays normalized', async () => {
  const db = createMemoryDb();
  const loaded = loadIndex(db);
  const handler = loaded._private.createHandler({
    db,
    env: { PRODUCT_EVENTS_ENABLED: 'true' },
    now: () => NOW_MS,
    logger: { error() {} }
  });

  const result = await handler({
    __traceId: 'trace-events_2',
    events: [validEvent()]
  });

  assert.deepEqual(result, {
    ok: true,
    code: 'PRODUCT_EVENTS_ACCEPTED',
    message: '事件已接收',
    state: 'accepted',
    traceId: 'trace-events_2',
    data: {
      accepted: 1,
      deduped: 0,
      rejected: 0,
      rejections: []
    }
  });
  assert.equal(db.transactionCalls, 1);
  assert.equal(db.docs.size, 1);
  assert.equal(loaded.getContextCalls, 0);
});

test('batch-level validation returns a stable invalid contract without touching the database', async () => {
  const db = createMemoryDb();
  const loaded = loadIndex(db);
  const handler = loaded._private.createHandler({
    db,
    env: { PRODUCT_EVENTS_ENABLED: 'true' },
    now: () => NOW_MS,
    logger: { error() {} }
  });

  const result = await handler({
    __traceId: 'trace-events_3',
    events: []
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'PRODUCT_EVENTS_INVALID',
    message: '事件批次不合法',
    state: 'invalid',
    traceId: 'trace-events_3',
    data: {
      accepted: 0,
      deduped: 0,
      rejected: 0,
      reason: 'BATCH_EMPTY'
    }
  });
  assert.equal(db.transactionCalls, 0);
  assert.equal(loaded.getContextCalls, 0);
});

test('partial item rejection is reported with index and code only', async () => {
  const db = createMemoryDb();
  const loaded = loadIndex(db);
  const handler = loaded._private.createHandler({
    db,
    env: { PRODUCT_EVENTS_ENABLED: 'true' },
    now: () => NOW_MS,
    logger: { error() {} }
  });
  const secret = 'nickname_openid_secret';

  const result = await handler({
    __traceId: 'trace-events_4',
    events: [
      validEvent(),
      validEvent({
        eventId: 'event_11111111111111111111111111111111',
        properties: {
          t: 'deadbeef',
          src: 'share_entry',
          a: 'view',
          nickname: secret
        }
      })
    ]
  });

  assert.deepEqual(result, {
    ok: true,
    code: 'PRODUCT_EVENTS_ACCEPTED',
    message: '事件已接收',
    state: 'accepted',
    traceId: 'trace-events_4',
    data: {
      accepted: 1,
      deduped: 0,
      rejected: 1,
      rejections: [{ index: 1, code: 'PROPERTY_KEY_NOT_ALLOWED' }]
    }
  });
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify([...db.docs.values()]).includes(secret), false);
  assert.equal(loaded.getContextCalls, 0);
});

test('database failures map to a stable shape without leaking SDK errors or payloads', async () => {
  const secret = 'sdk_failure_with_openid_and_payload_secret';
  const db = createMemoryDb({ error: new Error(secret) });
  const loaded = loadIndex(db);
  const logCalls = [];
  const handler = loaded._private.createHandler({
    db,
    env: { PRODUCT_EVENTS_ENABLED: 'true' },
    now: () => NOW_MS,
    logger: { error(...args) { logCalls.push(args); } }
  });

  const result = await handler({
    __traceId: 'trace-events_5',
    events: [validEvent()]
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'PRODUCT_EVENTS_DATABASE_FAILED',
    message: '事件暂未接收',
    state: 'database_failure',
    traceId: 'trace-events_5',
    data: {
      accepted: 0,
      deduped: 0,
      rejected: 0
    }
  });
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(logCalls).includes(secret), false);
  assert.deepEqual(logCalls, [[
    '[reportProductEvents]',
    'trace-events_5',
    'database failure'
  ]]);
  assert.equal(loaded.getContextCalls, 0);
});

test('trace ids are bounded opaque tokens and arbitrary text is never echoed', async () => {
  const db = createMemoryDb();
  const loaded = loadIndex(db);
  const handler = loaded._private.createHandler({
    db,
    env: {},
    now: () => NOW_MS,
    logger: { error() {} }
  });

  const result = await handler({
    __traceId: 'nickname <script>alert(1)</script>',
    events: [validEvent()]
  });

  assert.equal(result.traceId, '');
  assert.equal(JSON.stringify(result).includes('nickname'), false);
});
