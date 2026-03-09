const test = require('node:test');
const assert = require('node:assert/strict');

const tournamentSync = require('../miniprogram/core/tournamentSync');

function buildWx(storageState, getImpl) {
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
                  get: getImpl
                };
              }
            };
          }
        };
      }
    }
  };
}

test('tournamentSync.fetchTournament does not use stale cache for not_found or param errors', async () => {
  const originalWx = global.wx;
  const storageState = {
    local_tournament_cache_t_1: {
      _id: 't_1',
      name: 'Cached Tournament'
    }
  };

  try {
    global.wx = buildWx(storageState, async () => ({ data: null }));
    const missing = await tournamentSync.fetchTournament('t_1');
    assert.equal(missing.ok, false);
    assert.equal(missing.errorType, 'not_found');
    assert.equal(missing.errorMessage, '未找到赛事');
    assert.equal(missing.cachedDoc, null);

    global.wx = buildWx(storageState, async () => {
      throw new Error('document does not exist');
    });
    const thrownNotFound = await tournamentSync.fetchTournament('t_1');
    assert.equal(thrownNotFound.ok, false);
    assert.equal(thrownNotFound.errorType, 'not_found');
    assert.equal(thrownNotFound.cachedDoc, null);

    const param = await tournamentSync.fetchTournament('');
    assert.equal(param.ok, false);
    assert.equal(param.errorType, 'param');
    assert.equal(param.cachedDoc, null);
  } finally {
    global.wx = originalWx;
  }
});

test('tournamentSync.fetchTournament keeps cached fallback for non-not-found get failures', async () => {
  const originalWx = global.wx;
  const storageState = {
    local_tournament_cache_t_1: {
      _id: 't_1',
      name: 'Cached Tournament'
    }
  };

  try {
    global.wx = buildWx(storageState, async () => {
      throw new Error('document.get:fail permission denied');
    });
    const permissionDenied = await tournamentSync.fetchTournament('t_1');
    assert.equal(permissionDenied.ok, false);
    assert.equal(permissionDenied.errorType, 'unknown');
    assert.deepEqual(permissionDenied.cachedDoc, storageState.local_tournament_cache_t_1);

    global.wx = buildWx(storageState, async () => {
      throw new Error('cloud env invalid');
    });
    const invalidEnv = await tournamentSync.fetchTournament('t_1');
    assert.equal(invalidEnv.ok, false);
    assert.equal(invalidEnv.errorType, 'unknown');
    assert.deepEqual(invalidEnv.cachedDoc, storageState.local_tournament_cache_t_1);
  } finally {
    global.wx = originalWx;
  }
});
