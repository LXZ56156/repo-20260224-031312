const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/deleteTournament/index.js');
const commonPath = require.resolve('../cloudfunctions/deleteTournament/lib/common.js');
const requestLogCollection = 'delete_tournament_requests';

function loadMain(db, stubs = {}) {
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

  delete require.cache[mainPath];
  delete require.cache[commonPath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk;
    if (request === './logic' && stubs.logic) return stubs.logic;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(mainPath);
  } finally {
    Module._load = originalLoad;
  }
}

function buildTournament(overrides = {}) {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'draft',
    ...overrides
  };
}

function createDeleteTournamentDb(options = {}) {
  const state = {
    tournament: options.tournament === null ? null : buildTournament(options.tournament),
    requestLogs: Array.isArray(options.requestLogs) ? options.requestLogs.map((item, index) => ({
      _id: item && item._id ? item._id : `req_log_${index + 1}`,
      ...item
    })) : [],
    removedCount: 0,
    scoreLockCleanupCount: 0,
    createCollectionCalls: []
  };

  function findRequestLogs(query = {}) {
    return state.requestLogs.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      return Object.keys(query).every((key) => item[key] === query[key]);
    });
  }

  function getTournamentDoc() {
    if (!state.tournament) {
      throw new Error('document.get:fail document does not exist');
    }
    return { data: { ...state.tournament } };
  }

  function buildTournamentCollection() {
    return {
      doc(id) {
        assert.equal(id, 't_1');
        return {
          async get() {
            return getTournamentDoc();
          },
          async remove() {
            if (!state.tournament) {
              throw new Error('document.remove:fail document does not exist');
            }
            state.tournament = null;
            state.removedCount += 1;
          }
        };
      }
    };
  }

  function buildRequestLogCollection() {
    return {
      where(query) {
        return {
          limit(count) {
            assert.equal(count, 1);
            return {
              async get() {
                return {
                  data: findRequestLogs(query).slice(0, count).map((item) => ({ ...item }))
                };
              }
            };
          }
        };
      },
      async add({ data }) {
        const next = {
          _id: `req_log_${state.requestLogs.length + 1}`,
          ...data
        };
        state.requestLogs.push(next);
        return { _id: next._id };
      }
    };
  }

  const db = {
    async createCollection(name) {
      state.createCollectionCalls.push(name);
    },
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      if (name === 'score_locks') {
        return {
          where(query) {
            assert.deepEqual(query, { tournamentId: 't_1' });
            return {
              async remove() {
                state.scoreLockCleanupCount += 1;
              }
            };
          }
        };
      }
      if (name === 'tournaments') return buildTournamentCollection();
      if (name === requestLogCollection) return buildRequestLogCollection();
      throw new Error(`unexpected collection ${name}`);
    },
    async runTransaction(handler) {
      return handler({
        collection(name) {
          if (name === 'tournaments') return buildTournamentCollection();
          if (name === requestLogCollection) return buildRequestLogCollection();
          throw new Error(`unexpected transaction collection ${name}`);
        }
      });
    }
  };

  return { db, state };
}

test('deleteTournament index removes tournament, records request log, and triggers lock cleanup', async () => {
  let cleanupCalled = false;
  const { db, state } = createDeleteTournamentDb();
  const { main } = loadMain(db, {
    logic: {
      async cleanupScoreLocksBestEffort(cleanupFn) {
        cleanupCalled = true;
        await cleanupFn();
      }
    }
  });

  const result = await main({
    tournamentId: 't_1',
    clientRequestId: 'req_delete_1'
  });

  assert.deepEqual(result, {
    ok: true,
    code: 'TOURNAMENT_DELETED',
    message: '已删除赛事',
    state: 'deleted',
    traceId: '',
    clientRequestId: 'req_delete_1',
    deduped: false,
    data: {
      clientRequestId: 'req_delete_1',
      deduped: false
    }
  });
  assert.equal(state.removedCount, 1);
  assert.equal(state.requestLogs.length, 1);
  assert.equal(state.requestLogs[0].clientRequestId, 'req_delete_1');
  assert.equal(state.requestLogs[0].tournamentId, 't_1');
  assert.equal(state.requestLogs[0].operatorOpenId, 'u_admin');
  assert.equal(state.requestLogs[0].status, 'deleted');
  assert.equal(state.scoreLockCleanupCount, 1);
  assert.equal(cleanupCalled, true);
});

test('same clientRequestId retries should dedupe after successful delete', async () => {
  let cleanupCallCount = 0;
  const { db, state } = createDeleteTournamentDb();
  const { main } = loadMain(db, {
    logic: {
      async cleanupScoreLocksBestEffort(cleanupFn) {
        cleanupCallCount += 1;
        await cleanupFn();
      }
    }
  });

  const first = await main({
    tournamentId: 't_1',
    clientRequestId: 'req_delete_1'
  });
  const second = await main({
    tournamentId: 't_1',
    clientRequestId: 'req_delete_1'
  });

  assert.equal(first.state, 'deleted');
  assert.equal(first.deduped, false);
  assert.equal(second.ok, true);
  assert.equal(second.code, 'TOURNAMENT_DELETED');
  assert.equal(second.state, 'deduped');
  assert.equal(second.clientRequestId, 'req_delete_1');
  assert.equal(second.deduped, true);
  assert.equal(second.alreadyDeleted, true);
  assert.deepEqual(second.data, {
    clientRequestId: 'req_delete_1',
    deduped: true,
    alreadyDeleted: true
  });
  assert.equal(state.removedCount, 1);
  assert.equal(state.requestLogs.length, 1);
  assert.equal(cleanupCallCount, 2);
  assert.equal(state.scoreLockCleanupCount, 2);
});

test('different clientRequestId after deletion should follow business semantics', async () => {
  const { db } = createDeleteTournamentDb({
    tournament: null,
    requestLogs: [{
      tournamentId: 't_1',
      operatorOpenId: 'u_admin',
      clientRequestId: 'req_delete_old',
      status: 'deleted'
    }]
  });
  const { main } = loadMain(db);

  await assert.rejects(async () => {
    await main({
      tournamentId: 't_1',
      clientRequestId: 'req_delete_new'
    });
  }, /(赛事不存在|document does not exist|not found)/i);
});

test('response should expose deduped and clientRequestId markers on retry', async () => {
  const { db } = createDeleteTournamentDb({
    tournament: null,
    requestLogs: [{
      tournamentId: 't_1',
      operatorOpenId: 'u_admin',
      clientRequestId: 'req_delete_1',
      status: 'deleted'
    }]
  });
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    clientRequestId: 'req_delete_1'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'TOURNAMENT_DELETED');
  assert.equal(result.state, 'deduped');
  assert.equal(result.clientRequestId, 'req_delete_1');
  assert.equal(result.deduped, true);
  assert.equal(result.alreadyDeleted, true);
  assert.deepEqual(result.data, {
    clientRequestId: 'req_delete_1',
    deduped: true,
    alreadyDeleted: true
  });
});
