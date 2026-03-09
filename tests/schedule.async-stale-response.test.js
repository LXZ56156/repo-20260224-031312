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
  ctx._pageRequestSeq = 0;
  ctx.applyTournament = (doc) => {
    ctx.latestTournament = doc;
  };
  return ctx;
}

test('schedule page ignores stale fetchTournament responses', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;

  try {
    const definition = loadSchedulePageDefinition();
    const ctx = createSchedulePageContext(definition);
    const resolvers = [];

    tournamentSync.fetchTournament = async () => new Promise((resolve) => {
      resolvers.push(resolve);
    });

    const first = ctx.fetchTournament('t_1');
    const second = ctx.fetchTournament('t_1');

    resolvers[1]({
      ok: true,
      source: 'remote',
      doc: { _id: 't_1', name: 'Fresh Schedule Tournament' }
    });
    await second;

    resolvers[0]({
      ok: true,
      source: 'remote',
      doc: { _id: 't_1', name: 'Stale Schedule Tournament' }
    });
    const firstResult = await first;

    assert.equal(firstResult, null);
    assert.equal(ctx.latestTournament && ctx.latestTournament.name, 'Fresh Schedule Tournament');
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    delete require.cache[schedulePagePath];
  }
});
