const normalize = require('../../core/normalize');
const tournamentSync = require('../../core/tournamentSync');
const nav = require('../../core/nav');
const rankingCore = require('../../core/ranking');
const flow = require('../../core/uxFlow');

Page({
  data: {
    tournamentId: '',
    tournament: null,
    rankings: [],
    rankingTypeLabel: '个人榜',
    showStaleSyncHint: false,
    loadError: false,
    loadErrorTitle: '加载失败',
    loadErrorMessage: '请检查网络后重试。',
    showLoadErrorHome: false
  },

  onLoad(options) {
    const tid = options.tournamentId;
    this._fetchSeq = 0;
    this._watchGen = 0;
    this.setData({ tournamentId: tid });
    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
    this.invalidateFetchSeq();
    this.invalidateWatchGen();
    tournamentSync.closeWatcher(this);
  },

  onShow() {
    const currentId = String(this.data.tournamentId || '').trim();
    nav.consumeRefreshFlag(currentId);
    // 兜底刷新：部分真机 onSnapshot 监听可能不稳定
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
  },

  onUnload() {
    this.invalidateFetchSeq();
    this.invalidateWatchGen();
    tournamentSync.closeWatcher(this);
  },

  onRetry() {
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
      this.setData({
        showStaleSyncHint: false,
        loadErrorTitle: '加载失败',
        loadErrorMessage: '请检查网络后重试。',
        showLoadErrorHome: false
      });
      this.applyTournament(result.doc);
      return result.doc;
    }
    if (result && result.cachedDoc) {
      this.setData({ showStaleSyncHint: true, loadError: false });
      this.applyTournament(result.cachedDoc);
      return result.cachedDoc;
    }
    let loadErrorTitle = '加载失败';
    let loadErrorMessage = '请检查网络后重试。';
    let showLoadErrorHome = false;
    if (result && result.errorType === 'not_found') {
      loadErrorTitle = '比赛不存在或已关闭';
      loadErrorMessage = '链接可能已失效，或比赛已被删除。';
      showLoadErrorHome = true;
    } else if (result && result.errorType === 'param') {
      loadErrorTitle = '链接无效';
      loadErrorMessage = '请确认比赛链接是否完整。';
      showLoadErrorHome = true;
    }
    this.setData({
      loadError: true,
      showStaleSyncHint: false,
      loadErrorTitle,
      loadErrorMessage,
      showLoadErrorHome
    });
    return null;
  },

  applyTournament(t) {
    if (!t) return;
    t = normalize.normalizeTournament(t);
    const mode = flow.normalizeMode(t.mode || flow.MODE_MULTI_ROTATE);
    const rankingTypeLabel = (mode === flow.MODE_SQUAD_DOUBLES || mode === flow.MODE_FIXED_PAIR_RR) ? '队伍榜' : '个人榜';
    this.setData({
      loadError: false,
      tournament: t,
      rankings: rankingCore.buildRankingWithTrend(t),
      rankingTypeLabel
    });
  },

  goSchedule() {
    wx.navigateTo({ url: `/pages/schedule/index?tournamentId=${this.data.tournamentId}` });
  },

  goHome() {
    wx.reLaunch({
      url: '/pages/home/index',
      fail: () => wx.navigateTo({ url: '/pages/home/index' })
    });
  }
});
