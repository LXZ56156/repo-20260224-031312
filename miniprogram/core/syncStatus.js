function toTs(value) {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  if (value instanceof Date) {
    const ts = value.getTime();
    return Number.isFinite(ts) ? ts : 0;
  }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return toTs(value.toDate());
    if (typeof value.seconds === 'number') {
      const ms = (Number(value.seconds) * 1000) + Math.floor(Number(value.nanoseconds || 0) / 1e6);
      return Number.isFinite(ms) ? ms : 0;
    }
  }
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function formatSyncTime(ts) {
  const value = toTs(ts);
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return `${hh}:${mm}`;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day} ${hh}:${mm}`;
}

function pickTournamentTimestamp(tournament) {
  const doc = tournament && typeof tournament === 'object' ? tournament : {};
  return (
    toTs(doc.updatedAtTs) ||
    toTs(doc.updatedAt) ||
    toTs(doc.modifiedAt) ||
    toTs(doc.createdAtTs) ||
    toTs(doc.createdAt)
  );
}

function getDefaultSyncState() {
  return {
    syncRefreshing: false,
    syncUsingCache: false,
    syncPollingFallback: false,
    syncCachedAt: 0,
    syncLastUpdatedAt: 0,
    syncStatusVisible: false,
    syncStatusTone: 'info',
    syncStatusText: '',
    syncStatusMeta: '',
    syncStatusActionText: '刷新'
  };
}

function buildSyncBannerState(state = {}) {
  const networkOffline = !!state.networkOffline;
  const syncUsingCache = !!state.syncUsingCache;
  const lastUpdatedAt = toTs(state.syncLastUpdatedAt) || pickTournamentTimestamp(state.tournament);
  // Polling, cache and background refresh state remain internal diagnostics.
  // Only a confirmed offline state needs a user-facing banner.
  return {
    syncStatusVisible: networkOffline,
    syncStatusTone: networkOffline ? 'warning' : 'info',
    syncStatusText: networkOffline ? '当前离线' : '',
    syncStatusMeta: networkOffline && !syncUsingCache && lastUpdatedAt
      ? `最近更新 ${formatSyncTime(lastUpdatedAt)}` : '',
    syncStatusActionText: '刷新'
  };
}

module.exports = {
  buildSyncBannerState,
  formatSyncTime,
  getDefaultSyncState,
  pickTournamentTimestamp,
  toTs
};
