const test = require('node:test');
const assert = require('node:assert/strict');

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

test('schedule page subscribes network state and surfaces offline sync banner', () => {
  const originalGetApp = global.getApp;
  let listener = null;
  let unsubscribed = false;

  global.getApp = () => ({
    globalData: {
      openid: 'u_1',
      networkOffline: true
    },
    subscribeNetworkChange(fn) {
      listener = fn;
      return () => {
        unsubscribed = true;
      };
    }
  });

  try {
    const definition = loadSchedulePageDefinition();
    const ctx = createSchedulePageContext(definition);
    let fetchedTournamentId = '';
    let watchedTournamentId = '';

    ctx.fetchTournament = (tournamentId) => {
      fetchedTournamentId = tournamentId;
      return Promise.resolve(null);
    };
    ctx.startWatch = (tournamentId) => {
      watchedTournamentId = tournamentId;
    };

    ctx.onLoad({ tournamentId: 't_schedule' });

    assert.equal(fetchedTournamentId, 't_schedule');
    assert.equal(watchedTournamentId, 't_schedule');
    assert.equal(ctx.data.networkOffline, true);
    assert.equal(ctx.data.syncStatusVisible, true);
    assert.match(ctx.data.syncStatusText, /离线/);

    listener(false);
    assert.equal(ctx.data.networkOffline, false);
    assert.equal(ctx.data.syncStatusVisible, false);

    ctx.onUnload();
    assert.equal(unsubscribed, true);
  } finally {
    global.getApp = originalGetApp;
    delete require.cache[schedulePagePath];
  }
});
