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

test('pageTournamentSync accepts incoming doc without timestamp when no current doc exists', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);

  try {
    tournamentSync.fetchTournament = async () => ({
      ok: true,
      source: 'remote',
      doc: { _id: 't_1', name: 'No Timestamp Doc' }
    });

    const result = await ctx.fetchTournament('t_1');
    assert.equal(result && result.name, 'No Timestamp Doc');
    assert.equal(ctx.data.tournament && ctx.data.tournament.name, 'No Timestamp Doc');
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
  }
});

test('pageTournamentSync accepts incoming doc without timestamp when current doc also lacks timestamp', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;
  const originalStartWatch = tournamentSync.startWatch;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  let onWatchDoc = null;

  try {
    tournamentSync.startWatch = (_page, _tid, nextOnDoc) => {
      onWatchDoc = nextOnDoc;
    };
    tournamentSync.fetchTournament = async () => ({
      ok: true,
      source: 'remote',
      doc: { _id: 't_1', name: 'Second No-TS Doc' }
    });

    ctx.startWatch('t_1');
    onWatchDoc({ _id: 't_1', name: 'First No-TS Doc' }, { source: 'realtime' });
    assert.equal(ctx.data.tournament && ctx.data.tournament.name, 'First No-TS Doc');

    const result = await ctx.fetchTournament('t_1');
    assert.equal(result && result.name, 'Second No-TS Doc');
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    tournamentSync.startWatch = originalStartWatch;
  }
});

test('pageTournamentSync accepts incoming doc without timestamp but with higher version when current doc has timestamp', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;
  const originalStartWatch = tournamentSync.startWatch;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  let onWatchDoc = null;

  try {
    tournamentSync.startWatch = (_page, _tid, nextOnDoc) => {
      onWatchDoc = nextOnDoc;
    };

    ctx.startWatch('t_1');
    onWatchDoc({
      _id: 't_1',
      name: 'Timestamped Doc',
      version: 1,
      updatedAt: '2026-03-14T10:00:00.000Z'
    }, { source: 'realtime' });
    assert.equal(ctx.data.tournament && ctx.data.tournament.name, 'Timestamped Doc');

    tournamentSync.fetchTournament = async () => ({
      ok: true,
      source: 'remote',
      doc: { _id: 't_1', name: 'Higher Version No-TS', version: 5 }
    });

    const result = await ctx.fetchTournament('t_1');
    assert.equal(result && result.name, 'Higher Version No-TS');
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    tournamentSync.startWatch = originalStartWatch;
  }
});

test('pageTournamentSync logs warning but still accepts doc without timestamp or version when current doc has timestamp', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;
  const originalStartWatch = tournamentSync.startWatch;
  const originalConsoleWarn = console.warn;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  let onWatchDoc = null;
  const warnings = [];

  try {
    console.warn = (...args) => warnings.push(args.join(' '));
    tournamentSync.startWatch = (_page, _tid, nextOnDoc) => {
      onWatchDoc = nextOnDoc;
    };

    ctx.startWatch('t_1');
    onWatchDoc({
      _id: 't_1',
      name: 'Has Timestamp',
      updatedAt: '2026-03-14T10:00:00.000Z'
    }, { source: 'realtime' });

    tournamentSync.fetchTournament = async () => ({
      ok: true,
      source: 'remote',
      doc: { _id: 't_1', name: 'No TS No Version' }
    });

    const result = await ctx.fetchTournament('t_1');
    assert.equal(result && result.name, 'No TS No Version');
    assert.ok(warnings.some((w) => w.includes('shouldApplyIncomingDoc')));
  } finally {
    console.warn = originalConsoleWarn;
    tournamentSync.fetchTournament = originalFetchTournament;
    tournamentSync.startWatch = originalStartWatch;
  }
});

test('pageTournamentSync applies cached data first and then replaces it with newer remote data', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  let callCount = 0;

  try {
    tournamentSync.fetchTournament = async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: false,
          errorType: 'network',
          errorMessage: 'request:fail timeout',
          cachedDoc: {
            _id: 't_1',
            name: 'Cached Tournament',
            updatedAt: '2026-03-14T10:00:00.000Z'
          },
          cachedAt: 100
        };
      }
      return {
        ok: true,
        source: 'remote',
        doc: {
          _id: 't_1',
          name: 'Remote Tournament',
          updatedAt: '2026-03-14T10:05:00.000Z'
        }
      };
    };

    const cachedDoc = await ctx.fetchTournament('t_1');
    assert.equal(cachedDoc && cachedDoc.name, 'Cached Tournament');
    assert.equal(ctx.data.tournament && ctx.data.tournament.name, 'Cached Tournament');
    assert.equal(ctx.data.syncUsingCache, true);

    const remoteDoc = await ctx.fetchTournament('t_1');
    assert.equal(remoteDoc && remoteDoc.name, 'Remote Tournament');
    assert.equal(ctx.data.tournament && ctx.data.tournament.name, 'Remote Tournament');
    assert.equal(ctx.data.syncUsingCache, false);
    assert.deepEqual(ctx._applied.map((entry) => entry.doc.name), ['Cached Tournament', 'Remote Tournament']);
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
  }
});
