const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');

const logic = require('../cloudfunctions/waterSession/waterLogic');
const mainPath = require.resolve('../cloudfunctions/waterSession/index.js');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function makeDb(seed = {}) {
  let state = new Map();
  let transactionTail = Promise.resolve();
  const queryLog = [];

  Object.entries(seed).forEach(([collectionName, documents]) => {
    state.set(collectionName, new Map(Object.entries(documents).map(([id, data]) => [id, clone(data)])));
  });

  function cloneState(source) {
    const output = new Map();
    source.forEach((documents, collectionName) => {
      output.set(collectionName, new Map(Array.from(documents, ([id, data]) => [id, clone(data)])));
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
          }
        };
      },
      where(filter) {
        let order = null;
        let maximum = Infinity;
        const query = {
          orderBy(field, direction) {
            order = { field, direction };
            return query;
          },
          limit(value) {
            maximum = Number(value);
            return query;
          },
          async get() {
            queryLog.push({
              collectionName,
              filter: clone(filter),
              order: clone(order),
              limit: maximum
            });
            let rows = Array.from(documents, ([id, data]) => ({ _id: id, ...clone(data) }))
              .filter((item) => matches(item, filter));
            if (order) {
              const direction = order.direction === 'asc' ? 1 : -1;
              rows.sort((a, b) => (Number(a[order.field]) - Number(b[order.field])) * direction);
            }
            return { data: rows.slice(0, maximum) };
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
    queries(collectionName = '') {
      return clone(queryLog.filter((item) => !collectionName || item.collectionName === collectionName));
    },
    clearQueries() {
      queryLog.length = 0;
    }
  };
}

function enabledSeed(extra = {}) {
  return {
    water_feature_flags: {
      collaborative_v2: {
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
        revision: 7,
        ...extra
      }
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

function request(action, clientRequestId, extra = {}) {
  return { apiVersion: 2, action, clientRequestId, ...extra };
}

function assertStandard(result) {
  ['ok', 'code', 'message', 'state', 'traceId', 'data'].forEach((key) => {
    assert.equal(Object.prototype.hasOwnProperty.call(result, key), true, `missing result.${key}`);
  });
}

function assertNoPrivateIdentity(result, openids) {
  const source = JSON.stringify(result);
  openids.forEach((openid) => assert.equal(source.includes(openid), false));
  assert.equal(/clientRequestId|memberId|operatorOpenId|openid/.test(source), false);
}

function stableRoomId(openid) {
  return `water_${crypto.createHash('sha1').update(openid).digest('hex').slice(0, 20)}`;
}

async function createRoom(state, ownerMain, suffix = 'base') {
  const result = await ownerMain(request('create', `req_create_${suffix}`, { ownerName: '阿杰' }));
  assert.equal(result.ok, true);
  return result;
}

function memberId(roomId, openid) {
  return `wm_${crypto.createHash('sha1').update(`${roomId}\n${openid}`).digest('hex').slice(0, 20)}`;
}

function mutableSnapshot(state) {
  return clone(['waterRooms', 'waterRounds', 'waterEntries', 'waterRoomMembers', 'client_request_logs']
    .map((name) => [name, state.all(name)]));
}

test('V2 logic calculates conserved immutable effects for game, direct, correction and reversal', () => {
  const participants = [
    { id: 'a', name: '阿杰' },
    { id: 'b', name: '小林' },
    { id: 'c', name: 'Chris' },
    { id: 'd', name: '王姐' }
  ];
  const game = logic.normalizeGameEntry({
    winnerIds: ['a', 'b'],
    loserIds: ['c', 'd'],
    unitsPerPlayer: 2
  }, participants);
  const direct = logic.normalizeV2DirectEntry({
    fromPlayerId: 'a',
    toPlayerId: 'c',
    units: 3
  }, participants);
  const oldEffect = logic.effectForEntry(game);
  const newEffect = logic.effectForEntry({ ...game, unitsPerPlayer: 4 });
  const correction = logic.diffEffects(newEffect, oldEffect);
  const reversal = logic.negateEffect(newEffect);

  assert.equal(oldEffect.reduce((sum, item) => sum + item.netDelta, 0), 0);
  assert.equal(logic.effectForEntry(direct).reduce((sum, item) => sum + item.netDelta, 0), 0);
  assert.equal(correction.reduce((sum, item) => sum + item.netDelta, 0), 0);
  assert.equal(reversal.reduce((sum, item) => sum + item.netDelta, 0), 0);
});

test('V2 create/get use stable room and round documents with standard leak-free shapes', async () => {
  const state = makeDb(enabledSeed());
  const main = loadMain(state.db, 'u_owner');
  const created = await createRoom(state, main, 'shape');

  assertStandard(created);
  assert.equal(created.code, 'WATER_ROOM_CREATED');
  assert.equal(created.state, 'created');
  assert.equal(created.data.room.id, stableRoomId('u_owner'));
  assert.equal(created.data.round.status, 'active');
  assert.equal(created.data.round.recordCount, 0);
  assert.equal(created.data.viewer.role, 'owner');
  assert.equal(created.data.capabilities.canOwnerWrite, true);
  assert.deepEqual(created.data.entries, []);
  assertNoPrivateIdentity(created, ['u_owner']);

  assert.equal(state.all('waterRooms').length, 1);
  assert.equal(state.all('waterRounds').length, 1);
  assert.equal(state.all('waterRoomMembers').length, 1);
  assert.equal(state.all('waterEntries').length, 0);

  const loaded = await main({ apiVersion: 2, action: 'get', roomId: created.data.room.id });
  assertStandard(loaded);
  assert.equal(loaded.code, 'WATER_ROOM_LOADED');
  assert.equal(loaded.data.room.id, created.data.room.id);
  assertNoPrivateIdentity(loaded, ['u_owner']);

  const continued = await main(request('create', 'unused_on_ready', { ownerName: '阿杰' }));
  assert.equal(continued.code, 'WATER_ROOM_READY');
  assert.equal(state.all('client_request_logs').length, 1);

  const missingRequestId = await main({ apiVersion: 2, action: 'create', ownerName: '阿杰' });
  assert.equal(missingRequestId.code, 'CLIENT_REQUEST_ID_REQUIRED');
  assert.equal(state.all('client_request_logs').length, 1);
});

test('V2 member writes are append-only, permissioned, conserved and idempotent', async () => {
  const state = makeDb(enabledSeed());
  const owner = loadMain(state.db, 'u_owner');
  const member = loadMain(state.db, 'u_member');
  const memberTwo = loadMain(state.db, 'u_member_two');
  const visitor = loadMain(state.db, 'u_visitor');
  const created = await createRoom(state, owner, 'ledger');
  const roomId = created.data.room.id;
  const roundId = created.data.round.id;
  const ownerId = created.data.viewer.participantId;

  const roster = await owner(request('addParticipants', 'req_add_roster', {
    roomId,
    expectedRoomVersion: created.data.room.roomVersion,
    names: ['小林', 'Chris']
  }));
  assert.equal(roster.code, 'WATER_PARTICIPANTS_ADDED');
  const lin = roster.data.room.participants.find((item) => item.name === '小林');
  const chris = roster.data.room.participants.find((item) => item.name === 'Chris');

  const joined = await member(request('join', 'req_join_member', {
    roomId,
    nickname: '小林',
    claimParticipantId: lin.id,
    expectedRoomVersion: roster.data.room.roomVersion
  }));
  assert.equal(joined.code, 'WATER_MEMBER_JOINED');
  assert.equal(joined.data.viewer.role, 'member');

  const joinedTwo = await memberTwo(request('join', 'req_join_member_two', {
    roomId,
    nickname: 'Chris',
    claimParticipantId: chris.id,
    expectedRoomVersion: joined.data.room.roomVersion
  }));
  assert.equal(joinedTwo.code, 'WATER_MEMBER_JOINED');

  const visitorDenied = await visitor(request('recordDirect', 'req_visitor_direct', {
    roomId,
    roundId,
    fromPlayerId: ownerId,
    toPlayerId: lin.id,
    units: 1
  }));
  assertStandard(visitorDenied);
  assert.equal(visitorDenied.code, 'WATER_JOIN_REQUIRED');
  assert.equal(visitorDenied.state, 'forbidden');

  const gameEvent = request('recordGame', 'req_member_game', {
    roomId,
    roundId,
    winnerIds: [lin.id],
    loserIds: [ownerId],
    unitsPerPlayer: 1
  });
  const game = await member(gameEvent);
  const replay = await member(gameEvent);
  assert.equal(game.code, 'WATER_ENTRY_CREATED');
  assert.equal(game.data.round.recordCount, 1);
  assert.equal(game.data.round.activeRecordCount, 1);
  assert.equal(game.data.round.eventCount, 1);
  assert.equal(replay.code, 'WATER_WRITE_DEDUPED');
  assert.equal(replay.state, 'deduped');
  assert.equal(replay.data.entry.id, game.data.entry.id);
  assert.equal(state.all('waterEntries').length, 1);

  const reused = await member({ ...gameEvent, unitsPerPlayer: 2 });
  assert.equal(reused.code, 'CLIENT_REQUEST_ID_REUSED');
  assert.equal(reused.state, 'invalid');
  assert.equal(state.all('waterEntries').length, 1);

  const forbiddenCorrection = await memberTwo(request('correctEntry', 'req_other_correct', {
    roomId,
    roundId,
    rootEntryId: game.data.entry.rootEntryId,
    expectedEntryId: game.data.entry.id,
    replacement: { winnerIds: [chris.id], loserIds: [ownerId], unitsPerPlayer: 2 }
  }));
  assert.equal(forbiddenCorrection.code, 'WATER_ENTRY_FORBIDDEN');

  const corrected = await member(request('correctEntry', 'req_member_correct', {
    roomId,
    roundId,
    rootEntryId: game.data.entry.rootEntryId,
    expectedEntryId: game.data.entry.id,
    replacement: { winnerIds: [lin.id], loserIds: [ownerId], unitsPerPlayer: 2 }
  }));
  assert.equal(corrected.code, 'WATER_ENTRY_CORRECTED');
  assert.equal(corrected.data.round.recordCount, 1);
  assert.equal(corrected.data.round.activeRecordCount, 1);
  assert.equal(corrected.data.round.eventCount, 2);
  assert.equal(corrected.data.targetEntry.status, 'corrected');

  const reversed = await owner(request('reverseEntry', 'req_owner_reverse', {
    roomId,
    roundId,
    rootEntryId: game.data.entry.rootEntryId,
    expectedEntryId: corrected.data.entry.id
  }));
  assert.equal(reversed.code, 'WATER_ENTRY_REVERSED');
  assert.equal(reversed.data.round.recordCount, 1);
  assert.equal(reversed.data.round.activeRecordCount, 0);
  assert.equal(reversed.data.round.eventCount, 3);
  assert.equal(state.all('waterEntries').length, 3);
  assert.equal(reversed.data.round.ledger.reduce((sum, item) => sum + item.net, 0), 0);
  reversed.data.round.ledger.forEach((item) => assert.deepEqual([item.won, item.treat, item.net], [0, 0, 0]));
  assertNoPrivateIdentity(reversed, ['u_owner', 'u_member', 'u_member_two']);
});

test('V2 reads paginate audit events and enforce current versus archived access', async () => {
  const state = makeDb(enabledSeed());
  const owner = loadMain(state.db, 'u_owner');
  const member = loadMain(state.db, 'u_member');
  const visitor = loadMain(state.db, 'u_visitor');
  const created = await createRoom(state, owner, 'history');
  const roomId = created.data.room.id;
  const firstRoundId = created.data.round.id;
  const ownerId = created.data.viewer.participantId;
  const roster = await owner(request('addParticipants', 'req_history_add', {
    roomId,
    expectedRoomVersion: created.data.room.roomVersion,
    names: ['小林']
  }));
  const lin = roster.data.room.participants.find((item) => item.name === '小林');
  const joined = await member(request('join', 'req_history_join', {
    roomId,
    nickname: '小林',
    claimParticipantId: lin.id,
    expectedRoomVersion: roster.data.room.roomVersion
  }));

  const direct = await member(request('recordDirect', 'req_history_direct', {
    roomId,
    roundId: firstRoundId,
    fromPlayerId: ownerId,
    toPlayerId: lin.id,
    units: 3
  }));
  const corrected = await member(request('correctEntry', 'req_history_correct', {
    roomId,
    roundId: firstRoundId,
    rootEntryId: direct.data.entry.rootEntryId,
    expectedEntryId: direct.data.entry.id,
    replacement: { fromPlayerId: ownerId, toPlayerId: lin.id, units: 4 }
  }));

  const firstPage = await visitor({
    apiVersion: 2,
    action: 'listEntries',
    roomId,
    roundId: firstRoundId,
    category: 'direct',
    limit: 1
  });
  assert.equal(firstPage.code, 'WATER_ENTRIES_LOADED');
  assert.equal(firstPage.data.entries.length, 1);
  assert.equal(firstPage.data.page.hasMore, true);
  const older = await visitor({
    apiVersion: 2,
    action: 'listEntries',
    roomId,
    roundId: firstRoundId,
    category: 'direct',
    beforeSeq: firstPage.data.page.nextBeforeSeq,
    limit: 20
  });
  assert.equal(older.data.entries.length, 1);

  const detail = await visitor({
    apiVersion: 2,
    action: 'getEntry',
    roomId,
    roundId: firstRoundId,
    rootEntryId: direct.data.entry.rootEntryId
  });
  assert.equal(detail.code, 'WATER_ENTRY_LOADED');
  assert.equal(detail.data.history.length, 2);
  assert.equal(detail.data.currentEntry.id, corrected.data.entry.id);

  const newRound = await owner(request('createRound', 'req_new_round', {
    roomId,
    expectedActiveRoundId: firstRoundId,
    expectedRoomVersion: joined.data.room.roomVersion
  }));
  assert.equal(newRound.code, 'WATER_ROUND_STARTED');
  assert.notEqual(newRound.data.round.id, firstRoundId);
  assert.equal(newRound.data.archivedRoundId, firstRoundId);
  const replay = await owner(request('createRound', 'req_new_round', {
    roomId,
    expectedActiveRoundId: firstRoundId,
    expectedRoomVersion: joined.data.room.roomVersion
  }));
  assert.equal(replay.code, 'WATER_WRITE_DEDUPED');
  assert.equal(replay.data.round.id, newRound.data.round.id);

  const archivedWrite = await member(request('recordDirect', 'req_archived_write', {
    roomId,
    roundId: firstRoundId,
    fromPlayerId: ownerId,
    toPlayerId: lin.id,
    units: 1
  }));
  assert.equal(archivedWrite.code, 'WATER_ROUND_ARCHIVED');
  assert.equal(archivedWrite.state, 'finished');

  const rounds = await member({ apiVersion: 2, action: 'listRounds', roomId, limit: 20 });
  assert.equal(rounds.code, 'WATER_ROUNDS_LOADED');
  assert.deepEqual(rounds.data.rounds.map((item) => item.id), [firstRoundId]);
  const archived = await member({
    apiVersion: 2,
    action: 'getRound',
    roomId,
    roundId: firstRoundId
  });
  assert.equal(archived.code, 'WATER_ROUND_LOADED');
  assert.equal(archived.data.round.status, 'archived');

  const visitorRounds = await visitor({ apiVersion: 2, action: 'listRounds', roomId });
  assert.equal(visitorRounds.code, 'WATER_JOIN_REQUIRED');
  const visitorArchived = await visitor({
    apiVersion: 2,
    action: 'listEntries',
    roomId,
    roundId: firstRoundId
  });
  assert.equal(visitorArchived.code, 'WATER_ROOM_FORBIDDEN');
});

test('V2 waterEntries reads use only the composite-index fields locked by section 12.8', async () => {
  const state = makeDb(enabledSeed());
  const owner = loadMain(state.db, 'u_index_shape');
  const created = await createRoom(state, owner, 'index_shape');
  const roomId = created.data.room.id;
  const roundId = created.data.round.id;
  const rootEntryId = 'index_shape_root';
  await state.db.collection('waterEntries').doc(rootEntryId).set({ data: {
    roomId,
    roundId,
    seq: 1,
    rootEntryId,
    eventType: 'transfer_recorded',
    category: 'direct',
    status: 'active',
    payload: { fromPlayerId: 'a', toPlayerId: 'b', units: 1 },
    effectSnapshot: [],
    ledgerDelta: [],
    targetEffectSnapshot: []
  } });

  state.clearQueries();
  await owner({ apiVersion: 2, action: 'listEntries', roomId, roundId, beforeSeq: 2 });
  const allFeedQuery = state.queries('waterEntries').at(-1);
  assert.deepEqual(Object.keys(allFeedQuery.filter).sort(), ['roomId', 'roundId', 'seq']);
  assert.equal(allFeedQuery.filter.roomId, roomId);
  assert.equal(allFeedQuery.filter.roundId, roundId);

  state.clearQueries();
  await owner({
    apiVersion: 2,
    action: 'listEntries',
    roomId,
    roundId,
    category: 'direct',
    afterSeq: 0
  });
  const categoryFeedQuery = state.queries('waterEntries').at(-1);
  assert.deepEqual(Object.keys(categoryFeedQuery.filter).sort(), ['category', 'roundId', 'seq']);
  assert.equal(categoryFeedQuery.filter.roundId, roundId);
  assert.equal(categoryFeedQuery.filter.category, 'direct');

  state.clearQueries();
  const detail = await owner({ apiVersion: 2, action: 'getEntry', roomId, roundId, rootEntryId });
  assert.equal(detail.code, 'WATER_ENTRY_LOADED');
  const historyQuery = state.queries('waterEntries').at(-1);
  assert.deepEqual(Object.keys(historyQuery.filter), ['rootEntryId']);
  assert.equal(historyQuery.filter.rootEntryId, rootEntryId);
});

test('V2 entry history fails closed when a root chain contains a cross-room or cross-round document', async () => {
  const state = makeDb(enabledSeed());
  const owner = loadMain(state.db, 'u_history_pollution');
  const created = await createRoom(state, owner, 'history_pollution');
  const roomId = created.data.room.id;
  const roundId = created.data.round.id;
  const rootEntryId = 'polluted_root';
  const entry = {
    roomId,
    roundId,
    rootEntryId,
    eventType: 'transfer_recorded',
    category: 'direct',
    status: 'active',
    payload: { fromPlayerId: 'a', toPlayerId: 'b', units: 1 },
    effectSnapshot: [],
    ledgerDelta: [],
    targetEffectSnapshot: []
  };
  await state.db.collection('waterEntries').doc('polluted_valid').set({ data: { ...entry, seq: 1 } });
  await state.db.collection('waterEntries').doc('polluted_foreign_room').set({ data: {
    ...entry,
    roomId: 'water_foreign_secret',
    roundId: 'round_foreign_secret',
    seq: 2
  } });

  const detail = await owner({ apiVersion: 2, action: 'getEntry', roomId, roundId, rootEntryId });
  assert.equal(detail.ok, false);
  assert.equal(detail.code, 'WATER_ENTRY_INVALID');
  assert.equal(detail.state, 'invalid');
  assert.equal(JSON.stringify(detail).includes('water_foreign_secret'), false);
});

test('V2 transactions keep 20 concurrent writes and 100 delayed retries lossless', async () => {
  const state = makeDb(enabledSeed());
  const owner = loadMain(state.db, 'u_owner');
  const created = await createRoom(state, owner, 'concurrency');
  const roomId = created.data.room.id;
  const roundId = created.data.round.id;
  const ownerId = created.data.viewer.participantId;
  const names = Array.from({ length: 19 }, (_, index) => `球友${String(index + 1).padStart(2, '0')}`);
  const roster = await owner(request('addParticipants', 'req_parallel_roster', {
    roomId,
    expectedRoomVersion: created.data.room.roomVersion,
    names
  }));
  let roomVersion = roster.data.room.roomVersion;
  const actors = [{ main: owner, participantId: ownerId, openid: 'u_owner' }];
  for (let index = 0; index < names.length; index += 1) {
    const openid = `u_parallel_${index + 1}`;
    const main = loadMain(state.db, openid);
    const participant = roster.data.room.participants.find((item) => item.name === names[index]);
    const joined = await main(request('join', `req_parallel_join_${index + 1}`, {
      roomId,
      nickname: names[index],
      claimParticipantId: participant.id,
      expectedRoomVersion: roomVersion
    }));
    assert.equal(joined.code, 'WATER_MEMBER_JOINED');
    roomVersion = joined.data.room.roomVersion;
    actors.push({ main, participantId: participant.id, openid });
  }

  const sharedRequestId = 'req_parallel_shared_across_members';
  const events = actors.map((actor, index) => request('recordDirect', sharedRequestId, {
    roomId,
    roundId,
    fromPlayerId: index === 0 ? actors[1].participantId : ownerId,
    toPlayerId: index === 0 ? ownerId : actor.participantId,
    units: 1
  }));
  const writes = await Promise.all(actors.map((actor, index) => actor.main(events[index])));
  writes.forEach((result) => assert.equal(result.code, 'WATER_ENTRY_CREATED'));
  assert.equal(new Set(writes.map((result) => result.data.entry.id)).size, 20);
  assert.equal(state.all('waterEntries').length, 20);
  const round = state.read('waterRounds', roundId);
  assert.equal(round.recordCount, 20);
  assert.equal(round.activeRecordCount, 20);
  assert.equal(round.eventCount, 20);
  assert.equal(round.ledger.reduce((sum, item) => sum + item.net, 0), 0);

  const retries = await Promise.all(Array.from({ length: 100 }, () => actors[1].main(events[1])));
  retries.forEach((result) => assert.equal(result.code, 'WATER_WRITE_DEDUPED'));
  assert.equal(new Set(retries.map((result) => result.data.entry.id)).size, 1);
  assert.equal(state.all('waterEntries').length, 20);
});

test('V2 addParticipants rejects the 25th participant atomically without a partial roster write', async () => {
  const state = makeDb(enabledSeed());
  const owner = loadMain(state.db, 'u_owner');
  const created = await createRoom(state, owner, 'roster_limit');
  const roomId = created.data.room.id;
  const roundId = created.data.round.id;
  const firstBatch = await owner(request('addParticipants', 'req_roster_22', {
    roomId,
    expectedRoomVersion: created.data.room.roomVersion,
    names: Array.from({ length: 22 }, (_, index) => `球友${index + 1}`)
  }));
  assert.equal(firstBatch.data.room.participants.length, 23);
  const roomBefore = state.read('waterRooms', roomId);
  const roundBefore = state.read('waterRounds', roundId);
  const logCountBefore = state.all('client_request_logs').length;

  const overflow = await owner(request('addParticipants', 'req_roster_overflow', {
    roomId,
    expectedRoomVersion: roomBefore.roomVersion,
    names: ['第24人', '第25人']
  }));
  assert.equal(overflow.code, 'PLAYER_LIMIT_REACHED');
  assert.equal(overflow.state, 'invalid');
  assert.deepEqual(state.read('waterRooms', roomId), roomBefore);
  assert.deepEqual(state.read('waterRounds', roundId), roundBefore);
  assert.equal(state.all('client_request_logs').length, logCountBefore);
});

test('V2 create restores an owner room with no active round only through createRoundWrite', async () => {
  const state = makeDb(enabledSeed());
  const owner = loadMain(state.db, 'u_owner');
  const created = await createRoom(state, owner, 'resume_finished');
  const roomId = created.data.room.id;
  const archivedRoundId = created.data.round.id;
  await state.db.collection('waterRounds').doc(archivedRoundId).update({
    data: { status: 'archived', archivedAtMs: Date.now() }
  });
  await state.db.collection('waterRooms').doc(roomId).update({
    data: { activeRoundId: '', lastRoundId: archivedRoundId }
  });
  await state.db.collection('water_feature_flags').doc('collaborative_v2').update({
    data: { createRoundWrite: false, revision: 8 }
  });

  const blocked = await owner(request('create', 'req_resume_blocked', { ownerName: '阿杰' }));
  assert.equal(blocked.code, 'WATER_FEATURE_NOT_ENABLED');
  assert.equal(state.all('waterRounds').length, 1);
  assert.equal(state.read('waterRooms', roomId).activeRoundId, '');

  await state.db.collection('water_feature_flags').doc('collaborative_v2').update({
    data: { createRoundWrite: true, revision: 9 }
  });
  const resumed = await owner(request('create', 'req_resume_allowed', { ownerName: '阿杰' }));
  assert.equal(resumed.code, 'WATER_ROOM_READY');
  assert.equal(resumed.state, 'loaded');
  assert.equal(resumed.data.round.number, 2);
  assert.equal(resumed.data.round.previousRoundId, archivedRoundId);
  assert.deepEqual(
    resumed.data.round.participantSnapshot,
    created.data.round.participantSnapshot
  );
  assert.equal(state.read('waterRounds', archivedRoundId).nextRoundId, resumed.data.round.id);
  assert.equal(state.read('waterRooms', roomId).activeRoundId, resumed.data.round.id);
});

test('V2 allowlist and emergency read-only gates are server-derived and fail closed', async () => {
  const state = makeDb(enabledSeed({ canaryOpenids: ['u_owner'] }));
  const owner = loadMain(state.db, 'u_owner');
  const outsider = loadMain(state.db, 'u_outsider');
  const created = await createRoom(state, owner, 'flags');
  const roomId = created.data.room.id;
  const roundId = created.data.round.id;
  const ownerId = created.data.viewer.participantId;
  const roster = await owner(request('addParticipants', 'req_flags_roster', {
    roomId,
    expectedRoomVersion: created.data.room.roomVersion,
    names: ['小林']
  }));
  const lin = roster.data.room.participants.find((item) => item.name === '小林');
  const recordedEvent = request('recordDirect', 'req_flags_record', {
    roomId,
    roundId,
    fromPlayerId: ownerId,
    toPlayerId: lin.id,
    units: 1
  });
  const recorded = await owner(recordedEvent);
  assert.equal(recorded.code, 'WATER_ENTRY_CREATED');

  const hidden = await outsider({ apiVersion: 2, action: 'get', roomId });
  assert.equal(hidden.code, 'WATER_FEATURE_NOT_ENABLED');
  assert.equal(JSON.stringify(hidden).includes(roomId), false);

  await state.db.collection('water_feature_flags').doc('collaborative_v2').update({
    data: { emergencyReadOnly: true, revision: 8 }
  });
  const replay = await owner(recordedEvent);
  assert.equal(replay.code, 'WATER_WRITE_DEDUPED');
  const blocked = await owner(request('recordDirect', 'req_flags_blocked', {
    roomId,
    roundId,
    fromPlayerId: ownerId,
    toPlayerId: lin.id,
    units: 2
  }));
  assert.equal(blocked.code, 'WATER_WRITES_DISABLED');
  assert.equal(state.all('waterEntries').length, 1);

  const ready = await owner(request('create', 'req_flags_ready', { ownerName: '阿杰' }));
  assert.equal(ready.code, 'WATER_ROOM_READY');
  assert.equal(ready.data.capabilities.emergencyReadOnly, true);
  assert.equal(ready.data.capabilities.canOwnerWrite, false);
});

test('V2 feature config rejects malformed allowlist elements and non-numeric revisions', async () => {
  const invalidConfigs = [
    { ...enabledSeed().water_feature_flags.collaborative_v2, canaryRoomIds: [''] },
    { ...enabledSeed().water_feature_flags.collaborative_v2, canaryOpenids: [42] },
    { ...enabledSeed().water_feature_flags.collaborative_v2, revision: '7' },
    { ...enabledSeed().water_feature_flags.collaborative_v2, revision: -1 }
  ];
  for (const [index, config] of invalidConfigs.entries()) {
    const state = makeDb({ water_feature_flags: { collaborative_v2: config } });
    const owner = loadMain(state.db, `u_invalid_config_${index}`);
    const before = state.all('waterRooms');
    const blocked = await owner(request('create', `req_invalid_config_${index}`, { ownerName: '阿杰' }));
    assert.equal(blocked.code, 'WATER_WRITES_DISABLED');
    assert.equal(blocked.state, 'forbidden');
    assert.deepEqual(state.all('waterRooms'), before);
  }
});

test('correct and reverse reject cross-room or cross-round targets without writes', async () => {
  const state = makeDb(enabledSeed());
  const owner = loadMain(state.db, 'u_target_owner');
  const created = await createRoom(state, owner, 'target_scope');
  const roomId = created.data.room.id;
  const roundId = created.data.round.id;
  const participantId = created.data.viewer.participantId;
  const joined = await owner(request('addParticipants', 'req_target_join', {
    roomId,
    names: ['小林'],
    expectedRoomVersion: created.data.room.roomVersion
  }));
  const otherId = joined.data.room.participants.find((item) => item.id !== participantId).id;
  const recorded = await owner(request('recordDirect', 'req_target_record', {
    roomId, roundId, fromPlayerId: participantId, toPlayerId: otherId, units: 1
  }));
  const targetId = recorded.data.entry.id;
  const target = state.read('waterEntries', targetId);
  await state.db.collection('waterEntries').doc(targetId).update({
    data: { roomId: 'water_other_room', roundId: 'round_other' }
  });
  const before = {
    rooms: state.all('waterRooms'),
    rounds: state.all('waterRounds'),
    entries: state.all('waterEntries'),
    logs: state.all('client_request_logs')
  };
  for (const action of ['correctEntry', 'reverseEntry']) {
    const response = await owner(request(action, `req_${action}_cross_scope`, {
      roomId,
      roundId,
      rootEntryId: target.rootEntryId,
      expectedEntryId: targetId,
      replacement: { fromPlayerId: participantId, toPlayerId: otherId, units: 2 }
    }));
    assert.equal(response.ok, false);
    assert.equal(response.code, 'WATER_ENTRY_NOT_ACTIVE');
  }
  assert.deepEqual({
    rooms: state.all('waterRooms'),
    rounds: state.all('waterRounds'),
    entries: state.all('waterEntries'),
    logs: state.all('client_request_logs')
  }, before);
});

test('afterSeq pagination returns consecutive events when more than 20 arrived', async () => {
  const state = makeDb(enabledSeed());
  const owner = loadMain(state.db, 'u_after_owner');
  const created = await createRoom(state, owner, 'after_seq');
  const roomId = created.data.room.id;
  const roundId = created.data.round.id;
  for (let seq = 1; seq <= 45; seq += 1) {
    await state.db.collection('waterEntries').doc(`after_${seq}`).set({
      data: { roomId, roundId, seq, category: 'direct', status: 'active', rootEntryId: `after_${seq}` }
    });
  }
  await state.db.collection('waterRounds').doc(roundId).update({ data: { nextSeq: 46, eventCount: 45 } });
  const seen = [];
  let afterSeq = 0;
  for (;;) {
    const page = await owner({ apiVersion: 2, action: 'listEntries', roomId, roundId, afterSeq, limit: 20 });
    const seqs = page.data.entries.map((entry) => entry.seq);
    seen.push(...seqs);
    if (!page.data.page.hasMore) break;
    afterSeq = Math.max(...seqs);
  }
  assert.deepEqual(seen.slice().sort((a, b) => a - b), Array.from({ length: 45 }, (_, index) => index + 1));
  assert.equal(new Set(seen).size, 45);
});

test('listRounds keeps scanning across 100-row batches and cursors from the last scanned round', async () => {
  const state = makeDb(enabledSeed());
  const owner = loadMain(state.db, 'u_round_scan_owner');
  const memberOpenid = 'u_round_scan_member';
  const created = await createRoom(state, owner, 'round_scan');
  const roomId = created.data.room.id;
  const participantId = 'p_round_scan_member';
  const room = state.read('waterRooms', roomId);
  room.participants.push({
    id: participantId,
    name: '扫描成员',
    source: 'invite',
    claimed: true,
    createdAtMs: 1
  });
  await state.db.collection('waterRooms').doc(roomId).set({ data: room });
  await state.db.collection('waterRoomMembers').doc(stableRoomId(`${roomId}\n${memberOpenid}`).replace(/^water_/, 'wm_')).set({
    data: { roomId, participantId, openid: memberOpenid, role: 'member', status: 'active' }
  });
  for (let number = 1; number <= 130; number += 1) {
    await state.db.collection('waterRounds').doc(`scan_round_${number}`).set({
      data: {
        roomId,
        number,
        title: `第${number}轮`,
        status: 'archived',
        participantIds: [5, 3, 1].includes(number) ? [participantId] : ['p_other'],
        participantSnapshot: [], ledger: [], recordCount: 1, activeRecordCount: 1,
        eventCount: 1, nextSeq: 2, revision: 1, createdAtMs: number
      }
    });
  }
  const member = loadMain(state.db, memberOpenid);
  const first = await member({ apiVersion: 2, action: 'listRounds', roomId, limit: 2 });
  assert.deepEqual(first.data.rounds.map((round) => round.number), [5, 3]);
  assert.equal(first.data.page.nextBeforeNumber, 3);
  assert.equal(first.data.page.hasMore, true);
  const second = await member({
    apiVersion: 2, action: 'listRounds', roomId, limit: 2,
    beforeNumber: first.data.page.nextBeforeNumber
  });
  assert.deepEqual(second.data.rounds.map((round) => round.number), [1]);
  assert.equal(second.data.page.hasMore, false);
});

test('V2 legacy reads return explicit compatibility data and mutations require migration', async () => {
  const roomId = stableRoomId('u_owner');
  const legacy = {
    ownerOpenid: 'u_owner',
    title: '旧打水局',
    status: 'active',
    version: 4,
    participants: [
      { id: 'a', name: '阿杰', openid: 'u_owner', source: 'owner' },
      { id: 'b', name: '小林', openid: '', source: 'manual' }
    ],
    entries: [],
    recentRequestIds: []
  };
  const state = makeDb({ ...enabledSeed(), waterSessions: { [roomId]: legacy } });
  const owner = loadMain(state.db, 'u_owner');
  const created = await owner(request('create', 'req_legacy_create', { ownerName: '阿杰' }));
  assert.equal(created.code, 'WATER_ROOM_LEGACY_READY');
  assert.equal(created.data.migrationRequired, true);
  assert.equal(created.data.fallbackMode, 'legacy');
  assert.equal(created.data.capabilities.legacyOwnerWrite, true);
  assertNoPrivateIdentity(created, ['u_owner']);

  const loaded = await owner({ apiVersion: 2, action: 'get', roomId });
  assert.equal(loaded.code, 'WATER_ROOM_LEGACY_READY');
  const blocked = await owner(request('recordDirect', 'req_legacy_mutation', {
    roomId,
    roundId: 'legacy_round',
    fromPlayerId: 'a',
    toPlayerId: 'b',
    units: 1
  }));
  assert.equal(blocked.code, 'WATER_ROOM_MIGRATION_REQUIRED');
  assert.equal(blocked.state, 'conflict');
  assert.equal(state.all('waterRooms').length, 0);
});

test('V2 configuration fails closed while legacy V1 get remains compatible', async () => {
  const legacyRoomId = 'water_legacy';
  const legacy = {
    ownerOpenid: 'u_owner',
    title: '旧打水局',
    status: 'active',
    version: 3,
    participants: [
      { id: 'a', name: '阿杰', openid: 'u_owner', source: 'owner' },
      { id: 'b', name: '小林', openid: '', source: 'manual' }
    ],
    entries: [],
    recentRequestIds: []
  };
  const state = makeDb({ waterSessions: { [legacyRoomId]: legacy } });
  const owner = loadMain(state.db, 'u_owner');

  const v1 = await owner({ action: 'get', sessionId: legacyRoomId });
  assert.equal(v1.ok, true);
  assert.equal(v1.code, 'WATER_SESSION_LOADED');
  assert.equal(v1.session.version, 3);
  assert.equal(JSON.stringify(v1).includes('u_owner'), false);

  const blocked = await owner(request('create', 'req_config_missing', { ownerName: '阿杰' }));
  assertStandard(blocked);
  assert.equal(blocked.code, 'WATER_WRITES_DISABLED');
  assert.equal(blocked.state, 'forbidden');
  assert.equal(state.all('waterRooms').length, 0);
});

test('V2 rejects cross-room activeRound pointers for reads and every vulnerable mutation without writes', async () => {
  async function fixture(suffix) {
    const state = makeDb(enabledSeed());
    const ownerA = loadMain(state.db, `u_cross_a_${suffix}`);
    const ownerB = loadMain(state.db, `u_cross_b_${suffix}`);
    const roomAResult = await createRoom(state, ownerA, `cross_a_${suffix}`);
    const roomBResult = await createRoom(state, ownerB, `cross_b_${suffix}`);
    const rosterA = await ownerA(request('addParticipants', `req_cross_roster_${suffix}`, {
      roomId: roomAResult.data.room.id,
      expectedRoomVersion: roomAResult.data.room.roomVersion,
      names: ['同房球友']
    }));
    const roomA = rosterA.data.room;
    const roundB = roomBResult.data.round;
    await state.db.collection('waterRooms').doc(roomA.id).update({
      data: { activeRoundId: roundB.id }
    });
    await state.db.collection('waterRounds').doc(roundB.id).update({
      data: { recordCount: 1 }
    });
    return { state, ownerA, roomId: roomA.id, roomA: state.read('waterRooms', roomA.id), roundB };
  }

  {
    const { ownerA, roomId, roundB } = await fixture('read');
    const loaded = await ownerA({ apiVersion: 2, action: 'get', roomId });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.code, 'WATER_ROUND_NOT_FOUND');
    assert.equal(JSON.stringify(loaded).includes(roundB.id), false);
  }

  const cases = [
    ['addParticipants', async ({ ownerA, roomId, roomA }) => ownerA(request('addParticipants', 'req_cross_add', {
      roomId,
      expectedRoomVersion: roomA.roomVersion,
      names: ['越界球友']
    }))],
    ['join', async ({ state, roomId, roomA }) => loadMain(state.db, 'u_cross_join')(request('join', 'req_cross_join', {
      roomId,
      expectedRoomVersion: roomA.roomVersion,
      nickname: '越界访客'
    }))],
    ['createRound', async ({ ownerA, roomId, roomA }) => ownerA(request('createRound', 'req_cross_round', {
      roomId,
      expectedRoomVersion: roomA.roomVersion,
      expectedActiveRoundId: roomA.activeRoundId
    }))],
    ['v1 recordGame', async ({ ownerA, roomId, roomA }) => ownerA({
      action: 'recordGame',
      sessionId: roomId,
      expectedVersion: roomA.syncVersion,
      winnerIds: [roomA.participants[0].id],
      loserIds: [roomA.participants[1].id],
      unitsPerPlayer: 1,
      clientRequestId: 'req_cross_v1_record'
    })]
  ];
  for (const [label, invoke] of cases) {
    const context = await fixture(label.replace(/\W+/g, '_'));
    const before = mutableSnapshot(context.state);
    const response = await invoke(context);
    assert.equal(response.ok, false, label);
    assert.deepEqual(mutableSnapshot(context.state), before, `${label} must be zero-write`);
  }
});

test('V2 malformed member documents fail closed for capabilities and mutations', async () => {
  const cases = [
    { label: 'unknown role', patch: { role: 'admin' }, action: 'record' },
    { label: 'inactive owner', patch: { status: 'inactive' }, action: 'roster' },
    { label: 'owner participant mismatch', patch: { participantId: 'p_unknown' }, action: 'roster' },
    { label: 'member room mismatch', patch: { role: 'member', roomId: 'water_other' }, action: 'record' },
    { label: 'empty participant', patch: { role: 'member', participantId: '' }, action: 'record' }
  ];
  for (const item of cases) {
    const state = makeDb(enabledSeed());
    const openid = `u_bad_member_${item.label.replace(/\W+/g, '_')}`;
    const main = loadMain(state.db, openid);
    const created = await createRoom(state, main, `bad_member_${item.label}`);
    const roomId = created.data.room.id;
    const roundId = created.data.round.id;
    const roster = await main(request('addParticipants', `req_bad_roster_${item.label}`, {
      roomId,
      expectedRoomVersion: created.data.room.roomVersion,
      names: ['正常球友']
    }));
    const otherId = roster.data.room.participants.find((participant) => (
      participant.id !== created.data.viewer.participantId
    )).id;
    await state.db.collection('waterRoomMembers').doc(memberId(roomId, openid)).update({ data: item.patch });

    const loaded = await main({ apiVersion: 2, action: 'get', roomId });
    assert.equal(loaded.data.viewer.role, 'visitor', item.label);
    ['canManageRoster', 'canOwnerWrite', 'canMemberWrite', 'canCorrect', 'canReverse', 'canCreateRound']
      .forEach((key) => assert.equal(loaded.data.capabilities[key], false, `${item.label}:${key}`));

    const before = mutableSnapshot(state);
    const response = item.action === 'roster'
      ? await main(request('addParticipants', `req_bad_${item.label}`, {
        roomId,
        expectedRoomVersion: roster.data.room.roomVersion,
        names: ['不应写入']
      }))
      : await main(request('recordDirect', `req_bad_${item.label}`, {
        roomId,
        roundId,
        fromPlayerId: created.data.viewer.participantId,
        toPlayerId: otherId,
        units: 1
      }));
    assert.equal(response.ok, false, item.label);
    assert.deepEqual(mutableSnapshot(state), before, `${item.label} must be zero-write`);
  }
});

test('V1 and V2 entry projections recursively whitelist business fields', async () => {
  const state = makeDb(enabledSeed());
  const owner = loadMain(state.db, 'u_privacy_owner');
  const created = await createRoom(state, owner, 'privacy');
  const roomId = created.data.room.id;
  const roundId = created.data.round.id;
  const ownerId = created.data.viewer.participantId;
  const roster = await owner(request('addParticipants', 'req_privacy_add', {
    roomId,
    expectedRoomVersion: created.data.room.roomVersion,
    names: ['小林']
  }));
  const otherId = roster.data.room.participants.find((item) => item.id !== ownerId).id;
  const recorded = await owner(request('recordDirect', 'req_privacy_record', {
    roomId, roundId, fromPlayerId: ownerId, toPlayerId: otherId, units: 1
  }));
  const entryId = recorded.data.entry.id;
  const stored = state.read('waterEntries', entryId);
  await state.db.collection('waterEntries').doc(entryId).set({ data: {
    ...stored,
    payload: { ...stored.payload, openid: 'u_secret_v2', clientRequestId: 'secret_request' },
    effectSnapshot: stored.effectSnapshot.map((row) => ({ ...row, operatorOpenId: 'u_secret_v2' })),
    ledgerDelta: stored.ledgerDelta.map((row) => ({ ...row, memberId: 'secret_member' })),
    targetEffectSnapshot: [{ participantId: ownerId, wonDelta: 0, treatDelta: 0, netDelta: 0, openid: 'u_secret_v2' }]
  } });

  const listed = await owner({ apiVersion: 2, action: 'listEntries', roomId, roundId });
  const detail = await owner({ apiVersion: 2, action: 'getEntry', roomId, roundId, rootEntryId: entryId });
  assertNoPrivateIdentity(listed, ['u_secret_v2']);
  assertNoPrivateIdentity(detail, ['u_secret_v2']);

  const legacyId = 'water_legacy_private';
  await state.db.collection('waterSessions').doc(legacyId).set({ data: {
    ownerOpenid: 'u_privacy_owner', title: '旧账', status: 'active', version: 1,
    participants: [{ id: 'legacy_a', name: '阿杰', source: 'owner', openid: 'u_privacy_owner' }],
    entries: [{ id: 'legacy_e', type: 'transfer', fromPlayerId: 'legacy_a', toPlayerId: 'legacy_b', units: 1,
      openid: 'u_secret_v1', payload: { operatorOpenId: 'u_secret_v1' } }],
    recentRequestIds: [], updatedAtMs: 1
  } });
  const legacyV1 = await owner({ action: 'get', sessionId: legacyId });
  const legacyV2 = await owner({ apiVersion: 2, action: 'get', roomId: legacyId });
  assertNoPrivateIdentity(legacyV1, ['u_secret_v1']);
  assertNoPrivateIdentity(legacyV2, ['u_secret_v1']);
});

test('V2 getEntry returns complete revision chains beyond 200 events', async () => {
  const state = makeDb(enabledSeed());
  const owner = loadMain(state.db, 'u_history_201');
  const created = await createRoom(state, owner, 'history_201');
  const roomId = created.data.room.id;
  const roundId = created.data.round.id;
  const rootEntryId = 'history_root_201';
  for (let seq = 1; seq <= 201; seq += 1) {
    await state.db.collection('waterEntries').doc(`history_${seq}`).set({ data: {
      roomId, roundId, seq, rootEntryId,
      eventType: seq === 1 ? 'transfer_recorded' : 'entry_corrected',
      category: 'direct', status: seq === 201 ? 'active' : 'corrected',
      payload: { fromPlayerId: 'a', toPlayerId: 'b', units: 1 },
      effectSnapshot: [], ledgerDelta: [], targetEffectSnapshot: []
    } });
  }
  state.clearQueries();
  const detail = await owner({ apiVersion: 2, action: 'getEntry', roomId, roundId, rootEntryId });
  assert.equal(detail.ok, true);
  assert.equal(detail.data.history.length, 201);
  assert.equal(detail.data.currentEntry.id, 'history_201');
  const historyQueries = state.queries('waterEntries');
  assert.equal(historyQueries.length, 3);
  assert.deepEqual(Object.keys(historyQueries[0].filter), ['rootEntryId']);
  historyQueries.slice(1).forEach((query) => {
    assert.deepEqual(Object.keys(query.filter).sort(), ['rootEntryId', 'seq']);
  });
});

test('V2 create validates successful request logs before READY and rehydrates delayed retries', async () => {
  {
    const state = makeDb(enabledSeed());
    const owner = loadMain(state.db, 'u_create_replay');
    const original = await owner(request('create', 'req_create_replay', { ownerName: '阿杰' }));
    const before = mutableSnapshot(state);
    const replay = await owner(request('create', 'req_create_replay', { ownerName: '阿杰' }));
    assert.equal(replay.code, 'WATER_WRITE_DEDUPED');
    assert.equal(replay.state, 'deduped');
    assert.equal(replay.data.deduped, true);
    assert.equal(replay.data.round.id, original.data.round.id);
    assert.deepEqual(mutableSnapshot(state), before);
  }
  {
    const state = makeDb(enabledSeed());
    const owner = loadMain(state.db, 'u_create_reused');
    await owner(request('create', 'req_create_reused', { ownerName: '阿杰' }));
    const before = mutableSnapshot(state);
    const reused = await owner(request('create', 'req_create_reused', { ownerName: '改名' }));
    assert.equal(reused.code, 'CLIENT_REQUEST_ID_REUSED');
    assert.deepEqual(mutableSnapshot(state), before);
  }
  {
    const state = makeDb(enabledSeed());
    const owner = loadMain(state.db, 'u_create_archived_replay');
    const original = await owner(request('create', 'req_create_archived_replay', { ownerName: '阿杰' }));
    await state.db.collection('waterRounds').doc(original.data.round.id).update({
      data: { status: 'archived', archivedAtMs: Date.now() }
    });
    await state.db.collection('waterRooms').doc(original.data.room.id).update({
      data: { activeRoundId: '', lastRoundId: original.data.round.id }
    });
    await state.db.collection('water_feature_flags').doc('collaborative_v2').update({
      data: { emergencyReadOnly: true }
    });
    const before = mutableSnapshot(state);
    const replay = await owner(request('create', 'req_create_archived_replay', { ownerName: '阿杰' }));
    assert.equal(replay.code, 'WATER_WRITE_DEDUPED');
    assert.equal(replay.data.round.id, original.data.round.id);
    assert.deepEqual(mutableSnapshot(state), before);
  }
});

test('V2 create replay rechecks the current eligible and v2Read gate without writing', async () => {
  const cases = [
    {
      label: 'v2Read disabled',
      patch: { v2Read: false }
    },
    {
      label: 'canary access withdrawn',
      patch: { canaryRoomIds: ['water_not_this_room'], canaryOpenids: [] }
    }
  ];

  for (const item of cases) {
    const openid = `u_create_gate_${item.label.replace(/\W+/g, '_')}`;
    const state = makeDb(enabledSeed());
    const owner = loadMain(state.db, openid);
    await owner(request('create', 'req_create_gate_replay', { ownerName: '阿杰' }));
    await state.db.collection('water_feature_flags').doc('collaborative_v2').update({
      data: item.patch
    });
    const before = mutableSnapshot(state);

    const replay = await owner(request('create', 'req_create_gate_replay', { ownerName: '阿杰' }));

    assert.equal(replay.ok, false, item.label);
    assert.equal(replay.code, 'WATER_FEATURE_NOT_ENABLED', item.label);
    assert.equal(replay.state, 'forbidden', item.label);
    assert.deepEqual(mutableSnapshot(state), before, `${item.label} must be zero-write`);
  }
});

test('V2 rejects rooms unless schemaVersion 2 and migrationStatus active are explicit', async () => {
  const cases = [
    ['missing migrationStatus', (room) => { delete room.migrationStatus; }],
    ['missing schemaVersion', (room) => { delete room.schemaVersion; }],
    ['wrong schemaVersion', (room) => { room.schemaVersion = 1; }]
  ];
  for (const [label, mutateRoom] of cases) {
    const state = makeDb(enabledSeed());
    const owner = loadMain(state.db, `u_schema_${label.replace(/\W+/g, '_')}`);
    const created = await createRoom(state, owner, `schema_${label}`);
    const room = state.read('waterRooms', created.data.room.id);
    mutateRoom(room);
    await state.db.collection('waterRooms').doc(created.data.room.id).set({ data: room });
    const before = mutableSnapshot(state);
    const loaded = await owner({ apiVersion: 2, action: 'get', roomId: created.data.room.id });
    assert.equal(loaded.ok, false, label);
    assert.equal(loaded.code, 'WATER_ROOM_MIGRATION_REQUIRED', label);
    const write = await owner(request('addParticipants', `req_schema_${label}`, {
      roomId: created.data.room.id,
      expectedRoomVersion: created.data.room.roomVersion,
      names: ['不应写入']
    }));
    assert.equal(write.ok, false, label);
    assert.deepEqual(mutableSnapshot(state), before, `${label} must remain zero-write`);
  }
});
