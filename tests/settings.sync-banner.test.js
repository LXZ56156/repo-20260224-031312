const test = require('node:test');
const assert = require('node:assert/strict');

const settingsPagePath = require.resolve('../miniprogram/pages/settings/index.js');

function loadSettingsPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[settingsPagePath];
  require(settingsPagePath);
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

test('settings page uses unified sync banner for offline state changes', () => {
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  let onNetworkChange = null;

  global.wx = {
    getStorageSync() {
      return undefined;
    },
    setStorageSync() {},
    removeStorageSync() {}
  };
  global.getApp = () => ({
    globalData: {
      openid: 'u_1',
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
    const definition = loadSettingsPageDefinition();
    const ctx = createPageContext(definition);
    ctx.fetchTournament = (tid) => {
      ctx.lastFetchId = tid;
    };
    ctx.startWatch = (tid) => {
      ctx.lastWatchId = tid;
      ctx.watcher = { close() {} };
    };

    ctx.onLoad({ tournamentId: 't_1' });

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
    delete require.cache[settingsPagePath];
  }
});
