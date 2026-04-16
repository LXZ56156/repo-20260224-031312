const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/setReferee/index.js');
const commonPath = require.resolve('../cloudfunctions/setReferee/lib/common.js');

function buildTournament() {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'draft',
    version: 4,
    refereeId: '',
    players: [
      { id: 'u_admin', name: '管理员' },
      { id: 'p_ref', name: '裁判候选' }
    ]
  };
}

function loadMain(db) {
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
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(mainPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('setReferee persists tournament referee with optimistic lock', async () => {
  let writtenData = null;
  const db = {
    command: {
      inc(value) {
        return { $inc: value };
      }
    },
    serverDate() {
      return { $serverDate: true };
    },
    async runTransaction(handler) {
      return handler({
        collection(name) {
          assert.equal(name, 'tournaments');
          return {
            doc(id) {
              assert.equal(id, 't_1');
              return {
                async get() {
                  return { data: buildTournament() };
                }
              };
            },
            where(query) {
              assert.deepEqual(query, { _id: 't_1', version: 4 });
              return {
                async update(payload) {
                  writtenData = payload.data;
                  return { stats: { updated: 1 } };
                }
              };
            }
          };
        }
      });
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    refereeId: 'p_ref'
  });

  assert.deepEqual(result, {
    ok: true,
    code: 'REFEREE_UPDATED',
    message: '已更新裁判',
    state: 'updated',
    traceId: '',
    data: {}
  });
  assert.equal(writtenData.refereeId, 'p_ref');
});

test('setReferee returns structured invalid result for missing tournamentId', async () => {
  const db = {
    command: {
      inc(value) {
        return { $inc: value };
      }
    },
    serverDate() {
      return { $serverDate: true };
    },
    async runTransaction() {
      throw new Error('should not start transaction');
    }
  };
  const { main } = loadMain(db);

  const result = await main({ refereeId: 'p_ref', __traceId: 'trace-ref-missing-id' });
  assert.deepEqual(result, {
    ok: false,
    code: 'TOURNAMENT_ID_REQUIRED',
    message: '缺少 tournamentId',
    state: 'invalid',
    traceId: 'trace-ref-missing-id',
    data: {}
  });
});

test('setReferee returns structured invalid result when referee is not a current participant', async () => {
  const db = {
    command: {
      inc(value) {
        return { $inc: value };
      }
    },
    serverDate() {
      return { $serverDate: true };
    },
    async runTransaction(handler) {
      return handler({
        collection() {
          return {
            doc() {
              return {
                async get() {
                  return { data: buildTournament() };
                }
              };
            },
            where() {
              return {
                async update() {
                  return { stats: { updated: 1 } };
                }
              };
            }
          };
        }
      });
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    refereeId: 'p_unknown',
    __traceId: 'trace-ref-invalid'
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'REFEREE_INVALID',
    message: '裁判必须是当前参赛成员',
    state: 'invalid',
    traceId: 'trace-ref-invalid',
    data: {}
  });
});
