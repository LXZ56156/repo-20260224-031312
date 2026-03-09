const test = require('node:test');
const assert = require('node:assert/strict');

const storage = require('../miniprogram/core/storage');
const tournamentSync = require('../miniprogram/core/tournamentSync');

function buildWx(storageState, shouldFailRef, remoteDoc) {
  return {
    getStorageSync(key) {
      return storageState[key];
    },
    setStorageSync(key, value) {
      storageState[key] = value;
    },
    removeStorageSync(key) {
      delete storageState[key];
    },
    cloud: {
      database() {
        return {
          collection(name) {
            assert.equal(name, 'tournaments');
            return {
              doc(id) {
                assert.equal(id, 't_1');
                return {
                  async get() {
                    if (shouldFailRef.value) throw new Error('request:fail timeout');
                    return { data: remoteDoc };
                  }
                };
              }
            };
          }
        };
      }
    }
  };
}

test('tournamentSync.fetchTournament persists remote doc and falls back to cached doc on failure', async () => {
  const originalWx = global.wx;
  const storageState = {};
  const shouldFailRef = { value: false };
  const remoteDoc = {
    _id: 't_1',
    name: 'Remote Tournament',
    status: 'running',
    players: [],
    rounds: []
  };

  global.wx = buildWx(storageState, shouldFailRef, remoteDoc);

  try {
    const success = await tournamentSync.fetchTournament('t_1');
    assert.equal(success.ok, true);
    assert.equal(success.source, 'remote');
    assert.deepEqual(success.doc, remoteDoc);
    assert.deepEqual(storage.getLocalTournamentCache('t_1'), remoteDoc);

    shouldFailRef.value = true;
    const fallback = await tournamentSync.fetchTournament('t_1');
    assert.equal(fallback.ok, false);
    assert.equal(fallback.errorType, 'timeout');
    assert.deepEqual(fallback.cachedDoc, remoteDoc);
  } finally {
    global.wx = originalWx;
  }
});
