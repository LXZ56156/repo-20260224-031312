const joinError = require('../../core/joinTournamentError');
const joinTournamentCore = require('../../core/joinTournament');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const loading = require('../../core/loading');
const storage = require('../../core/storage');
const profileCore = require('../../core/profile');
const nav = require('../../core/nav');
const avatarDisplay = require('../../core/avatarDisplay');

function buildLobbyProfile(profile = {}, fallback = {}) {
  const incoming = profile && typeof profile === 'object' ? profile : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  const incomingGender = storage.normalizeGender(incoming.gender);
  const fallbackGender = storage.normalizeGender(base.gender);
  return {
    nickName: storage.getProfileNickName(incoming) || storage.getProfileNickName(base),
    avatar: String(incoming.avatar || incoming.avatarUrl || base.avatar || base.avatarUrl || '').trim(),
    gender: incomingGender !== 'unknown' ? incomingGender : fallbackGender
  };
}

function getPlayerFromJoinResult(result = {}) {
  if (result && result.player && typeof result.player === 'object') return result.player;
  if (result && result.data && result.data.player && typeof result.data.player === 'object') return result.data.player;
  return {};
}

function buildLobbyProfileFromJoinPayload(payload = {}, player = {}) {
  const payloadGender = storage.normalizeGender(payload.gender);
  const playerGender = storage.normalizeGender(player.gender);
  return {
    nickName: String(payload.nickname || player.name || player.nickName || '').trim(),
    avatar: String(payload.avatar || player.avatar || player.avatarUrl || '').trim(),
    gender: payloadGender !== 'unknown' ? payloadGender : playerGender
  };
}

function cacheLobbyProfile(profile = {}) {
  const incoming = { ...(profile && typeof profile === 'object' ? profile : {}) };
  if (storage.normalizeGender(incoming.gender) === 'unknown') delete incoming.gender;
  const merged = profileCore.mergeProfile(storage.getUserProfile() || {}, incoming);
  storage.setUserProfile(merged);
  return buildLobbyProfile(merged);
}

function isCompleteLobbyProfile(profile = {}) {
  return !!storage.getProfileNickName(profile) &&
    !!String(profile.avatar || profile.avatarUrl || '').trim() &&
    storage.normalizeGender(profile.gender) !== 'unknown';
}

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
      cacheLobbyProfile({ avatar: fileID });
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
    if (avatarDisplay.isCloudAvatar(value)) {
      this.avatarCache = avatarDisplay.getSharedAvatarCache(this.avatarCache);
      const cached = avatarDisplay.getCachedAvatarUrl(this.avatarCache, value);
      if (cached) return cached;
      await avatarDisplay.resolveCloudAvatarFileIds([value], this.avatarCache);
      return avatarDisplay.getCachedAvatarUrl(this.avatarCache, value) || fallback;
    }
    return value;
  },

  onProfileAvatarImageError(e) {
    const raw = String(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.avatar || '').trim();
    this.avatarCache = avatarDisplay.getSharedAvatarCache(this.avatarCache);
    if (avatarDisplay.isCloudAvatar(raw)) avatarDisplay.markAvatarUrlFailed(this.avatarCache, raw);
    const fallback = '/assets/avatar-default.png';
    if (this.data.showJoin) {
      if (this.data.joinAvatarDisplay !== fallback) this.setData({ joinAvatarDisplay: fallback });
    } else if (this.data.myAvatarDisplay !== fallback) {
      this.setData({ myAvatarDisplay: fallback });
    }
  },

  onDisplayPlayerAvatarError(e) {
    const raw = String(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.avatarRaw || '').trim();
    if (!raw) return;
    this.avatarCache = avatarDisplay.getSharedAvatarCache(this.avatarCache);
    if (avatarDisplay.isCloudAvatar(raw)) avatarDisplay.markAvatarUrlFailed(this.avatarCache, raw);
    const list = (Array.isArray(this.data.displayPlayers) ? this.data.displayPlayers : []).map((player) => {
      if (String(player && player.avatarRaw || '').trim() !== raw) return player;
      return { ...player, avatarDisplay: '' };
    });
    if (typeof this.applyLobbyPatch === 'function') {
      this.applyLobbyPatch({ displayPlayers: list });
      return;
    }
    this.setData({ displayPlayers: list });
  },

  async resolveDisplayPlayersAvatars() {
    try {
      this.avatarCache = avatarDisplay.getSharedAvatarCache(this.avatarCache);
      const generation = Number(this._displayPlayersAvatarGen || 0) + 1;
      this._displayPlayersAvatarGen = generation;
      const applyPatch = (patch) => {
        if (typeof this.applyLobbyPatch === 'function') return this.applyLobbyPatch(patch);
        this.setData(patch);
        return patch;
      };
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
        if (avatarDisplay.isCloudAvatar(raw)) {
          const cached = avatarDisplay.getCachedAvatarUrl(this.avatarCache, raw);
          if (cached) {
            list[i].avatarDisplay = cached;
          } else {
            list[i].avatarDisplay = '';
            if (avatarDisplay.shouldResolveCloudAvatarFileId(raw, this.avatarCache)) {
              need.push(raw);
              mapIdx[raw] = mapIdx[raw] || [];
              mapIdx[raw].push(i);
            }
          }
        } else {
          list[i].avatarDisplay = raw;
        }
      }

      applyPatch({ displayPlayers: list });

      if (!need.length) return;
      await avatarDisplay.resolveCloudAvatarFileIds(need, this.avatarCache);
      if (this._displayPlayersAvatarGen !== generation) return;
      for (const fileID of Object.keys(mapIdx)) {
        const url = avatarDisplay.getCachedAvatarUrl(this.avatarCache, fileID);
        if (!url) continue;
        const idxs = mapIdx[fileID] || [];
        for (const idx of idxs) {
          if (list[idx]) list[idx].avatarDisplay = url;
        }
      }
      applyPatch({ displayPlayers: list });
    } catch (_) {
      // ignore
    }
  },

  async handleJoin(options = {}) {
    if (this.data.profileSaving || this.data.profileAvatarUploading || this.data.profileQuickFillLoading) return;
    const actionKey = `lobby:joinTournament:${this.data.tournamentId}`;
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'join');
    if (actionGuard.isBusy(actionKey)) return;

    return actionGuard.runWithCriticalPageBusy(this, 'profileSaving', actionKey, async () => {
      this.setData({ profileFieldError: '' });
      const gate = await joinTournamentCore.ensureJoinProfile({
        action: 'join',
        redirect: nav.buildTournamentUrl('/pages/lobby/index', this.data.tournamentId)
      });
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
        cacheLobbyProfile({ nickName: nickname, avatar, gender });
      }

      try {
        const joinPayload = joinTournamentCore.buildJoinPayload({
          tournamentId: tid,
          nickname,
          avatar,
          gender,
          mode: this.data.mode,
          squadChoice: this.data.joinSquadChoice
        });
        const joinResult = await loading.withLoading('加入中...', () => joinTournamentCore.callJoinTournament(joinPayload, {
          action: 'join',
          fallbackMessage: '加入失败，请稍后重试',
          clientRequestId
        }));
        const player = getPlayerFromJoinResult(joinResult);
        const profileSaved = await this.saveLobbyCloudProfile(buildLobbyProfileFromJoinPayload(joinPayload, player), { clientRequestId });
        if (profileSaved) this.clearLastFailedAction();
        wx.showToast({ title: '已加入', icon: 'success' });
        nav.markRefreshFlag(tid);
        this.fetchTournament(tid);
      } catch (err) {
        this.setLastFailedAction('加入参赛', () => this.handleJoin({ clientRequestId }), { actionKey });
        const normalizedError = joinError.normalizeJoinFailure(err, '加入失败，请稍后重试', { action: 'join' });
        this.handleWriteError(normalizedError, joinError.resolveJoinFailureMessage(normalizedError, '加入失败，请稍后重试', { action: 'join' }), () => this.fetchTournament(tid));
      }
    });
  },

  async saveMyProfile(options = {}) {
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
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'join_profile');
    if (actionGuard.isBusy(actionKey)) return;

    return actionGuard.runWithCriticalPageBusy(this, 'profileSaving', actionKey, async () => {
      this.setData({ profileFieldError: '' });
      try {
        const savePayload = joinTournamentCore.buildJoinPayload({
          tournamentId: this.data.tournamentId,
          nickname,
          avatar,
          gender: storage.normalizeGender((storage.getUserProfile() || {}).gender),
          mode: this.data.mode,
          squadChoice: this.data.joinSquadChoice
        });
        const saveResult = await loading.withLoading('保存中...', () => joinTournamentCore.callJoinTournament(savePayload, {
          action: 'profile_update',
          fallbackMessage: '保存失败，请稍后重试',
          clientRequestId
        }));
        const player = getPlayerFromJoinResult(saveResult);
        const profileSaved = await this.saveLobbyCloudProfile(buildLobbyProfileFromJoinPayload(savePayload, player), { clientRequestId });
        if (profileSaved) this.clearLastFailedAction();
        wx.showToast({ title: '已更新', icon: 'success' });
        nav.markRefreshFlag(this.data.tournamentId);

        this.fetchTournament(this.data.tournamentId);
      } catch (err) {
        this.setLastFailedAction('保存我的信息', () => this.saveMyProfile({ clientRequestId }), { actionKey });
        const normalizedError = joinError.normalizeJoinFailure(err, '保存失败，请稍后重试', { action: 'profile_update' });
        this.handleWriteError(normalizedError, joinError.resolveJoinFailureMessage(normalizedError, '保存失败，请稍后重试', { action: 'profile_update' }), () => this.fetchTournament(this.data.tournamentId));
      }
    });
  },

  async saveLobbyCloudProfile(profile = {}, options = {}) {
    const actionKey = `lobby:saveUserProfile:${this.data.tournamentId}`;
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'profile');
    const incoming = { ...(profile && typeof profile === 'object' ? profile : {}) };
    if (storage.normalizeGender(incoming.gender) === 'unknown') delete incoming.gender;
    const mergedProfile = profileCore.mergeProfile(storage.getUserProfile() || {}, incoming);
    const payload = buildLobbyProfile(profile, mergedProfile);
    if (!isCompleteLobbyProfile(payload)) return true;

    try {
      await profileCore.saveCloudProfile(payload, { clientRequestId });
      if (typeof this.clearLastFailedAction === 'function') this.clearLastFailedAction();
      return true;
    } catch (_) {
      if (typeof this.setLastFailedAction === 'function') {
        this.setLastFailedAction('保存我的信息', () => this.saveLobbyCloudProfile(payload, { clientRequestId }), { actionKey });
      }
      return false;
    }
  }
};
