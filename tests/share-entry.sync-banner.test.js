const test = require('node:test');
const assert = require('node:assert/strict');

const shareEntryPagePath = require.resolve('../miniprogram/pages/share-entry/index.js');

function loadShareEntryPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[shareEntryPagePath];
  require(shareEntryPagePath);
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

test('share-entry page reuses unified sync banner for offline state changes', () => {
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
      openid: 'viewer_1',
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
    const definition = loadShareEntryPageDefinition();
    const ctx = createPageContext(definition);
    ctx.fetchTournament = (tid) => {
      ctx.lastFetchId = tid;
    };
    ctx.startWatch = (tid) => {
      ctx.lastWatchId = tid;
      ctx.watcher = { close() {} };
    };

    ctx.onLoad({ tournamentId: 't_1', intent: 'view' });

    assert.equal(ctx.lastFetchId, 't_1');
    assert.equal(ctx.lastWatchId, 't_1');
    assert.equal(ctx.data.identityPending, false);
    assert.equal(ctx.data.syncStatusVisible, true);
    assert.match(ctx.data.syncStatusText, /离线/);

    onNetworkChange(false);
    assert.equal(ctx.data.networkOffline, false);
    assert.equal(ctx.data.syncStatusVisible, false);
  } finally {
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[shareEntryPagePath];
  }
});
