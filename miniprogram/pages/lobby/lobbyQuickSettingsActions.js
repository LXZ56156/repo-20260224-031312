const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const flow = require('../../core/uxFlow');
const nav = require('../../core/nav');
const viewModel = require('./lobbyViewModel');
const settingsViewModel = require('../settings/settingsViewModel');

module.exports = {
  syncQuickMatchSelectionUi() {
    const tournament = this.data.tournament || {};
    const players = Array.isArray(tournament.players) ? tournament.players : [];
    const mode = tournament.mode || this.data.mode;
    if (flow.normalizeMode(mode) === flow.MODE_FIXED_PAIR_RR) {
      this.setData({
        quickMatchShortcutOptions: settingsViewModel.buildMatchShortcutOptions({
          mode,
          players,
          playersCount: players.length,
          pairTeams: tournament.pairTeams,
          maxMatches: this.data.maxMatches
        }),
        quickMatchShortcutHint: settingsViewModel.buildMatchShortcutHint(mode),
        quickUseMatchPresetOptions: false,
        quickShowAdvancedMatchEntry: false,
        quickShowAdvancedMatchPicker: false,
        quickCurrentCustomMatchLabel: '',
        quickMatchPresetUnavailableHint: ''
      });
      return;
    }
    const selectionState = settingsViewModel.buildMatchSelectionUiState({
      mode,
      playersCount: flow.getRotationPlayerLimit(tournament) || players.length,
      maxMatches: this.data.maxMatches,
      currentMatches: this.data.quickConfigM,
      courts: this.data.quickConfigC,
      context: 'lobby'
    });
    const advancedSelectionState = settingsViewModel.buildMatchSelectionUiState({
      mode,
      playersCount: flow.getRotationPlayerLimit(tournament) || players.length,
      maxMatches: this.data.maxMatches,
      currentMatches: this.data.quickConfigM,
      courts: this.data.quickConfigC,
      context: 'settings'
    });
    this.setData({
      quickMatchShortcutOptions: selectionState.matchShortcutOptions,
      quickMatchShortcutHint: selectionState.matchShortcutHint,
      quickUseMatchPresetOptions: selectionState.useMatchPresetOptions,
      quickShowAdvancedMatchEntry: advancedSelectionState.showAdvancedMatchEntry,
      ...(!advancedSelectionState.showAdvancedMatchEntry ? { quickShowAdvancedMatchPicker: false } : {}),
      quickCurrentCustomMatchLabel: selectionState.currentCustomMatchLabel,
      quickMatchPresetUnavailableHint: selectionState.matchPresetUnavailableHint
    });
  },

  toggleQuickAdvancedMatchPicker() {
    if (!this.data.canConfigureSettings || !this.data.quickShowAdvancedMatchEntry) return;
    this.setData({ quickShowAdvancedMatchPicker: !this.data.quickShowAdvancedMatchPicker });
  },

  setQuickMatchCount(rawMatchCount) {
    let matchCount = flow.parsePositiveInt(rawMatchCount, 1);
    const maxMatches = Number(this.data.maxMatches) || 0;
    if (maxMatches > 0 && matchCount > maxMatches) {
      matchCount = maxMatches;
    }

    const next = { quickConfigM: matchCount };
    const options = Array.isArray(this.data.quickConfigMOptions) ? this.data.quickConfigMOptions : [];
    const optionIndex = options.indexOf(matchCount);
    if (optionIndex >= 0) {
      next.quickConfigMIndex = optionIndex;
    }

    const digitLen = Array.isArray(this.data.quickConfigMDigitRange)
      ? this.data.quickConfigMDigitRange.length
      : 0;
    if (digitLen > 0) {
      next.quickConfigMDigitValue = viewModel.valueToDigitValue(matchCount, digitLen);
    }

    if (this.data.quickEndConditionType === 'total_matches') {
      next.quickEndConditionTarget = matchCount;
      next.quickEndConditionTargetIndex = Math.max(0, matchCount - 1);
    }

    this.setData(next, () => {
      this.syncQuickEndConditionUi();
      this.syncQuickMatchSelectionUi();
    });
  },

  onPickQuickConfigMSimple(e) {
    const idx = Number(e.detail.value);
    const value = (this.data.quickConfigMOptions || [])[idx] || 1;
    this.setQuickMatchCount(value);
  },

  onPickQuickConfigMDigit(e) {
    const digitValue = e.detail.value || [];
    let matchCount = viewModel.digitValueToNumber(digitValue);
    if (matchCount < 1) matchCount = 1;
    const maxMatches = Number(this.data.maxMatches) || 0;
    if (maxMatches > 0 && matchCount > maxMatches) {
      matchCount = maxMatches;
      wx.showToast({ title: `已限制为最大可选 ${maxMatches} 场`, icon: 'none' });
    }
    this.setQuickMatchCount(matchCount);
  },

  onTapQuickMatchShortcut(e) {
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const disabled = dataset.disabled === true
      || dataset.disabled === 'true'
      || Number(dataset.disabled) === 1;
    if (disabled || !this.data.canConfigureSettings) return;

    const value = flow.parsePositiveInt(dataset.value, 0);
    if (value < 1) return;
    this.setQuickMatchCount(value);
  },

  onPickQuickConfigC(e) {
    const idx = Number(e.detail.value);
    const courts = (this.data.quickConfigCOptions || [])[idx] || 1;
    this.setData({ quickConfigC: courts, quickConfigCIndex: idx }, () => {
      this.syncQuickEndConditionUi();
      this.refreshQuickRecommendations();
    });
  },

  onQuickConfigNameInput(e) {
    if (!this.data.quickCanEditTournamentName) {
      const tournament = this.data.tournament || {};
      this.setData({
        quickConfigName: flow.getSynchronizedTournamentName(
          this.data.quickConfigName,
          tournament.mode || this.data.mode,
          tournament.presetKey
        )
      });
      return;
    }
    this.setData({ quickConfigName: String((e && e.detail && e.detail.value) || '') });
  },

  onPickQuickPointsPerGame(e) {
    const idx = Number(e.detail.value);
    const options = this.data.quickPointsOptions || settingsViewModel.POINT_OPTIONS;
    const quickPointsPerGame = Number(options[idx] || 21);
    this.setData({ quickPointsPerGame, quickPointsIndex: idx });
  },

  onPickQuickEndConditionType(e) {
    const idx = Number(e.detail.value);
    const options = this.data.quickEndConditionOptions || settingsViewModel.END_CONDITION_OPTIONS;
    const item = options[idx] || options[0] || { key: 'total_matches' };
    const quickEndConditionType = settingsViewModel.normalizeEndConditionType(item.key);
    const suggestedTarget = settingsViewModel.suggestEndConditionTarget(
      quickEndConditionType,
      this.data.quickConfigM,
      this.data.quickConfigC
    );
    const quickEndConditionTarget = settingsViewModel.clampTarget(
      suggestedTarget,
      this.data.quickEndConditionTargetOptions
    );
    this.setData({
      quickEndConditionType,
      quickEndConditionIndex: idx,
      quickEndConditionTarget,
      quickEndConditionTargetIndex: Math.max(0, quickEndConditionTarget - 1)
    }, () => this.syncQuickEndConditionUi());
  },

  onPickQuickEndConditionTarget(e) {
    const idx = Number(e.detail.value);
    const options = this.data.quickEndConditionTargetOptions || [];
    const quickEndConditionTarget = Number(options[idx] || 1);
    this.setData({
      quickEndConditionTarget,
      quickEndConditionTargetIndex: idx
    }, () => this.syncQuickEndConditionUi());
  },

  syncQuickEndConditionUi() {
    const type = settingsViewModel.normalizeEndConditionType(this.data.quickEndConditionType);
    const target = settingsViewModel.clampTarget(
      this.data.quickEndConditionTarget,
      this.data.quickEndConditionTargetOptions
    );
    const ui = settingsViewModel.buildEndConditionUi(type, target);
    const patch = {
      quickEndConditionType: type,
      quickEndConditionTarget: target,
      quickEndConditionTargetIndex: Math.max(0, target - 1),
      quickEndConditionTargetLabel: ui.targetLabel,
      quickEndConditionTargetUnit: ui.targetUnit,
      quickEndConditionTargetHint: ui.targetHint,
      quickShowEndConditionTargetPicker: ui.showTargetPicker
    };
    if (type === 'total_matches') {
      patch.quickEndConditionTarget = Math.max(1, Number(this.data.quickConfigM) || 1);
      patch.quickEndConditionTargetIndex = Math.max(0, patch.quickEndConditionTarget - 1);
      patch.quickEndConditionTargetHint = settingsViewModel.buildEndConditionUi(type, patch.quickEndConditionTarget).targetHint;
    }
    this.setData(patch);
  },

  refreshQuickRecommendations() {
    const tournament = this.data.tournament || {};
    const players = Array.isArray(tournament.players) ? tournament.players : [];
    const playersCount = flow.getRotationPlayerLimit(tournament) || players.length;
    const mode = flow.normalizeMode(tournament.mode || flow.MODE_MULTI_ROTATE);
    const { recommendation } = settingsViewModel.buildRecommendationState({
      mode,
      players,
      playersCount,
      courts: this.data.quickConfigC,
      pairTeams: tournament.pairTeams
    });
    this.setData({
      quickSuggestedMatches: Number(recommendation.suggestedMatches) || 1,
      quickCapacityMax: Number(recommendation.capacityMax) || 1,
      quickCapacityHintShort: String(recommendation.capacityHintShort || ''),
      quickCapacityReason: String(recommendation.capacityReason || 'roster'),
      quickRosterHint: String(recommendation.rosterHint || '')
    }, () => this.syncQuickMatchSelectionUi());
  },

  async saveQuickSettings(options = {}) {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '仅管理员可保存参数', icon: 'none' });
      return;
    }
    const tournament = this.data.tournament;
    if (!tournament || tournament.status !== 'draft') {
      wx.showToast({ title: '仅草稿阶段可修改', icon: 'none' });
      return;
    }
    if (!this.data.canConfigureSettings) {
      wx.showToast({ title: '满 4 人后才可设置参数', icon: 'none' });
      return;
    }

    const name = flow.getSynchronizedTournamentName(
      this.data.quickConfigName,
      tournament.mode || this.data.mode,
      tournament.presetKey
    );
    if (!name) {
      wx.showToast({ title: '请输入赛事名称', icon: 'none' });
      return;
    }

    const matchCount = flow.parsePositiveInt(this.data.quickConfigM, 1);
    const courts = flow.parsePositiveInt(this.data.quickConfigC, 1, 10);
    const maxMatches = Number(this.data.maxMatches) || 0;
    if (maxMatches > 0 && matchCount > maxMatches) {
      wx.showToast({ title: `总场次最多 ${maxMatches} 场`, icon: 'none' });
      return;
    }

    const actionKey = `lobby:updateSettings:${this.data.tournamentId}`;
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'update_settings');
    const lifecycleGeneration = Number(this._lifecycleGeneration || 0);
    if (actionGuard.isBusy(actionKey)) return;
    const endConditionType = this.data.quickShowSquadEndCondition
      ? settingsViewModel.normalizeEndConditionType(this.data.quickEndConditionType)
      : 'total_matches';
    const endConditionTarget = endConditionType === 'total_matches'
      ? matchCount
      : settingsViewModel.clampTarget(this.data.quickEndConditionTarget, this.data.quickEndConditionTargetOptions);
    return actionGuard.runWithCriticalPageBusy(this, 'quickSettingsBusy', actionKey, async () => {
      wx.showLoading({ title: '保存中...' });
      try {
        cloud.assertWriteResult(await cloud.call('updateSettings', {
          tournamentId: this.data.tournamentId,
          name,
          totalMatches: matchCount,
          courts,
          pointsPerGame: Number(this.data.quickPointsPerGame) || 21,
          endConditionType,
          endConditionTarget,
          clientRequestId
        }), '保存失败');
        if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) {
          wx.hideLoading();
          return;
        }
        await this.fetchTournament(this.data.tournamentId);
        wx.hideLoading();
        if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
        const readyToStart = !!this.data.checkStartReady;
        this.clearLastFailedAction();
        wx.showToast({ title: readyToStart ? '已保存，可开赛' : '参数已保存', icon: 'success' });
        nav.markRefreshFlag(this.data.tournamentId);
        if (readyToStart) this.focusStartAction();
        return true;
      } catch (err) {
        wx.hideLoading();
        if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
        this.setLastFailedAction('保存比赛参数', () => this.saveQuickSettings({ clientRequestId }), { actionKey });
        this.handleWriteError(err, '保存失败', () => this.fetchTournament(this.data.tournamentId));
      }
    });
  }
};
