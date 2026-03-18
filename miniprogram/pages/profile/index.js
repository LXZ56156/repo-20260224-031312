const storage = require('../../core/storage');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const profileCore = require('../../core/profile');

Page({
  data: {
    returnUrl: '',
    nickname: '',
    gender: 'unknown',
    avatar: '',
    avatarDisplay: profileCore.DEFAULT_AVATAR,
    avatarLocalPreview: '',
    pendingAvatarTempPath: '',
    avatarUploading: false,
    avatarUploadFailed: false,
    nicknameFocus: false,
    genderSelectTouched: false,
    quickFillLoading: false,
    saving: false,
    fieldErrors: {
      nickname: '',
      gender: '',
      avatar: ''
    }
  },

  async onLoad(options) {
    options = options || {};
    const returnUrl = options.returnUrl ? decodeURIComponent(options.returnUrl) : '';
    this.setData({ returnUrl });
    const local = profileCore.readLocalProfile() || {};
    this.applyProfile(local);
    const synced = await profileCore.syncCloudProfile();
    if (synced) this.applyProfile(synced);
  },

  applyProfile(profile) {
    const p = profile || {};
    const nickname = storage.getProfileNickName(p);
    const gender = storage.normalizeGender(p.gender);
    const avatar = String(p.avatar || p.avatarUrl || '').trim();
    this.setData({
      nickname,
      gender,
      avatar,
      avatarDisplay: avatar || profileCore.DEFAULT_AVATAR,
      avatarLocalPreview: '',
      pendingAvatarTempPath: '',
      avatarUploading: false,
      avatarUploadFailed: false,
      fieldErrors: {
        nickname: '',
        gender: '',
        avatar: ''
      }
    });
  },

  setFieldError(field, text) {
    const key = `fieldErrors.${field}`;
    this.setData({ [key]: String(text || '').trim() });
  },

  clearFieldError(field) {
    this.setFieldError(field, '');
  },

  focusNicknameInput() {
    this.setData({ nicknameFocus: true });
    setTimeout(() => this.setData({ nicknameFocus: false }), 220);
  },

  onNicknameFocus() {
    this.clearFieldError('nickname');
  },

  onNicknameBlur() {
    this.setData({ nicknameFocus: false });
  },

  onNicknameInput(e) {
    const nickname = String((e && e.detail && e.detail.value) || '');
    this.setData({ nickname });
    if (nickname.trim()) this.clearFieldError('nickname');
  },

  onChooseGender(e) {
    const gender = storage.normalizeGender(e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.gender);
    this.setData({
      gender,
      genderSelectTouched: true
    });
    if (gender !== 'unknown') this.clearFieldError('gender');
  },

  async onQuickFillChooseAvatar(e) {
    if (this.data.quickFillLoading || this.data.saving) return;
    this.setData({ quickFillLoading: true });
    try {
      const quick = await profileCore.ensureAuthThenQuickFill({
        avatarTempPath: e && e.detail && e.detail.avatarUrl,
        nickname: this.data.nickname
      });
      if (quick.cancelled) {
        wx.showToast({ title: '可稍后补充头像', icon: 'none' });
        return;
      }
      if (!String(this.data.nickname || '').trim() && quick.nicknameFilled) {
        this.setData({ nickname: quick.nickName });
      }
      await this.handleAvatarFromTemp(quick.avatarTempPath, { showLoading: false, silentToast: true });
      this.focusNicknameInput();
      if (!String(this.data.nickname || '').trim()) {
        wx.showToast({ title: '请在昵称框填写微信昵称', icon: 'none' });
      }
    } catch (_) {
      wx.showToast({ title: '快捷填写失败，请重试', icon: 'none' });
    } finally {
      this.setData({ quickFillLoading: false });
    }
  },

  async onChooseAvatar(e) {
    const tempPath = e && e.detail && e.detail.avatarUrl;
    if (!tempPath) return;
    await this.handleAvatarFromTemp(tempPath, { showLoading: true, silentToast: false });
  },

  async onRetryAvatarUpload() {
    const ok = await this.uploadPendingAvatar({ showLoading: true, silentToast: false });
    if (ok) wx.showToast({ title: '头像已更新', icon: 'success' });
  },

  async handleAvatarFromTemp(tempPath, options = {}) {
    try {
      const localPath = String(tempPath || '').trim();
      if (!localPath) return false;
      this.setData({
        avatarDisplay: localPath,
        avatarLocalPreview: localPath,
        pendingAvatarTempPath: localPath,
        avatarUploadFailed: false
      });
      this.clearFieldError('avatar');
      return await this.uploadPendingAvatar(options);
    } catch (_) {
      return false;
    }
  },

  async uploadPendingAvatar(options = {}) {
    const tempPath = String(this.data.pendingAvatarTempPath || '').trim();
    if (!tempPath) return true;
    if (this.data.avatarUploading) return false;

    const showLoading = options.showLoading === true;
    const silentToast = options.silentToast === true;
    this.setData({ avatarUploading: true });
    if (showLoading) wx.showLoading({ title: '上传头像...' });
    try {
      const fileID = await profileCore.uploadAvatarFromTemp(tempPath);
      this.setData({
        avatar: fileID,
        avatarDisplay: this.data.avatarLocalPreview || fileID || profileCore.DEFAULT_AVATAR,
        pendingAvatarTempPath: '',
        avatarUploadFailed: false
      });
      this.clearFieldError('avatar');
      return true;
    } catch (_) {
      this.setData({ avatarUploadFailed: true });
      this.setFieldError('avatar', '头像上传失败，可重试');
      if (!silentToast) wx.showToast({ title: '头像上传失败，可重试', icon: 'none' });
      return false;
    } finally {
      if (showLoading) wx.hideLoading();
      this.setData({ avatarUploading: false });
    }
  },

  validateProfile() {
    const nickname = String(this.data.nickname || '').trim();
    const gender = storage.normalizeGender(this.data.gender);
    let ok = true;
    if (!nickname) {
      this.setFieldError('nickname', '请填写昵称');
      ok = false;
    } else {
      this.clearFieldError('nickname');
    }
    if (gender === 'unknown') {
      this.setFieldError('gender', '请选择性别');
      ok = false;
    } else {
      this.clearFieldError('gender');
    }
    if (!ok) {
      wx.showToast({ title: '请完善必填信息', icon: 'none' });
    }
    return { ok, nickname, gender };
  },

  async onSave(options = {}) {
    if (this.data.saving) return;
    const actionKey = 'profile:saveUserProfile';
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'profile');
    if (actionGuard.isBusy(actionKey)) return;

    return actionGuard.runWithCriticalPageBusy(this, 'saving', actionKey, async () => {
      const validated = this.validateProfile();
      if (!validated.ok) return;

      if (this.data.pendingAvatarTempPath) {
        const ok = await this.uploadPendingAvatar({ showLoading: true, silentToast: true });
        if (!ok) {
          wx.showToast({ title: '头像上传失败，请重试', icon: 'none' });
          return;
        }
      }

      const nickname = validated.nickname;
      const gender = validated.gender;
      const avatar = String(this.data.avatar || '').trim();
      if (this.data.avatarUploadFailed || this.data.pendingAvatarTempPath) {
        this.setFieldError('avatar', '头像上传失败，可重试');
        wx.showToast({ title: '请先完成头像上传', icon: 'none' });
        return;
      }
      if (avatar) this.clearFieldError('avatar');

      wx.showLoading({ title: '保存中...' });
      try {
        await profileCore.saveCloudProfile({
          nickName: nickname,
          avatar,
          gender
        }, { clientRequestId });
        wx.hideLoading();
        wx.showToast({ title: '已保存', icon: 'success' });
        const returnUrl = String(this.data.returnUrl || '').trim();
        setTimeout(() => {
          if (returnUrl) {
            const isTab = (
              returnUrl === '/pages/home/index' ||
              returnUrl === '/pages/launch/index' ||
              returnUrl === '/pages/mine/index'
            );
            if (isTab) {
              wx.switchTab({ url: returnUrl });
            } else {
              wx.redirectTo({
                url: returnUrl,
                fail: () => wx.navigateTo({ url: returnUrl })
              });
            }
            return;
          }
          wx.navigateBack({
            delta: 1,
            fail: () => wx.switchTab({ url: '/pages/mine/index' })
          });
        }, 220);
      } catch (e) {
        wx.hideLoading();
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      }
    });
  }
});
