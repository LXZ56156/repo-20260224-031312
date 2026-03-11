const test = require('node:test');
const assert = require('node:assert/strict');

const lobbyPagePath = require.resolve('../miniprogram/pages/lobby/index.js');
const schedulePagePath = require.resolve('../miniprogram/pages/schedule/index.js');
const rankingPagePath = require.resolve('../miniprogram/pages/ranking/index.js');
const shareEntryPagePath = require.resolve('../miniprogram/pages/share-entry/index.js');

function loadPageDefinition(pagePath) {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[pagePath];
  require(pagePath);
  global.Page = originalPage;
  return definition;
}

function createPageContext(definition, overrides = {}) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return Object.assign(ctx, overrides);
}

function installGlobals(app) {
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  global.getApp = () => app;
  global.wx = {
    getStorageSync() {
      return undefined;
    },
    setStorageSync() {},
    removeStorageSync() {}
  };
  return () => {
    global.getApp = originalGetApp;
    global.wx = originalWx;
  };
}

test('refresh flag from settings save is consumed by lobby without clearing other tournaments', () => {
  const app = {
    globalData: {
      openid: 'admin_1',
      needRefreshTournament: 't_1',
      needRefreshTournamentQueue: ['t_1', 't_2'],
      lobbyIntentTournamentId: '',
      lobbyIntentAction: ''
    }
  };
  const restore = installGlobals(app);

  try {
    const definition = loadPageDefinition(lobbyPagePath);
    const ctx = createPageContext(definition, {
      data: { ...definition.data, tournamentId: 't_1' },
      fetchTournament(tid) {
        this.lastFetchId = tid;
      },
      startWatch(tid) {
        this.lastWatchId = tid;
        this.watcher = { close() {} };
      }
    });

    ctx.onShow();

    assert.equal(ctx.lastFetchId, 't_1');
    assert.equal(ctx.lastWatchId, 't_1');
    assert.deepEqual(app.globalData.needRefreshTournamentQueue, ['t_2']);
  } finally {
    restore();
    delete require.cache[lobbyPagePath];
  }
});

test('refresh flags from match submit are consumed independently by schedule and ranking', () => {
  const app = {
    globalData: {
      needRefreshTournament: 't_rank',
      needRefreshTournamentQueue: ['t_schedule', 't_rank']
    }
  };
  const restore = installGlobals(app);

  try {
    const scheduleDefinition = loadPageDefinition(schedulePagePath);
    const scheduleCtx = createPageContext(scheduleDefinition, {
      data: { ...scheduleDefinition.data, tournamentId: 't_schedule' },
      fetchTournament(tid) {
        this.lastFetchId = tid;
      },
      startWatch(tid) {
        this.lastWatchId = tid;
        this.watcher = { close() {} };
      }
    });
    scheduleCtx.onShow();
    assert.equal(scheduleCtx.lastFetchId, 't_schedule');
    assert.deepEqual(app.globalData.needRefreshTournamentQueue, ['t_rank']);

    const rankingDefinition = loadPageDefinition(rankingPagePath);
    const rankingCtx = createPageContext(rankingDefinition, {
      data: { ...rankingDefinition.data, tournamentId: 't_rank' },
      fetchTournament(tid) {
        this.lastFetchId = tid;
      },
      startWatch(tid) {
        this.lastWatchId = tid;
        this.watcher = { close() {} };
      }
    });
    rankingCtx.onShow();
    assert.equal(rankingCtx.lastFetchId, 't_rank');
    assert.deepEqual(app.globalData.needRefreshTournamentQueue, []);
  } finally {
    restore();
    delete require.cache[schedulePagePath];
    delete require.cache[rankingPagePath];
  }
});

test('refresh flag from share-entry join is consumed on return without clearing unrelated tournaments', () => {
  const app = {
    globalData: {
      openid: 'viewer_1',
      needRefreshTournament: 't_join',
      needRefreshTournamentQueue: ['t_other', 't_join']
    }
  };
  const restore = installGlobals(app);

  try {
    const definition = loadPageDefinition(shareEntryPagePath);
    const ctx = createPageContext(definition, {
      openid: 'viewer_1',
      data: {
        ...definition.data,
        tournamentId: 't_join',
        identityPending: false,
        identityTimedOut: false
      },
      readCachedOpenid() {},
      fetchTournament(tid) {
        this.lastFetchId = tid;
      },
      startWatch(tid) {
        this.lastWatchId = tid;
        this.watcher = { close() {} };
      }
    });

    ctx.onShow();

    assert.equal(ctx.lastFetchId, 't_join');
    assert.equal(ctx.lastWatchId, 't_join');
    assert.deepEqual(app.globalData.needRefreshTournamentQueue, ['t_other']);
  } finally {
    restore();
    delete require.cache[shareEntryPagePath];
  }
});
