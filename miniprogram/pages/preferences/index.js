const storage = require('../../core/storage');
const uiPreferences = require('../../core/uiPreferences');

const SCORE_AUTO_RETURN_KEY = 'score_auto_return';
const SCORE_AUTO_NEXT_KEY = 'score_auto_next';

Page({
  data: {
    nickname: '未设置',
    genderText: '未设置',
    profileStatusText: '待完善',
    sortMode: 'updated',
    autoReturn: true,
    autoNext: true,
    motionLevel: 'standard',
    listDensity: 'comfortable',
    version: ''
  },

  onShow() {
    const profile = storage.getUserProfile() || {};
    const nickname = storage.getProfileNickName(profile) || '未设置';
    const gender = storage.normalizeGender(profile.gender);
    const genderText = gender === 'male' ? '男' : (gender === 'female' ? '女' : '未设置');
    const profileStatusText = storage.isProfileComplete(profile) ? '已完善' : '待完善';
    const ui = uiPreferences.readUiPreferences();
    this.setData({
      nickname,
      genderText,
      profileStatusText,
      sortMode: storage.getHomeSortMode(),
      autoReturn: storage.get(SCORE_AUTO_RETURN_KEY, true) !== false,
      autoNext: storage.get(SCORE_AUTO_NEXT_KEY, true) !== false,
      motionLevel: ui.motionLevel,
      listDensity: ui.listDensity
    });
    this.loadVersion();
  },

  loadVersion() {
    try {
      const account = wx.getAccountInfoSync && wx.getAccountInfoSync();
      const version = account && account.miniProgram && account.miniProgram.version
        ? account.miniProgram.version
        : 'dev';
      this.setData({ version });
    } catch (_) {
      this.setData({ version: 'dev' });
    }
  },

  setSortMode(e) {
    const mode = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.mode) || '').trim();
    if (!mode) return;
    storage.setHomeSortMode(mode);
    this.setData({ sortMode: mode });
  },

  onAutoReturnChange(e) {
    const value = !!(e && e.detail && e.detail.value);
    storage.set(SCORE_AUTO_RETURN_KEY, value);
    this.setData({ autoReturn: value });
  },

  onAutoNextChange(e) {
    const value = !!(e && e.detail && e.detail.value);
    storage.set(SCORE_AUTO_NEXT_KEY, value);
    this.setData({ autoNext: value });
  },

  setMotionLevel(e) {
    const level = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.level) || '').trim();
    if (!level) return;
    this.setData({ motionLevel: uiPreferences.saveMotionLevel(level) });
  },

  setListDensity(e) {
    const density = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.density) || '').trim();
    if (!density) return;
    this.setData({ listDensity: uiPreferences.saveListDensity(density) });
  },

  clearCache() {
    wx.showModal({
      title: '重置本地数据？',
      content: '将清除本机保存的个人资料、最近赛事、本地战绩、偏好、录分草稿和登录缓存；不会删除云端赛事。',
      success: (res) => {
        if (!res.confirm) return;
        try {
          wx.clearStorageSync();
          wx.showToast({ title: '已重置', icon: 'success' });
          this.onShow();
        } catch (_) {
          wx.showToast({ title: '重置失败', icon: 'none' });
        }
      }
    });
  }
});
