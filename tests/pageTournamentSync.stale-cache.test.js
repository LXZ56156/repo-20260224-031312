const test = require('node:test');
const assert = require('node:assert/strict');

const pageTournamentSync = require('../miniprogram/core/pageTournamentSync');
const tournamentSync = require('../miniprogram/core/tournamentSync');

function createContext(methods) {
  const applied = [];
  const ctx = {
    data: {
      tournamentId: 't_1',
      tournament: null
    },
    setData(patch) {
      this.data = { ...this.data, ...(patch || {}) };
    },
    applyTournament(doc, meta) {
      this.data.tournament = doc;
      applied.push({ doc, meta });
    },
    _applied: applied
  };
  Object.assign(ctx, methods);
  pageTournamentSync.initTournamentSync(ctx);
  return ctx;
}

test('pageTournamentSync drops stale fetch results when watch already applied a newer tournament doc', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;
  const originalStartWatch = tournamentSync.startWatch;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  const fetchResolvers = [];
  let onWatchDoc = null;

  try {
    tournamentSync.fetchTournament = async () => new Promise((resolve) => {
      fetchResolvers.push(resolve);
    });
    tournamentSync.startWatch = (_page, _tid, nextOnDoc) => {
      onWatchDoc = nextOnDoc;
    };

    ctx.startWatch('t_1');
    const pendingFetch = ctx.fetchTournament('t_1');

    onWatchDoc({
      _id: 't_1',
      name: 'Fresh Tournament',
      updatedAt: '2026-03-14T10:05:00.000Z'
    }, { source: 'realtime' });

    fetchResolvers[0]({
      ok: true,
      source: 'remote',
      doc: {
        _id: 't_1',
        name: 'Stale Tournament',
        updatedAt: '2026-03-14T10:00:00.000Z'
      }
    });

    const result = await pendingFetch;

    assert.equal(result && result.name, 'Fresh Tournament');
    assert.equal(ctx.data.tournament && ctx.data.tournament.name, 'Fresh Tournament');
    assert.equal(ctx.data.syncLastUpdatedAt, Date.parse('2026-03-14T10:05:00.000Z'));
    assert.deepEqual(ctx._applied.map((entry) => entry.doc.name), ['Fresh Tournament']);
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    tournamentSync.startWatch = originalStartWatch;
  }
});

test('pageTournamentSync keeps the latest tournament visible when refresh fails after data is already applied', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);

  try {
    ctx.applyTournament({
      _id: 't_1',
      name: 'Stable Tournament',
      updatedAt: '2026-03-14T10:05:00.000Z'
    }, { source: 'seed' });
    ctx._latestTournament = ctx.data.tournament;
    ctx._lastAppliedDocTs = Date.parse('2026-03-14T10:05:00.000Z');
    ctx.data.syncLastUpdatedAt = Date.parse('2026-03-14T10:05:00.000Z');

    tournamentSync.fetchTournament = async () => ({
      ok: false,
      errorType: 'network',
      errorMessage: 'request:fail timeout',
      cachedDoc: null
    });

    const result = await ctx.fetchTournament('t_1');

    assert.equal(result && result.name, 'Stable Tournament');
    assert.equal(ctx.data.tournament && ctx.data.tournament.name, 'Stable Tournament');
    assert.equal(ctx.data.loadError, false);
    assert.equal(ctx.data.showStaleSyncHint, true);
    assert.equal(ctx.data.syncRefreshing, false);
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
  }
});
