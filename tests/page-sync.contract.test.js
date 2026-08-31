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
    assert.equal(ctx.data.syncStatusVisible, false);
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

test('pageTournamentSync clears an applied tournament after confirmed not_found', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  const tournament = {
    _id: 't_1',
    version: 4,
    updatedAt: '2026-03-14T10:00:00.000Z'
  };
  let closed = 0;

  try {
    ctx.data.tournament = tournament;
    ctx._latestTournament = tournament;
    ctx._lastAppliedDocTs = Date.parse(tournament.updatedAt);
    ctx._lastAppliedTournamentId = 't_1';
    ctx._watchTournamentId = 't_1';
    ctx.watcher = {
      close() {
        closed += 1;
      }
    };
    tournamentSync.fetchTournament = async () => ({
      ok: false,
      errorType: 'not_found',
      cachedDoc: null
    });

    await ctx.fetchTournament('t_1');

    assert.equal(ctx.data.tournament, null);
    assert.equal(ctx._latestTournament, null);
    assert.equal(ctx._lastAppliedDocTs, 0);
    assert.equal(ctx._lastAppliedTournamentId, '');
    assert.equal(ctx.data.loadError, true);
    assert.equal(ctx.watcher, null);
    assert.equal(closed, 1);
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
  }
});

test('pageTournamentSync treats watch not_found as terminal and drops an older pending fetch', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;
  const originalStartWatch = tournamentSync.startWatch;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  const tournament = { _id: 't_1', version: 2, updatedAt: '2026-03-14T10:00:00.000Z' };
  let closed = 0;
  let resolveFetch = null;

  try {
    ctx.data.tournament = tournament;
    ctx._latestTournament = tournament;
    tournamentSync.fetchTournament = () => new Promise((resolve) => {
      resolveFetch = resolve;
    });
    tournamentSync.startWatch = (page, tournamentId, _onData, onError) => {
      page.watcher = {
        close() {
          closed += 1;
        }
      };
      page._watchTournamentId = tournamentId;
      onError({ __watchType: 'not_found', __watchSource: 'realtime' });
    };

    const pendingFetch = ctx.fetchTournament('t_1');
    ctx.startWatch('t_1');
    resolveFetch({
      ok: true,
      source: 'remote',
      doc: { _id: 't_1', version: 3, updatedAt: '2026-03-14T10:01:00.000Z' }
    });
    await pendingFetch;

    assert.equal(ctx.data.tournament, null);
    assert.equal(ctx.data.loadError, true);
    assert.equal(ctx.watcher, null);
    assert.equal(closed, 1);
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    tournamentSync.startWatch = originalStartWatch;
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

test('pageTournamentSync ignores repeated watch data with equal version and timestamp', () => {
  const originalStartWatch = tournamentSync.startWatch;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  let onData = null;

  try {
    tournamentSync.startWatch = (_page, _tid, nextOnData) => {
      onData = nextOnData;
    };

    ctx.startWatch('t_1');
    const doc = {
      _id: 't_1',
      version: 3,
      updatedAt: '2026-03-14T10:00:00.000Z'
    };
    onData(doc, { source: 'realtime' });
    onData({ ...doc }, { source: 'realtime' });

    assert.equal(ctx._applied.length, 1);
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

test('pageTournamentSync keeps fallback banner hidden for devtools silent polling events', () => {
  const originalStartWatch = tournamentSync.startWatch;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  let onData = null;

  try {
    tournamentSync.startWatch = (_page, _tid, nextOnData) => {
      onData = nextOnData;
    };

    ctx.startWatch('t_1');
    onData({ _id: 't_1', updatedAt: '2026-03-11T09:00:00.000Z' }, { source: 'devtools_polling' });

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

test('pageTournamentSync keeps healthy refresh banner silent while fetch is in flight', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  let resolveFetch = null;

  try {
    tournamentSync.fetchTournament = async () => new Promise((resolve) => {
      resolveFetch = resolve;
    });

    const pending = ctx.fetchTournament('t_1');

    assert.equal(ctx.data.syncRefreshing, true);
    assert.equal(ctx.data.syncStatusVisible, false);
    assert.equal(ctx.data.syncStatusText, '');

    resolveFetch({
      ok: true,
      source: 'remote',
      doc: {
        _id: 't_1',
        updatedAt: '2026-03-16T10:00:00.000Z'
      }
    });

    await pending;
    assert.equal(ctx.data.syncRefreshing, false);
    assert.equal(ctx.data.syncStatusVisible, false);
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
  }
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

test('app installs network tracking before login resolves and keeps early page subscribers', async () => {
  const appPath = require.resolve('../miniprogram/app.js');
  const auth = require('../miniprogram/core/auth');
  const originalApp = global.App;
  const originalWx = global.wx;
  const originalLogin = auth.login;
  let appDefinition = null;
  let resolveLogin = null;
  let initialNetworkSuccess = null;
  let networkChange = null;

  global.App = (definition) => {
    appDefinition = definition;
  };
  global.wx = {
    cloud: { init() {} },
    getNetworkType({ success }) {
      initialNetworkSuccess = success;
    },
    onNetworkStatusChange(handler) {
      networkChange = handler;
    }
  };
  auth.login = () => new Promise((resolve) => {
    resolveLogin = resolve;
  });

  try {
    delete require.cache[appPath];
    require(appPath);
    const launchTask = appDefinition.onLaunch.call(appDefinition, {});
    const states = [];
    appDefinition.subscribeNetworkChange.call(appDefinition, (offline) => states.push(offline));

    initialNetworkSuccess({ networkType: 'none' });
    resolveLogin('u_1');
    await launchTask;
    networkChange({ isConnected: true });

    assert.deepEqual(states, [true, false]);
    assert.equal(appDefinition.globalData.openid, 'u_1');
  } finally {
    global.App = originalApp;
    global.wx = originalWx;
    auth.login = originalLogin;
    delete require.cache[appPath];
  }
});
