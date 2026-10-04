const test = require('node:test');
const assert = require('node:assert/strict');

const syncStatus = require('../miniprogram/core/syncStatus');

// --- toTs ---

test('toTs returns 0 for falsy values', () => {
  assert.equal(syncStatus.toTs(null), 0);
  assert.equal(syncStatus.toTs(undefined), 0);
  assert.equal(syncStatus.toTs(0), 0);
  assert.equal(syncStatus.toTs(''), 0);
});

test('toTs returns milliseconds for large numbers (already ms)', () => {
  const ts = 1710000000000;
  assert.equal(syncStatus.toTs(ts), ts);
});

test('toTs converts seconds to milliseconds for small numbers', () => {
  const secs = 1710000000;
  assert.equal(syncStatus.toTs(secs), secs * 1000);
});

test('toTs handles Date objects', () => {
  const date = new Date('2026-03-16T00:00:00.000Z');
  assert.equal(syncStatus.toTs(date), date.getTime());
});

test('toTs handles ISO string', () => {
  const iso = '2026-03-16T12:00:00.000Z';
  assert.equal(syncStatus.toTs(iso), new Date(iso).getTime());
});

test('toTs handles Firestore-like object with toDate()', () => {
  const firestoreTs = {
    toDate() { return new Date('2026-03-16T00:00:00.000Z'); }
  };
  assert.equal(syncStatus.toTs(firestoreTs), new Date('2026-03-16T00:00:00.000Z').getTime());
});

test('toTs handles Firestore-like object with seconds/nanoseconds', () => {
  const ts = { seconds: 1710000000, nanoseconds: 500000000 };
  assert.equal(syncStatus.toTs(ts), 1710000000 * 1000 + 500);
});

test('toTs returns 0 for invalid date string', () => {
  assert.equal(syncStatus.toTs('not-a-date'), 0);
});

// --- pickTournamentTimestamp ---

test('pickTournamentTimestamp picks updatedAtTs first', () => {
  const doc = { updatedAtTs: 1710000000000, updatedAt: '2020-01-01', createdAtTs: 1000 };
  assert.equal(syncStatus.pickTournamentTimestamp(doc), 1710000000000);
});

test('pickTournamentTimestamp falls back to updatedAt', () => {
  const doc = { updatedAt: '2026-03-16T12:00:00.000Z' };
  assert.equal(syncStatus.pickTournamentTimestamp(doc), new Date('2026-03-16T12:00:00.000Z').getTime());
});

test('pickTournamentTimestamp falls back to createdAtTs', () => {
  const doc = { createdAtTs: 1710000000000 };
  assert.equal(syncStatus.pickTournamentTimestamp(doc), 1710000000000);
});

test('pickTournamentTimestamp returns 0 for empty doc', () => {
  assert.equal(syncStatus.pickTournamentTimestamp({}), 0);
});

test('pickTournamentTimestamp returns 0 for null', () => {
  assert.equal(syncStatus.pickTournamentTimestamp(null), 0);
});

// --- formatSyncTime ---

test('formatSyncTime returns empty string for falsy', () => {
  assert.equal(syncStatus.formatSyncTime(0), '');
  assert.equal(syncStatus.formatSyncTime(null), '');
});

test('formatSyncTime returns HH:MM for today timestamps', () => {
  const now = new Date();
  now.setHours(14, 30, 0, 0);
  const result = syncStatus.formatSyncTime(now.getTime());
  assert.equal(result, '14:30');
});

test('formatSyncTime returns MM-DD HH:MM for non-today timestamps', () => {
  const date = new Date('2025-06-15T09:05:00');
  const result = syncStatus.formatSyncTime(date.getTime());
  assert.equal(result, '06-15 09:05');
});

// --- getDefaultSyncState ---

test('getDefaultSyncState returns correct defaults', () => {
  const state = syncStatus.getDefaultSyncState();
  assert.equal(state.syncRefreshing, false);
  assert.equal(state.syncUsingCache, false);
  assert.equal(state.syncPollingFallback, false);
  assert.equal(state.syncCachedAt, 0);
  assert.equal(state.syncLastUpdatedAt, 0);
  assert.equal(state.syncStatusVisible, false);
  assert.equal(state.syncStatusTone, 'info');
  assert.equal(state.syncStatusText, '');
  assert.equal(state.syncStatusMeta, '');
  assert.equal(state.syncStatusActionText, '刷新');
});

// --- buildSyncBannerState ---

test('buildSyncBannerState: no flags → not visible', () => {
  const result = syncStatus.buildSyncBannerState({});
  assert.equal(result.syncStatusVisible, false);
  assert.equal(result.syncStatusText, '');
});

test('buildSyncBannerState: offline + cache reports only the actionable offline state', () => {
  const result = syncStatus.buildSyncBannerState({ networkOffline: true, syncUsingCache: true });
  assert.equal(result.syncStatusVisible, true);
  assert.equal(result.syncStatusTone, 'warning');
  assert.match(result.syncStatusText, /离线/);
  assert.doesNotMatch(result.syncStatusText, /缓存/);
  assert.equal(result.syncStatusMeta, '');
});

test('buildSyncBannerState: offline only → warning', () => {
  const result = syncStatus.buildSyncBannerState({ networkOffline: true });
  assert.equal(result.syncStatusTone, 'warning');
  assert.match(result.syncStatusText, /离线/);
});

test('buildSyncBannerState: online cache stays silent instead of changing banner copy', () => {
  const result = syncStatus.buildSyncBannerState({
    syncUsingCache: true,
    showStaleSyncHint: true,
    syncPollingFallback: true
  });
  assert.equal(result.syncStatusVisible, false);
  assert.equal(result.syncStatusText, '');
  assert.equal(result.syncStatusMeta, '');
});

test('buildSyncBannerState: online stale hint stays silent', () => {
  const result = syncStatus.buildSyncBannerState({ showStaleSyncHint: true });
  assert.equal(result.syncStatusTone, 'info');
  assert.equal(result.syncStatusVisible, false);
  assert.equal(result.syncStatusText, '');
  assert.equal(result.syncStatusMeta, '');
});

test('buildSyncBannerState: online polling fallback stays silent', () => {
  const result = syncStatus.buildSyncBannerState({ syncPollingFallback: true });
  assert.equal(result.syncStatusTone, 'info');
  assert.equal(result.syncStatusVisible, false);
  assert.equal(result.syncStatusText, '');
  assert.equal(result.syncStatusMeta, '');
});

test('buildSyncBannerState: refreshing alone stays silent', () => {
  const result = syncStatus.buildSyncBannerState({ syncRefreshing: true });
  assert.equal(result.syncStatusVisible, false);
  assert.equal(result.syncStatusText, '');
  assert.equal(result.syncStatusMeta, '');
  assert.equal(result.syncStatusActionText, '刷新');
});

test('buildSyncBannerState: not refreshing → action text is 刷新', () => {
  const result = syncStatus.buildSyncBannerState({ syncUsingCache: true });
  assert.equal(result.syncStatusActionText, '刷新');
});

test('buildSyncBannerState: online stale background refresh stays silent', () => {
  const result = syncStatus.buildSyncBannerState({
    showStaleSyncHint: true,
    syncRefreshing: true,
    syncLastUpdatedAt: new Date('2026-03-16T08:30:00.000Z').getTime()
  });
  assert.equal(result.syncStatusVisible, false);
  assert.equal(result.syncStatusTone, 'info');
  assert.equal(result.syncStatusText, '');
  assert.equal(result.syncStatusActionText, '刷新');
  assert.equal(result.syncStatusMeta, '');
});

test('buildSyncBannerState: silent online cache omits cachedAt meta', () => {
  const now = new Date();
  now.setHours(10, 20, 0, 0);
  const result = syncStatus.buildSyncBannerState({
    syncUsingCache: true,
    syncCachedAt: now.getTime()
  });
  assert.equal(result.syncStatusVisible, false);
  assert.equal(result.syncStatusMeta, '');
});

test('buildSyncBannerState: offline lastUpdatedAt shows in meta when not using cache', () => {
  const now = new Date();
  now.setHours(15, 45, 0, 0);
  const result = syncStatus.buildSyncBannerState({
    networkOffline: true,
    syncLastUpdatedAt: now.getTime()
  });
  assert.match(result.syncStatusMeta, /最近更新/);
  assert.match(result.syncStatusMeta, /15:45/);
});

test('buildSyncBannerState keeps every online sync implementation state silent and offline actionable', () => {
  const flags = ['syncUsingCache', 'syncPollingFallback', 'syncRefreshing', 'showStaleSyncHint'];
  for (let mask = 0; mask < 16; mask += 1) {
    const state = {
      networkOffline: false,
      syncLastUpdatedAt: 1710000000000,
      syncCachedAt: 1710000000000,
      error: { message: 'SDK watch fallback reconnect cloud.database Error' }
    };
    flags.forEach((flag, index) => { state[flag] = !!(mask & (1 << index)); });
    const before = { ...state };
    const online = syncStatus.buildSyncBannerState(state);
    assert.equal(online.syncStatusVisible, false, `online flags ${mask}`);
    assert.equal(online.syncStatusText, '', `online text ${mask}`);
    assert.equal(online.syncStatusMeta, '', `online meta ${mask}`);
    assert.equal(online.syncStatusActionText, '刷新', `online action ${mask}`);

    const offline = syncStatus.buildSyncBannerState({ ...state, networkOffline: true });
    assert.equal(offline.syncStatusVisible, true, `offline flags ${mask}`);
    assert.equal(offline.syncStatusTone, 'warning');
    assert.equal(offline.syncStatusText, '当前离线');
    assert.equal(offline.syncStatusActionText, '刷新');
    assert.doesNotMatch(
      [offline.syncStatusText, offline.syncStatusMeta, offline.syncStatusActionText].join(' '),
      /轮询|降级|监听|重连|拉取|后台|缓存|过期|SDK|database|Error/i,
      `offline implementation copy ${mask}`
    );
    assert.deepEqual(state, before, `diagnostic input preserved ${mask}`);
  }
});

test('buildSyncBannerState: priority order — offline+cache beats stale hint', () => {
  const result = syncStatus.buildSyncBannerState({
    networkOffline: true,
    syncUsingCache: true,
    showStaleSyncHint: true
  });
  assert.match(result.syncStatusText, /离线/);
});
