const storage = require('../../core/storage');

const SCORE_AUTO_RETURN_KEY = 'score_auto_return';
const SCORE_AUTO_NEXT_KEY = 'score_auto_next';
const MOTION_LEVEL_KEY = 'motion_level';
const LIST_DENSITY_KEY = 'list_density';
const THEME_MODE_KEY = 'theme_mode';
const NOTIFY_START_KEY = 'notify_start';
const NOTIFY_RESULT_KEY = 'notify_result';

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
    themeMode: 'system',
    notifyStart: true,
    notifyResult: true,
    version: ''
  },

  onShow() {
    const profile = storage.getUserProfile() || {};
    const nickname = String(profile.nickName || profile.nickname || '').trim() || '未设置';
    const gender = storage.normalizeGender(profile.gender);
    const genderText = gender === 'male' ? '男' : (gender === 'female' ? '女' : '未设置');
    const profileStatusText = storage.isProfileComplete(profile) ? '已完善' : '待完善';
    this.setData({
      nickname,
      genderText,
      profileStatusText,
      sortMode: storage.getHomeSortMode(),
      autoReturn: storage.get(SCORE_AUTO_RETURN_KEY, true) !== false,
      autoNext: storage.get(SCORE_AUTO_NEXT_KEY, true) !== false,
      motionLevel: String(storage.get(MOTION_LEVEL_KEY, 'standard') || 'standard'),
      listDensity: String(storage.get(LIST_DENSITY_KEY, 'comfortable') || 'comfortable'),
      themeMode: String(storage.get(THEME_MODE_KEY, 'system') || 'system'),
      notifyStart: storage.get(NOTIFY_START_KEY, true) !== false,
      notifyResult: storage.get(NOTIFY_RESULT_KEY, true) !== false
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
    storage.set(MOTION_LEVEL_KEY, level);
    this.setData({ motionLevel: level });
  },

  setListDensity(e) {
    const density = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.density) || '').trim();
    if (!density) return;
    storage.set(LIST_DENSITY_KEY, density);
    this.setData({ listDensity: density });
  },

  setThemeMode(e) {
    const mode = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.mode) || '').trim();
    if (!mode) return;
    storage.set(THEME_MODE_KEY, mode);
    this.setData({ themeMode: mode });
  },

  onNotifyStartChange(e) {
    const value = !!(e && e.detail && e.detail.value);
    storage.set(NOTIFY_START_KEY, value);
    this.setData({ notifyStart: value });
  },

  onNotifyResultChange(e) {
    const value = !!(e && e.detail && e.detail.value);
    storage.set(NOTIFY_RESULT_KEY, value);
    this.setData({ notifyResult: value });
  },

  clearCache() {
    wx.showModal({
      title: '清除本地缓存？',
      content: '将清空本地偏好和临时记录，不影响云端赛事数据。',
      success: (res) => {
        if (!res.confirm) return;
        try {
          wx.clearStorageSync();
          wx.showToast({ title: '已清理', icon: 'success' });
          this.onShow();
        } catch (_) {
          wx.showToast({ title: '清理失败', icon: 'none' });
        }
      }
    });
  }
});
