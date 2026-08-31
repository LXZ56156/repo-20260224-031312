const test = require('node:test');
const assert = require('node:assert/strict');

const tournamentSync = require('../miniprogram/core/tournamentSync');
const storage = require('../miniprogram/core/storage');
const watchUtil = require('../miniprogram/sync/watch');

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
  const originalRemoveLocalTournamentCache = storage.removeLocalTournamentCache;
  const originalRemoveLocalCompletedTournamentSnapshot = storage.removeLocalCompletedTournamentSnapshot;
  const removed = [];
  const storageState = {
    local_tournament_cache_t_1: {
      _id: 't_1',
      name: 'Cached Tournament'
    }
  };

  try {
    storage.removeLocalTournamentCache = (id) => removed.push(`cache:${id}`);
    storage.removeLocalCompletedTournamentSnapshot = (id) => removed.push(`snapshot:${id}`);
    global.wx = buildWx(storageState, async () => ({ data: null }));
    const missing = await tournamentSync.fetchTournament('t_1');
    assert.equal(missing.ok, false);
    assert.equal(missing.errorType, 'not_found');
    assert.equal(missing.errorMessage, '未找到赛事');
    assert.equal(missing.cachedDoc, null);
    assert.deepEqual(removed, ['cache:t_1', 'snapshot:t_1']);

    global.wx = buildWx(storageState, async () => {
      throw new Error('document.get:fail requested document does not exist');
    });
    const thrownNotFound = await tournamentSync.fetchTournament('t_1');
    assert.equal(thrownNotFound.ok, false);
    assert.equal(thrownNotFound.errorType, 'not_found');
    assert.equal(thrownNotFound.cachedDoc, null);
    assert.deepEqual(removed, [
      'cache:t_1',
      'snapshot:t_1',
      'cache:t_1',
      'snapshot:t_1'
    ]);

    const param = await tournamentSync.fetchTournament('');
    assert.equal(param.ok, false);
    assert.equal(param.errorType, 'param');
    assert.equal(param.cachedDoc, null);
  } finally {
    global.wx = originalWx;
    storage.removeLocalTournamentCache = originalRemoveLocalTournamentCache;
    storage.removeLocalCompletedTournamentSnapshot = originalRemoveLocalCompletedTournamentSnapshot;
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

    global.wx = buildWx(storageState, async () => {
      throw new Error('ResourceNotFound: collection not exists');
    });
    const missingCollection = await tournamentSync.fetchTournament('t_1');
    assert.equal(missingCollection.errorType, 'unknown');
    assert.deepEqual(missingCollection.cachedDoc, storageState.local_tournament_cache_t_1);
  } finally {
    global.wx = originalWx;
  }
});

test('tournamentSync.persistTournamentDoc skips an equal cached document', () => {
  const originalGetLocalTournamentCache = storage.getLocalTournamentCache;
  const originalSetLocalTournamentCache = storage.setLocalTournamentCache;
  const originalUpsertLocalCompletedTournamentSnapshot = storage.upsertLocalCompletedTournamentSnapshot;
  const cachedDoc = { _id: 't_1', version: 3, updatedAt: '2026-03-10T10:00:00.000Z' };
  const writes = [];

  try {
    storage.getLocalTournamentCache = () => cachedDoc;
    storage.setLocalTournamentCache = () => writes.push('cache');
    storage.upsertLocalCompletedTournamentSnapshot = () => writes.push('snapshot');

    tournamentSync.persistTournamentDoc({ ...cachedDoc });
    assert.deepEqual(writes, []);

    tournamentSync.persistTournamentDoc({
      ...cachedDoc,
      version: 4,
      updatedAt: '2026-03-10T10:01:00.000Z'
    });
    assert.deepEqual(writes, ['cache', 'snapshot']);
  } finally {
    storage.getLocalTournamentCache = originalGetLocalTournamentCache;
    storage.setLocalTournamentCache = originalSetLocalTournamentCache;
    storage.upsertLocalCompletedTournamentSnapshot = originalUpsertLocalCompletedTournamentSnapshot;
  }
});

test('tournamentSync clears local cache when a watcher reports not_found', () => {
  const originalWatchTournament = watchUtil.watchTournament;
  const originalRemoveLocalTournamentCache = storage.removeLocalTournamentCache;
  const originalRemoveLocalCompletedTournamentSnapshot = storage.removeLocalCompletedTournamentSnapshot;
  const removed = [];
  const ctx = {};

  try {
    storage.removeLocalTournamentCache = (id) => removed.push(`cache:${id}`);
    storage.removeLocalCompletedTournamentSnapshot = (id) => removed.push(`snapshot:${id}`);
    watchUtil.watchTournament = (_tournamentId, _onData, onError) => {
      onError({ __watchType: 'not_found' });
      return { close() {} };
    };

    tournamentSync.startWatch(ctx, 't_1', () => {}, () => {});

    assert.deepEqual(removed, ['cache:t_1', 'snapshot:t_1']);
  } finally {
    tournamentSync.closeWatcher(ctx);
    watchUtil.watchTournament = originalWatchTournament;
    storage.removeLocalTournamentCache = originalRemoveLocalTournamentCache;
    storage.removeLocalCompletedTournamentSnapshot = originalRemoveLocalCompletedTournamentSnapshot;
  }
});
