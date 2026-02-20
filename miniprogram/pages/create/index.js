const cloud = require('../../core/cloud');
const storage = require('../../core/storage');

Page({
  data: {
    name: '轮转赛',
    nickname: '',
    avatar: '',
    avatarDisplay: '/assets/avatar-default.png',
    focusNick: false
  },

  onLoad() {
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

  onName(e) { this.setData({ name: e.detail.value }); },
  onNick(e) { this.setData({ nickname: e.detail.value }); },

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

      const res = await cloud.call('createTournament', {
        name,
        nickname: nick,
        avatar
      });
      wx.hideLoading();
      // 用 redirectTo 避免“返回”回到创建页（用户感知为又回到创建界面）
      wx.redirectTo({ url: `/pages/lobby/index?tournamentId=${res.tournamentId}` });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '创建失败，请看控制台', icon: 'none' });
    }
  },

  goBack() {
    wx.navigateBack();
  }
});
