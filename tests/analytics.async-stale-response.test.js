const test = require('node:test');
const assert = require('node:assert/strict');

const auth = require('../miniprogram/core/auth');
const tournamentSync = require('../miniprogram/core/tournamentSync');

const analyticsPagePath = require.resolve('../miniprogram/pages/analytics/index.js');

function loadAnalyticsPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[analyticsPagePath];
  require(analyticsPagePath);
  global.Page = originalPage;
  return definition;
}

function createAnalyticsPageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx._fetchSeq = 0;
  ctx._watchGen = 0;
  ctx.data.tournamentId = 't_1';
  ctx.applyTournament = (doc) => {
    ctx.latestTournament = doc;
  };
  return ctx;
}

test('analytics page reuses an in-flight fetchTournament request for the same tournament', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;

  try {
    const definition = loadAnalyticsPageDefinition();
    const ctx = createAnalyticsPageContext(definition);
    let resolveFetch = null;
    let fetchCalls = 0;

    tournamentSync.fetchTournament = async () => new Promise((resolve) => {
      fetchCalls += 1;
      resolveFetch = resolve;
    });

    const first = ctx.fetchTournament('t_1');
    const second = ctx.fetchTournament('t_1');

    assert.equal(fetchCalls, 1);

    resolveFetch({
      ok: true,
      source: 'remote',
      doc: { _id: 't_1', name: 'Fresh Analytics Tournament' }
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    assert.equal(firstResult && firstResult.name, 'Fresh Analytics Tournament');
    assert.equal(secondResult && secondResult.name, 'Fresh Analytics Tournament');
    assert.equal(ctx.latestTournament && ctx.latestTournament.name, 'Fresh Analytics Tournament');
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    delete require.cache[analyticsPagePath];
  }
});

test('analytics page ignores stale watch callbacks after restarting watch', () => {
  const originalStartWatch = tournamentSync.startWatch;

  try {
    const definition = loadAnalyticsPageDefinition();
    const ctx = createAnalyticsPageContext(definition);
    const watchers = [];

    tournamentSync.startWatch = (_page, _tid, onData) => {
      watchers.push(onData);
    };

    ctx.startWatch('t_1');
    ctx.startWatch('t_1');

    watchers[0]({ _id: 't_1', name: 'Stale Analytics Watch Tournament' });
    watchers[1]({ _id: 't_1', name: 'Fresh Analytics Watch Tournament' });

    assert.equal(ctx.latestTournament && ctx.latestTournament.name, 'Fresh Analytics Watch Tournament');
  } finally {
    tournamentSync.startWatch = originalStartWatch;
    delete require.cache[analyticsPagePath];
  }
});

test('analytics page keeps an in-flight fetch usable across onHide', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;

  try {
    const definition = loadAnalyticsPageDefinition();
    const ctx = createAnalyticsPageContext(definition);
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
        updatedAt: '2026-03-14T10:05:00.000Z'
      }
    });

    const result = await pending;
    assert.equal(result && result.name, 'Resolved While Hidden');
    assert.equal(ctx._latestTournament && ctx._latestTournament.name, 'Resolved While Hidden');
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    delete require.cache[analyticsPagePath];
  }
});

test('analytics viewer identity reapplies current tournament only while the page is active', async () => {
  const originalLogin = auth.login;
  const resolvers = [];
  auth.login = () => new Promise((resolve) => {
    resolvers.push(resolve);
  });

  try {
    const definition = loadAnalyticsPageDefinition();
    const tournament = { _id: 't_1', name: 'Current Tournament' };
    const activePage = createAnalyticsPageContext(definition);
    const activeApplied = [];
    activePage._pageActive = true;
    activePage.data.tournament = tournament;
    activePage.applyTournament = (doc) => activeApplied.push(doc);
    const activeTask = activePage.primeViewerIdentity();
    resolvers.shift()('u_active');
    await activeTask;

    assert.equal(activePage.openid, 'u_active');
    assert.deepEqual(activeApplied, [tournament]);

    const hiddenPage = createAnalyticsPageContext(definition);
    const hiddenApplied = [];
    hiddenPage._pageActive = true;
    hiddenPage.data.tournament = tournament;
    hiddenPage.applyTournament = (doc) => hiddenApplied.push(doc);
    const hiddenTask = hiddenPage.primeViewerIdentity();
    hiddenPage.onHide();
    resolvers.shift()('u_hidden');
    await hiddenTask;

    assert.equal(hiddenPage.openid, undefined);
    assert.deepEqual(hiddenApplied, []);
  } finally {
    auth.login = originalLogin;
    delete require.cache[analyticsPagePath];
  }
});
