const storage = require('../../core/storage');
const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const { normalizeTournament } = require('../../core/normalize');
const adGuard = require('../../core/adGuard');
const flow = require('../../core/uxFlow');
const envConfig = require('../../config/env');

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
    continueItem: null,
    visibleCount: 0,
    statusCountRunning: 0,
    statusCountDraft: 0,
    statusCountFinished: 0,
    statusCountMissing: 0,
    items: []
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this._winWidth = sys.windowWidth || 375;
    this._delWidthRpx = 160;

    const app = getApp();
    this.setData({
      networkOffline: !!(app && app.globalData && app.globalData.networkOffline),
      showOnboarding: !storage.isOnboardingDone(),
      showProfileNudge: this.shouldShowProfileNudge(),
      sortMode: storage.getHomeSortMode(),
      filterStatus: storage.getHomeFilterStatus()
    });
    const runtimeEnv = (app && app.globalData && app.globalData.runtimeEnv) || envConfig.resolveRuntimeEnv();
    this.setData({
      showEnvBadge: !!runtimeEnv.showBadge,
      envBadgeLabel: String(runtimeEnv.shortLabel || runtimeEnv.label || '').trim()
    });
    if (storage.getEntryPruneVersion() < 1) storage.setEntryPruneVersion(1);

    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.setData({ networkOffline: !!offline });
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
      url: `/pages/profile/index?returnUrl=${encodeURIComponent('/pages/home/index')}`
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

    const continueItem = items
      .filter((x) => String(x.status || '') === 'running')
      .slice()
      .sort((a, b) => (Number(b.updatedAtTs) || 0) - (Number(a.updatedAtTs) || 0))[0] || null;

    this.setData({
      visibleCount,
      continueItem,
      statusCountRunning: running,
      statusCountDraft: draft,
      statusCountFinished: finished,
      statusCountMissing: missing
    });
  },

  setLastFailedAction(text, fn) {
    this._lastFailedAction = typeof fn === 'function' ? fn : null;
    this.setData({
      canRetryAction: !!this._lastFailedAction,
      lastFailedActionText: String(text || '').trim() || '上次操作失败，可重试'
    });
  },

  clearLastFailedAction() {
    this._lastFailedAction = null;
    this.setData({ canRetryAction: false, lastFailedActionText: '' });
  },

  retryLastAction() {
    if (typeof this._lastFailedAction === 'function') this._lastFailedAction();
  },

  async loadRecents() {
    this.setData({ loading: true, loadError: false });
    const ids = storage.getRecentTournamentIds();
    if (!ids.length) {
      this.setData({
        loading: false,
        loadError: false,
        items: [],
        continueItem: null,
        visibleCount: 0,
        statusCountRunning: 0,
        statusCountDraft: 0,
        statusCountFinished: 0,
        statusCountMissing: 0
      });
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
      wx.showToast({ title: '读取赛事记录失败', icon: 'none' });
      this.setData({ loading: false, loadError: true });
      return;
    }

    const map = {};
    for (const d of docs) {
      map[d._id] = d;
      storage.upsertLocalCompletedTournamentSnapshot(d);
    }

    const items = ids.map((id) => {
      const raw = map[id];
      if (!raw) {
        storage.removeLocalCompletedTournamentSnapshot(id);
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

      const t = normalizeTournament(raw);
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
        _id: t._id,
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
    });

    this._closeAllSwipe();
    this.setData({
      loading: false,
      loadError: false,
      items: this.sortItems(items, this.data.sortMode)
    }, () => this.refreshVisibleState());
    this.clearLastFailedAction();
  },

  goCreate() {
    if (this.data.showOnboarding) this.dismissOnboarding();
    wx.switchTab({ url: '/pages/launch/index' });
  },

  goLobby(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/lobby/index?tournamentId=${id}` });
  },

  async onCloneTap(e) {
    const sourceTournamentId = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim();
    if (!sourceTournamentId) return;
    const actionKey = `home:cloneTournament:${sourceTournamentId}`;
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.run(actionKey, async () => {
      wx.showLoading({ title: '复制中...' });
      try {
        const res = await cloud.call('cloneTournament', { sourceTournamentId });
        const nextId = String((res && res.tournamentId) || '').trim();
        if (!nextId) throw new Error('复制失败');
        wx.hideLoading();
        this.clearLastFailedAction();
        storage.addRecentTournamentId(nextId);
        wx.showToast({ title: '已复制', icon: 'success' });
        wx.navigateTo({ url: `/pages/lobby/index?tournamentId=${nextId}` });
      } catch (err) {
        wx.hideLoading();
        this.setLastFailedAction('再办一场', () => this.onCloneTap({ currentTarget: { dataset: { id: sourceTournamentId } } }));
        this.handleWriteError(err, '复制失败', () => this.loadRecents());
      }
    });
  },

  handleWriteError(err, fallbackMessage, onRefresh) {
    cloud.presentWriteError({
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

    wx.navigateTo({ url: `/pages/lobby/index?tournamentId=${id}` });
  },

  async onDeleteTap(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim();
    if (!id) return;

    const openid = (getApp().globalData.openid || storage.get('openid', ''));
    const item = (this.data.items || []).find((x) => x && x._id === id) || {};
    const isCreator = !!(item.creatorId && openid && item.creatorId === openid);
    const canDeleteCloud = isCreator && item.status !== 'missing';

    const itemList = canDeleteCloud ? ['仅删除本机记录', '删除云端赛事'] : ['仅删除本机记录'];
    wx.showActionSheet({
      itemList,
      success: async (res) => {
        const tapIndex = res.tapIndex;
        if (tapIndex === 0) {
          storage.removeRecentTournamentId(id);
          storage.removeLocalCompletedTournamentSnapshot(id);
          storage.removeLocalTournamentCache(id);
          this.clearLastFailedAction();
          this.loadRecents();
          return;
        }
        if (tapIndex === 1 && canDeleteCloud) {
          wx.showModal({
            title: '删除云端赛事？',
            content: '该操作不可恢复。删除后，群内分享链接将失效。',
            confirmText: '删除',
            confirmColor: '#ef4444',
            success: async (r) => {
              if (!r.confirm) return;
              const actionKey = `home:deleteTournament:${id}`;
              if (actionGuard.isBusy(actionKey)) return;
              await actionGuard.run(actionKey, async () => {
                wx.showLoading({ title: '删除中...' });
                try {
                  await cloud.call('deleteTournament', { tournamentId: id });
                  wx.hideLoading();
                  this.clearLastFailedAction();
                  storage.removeRecentTournamentId(id);
                  storage.removeLocalCompletedTournamentSnapshot(id);
                  storage.removeLocalTournamentCache(id);
                  await this.loadRecents();
                  wx.showToast({ title: '已删除', icon: 'success' });
                } catch (err) {
                  wx.hideLoading();
                  this.setLastFailedAction('删除云端赛事', () => this.onDeleteTap({ currentTarget: { dataset: { id } } }));
                  this.handleWriteError(err, '删除失败', () => this.loadRecents());
                }
              });
            }
          });
        }
      }
    });
  }
});
