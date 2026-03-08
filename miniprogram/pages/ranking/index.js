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
    loadError: false
  },

  onLoad(options) {
    const tid = options.tournamentId;
    this.setData({ tournamentId: tid });
    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
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
    tournamentSync.closeWatcher(this);
  },

  onRetry() {
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
  },

  startWatch(tid) {
    tournamentSync.startWatch(this, tid, (doc) => {
      this.applyTournament(doc);
    });
  },

  async fetchTournament(tid) {
    const doc = await tournamentSync.fetchTournament(tid, (doc) => {
      this.applyTournament(doc);
    });
    if (!doc) this.setData({ loadError: true });
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
  }
});
