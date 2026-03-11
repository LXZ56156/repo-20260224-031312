const test = require('node:test');
const assert = require('node:assert/strict');

const tournamentSync = require('../miniprogram/core/tournamentSync');

const rankingPagePath = require.resolve('../miniprogram/pages/ranking/index.js');

function loadRankingPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[rankingPagePath];
  require(rankingPagePath);
  global.Page = originalPage;
  return definition;
}

function createRankingPageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('ranking page shows cached stale banner under offline fallback and keeps network subscription in sync', async () => {
  const originalGetApp = global.getApp;
  const originalFetchTournament = tournamentSync.fetchTournament;
  const originalStartWatch = tournamentSync.startWatch;
  let listener = null;
  let unsubscribed = false;

  global.getApp = () => ({
    globalData: { networkOffline: true },
    subscribeNetworkChange(fn) {
      listener = fn;
      return () => {
        unsubscribed = true;
      };
    }
  });

  tournamentSync.fetchTournament = async () => ({
    ok: false,
    errorType: 'network',
    errorMessage: 'timeout',
    cachedAt: Date.parse('2026-03-10T10:05:00.000Z'),
    cachedDoc: {
      _id: 't_cached',
      name: '缓存赛事',
      status: 'running',
      mode: 'multi_rotate',
      updatedAt: '2026-03-10T10:00:00.000Z',
      players: [],
      rounds: []
    }
  });
  tournamentSync.startWatch = () => {};

  try {
    const definition = loadRankingPageDefinition();
    const ctx = createRankingPageContext(definition);

    ctx.onLoad({ tournamentId: 't_cached' });
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(ctx.data.networkOffline, true);
    assert.equal(ctx.data.showStaleSyncHint, true);
    assert.equal(ctx.data.syncUsingCache, true);
    assert.equal(ctx.data.syncStatusVisible, true);
    assert.match(ctx.data.syncStatusText, /缓存/);
    assert.match(ctx.data.syncStatusMeta, /缓存于/);

    listener(false);
    assert.equal(ctx.data.networkOffline, false);
    assert.equal(ctx.data.syncStatusVisible, true);
    assert.doesNotMatch(ctx.data.syncStatusText, /离线/);

    ctx.onUnload();
    assert.equal(unsubscribed, true);
  } finally {
    global.getApp = originalGetApp;
    tournamentSync.fetchTournament = originalFetchTournament;
    tournamentSync.startWatch = originalStartWatch;
    delete require.cache[rankingPagePath];
  }
});
