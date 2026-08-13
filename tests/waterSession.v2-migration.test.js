const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/waterSession/index.js');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function makeDb(seed = {}) {
  let state = new Map();
  let transactionTail = Promise.resolve();
  let transactionCount = 0;

  Object.entries(seed).forEach(([collectionName, documents]) => {
    state.set(collectionName, new Map(
      Object.entries(documents).map(([id, data]) => [id, clone(data)])
    ));
  });

  function cloneState(source) {
    const output = new Map();
    source.forEach((documents, collectionName) => {
      output.set(collectionName, new Map(
        Array.from(documents, ([id, data]) => [id, clone(data)])
      ));
    });
    return output;
  }

  function documentsFor(target, collectionName) {
    if (!target.has(collectionName)) target.set(collectionName, new Map());
    return target.get(collectionName);
  }

  function matches(document, filter) {
    return Object.entries(filter || {}).every(([key, expected]) => {
      const actual = document[key];
      if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
        if (Object.prototype.hasOwnProperty.call(expected, '$lt')) return Number(actual) < Number(expected.$lt);
        if (Object.prototype.hasOwnProperty.call(expected, '$gt')) return Number(actual) > Number(expected.$gt);
        if (Object.prototype.hasOwnProperty.call(expected, '$lte')) return Number(actual) <= Number(expected.$lte);
        if (Object.prototype.hasOwnProperty.call(expected, '$gte')) return Number(actual) >= Number(expected.$gte);
        if (Object.prototype.hasOwnProperty.call(expected, '$in')) return expected.$in.includes(actual);
      }
      return actual === expected;
    });
  }

  function makeCollection(target, collectionName) {
    const documents = documentsFor(target, collectionName);
    return {
      doc(id) {
        const documentId = String(id || '');
        return {
          async get() {
            if (!documents.has(documentId)) {
              throw new Error('document.get:fail document does not exist');
            }
            return { data: { _id: documentId, ...clone(documents.get(documentId)) } };
          },
          async set(payload) {
            documents.set(documentId, clone(payload.data));
            return { _id: documentId };
          },
          async update(payload) {
            if (!documents.has(documentId)) return { stats: { updated: 0 } };
            documents.set(documentId, { ...documents.get(documentId), ...clone(payload.data) });
            return { stats: { updated: 1 } };
          },
          async remove() {
            const deleted = documents.delete(documentId);
            return { stats: { removed: deleted ? 1 : 0 } };
          }
        };
      },
      where(filter) {
        let order = null;
        let maximum = Infinity;
        let offset = 0;
        const query = {
          orderBy(field, direction) {
            order = { field, direction };
            return query;
          },
          skip(value) {
            offset = Math.max(0, Number(value) || 0);
            return query;
          },
          limit(value) {
            maximum = Number(value);
            return query;
          },
          async get() {
            let rows = Array.from(documents, ([id, data]) => ({ _id: id, ...clone(data) }))
              .filter((item) => matches(item, filter));
            if (order) {
              const direction = order.direction === 'asc' ? 1 : -1;
              rows.sort((a, b) => {
                const left = a[order.field];
                const right = b[order.field];
                if (typeof left === 'number' || typeof right === 'number') {
                  return (Number(left) - Number(right)) * direction;
                }
                return String(left || '').localeCompare(String(right || '')) * direction;
              });
            }
            return { data: rows.slice(offset, offset + maximum) };
          }
        };
        return query;
      }
    };
  }

  function makeReader(target) {
    return {
      collection(name) {
        return makeCollection(target, name);
      }
    };
  }

  const db = {
    command: {
      lt(value) { return { $lt: value }; },
      gt(value) { return { $gt: value }; },
      lte(value) { return { $lte: value }; },
      gte(value) { return { $gte: value }; },
      in(value) { return { $in: value }; }
    },
    serverDate() {
      return { $serverDate: true };
    },
    async createCollection(name) {
      documentsFor(state, name);
    },
    collection(name) {
      return makeCollection(state, name);
    },
    async runTransaction(handler) {
      transactionCount += 1;
      let release;
      const previous = transactionTail;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      const draft = cloneState(state);
      try {
        const outcome = await handler(makeReader(draft));
        state = draft;
        release();
        return outcome;
      } catch (err) {
        release();
        throw err;
      }
    }
  };

  return {
    db,
    read(collectionName, id) {
      const documents = state.get(collectionName);
      return documents && documents.has(id) ? clone(documents.get(id)) : null;
    },
    all(collectionName) {
      const documents = state.get(collectionName) || new Map();
      return Array.from(documents, ([id, data]) => ({ _id: id, ...clone(data) }));
    },
    snapshot(collectionNames) {
      return clone(Object.fromEntries(collectionNames.map((collectionName) => [
        collectionName,
        this.all(collectionName).sort((left, right) => left._id.localeCompare(right._id))
      ])));
    },
    transactionCount() {
      return transactionCount;
    }
  };
}

function loadMain(db, openid) {
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    database() { return db; },
    getWXContext() { return { OPENID: openid }; },
    DYNAMIC_CURRENT_ENV: 'test-env'
  };
  delete require.cache[mainPath];
  Module._load = function patched(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(mainPath).main;
  } finally {
    Module._load = originalLoad;
  }
}

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 20)}`;
}

function stableRoomId(openid) {
  return stableId('water', openid);
}

function memberDocumentId(roomId, openid) {
  return stableId('wm', `${roomId}\n${openid}`);
}

function enabledFlags() {
  return {
    emergencyReadOnly: false,
    v2Read: true,
    rosterWrite: true,
    ownerWrite: true,
    memberWrite: true,
    correctWrite: true,
    reverseWrite: true,
    createRoundWrite: true,
    canaryRoomIds: [],
    canaryOpenids: [],
    revision: 7
  };
}

function effectForDirect(fromPlayerId, toPlayerId, units) {
  return [
    { participantId: fromPlayerId, wonDelta: 0, treatDelta: units, netDelta: -units },
    { participantId: toPlayerId, wonDelta: units, treatDelta: 0, netDelta: units }
  ];
}

function directEntry({
  id,
  roomId,
  roundId,
  seq,
  fromPlayerId,
  toPlayerId,
  units,
  ownerParticipantId,
  status = 'active',
  eventType = 'transfer_recorded',
  rootEntryId = id,
  targetEntryId = '',
  previousEntryId = '',
  successorEntryId = '',
  ledgerDelta = null
}) {
  const effect = effectForDirect(fromPlayerId, toPlayerId, units);
  return {
    roomId,
    roundId,
    seq,
    eventType,
    category: 'direct',
    status,
    payload: { fromPlayerId, toPlayerId, units },
    effectSnapshot: effect,
    ledgerDelta: ledgerDelta || effect,
    actorParticipantId: ownerParticipantId,
    actorNameSnapshot: '阿杰',
    rootCreatedByParticipantId: ownerParticipantId,
    rootEntryId,
    targetEntryId,
    targetEffectSnapshot: [],
    previousEntryId,
    successorEntryId,
    createdAtMs: 1700000000000 + seq
  };
}

function migratedSeed(options = {}) {
  const ownerOpenid = options.ownerOpenid || 'u_owner';
  const memberOpenid = options.memberOpenid || 'u_member';
  const roomId = options.roomId || stableRoomId(ownerOpenid);
  const roundId = options.roundId || 'round_legacy_1';
  const ownerParticipantId = 'p_owner';
  const memberParticipantId = 'p_member';
  const participants = [
    { id: ownerParticipantId, name: '阿杰', source: 'owner', claimed: true, createdAtMs: 1 },
    { id: memberParticipantId, name: '小林', source: 'manual', claimed: true, createdAtMs: 2 }
  ];
  const entries = options.entries || {};
  const finished = !!options.finished;
  const entryCount = Object.keys(entries).length;
  const recordCount = options.recordCount === undefined ? entryCount : options.recordCount;
  const activeRecordCount = options.activeRecordCount === undefined ? recordCount : options.activeRecordCount;
  const eventCount = options.eventCount === undefined ? entryCount : options.eventCount;
  const ledger = options.ledger || [
    { participantId: ownerParticipantId, won: 0, treat: 0, net: 0 },
    { participantId: memberParticipantId, won: 0, treat: 0, net: 0 }
  ];
  return {
    ids: { roomId, roundId, ownerParticipantId, memberParticipantId },
    seed: {
      water_feature_flags: { collaborative_v2: enabledFlags() },
      waterRooms: {
        [roomId]: {
          schemaVersion: 2,
          ownerParticipantId,
          activeRoundId: finished ? '' : roundId,
          lastRoundId: finished ? roundId : '',
          roundCount: 1,
          participants,
          roomVersion: 7,
          syncVersion: 12,
          migrationStatus: 'active',
          updatedAtMs: 1700000000100
        }
      },
      waterRounds: {
        [roundId]: {
          roomId,
          number: 1,
          title: '旧打水局',
          status: finished ? 'archived' : 'active',
          participantIds: participants.map((participant) => participant.id),
          participantSnapshot: participants.map((participant) => ({
            id: participant.id,
            name: participant.name
          })),
          ledger,
          recordCount,
          activeRecordCount,
          eventCount,
          nextSeq: eventCount + 1,
          revision: 4,
          previousRoundId: '',
          nextRoundId: '',
          createdAtMs: 1700000000000,
          archivedAtMs: finished ? 1700000000200 : 0,
          updatedAtMs: 1700000000200
        }
      },
      waterRoomMembers: {
        [memberDocumentId(roomId, ownerOpenid)]: {
          roomId,
          participantId: ownerParticipantId,
          openid: ownerOpenid,
          role: 'owner',
          status: 'active'
        },
        [memberDocumentId(roomId, memberOpenid)]: {
          roomId,
          participantId: memberParticipantId,
          openid: memberOpenid,
          role: 'member',
          status: 'active'
        }
      },
      waterEntries: entries,
      waterMigrations: {
        [roomId]: {
          runId: 'migration_run_1',
          status: 'active',
          sourceVersion: 9,
          sourceHash: 'source_hash',
          targetHash: 'target_hash',
          participantCount: participants.length,
          entryCount: recordCount,
          legacyRecentRequestIds: options.legacyRecentRequestIds || [],
          checkpoint: { lastLegacyIndex: recordCount - 1, writtenEntries: recordCount }
        }
      },
      client_request_logs: {}
    }
  };
}

function legacySession(roomId) {
  return {
    ownerOpenid: 'u_owner',
    title: '旧打水局',
    status: 'active',
    version: 9,
    participants: [
      { id: 'p_owner', name: '阿杰', openid: 'u_owner', source: 'owner' },
      { id: 'p_open', name: '小林', openid: '', source: 'manual' }
    ],
    entries: [{
      id: 'legacy_entry_1',
      type: 'transfer',
      fromPlayerId: 'p_owner',
      toPlayerId: 'p_open',
      units: 1,
      createdAtMs: 1700000000000
    }],
    recentRequestIds: ['legacy_req_done'],
    _id: roomId
  };
}

function assertNoPrivateIdentity(result, openids) {
  const source = JSON.stringify(result);
  openids.forEach((openid) => assert.equal(source.includes(openid), false));
  assert.equal(/ownerOpenid|operatorOpenId|"openid"/.test(source), false);
}

function assertV1Session(result) {
  assert.equal(result.ok, true);
  assert.ok(result.session);
  assert.ok(result.data && result.data.session);
  assert.deepEqual(result.session, result.data.session);
  return result.session;
}

const MUTABLE_COLLECTIONS = [
  'waterRooms',
  'waterRounds',
  'waterEntries',
  'waterMigrations',
  'client_request_logs',
  'waterSessions'
];

test('unmigrated legacy V2 get is sanitized and V2 mutations fail with migration conflict', async () => {
  const roomId = stableRoomId('u_owner');
  const state = makeDb({
    water_feature_flags: { collaborative_v2: enabledFlags() },
    waterSessions: { [roomId]: legacySession(roomId) }
  });
  const owner = loadMain(state.db, 'u_owner');
  const visitor = loadMain(state.db, 'u_visitor');

  const loaded = await owner({ apiVersion: 2, action: 'get', roomId });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.code, 'WATER_ROOM_LEGACY_READY');
  assert.equal(loaded.state, 'loaded');
  assert.equal(loaded.data.migrationRequired, true);
  assert.equal(loaded.data.fallbackMode, 'legacy');
  assert.equal(loaded.data.capabilities.legacyRead, true);
  assert.equal(loaded.data.capabilities.legacyOwnerWrite, true);
  [
    'v2Read',
    'canManageRoster',
    'canOwnerWrite',
    'canMemberWrite',
    'canCorrect',
    'canReverse',
    'canCreateRound'
  ].forEach((key) => assert.equal(loaded.data.capabilities[key], false, `${key} must fail closed`));
  assertNoPrivateIdentity(loaded, ['u_owner']);

  const visitorLoaded = await visitor({ apiVersion: 2, action: 'get', roomId });
  assert.equal(visitorLoaded.data.capabilities.legacyRead, true);
  assert.equal(visitorLoaded.data.capabilities.legacyOwnerWrite, false);
  assertNoPrivateIdentity(visitorLoaded, ['u_owner', 'u_visitor']);

  const before = state.snapshot(MUTABLE_COLLECTIONS);
  const blocked = await owner({
    apiVersion: 2,
    action: 'recordDirect',
    roomId,
    roundId: 'legacy_round',
    fromPlayerId: 'p_owner',
    toPlayerId: 'p_open',
    units: 1,
    clientRequestId: 'req_v2_before_migration'
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'WATER_ROOM_MIGRATION_REQUIRED');
  assert.equal(blocked.state, 'conflict');
  assert.deepEqual(state.snapshot(MUTABLE_COLLECTIONS), before);
});

test('migrated V1 get returns one leak-free root/data session projected from V2', async () => {
  const fixture = migratedSeed();
  const state = makeDb(fixture.seed);
  const owner = loadMain(state.db, 'u_owner');
  const before = state.snapshot(MUTABLE_COLLECTIONS);

  const loaded = await owner({ action: 'get', sessionId: fixture.ids.roomId });
  assert.equal(loaded.code, 'WATER_SESSION_LOADED');
  assert.equal(loaded.state, 'loaded');
  const session = assertV1Session(loaded);
  assert.equal(session.id, fixture.ids.roomId);
  assert.equal(session.version, 12);
  assert.equal(session.status, 'active');
  assert.equal(session.isOwner, true);
  assert.equal(session.viewerParticipantId, fixture.ids.ownerParticipantId);
  assertNoPrivateIdentity(loaded, ['u_owner', 'u_member']);
  assert.deepEqual(state.snapshot(MUTABLE_COLLECTIONS), before, 'V1 get must be projection-only');
});

test('migrated V1 mutation rejects a stale expectedVersion without writing', async () => {
  const fixture = migratedSeed();
  const state = makeDb(fixture.seed);
  const owner = loadMain(state.db, 'u_owner');
  const before = state.snapshot(MUTABLE_COLLECTIONS);

  const stale = await owner({
    action: 'recordDirect',
    sessionId: fixture.ids.roomId,
    expectedVersion: 11,
    playerId: fixture.ids.memberParticipantId,
    counterpartyId: fixture.ids.ownerParticipantId,
    direction: 'plus',
    units: 2,
    clientRequestId: 'req_v1_stale'
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'VERSION_CONFLICT');
  assert.equal(stale.state, 'conflict');
  assert.deepEqual(state.snapshot(MUTABLE_COLLECTIONS), before);
});

test('migrated V1 keeps record writes owner-only and adapts owner success to one V2 entry', async () => {
  const fixture = migratedSeed();
  const state = makeDb(fixture.seed);
  const owner = loadMain(state.db, 'u_owner');
  const member = loadMain(state.db, 'u_member');
  const beforeDenied = state.snapshot(MUTABLE_COLLECTIONS);
  const event = {
    action: 'recordDirect',
    sessionId: fixture.ids.roomId,
    expectedVersion: 12,
    playerId: fixture.ids.memberParticipantId,
    counterpartyId: fixture.ids.ownerParticipantId,
    direction: 'plus',
    units: 2,
    clientRequestId: 'req_v1_owner_adapter'
  };

  const denied = await member({ ...event, clientRequestId: 'req_v1_member_denied' });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'WATER_SESSION_FORBIDDEN');
  assert.equal(denied.state, 'forbidden');
  assert.deepEqual(state.snapshot(MUTABLE_COLLECTIONS), beforeDenied);

  const recorded = await owner(event);
  assert.equal(recorded.code, 'WATER_SESSION_UPDATED');
  assert.equal(recorded.state, 'updated');
  const session = assertV1Session(recorded);
  assert.equal(session.version, 13);
  assert.equal(session.entries.length, 1);
  assert.deepEqual({
    type: session.entries[0].type,
    fromPlayerId: session.entries[0].fromPlayerId,
    toPlayerId: session.entries[0].toPlayerId,
    units: session.entries[0].units
  }, {
    type: 'transfer',
    fromPlayerId: fixture.ids.ownerParticipantId,
    toPlayerId: fixture.ids.memberParticipantId,
    units: 2
  });
  assert.equal(state.read('waterRooms', fixture.ids.roomId).syncVersion, 13);
  assert.equal(state.all('waterEntries').length, 1);
  assert.equal(state.all('waterSessions').length, 0, 'adapter must not create a legacy shadow document');
  assertNoPrivateIdentity(recorded, ['u_owner', 'u_member']);
});

test('migrated V1 projection keeps latest correction and omits reversed roots and audit events', async () => {
  const roomId = stableRoomId('u_owner');
  const roundId = 'round_legacy_1';
  const base = { roomId, roundId, ownerParticipantId: 'p_owner' };
  const entries = {
    direct_root: directEntry({
      ...base,
      id: 'direct_root',
      seq: 1,
      fromPlayerId: 'p_owner',
      toPlayerId: 'p_member',
      units: 1,
      status: 'corrected',
      successorEntryId: 'direct_correction'
    }),
    direct_correction: directEntry({
      ...base,
      id: 'direct_correction',
      seq: 2,
      fromPlayerId: 'p_owner',
      toPlayerId: 'p_member',
      units: 3,
      eventType: 'entry_corrected',
      rootEntryId: 'direct_root',
      targetEntryId: 'direct_root',
      previousEntryId: 'direct_root'
    }),
    reversed_root: directEntry({
      ...base,
      id: 'reversed_root',
      seq: 3,
      fromPlayerId: 'p_member',
      toPlayerId: 'p_owner',
      units: 2,
      status: 'reversed',
      successorEntryId: 'reversal_event'
    }),
    reversal_event: {
      ...directEntry({
        ...base,
        id: 'reversal_event',
        seq: 4,
        fromPlayerId: 'p_member',
        toPlayerId: 'p_owner',
        units: 2,
        status: 'applied',
        eventType: 'entry_reversed',
        rootEntryId: 'reversed_root',
        targetEntryId: 'reversed_root',
        previousEntryId: 'reversed_root',
        ledgerDelta: effectForDirect('p_owner', 'p_member', 2)
      }),
      payload: null,
      effectSnapshot: [],
      targetEffectSnapshot: effectForDirect('p_member', 'p_owner', 2)
    }
  };
  const fixture = migratedSeed({
    roomId,
    roundId,
    entries,
    recordCount: 2,
    activeRecordCount: 1,
    eventCount: 4,
    ledger: [
      { participantId: 'p_owner', won: 0, treat: 3, net: -3 },
      { participantId: 'p_member', won: 3, treat: 0, net: 3 }
    ]
  });
  const state = makeDb(fixture.seed);
  const owner = loadMain(state.db, 'u_owner');

  const loaded = await owner({ action: 'get', sessionId: roomId });
  const session = assertV1Session(loaded);
  assert.equal(session.entries.length, 1);
  assert.deepEqual({
    type: session.entries[0].type,
    fromPlayerId: session.entries[0].fromPlayerId,
    toPlayerId: session.entries[0].toPlayerId,
    units: session.entries[0].units
  }, {
    type: 'transfer',
    fromPlayerId: 'p_owner',
    toPlayerId: 'p_member',
    units: 3
  });
  assert.equal(JSON.stringify(session.entries).includes('entry_corrected'), false);
  assert.equal(JSON.stringify(session.entries).includes('entry_reversed'), false);
  assert.equal(JSON.stringify(session.entries).includes('reversed_root'), false);
});

test('migrated V1 blocks get and mutations above 200 active records without any write', async () => {
  const roomId = stableRoomId('u_owner');
  const roundId = 'round_legacy_1';
  const entries = Object.fromEntries(Array.from({ length: 201 }, (_, index) => {
    const id = `entry_${String(index + 1).padStart(3, '0')}`;
    return [id, directEntry({
      id,
      roomId,
      roundId,
      seq: index + 1,
      fromPlayerId: 'p_owner',
      toPlayerId: 'p_member',
      units: 1,
      ownerParticipantId: 'p_owner'
    })];
  }));
  const fixture = migratedSeed({
    roomId,
    roundId,
    entries,
    recordCount: 201,
    activeRecordCount: 201,
    eventCount: 201,
    ledger: [
      { participantId: 'p_owner', won: 0, treat: 201, net: -201 },
      { participantId: 'p_member', won: 201, treat: 0, net: 201 }
    ]
  });
  const state = makeDb(fixture.seed);
  const owner = loadMain(state.db, 'u_owner');
  const before = state.snapshot(MUTABLE_COLLECTIONS);

  const loaded = await owner({ action: 'get', sessionId: roomId });
  assert.equal(loaded.ok, false);
  assert.equal(loaded.code, 'WATER_CLIENT_UPGRADE_REQUIRED');

  const recordBlocked = await owner({
    action: 'recordGame',
    sessionId: roomId,
    expectedVersion: 12,
    winnerIds: ['p_member'],
    loserIds: ['p_owner'],
    unitsPerPlayer: 1,
    clientRequestId: 'req_v1_over_200_record'
  });
  assert.equal(recordBlocked.ok, false);
  assert.equal(recordBlocked.code, 'WATER_CLIENT_UPGRADE_REQUIRED');

  const undoBlocked = await owner({
    action: 'undoLast',
    sessionId: roomId,
    expectedVersion: 12,
    clientRequestId: 'req_v1_over_200_undo'
  });
  assert.equal(undoBlocked.ok, false);
  assert.equal(undoBlocked.code, 'WATER_CLIENT_UPGRADE_REQUIRED');
  assert.deepEqual(state.snapshot(MUTABLE_COLLECTIONS), before);
});

test('migrated legacy recentRequestIds replay dedupes without creating entry or V2 request log', async () => {
  const tombstoneRequestId = 'legacy_req_already_applied';
  const fixture = migratedSeed({ legacyRecentRequestIds: [tombstoneRequestId] });
  fixture.seed.water_feature_flags.collaborative_v2.emergencyReadOnly = true;
  const state = makeDb(fixture.seed);
  const owner = loadMain(state.db, 'u_owner');
  const before = state.snapshot(MUTABLE_COLLECTIONS);

  const replay = await owner({
    action: 'recordDirect',
    sessionId: fixture.ids.roomId,
    expectedVersion: 12,
    playerId: fixture.ids.memberParticipantId,
    counterpartyId: fixture.ids.ownerParticipantId,
    direction: 'plus',
    units: 99,
    clientRequestId: tombstoneRequestId
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.code, 'WATER_WRITE_DEDUPED');
  assert.equal(replay.state, 'deduped');
  assert.equal(replay.deduped, true);
  assertV1Session(replay);
  assert.equal(state.all('waterEntries').length, 0);
  assert.equal(state.all('client_request_logs').length, 0);
  assert.deepEqual(state.snapshot(MUTABLE_COLLECTIONS), before);
});

test('migrated finished room remains discoverable through V1 getMineActive as finished projection', async () => {
  const roomId = stableRoomId('u_owner');
  const roundId = 'round_archived_1';
  const entries = {
    finished_entry: directEntry({
      id: 'finished_entry',
      roomId,
      roundId,
      seq: 1,
      fromPlayerId: 'p_owner',
      toPlayerId: 'p_member',
      units: 2,
      ownerParticipantId: 'p_owner'
    })
  };
  const fixture = migratedSeed({
    roomId,
    roundId,
    entries,
    finished: true,
    recordCount: 1,
    activeRecordCount: 1,
    eventCount: 1,
    ledger: [
      { participantId: 'p_owner', won: 0, treat: 2, net: -2 },
      { participantId: 'p_member', won: 2, treat: 0, net: 2 }
    ]
  });
  const state = makeDb(fixture.seed);
  const owner = loadMain(state.db, 'u_owner');
  const before = state.snapshot(MUTABLE_COLLECTIONS);

  const loaded = await owner({ action: 'getMineActive' });
  assert.equal(loaded.code, 'WATER_SESSION_LOADED');
  const session = assertV1Session(loaded);
  assert.equal(session.id, roomId);
  assert.equal(session.status, 'finished');
  assert.equal(session.version, 12);
  assert.equal(session.entries.length, 1);
  assertNoPrivateIdentity(loaded, ['u_owner', 'u_member']);
  assert.deepEqual(state.snapshot(MUTABLE_COLLECTIONS), before);
});

test('migrated V1 action matrix preserves invite join while owner writes stay owner-only', async () => {
  const fixture = migratedSeed();
  const state = makeDb(fixture.seed);
  const owner = loadMain(state.db, 'u_owner');

  const visitor = loadMain(state.db, 'u_invited');
  const joined = await visitor({
    action: 'join',
    sessionId: fixture.ids.roomId,
    expectedVersion: 12,
    nickname: '王姐',
    clientRequestId: 'req_v1_join_member'
  });
  assert.equal(joined.code, 'WATER_SESSION_UPDATED');
  assert.equal(assertV1Session(joined).version, 13);
  assert.equal(assertV1Session(joined).viewerParticipantId !== '', true);

  const roster = await owner({
    action: 'addParticipants',
    sessionId: fixture.ids.roomId,
    expectedVersion: 13,
    names: '王姐\n老陈',
    clientRequestId: 'req_v1_roster'
  });
  assert.equal(roster.code, 'WATER_SESSION_UPDATED');
  assert.equal(assertV1Session(roster).participants.length, 4);

  const game = await owner({
    action: 'recordGame',
    sessionId: fixture.ids.roomId,
    expectedVersion: 14,
    winnerIds: [fixture.ids.memberParticipantId],
    loserIds: [fixture.ids.ownerParticipantId],
    unitsPerPlayer: 2,
    clientRequestId: 'req_v1_game'
  });
  assert.equal(game.code, 'WATER_SESSION_UPDATED');
  assert.equal(assertV1Session(game).entries[0].type, 'game');

  const undone = await owner({
    action: 'undoLast',
    sessionId: fixture.ids.roomId,
    expectedVersion: 15,
    clientRequestId: 'req_v1_undo'
  });
  assert.equal(undone.code, 'WATER_SESSION_UPDATED');
  assert.equal(assertV1Session(undone).entries.length, 0);

  const finished = await owner({
    action: 'finish',
    sessionId: fixture.ids.roomId,
    expectedVersion: 16,
    clientRequestId: 'req_v1_finish'
  });
  assert.equal(finished.code, 'WATER_SESSION_UPDATED');
  assert.equal(assertV1Session(finished).status, 'finished');
  assert.equal(state.read('waterRooms', fixture.ids.roomId).activeRoundId, '');
  assert.equal(state.read('waterRooms', fixture.ids.roomId).syncVersion, 17);
  assert.equal(state.all('waterEntries').length, 2, 'record + reversal audit must remain in V2');
  assert.equal(state.all('client_request_logs').length, 5);
  assert.equal(state.transactionCount(), 5, 'successful migrated mutations must use db.runTransaction');
  assert.equal(state.all('waterSessions').length, 0);
});

test('migrated V1 join can claim an unbound participant without consuming a roster slot', async () => {
  const fixture = migratedSeed();
  fixture.seed.waterRooms[fixture.ids.roomId].participants[1].claimed = false;
  delete fixture.seed.waterRoomMembers[memberDocumentId(fixture.ids.roomId, 'u_member')];
  const state = makeDb(fixture.seed);
  const visitor = loadMain(state.db, 'u_claiming_visitor');

  const joined = await visitor({
    action: 'join',
    sessionId: fixture.ids.roomId,
    expectedVersion: 12,
    nickname: '小林',
    claimParticipantId: fixture.ids.memberParticipantId,
    clientRequestId: 'req_v1_claim_existing'
  });
  const session = assertV1Session(joined);
  assert.equal(session.participants.length, 2);
  assert.equal(session.viewerParticipantId, fixture.ids.memberParticipantId);
  assert.equal(state.read('waterRooms', fixture.ids.roomId).participants[1].claimed, true);
  assert.ok(state.read('waterRoomMembers', memberDocumentId(fixture.ids.roomId, 'u_claiming_visitor')));
});

test('migrated V1 join keeps nickname participantId and OpenID unique with zero-write conflicts', async () => {
  const fixture = migratedSeed();
  const state = makeDb(fixture.seed);
  const firstOpenid = 'u_same_name_first';
  const secondOpenid = 'u_same_name_second';
  const first = loadMain(state.db, firstOpenid);
  const second = loadMain(state.db, secondOpenid);

  const joined = await first({
    action: 'join',
    sessionId: fixture.ids.roomId,
    expectedVersion: 12,
    nickname: 'Chris',
    clientRequestId: 'req_v1_shared_join'
  });
  assert.equal(joined.code, 'WATER_SESSION_UPDATED');
  const firstParticipantId = assertV1Session(joined).viewerParticipantId;
  assert.notEqual(firstParticipantId, '');
  const afterFirst = state.snapshot(MUTABLE_COLLECTIONS);

  for (const [requestId, nickname] of [
    ['req_v1_shared_join', 'Chris'],
    ['req_v1_case_variant', 'cHrIs']
  ]) {
    const conflict = await second({
      action: 'join',
      sessionId: fixture.ids.roomId,
      expectedVersion: 13,
      nickname,
      clientRequestId: requestId
    });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, 'WATER_PARTICIPANT_INVALID');
    assert.equal(conflict.state, 'invalid');
    assert.deepEqual(state.snapshot(MUTABLE_COLLECTIONS), afterFirst, 'conflict must be zero-write');
  }

  const room = state.read('waterRooms', fixture.ids.roomId);
  const participantIds = room.participants.map((participant) => participant.id);
  const nicknameKeys = room.participants.map((participant) => participant.name.trim().toLocaleLowerCase());
  assert.equal(new Set(participantIds).size, participantIds.length);
  assert.equal(new Set(nicknameKeys).size, nicknameKeys.length);
  const firstMember = state.read('waterRoomMembers', memberDocumentId(fixture.ids.roomId, firstOpenid));
  const secondMember = state.read('waterRoomMembers', memberDocumentId(fixture.ids.roomId, secondOpenid));
  assert.equal(firstMember.participantId, firstParticipantId);
  assert.equal(secondMember, null);
});

test('migrated V1 create is zero-write READY for an active round even when writes are stopped', async () => {
  const fixture = migratedSeed();
  fixture.seed.water_feature_flags.collaborative_v2.emergencyReadOnly = true;
  const state = makeDb(fixture.seed);
  const owner = loadMain(state.db, 'u_owner');
  const before = state.snapshot(MUTABLE_COLLECTIONS);

  const ready = await owner({
    action: 'create',
    ownerName: '不应覆盖',
    clientRequestId: 'req_v1_create_ready'
  });
  assert.equal(ready.code, 'WATER_SESSION_READY');
  assert.equal(ready.state, 'existing');
  assert.equal(assertV1Session(ready).version, 12);
  assert.equal(state.transactionCount(), 0);
  assert.deepEqual(state.snapshot(MUTABLE_COLLECTIONS), before);
});

test('migrated V1 create can start the next round without the V2 createRound flag', async () => {
  const fixture = migratedSeed({ finished: true });
  fixture.seed.water_feature_flags.collaborative_v2.createRoundWrite = false;
  const state = makeDb(fixture.seed);
  const owner = loadMain(state.db, 'u_owner');

  const created = await owner({
    action: 'create',
    ownerName: '阿杰',
    clientRequestId: 'req_v1_create_next'
  });
  assert.equal(created.code, 'WATER_SESSION_CREATED');
  assert.equal(created.state, 'created');
  const session = assertV1Session(created);
  assert.equal(session.status, 'active');
  assert.equal(session.version, 13);
  assert.equal(session.entries.length, 0);
  const room = state.read('waterRooms', fixture.ids.roomId);
  assert.notEqual(room.activeRoundId, '');
  assert.equal(room.roundCount, 2);
  assert.equal(state.transactionCount(), 1);
});

test('migrated finished V1 create remains compatible without clientRequestId', async () => {
  const fixture = migratedSeed({ finished: true });
  const state = makeDb(fixture.seed);
  const owner = loadMain(state.db, 'u_owner');

  const created = await owner({ action: 'create', ownerName: '阿杰' });
  assert.equal(created.ok, true);
  assert.equal(created.code, 'WATER_SESSION_CREATED');
  assert.equal(assertV1Session(created).status, 'active');
  assert.equal(state.read('waterRooms', fixture.ids.roomId).roundCount, 2);
  assert.equal(state.all('client_request_logs').length, 0);
});

test('migrated V1 mutations fail closed for missing or emergency configuration', async () => {
  for (const mode of ['missing', 'emergency']) {
    const fixture = migratedSeed();
    if (mode === 'missing') delete fixture.seed.water_feature_flags;
    else fixture.seed.water_feature_flags.collaborative_v2.emergencyReadOnly = true;
    const state = makeDb(fixture.seed);
    const owner = loadMain(state.db, 'u_owner');
    const before = state.snapshot(MUTABLE_COLLECTIONS);

    const blocked = await owner({
      action: 'recordDirect',
      sessionId: fixture.ids.roomId,
      expectedVersion: 12,
      playerId: fixture.ids.memberParticipantId,
      counterpartyId: fixture.ids.ownerParticipantId,
      direction: 'plus',
      units: 1,
      clientRequestId: `req_v1_${mode}`
    });
    assert.equal(blocked.code, 'WATER_WRITES_DISABLED');
    assert.equal(blocked.state, 'forbidden');
    assert.equal(state.transactionCount(), 1);
    assert.deepEqual(state.snapshot(MUTABLE_COLLECTIONS), before);
  }
});

test('unmigrated V1 mutation matrix fails closed for missing malformed and emergency config', async () => {
  const modes = {
    missing: null,
    malformed: { ...enabledFlags(), canaryRoomIds: [123] },
    emergency: { ...enabledFlags(), emergencyReadOnly: true }
  };
  const mutationEvents = [
    { action: 'join', nickname: '王姐', clientRequestId: 'req_join' },
    { action: 'addParticipants', names: '老陈', clientRequestId: 'req_add' },
    { action: 'recordGame', winnerIds: ['p_owner'], loserIds: ['p_open'], unitsPerPlayer: 1, clientRequestId: 'req_game' },
    { action: 'recordDirect', playerId: 'p_owner', counterpartyId: 'p_open', direction: 'plus', units: 1, clientRequestId: 'req_direct' },
    { action: 'undoLast', clientRequestId: 'req_undo' },
    { action: 'finish', clientRequestId: 'req_finish' }
  ];
  for (const [mode, config] of Object.entries(modes)) {
    for (const baseEvent of mutationEvents) {
      const roomId = stableRoomId('u_owner');
      const session = legacySession(roomId);
      const seed = { waterSessions: { [roomId]: session } };
      if (config) seed.water_feature_flags = { collaborative_v2: config };
      const state = makeDb(seed);
      const callerOpenid = baseEvent.action === 'join' ? 'u_visitor' : 'u_owner';
      const main = loadMain(state.db, callerOpenid);
      const before = state.snapshot(MUTABLE_COLLECTIONS);
      const blocked = await main({
        ...baseEvent,
        sessionId: roomId,
        expectedVersion: session.version
      });
      assert.equal(blocked.code, 'WATER_WRITES_DISABLED', `${mode}/${baseEvent.action}`);
      assert.equal(blocked.state, 'forbidden', `${mode}/${baseEvent.action}`);
      assert.deepEqual(state.snapshot(MUTABLE_COLLECTIONS), before, `${mode}/${baseEvent.action}`);
    }

    const createSeed = config ? { water_feature_flags: { collaborative_v2: config } } : {};
    const createState = makeDb(createSeed);
    const create = loadMain(createState.db, `u_create_${mode}`);
    const beforeCreate = createState.snapshot(MUTABLE_COLLECTIONS);
    const blockedCreate = await create({ action: 'create', ownerName: '阿杰' });
    assert.equal(blockedCreate.code, 'WATER_WRITES_DISABLED', `${mode}/create`);
    assert.deepEqual(createState.snapshot(MUTABLE_COLLECTIONS), beforeCreate, `${mode}/create`);
  }
});

test('unmigrated V1 reads, active create READY, and successful dedupe stay zero-write under invalid config', async () => {
  const roomId = stableRoomId('u_owner');
  const session = legacySession(roomId);
  session.recentRequestIds.push('req_already_done');
  const state = makeDb({ waterSessions: { [roomId]: session } });
  const owner = loadMain(state.db, 'u_owner');
  const before = state.snapshot(MUTABLE_COLLECTIONS);

  const loaded = await owner({ action: 'get', sessionId: roomId });
  assert.equal(loaded.code, 'WATER_SESSION_LOADED');
  const ready = await owner({ action: 'create', ownerName: '不覆盖' });
  assert.equal(ready.code, 'WATER_SESSION_READY');
  const deduped = await owner({
    action: 'recordDirect', sessionId: roomId, expectedVersion: 0,
    playerId: 'p_owner', counterpartyId: 'p_open', direction: 'plus', units: 99,
    clientRequestId: 'req_already_done'
  });
  assert.equal(deduped.code, 'WATER_WRITE_DEDUPED');
  assert.deepEqual(state.snapshot(MUTABLE_COLLECTIONS), before);

  const v2Legacy = await owner({ apiVersion: 2, action: 'get', roomId });
  assert.equal(v2Legacy.data.capabilities.legacyRead, true);
  assert.equal(v2Legacy.data.capabilities.legacyOwnerWrite, false);
  assert.equal(v2Legacy.data.capabilities.emergencyReadOnly, true);

  const finishedRoomId = stableRoomId('u_finished_owner');
  const finishedSession = legacySession(finishedRoomId);
  finishedSession.ownerOpenid = 'u_finished_owner';
  finishedSession.status = 'finished';
  finishedSession.recentRequestIds = ['req_finished_dedupe'];
  const finishedState = makeDb({ waterSessions: { [finishedRoomId]: finishedSession } });
  const finishedOwner = loadMain(finishedState.db, 'u_finished_owner');
  const beforeFinished = finishedState.snapshot(MUTABLE_COLLECTIONS);
  const finishedDedupe = await finishedOwner({
    action: 'finish', sessionId: finishedRoomId, expectedVersion: 0,
    clientRequestId: 'req_finished_dedupe'
  });
  assert.equal(finishedDedupe.code, 'WATER_WRITE_DEDUPED');
  assert.deepEqual(finishedState.snapshot(MUTABLE_COLLECTIONS), beforeFinished);
});
