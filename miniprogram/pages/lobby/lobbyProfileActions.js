const cloud = require('../../core/cloud');
const joinError = require('../../core/joinTournamentError');
const actionGuard = require('../../core/actionGuard');
const storage = require('../../core/storage');
const profileCore = require('../../core/profile');
const nav = require('../../core/nav');
const flow = require('../../core/uxFlow');

module.exports = {
  onProfileNickInput(e) {
    const value = e && e.detail ? e.detail.value : '';
    this.setData({ profileFieldError: '' });
    if (this.data.showJoin) {
      this.setData({ nickname: value });
      return;
    }
    this._myEditedNick = true;
    this.setData({ myNickname: value });
  },

  onProfileNickFocus() {
    this.setData({ profileFieldError: '' });
  },

  onProfileNickBlur() {
    this.setData({ profileNicknameFocus: false });
  },

  focusProfileNickname() {
    this.setData({ profileNicknameFocus: true });
    setTimeout(() => this.setData({ profileNicknameFocus: false }), 220);
  },

  async onQuickFillProfile(e) {
    if (this.data.profileQuickFillLoading || this.data.profileSaving) return;
    this.setData({ profileQuickFillLoading: true, profileFieldError: '' });
    try {
      const currentNick = this.data.showJoin ? this.data.nickname : this.data.myNickname;
      const quick = await profileCore.ensureAuthThenQuickFill({
        avatarTempPath: e && e.detail && e.detail.avatarUrl,
        nickname: currentNick
      });
      if (quick.cancelled) {
        wx.showToast({ title: '可稍后补充头像', icon: 'none' });
        return;
      }
      if (this.data.showJoin) {
        if (!String(this.data.nickname || '').trim() && quick.nicknameFilled) this.setData({ nickname: quick.nickName });
      } else if (!String(this.data.myNickname || '').trim() && quick.nicknameFilled) {
        this._myEditedNick = true;
        this.setData({ myNickname: quick.nickName });
      }
      this.focusProfileNickname();
      await this.applyProfileAvatarTemp(quick.avatarTempPath, { showLoading: false, silentToast: true });
      const latestNick = String((this.data.showJoin ? this.data.nickname : this.data.myNickname) || '').trim();
      if (!latestNick) {
        wx.showToast({ title: '请在昵称框填写微信昵称', icon: 'none' });
      }
    } catch (_) {
      wx.showToast({ title: '快捷填写失败，请重试', icon: 'none' });
    } finally {
      this.setData({ profileQuickFillLoading: false });
    }
  },

  onChooseAvatarForProfile(e) {
    if (this.data.showJoin) return this.onChooseAvatarForJoin(e);
    return this.onChooseAvatarForMe(e);
  },

  submitProfile() {
    if (this.data.showJoin) return this.handleJoin();
    return this.saveMyProfile();
  },

  async onChooseAvatarForJoin(e) {
    const tempPath = e && e.detail && e.detail.avatarUrl;
    if (!tempPath) return;
    await this.applyProfileAvatarTemp(tempPath, { showLoading: true, silentToast: false, target: 'join' });
  },

  async onChooseAvatarForMe(e) {
    const tempPath = e && e.detail && e.detail.avatarUrl;
    if (!tempPath) return;
    await this.applyProfileAvatarTemp(tempPath, { showLoading: true, silentToast: false, target: 'my' });
  },

  async applyProfileAvatarTemp(tempPath, options = {}) {
    const localPath = String(tempPath || '').trim();
    if (!localPath) return false;
    const target = options.target || (this.data.showJoin ? 'join' : 'my');
    this.setData({ profileFieldError: '' });
    if (target === 'join') {
      this.setData({ joinAvatarDisplay: localPath });
    } else {
      this._myEditedAvatar = true;
      this.setData({ myAvatarDisplay: localPath });
    }
    return this.uploadProfileAvatarTemp(localPath, { ...options, target });
  },

  async uploadProfileAvatarTemp(tempPath, options = {}) {
    const localPath = String(tempPath || '').trim();
    if (!localPath || this.data.profileAvatarUploading) return false;
    const target = options.target || (this.data.showJoin ? 'join' : 'my');
    const showLoading = options.showLoading === true;
    const silentToast = options.silentToast === true;
    this.setData({ profileAvatarUploading: true, profileFieldError: '' });
    if (showLoading) wx.showLoading({ title: '上传头像...' });
    try {
      const fileID = await profileCore.uploadAvatarFromTemp(localPath);
      if (target === 'join') {
        this.setData({ joinAvatar: fileID });
        await this.setJoinAvatarDisplay(fileID);
      } else {
        this._myEditedAvatar = true;
        this.setData({ myAvatar: fileID });
        await this.setMyAvatarDisplay(fileID);
      }
      const old = storage.getUserProfile() || {};
      storage.setUserProfile({ ...old, avatar: fileID });
      return true;
    } catch (_) {
      this.setData({ profileFieldError: '头像上传失败，可重试' });
      if (!silentToast) wx.showToast({ title: '头像上传失败，可重试', icon: 'none' });
      return false;
    } finally {
      if (showLoading) wx.hideLoading();
      this.setData({ profileAvatarUploading: false });
    }
  },

  async setJoinAvatarDisplay(avatar) {
    const url = await this.resolveAvatarDisplay(avatar);
    this.setData({ joinAvatarDisplay: url });
  },

  async setMyAvatarDisplay(avatar) {
    const url = await this.resolveAvatarDisplay(avatar);
    this.setData({ myAvatarDisplay: url });
  },

  async resolveAvatarDisplay(avatar) {
    const fallback = '/assets/avatar-default.png';
    const value = String(avatar || '').trim();
    if (!value) return fallback;
    if (value.startsWith('cloud://')) {
      if (this.avatarCache && this.avatarCache[value]) return this.avatarCache[value];
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [value] });
        const url = res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL;
        if (url) {
          this.avatarCache[value] = url;
          return url;
        }
      } catch (_) {
        return fallback;
      }
      return fallback;
    }
    return value;
  },

  async resolveDisplayPlayersAvatars() {
    try {
      const list = Array.isArray(this.data.displayPlayers) ? this.data.displayPlayers.slice() : [];
      if (!list.length) return;
      const need = [];
      const mapIdx = {};
      for (let i = 0; i < list.length; i += 1) {
        const player = list[i] || {};
        const raw = String(player.avatarRaw || '').trim();
        if (!raw) {
          list[i].avatarDisplay = '';
          continue;
        }
        if (raw.startsWith('cloud://')) {
          if (this.avatarCache && this.avatarCache[raw]) {
            list[i].avatarDisplay = this.avatarCache[raw];
          } else {
            list[i].avatarDisplay = '';
            need.push(raw);
            mapIdx[raw] = mapIdx[raw] || [];
            mapIdx[raw].push(i);
          }
        } else {
          list[i].avatarDisplay = raw;
        }
      }

      this.setData({ displayPlayers: list });

      if (!need.length) return;
      const res = await wx.cloud.getTempFileURL({ fileList: need });
      const fileList = (res && res.fileList) || [];
      for (const item of fileList) {
        const fileID = item && item.fileID;
        const url = item && item.tempFileURL;
        if (!fileID || !url) continue;
        this.avatarCache[fileID] = url;
        const idxs = mapIdx[fileID] || [];
        for (const idx of idxs) {
          if (list[idx]) list[idx].avatarDisplay = url;
        }
      }
      this.setData({ displayPlayers: list });
    } catch (_) {
      // ignore
    }
  },

  async handleJoin() {
    if (this.data.profileSaving || this.data.profileAvatarUploading || this.data.profileQuickFillLoading) return;
    const actionKey = `lobby:joinTournament:${this.data.tournamentId}`;
    if (actionGuard.isBusy(actionKey)) return;

    return actionGuard.runWithPageBusy(this, 'profileSaving', actionKey, async () => {
      this.setData({ profileFieldError: '' });
      const gate = await profileCore.ensureProfileForAction(
        'join',
        `/pages/lobby/index?tournamentId=${encodeURIComponent(this.data.tournamentId)}`
      );
      if (!gate.ok) {
        if (gate.reason === 'login_failed') {
          this.setData({ profileFieldError: '登录失败，请稍后重试' });
          wx.showToast({ title: '登录失败，请重试', icon: 'none' });
        }
        return;
      }
      const profile = gate.profile || {};

      const tid = this.data.tournamentId;
      let nickname = String(this.data.nickname || '').trim() || storage.getProfileNickName(profile);
      let avatar = String(this.data.joinAvatar || '').trim() || String(profile.avatar || profile.avatarUrl || '').trim();
      let gender = storage.normalizeGender(profile.gender);

      if (!nickname || !avatar || gender === 'unknown') {
        const localProfile = storage.getUserProfile();
        if (localProfile && typeof localProfile === 'object') {
          if (!nickname) nickname = storage.getProfileNickName(localProfile) || nickname;
          if (!avatar) avatar = String(localProfile.avatarUrl || localProfile.avatar || '').trim() || avatar;
          if (gender === 'unknown') gender = storage.normalizeGender(localProfile.gender);
        }
      }

      if (nickname || avatar) {
        const old = storage.getUserProfile() || {};
        storage.setUserProfile({ ...old, nickName: nickname, avatar });
      }

      wx.showLoading({ title: '加入中...' });
      try {
        const squadChoice = this.data.mode === flow.MODE_SQUAD_DOUBLES
          ? String(this.data.joinSquadChoice || 'A').trim().toUpperCase()
          : '';
        const res = await cloud.call('joinTournament', {
          tournamentId: tid,
          nickname,
          avatar,
          gender,
          squadChoice
        });
        if (res && res.ok === false) throw joinError.normalizeJoinFailure(res, '加入失败，请稍后重试', { action: 'join' });
        wx.hideLoading();
        this.clearLastFailedAction();
        wx.showToast({ title: '已加入', icon: 'success' });
        nav.markRefreshFlag(tid);
        this.fetchTournament(tid);
      } catch (err) {
        wx.hideLoading();
        this.setLastFailedAction('加入参赛', () => this.handleJoin());
        const normalizedError = joinError.normalizeJoinFailure(err, '加入失败，请稍后重试', { action: 'join' });
        this.handleWriteError(normalizedError, joinError.resolveJoinFailureMessage(normalizedError, '加入失败，请稍后重试', { action: 'join' }), () => this.fetchTournament(tid));
      }
    });
  },

  async saveMyProfile() {
    if (this.data.profileSaving || this.data.profileAvatarUploading || this.data.profileQuickFillLoading) return;
    const tournament = this.data.tournament;
    if (!tournament || tournament.status !== 'draft') {
      wx.showToast({ title: '非草稿阶段不可修改', icon: 'none' });
      return;
    }
    const nickname = String(this.data.myNickname || '').trim();
    const avatar = String(this.data.myAvatar || '').trim();
    if (!nickname && !avatar) {
      wx.showToast({ title: '昵称/头像至少填一个', icon: 'none' });
      return;
    }
    const actionKey = `lobby:joinTournament:${this.data.tournamentId}`;
    if (actionGuard.isBusy(actionKey)) return;

    return actionGuard.runWithPageBusy(this, 'profileSaving', actionKey, async () => {
      this.setData({ profileFieldError: '' });
      wx.showLoading({ title: '保存中...' });
      try {
        const res = await cloud.call('joinTournament', {
          tournamentId: this.data.tournamentId,
          nickname,
          avatar,
          gender: storage.normalizeGender((storage.getUserProfile() || {}).gender),
          squadChoice: this.data.mode === flow.MODE_SQUAD_DOUBLES ? String(this.data.joinSquadChoice || 'A').trim().toUpperCase() : ''
        });
        if (res && res.ok === false) throw joinError.normalizeJoinFailure(res, '保存失败，请稍后重试', { action: 'profile_update' });
        wx.hideLoading();
        this.clearLastFailedAction();
        wx.showToast({ title: '已更新', icon: 'success' });
        nav.markRefreshFlag(this.data.tournamentId);

        const old = storage.getUserProfile() || {};
        storage.setUserProfile({
          ...old,
          nickName: nickname || storage.getProfileNickName(old),
          avatarUrl: old.avatarUrl || '',
          avatar: avatar || old.avatar || ''
        });

        this.fetchTournament(this.data.tournamentId);
      } catch (err) {
        wx.hideLoading();
        this.setLastFailedAction('保存我的信息', () => this.saveMyProfile());
        const normalizedError = joinError.normalizeJoinFailure(err, '保存失败，请稍后重试', { action: 'profile_update' });
        this.handleWriteError(normalizedError, joinError.resolveJoinFailureMessage(normalizedError, '保存失败，请稍后重试', { action: 'profile_update' }), () => this.fetchTournament(this.data.tournamentId));
      }
    });
  }
};
