const test = require('node:test');
const assert = require('node:assert/strict');

const pageTournamentSync = require('../miniprogram/core/pageTournamentSync');
const tournamentSync = require('../miniprogram/core/tournamentSync');

function createContext(methods) {
  const ctx = {
    data: {
      tournamentId: 't_1',
      tournament: null,
      networkOffline: false,
      syncPollingFallback: false
    },
    setData(patch) {
      this.data = { ...this.data, ...(patch || {}) };
    },
    applyTournament(doc) {
      this.data.tournament = doc;
    }
  };
  Object.assign(ctx, methods);
  pageTournamentSync.initTournamentSync(ctx);
  return ctx;
}

test('pageTournamentSync reuses in-flight fetch while manual refresh overlaps polling refresh', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  let fetchCalls = 0;
  let resolveFetch = null;

  try {
    tournamentSync.fetchTournament = async () => new Promise((resolve) => {
      fetchCalls += 1;
      resolveFetch = resolve;
    });

    const pollingRefresh = ctx.fetchTournament('t_1');
    const manualRefresh = ctx.fetchTournament('t_1');

    assert.equal(fetchCalls, 1);

    resolveFetch({
      ok: true,
      source: 'remote',
      doc: {
        _id: 't_1',
        name: 'Recovered Tournament',
        updatedAt: '2026-03-14T11:30:00.000Z'
      }
    });

    const [pollingDoc, manualDoc] = await Promise.all([pollingRefresh, manualRefresh]);
    assert.equal(pollingDoc && pollingDoc.name, 'Recovered Tournament');
    assert.equal(manualDoc && manualDoc.name, 'Recovered Tournament');
    assert.equal(ctx.data.tournament && ctx.data.tournament.name, 'Recovered Tournament');
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
  }
});

test('pageTournamentSync forces realtime watch restart on reconnect when page is in polling fallback', () => {
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  let fetchCalls = 0;
  const watchCalls = [];

  ctx.data.networkOffline = true;
  ctx.data.syncPollingFallback = true;
  ctx.fetchTournament = async () => {
    fetchCalls += 1;
    return null;
  };
  ctx.startWatch = (tournamentId, options) => {
    watchCalls.push({ tournamentId, options });
  };
  ctx.hasActiveWatch = () => true;

  ctx.handleNetworkChange(false);

  assert.equal(fetchCalls, 1);
  assert.deepEqual(watchCalls, [{
    tournamentId: 't_1',
    options: { forceRestart: true }
  }]);
  assert.equal(ctx.data.networkOffline, false);
});
