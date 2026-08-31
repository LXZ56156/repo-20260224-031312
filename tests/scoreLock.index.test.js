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

function createDbHarnessWithTournament(lockGetImpl, tournamentFactory) {
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
                    return { data: tournamentFactory() };
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
    code: 'LOCK_IDLE',
    message: '当前可开始录分',
    state: 'idle',
    traceId: '',
    data: {
      ownerId: '',
      ownerName: '',
      expireAt: 0,
      remainingMs: 0
    },
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
    matchIndex: 0,
    lockSessionId: 'session_new'
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, 'acquired');
  assert.equal(result.ownerId, 'u_admin');
  assert.equal(result.lockSessionId, 'session_new');
  assert.equal(result.data.lockSessionId, 'session_new');
  assert.equal(calls.set.length, 1);
  assert.equal(calls.remove.length, 0);
  assert.equal(calls.set[0].id, 't_1_0_0');
  assert.equal(Object.prototype.hasOwnProperty.call(calls.set[0].payload.data, '_id'), false);
  assert.equal(calls.set[0].payload.data.ownerId, 'u_admin');
  assert.equal(calls.set[0].payload.data.lockSessionId, 'session_new');
});

test('scoreLock index ignores stale-session release for a newer owner lock', async () => {
  const expireAt = Date.now() + 30_000;
  const { db, calls } = createDbHarness(async () => ({
    data: {
      ownerId: 'u_admin',
      ownerName: '管理员',
      expireAt,
      lockSessionId: 'session_new'
    }
  }));
  const { main } = loadScoreLockMain(db);

  const result = await main({
    action: 'release',
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    lockSessionId: 'session_old'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'LOCK_RELEASED');
  assert.equal(result.state, 'released');
  assert.equal(calls.set.length, 0);
  assert.equal(calls.remove.length, 0);
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

test('scoreLock index returns occupied lock errors with occupied state', async () => {
  const expireAt = Date.now() + 30_000;
  const { db, calls } = createDbHarness(async () => ({
    data: {
      ownerId: 'u_other',
      ownerName: '裁判A',
      expireAt
    }
  }));
  const { main } = loadScoreLockMain(db);

  const result = await main({
    action: 'status',
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'LOCK_OCCUPIED');
  assert.equal(result.state, 'occupied');
  assert.equal(result.ownerId, 'u_other');
  assert.equal(result.ownerName, '裁判A');
  assert.equal(result.expireAt, expireAt);
  assert.equal(calls.set.length, 0);
  assert.equal(calls.remove.length, 0);
});

test('scoreLock index returns structured not_found result when tournament is missing', async () => {
  const { db, calls } = createDbHarness(async () => ({
    data: {
      ownerId: 'u_admin',
      ownerName: '管理员',
      expireAt: Date.now() + 5_000
    }
  }));
  db.runTransaction = async (handler) => handler({
    collection(name) {
      if (name === 'tournaments') {
        return {
          doc() {
            return {
              async get() {
                throw new Error('document.get:fail document does not exist');
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
                return { data: { _id: id } };
              },
              async set(payload) {
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
  });
  const { main } = loadScoreLockMain(db);

  const result = await main({
    action: 'status',
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    __traceId: 'trace-lock-missing-tournament'
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'TOURNAMENT_NOT_FOUND',
    message: '赛事不存在',
    state: 'not_found',
    traceId: 'trace-lock-missing-tournament',
    data: {}
  });
});

test('scoreLock index returns structured invalid result when match is missing', async () => {
  const { db, calls } = createDbHarnessWithTournament(
    async () => {
      throw new Error('document.get:fail document does not exist');
    },
    () => ({
      ...buildTournament(),
      rounds: [{ roundIndex: 0, matches: [] }]
    })
  );
  const { main } = loadScoreLockMain(db);

  const result = await main({
    action: 'status',
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    __traceId: 'trace-lock-missing-match'
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'MATCH_NOT_FOUND',
    message: '比赛不存在',
    state: 'invalid',
    traceId: 'trace-lock-missing-match',
    data: {}
  });
  assert.equal(calls.set.length, 0);
  assert.equal(calls.remove.length, 0);
});

test('scoreLock index can acquire a finished match for score edits', async () => {
  const { db, calls } = createDbHarnessWithTournament(
    async () => {
      throw new Error('document.get:fail document does not exist');
    },
    () => ({
      ...buildTournament(),
      rounds: [{
        roundIndex: 0,
        matches: [{ matchIndex: 0, status: 'finished' }]
      }]
    })
  );
  const { main } = loadScoreLockMain(db);

  const result = await main({
    action: 'acquire',
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'LOCK_ACQUIRED');
  assert.equal(result.state, 'acquired');
  assert.equal(result.ownerId, 'u_admin');
  assert.equal(calls.set.length, 1);
  assert.equal(calls.remove.length, 0);
});

test('scoreLock index keeps canceled matches locked out', async () => {
  const { db, calls } = createDbHarnessWithTournament(
    async () => {
      throw new Error('document.get:fail document does not exist');
    },
    () => ({
      ...buildTournament(),
      rounds: [{
        roundIndex: 0,
        matches: [{ matchIndex: 0, status: 'canceled' }]
      }]
    })
  );
  const { main } = loadScoreLockMain(db);

  const result = await main({
    action: 'acquire',
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'MATCH_CANCELED');
  assert.equal(result.state, 'canceled');
  assert.equal(result.message, '该场已结束');
  assert.equal(calls.set.length, 0);
  assert.equal(calls.remove.length, 0);
});

test('scoreLock index returns expired heartbeat errors with expired state', async () => {
  const { db } = createDbHarness(async () => ({
    data: {
      ownerId: 'u_admin',
      ownerName: '管理员',
      expireAt: Date.now() - 1
    }
  }));
  const { main } = loadScoreLockMain(db);

  const result = await main({
    action: 'heartbeat',
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'LOCK_EXPIRED');
  assert.equal(result.state, 'expired');
});
