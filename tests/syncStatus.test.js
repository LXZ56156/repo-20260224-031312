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

test('buildSyncBannerState: offline + cache → warning with offline cache text', () => {
  const result = syncStatus.buildSyncBannerState({ networkOffline: true, syncUsingCache: true });
  assert.equal(result.syncStatusVisible, true);
  assert.equal(result.syncStatusTone, 'warning');
  assert.match(result.syncStatusText, /离线/);
  assert.match(result.syncStatusText, /缓存/);
});

test('buildSyncBannerState: offline only → warning', () => {
  const result = syncStatus.buildSyncBannerState({ networkOffline: true });
  assert.equal(result.syncStatusTone, 'warning');
  assert.match(result.syncStatusText, /离线/);
});

test('buildSyncBannerState: cache only → warning', () => {
  const result = syncStatus.buildSyncBannerState({ syncUsingCache: true });
  assert.equal(result.syncStatusTone, 'warning');
  assert.match(result.syncStatusText, /缓存/);
});

test('buildSyncBannerState: stale hint → info', () => {
  const result = syncStatus.buildSyncBannerState({ showStaleSyncHint: true });
  assert.equal(result.syncStatusTone, 'info');
  assert.match(result.syncStatusText, /过期/);
});

test('buildSyncBannerState: polling fallback → info', () => {
  const result = syncStatus.buildSyncBannerState({ syncPollingFallback: true });
  assert.equal(result.syncStatusTone, 'info');
  assert.match(result.syncStatusText, /轮询/);
});

test('buildSyncBannerState: refreshing → neutral with sync action text', () => {
  const result = syncStatus.buildSyncBannerState({ syncRefreshing: true });
  assert.equal(result.syncStatusTone, 'neutral');
  assert.match(result.syncStatusText, /同步/);
  assert.equal(result.syncStatusActionText, '同步中');
});

test('buildSyncBannerState: not refreshing → action text is 刷新', () => {
  const result = syncStatus.buildSyncBannerState({ syncUsingCache: true });
  assert.equal(result.syncStatusActionText, '刷新');
});

test('buildSyncBannerState: cache with cachedAt includes time in meta', () => {
  const now = new Date();
  now.setHours(10, 20, 0, 0);
  const result = syncStatus.buildSyncBannerState({
    syncUsingCache: true,
    syncCachedAt: now.getTime()
  });
  assert.match(result.syncStatusMeta, /缓存于/);
  assert.match(result.syncStatusMeta, /10:20/);
});

test('buildSyncBannerState: lastUpdatedAt shows in meta when not using cache', () => {
  const now = new Date();
  now.setHours(15, 45, 0, 0);
  const result = syncStatus.buildSyncBannerState({
    showStaleSyncHint: true,
    syncLastUpdatedAt: now.getTime()
  });
  assert.match(result.syncStatusMeta, /最近更新/);
  assert.match(result.syncStatusMeta, /15:45/);
});

test('buildSyncBannerState: priority order — offline+cache beats stale hint', () => {
  const result = syncStatus.buildSyncBannerState({
    networkOffline: true,
    syncUsingCache: true,
    showStaleSyncHint: true
  });
  assert.match(result.syncStatusText, /离线/);
});
