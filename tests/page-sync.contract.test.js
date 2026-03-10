const test = require('node:test');
const assert = require('node:assert/strict');

const pageTournamentSync = require('../miniprogram/core/pageTournamentSync');
const tournamentSync = require('../miniprogram/core/tournamentSync');

function createContext(methods) {
  const applied = [];
  const patches = [];
  const ctx = {
    data: { tournamentId: 't_1' },
    setData(patch) {
      patches.push(patch);
      this.data = { ...this.data, ...(patch || {}) };
    },
    applyTournament(doc, meta) {
      applied.push({ doc, meta });
    },
    _applied: applied,
    _patches: patches
  };
  Object.assign(ctx, methods);
  pageTournamentSync.initTournamentSync(ctx);
  return ctx;
}

test('pageTournamentSync handles remote, cached and error fetch states through one contract', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;
  const methods = pageTournamentSync.createTournamentSyncMethods({
    buildRemoteState() {
      return { loadError: false, showStaleSyncHint: false, sourceTag: 'remote' };
    },
    buildCachedState() {
      return { loadError: false, showStaleSyncHint: true, sourceTag: 'cache' };
    },
    buildLoadErrorState() {
      return { loadError: true, showStaleSyncHint: false, sourceTag: 'error' };
    }
  });
  const ctx = createContext(methods);

  try {
    tournamentSync.fetchTournament = async () => ({
      ok: true,
      source: 'remote',
      doc: { _id: 't_remote' }
    });
    let doc = await ctx.fetchTournament('t_1');
    assert.equal(doc._id, 't_remote');
    assert.equal(ctx.data.sourceTag, 'remote');
    assert.deepEqual(ctx._applied.pop(), {
      doc: { _id: 't_remote' },
      meta: { requestSeq: 1, source: 'remote' }
    });

    tournamentSync.fetchTournament = async () => ({
      ok: false,
      errorType: 'network',
      cachedDoc: { _id: 't_cache' }
    });
    doc = await ctx.fetchTournament('t_1');
    assert.equal(doc._id, 't_cache');
    assert.equal(ctx.data.sourceTag, 'cache');
    assert.deepEqual(ctx._applied.pop(), {
      doc: { _id: 't_cache' },
      meta: { requestSeq: 2, source: 'cache' }
    });

    tournamentSync.fetchTournament = async () => ({
      ok: false,
      errorType: 'network',
      cachedDoc: null
    });
    doc = await ctx.fetchTournament('t_1');
    assert.equal(doc, null);
    assert.equal(ctx.data.loadError, true);
    assert.equal(ctx.data.sourceTag, 'error');
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
  }
});

test('pageTournamentSync ignores stale watch callbacks after restarting a watch', () => {
  const originalStartWatch = tournamentSync.startWatch;
  const methods = pageTournamentSync.createTournamentSyncMethods();
  const ctx = createContext(methods);
  const callbacks = [];

  try {
    tournamentSync.startWatch = (_page, _tid, onDoc) => {
      callbacks.push(onDoc);
    };

    ctx.startWatch('t_1');
    ctx.startWatch('t_1');

    callbacks[0]({ _id: 't_old' });
    callbacks[1]({ _id: 't_new' });

    assert.deepEqual(ctx._applied, [{
      doc: { _id: 't_new' },
      meta: { watchGen: 2, source: 'watch' }
    }]);
  } finally {
    tournamentSync.startWatch = originalStartWatch;
  }
});
