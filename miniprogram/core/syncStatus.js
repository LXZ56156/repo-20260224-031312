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
  const showStaleSyncHint = !!state.showStaleSyncHint;
  const syncUsingCache = !!state.syncUsingCache;
  const syncPollingFallback = !!state.syncPollingFallback;
  const syncRefreshing = !!state.syncRefreshing;
  const cachedAt = toTs(state.syncCachedAt);
  const lastUpdatedAt = toTs(state.syncLastUpdatedAt) || pickTournamentTimestamp(state.tournament);

  let syncStatusTone = 'info';
  let syncStatusText = '';
  const metaParts = [];

  if (networkOffline && syncUsingCache) {
    syncStatusTone = 'warning';
    syncStatusText = '当前离线，展示缓存数据';
  } else if (networkOffline) {
    syncStatusTone = 'warning';
    syncStatusText = '当前离线';
  } else if (syncUsingCache) {
    syncStatusTone = 'warning';
    syncStatusText = '当前展示缓存数据';
  } else if (showStaleSyncHint) {
    syncStatusTone = 'info';
    syncStatusText = '当前数据可能已过期';
  } else if (syncPollingFallback) {
    syncStatusTone = 'info';
    syncStatusText = '已降级为轮询同步';
  } else if (syncRefreshing) {
    syncStatusTone = 'neutral';
    syncStatusText = '正在同步最新数据';
  }

  if (syncPollingFallback) metaParts.push('实时监听不可用，已切换为轮询');
  if (syncUsingCache && cachedAt) metaParts.push(`缓存于 ${formatSyncTime(cachedAt)}`);
  if (!syncUsingCache && lastUpdatedAt) metaParts.push(`最近更新 ${formatSyncTime(lastUpdatedAt)}`);
  if (showStaleSyncHint && !syncUsingCache) metaParts.push('请手动刷新确认是否有新结果');
  if (syncRefreshing && !networkOffline) metaParts.push('正在重连或拉取最新数据');

  return {
    syncStatusVisible: !!syncStatusText,
    syncStatusTone,
    syncStatusText,
    syncStatusMeta: metaParts.join(' · '),
    syncStatusActionText: syncRefreshing && !networkOffline ? '同步中' : '刷新'
  };
}

module.exports = {
  buildSyncBannerState,
  formatSyncTime,
  getDefaultSyncState,
  pickTournamentTimestamp,
  toTs
};
