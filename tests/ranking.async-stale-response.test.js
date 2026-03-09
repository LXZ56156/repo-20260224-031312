const test = require('node:test');
const assert = require('node:assert/strict');

const tournamentSync = require('../miniprogram/core/tournamentSync');

const rankingPagePath = require.resolve('../miniprogram/pages/ranking/index.js');

function loadRankingPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[rankingPagePath];
  require(rankingPagePath);
  global.Page = originalPage;
  return definition;
}

function createRankingPageContext(definition) {
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
  ctx.applyTournament = (doc) => {
    ctx.latestTournament = doc;
  };
  return ctx;
}

test('ranking page ignores stale fetchTournament responses', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;

  try {
    const definition = loadRankingPageDefinition();
    const ctx = createRankingPageContext(definition);
    const resolvers = [];

    tournamentSync.fetchTournament = async () => new Promise((resolve) => {
      resolvers.push(resolve);
    });

    const first = ctx.fetchTournament('t_1');
    const second = ctx.fetchTournament('t_1');

    resolvers[1]({
      ok: true,
      source: 'remote',
      doc: { _id: 't_1', name: 'Fresh Ranking Tournament' }
    });
    await second;

    resolvers[0]({
      ok: true,
      source: 'remote',
      doc: { _id: 't_1', name: 'Stale Ranking Tournament' }
    });
    const firstResult = await first;

    assert.equal(firstResult, null);
    assert.equal(ctx.latestTournament && ctx.latestTournament.name, 'Fresh Ranking Tournament');
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    delete require.cache[rankingPagePath];
  }
});

test('ranking page ignores stale watch callbacks after restarting watch', () => {
  const originalStartWatch = tournamentSync.startWatch;

  try {
    const definition = loadRankingPageDefinition();
    const ctx = createRankingPageContext(definition);
    const watchers = [];

    tournamentSync.startWatch = (_page, _tid, onData) => {
      watchers.push(onData);
    };

    ctx.startWatch('t_1');
    ctx.startWatch('t_1');

    watchers[0]({ _id: 't_1', name: 'Stale Ranking Watch Tournament' });
    watchers[1]({ _id: 't_1', name: 'Fresh Ranking Watch Tournament' });

    assert.equal(ctx.latestTournament && ctx.latestTournament.name, 'Fresh Ranking Watch Tournament');
  } finally {
    tournamentSync.startWatch = originalStartWatch;
    delete require.cache[rankingPagePath];
  }
});

test('ranking page ignores fetch responses after onHide invalidates the page request', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;

  try {
    const definition = loadRankingPageDefinition();
    const ctx = createRankingPageContext(definition);
    const resolvers = [];

    tournamentSync.fetchTournament = async () => new Promise((resolve) => {
      resolvers.push(resolve);
    });

    const pending = ctx.fetchTournament('t_1');
    ctx.onHide();

    resolvers[0]({
      ok: true,
      source: 'remote',
      doc: { _id: 't_1', name: 'Should Be Ignored' }
    });

    const result = await pending;
    assert.equal(result, null);
    assert.equal(ctx.latestTournament, undefined);
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    delete require.cache[rankingPagePath];
  }
});
