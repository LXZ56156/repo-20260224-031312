const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/deleteTournament/index.js');
const commonPath = require.resolve('../cloudfunctions/deleteTournament/lib/common.js');

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
    if (request === './logic') return stubs.logic;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(mainPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('deleteTournament index removes tournament and triggers lock cleanup', async () => {
  let removed = false;
  let cleanupCalled = false;
  const db = {
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
              return { data: { _id: 't_1', creatorId: 'u_admin' } };
            }
          };
        }
      };
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
                  return { data: { _id: 't_1', creatorId: 'u_admin' } };
                },
                async remove() {
                  removed = true;
                }
              };
            }
          };
        }
      });
    }
  };
  const { main } = loadMain(db, {
    logic: {
      async cleanupScoreLocksBestEffort(cleanupFn) {
        cleanupCalled = true;
        await cleanupFn();
      }
    }
  });

  const result = await main({ tournamentId: 't_1' });

  assert.deepEqual(result, { ok: true });
  assert.equal(removed, true);
  assert.equal(cleanupCalled, true);
});
