const test = require('node:test');
const assert = require('node:assert/strict');

const pageTournamentSync = require('../miniprogram/core/pageTournamentSync');
const tournamentSync = require('../miniprogram/core/tournamentSync');
const watchModule = require('../miniprogram/sync/watch');

test('watchTournament keeps shared channels stable across multi-page close and reopen', async () => {
  const originalWx = global.wx;
  const originalNow = Date.now;
  const realtimeHandlers = [];
  let getCount = 0;
  let closeCount = 0;

  Date.now = () => 1710000000000;
  global.wx = {
    cloud: {
      database() {
        return {
          collection(name) {
            assert.equal(name, 'tournaments');
            return {
              doc(id) {
                assert.equal(id, 't_1');
                return {
                  async get() {
                    getCount += 1;
                    return { data: { _id: 't_1', version: getCount } };
                  },
                  watch(handlers) {
                    realtimeHandlers.push(handlers);
                    return {
                      close() {
                        closeCount += 1;
                      }
                    };
                  }
                };
              }
            };
          }
        };
      }
    }
  };

  const pageA = [];
  const pageB = [];
  const pageC = [];
  const watcherA = watchModule.watchTournament('t_1', (doc) => pageA.push(doc.version));
  const watcherB = watchModule.watchTournament('t_1', (doc) => pageB.push(doc.version));

  try {
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(realtimeHandlers.length, 1);
    assert.deepEqual(pageA, [1]);
    assert.deepEqual(pageB, [1]);

    realtimeHandlers[0].onChange({ docs: [{ _id: 't_1', version: 2 }] });
    watcherA.close();
    realtimeHandlers[0].onChange({ docs: [{ _id: 't_1', version: 3 }] });

    assert.deepEqual(pageA, [1, 2]);
    assert.deepEqual(pageB, [1, 2, 3]);
    assert.equal(closeCount, 0);

    watcherB.close();
    assert.equal(closeCount, 1);

    const watcherC = watchModule.watchTournament('t_1', (doc) => pageC.push(doc.version));
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(realtimeHandlers.length, 2);
    assert.deepEqual(pageC, [2]);

    // A stale double-close should not touch the reopened shared channel.
    watcherA.close();
    assert.equal(closeCount, 1);

    realtimeHandlers[1].onChange({ docs: [{ _id: 't_1', version: 4 }] });
    assert.deepEqual(pageC, [2, 4]);

    watcherC.close();
    assert.equal(closeCount, 2);
  } finally {
    watchModule.closeWatch('t_1');
    global.wx = originalWx;
    Date.now = originalNow;
  }
});

function createSyncContext() {
  const applied = [];
  const methods = pageTournamentSync.createTournamentSyncMethods();
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

test('pageTournamentSync does not start duplicate watchers for the same tournament on repeated onShow', () => {
  const originalStartWatch = tournamentSync.startWatch;
  const ctx = createSyncContext();
  const startCalls = [];

  try {
    tournamentSync.startWatch = (page, tournamentId) => {
      startCalls.push(tournamentId);
      page.watcher = {
        isActive() {
          return true;
        },
        close() {}
      };
      page._watchTournamentId = tournamentId;
    };

    ctx.startWatch('t_1');
    ctx.startWatch('t_1');

    assert.deepEqual(startCalls, ['t_1']);
  } finally {
    tournamentSync.startWatch = originalStartWatch;
  }
});

test('pageTournamentSync preserves _latestTournament across rapid pause→resume cycle', () => {
  const originalStartWatch = tournamentSync.startWatch;
  const originalCloseWatcher = tournamentSync.closeWatcher;
  const originalFetchTournament = tournamentSync.fetchTournament;
  const ctx = createSyncContext();
  let onWatchDoc = null;
  let fetchCount = 0;

  try {
    tournamentSync.startWatch = (page, tournamentId, nextOnDoc) => {
      onWatchDoc = nextOnDoc;
      page.watcher = { isActive() { return true; }, close() { page.watcher = null; } };
      page._watchTournamentId = tournamentId;
    };
    tournamentSync.closeWatcher = (page) => {
      if (page && page.watcher) { page.watcher.close(); page._watchTournamentId = ''; }
    };
    tournamentSync.fetchTournament = async () => {
      fetchCount += 1;
      return { ok: true, source: 'remote', doc: { _id: 't_1', name: `Fetch ${fetchCount}`, updatedAt: `2026-03-14T10:0${fetchCount}:00.000Z` } };
    };

    ctx.startWatch('t_1');
    onWatchDoc({ _id: 't_1', name: 'Initial', updatedAt: '2026-03-14T10:00:00.000Z' }, { source: 'realtime' });
    assert.equal(ctx.data.tournament.name, 'Initial');
    assert.equal(ctx._latestTournament.name, 'Initial');

    // Simulate onHide → pause
    pageTournamentSync.pauseTournamentSync(ctx);
    assert.equal(ctx._latestTournament.name, 'Initial');

    // Simulate onShow → resume: _latestTournament is still available
    assert.equal(ctx._latestTournament.name, 'Initial');
    assert.equal(ctx.data.tournament.name, 'Initial');
  } finally {
    tournamentSync.startWatch = originalStartWatch;
    tournamentSync.closeWatcher = originalCloseWatcher;
    tournamentSync.fetchTournament = originalFetchTournament;
  }
});

test('pageTournamentSync invalidates old watch gen on pause but allows new watch after resume', () => {
  const originalStartWatch = tournamentSync.startWatch;
  const originalCloseWatcher = tournamentSync.closeWatcher;
  const ctx = createSyncContext();
  const watchCallbacks = [];
  let closedCount = 0;

  try {
    tournamentSync.startWatch = (page, tournamentId, nextOnDoc) => {
      watchCallbacks.push(nextOnDoc);
      page.watcher = { isActive() { return true; }, close() { closedCount += 1; page.watcher = null; } };
      page._watchTournamentId = tournamentId;
    };
    tournamentSync.closeWatcher = (page) => {
      if (page && page.watcher) { page.watcher.close(); page._watchTournamentId = ''; }
    };

    // Initial watch
    ctx.startWatch('t_1');
    watchCallbacks[0]({ _id: 't_1', name: 'Before Pause', updatedAt: '2026-03-14T10:00:00.000Z' }, { source: 'realtime' });
    assert.equal(ctx.data.tournament.name, 'Before Pause');

    // Pause (onHide)
    pageTournamentSync.pauseTournamentSync(ctx);
    assert.equal(closedCount, 1);

    // Old watch callback should be rejected (watchGen invalidated)
    watchCallbacks[0]({ _id: 't_1', name: 'Stale After Pause', updatedAt: '2026-03-14T10:10:00.000Z' }, { source: 'realtime' });
    assert.equal(ctx.data.tournament.name, 'Before Pause');

    // Resume (onShow) — new watch
    ctx.startWatch('t_1');
    assert.equal(watchCallbacks.length, 2);
    watchCallbacks[1]({ _id: 't_1', name: 'After Resume', updatedAt: '2026-03-14T10:05:00.000Z' }, { source: 'realtime' });
    assert.equal(ctx.data.tournament.name, 'After Resume');
  } finally {
    tournamentSync.startWatch = originalStartWatch;
    tournamentSync.closeWatcher = originalCloseWatcher;
  }
});

test('pageTournamentSync tears down the old watcher before switching to another tournament id', () => {
  const originalStartWatch = tournamentSync.startWatch;
  const originalCloseWatcher = tournamentSync.closeWatcher;
  const ctx = createSyncContext();
  const startCalls = [];
  const closedWatchers = [];
  const callbacks = [];

  try {
    tournamentSync.startWatch = (page, tournamentId, onDoc) => {
      startCalls.push(tournamentId);
      callbacks.push({ tournamentId, onDoc });
      page.watcher = {
        isActive() {
          return true;
        },
        close() {
          closedWatchers.push(tournamentId);
          page.watcher = null;
          page._watchTournamentId = '';
        }
      };
      page._watchTournamentId = tournamentId;
    };
    tournamentSync.closeWatcher = (page) => {
      if (page && page.watcher && typeof page.watcher.close === 'function') page.watcher.close();
      if (page) {
        page.watcher = null;
        page._watchTournamentId = '';
      }
    };

    ctx.startWatch('t_1');
    ctx.data.tournamentId = 't_2';
    ctx.startWatch('t_2');

    callbacks[0].onDoc({
      _id: 't_1',
      name: 'Old Tournament',
      updatedAt: '2026-03-14T10:00:00.000Z'
    }, { source: 'realtime' });
    callbacks[1].onDoc({
      _id: 't_2',
      name: 'New Tournament',
      updatedAt: '2026-03-14T10:05:00.000Z'
    }, { source: 'realtime' });

    assert.deepEqual(startCalls, ['t_1', 't_2']);
    assert.deepEqual(closedWatchers, ['t_1']);
    assert.equal(ctx.data.tournament && ctx.data.tournament.name, 'New Tournament');
    assert.deepEqual(ctx._applied.map((entry) => entry.doc.name), ['New Tournament']);
  } finally {
    tournamentSync.startWatch = originalStartWatch;
    tournamentSync.closeWatcher = originalCloseWatcher;
  }
});
