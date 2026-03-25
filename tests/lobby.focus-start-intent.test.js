const test = require('node:test');
const assert = require('node:assert/strict');

const lobbyDraftActions = require('../miniprogram/pages/lobby/lobbyDraftActions');

const lobbyPagePath = require.resolve('../miniprogram/pages/lobby/index.js');

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
  Object.keys(definition || {}).forEach((key) => {
    if (typeof definition[key] === 'function') ctx[key] = definition[key];
  });
  return Object.assign(ctx, overrides);
}

function installGlobals(app) {
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  global.getApp = () => app;
  global.wx = {
    getStorageSync() {
      return undefined;
    },
    setStorageSync() {},
    removeStorageSync() {}
  };
  global.setTimeout = (fn) => {
    fn();
    return 1;
  };
  return () => {
    global.getApp = originalGetApp;
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
  };
}

test('runFlowAction keeps focus_start separate from start execution', () => {
  let focused = 0;
  let started = 0;
  const ctx = {
    focusStartAction() {
      focused += 1;
    },
    handleStart() {
      started += 1;
    }
  };

  lobbyDraftActions.runFlowAction.call(ctx, 'focus_start');
  lobbyDraftActions.runFlowAction.call(ctx, 'start');

  assert.equal(focused, 1);
  assert.equal(started, 1);
});

test('lobby page consumes focus_start intent and runs the focus action after tournament refresh', () => {
  const app = {
    globalData: {
      openid: 'u_admin',
      lobbyIntentTournamentId: 't_focus',
      lobbyIntentAction: 'focus_start',
      needRefreshTournament: '',
      needRefreshTournamentQueue: []
    }
  };
  const restore = installGlobals(app);

  try {
    const definition = loadPageDefinition(lobbyPagePath);
    const ctx = createPageContext(definition, {
      data: { ...definition.data, tournamentId: 't_focus' },
      fetchTournament(tid) {
        this.lastFetchId = tid;
      },
      startWatch(tid) {
        this.lastWatchId = tid;
        this.watcher = { close() {} };
      },
      resolveDisplayPlayersAvatars() {},
      runFlowAction(action) {
        this.lastAction = action;
      }
    });

    ctx.onShow();
    ctx.setTournament({
      _id: 't_focus',
      name: '赛前聚焦',
      status: 'draft',
      creatorId: 'u_admin',
      mode: 'multi_rotate',
      settingsConfigured: true,
      players: [
        { id: 'u_admin', name: '组织者', gender: 'male' },
        { id: 'u_1', name: '球友1', gender: 'male' },
        { id: 'u_2', name: '球友2', gender: 'female' },
        { id: 'u_3', name: '球友3', gender: 'female' }
      ],
      rankings: [],
      rounds: [],
      totalMatches: 6,
      courts: 2
    });

    assert.equal(ctx.lastAction, 'focus_start');
    assert.equal(app.globalData.lobbyIntentAction, '');
  } finally {
    restore();
    delete require.cache[lobbyPagePath];
  }
});
