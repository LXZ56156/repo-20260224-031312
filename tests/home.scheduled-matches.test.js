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
  ctx.clearLastFailedAction = () => {};
  return ctx;
}

test('home list prefers scheduledMatches over legacy totalMatches', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalGetRecentTournamentIds = storage.getRecentTournamentIds;
  const originalUpsertLocalCompletedTournamentSnapshot = storage.upsertLocalCompletedTournamentSnapshot;

  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
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
                        name: '小队赛',
                        status: 'running',
                        mode: 'squad_doubles',
                        totalMatches: 3,
                        scheduledMatches: 5,
                        players: [
                          { id: 'A1', name: 'A1' },
                          { id: 'A2', name: 'A2' },
                          { id: 'B1', name: 'B1' },
                          { id: 'B2', name: 'B2' }
                        ],
                        rounds: [{
                          roundIndex: 0,
                          matches: [
                            { matchIndex: 0, status: 'finished', teamA: [], teamB: [] },
                            { matchIndex: 1, status: 'pending', teamA: [], teamB: [] }
                          ]
                        }]
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
    storage.getRecentTournamentIds = () => ['t_1'];
    storage.upsertLocalCompletedTournamentSnapshot = () => {};

    await ctx.loadRecents();

    assert.equal(ctx.data.items.length, 1);
    assert.equal(ctx.data.items[0].totalMatches, 5);
    assert.equal(ctx.data.items[0].matchProgressText, '1/5场');
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    storage.getRecentTournamentIds = originalGetRecentTournamentIds;
    storage.upsertLocalCompletedTournamentSnapshot = originalUpsertLocalCompletedTournamentSnapshot;
    delete require.cache[homePagePath];
  }
});
