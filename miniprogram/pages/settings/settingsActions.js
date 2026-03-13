const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const storage = require('../../core/storage');
const nav = require('../../core/nav');
const flow = require('../../core/uxFlow');
const writeErrorUi = require('../../core/writeErrorUi');
const viewModel = require('./settingsViewModel');

module.exports = {
  handleWriteError(err, fallbackMessage, onRefresh) {
    writeErrorUi.presentWriteError({
      err,
      fallbackMessage,
      conflictContent: '数据已被其他人更新，刷新后可继续修改比赛。',
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

  goHome() {
    nav.goHome();
  },

  onNameInput(e) {
    this.setData({ name: String((e && e.detail && e.detail.value) || '') });
  },

  onPickTotalMatchesSimple(e) {
    const idx = Number(e.detail.value);
    const m = (this.data.mOptions || [])[idx] || 1;
    const next = { editM: m, mIndex: idx };
    if (this.data.endConditionType === 'total_matches') {
      next.endConditionTarget = m;
      next.endConditionTargetIndex = Math.max(0, m - 1);
    }
    this.setData(next, () => this.syncEndConditionUi());
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
    const next = { editM: m, mDigitValue: viewModel.valueToDigitValue(m, len) };
    if (this.data.endConditionType === 'total_matches') {
      next.endConditionTarget = m;
      next.endConditionTargetIndex = Math.max(0, m - 1);
    }
    this.setData(next, () => this.syncEndConditionUi());
  },

  onPickCourts(e) {
    const idx = Number(e.detail.value);
    const courts = (this.data.courtOptions || [])[idx] || 1;
    this.setData({ editC: courts, courtIndex: idx }, () => {
      this.syncEndConditionUi();
      this.refreshRecommendations();
    });
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

  onPickPointsPerGame(e) {
    const idx = Number(e.detail.value);
    const options = this.data.pointsOptions || viewModel.POINT_OPTIONS;
    const pointsPerGame = Number(options[idx] || 21);
    this.setData({ pointsPerGame, pointsIndex: idx });
  },

  onPickEndConditionType(e) {
    const idx = Number(e.detail.value);
    const options = this.data.endConditionOptions || viewModel.END_CONDITION_OPTIONS;
    const item = options[idx] || options[0] || { key: 'total_matches' };
    const endConditionType = viewModel.normalizeEndConditionType(item.key);
    const suggestedTarget = viewModel.suggestEndConditionTarget(
      endConditionType,
      this.data.editM,
      this.data.editC
    );
    const nextTarget = viewModel.clampTarget(suggestedTarget, this.data.endConditionTargetOptions);
    this.setData({
      endConditionType,
      endConditionIndex: idx,
      endConditionTarget: nextTarget,
      endConditionTargetIndex: Math.max(0, nextTarget - 1)
    }, () => this.syncEndConditionUi());
  },

  onPickEndConditionTarget(e) {
    const idx = Number(e.detail.value);
    const options = this.data.endConditionTargetOptions || [];
    const target = Number(options[idx] || 1);
    this.setData({
      endConditionTarget: target,
      endConditionTargetIndex: idx
    }, () => this.syncEndConditionUi());
  },

  syncEndConditionUi() {
    const type = viewModel.normalizeEndConditionType(this.data.endConditionType);
    const target = viewModel.clampTarget(this.data.endConditionTarget, this.data.endConditionTargetOptions);
    const ui = viewModel.buildEndConditionUi(type, target);
    const patch = {
      endConditionType: type,
      endConditionTarget: target,
      endConditionTargetIndex: Math.max(0, target - 1),
      endConditionTargetLabel: ui.targetLabel,
      endConditionTargetUnit: ui.targetUnit,
      endConditionTargetHint: ui.targetHint,
      showEndConditionTargetPicker: ui.showTargetPicker
    };
    if (type === 'total_matches') {
      patch.endConditionTarget = Math.max(1, Number(this.data.editM) || 1);
      patch.endConditionTargetIndex = Math.max(0, patch.endConditionTarget - 1);
      patch.endConditionTargetHint = viewModel.buildEndConditionUi(type, patch.endConditionTarget).targetHint;
    }
    this.setData(patch);
  },

  refreshRecommendations() {
    const tournament = this.data.tournament || {};
    const players = Array.isArray(tournament.players) ? tournament.players : [];
    const { recommendation } = viewModel.buildRecommendationState({
      mode: this.data.mode,
      players,
      playersCount: players.length,
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

    const name = String(this.data.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入赛事名称', icon: 'none' });
      return;
    }

    const maxMatches = Number(this.data.maxMatches) || 0;
    const M = Number(this.data.editM) || 1;
    const C = Math.max(1, Math.min(10, Number(this.data.editC) || 1));
    if (maxMatches > 0 && M > maxMatches) {
      wx.showToast({ title: `总场次不能超过最大可选 ${maxMatches} 场`, icon: 'none' });
      return;
    }

    const endConditionType = this.data.showSquadEndCondition
      ? viewModel.normalizeEndConditionType(this.data.endConditionType)
      : 'total_matches';
    const endConditionTarget = endConditionType === 'total_matches'
      ? M
      : viewModel.clampTarget(this.data.endConditionTarget, this.data.endConditionTargetOptions);

    const actionKey = `settings:updateSettings:${this.data.tournamentId}`;
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.runWithPageBusy(this, 'settingsBusy', actionKey, async () => {
      wx.showLoading({ title: '保存中...' });
      try {
        cloud.assertWriteResult(await cloud.call('updateSettings', {
          tournamentId: this.data.tournamentId,
          name,
          totalMatches: M,
          courts: C,
          allowOpenTeam: false,
          pointsPerGame: Number(this.data.pointsPerGame) || 21,
          endConditionType,
          endConditionTarget
        }), '保存失败');
        wx.hideLoading();
        this.clearLastFailedAction();
        wx.showToast({ title: '已保存', icon: 'success' });
        await this.fetchTournament(this.data.tournamentId);
        nav.markRefreshFlag(this.data.tournamentId);
        if (this._autoBackTimer) clearTimeout(this._autoBackTimer);
        this._autoBackTimer = setTimeout(() => {
          nav.navigateBackOrRedirect(nav.buildTournamentUrl('/pages/lobby/index', this.data.tournamentId));
        }, 420);
      } catch (e) {
        wx.hideLoading();
        await this.fetchTournament(this.data.tournamentId);
        this.setLastFailedAction('修改比赛', () => this.saveSettings(), { actionKey });
        this.handleWriteError(e, '保存失败', () => this.fetchTournament(this.data.tournamentId));
      }
    });
  }
};
