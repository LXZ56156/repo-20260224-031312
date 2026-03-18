const storage = require('../../core/storage');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const cloneTournamentCore = require('../../core/cloneTournament');
const cloud = require('../../core/cloud');
const profileCore = require('../../core/profile');
const retryAction = require('../../core/retryAction');
const syncStatus = require('../../core/syncStatus');
const nav = require('../../core/nav');
const writeErrorUi = require('../../core/writeErrorUi');
const { normalizeTournament } = require('../../core/normalize');
const adGuard = require('../../core/adGuard');
const flow = require('../../core/uxFlow');
const systemInfo = require('../../core/systemInfo');
const envConfig = require('../../config/env');
const { buildHomeHeroCardState } = require('./heroCardState');

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function formatTime(d) {
  try {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
  } catch (e) {
    return '';
  }
}

function calcProgress(t) {
  const rounds = Array.isArray(t.rounds) ? t.rounds : [];
  let done = 0;
  let total = 0;
  for (const r of rounds) {
    const ms = Array.isArray(r.matches) ? r.matches : [];
    total += ms.length;
    for (const m of ms) {
      if (m && m.status === 'finished') done += 1;
    }
  }
  const M = Number(t.totalMatches) || total || 0;
  return { done, total: M || total };
}

function statusLabel(s) {
  if (s === 'running') return '进行中';
  if (s === 'draft') return '草稿';
  if (s === 'finished') return '已结束';
  if (s === 'missing') return '已移除';
  return '未知';
}

function statusClass(s) {
  if (s === 'running') return 'green';
  if (s === 'draft') return 'gray';
  if (s === 'finished') return 'red';
  return 'gray';
}

function isVisibleByFilter(item, filterStatus) {
  const status = String(filterStatus || 'all').trim();
  if (!item) return false;
  if (status === 'all') return true;
  return String(item.status || 'unknown') === status;
}

function buildMissingHomeItem(id) {
  return {
    _id: id,
    name: '赛事已移除',
    status: 'missing',
    statusLabel: statusLabel('missing'),
    statusClass: statusClass('missing'),
    playersCount: 0,
    creatorId: '',
    courts: 0,
    totalMatches: 0,
    finishedMatches: 0,
    createdAtText: '',
    updatedAtText: '',
    updatedAtTs: 0,
    _offset: 0
  };
}

function buildHomeItem(raw, fallbackId = '') {
  const t = normalizeTournament(raw || {});
  const players = Array.isArray(t.players) ? t.players : [];
  const { done, total } = calcProgress(t);
  const mTotalRaw = Number(t.totalMatches) || total || 0;
  const hasConfigured = (t.status !== 'draft') ? true : (t.settingsConfigured === true);
  const matchProgressText = (hasConfigured && mTotalRaw > 0) ? `${done}/${mTotalRaw}场` : '未设置';
  const updatedAt = t.updatedAt || t.createdAt;
  const updatedAtTs = (() => {
    try {
      return updatedAt ? (new Date(updatedAt)).getTime() : 0;
    } catch (_) {
      return 0;
    }
  })();

  return {
    _id: t._id || String(fallbackId || '').trim(),
    name: t.name || '未命名赛事',
    status: t.status || 'unknown',
    mode: flow.normalizeMode(t.mode || flow.MODE_MULTI_ROTATE),
    modeLabel: flow.getModeLabel(t.mode || flow.MODE_MULTI_ROTATE),
    statusLabel: statusLabel(t.status),
    statusClass: statusClass(t.status),
    playersCount: players.length,
    creatorId: t.creatorId || '',
    courts: Number(t.courts) || 1,
    totalMatches: mTotalRaw,
    finishedMatches: done,
    matchProgressText,
    createdAtText: formatTime(t.createdAt),
    updatedAtText: formatTime(updatedAt),
    updatedAtTs,
    _offset: 0
  };
}

function composeHomeSyncPatch(page, patch) {
  const basePatch = patch && typeof patch === 'object' ? { ...patch } : {};
  const state = {
    ...(page && page.data ? page.data : {}),
    ...basePatch
  };
  return {
    ...basePatch,
    ...syncStatus.buildSyncBannerState(state)
  };
}

function pickLatestUpdatedAt(items) {
  return (Array.isArray(items) ? items : []).reduce((maxTs, item) => {
    return Math.max(maxTs, Number((item && item.updatedAtTs) || 0) || 0);
  }, 0);
}

Page({
  data: {
    loading: false,
    loadError: false,
    showOnboarding: false,
    showProfileNudge: false,
    sortMode: 'updated',
    filterStatus: 'all',
    showHomeAdSlot: false,
    networkOffline: false,
    showEnvBadge: false,
    envBadgeLabel: '',
    canRetryAction: false,
    lastFailedActionText: '',
    heroCard: buildHomeHeroCardState([]),
    showHeroCard: true,
    showStaleSyncHint: false,
    syncRefreshing: false,
    syncUsingCache: false,
    syncPollingFallback: false,
    syncCachedAt: 0,
    syncLastUpdatedAt: 0,
    syncStatusVisible: false,
    syncStatusTone: 'info',
    syncStatusText: '',
    syncStatusMeta: '',
    syncStatusActionText: '刷新',
    visibleCount: 0,
    statusCountRunning: 0,
    statusCountDraft: 0,
    statusCountFinished: 0,
    statusCountMissing: 0,
    items: []
  },

  ...retryAction.createRetryMethods(),

  onLoad() {
    this._winWidth = systemInfo.getWindowMetrics().windowWidth || 375;
    this._delWidthRpx = 160;

    const app = getApp();
    this.setData(composeHomeSyncPatch(this, {
      networkOffline: !!(app && app.globalData && app.globalData.networkOffline),
      showOnboarding: !storage.isOnboardingDone(),
      showProfileNudge: this.shouldShowProfileNudge(),
      sortMode: storage.getHomeSortMode(),
      filterStatus: storage.getHomeFilterStatus()
    }));
    const runtimeEnv = (app && app.globalData && app.globalData.runtimeEnv) || envConfig.resolveRuntimeEnv();
    this.setData({
      showEnvBadge: !!runtimeEnv.showBadge,
      envBadgeLabel: String(runtimeEnv.shortLabel || runtimeEnv.label || '').trim()
    });
    if (storage.getEntryPruneVersion() < 1) storage.setEntryPruneVersion(1);

    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline, meta = {}) => {
        this.setData(composeHomeSyncPatch(this, { networkOffline: !!offline }));
        if (meta.reconnected) this.loadRecents();
      });
    }

    if (adGuard.shouldShowDailySplash()) adGuard.markSplashShown();
  },

  onUnload() {
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  onShow() {
    this.refreshProfileNudgeState();
    this.refreshHomeAdSlot();
    this.loadRecents();
  },

  onPullDownRefresh() {
    this.loadRecents().finally(() => wx.stopPullDownRefresh());
  },

  onRetry() {
    this.refreshHomeAdSlot();
    this.loadRecents();
  },

  shouldShowProfileNudge() {
    const profile = storage.getUserProfile();
    return !storage.isProfileNudgeDismissed() && !storage.isProfileComplete(profile);
  },

  refreshProfileNudgeState() {
    const showProfileNudge = this.shouldShowProfileNudge();
    if (showProfileNudge !== this.data.showProfileNudge) {
      this.setData({ showProfileNudge });
    }
  },

  dismissProfileNudge() {
    storage.setProfileNudgeDismissed(true);
    this.setData({ showProfileNudge: false });
  },

  goProfileFromNudge() {
    storage.setProfileNudgeDismissed(true);
    this.setData({ showProfileNudge: false });
    wx.navigateTo({
      url: profileCore.buildProfileUrl('/pages/home/index')
    });
  },

  refreshHomeAdSlot() {
    const showHomeAdSlot = adGuard.shouldExposePageSlot('home');
    this.setData({ showHomeAdSlot });
    if (showHomeAdSlot) adGuard.markPageExposed('home');
  },

  dismissOnboarding() {
    storage.setOnboardingDone(true);
    this.setData({ showOnboarding: false });
  },

  onChangeSortMode(e) {
    const mode = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.mode) || '').trim();
    if (!mode || mode === this.data.sortMode) return;
    storage.setHomeSortMode(mode);
    this.setData({ sortMode: mode });
    this.loadRecents();
  },

  onChangeFilterStatus(e) {
    const status = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.status) || '').trim();
    if (!status || status === this.data.filterStatus) return;
    storage.setHomeFilterStatus(status);
    this._closeAllSwipe();
    this.setData({ filterStatus: status }, () => this.refreshVisibleState());
  },

  sortItems(items, mode) {
    const list = Array.isArray(items) ? items.slice() : [];
    const m = String(mode || '').trim();
    const statusOrder = { running: 0, draft: 1, finished: 2, missing: 3, unknown: 4 };
    list.sort((a, b) => {
      if (m === 'players') {
        const pDiff = (Number(b.playersCount) || 0) - (Number(a.playersCount) || 0);
        if (pDiff !== 0) return pDiff;
      } else if (m === 'status') {
        const sa = statusOrder[String(a.status || 'unknown')] ?? 9;
        const sb = statusOrder[String(b.status || 'unknown')] ?? 9;
        if (sa !== sb) return sa - sb;
      }
      return (Number(b.updatedAtTs) || 0) - (Number(a.updatedAtTs) || 0);
    });
    return list;
  },

  refreshVisibleState() {
    const items = Array.isArray(this.data.items) ? this.data.items : [];
    const filterStatus = this.data.filterStatus;
    let visibleCount = 0;
    let running = 0;
    let draft = 0;
    let finished = 0;
    let missing = 0;
    for (const item of items) {
      const status = String((item && item.status) || 'unknown');
      if (status === 'running') running += 1;
      else if (status === 'draft') draft += 1;
      else if (status === 'finished') finished += 1;
      else missing += 1;
      if (isVisibleByFilter(item, filterStatus)) visibleCount += 1;
    }

    const openid = (getApp().globalData && getApp().globalData.openid) || storage.get('openid', '');
    const heroCard = buildHomeHeroCardState(items, this._rawDocsMap || {}, openid);
    const showHeroCard = !heroCard.empty || items.length === 0;

    this.setData({
      visibleCount,
      heroCard,
      showHeroCard,
      statusCountRunning: running,
      statusCountDraft: draft,
      statusCountFinished: finished,
      statusCountMissing: missing
    });
  },

  async loadRecents() {
    this.setData(composeHomeSyncPatch(this, {
      loading: true,
      loadError: false,
      syncRefreshing: true
    }));
    const ids = storage.getRecentTournamentIds();
    if (!ids.length) {
      this.setData(composeHomeSyncPatch(this, {
        loading: false,
        loadError: false,
        showStaleSyncHint: false,
        syncRefreshing: false,
        syncUsingCache: false,
        syncCachedAt: 0,
        syncLastUpdatedAt: 0,
        items: []
      }), () => this.refreshVisibleState());
      this.clearLastFailedAction();
      return;
    }

    const db = wx.cloud.database();
    const _ = db.command;
    let docs = [];

    try {
      const res = await db.collection('tournaments').where({ _id: _.in(ids) }).get();
      docs = (res && res.data) || [];
    } catch (e) {
      const cachedEntries = ids
        .map((id) => {
          const cacheInfo = storage.getLocalTournamentCacheInfo(id);
          const cachedDoc = cacheInfo && cacheInfo.doc;
          if (!cachedDoc || typeof cachedDoc !== 'object') return null;
          return {
            item: buildHomeItem(cachedDoc, id),
            cachedAt: Number((cacheInfo && cacheInfo.cachedAt) || 0) || 0
          };
        })
        .filter(Boolean);
      const cachedItems = cachedEntries.map((entry) => entry.item);
      const latestCachedAt = cachedEntries.reduce((maxTs, entry) => Math.max(maxTs, Number(entry.cachedAt || 0) || 0), 0);

      if (!cachedItems.length) {
        wx.showToast({ title: '读取赛事记录失败', icon: 'none' });
        this.setData(composeHomeSyncPatch(this, {
          loading: false,
          loadError: true,
          showStaleSyncHint: false,
          syncRefreshing: false,
          syncUsingCache: false,
          syncCachedAt: 0
        }));
        return;
      }

      this._closeAllSwipe();
      this.setData(composeHomeSyncPatch(this, {
        loading: false,
        loadError: false,
        showStaleSyncHint: true,
        syncRefreshing: false,
        syncUsingCache: true,
        syncCachedAt: latestCachedAt,
        syncLastUpdatedAt: pickLatestUpdatedAt(cachedItems),
        items: this.sortItems(cachedItems, this.data.sortMode)
      }), () => this.refreshVisibleState());
      this.clearLastFailedAction();
      return;
    }

    const map = {};
    for (const d of docs) {
      map[d._id] = d;
      storage.upsertLocalCompletedTournamentSnapshot(d);
    }
    this._rawDocsMap = map;

    const items = ids.map((id) => {
      const raw = map[id];
      if (!raw) {
        storage.removeLocalCompletedTournamentSnapshot(id);
        return buildMissingHomeItem(id);
      }
      return buildHomeItem(raw, id);
    });

    const sortedItems = this.sortItems(items, this.data.sortMode);
    this._closeAllSwipe();
    this.setData(composeHomeSyncPatch(this, {
      loading: false,
      loadError: false,
      showStaleSyncHint: false,
      syncRefreshing: false,
      syncUsingCache: false,
      syncCachedAt: 0,
      syncLastUpdatedAt: pickLatestUpdatedAt(sortedItems),
      items: sortedItems
    }), () => this.refreshVisibleState());
    this.clearLastFailedAction();
  },

  goCreate() {
    if (this.data.showOnboarding) this.dismissOnboarding();
    wx.switchTab({ url: '/pages/launch/index' });
  },

  goRanking(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: nav.buildTournamentUrl('/pages/ranking/index', id) });
  },

  goLobby(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: nav.buildTournamentUrl('/pages/lobby/index', id) });
  },

  onHeroPrimaryTap(e) {
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const action = String(dataset.action || '').trim();
    const id = String(dataset.id || '').trim();
    if (action === 'create') {
      this.goCreate();
      return;
    }
    if (action === 'batch') {
      const round = Number(dataset.round);
      const match = Number(dataset.match);
      if (id && round >= 0 && match >= 0) {
        wx.navigateTo({
          url: nav.buildTournamentUrl('/pages/match/index', id, {
            roundIndex: round, matchIndex: match, batch: 1
          })
        });
        return;
      }
    }
    if (action === 'analytics') {
      if (id) {
        wx.navigateTo({ url: nav.buildTournamentUrl('/pages/analytics/index', id) });
        return;
      }
    }
    if (action === 'settings') {
      if (id) {
        wx.navigateTo({ url: nav.buildTournamentUrl('/pages/settings/index', id, { section: 'params' }) });
        return;
      }
    }
    if (action === 'start') {
      if (id) {
        nav.setLobbyIntent(id, 'start');
        wx.navigateTo({ url: nav.buildTournamentUrl('/pages/lobby/index', id) });
        return;
      }
    }
    if (action === 'schedule') {
      if (id) {
        wx.navigateTo({ url: nav.buildTournamentUrl('/pages/schedule/index', id) });
        return;
      }
    }
    if (action === 'ranking') {
      this.goRanking({ currentTarget: { dataset } });
      return;
    }
    this.goLobby({ currentTarget: { dataset } });
  },

  async onCloneTap(e, options = {}) {
    const sourceTournamentId = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim();
    if (!sourceTournamentId) return;
    const actionKey = `home:cloneTournament:${sourceTournamentId}`;
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'clone');
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.runCriticalWrite(actionKey, async () => {
      wx.showLoading({ title: '复制中...' });
      try {
        const nextId = await cloneTournamentCore.cloneTournament(sourceTournamentId, { clientRequestId });
        wx.hideLoading();
        this.clearLastFailedAction();
        wx.showToast({ title: '已复制', icon: 'success' });
        wx.navigateTo({ url: nav.buildTournamentUrl('/pages/lobby/index', nextId) });
      } catch (err) {
        wx.hideLoading();
        this.setLastFailedAction('再办一场', () => this.onCloneTap({ currentTarget: { dataset: { id: sourceTournamentId } } }, { clientRequestId }), { actionKey });
        this.handleWriteError(err, '复制失败', () => this.loadRecents());
      }
    });
  },

  handleWriteError(err, fallbackMessage, onRefresh) {
    writeErrorUi.presentWriteError({
      err,
      fallbackMessage,
      conflictContent: '数据已被其他人更新，刷新后可重试该操作。',
      onRefresh
    });
  },

  _px2rpx(px) {
    return Math.round((px * 750) / (this._winWidth || 375));
  },

  _setOffset(idx, offsetRpx) {
    this.setData({ [`items[${idx}]._offset`]: offsetRpx });
  },

  _getItem(idx) {
    return (this.data.items || [])[idx];
  },

  _closeAllSwipe() {
    const list = this.data.items || [];
    const patch = {};
    for (let i = 0; i < list.length; i += 1) {
      if ((list[i] && list[i]._offset) || 0) patch[`items[${i}]._offset`] = 0;
    }
    if (Object.keys(patch).length) this.setData(patch);
    this._openRow = null;
    this._touch = null;
  },

  onTouchStart(e) {
    const idx = Number((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.idx));
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim();
    const touch = e.touches && e.touches[0];
    if (!touch || Number.isNaN(idx)) return;

    if (this._openRow && this._openRow.idx !== idx) {
      this._setOffset(this._openRow.idx, 0);
      this._openRow = null;
    }

    const item = this._getItem(idx) || {};
    this._touch = {
      id,
      idx,
      startX: touch.clientX,
      startY: touch.clientY,
      startOffset: Number(item._offset) || 0,
      locked: false
    };
  },

  onTouchMove(e) {
    if (!this._touch) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - this._touch.startX;
    const dy = touch.clientY - this._touch.startY;
    if (!this._touch.locked) {
      if (Math.abs(dx) < 6) return;
      if (Math.abs(dx) <= Math.abs(dy) + 6) {
        this._touch = null;
        return;
      }
      this._touch.locked = true;
    }

    const dxRpx = this._px2rpx(dx);
    const del = -this._delWidthRpx;
    let next = this._touch.startOffset + dxRpx;
    if (next < del) next = del;
    if (next > 0) next = 0;
    this._setOffset(this._touch.idx, next);
  },

  onTouchEnd() {
    if (!this._touch) return;
    const idx = this._touch.idx;
    const item = this._getItem(idx) || {};
    const cur = Number(item._offset) || 0;
    const shouldOpen = Math.abs(cur) > (this._delWidthRpx / 2);
    const next = shouldOpen ? -this._delWidthRpx : 0;
    this._setOffset(idx, next);
    this._openRow = shouldOpen ? { idx } : null;
    this._touch = null;
  },

  onCardTap(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim();
    const idx = Number((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.idx));
    if (!id || Number.isNaN(idx)) return;

    if (this._openRow && this._openRow.idx === idx) {
      const item = this._getItem(idx) || {};
      if ((Number(item._offset) || 0) !== 0) {
        this._setOffset(idx, 0);
        this._openRow = null;
        return;
      }
    }

    const item = this._getItem(idx) || {};
    const status = String(item.status || '').trim();
    if (status === 'finished') {
      wx.navigateTo({ url: nav.buildTournamentUrl('/pages/analytics/index', id) });
      return;
    }
    if (status === 'running') {
      wx.navigateTo({ url: nav.buildTournamentUrl('/pages/schedule/index', id) });
      return;
    }
    wx.navigateTo({ url: nav.buildTournamentUrl('/pages/lobby/index', id) });
  },

  onQuickActionTap(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim();
    const status = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.status) || '').trim();
    if (!id) return;
    if (status === 'finished') {
      wx.navigateTo({ url: nav.buildTournamentUrl('/pages/analytics/index', id) });
      return;
    }
    if (status === 'running') {
      wx.navigateTo({ url: nav.buildTournamentUrl('/pages/schedule/index', id) });
      return;
    }
    wx.navigateTo({ url: nav.buildTournamentUrl('/pages/lobby/index', id) });
  },

  async onDeleteTap(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim();
    if (!id) return;
    storage.removeRecentTournamentId(id);
    storage.removeLocalCompletedTournamentSnapshot(id);
    storage.removeLocalTournamentCache(id);
    this.clearLastFailedAction();
    await this.loadRecents();
    wx.showToast({ title: '已删除', icon: 'success' });
  }
});
