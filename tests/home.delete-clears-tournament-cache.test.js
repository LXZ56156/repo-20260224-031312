const test = require('node:test');
const assert = require('node:assert/strict');

const storage = require('../miniprogram/core/storage');

const homePagePath = require.resolve('../miniprogram/pages/home/index.js');

function loadHomePageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[homePagePath];
  require(homePagePath);
  global.Page = originalPage;
  return definition;
}

function createHomePageContext(definition) {
  const ctx = {
    data: {
      items: [{
        _id: 't_1',
        creatorId: 'user_1',
        status: 'running'
      }]
    },
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx.clearLastFailedAction = () => {};
  ctx.setLastFailedAction = () => {};
  ctx.handleWriteError = () => {};
  ctx.loadRecents = async () => {
    ctx.loadRecentsCalled = (ctx.loadRecentsCalled || 0) + 1;
  };
  return ctx;
}

test('home delete clears local tournament cache for local-only deletion', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalRemoveRecentTournamentId = storage.removeRecentTournamentId;
  const originalRemoveLocalCompletedTournamentSnapshot = storage.removeLocalCompletedTournamentSnapshot;
  const originalRemoveLocalTournamentCache = storage.removeLocalTournamentCache;

  const removed = [];
  const toastCalls = [];

  global.getApp = () => ({ globalData: { openid: 'user_1' } });
  global.wx = {
    showToast(options) {
      toastCalls.push(options);
    }
  };

  try {
    const definition = loadHomePageDefinition();
    const ctx = createHomePageContext(definition);
    storage.removeRecentTournamentId = (id) => removed.push(`recent:${id}`);
    storage.removeLocalCompletedTournamentSnapshot = (id) => removed.push(`snapshot:${id}`);
    storage.removeLocalTournamentCache = (id) => removed.push(`cache:${id}`);

    await ctx.onDeleteTap({ currentTarget: { dataset: { id: 't_1' } } });

    assert.deepEqual(removed, ['recent:t_1', 'snapshot:t_1', 'cache:t_1']);
    assert.equal(ctx.loadRecentsCalled, 1);
    assert.deepEqual(toastCalls, [{ title: '已删除', icon: 'success' }]);
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    storage.removeRecentTournamentId = originalRemoveRecentTournamentId;
    storage.removeLocalCompletedTournamentSnapshot = originalRemoveLocalCompletedTournamentSnapshot;
    storage.removeLocalTournamentCache = originalRemoveLocalTournamentCache;
    delete require.cache[homePagePath];
  }
});

test('home delete no longer exposes cloud deletion and only clears local records', async () => {
  const originalWx = global.wx;
  const originalRemoveRecentTournamentId = storage.removeRecentTournamentId;
  const originalRemoveLocalCompletedTournamentSnapshot = storage.removeLocalCompletedTournamentSnapshot;
  const originalRemoveLocalTournamentCache = storage.removeLocalTournamentCache;

  const removed = [];
  const toastCalls = [];
  global.wx = {
    showToast(options) {
      toastCalls.push(options);
    }
  };

  try {
    const definition = loadHomePageDefinition();
    const ctx = createHomePageContext(definition);
    storage.removeRecentTournamentId = (id) => removed.push(`recent:${id}`);
    storage.removeLocalCompletedTournamentSnapshot = (id) => removed.push(`snapshot:${id}`);
    storage.removeLocalTournamentCache = (id) => removed.push(`cache:${id}`);

    await ctx.onDeleteTap({ currentTarget: { dataset: { id: 't_1' } } });

    assert.deepEqual(removed, ['recent:t_1', 'snapshot:t_1', 'cache:t_1']);
    assert.equal(ctx.loadRecentsCalled, 1);
    assert.deepEqual(toastCalls, [{ title: '已删除', icon: 'success' }]);
  } finally {
    global.wx = originalWx;
    storage.removeRecentTournamentId = originalRemoveRecentTournamentId;
    storage.removeLocalCompletedTournamentSnapshot = originalRemoveLocalCompletedTournamentSnapshot;
    storage.removeLocalTournamentCache = originalRemoveLocalTournamentCache;
    delete require.cache[homePagePath];
  }
});
