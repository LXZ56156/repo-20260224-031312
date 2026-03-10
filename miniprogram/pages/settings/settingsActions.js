const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const storage = require('../../core/storage');
const nav = require('../../core/nav');
const flow = require('../../core/uxFlow');
const retryAction = require('../../core/retryAction');
const viewModel = require('./settingsViewModel');

module.exports = {
  handleWriteError(err, fallbackMessage, onRefresh) {
    retryAction.presentWriteError(this, err, fallbackMessage, {
      conflictContent: '数据已被其他人更新，刷新后可继续当前设置。',
      onRefresh
    });
  },

  scrollToSection(selector) {
    if (!selector) return;
    try {
      wx.pageScrollTo({ selector, duration: 220 });
    } catch (_) {
      // ignore
    }
  },

  onPrepActionTap(e) {
    const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '').trim();
    if (key === 'params') {
      this.scrollToSection('#section-params');
      return;
    }
    if (key === 'players') {
      if (this.data.isAdmin && this.data.isDraft) {
        this.goLobbyManagePlayers();
        return;
      }
      this.scrollToSection('#section-players');
    }
  },

  goLobbyManagePlayers() {
    const tid = String(this.data.tournamentId || '').trim();
    if (!tid) return;
    nav.setLobbyIntent(tid, 'quickImport');
    nav.navigateBackOrRedirect(`/pages/lobby/index?tournamentId=${tid}`);
  },

  goHome() {
    wx.reLaunch({
      url: '/pages/home/index',
      fail: () => wx.navigateTo({ url: '/pages/home/index' })
    });
  },

  onPickTotalMatchesSimple(e) {
    const idx = Number(e.detail.value);
    const m = (this.data.mOptions || [])[idx] || 1;
    this.setData({ editM: m, mIndex: idx });
  },

  onPickTotalMatches(e) {
    const digitValue = e.detail.value || [];
    let m = viewModel.digitValueToNumber(digitValue);
    if (m < 1) m = 1;
    const maxMatches = Number(this.data.maxMatches) || 0;
    if (maxMatches > 0 && m > maxMatches) {
      m = maxMatches;
      wx.showToast({ title: `已限制为最大可选 ${maxMatches} 场`, icon: 'none' });
    }
    const len = (this.data.mDigitRange || []).length || digitValue.length;
    this.setData({ editM: m, mDigitValue: viewModel.valueToDigitValue(m, len) });
  },

  onPickCourts(e) {
    const idx = Number(e.detail.value);
    const courts = (this.data.courtOptions || [])[idx] || 1;
    this.setData({ editC: courts, courtIndex: idx }, () => this.refreshRecommendations());
  },

  onPickSessionMinutes(e) {
    const idx = Number(e.detail.value);
    const options = this.data.sessionMinuteOptions || flow.SESSION_MINUTE_OPTIONS;
    const sessionMinutes = Number(options[idx] || flow.DEFAULT_SESSION_MINUTES);
    storage.setSessionMinutesPref(sessionMinutes);
    this.setData({ sessionMinutes, sessionMinuteIndex: idx }, () => this.refreshRecommendations());
  },

  onPickSlotMinutes(e) {
    const idx = Number(e.detail.value);
    const options = this.data.slotMinuteOptions || flow.SLOT_MINUTE_OPTIONS;
    const slotMinutes = Number(options[idx] || flow.DEFAULT_SLOT_MINUTES);
    storage.setSlotMinutesPref(slotMinutes);
    this.setData({ slotMinutes, slotMinuteIndex: idx }, () => this.refreshRecommendations());
  },

  refreshRecommendations() {
    const tournament = this.data.tournament || {};
    const players = Array.isArray(tournament.players) ? tournament.players : [];
    const { recommendation } = viewModel.buildRecommendationState({
      mode: this.data.mode,
      players,
      playersCount: Number(this.data.playersCount) || 0,
      courts: this.data.editC,
      sessionMinutes: this.data.sessionMinutes,
      slotMinutes: this.data.slotMinutes,
      allowOpenTeam: this.data.allowOpenTeam
    });
    this.setData({
      suggestedMatches: Number(recommendation.suggestedMatches) || 1,
      capacityMax: Number(recommendation.capacityMax) || 1,
      capacityHintShort: String(recommendation.capacityHintShort || ''),
      capacityReason: String(recommendation.capacityReason || 'time'),
      rosterHint: String(recommendation.rosterHint || '')
    });
  },

  async saveSettings() {
    if (!this.data.isAdmin) return;
    if (!this.data.tournament || this.data.tournament.status !== 'draft') {
      wx.showToast({ title: '非草稿阶段不可修改', icon: 'none' });
      return;
    }
    const maxMatches = Number(this.data.maxMatches) || 0;
    const M = Number(this.data.editM) || 1;
    const C = Math.max(1, Math.min(10, Number(this.data.editC) || 1));
    if (maxMatches > 0 && M > maxMatches) {
      wx.showToast({ title: `总场次不能超过最大可选 ${maxMatches} 场`, icon: 'none' });
      return;
    }

    const actionKey = `settings:updateSettings:${this.data.tournamentId}`;
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.runWithPageBusy(this, 'settingsBusy', actionKey, async () => {
      wx.showLoading({ title: '保存中...' });
      try {
        await cloud.call('updateSettings', {
          tournamentId: this.data.tournamentId,
          totalMatches: M,
          courts: C,
          allowOpenTeam: this.data.allowOpenTeam
        });
        wx.hideLoading();
        this.clearLastFailedAction();
        wx.showToast({ title: maxMatches > 0 ? '已保存' : '已预配置', icon: 'success' });
        await this.fetchTournament(this.data.tournamentId);
        nav.markRefreshFlag(this.data.tournamentId);
        if (this._autoBackTimer) clearTimeout(this._autoBackTimer);
        this._autoBackTimer = setTimeout(() => {
          nav.navigateBackOrRedirect(`/pages/lobby/index?tournamentId=${this.data.tournamentId}`);
        }, 420);
      } catch (e) {
        wx.hideLoading();
        this.setLastFailedAction('保存参数', () => this.saveSettings());
        this.handleWriteError(e, '保存失败', () => this.fetchTournament(this.data.tournamentId));
      }
    });
  },

  onAllowOpenChange(e) {
    const allowOpenTeam = !!(e && e.detail && e.detail.value);
    this.setData({ allowOpenTeam }, () => this.refreshRecommendations());
  },

  async onPickPlayerGender(e) {
    if (!this.data.isAdmin || !this.data.isDraft) return;
    const playerId = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.player) || '').trim();
    const idx = Number(e.detail.value);
    if (!playerId || Number.isNaN(idx)) return;
    const map = ['unknown', 'male', 'female'];
    const gender = map[idx] || 'unknown';
    return this.updatePlayerGender(playerId, gender);
  },

  async updatePlayerGender(playerId, gender) {
    const id = String(playerId || '').trim();
    if (!id) return;
    const actionKey = `settings:updatePlayerGender:${this.data.tournamentId}:${id}`;
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.run(actionKey, async () => {
      wx.showLoading({ title: '保存中...' });
      try {
        await cloud.call('updateSettings', {
          tournamentId: this.data.tournamentId,
          playerGenderPatch: { [id]: gender }
        });
        wx.hideLoading();
        this.clearLastFailedAction();
        await this.fetchTournament(this.data.tournamentId);
        nav.markRefreshFlag(this.data.tournamentId);
      } catch (err) {
        wx.hideLoading();
        this.setLastFailedAction('更新球员性别', () => this.updatePlayerGender(id, gender));
        this.handleWriteError(err, '保存失败', () => this.fetchTournament(this.data.tournamentId));
      }
    });
  },

  async removePlayer(e) {
    const playerId = e.currentTarget.dataset.player;
    wx.showModal({
      title: '确认移除？',
      content: '仅草稿阶段可移除，创建者不可移除。',
      success: async (res) => {
        if (!res.confirm) return;
        const actionKey = `settings:removePlayer:${this.data.tournamentId}:${playerId}`;
        if (actionGuard.isBusy(actionKey)) return;
        await actionGuard.run(actionKey, async () => {
          wx.showLoading({ title: '移除中...' });
          try {
            await cloud.call('removePlayer', {
              tournamentId: this.data.tournamentId,
              playerId
            });
            wx.hideLoading();
            this.clearLastFailedAction();
            wx.showToast({ title: '已移除', icon: 'success' });
            this.fetchTournament(this.data.tournamentId);
          } catch (err) {
            wx.hideLoading();
            this.setLastFailedAction('移除参赛者', () => this.removePlayer({ currentTarget: { dataset: { player: playerId } } }));
            this.handleWriteError(err, '移除失败', () => this.fetchTournament(this.data.tournamentId));
          }
        });
      }
    });
  }
};
