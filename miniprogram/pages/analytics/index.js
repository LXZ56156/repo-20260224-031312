const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const cloneTournamentCore = require('../../core/cloneTournament');
const loading = require('../../core/loading');
const pageTournamentSync = require('../../core/pageTournamentSync');
const writeErrorUi = require('../../core/writeErrorUi');
const retryAction = require('../../core/retryAction');
const nav = require('../../core/nav');
const adGuard = require('../../core/adGuard');
const shareMeta = require('../../core/shareMeta');
const analyticsLogic = require('./logic');

const analyticsSyncController = pageTournamentSync.createTournamentSyncMethods();

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
    loadError: false
  },

  ...analyticsSyncController,
  ...retryAction.createRetryMethods(),

  onLoad(options) {
    const tid = String((options && options.tournamentId) || '').trim();
    pageTournamentSync.initTournamentSync(this);
    this.setData({ tournamentId: tid });

    const app = getApp();
    this.setData(pageTournamentSync.composePageSyncPatch(this, {
      networkOffline: !!(app && app.globalData && app.globalData.networkOffline)
    }));
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.handleNetworkChange(offline);
      });
    }

    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onShow() {
    const currentId = String(this.data.tournamentId || '').trim();
    nav.consumeRefreshFlag(currentId);
    this.refreshAnalyticsAdSlot();
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.hasActiveWatch(this.data.tournamentId)) this.startWatch(this.data.tournamentId);
  },

  onHide() {
    pageTournamentSync.pauseTournamentSync(this);
  },

  onUnload() {
    pageTournamentSync.teardownTournamentSync(this);
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
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
      showAllRankings: false
    });
    this.clearLastFailedAction();
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
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.runCriticalWrite(actionKey, async () => {
      try {
        const nextId = await loading.withLoading('复制中...', () => cloneTournamentCore.cloneTournament(sourceTournamentId, { clientRequestId }));
        this.clearLastFailedAction();
        wx.showToast({ title: '已生成副本', icon: 'success' });
        wx.navigateTo({ url: nav.buildTournamentUrl('/pages/lobby/index', nextId) });
      } catch (e) {
        this.setLastFailedAction('再办一场', () => this.cloneCurrentTournament({ clientRequestId }), { actionKey });
        writeErrorUi.presentWriteError({ err: e, fallbackMessage: '复制失败' });
      }
    });
  },

  onShareAppMessage() {
    const meta = shareMeta.buildShareMessage(this.data.tournament);
    return {
      title: meta.title,
      path: meta.path
    };
  }
});
