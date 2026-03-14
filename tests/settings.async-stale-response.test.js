const test = require('node:test');
const assert = require('node:assert/strict');

const tournamentSync = require('../miniprogram/core/tournamentSync');

const settingsPagePath = require.resolve('../miniprogram/pages/settings/index.js');

function loadSettingsPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[settingsPagePath];
  require(settingsPagePath);
  global.Page = originalPage;
  return definition;
}

function createSettingsPageContext(definition) {
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

test('settings page reuses an in-flight fetchTournament request for the same tournament', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;

  try {
    const definition = loadSettingsPageDefinition();
    const ctx = createSettingsPageContext(definition);
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
      doc: { _id: 't_1', name: 'Fresh Settings Tournament' }
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    assert.equal(firstResult && firstResult.name, 'Fresh Settings Tournament');
    assert.equal(secondResult && secondResult.name, 'Fresh Settings Tournament');
    assert.equal(ctx.latestTournament && ctx.latestTournament.name, 'Fresh Settings Tournament');
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    delete require.cache[settingsPagePath];
  }
});

test('settings page ignores stale watch callbacks after restarting watch', () => {
  const originalStartWatch = tournamentSync.startWatch;

  try {
    const definition = loadSettingsPageDefinition();
    const ctx = createSettingsPageContext(definition);
    const watchers = [];

    tournamentSync.startWatch = (_page, _tid, onData) => {
      watchers.push(onData);
    };

    ctx.startWatch('t_1');
    ctx.startWatch('t_1');

    watchers[0]({ _id: 't_1', name: 'Stale Settings Watch Tournament' });
    watchers[1]({ _id: 't_1', name: 'Fresh Settings Watch Tournament' });

    assert.equal(ctx.latestTournament && ctx.latestTournament.name, 'Fresh Settings Watch Tournament');
  } finally {
    tournamentSync.startWatch = originalStartWatch;
    delete require.cache[settingsPagePath];
  }
});

test('settings page keeps an in-flight fetch usable across onHide', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;

  try {
    const definition = loadSettingsPageDefinition();
    const ctx = createSettingsPageContext(definition);
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
    delete require.cache[settingsPagePath];
  }
});
