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
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update, cb) {
      this.data = { ...this.data, ...(update || {}) };
      if (typeof cb === 'function') cb();
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx._closeAllSwipe = () => {};
  ctx.clearLastFailedAction = () => {
    ctx.clearedLastFailedAction = true;
  };
  return ctx;
}

test('home falls back to local tournament cache when recents query fails', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalGetRecentTournamentIds = storage.getRecentTournamentIds;
  const originalGetLocalTournamentCacheInfo = storage.getLocalTournamentCacheInfo;
  let rejectRemote;

  global.getApp = () => ({ globalData: { openid: 'test_openid' } });
  global.wx = {
    cloud: {
      database() {
        return {
          command: {
            in(value) {
              return value;
            }
          },
          collection() {
            return {
              where() {
                return {
                  get() {
                    return new Promise((_resolve, reject) => {
                      rejectRemote = reject;
                    });
                  }
                };
              }
            };
          }
        };
      }
    },
    showToast() {}
  };

  try {
    const definition = loadHomePageDefinition();
    const ctx = createHomePageContext(definition);
    storage.getRecentTournamentIds = () => ['t_1', 't_2'];
    storage.getLocalTournamentCacheInfo = (id) => {
      if (id !== 't_1') return null;
      return {
        cachedAt: Date.parse('2026-03-10T10:05:00.000Z'),
        doc: {
          _id: 't_1',
          name: 'Cached Tournament',
          status: 'running',
          mode: 'multi_rotate',
          players: [{ id: 'p_1' }, { id: 'p_2' }],
          rounds: [],
          updatedAt: '2026-03-10T10:00:00.000Z'
        }
      };
    };

    const pending = ctx.loadRecents();
    assert.equal(ctx.data.loading, false);
    assert.equal(ctx.data.items[0].name, 'Cached Tournament');
    rejectRemote(new Error('network fail'));
    await pending;

    assert.equal(ctx.data.loadError, false);
    assert.equal(ctx.data.showStaleSyncHint, true);
    assert.equal(ctx.data.syncUsingCache, true);
    assert.equal(ctx.data.syncCachedAt, Date.parse('2026-03-10T10:05:00.000Z'));
    assert.equal(ctx.data.items.length, 1);
    assert.equal(ctx.data.items[0].name, 'Cached Tournament');
    assert.equal(ctx.clearedLastFailedAction, true);
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    storage.getRecentTournamentIds = originalGetRecentTournamentIds;
    storage.getLocalTournamentCacheInfo = originalGetLocalTournamentCacheInfo;
    delete require.cache[homePagePath];
  }
});

test('home refreshes local cache and keeps missing tournaments as removed', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalGetRecentTournamentIds = storage.getRecentTournamentIds;
  const originalGetLocalTournamentCacheInfo = storage.getLocalTournamentCacheInfo;
  const originalSetLocalTournamentCache = storage.setLocalTournamentCache;
  const originalRemoveLocalTournamentCache = storage.removeLocalTournamentCache;
  const originalRemoveLocalCompletedTournamentSnapshot = storage.removeLocalCompletedTournamentSnapshot;
  const originalUpsertLocalCompletedTournamentSnapshot = storage.upsertLocalCompletedTournamentSnapshot;

  const removed = [];
  const cached = [];
  const ids = ['t_1', 't_2'];

  global.getApp = () => ({ globalData: { openid: 'test_openid' } });
  global.wx = {
    cloud: {
      database() {
        return {
          command: {
            in(value) {
              return value;
            }
          },
          collection() {
            return {
              where(query) {
                return {
                  async get() {
                    return {
                      data: query._id.filter((id) => id !== 't_2').map((id) => ({
                        _id: id,
                        name: id,
                        status: 'running',
                        mode: 'multi_rotate',
                        players: [],
                        rounds: []
                      }))
                    };
                  }
                };
              }
            };
          }
        };
      }
    },
    showToast() {}
  };

  try {
    const definition = loadHomePageDefinition();
    const ctx = createHomePageContext(definition);
    storage.getRecentTournamentIds = () => ids;
    storage.getLocalTournamentCacheInfo = () => null;
    storage.setLocalTournamentCache = (id, doc) => {
      cached.push([id, doc.name]);
    };
    storage.removeLocalTournamentCache = (id) => {
      removed.push(`cache:${id}`);
    };
    storage.removeLocalCompletedTournamentSnapshot = (id) => {
      removed.push(`snapshot:${id}`);
    };
    storage.upsertLocalCompletedTournamentSnapshot = () => {};

    await ctx.loadRecents();

    assert.equal(ctx.data.loadError, false);
    assert.equal(ctx.data.showStaleSyncHint, false);
    assert.equal(ctx.data.items.length, 2);
    assert.equal(ctx.data.items[1].status, 'missing');
    assert.equal(ctx.data.items[1].name, '赛事已移除');
    assert.deepEqual(cached, [['t_1', 't_1']]);
    assert.deepEqual(removed, ['snapshot:t_2', 'cache:t_2']);
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    storage.getRecentTournamentIds = originalGetRecentTournamentIds;
    storage.getLocalTournamentCacheInfo = originalGetLocalTournamentCacheInfo;
    storage.setLocalTournamentCache = originalSetLocalTournamentCache;
    storage.removeLocalTournamentCache = originalRemoveLocalTournamentCache;
    storage.removeLocalCompletedTournamentSnapshot = originalRemoveLocalCompletedTournamentSnapshot;
    storage.upsertLocalCompletedTournamentSnapshot = originalUpsertLocalCompletedTournamentSnapshot;
    delete require.cache[homePagePath];
  }
});

test('home keeps loadError when no local cache is available after remote failure', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalGetRecentTournamentIds = storage.getRecentTournamentIds;
  const originalGetLocalTournamentCacheInfo = storage.getLocalTournamentCacheInfo;

  global.getApp = () => ({ globalData: { openid: 'test_openid' } });
  global.wx = {
    cloud: {
      database() {
        return {
          command: {
            in(value) {
              return value;
            }
          },
          collection() {
            return {
              where() {
                return {
                  async get() {
                    throw new Error('network fail');
                  }
                };
              }
            };
          }
        };
      }
    },
    showToast() {}
  };

  try {
    const definition = loadHomePageDefinition();
    const ctx = createHomePageContext(definition);
    storage.getRecentTournamentIds = () => ['t_1'];
    storage.getLocalTournamentCacheInfo = () => ({ doc: null, cachedAt: 0 });

    await ctx.loadRecents();

    assert.equal(ctx.data.loadError, true);
    assert.equal(ctx.data.showStaleSyncHint, false);
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    storage.getRecentTournamentIds = originalGetRecentTournamentIds;
    storage.getLocalTournamentCacheInfo = originalGetLocalTournamentCacheInfo;
    delete require.cache[homePagePath];
  }
});

test('home keeps healthy refresh banner silent while recents query is loading', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalGetRecentTournamentIds = storage.getRecentTournamentIds;
  const originalGetLocalTournamentCacheInfo = storage.getLocalTournamentCacheInfo;
  const originalSetLocalTournamentCache = storage.setLocalTournamentCache;
  const originalUpsertLocalCompletedTournamentSnapshot = storage.upsertLocalCompletedTournamentSnapshot;
  const resolveRemote = [];

  global.getApp = () => ({ globalData: { openid: 'test_openid' } });
  global.wx = {
    cloud: {
      database() {
        return {
          command: {
            in(value) {
              return value;
            }
          },
          collection() {
            return {
              where() {
                return {
                  async get() {
                    return new Promise((resolve) => {
                      resolveRemote.push(resolve);
                    });
                  }
                };
              }
            };
          }
        };
      }
    },
    showToast() {}
  };

  try {
    const definition = loadHomePageDefinition();
    const ctx = createHomePageContext(definition);
    storage.getRecentTournamentIds = () => ['t_1'];
    storage.getLocalTournamentCacheInfo = () => null;
    storage.setLocalTournamentCache = () => {};
    storage.upsertLocalCompletedTournamentSnapshot = () => {};

    const firstPending = ctx.loadRecents();
    const latestPending = ctx.loadRecents();

    assert.equal(ctx.data.syncRefreshing, true);
    assert.equal(ctx.data.syncStatusVisible, false);
    assert.equal(ctx.data.syncStatusText, '');

    resolveRemote[1]({
      data: [{
        _id: 't_1',
        name: 'Latest Tournament',
        status: 'running',
        mode: 'multi_rotate',
        players: [],
        rounds: [],
        updatedAt: '2026-03-10T10:00:00.000Z'
      }]
    });
    await latestPending;

    resolveRemote[0]({
      data: [{
        _id: 't_1',
        name: 'Stale Tournament',
        status: 'running',
        mode: 'multi_rotate',
        players: [],
        rounds: [],
        updatedAt: '2026-03-10T09:00:00.000Z'
      }]
    });
    await firstPending;

    assert.equal(ctx.data.syncRefreshing, false);
    assert.equal(ctx.data.syncStatusVisible, false);
    assert.equal(ctx.data.items.length, 1);
    assert.equal(ctx.data.items[0].name, 'Latest Tournament');
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    storage.getRecentTournamentIds = originalGetRecentTournamentIds;
    storage.getLocalTournamentCacheInfo = originalGetLocalTournamentCacheInfo;
    storage.setLocalTournamentCache = originalSetLocalTournamentCache;
    storage.upsertLocalCompletedTournamentSnapshot = originalUpsertLocalCompletedTournamentSnapshot;
    delete require.cache[homePagePath];
  }
});

test('home ignores a recents query that resolves after the page is hidden', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalGetRecentTournamentIds = storage.getRecentTournamentIds;
  const originalGetLocalTournamentCacheInfo = storage.getLocalTournamentCacheInfo;
  const originalSetLocalTournamentCache = storage.setLocalTournamentCache;
  const originalUpsertLocalCompletedTournamentSnapshot = storage.upsertLocalCompletedTournamentSnapshot;
  let resolveRemote = null;
  const writes = [];

  global.getApp = () => ({ globalData: { openid: 'test_openid' } });
  global.wx = {
    cloud: {
      database() {
        return {
          command: { in(value) { return value; } },
          collection() {
            return {
              where() {
                return {
                  get() {
                    return new Promise((resolve) => {
                      resolveRemote = resolve;
                    });
                  }
                };
              }
            };
          }
        };
      }
    },
    showToast() {}
  };

  try {
    const definition = loadHomePageDefinition();
    const ctx = createHomePageContext(definition);
    storage.getRecentTournamentIds = () => ['t_1'];
    storage.getLocalTournamentCacheInfo = () => ({
      cachedAt: 2,
      doc: {
        _id: 't_1',
        name: 'New Tournament',
        version: 5,
        status: 'running',
        mode: 'multi_rotate',
        players: [],
        rounds: []
      }
    });
    storage.setLocalTournamentCache = () => writes.push('cache');
    storage.upsertLocalCompletedTournamentSnapshot = () => writes.push('snapshot');

    const pending = ctx.loadRecents();
    ctx.onHide();
    resolveRemote({
      data: [{
        _id: 't_1',
        name: 'Old Tournament',
        version: 4,
        status: 'running',
        mode: 'multi_rotate',
        players: [],
        rounds: []
      }]
    });
    await pending;

    assert.equal(ctx.data.items[0].name, 'New Tournament');
    assert.deepEqual(writes, []);
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    storage.getRecentTournamentIds = originalGetRecentTournamentIds;
    storage.getLocalTournamentCacheInfo = originalGetLocalTournamentCacheInfo;
    storage.setLocalTournamentCache = originalSetLocalTournamentCache;
    storage.upsertLocalCompletedTournamentSnapshot = originalUpsertLocalCompletedTournamentSnapshot;
    delete require.cache[homePagePath];
  }
});
