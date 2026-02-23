const cloud = require('../../core/cloud');
const storage = require('../../core/storage');
const flow = require('../../core/uxFlow');

Page({
  data: {
    name: '轮转赛',
    nickname: '',
    avatar: '',
    avatarDisplay: '/assets/avatar-default.png',
    focusNick: false,

    quickPresetKey: 'standard',
    presetOptions: flow.getPresetOptions(),
    totalMatches: 8,
    courts: 2,
    advancedOpen: false,
    shareHintAfterCreate: true,

    networkOffline: false,
    canRetryAction: false,
    lastFailedActionText: ''
  },

  onLoad() {
    const app = getApp();
    this.setData({ networkOffline: !!(app && app.globalData && app.globalData.networkOffline) });
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.setData({ networkOffline: !!offline });
      });
    }

    // 优先使用本机已缓存的昵称/头像（不强制弹窗授权）
    const p = storage.getUserProfile();
    if (p && typeof p === 'object') {
      let nick = String(p.nickName || p.nickname || '').trim();
      if (nick === '微信用户') nick = '';
      const avatar = String(p.avatarUrl || p.avatar || '').trim();
      const next = {};
      if (!this.data.nickname && nick) next.nickname = nick;
      if (!this.data.avatar && avatar) next.avatar = avatar;
      if (Object.keys(next).length) this.setData(next);
      if (avatar) this.setAvatarDisplay(avatar);
    }
  },

  onUnload() {
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  onName(e) { this.setData({ name: e.detail.value }); },
  onNick(e) { this.setData({ nickname: e.detail.value }); },

  onTotalMatchesInput(e) {
    const m = flow.parsePositiveInt(e.detail.value, 1);
    this.setData({ totalMatches: m || 1, quickPresetKey: 'custom' });
  },

  onCourtsInput(e) {
    const c = flow.parsePositiveInt(e.detail.value, 1, 10);
    this.setData({ courts: c || 1, quickPresetKey: 'custom' });
  },

  toggleAdvanced() {
    this.setData({ advancedOpen: !this.data.advancedOpen });
  },

  applyPreset(e) {
    const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '').trim();
    const preset = flow.getPresetOption(key);
    this.setData({
      quickPresetKey: preset.key,
      totalMatches: preset.totalMatches,
      courts: preset.courts
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

  // 微信已逐步回收通过接口直接获取真实昵称/头像的能力；
  // 这里使用“昵称填写能力”(input type="nickname") + chooseAvatar 让用户主动选择。
  focusNickInput() {
    this.setData({ focusNick: true });
    wx.showToast({ title: '点昵称输入框，键盘上方可一键填入微信昵称', icon: 'none' });
    setTimeout(() => this.setData({ focusNick: false }), 200);
  },

  async onChooseAvatar(e) {
    // 自定义头像：上传到云存储，保存 fileID
    try {
      const tempPath = e && e.detail && e.detail.avatarUrl;
      if (!tempPath) return;
      const openid = (getApp().globalData.openid || storage.get('openid', ''));
      wx.showLoading({ title: '上传头像...' });
      const up = await wx.cloud.uploadFile({
        cloudPath: `avatars/${openid || 'user'}_${Date.now()}.png`,
        filePath: tempPath
      });
      wx.hideLoading();
      const fileID = up && up.fileID;
      if (fileID) {
        this.setData({ avatar: fileID });
        await this.setAvatarDisplay(fileID);
        const old = storage.getUserProfile() || {};
        storage.setUserProfile({ ...old, avatar: fileID });
      }
    } catch (e2) {
      wx.hideLoading();
      wx.showToast({ title: '头像上传失败', icon: 'none' });
    }
  },

  async setAvatarDisplay(avatar) {
    const fallback = '/assets/avatar-default.png';
    const a = String(avatar || '').trim();
    if (!a) {
      this.setData({ avatarDisplay: fallback });
      return;
    }
    if (a.startsWith('cloud://')) {
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [a] });
        const url = res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL;
        this.setData({ avatarDisplay: url || fallback });
      } catch (_) {
        this.setData({ avatarDisplay: fallback });
      }
    } else {
      this.setData({ avatarDisplay: a });
    }
  },

  async handleCreate() {
    const name = (this.data.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入赛事名称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '创建中...' });
    try {
      // 若未填写昵称但本地已有缓存，优先使用
      let nick = (this.data.nickname || '').trim();
      let avatar = String(this.data.avatar || '').trim();
      if (!nick || !avatar) {
        const p = storage.getUserProfile();
        if (p && typeof p === 'object') {
          if (!nick) nick = String(p.nickName || p.nickname || '').trim() || nick;
          if (!avatar) avatar = String(p.avatarUrl || p.avatar || '').trim() || avatar;
        }
      }

      const settings = flow.resolveCreateSettings({
        presetKey: this.data.quickPresetKey,
        totalMatches: this.data.totalMatches,
        courts: this.data.courts
      });

      const res = await cloud.call('createTournament', {
        name,
        nickname: nick,
        avatar,
        totalMatches: settings.totalMatches,
        courts: settings.courts,
        presetKey: settings.presetKey
      });
      wx.hideLoading();
      this.clearLastFailedAction();
      const tip = this.data.shareHintAfterCreate ? 1 : 0;
      // 用 redirectTo 避免“返回”回到创建页
      wx.redirectTo({ url: `/pages/lobby/index?tournamentId=${res.tournamentId}&fromCreate=1&presetApplied=1&shareTip=${tip}` });
    } catch (e) {
      wx.hideLoading();
      const parsed = cloud.parseCloudError(e, '创建失败');
      this.setLastFailedAction('创建赛事', () => this.handleCreate());
      wx.showToast({ title: parsed.userMessage || '创建失败，请稍后重试', icon: 'none' });
    }
  },

  goBack() {
    wx.navigateBack();
  }
});
