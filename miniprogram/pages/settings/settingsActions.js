const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const flow = require('../../core/uxFlow');
const nav = require('../../core/nav');
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
    if (!this.data.canEditTournamentName) {
      const tournament = this.data.tournament || {};
      this.setData({
        name: flow.getSynchronizedTournamentName(this.data.name, tournament.mode || this.data.mode, tournament.presetKey)
      });
      return;
    }
    this.setData({ name: String((e && e.detail && e.detail.value) || '') });
  },

  syncMatchSelectionUi() {
    const tournament = this.data.tournament || {};
    const players = Array.isArray(tournament.players) ? tournament.players : [];
    if (this.data.mode === flow.MODE_FIXED_PAIR_RR) {
      this.setData({
        matchShortcutOptions: viewModel.buildMatchShortcutOptions({
          mode: this.data.mode,
          players,
          playersCount: players.length,
          pairTeams: tournament.pairTeams,
          maxMatches: this.data.maxMatches
        }),
        matchShortcutHint: viewModel.buildMatchShortcutHint(this.data.mode),
        useMatchPresetOptions: false,
        showAdvancedMatchEntry: false,
        currentCustomMatchLabel: '',
        matchPresetUnavailableHint: '',
        showAdvancedMatchPicker: false
      });
      return;
    }
    const selectionState = viewModel.buildMatchSelectionUiState({
      mode: this.data.mode,
      playersCount: players.length,
      maxMatches: this.data.maxMatches,
      currentMatches: this.data.editM,
      courts: this.data.editC,
      context: 'settings'
    });
    const patch = {
      matchShortcutOptions: selectionState.matchShortcutOptions,
      matchShortcutHint: selectionState.matchShortcutHint,
      useMatchPresetOptions: selectionState.useMatchPresetOptions,
      showAdvancedMatchEntry: selectionState.showAdvancedMatchEntry,
      currentCustomMatchLabel: selectionState.currentCustomMatchLabel,
      matchPresetUnavailableHint: selectionState.matchPresetUnavailableHint
    };
    if (!selectionState.useMatchPresetOptions) patch.showAdvancedMatchPicker = false;
    this.setData(patch);
  },

  toggleAdvancedMatchPicker() {
    if (!this.data.canConfigureSettings || !this.data.showAdvancedMatchEntry) return;
    this.setData({ showAdvancedMatchPicker: !this.data.showAdvancedMatchPicker });
  },

  setTotalMatches(rawMatchCount, options = {}) {
    let m = flow.parsePositiveInt(rawMatchCount, 1);
    if (m < 1) m = 1;
    const maxMatches = Number(this.data.maxMatches) || 0;
    if (maxMatches > 0 && m > maxMatches) {
      m = maxMatches;
    }

    const next = { editM: m };
    if (this.data.useSimpleMPicker) {
      next.mIndex = Math.max(0, m - 1);
    }
    const len = Array.isArray(this.data.mDigitRange) ? this.data.mDigitRange.length : 0;
    if (len > 0) {
      next.mDigitValue = viewModel.valueToDigitValue(m, len);
    }
    if (this.data.endConditionType === 'total_matches') {
      next.endConditionTarget = m;
      next.endConditionTargetIndex = Math.max(0, m - 1);
    }
    if (options.fromPreset && this.data.useMatchPresetOptions) {
      next.showAdvancedMatchPicker = false;
    }
    this.setData(next, () => {
      this.syncEndConditionUi();
      this.syncMatchSelectionUi();
    });
  },

  onPickTotalMatchesSimple(e) {
    const idx = Number(e.detail.value);
    const m = (this.data.mOptions || [])[idx] || 1;
    const next = { editM: m, mIndex: idx };
    if (this.data.endConditionType === 'total_matches') {
      next.endConditionTarget = m;
      next.endConditionTargetIndex = Math.max(0, m - 1);
    }
    this.setData(next, () => {
      this.syncEndConditionUi();
      this.syncMatchSelectionUi();
    });
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
    this.setData(next, () => {
      this.syncEndConditionUi();
      this.syncMatchSelectionUi();
    });
  },

  onTapMatchShortcut(e) {
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const disabled = dataset.disabled === true
      || dataset.disabled === 'true'
      || Number(dataset.disabled) === 1;
    if (disabled || !this.data.canConfigureSettings) return;
    const value = flow.parsePositiveInt(dataset.value, 0);
    if (value < 1) return;
    this.setTotalMatches(value, { fromPreset: true });
  },

  onPickCourts(e) {
    const idx = Number(e.detail.value);
    const courts = (this.data.courtOptions || [])[idx] || 1;
    this.setData({ editC: courts, courtIndex: idx }, () => {
      this.syncEndConditionUi();
      this.refreshRecommendations();
    });
  },

  onPickPointsPerGame(e) {
    const idx = Number(e.detail.value);
    const options = this.data.pointsOptions || viewModel.POINT_OPTIONS;
    const pointsPerGame = Number(options[idx] || 21);
    this.setData({ pointsPerGame, pointsIndex: idx });
  },

  onWaterEnabledChange(e) {
    if (
      !this.data.showWaterSettings
      || this.data.mode !== flow.MODE_MULTI_ROTATE
      || !this.data.isAdmin
      || !this.data.isDraft
      || !this.data.canConfigureSettings
    ) return;
    this.setData({ waterEnabled: !!(e && e.detail && e.detail.value) });
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
    const playerLimit = flow.getRotationPlayerLimit(tournament);
    const { recommendation } = viewModel.buildRecommendationState({
      mode: this.data.mode,
      players,
      playersCount: playerLimit || players.length,
      courts: this.data.editC,
      pairTeams: tournament.pairTeams
    });
    this.setData({
      suggestedMatches: Number(recommendation.suggestedMatches) || 1,
      capacityMax: Number(recommendation.capacityMax) || 1,
      capacityHintShort: String(recommendation.capacityHintShort || ''),
      capacityReason: String(recommendation.capacityReason || 'time'),
      rosterHint: String(recommendation.rosterHint || '')
    }, () => this.syncMatchSelectionUi());
  },

  async saveSettings(options = {}) {
    if (!this.data.isAdmin) return;
    if (!this.data.tournament || this.data.tournament.status !== 'draft') {
      wx.showToast({ title: '非草稿阶段不可修改', icon: 'none' });
      return;
    }
    if (!this.data.canConfigureSettings) {
      wx.showToast({ title: '满 4 人后才可设置参数', icon: 'none' });
      return;
    }

    const submittedSnapshot = options.submissionSnapshot
      && typeof options.submissionSnapshot === 'object'
      && !Array.isArray(options.submissionSnapshot)
      ? options.submissionSnapshot
      : null;
    const name = submittedSnapshot
      ? String(submittedSnapshot.name || '').trim()
      : flow.getSynchronizedTournamentName(
        this.data.name,
        this.data.tournament.mode || this.data.mode,
        this.data.tournament.presetKey
      );
    if (!name) {
      wx.showToast({ title: '请输入赛事名称', icon: 'none' });
      return;
    }

    const maxMatches = Number(this.data.maxMatches) || 0;
    const M = Number(submittedSnapshot ? submittedSnapshot.totalMatches : this.data.editM) || 1;
    const C = Math.max(1, Math.min(10, Number(submittedSnapshot ? submittedSnapshot.courts : this.data.editC) || 1));
    if (maxMatches > 0 && M > maxMatches) {
      wx.showToast({ title: `总场次不能超过最大可选 ${maxMatches} 场`, icon: 'none' });
      return;
    }

    const endConditionType = submittedSnapshot
      ? viewModel.normalizeEndConditionType(submittedSnapshot.endConditionType)
      : (this.data.showSquadEndCondition
        ? viewModel.normalizeEndConditionType(this.data.endConditionType)
        : 'total_matches');
    const endConditionTarget = submittedSnapshot
      ? Math.max(1, Number(submittedSnapshot.endConditionTarget) || M)
      : (endConditionType === 'total_matches'
        ? M
        : viewModel.clampTarget(this.data.endConditionTarget, this.data.endConditionTargetOptions));

    const actionKey = `settings:updateSettings:${this.data.tournamentId}`;
    const clientRequestId = clientRequest.resolveClientRequestId(
      options.clientRequestId || (submittedSnapshot && submittedSnapshot.clientRequestId),
      'update_settings'
    );
    const payload = submittedSnapshot
      ? {
        ...submittedSnapshot,
        ...(submittedSnapshot.water ? { water: { ...submittedSnapshot.water } } : {}),
        clientRequestId
      }
      : {
        tournamentId: this.data.tournamentId,
        name,
        totalMatches: M,
        courts: C,
        pointsPerGame: Number(this.data.pointsPerGame) || 21,
        endConditionType,
        endConditionTarget,
        clientRequestId
      };
    if (!submittedSnapshot && this.data.showWaterSettings && this.data.mode === flow.MODE_MULTI_ROTATE) {
      payload.water = {
        enabled: this.data.waterEnabled === true,
        defaultUnitsPerLoser: viewModel.normalizeWaterDefaultUnits(this.data.waterDefaultUnitsPerLoser)
      };
    }
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.runWithCriticalPageBusy(this, 'settingsBusy', actionKey, async () => {
      wx.showLoading({ title: '保存中...' });
      try {
        cloud.assertWriteResult(await cloud.call('updateSettings', payload), '保存失败');
        await this.fetchTournament(this.data.tournamentId);
        const readyToStart = !!this.data.checkStartReady;
        wx.hideLoading();
        this.clearLastFailedAction();
        wx.showToast({ title: readyToStart ? '已保存，可开赛' : '已保存', icon: 'success' });
        nav.markRefreshFlag(this.data.tournamentId);
        if (readyToStart) {
          nav.setLobbyIntent(this.data.tournamentId, 'focus_start');
        }
        if (this._autoBackTimer) clearTimeout(this._autoBackTimer);
        this._autoBackTimer = setTimeout(() => {
          nav.navigateBackOrRedirect(nav.buildTournamentUrl('/pages/lobby/index', this.data.tournamentId));
        }, 420);
      } catch (e) {
        wx.hideLoading();
        await this.fetchTournament(this.data.tournamentId);
        this.setLastFailedAction('修改比赛', () => this.saveSettings({
          clientRequestId,
          submissionSnapshot: payload
        }), { actionKey });
        this.handleWriteError(e, '保存失败', () => this.fetchTournament(this.data.tournamentId));
      }
    });
  }
};
