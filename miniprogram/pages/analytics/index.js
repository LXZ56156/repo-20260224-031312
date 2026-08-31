const actionGuard = require('../../core/actionGuard');
const auth = require('../../core/auth');
const clientRequest = require('../../core/clientRequest');
const cloneTournamentCore = require('../../core/cloneTournament');
const loading = require('../../core/loading');
const pageTournamentSync = require('../../core/pageTournamentSync');
const writeErrorUi = require('../../core/writeErrorUi');
const retryAction = require('../../core/retryAction');
const nav = require('../../core/nav');
const adGuard = require('../../core/adGuard');
const pageTitle = require('../../core/pageTitle');
const shareCardStats = require('../../core/shareCardStats');
const sharePageMixin = require('../../core/sharePageMixin');
const tournamentEntry = require('../../core/tournamentEntry');
const growthTracker = require('../../core/growthTracker');
const analyticsLogic = require('./logic');

const analyticsSyncController = pageTournamentSync.createTournamentSyncMethods();

var shareMixin = sharePageMixin.createSharePageMixin({
  canvasSelector: '#shareCardCanvas',
  posterCanvasSelector: '#posterCanvas',
  buildShareCardData: function (tournament) {
    var openid = this.openid || (getApp().globalData.openid || '');
    var playerStats = this.data.playerStats || [];
    var currentPlayer = shareCardStats.findViewerRankingRow(tournament, playerStats, openid);
    if (!currentPlayer) {
      if (playerStats.length) currentPlayer = playerStats[0];
      else throw new Error('no player data');
    }
    var players = Array.isArray(tournament.players) ? tournament.players : [];
    var playerRecord = players.find(function (p) { return String(p.id || '') === String(currentPlayer.playerId || currentPlayer.entityId || ''); }) || {};
    var cardStats = shareCardStats.buildShareCardStats(tournament, currentPlayer);
    var statusText = String(tournament.status || '').trim() === 'finished' ? '最终排名出炉' : '实时排名更新中';
    var modeLabel = this.data.modeLabel || '';
    return {
      userName: currentPlayer.name || '球员',
      eventName: tournament.name || '羽毛球比赛',
      mode: modeLabel ? modeLabel + ' · ' + statusText : statusText,
      wins: currentPlayer.wins || 0,
      losses: currentPlayer.losses || 0,
      winRate: cardStats.winRate,
      totalMatches: cardStats.totalMatches,
      maxWinStreak: cardStats.maxWinStreak,
      avgScore: cardStats.avgScore,
      rank: Number(currentPlayer.rank) || 1,
      avatarUrl: String(playerRecord.avatar || playerRecord.avatarUrl || ''),
      appName: '羽球轮转助手'
    };
  }
});

Page({
  data: {
    tournamentId: '',
    tournament: null,
    summary: null,
    top3: [],
    top3Cards: [],
    playerStats: [],
    pairHot: [],
    duelHot: [],
    rankingTitle: '球员数据',
    rankingUnit: '人',
    modeLabel: '',
    statusLabel: '',
    topSectionTitle: 'TOP 3',
    heroHeadline: '',
    heroStats: [],
    summaryStats: [],
    focusFacts: [],
    fullRankings: [],
    displayRankings: [],
    reportLines: [],
    reportShareText: '',
    reportHeadline: '',
    reportBriefText: '',
    showAnalyticsAdSlot: false,
    networkOffline: false,
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
    canRetryAction: false,
    lastFailedActionText: '',
    showAllRankings: false,
    loadError: false,
    posterImageUrl: '',
    showPosterPreview: false,
    posterButtonText: '生成战绩卡'
  },

  ...analyticsSyncController,
  ...retryAction.createRetryMethods(),
  ...shareMixin,

  onLoad(options) {
    this._lifecycleGeneration = 0;
    this._pageActive = true;
    const tid = tournamentEntry.parseTournamentIdFromPageOptions(options || {});
    pageTournamentSync.initTournamentSync(this);
    this._trackedAnalyticsView = false;
    this.setData({ tournamentId: tid });
    this.openid = (getApp().globalData.openid || '');
    this.primeViewerIdentity();

    const app = getApp();
    this.setData(pageTournamentSync.composePageSyncPatch(this, {
      networkOffline: !!(app && app.globalData && app.globalData.networkOffline)
    }));
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.handleNetworkChange(offline);
      });
    }

    if (!tid) {
      this.setData({
        loadError: true,
        loadErrorTitle: '链接无效',
        loadErrorMessage: '请确认比赛链接是否完整。',
        showLoadErrorHome: true
      });
      return;
    }

    this.fetchTournament(tid);
    this.startWatch(tid);
    this._ensureShareMenu();
  },

  onShow() {
    const shouldRefreshIdentity = this._pageActive === false;
    this._pageActive = true;
    if (shouldRefreshIdentity) this.primeViewerIdentity();
    const currentId = String(this.data.tournamentId || '').trim();
    nav.consumeRefreshFlag(currentId);
    this.refreshAnalyticsAdSlot();
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.hasActiveWatch(this.data.tournamentId)) this.startWatch(this.data.tournamentId);
  },

  onHide() {
    this._lifecycleGeneration = Number(this._lifecycleGeneration || 0) + 1;
    this._pageActive = false;
    pageTournamentSync.pauseTournamentSync(this);
  },

  onUnload() {
    this._lifecycleGeneration = Number(this._lifecycleGeneration || 0) + 1;
    this._pageActive = false;
    pageTournamentSync.teardownTournamentSync(this);
    this._clearShareCache();
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  async primeViewerIdentity() {
    try {
      const openid = String(await auth.login() || '').trim();
      if (!openid || this._pageActive === false) return;
      const changed = openid !== String(this.openid || '').trim();
      this.openid = openid;
      if (!changed) return;
      const tournament = this._latestTournament || this.data.tournament;
      if (tournament) this.applyTournament(tournament);
    } catch (_) {
      return;
    }
  },

  onRetry() {
    this.refreshAnalyticsAdSlot();
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
  },

  refreshAnalyticsAdSlot() {
    const showAnalyticsAdSlot = adGuard.shouldExposePageSlot('analytics');
    this.setData({ showAnalyticsAdSlot });
    if (showAnalyticsAdSlot) adGuard.markPageExposed('analytics');
  },

  applyTournament(tournament) {
    if (!tournament) return;
    const analytics = analyticsLogic.computeAnalytics(tournament);
    const report = analyticsLogic.buildBattleReport(analytics);
    const pageModel = analyticsLogic.buildAnalyticsPageModel(analytics, report);
    const fullRankings = Array.isArray(pageModel.fullRankings) ? pageModel.fullRankings : [];
    const currentOpenid = String(this.openid || '').trim();
    const playerStats = Array.isArray(analytics.playerStats) ? analytics.playerStats : [];
    const isCurrentUserInRanking = !!shareCardStats.findViewerRankingRow(analytics.tournament, playerStats, currentOpenid);
    pageTitle.setTournamentPageTitle(this, '赛事复盘', analytics.tournament);
    this.setData({
      loadError: false,
      tournament: analytics.tournament,
      summary: analytics.summary,
      top3: pageModel.top3,
      top3Cards: pageModel.top3Cards,
      playerStats: analytics.playerStats,
      pairHot: analytics.pairHot.slice(0, 3),
      duelHot: analytics.duelHot.slice(0, 3),
      rankingTitle: analytics.rankingTitle,
      rankingUnit: analytics.rankingUnit,
      reportLines: report.lines,
      reportShareText: report.shareText,
      reportHeadline: report.headline,
      reportBriefText: report.briefText,
      modeLabel: pageModel.modeLabel,
      statusLabel: pageModel.statusLabel,
      topSectionTitle: pageModel.topSectionTitle,
      heroHeadline: pageModel.heroHeadline,
      heroStats: pageModel.heroStats,
      summaryStats: pageModel.summaryStats,
      focusFacts: pageModel.focusFacts,
      fullRankings,
      displayRankings: fullRankings.slice(0, 5),
      showAllRankings: false,
      posterButtonText: isCurrentUserInRanking ? '生成我的战绩卡' : '生成榜首战绩卡'
    });
    this.clearLastFailedAction();
    this.trackAnalyticsView(analytics.tournament);
    this._preheatShareWhenReady(analytics.tournament);
  },

  trackAnalyticsView(tournament) {
    if (this._trackedAnalyticsView) return;
    this._trackedAnalyticsView = true;
    growthTracker.track('analytics_view', growthTracker.fromTournament(tournament || this.data.tournament, {
      tournamentId: this.data.tournamentId,
      src: 'analytics',
      a: 'view'
    }));
  },

  toggleRankingRows() {
    const nextShowAllRankings = !this.data.showAllRankings;
    const fullRankings = Array.isArray(this.data.fullRankings) ? this.data.fullRankings : [];
    this.setData({
      showAllRankings: nextShowAllRankings,
      displayRankings: nextShowAllRankings ? fullRankings : fullRankings.slice(0, 5)
    });
  },

  copyBattleReport() {
    const text = String(this.data.reportShareText || '').trim();
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '战报已复制', icon: 'success' })
    });
  },

  copyBriefReport() {
    const text = String(this.data.reportBriefText || '').trim();
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '摘要已复制', icon: 'success' })
    });
  },

  async cloneCurrentTournament(options = {}) {
    const sourceTournamentId = String(this.data.tournamentId || '').trim();
    if (!sourceTournamentId) return;
    const actionKey = `analytics:cloneTournament:${sourceTournamentId}`;
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'clone');
    const lifecycleGeneration = Number(this._lifecycleGeneration || 0);
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.runCriticalWrite(actionKey, async () => {
      try {
        const nextId = await loading.withLoading('复制中...', () => cloneTournamentCore.cloneTournament(sourceTournamentId, { clientRequestId }));
        if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
        this.clearLastFailedAction();
        wx.showToast({ title: '已生成副本', icon: 'success' });
        wx.navigateTo({ url: nav.buildTournamentUrl('/pages/lobby/index', nextId) });
      } catch (e) {
        if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
        this.setLastFailedAction('再办一场', () => this.cloneCurrentTournament({ clientRequestId }), { actionKey });
        writeErrorUi.presentWriteError({ err: e, fallbackMessage: '复制失败' });
      }
    });
  },

  goHome() {
    nav.goHome();
  }
});
