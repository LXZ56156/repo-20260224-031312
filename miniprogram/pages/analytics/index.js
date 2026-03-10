const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const storage = require('../../core/storage');
const tournamentSync = require('../../core/tournamentSync');
const nav = require('../../core/nav');
const adGuard = require('../../core/adGuard');
const shareMeta = require('../../core/shareMeta');
const analyticsLogic = require('./logic');

Page({
  data: {
    tournamentId: '',
    tournament: null,
    summary: null,
    top3: [],
    playerStats: [],
    pairHot: [],
    duelHot: [],
    rankingTitle: '球员数据',
    rankingUnit: '人',
    modeLabel: '',
    statusLabel: '',
    topSectionTitle: 'TOP 3',
    heroHeadline: '',
    heroSubline: '',
    heroStats: [],
    summaryStats: [],
    focusFacts: [],
    fullRankings: [],
    displayRankings: [],
    reportLines: [],
    reportShareText: '',
    reportHeadline: '',
    reportBriefText: '',
    shareButtonText: '分享比赛链接',
    showAnalyticsAdSlot: false,
    networkOffline: false,
    showStaleSyncHint: false,
    canRetryAction: false,
    lastFailedActionText: '',
    showAllRankings: false,
    loadError: false
  },

  onLoad(options) {
    const tid = String((options && options.tournamentId) || '').trim();
    this._fetchSeq = 0;
    this._watchGen = 0;
    this.setData({ tournamentId: tid });

    const app = getApp();
    this.setData({ networkOffline: !!(app && app.globalData && app.globalData.networkOffline) });
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.setData({ networkOffline: !!offline });
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
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
  },

  onHide() {
    this.invalidateFetchSeq();
    this.invalidateWatchGen();
    tournamentSync.closeWatcher(this);
  },

  onUnload() {
    this.invalidateFetchSeq();
    this.invalidateWatchGen();
    tournamentSync.closeWatcher(this);
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  onRetry() {
    this.refreshAnalyticsAdSlot();
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
  },

  nextFetchSeq() {
    this._fetchSeq = Number(this._fetchSeq || 0) + 1;
    return this._fetchSeq;
  },

  isLatestFetchSeq(requestSeq) {
    return Number(requestSeq) === Number(this._fetchSeq || 0);
  },

  invalidateFetchSeq() {
    this._fetchSeq = Number(this._fetchSeq || 0) + 1;
  },

  nextWatchGen() {
    this._watchGen = Number(this._watchGen || 0) + 1;
    return this._watchGen;
  },

  isActiveWatchGen(watchGen) {
    return Number(watchGen) === Number(this._watchGen || 0);
  },

  invalidateWatchGen() {
    this._watchGen = Number(this._watchGen || 0) + 1;
  },

  refreshAnalyticsAdSlot() {
    const showAnalyticsAdSlot = adGuard.shouldExposePageSlot('analytics');
    this.setData({ showAnalyticsAdSlot });
    if (showAnalyticsAdSlot) adGuard.markPageExposed('analytics');
  },

  startWatch(tid) {
    const watchGen = this.nextWatchGen();
    tournamentSync.startWatch(this, tid, (doc) => {
      if (!this.isActiveWatchGen(watchGen)) return;
      this.setData({ showStaleSyncHint: false });
      this.applyTournament(doc);
    });
  },

  async fetchTournament(tid) {
    const requestSeq = this.nextFetchSeq();
    const result = await tournamentSync.fetchTournament(tid);
    if (!this.isLatestFetchSeq(requestSeq)) return null;
    if (result && result.ok && result.doc) {
      this.setData({ showStaleSyncHint: false });
      this.applyTournament(result.doc);
      return result.doc;
    }
    if (result && result.cachedDoc) {
      this.setData({ showStaleSyncHint: true, loadError: false });
      this.applyTournament(result.cachedDoc);
      return result.cachedDoc;
    }
    this.setData({ loadError: true, showStaleSyncHint: false });
    return null;
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
      playerStats: analytics.playerStats,
      pairHot: analytics.pairHot.slice(0, 3),
      duelHot: analytics.duelHot.slice(0, 3),
      rankingTitle: analytics.rankingTitle,
      rankingUnit: analytics.rankingUnit,
      reportLines: report.lines,
      reportShareText: report.shareText,
      reportHeadline: report.headline,
      reportBriefText: report.briefText,
      shareButtonText: String((shareMeta.buildShareMessage(analytics.tournament) || {}).buttonText || '分享比赛链接'),
      modeLabel: pageModel.modeLabel,
      statusLabel: pageModel.statusLabel,
      topSectionTitle: pageModel.topSectionTitle,
      heroHeadline: pageModel.heroHeadline,
      heroSubline: pageModel.heroSubline,
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

  async cloneCurrentTournament() {
    const sourceTournamentId = String(this.data.tournamentId || '').trim();
    if (!sourceTournamentId) return;
    const actionKey = `analytics:cloneTournament:${sourceTournamentId}`;
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
        wx.showToast({ title: '已生成副本', icon: 'success' });
        wx.navigateTo({ url: `/pages/lobby/index?tournamentId=${nextId}` });
      } catch (e) {
        wx.hideLoading();
        this.setLastFailedAction('再办一场', () => this.cloneCurrentTournament());
        wx.showToast({ title: cloud.getUnifiedErrorMessage(e, '复制失败'), icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    const tid = String(this.data.tournamentId || '').trim();
    const meta = shareMeta.buildShareMessage(this.data.tournament);
    return {
      title: meta.title,
      path: `/pages/share-entry/index?tournamentId=${encodeURIComponent(tid)}&intent=${encodeURIComponent(String(meta.intent || 'view'))}`
    };
  }
});
