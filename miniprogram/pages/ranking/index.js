const normalize = require('../../core/normalize');
const nav = require('../../core/nav');
const pageTournamentSync = require('../../core/pageTournamentSync');
const rankingCore = require('../../core/ranking');
const flow = require('../../core/uxFlow');
const matchPrimaryNav = require('../../core/matchPrimaryNav');

const rankingSyncController = pageTournamentSync.createTournamentSyncMethods({
  loadErrorMessages: {
    notFoundMessage: '链接可能已失效，或比赛已被删除。'
  },
  buildRemoteState() {
    return {
      loadError: false,
      showStaleSyncHint: false,
      loadErrorTitle: '加载失败',
      loadErrorMessage: '请检查网络后重试。',
      showLoadErrorHome: false
    };
  }
});

Page({
  data: {
    tournamentId: '',
    tournament: null,
    rankings: [],
    rankingTypeLabel: '个人榜',
    loadingSkeletonRows: [1, 2, 3, 4, 5],
    networkOffline: false,
    showStaleSyncHint: false,
    loadError: false,
    loadErrorTitle: '加载失败',
    loadErrorMessage: '请检查网络后重试。',
    showLoadErrorHome: false,
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
    primaryNavCurrent: 'ranking',
    primaryNavItems: []
  },

  ...rankingSyncController,

  onLoad(options) {
    const tid = options.tournamentId;
    pageTournamentSync.initTournamentSync(this);
    this.setData({
      tournamentId: tid,
      primaryNavItems: matchPrimaryNav.getPrimaryNavItems('ranking', tid)
    });

    const app = getApp();
    const initialOffline = !!(app && app.globalData && app.globalData.networkOffline);
    this.setData(pageTournamentSync.composePageSyncPatch(this, { networkOffline: initialOffline }));
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.handleNetworkChange(offline);
      });
    }

    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
    pageTournamentSync.pauseTournamentSync(this);
  },

  onShow() {
    const currentId = String(this.data.tournamentId || '').trim();
    nav.consumeRefreshFlag(currentId);
    // 兜底刷新：部分真机 onSnapshot 监听可能不稳定
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.hasActiveWatch(this.data.tournamentId)) this.startWatch(this.data.tournamentId);
  },

  onUnload() {
    pageTournamentSync.teardownTournamentSync(this);
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  applyTournament(t) {
    if (!t) return;
    t = normalize.normalizeTournament(t);
    const mode = flow.normalizeMode(t.mode || flow.MODE_MULTI_ROTATE);
    const rankingTypeLabel = (mode === flow.MODE_SQUAD_DOUBLES || mode === flow.MODE_FIXED_PAIR_RR) ? '队伍榜' : '个人榜';
    const status = String(t.status || '').trim();
    this.setData({
      loadError: false,
      tournament: t,
      rankings: rankingCore.buildRankingWithTrend(t),
      rankingTypeLabel,
      primaryNavItems: matchPrimaryNav.getPrimaryNavItems('ranking', this.data.tournamentId, { showAnalytics: status === 'finished' })
    });
  },

  onPrimaryNavTap(e) {
    const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '').trim();
    matchPrimaryNav.navigateToPrimary(key, this.data.tournamentId, 'ranking');
  },

  goHome() {
    nav.goHome();
  }
});
