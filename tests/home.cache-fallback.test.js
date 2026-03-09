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
  const originalGetRecentTournamentIds = storage.getRecentTournamentIds;
  const originalGetLocalTournamentCache = storage.getLocalTournamentCache;

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
    storage.getRecentTournamentIds = () => ['t_1', 't_2'];
    storage.getLocalTournamentCache = (id) => {
      if (id !== 't_1') return null;
      return {
        _id: 't_1',
        name: 'Cached Tournament',
        status: 'running',
        mode: 'multi_rotate',
        players: [{ id: 'p_1' }, { id: 'p_2' }],
        rounds: [],
        updatedAt: '2026-03-10T10:00:00.000Z'
      };
    };

    await ctx.loadRecents();

    assert.equal(ctx.data.loadError, false);
    assert.equal(ctx.data.showStaleSyncHint, true);
    assert.equal(ctx.data.items.length, 1);
    assert.equal(ctx.data.items[0].name, 'Cached Tournament');
    assert.equal(ctx.clearedLastFailedAction, true);
  } finally {
    global.wx = originalWx;
    storage.getRecentTournamentIds = originalGetRecentTournamentIds;
    storage.getLocalTournamentCache = originalGetLocalTournamentCache;
    delete require.cache[homePagePath];
  }
});

test('home keeps missing tournaments as removed when remote query succeeds', async () => {
  const originalWx = global.wx;
  const originalGetRecentTournamentIds = storage.getRecentTournamentIds;
  const originalGetLocalTournamentCache = storage.getLocalTournamentCache;
  const originalRemoveLocalCompletedTournamentSnapshot = storage.removeLocalCompletedTournamentSnapshot;
  const originalUpsertLocalCompletedTournamentSnapshot = storage.upsertLocalCompletedTournamentSnapshot;

  const removed = [];

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
                    return {
                      data: [{
                        _id: 't_1',
                        name: 'Remote Tournament',
                        status: 'running',
                        mode: 'multi_rotate',
                        players: [],
                        rounds: []
                      }]
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
    storage.getRecentTournamentIds = () => ['t_1', 't_2'];
    storage.getLocalTournamentCache = () => ({
      _id: 't_2',
      name: 'Should Not Resurrect',
      status: 'running',
      mode: 'multi_rotate',
      players: [],
      rounds: []
    });
    storage.removeLocalCompletedTournamentSnapshot = (id) => {
      removed.push(id);
    };
    storage.upsertLocalCompletedTournamentSnapshot = () => {};

    await ctx.loadRecents();

    assert.equal(ctx.data.loadError, false);
    assert.equal(ctx.data.showStaleSyncHint, false);
    assert.equal(ctx.data.items.length, 2);
    assert.equal(ctx.data.items[1].status, 'missing');
    assert.equal(ctx.data.items[1].name, '赛事已移除');
    assert.deepEqual(removed, ['t_2']);
  } finally {
    global.wx = originalWx;
    storage.getRecentTournamentIds = originalGetRecentTournamentIds;
    storage.getLocalTournamentCache = originalGetLocalTournamentCache;
    storage.removeLocalCompletedTournamentSnapshot = originalRemoveLocalCompletedTournamentSnapshot;
    storage.upsertLocalCompletedTournamentSnapshot = originalUpsertLocalCompletedTournamentSnapshot;
    delete require.cache[homePagePath];
  }
});

test('home keeps loadError when no local cache is available after remote failure', async () => {
  const originalWx = global.wx;
  const originalGetRecentTournamentIds = storage.getRecentTournamentIds;
  const originalGetLocalTournamentCache = storage.getLocalTournamentCache;

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
    storage.getLocalTournamentCache = () => null;

    await ctx.loadRecents();

    assert.equal(ctx.data.loadError, true);
    assert.equal(ctx.data.showStaleSyncHint, false);
  } finally {
    global.wx = originalWx;
    storage.getRecentTournamentIds = originalGetRecentTournamentIds;
    storage.getLocalTournamentCache = originalGetLocalTournamentCache;
    delete require.cache[homePagePath];
  }
});
