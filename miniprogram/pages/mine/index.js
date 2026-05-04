const storage = require('../../core/storage');
const nav = require('../../core/nav');
const profileCore = require('../../core/profile');
const avatarDisplay = require('../../core/avatarDisplay');
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

function buildProfileViewState(profile = {}, avatarCache = {}) {
  const nick = storage.getProfileNickName(profile);
  const avatar = String(profile.avatar || profile.avatarUrl || '').trim();
  const avatarItem = avatarDisplay.buildAvatarDisplay({
    id: 'mine',
    name: nick || '我',
    avatar
  }, avatarCache);
  return {
    nickname: nick || '未设置昵称',
    avatarRaw: avatarItem.avatarRaw,
    avatar: avatarItem.avatarDisplay || profileCore.DEFAULT_AVATAR
  };
}

Page({
  data: {
    nickname: '未设置昵称',
    avatar: profileCore.DEFAULT_AVATAR,
    avatarRaw: '',
    tournamentsCompleted: 0,
    matchesPlayed: 0,
    wins: 0,
    winRateText: '0%',
    pointDiffText: '0',
    last10Text: '',
    noPerformanceData: true
  },

  onShow() {
    this._profileSyncSeq = Number(this._profileSyncSeq || 0) + 1;
    const syncSeq = this._profileSyncSeq;
    this.applyProfile(storage.getUserProfile() || {});
    this.loadStats();
    profileCore.syncCloudProfile().then((synced) => {
      if (Number(syncSeq) !== Number(this._profileSyncSeq || 0)) return;
      this.applyProfile(synced || storage.getUserProfile() || {});
    }).catch(() => {});
  },

  applyProfile(profile = {}) {
    if (!this.avatarCache || typeof this.avatarCache !== 'object') this.avatarCache = {};
    this.setData(buildProfileViewState(profile, this.avatarCache));
    this.refreshAvatarDisplay();
  },

  async refreshAvatarDisplay() {
    const avatarRaw = String(this.data.avatarRaw || '').trim();
    if (!avatarRaw || !avatarRaw.startsWith('cloud://')) return;
    if (!this.avatarCache || typeof this.avatarCache !== 'object') this.avatarCache = {};
    const generation = Number(this._avatarResolveGen || 0) + 1;
    this._avatarResolveGen = generation;
    const result = await avatarDisplay.resolveCloudAvatarFileIds([avatarRaw], this.avatarCache);
    if (!result.updated || Number(this._avatarResolveGen || 0) !== generation) return;
    if (String(this.data.avatarRaw || '').trim() !== avatarRaw) return;
    this.setData({ avatar: this.avatarCache[avatarRaw] || profileCore.DEFAULT_AVATAR });
  },

  onAvatarError() {
    if (this.data.avatar !== profileCore.DEFAULT_AVATAR) {
      this.setData({ avatar: profileCore.DEFAULT_AVATAR });
    }
  },

  async loadStats() {
    const openid = String((getApp().globalData.openid || storage.get('openid', '')) || '').trim();
    if (!openid) {
      this.applyStats();
      return;
    }
    // Keep the mainline on local completed snapshots only.
    // Do not swap this to getMyPerformanceStats without a product-level metric review.
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
    nav.goLaunch();
  },

  goSettings() {
    nav.goPreferences();
  },

  goProfile() {
    nav.goProfile();
  },

  onFeedback() {
    nav.goFeedback();
  }
});
