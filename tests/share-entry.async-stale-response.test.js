const test = require('node:test');
const assert = require('node:assert/strict');

const tournamentSync = require('../miniprogram/core/tournamentSync');

const shareEntryPagePath = require.resolve('../miniprogram/pages/share-entry/index.js');

function loadShareEntryPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[shareEntryPagePath];
  require(shareEntryPagePath);
  global.Page = originalPage;
  return definition;
}

function createShareEntryPageContext(definition) {
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

test('share-entry page ignores stale fetchTournament responses', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;

  try {
    const definition = loadShareEntryPageDefinition();
    const ctx = createShareEntryPageContext(definition);
    const resolvers = [];

    tournamentSync.fetchTournament = async () => new Promise((resolve) => {
      resolvers.push(resolve);
    });

    const first = ctx.fetchTournament('t_1');
    const second = ctx.fetchTournament('t_1');

    resolvers[1]({
      ok: true,
      source: 'remote',
      doc: { _id: 't_1', name: 'Fresh Share Tournament' }
    });
    await second;

    resolvers[0]({
      ok: true,
      source: 'remote',
      doc: { _id: 't_1', name: 'Stale Share Tournament' }
    });
    const firstResult = await first;

    assert.equal(firstResult, null);
    assert.equal(ctx.latestTournament && ctx.latestTournament.name, 'Fresh Share Tournament');
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    delete require.cache[shareEntryPagePath];
  }
});

test('share-entry page ignores stale watch callbacks after restarting watch', () => {
  const originalStartWatch = tournamentSync.startWatch;

  try {
    const definition = loadShareEntryPageDefinition();
    const ctx = createShareEntryPageContext(definition);
    const watchers = [];

    tournamentSync.startWatch = (_page, _tid, onData) => {
      watchers.push(onData);
    };

    ctx.startWatch('t_1');
    ctx.startWatch('t_1');

    watchers[0]({ _id: 't_1', name: 'Stale Share Watch Tournament' });
    watchers[1]({ _id: 't_1', name: 'Fresh Share Watch Tournament' });

    assert.equal(ctx.latestTournament && ctx.latestTournament.name, 'Fresh Share Watch Tournament');
  } finally {
    tournamentSync.startWatch = originalStartWatch;
    delete require.cache[shareEntryPagePath];
  }
});
