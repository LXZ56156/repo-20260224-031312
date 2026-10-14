const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const clone = value => JSON.parse(JSON.stringify(value));

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function database() {
  let store = { water_feature_flags: { collaborative_v2: {
    emergencyReadOnly: false, v2Read: true, rosterWrite: true, ownerWrite: true,
    memberWrite: true, correctWrite: true, reverseWrite: true, createRoundWrite: true,
    canaryRoomIds: [], canaryOpenids: [], revision: 1
  } } };
  let revision = 0;
  let paused = false;
  const stopped = deferred();
  const release = deferred();
  const writes = [];
  const collection = (draft, name, transactional) => ({ doc(id) {
    return {
      async get() {
        const value = draft[name]?.[id];
        if (!value) throw new Error('document.get:fail document does not exist');
        return { data: { _id: id, ...clone(value) } };
      },
      async set({ data }) {
        if (name === 'waterSessions' && data.participants[0].name === 'Slow owner' && !paused) {
          paused = true;
          stopped.resolve();
          await release.promise;
        }
        draft[name] ||= {};
        draft[name][id] = clone(data);
        writes.push({ name, transactional });
        return { _id: id };
      },
      async update({ data }) {
        Object.assign(draft[name][id], clone(data));
        return { stats: { updated: 1 } };
      }
    };
  } });
  const db = {
    serverDate: () => ({ $serverDate: true }),
    async createCollection(name) { store[name] ||= {}; },
    collection: name => collection(store, name, false),
    async runTransaction(handler) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const readRevision = revision;
        const draft = clone(store);
        const result = await handler({ collection: name => collection(draft, name, true) });
        if (revision !== readRevision) continue;
        store = draft;
        revision++;
        return result;
      }
      throw new Error('write conflict');
    }
  };
  return { db, stopped, release, writes, read: id => clone(store.waterSessions?.[id]) };
}

function loadMain(db) {
  const mainPath = require.resolve('../cloudfunctions/waterSession/index');
  const originalLoad = Module._load;
  delete require.cache[mainPath];
  Module._load = function(request, parent, isMain) {
    if (request === 'wx-server-sdk') return {
      init() {}, database: () => db, getWXContext: () => ({ OPENID: 'offline_owner' }),
      DYNAMIC_CURRENT_ENV: 'offline-only'
    };
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return require(mainPath).main; } finally { Module._load = originalLoad; }
}

for (const recordBeforeRelease of [false, true]) {
  test('V1 delayed create preserves the concurrent ' + (recordBeforeRelease ? 'roster and record' : 'creation'), async () => {
    const state = database();
    const main = loadMain(state.db);
    const slow = main({ action: 'create', ownerName: 'Slow owner', clientRequestId: 'slow-create' });
    await state.stopped.promise;
    try {
      const fast = await main({ action: 'create', ownerName: 'Fast owner', clientRequestId: 'fast-create' });
      assert.equal(fast.code, 'WATER_SESSION_CREATED');
      const sessionId = fast.session.id;
      if (recordBeforeRelease) {
        const roster = await main({ action: 'addParticipants', sessionId, names: 'Other player',
          expectedVersion: 1, clientRequestId: 'add-player' });
        assert.equal(roster.ok, true);
        const [a, b] = roster.session.participants;
        const record = await main({ action: 'recordGame', sessionId, winnerIds: [a.id], loserIds: [b.id],
          unitsPerPlayer: 1, expectedVersion: 2, clientRequestId: 'record-game' });
        assert.equal(record.ok, true);
      }
      const before = state.read(sessionId);
      state.release.resolve();
      const resumed = await slow;
      assert.equal(resumed.code, 'WATER_SESSION_READY');
      assert.equal(resumed.state, 'existing');
      assert.equal(resumed.session.version, recordBeforeRelease ? 3 : 1);
      assert.equal(resumed.session.entries.length, recordBeforeRelease ? 1 : 0);
      assert.deepEqual(state.read(sessionId), before);
      assert.equal(state.writes.every(write => write.transactional), true);
    } finally { state.release.resolve(); await slow; }
  });
}

test('V1 existing ledger remains readable when the write switch is closed', async () => {
  const state = database();
  const main = loadMain(state.db);
  const created = await main({ action: 'create', ownerName: 'Owner' });
  await state.db.collection('water_feature_flags').doc('collaborative_v2').update({ data: { emergencyReadOnly: true } });
  const before = state.read(created.session.id);
  assert.equal((await main({ action: 'create' })).code, 'WATER_SESSION_READY');
  assert.deepEqual(state.read(created.session.id), before);
});

test('V1 create preserves a finished legacy ledger rather than clearing its history', async () => {
  const state = database();
  const main = loadMain(state.db);
  const created = await main({ action: 'create', ownerName: 'Owner' });
  const sessionId = created.session.id;
  const finished = await main({ action: 'finish', sessionId, expectedVersion: 1, clientRequestId: 'finish-old' });
  assert.equal(finished.ok, true);
  const before = state.read(sessionId);
  const resumed = await main({ action: 'create', ownerName: 'Replacement' });
  assert.equal(resumed.code, 'WATER_SESSION_READY');
  assert.equal(resumed.session.status, 'finished');
  assert.deepEqual(state.read(sessionId), before);
});
