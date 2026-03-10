const normalize = require('../../core/normalize');
const nav = require('../../core/nav');
const pageTournamentSync = require('../../core/pageTournamentSync');
const rankingCore = require('../../core/ranking');
const flow = require('../../core/uxFlow');

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
    showStaleSyncHint: false,
    loadError: false,
    loadErrorTitle: '加载失败',
    loadErrorMessage: '请检查网络后重试。',
    showLoadErrorHome: false
  },

  ...rankingSyncController,

  onLoad(options) {
    const tid = options.tournamentId;
    pageTournamentSync.initTournamentSync(this);
    this.setData({ tournamentId: tid });
    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
    pageTournamentSync.teardownTournamentSync(this);
  },

  onShow() {
    const currentId = String(this.data.tournamentId || '').trim();
    nav.consumeRefreshFlag(currentId);
    // 兜底刷新：部分真机 onSnapshot 监听可能不稳定
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
  },

  onUnload() {
    pageTournamentSync.teardownTournamentSync(this);
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
