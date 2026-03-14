const test = require('node:test');
const assert = require('node:assert/strict');

const tournamentSync = require('../miniprogram/core/tournamentSync');

const schedulePagePath = require.resolve('../miniprogram/pages/schedule/index.js');

function loadSchedulePageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[schedulePagePath];
  require(schedulePagePath);
  global.Page = originalPage;
  return definition;
}

function createSchedulePageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx.openid = 'user_1';
  ctx._fetchSeq = 0;
  ctx._watchGen = 0;
  ctx.data.tournamentId = 't_1';
  return ctx;
}

test('smoke: weak network uses cached tournament doc instead of blank schedule page', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalFetchTournament = tournamentSync.fetchTournament;

  global.wx = {
    showToast() {},
    getStorageSync() {
      return undefined;
    },
    setStorageSync() {},
    removeStorageSync() {}
  };
  global.getApp = () => ({
    globalData: {
      openid: 'user_1'
    }
  });

  try {
    const definition = loadSchedulePageDefinition();
    const ctx = createSchedulePageContext(definition);
    tournamentSync.fetchTournament = async () => ({
      ok: false,
      errorType: 'network',
      errorMessage: 'request:fail timeout',
      cachedDoc: {
        _id: 't_1',
        name: 'Cached Tournament',
        status: 'running',
        players: [],
        rounds: []
      }
    });

    const doc = await ctx.fetchTournament('t_1');
    assert.equal(doc && doc.name, 'Cached Tournament');
    assert.equal(ctx.data.showStaleSyncHint, true);
    assert.equal(ctx.data.loadError, false);
    assert.equal(ctx.data.tournament && ctx.data.tournament.name, 'Cached Tournament');
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    tournamentSync.fetchTournament = originalFetchTournament;
    delete require.cache[schedulePagePath];
  }
});
