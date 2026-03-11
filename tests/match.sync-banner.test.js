const test = require('node:test');
const assert = require('node:assert/strict');

const matchPagePath = require.resolve('../miniprogram/pages/match/index.js');

function loadMatchPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[matchPagePath];
  require(matchPagePath);
  global.Page = originalPage;
  return definition;
}

function createPageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('match page reuses unified sync banner for offline state changes', () => {
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  let onNetworkChange = null;

  global.wx = {
    showToast() {},
    showLoading() {},
    hideLoading() {},
    navigateBack() {},
    redirectTo() {},
    navigateTo() {},
    getStorageSync() {
      return undefined;
    },
    setStorageSync() {},
    removeStorageSync() {}
  };
  global.getApp = () => ({
    globalData: {
      openid: 'player_1',
      networkOffline: true
    },
    subscribeNetworkChange(handler) {
      onNetworkChange = handler;
      return () => {
        onNetworkChange = null;
      };
    }
  });

  try {
    const definition = loadMatchPageDefinition();
    const ctx = createPageContext(definition);
    ctx.fetchTournament = (tid) => {
      ctx.lastFetchId = tid;
    };
    ctx.startWatch = (tid) => {
      ctx.lastWatchId = tid;
      ctx.watcher = { close() {} };
    };

    ctx.onLoad({ tournamentId: 't_1', roundIndex: 0, matchIndex: 0 });

    assert.equal(ctx.lastFetchId, 't_1');
    assert.equal(ctx.lastWatchId, 't_1');
    assert.equal(ctx.data.syncStatusVisible, true);
    assert.match(ctx.data.syncStatusText, /离线/);
    assert.equal(ctx.data.syncStatusTone, 'warning');

    onNetworkChange(false);
    assert.equal(ctx.data.networkOffline, false);
    assert.equal(ctx.data.syncStatusVisible, false);
  } finally {
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[matchPagePath];
  }
});
