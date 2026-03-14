const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/resetTournament/index.js');
const commonPath = require.resolve('../cloudfunctions/resetTournament/lib/common.js');
const modePath = require.resolve('../cloudfunctions/resetTournament/lib/mode.js');

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
  delete require.cache[modePath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk;
    if (request === './logic') return stubs.logic;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(mainPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('resetTournament index writes reset patch and triggers lock cleanup', async () => {
  let writtenData = null;
  let cleanupCalled = false;
  const db = {
    command: {
      inc(value) {
        return { $inc: value };
      },
      remove() {
        return { $remove: true };
      }
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
              async remove() {}
            };
          }
        };
      }
      assert.equal(name, 'tournaments');
      return {
        doc(id) {
          assert.equal(id, 't_1');
          return {
            async get() {
              return {
                data: {
                  _id: 't_1',
                  creatorId: 'u_admin',
                  version: 5,
                  mode: 'double',
                  players: []
                }
              };
            }
          };
        },
        where(query) {
          assert.deepEqual(query, { _id: 't_1', version: 5 });
          return {
            async update(payload) {
              writtenData = payload.data;
              return { stats: { updated: 1 } };
            }
          };
        }
      };
    }
  };
  const { main } = loadMain(db, {
    logic: {
      buildResetTournamentPatch() {
        return { status: 'draft', rounds: [], rankings: [] };
      },
      buildResetTournamentRemovals(removeToken) {
        return { fairness: removeToken };
      },
      async cleanupScoreLocksBestEffort(cleanupFn) {
        cleanupCalled = true;
        await cleanupFn();
      }
    }
  });

  const result = await main({ tournamentId: 't_1' });

  assert.deepEqual(result, {
    ok: true,
    code: 'TOURNAMENT_RESET',
    message: '已重置赛事',
    state: 'reset',
    traceId: '',
    data: {}
  });
  assert.equal(writtenData.status, 'draft');
  assert.deepEqual(writtenData.fairness, { $remove: true });
  assert.equal(cleanupCalled, true);
});
