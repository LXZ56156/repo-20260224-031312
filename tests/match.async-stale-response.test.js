const test = require('node:test');
const assert = require('node:assert/strict');

const tournamentSync = require('../miniprogram/core/tournamentSync');

const matchPagePath = require.resolve('../miniprogram/pages/match/index.js');

function loadMatchPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[matchPagePath];
  require(matchPagePath);
  global.Page = originalPage;
  return definition;
}

function createMatchPageContext(definition) {
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
  ctx._lockStatusKey = '';
  ctx._batchOccupiedKey = '';
  ctx._latestTournament = null;
  ctx._fetchSeq = 0;
  ctx._watchGen = 0;
  ctx.data.tournamentId = 't_1';
  return ctx;
}

test('match page ignores stale fetchTournament responses', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalFetchTournament = tournamentSync.fetchTournament;

  global.wx = {
    showToast() {},
    showLoading() {},
    hideLoading() {},
    redirectTo() {},
    navigateTo() {},
    navigateBack(options = {}) {
      if (typeof options.fail === 'function') options.fail();
    },
    getStorageSync() {
      return undefined;
    },
    setStorageSync() {},
    removeStorageSync() {}
  };
  global.getApp = () => ({
    globalData: {
      openid: 'user_1',
      networkOffline: false
    }
  });

  try {
    const definition = loadMatchPageDefinition();
    const ctx = createMatchPageContext(definition);
    const resolvers = [];

    tournamentSync.fetchTournament = async () => new Promise((resolve) => {
      resolvers.push(resolve);
    });

    const first = ctx.fetchTournament('t_1');
    const second = ctx.fetchTournament('t_1');

    resolvers[1]({
      ok: true,
      source: 'remote',
      doc: {
        _id: 't_1',
        name: 'Fresh Tournament',
        status: 'running',
        players: [],
        rounds: []
      }
    });
    await second;

    resolvers[0]({
      ok: true,
      source: 'remote',
      doc: {
        _id: 't_1',
        name: 'Stale Tournament',
        status: 'running',
        players: [],
        rounds: []
      }
    });
    const firstResult = await first;

    assert.equal(firstResult, null);
    assert.equal(ctx.data.tournamentName, 'Fresh Tournament');
    assert.equal(ctx._latestTournament && ctx._latestTournament.name, 'Fresh Tournament');
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    tournamentSync.fetchTournament = originalFetchTournament;
    delete require.cache[matchPagePath];
  }
});

test('match page ignores stale watch callbacks after restarting watch', () => {
  const originalStartWatch = tournamentSync.startWatch;

  try {
    const definition = loadMatchPageDefinition();
    const ctx = createMatchPageContext(definition);
    const watchers = [];

    tournamentSync.startWatch = (_page, _tid, onData) => {
      watchers.push(onData);
    };

    ctx.startWatch('t_1');
    ctx.startWatch('t_1');

    watchers[0]({
      _id: 't_1',
      name: 'Stale Tournament',
      status: 'running',
      players: [],
      rounds: []
    });
    watchers[1]({
      _id: 't_1',
      name: 'Fresh Tournament',
      status: 'running',
      players: [],
      rounds: []
    });

    assert.equal(ctx.data.tournamentName, 'Fresh Tournament');
    assert.equal(ctx._latestTournament && ctx._latestTournament.name, 'Fresh Tournament');
  } finally {
    tournamentSync.startWatch = originalStartWatch;
    delete require.cache[matchPagePath];
  }
});

test('match page keeps an in-flight fetch usable across onHide', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;

  try {
    const definition = loadMatchPageDefinition();
    const ctx = createMatchPageContext(definition);
    const resolvers = [];

    tournamentSync.fetchTournament = async () => new Promise((resolve) => {
      resolvers.push(resolve);
    });

    const pending = ctx.fetchTournament('t_1');
    ctx.onHide();

    resolvers[0]({
      ok: true,
      source: 'remote',
      doc: {
        _id: 't_1',
        name: 'Resolved While Hidden',
        status: 'running',
        players: [],
        rounds: [],
        updatedAt: '2026-03-14T10:05:00.000Z'
      }
    });

    const result = await pending;
    assert.equal(result && result.name, 'Resolved While Hidden');
    assert.equal(ctx._latestTournament && ctx._latestTournament.name, 'Resolved While Hidden');
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    delete require.cache[matchPagePath];
  }
});
