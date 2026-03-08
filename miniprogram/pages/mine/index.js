const storage = require('../../core/storage');
const profileCore = require('../../core/profile');
const { buildLocalPerformancePayload } = require('../../core/performanceStats');

function formatWinRate(rate) {
  const v = Number(rate);
  if (!Number.isFinite(v) || v <= 0) return '0%';
  return `${Math.round(v * 100)}%`;
}

function formatPointDiff(value) {
  const n = Number(value) || 0;
  if (n > 0) return `+${n}`;
  return `${n}`;
}

Page({
  data: {
    nickname: '未设置昵称',
    avatar: '/assets/avatar-default.png',
    tournamentsCompleted: 0,
    matchesPlayed: 0,
    wins: 0,
    winRateText: '0%',
    pointDiffText: '0',
    last10Text: '',
    noPerformanceData: true
  },

  async onShow() {
    const synced = await profileCore.syncCloudProfile();
    const profile = synced || storage.getUserProfile() || {};
    const nick = String(profile.nickName || profile.nickname || '').trim();
    const avatar = String(profile.avatar || profile.avatarUrl || '').trim();
    this.setData({
      nickname: nick || '未设置昵称',
      avatar: avatar || '/assets/avatar-default.png'
    });
    await this.loadStats();
  },

  async loadStats() {
    const openid = String((getApp().globalData.openid || storage.get('openid', '')) || '').trim();
    if (!openid) {
      this.applyStats();
      return;
    }
    const snapshots = storage.getLocalCompletedTournamentSnapshots();
    const payload = buildLocalPerformancePayload(snapshots, openid);
    this.applyStats(payload);
  },

  applyStats(payload = {}) {
    const tournamentsCompleted = Number(payload.tournamentsCompleted) || 0;
    const matchesPlayed = Number(payload.matchesPlayed) || 0;
    const wins = Number(payload.wins) || 0;
    const winRateText = formatWinRate(payload.winRate);
    const pointDiffText = formatPointDiff(payload.pointDiff);
    const last10Wins = Number(payload.last10Wins) || 0;
    const last10Losses = Number(payload.last10Losses) || 0;
    const hasRecent10 = (last10Wins + last10Losses) > 0;
    this.setData({
      tournamentsCompleted,
      matchesPlayed,
      wins,
      winRateText,
      pointDiffText,
      last10Text: hasRecent10 ? `最近10场：${last10Wins}胜${last10Losses}负` : '',
      noPerformanceData: tournamentsCompleted === 0 && matchesPlayed === 0
    });
  },

  goLaunch() {
    wx.switchTab({ url: '/pages/launch/index' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index' });
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/preferences/index' });
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/index' });
  },

  goMyTournaments() {
    wx.switchTab({ url: '/pages/home/index' });
  },

  onFeedback() {
    wx.navigateTo({ url: '/pages/feedback/index' });
  }
});
