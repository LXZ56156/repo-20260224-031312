const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const scoreLockIndexPath = require.resolve('../cloudfunctions/scoreLock/index.js');
const scoreLockCommonPath = require.resolve('../cloudfunctions/scoreLock/lib/common.js');
const scoreLockLogicPath = require.resolve('../cloudfunctions/scoreLock/logic.js');
const scoreLockPermissionPath = require.resolve('../cloudfunctions/scoreLock/lib/permission.js');

function buildTournament() {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'running',
    players: [{ id: 'u_admin', name: '管理员' }],
    rounds: [{
      roundIndex: 0,
      matches: [{ matchIndex: 0, status: 'pending' }]
    }]
  };
}

function loadScoreLockMain(db) {
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    database() {
      return db;
    },
    getWXContext() {
      return { OPENID: 'u_admin' };
    },
    DYNAMIC_CURRENT_ENV: 'test-env'
  };

  delete require.cache[scoreLockIndexPath];
  delete require.cache[scoreLockCommonPath];
  delete require.cache[scoreLockLogicPath];
  delete require.cache[scoreLockPermissionPath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(scoreLockIndexPath);
  } finally {
    Module._load = originalLoad;
  }
}

function createDbHarness(lockGetImpl) {
  const calls = {
    set: [],
    remove: [],
    createCollection: 0
  };
  const db = {
    createCollection: async () => {
      calls.createCollection += 1;
    },
    serverDate() {
      return { $serverDate: true };
    },
    async runTransaction(handler) {
      const transaction = {
        collection(name) {
          if (name === 'tournaments') {
            return {
              doc(id) {
                assert.equal(id, 't_1');
                return {
                  async get() {
                    return { data: buildTournament() };
                  }
                };
              }
            };
          }
          if (name === 'score_locks') {
            return {
              doc(id) {
                return {
                  async get() {
                    return lockGetImpl(id);
                  },
                  async set(payload) {
                    if (payload && payload.data && Object.prototype.hasOwnProperty.call(payload.data, '_id')) {
                      throw new Error('score_locks set payload must not include _id');
                    }
                    calls.set.push({ id, payload });
                  },
                  async remove() {
                    calls.remove.push(id);
                  }
                };
              }
            };
          }
          throw new Error(`unexpected collection ${name}`);
        }
      };
      return handler(transaction);
    }
  };
  return { db, calls };
}

test('scoreLock index treats missing lock doc as idle for status', async () => {
  const { db, calls } = createDbHarness(async () => {
    throw new Error('document.get:fail document does not exist');
  });
  const { main } = loadScoreLockMain(db);

  const result = await main({
    action: 'status',
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0
  });

  assert.deepEqual(result, {
    ok: true,
    state: 'idle',
    ownerId: '',
    ownerName: '',
    expireAt: 0,
    remainingMs: 0
  });
  assert.equal(calls.createCollection, 1);
  assert.equal(calls.set.length, 0);
  assert.equal(calls.remove.length, 0);
});

test('scoreLock index can acquire when lock doc is missing', async () => {
  const { db, calls } = createDbHarness(async () => {
    throw new Error('document.get:fail document does not exist');
  });
  const { main } = loadScoreLockMain(db);

  const result = await main({
    action: 'acquire',
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, 'acquired');
  assert.equal(result.ownerId, 'u_admin');
  assert.equal(calls.set.length, 1);
  assert.equal(calls.remove.length, 0);
  assert.equal(calls.set[0].id, 't_1_0_0');
  assert.equal(Object.prototype.hasOwnProperty.call(calls.set[0].payload.data, '_id'), false);
  assert.equal(calls.set[0].payload.data.ownerId, 'u_admin');
});

test('scoreLock index strips stored _id before heartbeat writeback', async () => {
  const { db, calls } = createDbHarness(async () => ({
    data: {
      _id: 't_1_0_0',
      tournamentId: 't_1',
      roundIndex: 0,
      matchIndex: 0,
      ownerId: 'u_admin',
      ownerName: '管理员',
      expireAt: Date.now() + 5_000
    }
  }));
  const { main } = loadScoreLockMain(db);

  const result = await main({
    action: 'heartbeat',
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, 'acquired');
  assert.equal(calls.set.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(calls.set[0].payload.data, '_id'), false);
  assert.equal(calls.set[0].payload.data.ownerId, 'u_admin');
});
