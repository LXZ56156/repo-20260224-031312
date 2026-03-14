const test = require('node:test');
const assert = require('node:assert/strict');

const pageTournamentSync = require('../miniprogram/core/pageTournamentSync');
const tournamentSync = require('../miniprogram/core/tournamentSync');

function createContext(methods) {
  const applied = [];
  const patches = [];
  const ctx = {
    data: { tournamentId: 't_1' },
    setData(patch) {
      patches.push(patch);
      this.data = { ...this.data, ...(patch || {}) };
    },
    applyTournament(doc, meta) {
      applied.push({ doc, meta });
    },
    _applied: applied,
    _patches: patches
  };
  Object.assign(ctx, methods);
  pageTournamentSync.initTournamentSync(ctx);
  return ctx;
}

test('pageTournamentSync handles remote, cached and error fetch states through one contract', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;
  const methods = pageTournamentSync.createTournamentSyncMethods({
    buildRemoteState() {
      return { loadError: false, showStaleSyncHint: false, sourceTag: 'remote' };
    },
    buildCachedState() {
      return { loadError: false, showStaleSyncHint: true, sourceTag: 'cache' };
    },
    buildLoadErrorState() {
      return { loadError: true, showStaleSyncHint: false, sourceTag: 'error' };
    }
  });
  const ctx = createContext(methods);

  try {
    tournamentSync.fetchTournament = async () => ({
      ok: true,
      source: 'remote',
      doc: { _id: 't_1' }
    });
    let doc = await ctx.fetchTournament('t_1');
    assert.equal(doc._id, 't_1');
    assert.equal(ctx.data.sourceTag, 'remote');
    assert.deepEqual(ctx._applied.pop(), {
      doc: { _id: 't_1' },
      meta: { requestSeq: 1, source: 'remote', tournamentId: 't_1' }
    });

    tournamentSync.fetchTournament = async () => ({
      ok: false,
      errorType: 'network',
      cachedDoc: { _id: 't_1', updatedAt: '2026-03-10T10:00:00.000Z' },
      cachedAt: Date.parse('2026-03-10T10:05:00.000Z')
    });
    doc = await ctx.fetchTournament('t_1');
    assert.equal(doc._id, 't_1');
    assert.equal(ctx.data.sourceTag, 'cache');
    assert.equal(ctx.data.syncUsingCache, true);
    assert.equal(ctx.data.syncCachedAt, Date.parse('2026-03-10T10:05:00.000Z'));
    assert.equal(ctx.data.syncStatusVisible, true);
    assert.deepEqual(ctx._applied.pop(), {
      doc: { _id: 't_1', updatedAt: '2026-03-10T10:00:00.000Z' },
      meta: { requestSeq: 2, source: 'cache', tournamentId: 't_1' }
    });

    tournamentSync.fetchTournament = async () => ({
      ok: false,
      errorType: 'network',
      cachedDoc: null
    });
    doc = await ctx.fetchTournament('t_1');
    assert.equal(doc && doc._id, 't_1');
    assert.equal(ctx.data.loadError, false);
    assert.equal(ctx.data.showStaleSyncHint, true);
    assert.equal(ctx.data.sourceTag, 'cache');
    assert.equal(ctx.data.syncRefreshing, false);
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
  }
});

test('pageTournamentSync ignores stale watch callbacks after restarting a watch', () => {
  const originalStartWatch = tournamentSync.startWatch;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  const callbacks = [];

  try {
    tournamentSync.startWatch = (_page, _tid, onDoc) => {
      callbacks.push(onDoc);
    };

    ctx.startWatch('t_1');
    ctx.startWatch('t_1');

    callbacks[0]({ _id: 't_1', updatedAt: '2026-03-14T10:00:00.000Z' });
    callbacks[1]({ _id: 't_1', updatedAt: '2026-03-14T10:05:00.000Z' });

    assert.deepEqual(ctx._applied, [{
      doc: { _id: 't_1', updatedAt: '2026-03-14T10:05:00.000Z' },
      meta: { watchGen: 2, source: 'watch', tournamentId: 't_1' }
    }]);
  } finally {
    tournamentSync.startWatch = originalStartWatch;
  }
});

test('pageTournamentSync keeps polling fallback state when watch degrades from realtime', () => {
  const originalStartWatch = tournamentSync.startWatch;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);

  try {
    tournamentSync.startWatch = (_page, _tid, _onDoc, onError) => {
      onError({ __watchFallback: true, __watchSource: 'realtime', __watchType: 'network' });
    };

    ctx.startWatch('t_1');

    assert.equal(ctx.data.syncPollingFallback, true);
    assert.equal(ctx.data.syncStatusVisible, true);
    assert.match(ctx.data.syncStatusText, /轮询/);
  } finally {
    tournamentSync.startWatch = originalStartWatch;
  }
});

test('pageTournamentSync clears polling fallback after realtime recovery delivers data again', () => {
  const originalStartWatch = tournamentSync.startWatch;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  let onData = null;
  let onError = null;

  try {
    tournamentSync.startWatch = (_page, _tid, nextOnData, nextOnError) => {
      onData = nextOnData;
      onError = nextOnError;
    };

    ctx.startWatch('t_1');
    onError({ __watchFallback: true, __watchSource: 'realtime', __watchType: 'network' });
    assert.equal(ctx.data.syncPollingFallback, true);

    onData({ _id: 't_1', updatedAt: '2026-03-11T09:00:00.000Z' }, { source: 'realtime_recovered' });
    assert.equal(ctx.data.syncPollingFallback, false);
    assert.equal(ctx.data.syncStatusVisible, false);
  } finally {
    tournamentSync.startWatch = originalStartWatch;
  }
});

test('pageTournamentSync refreshes automatically when network reconnects', () => {
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  let fetchCalls = 0;
  let watchCalls = 0;

  ctx.fetchTournament = async () => {
    fetchCalls += 1;
    return null;
  };
  ctx.startWatch = () => {
    watchCalls += 1;
  };
  ctx.watcher = null;
  ctx.data.networkOffline = true;

  ctx.handleNetworkChange(false);

  assert.equal(fetchCalls, 1);
  assert.equal(watchCalls, 1);
  assert.equal(ctx.data.networkOffline, false);
});

test('pageTournamentSync restarts watch when stale watcher instance is no longer active', () => {
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  let fetchCalls = 0;
  let watchCalls = 0;

  ctx.fetchTournament = async () => {
    fetchCalls += 1;
    return null;
  };
  ctx.startWatch = () => {
    watchCalls += 1;
  };
  ctx.watcher = {
    close() {},
    isActive() {
      return false;
    }
  };
  ctx.data.networkOffline = true;

  ctx.handleNetworkChange(false);

  assert.equal(fetchCalls, 1);
  assert.equal(watchCalls, 1);
});

test('pageTournamentSync rejects older watch data after a newer tournament version is already applied', () => {
  const originalStartWatch = tournamentSync.startWatch;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  let onData = null;

  try {
    tournamentSync.startWatch = (_page, _tid, nextOnData) => {
      onData = nextOnData;
    };

    ctx.setData({ tournament: { _id: 't_1', version: 5, updatedAt: '2026-03-13T12:00:00.000Z' } });
    ctx.startWatch('t_1');
    onData({ _id: 't_1', version: 4, updatedAt: '2026-03-13T11:59:00.000Z' }, { source: 'realtime_recovered' });

    assert.deepEqual(ctx._applied, []);
  } finally {
    tournamentSync.startWatch = originalStartWatch;
  }
});
