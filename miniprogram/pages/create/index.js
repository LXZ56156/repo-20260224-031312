const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const storage = require('../../core/storage');
const flow = require('../../core/uxFlow');
const profileCore = require('../../core/profile');

const POINT_OPTIONS = [11, 15, 21];
const END_CONDITION_OPTIONS = [
  { key: 'total_matches', label: '打满总场数' },
  { key: 'total_rounds', label: '打满总轮数' },
  { key: 'target_wins', label: '先到目标胜场' }
];

function normalizeEndConditionType(type) {
  const v = String(type || '').trim().toLowerCase();
  if (v === 'total_rounds' || v === 'target_wins' || v === 'total_matches') return v;
  return 'total_matches';
}

function clampTarget(target, options) {
  const list = Array.isArray(options) ? options : [];
  const min = list.length ? Number(list[0] || 1) : 1;
  const max = list.length ? Number(list[list.length - 1] || 1) : 1;
  const n = Math.floor(Number(target) || 1);
  return Math.max(min, Math.min(max, n));
}

function suggestEndConditionTarget(type, totalMatches, courts) {
  const normalized = normalizeEndConditionType(type);
  const M = Math.max(1, Math.floor(Number(totalMatches) || 1));
  const C = Math.max(1, Math.floor(Number(courts) || 1));
  if (normalized === 'total_matches') return M;
  if (normalized === 'total_rounds') return Math.max(1, Math.ceil(M / C));
  return Math.max(1, Math.ceil(M / 2));
}

function buildEndConditionUi(type, target) {
  const normalized = normalizeEndConditionType(type);
  const t = Math.max(1, Math.floor(Number(target) || 1));
  if (normalized === 'total_matches') {
    return {
      targetLabel: '总场数（自动）',
      targetUnit: '场',
      targetHint: `比赛累计打满 ${t} 场后结束（与总场次一致）。`,
      showTargetPicker: false
    };
  }
  if (normalized === 'total_rounds') {
    return {
      targetLabel: '总轮数',
      targetUnit: '轮',
      targetHint: `比赛进行到第 ${t} 轮后结束。`,
      showTargetPicker: true
    };
  }
  return {
    targetLabel: '目标胜场',
    targetUnit: '胜',
    targetHint: `任一队先拿到 ${t} 胜即结束。`,
    showTargetPicker: true
  };
}

Page({
  data: {
    name: '',
    mode: flow.MODE_MULTI_ROTATE,
    modeLabel: flow.getModeLabel(flow.MODE_MULTI_ROTATE),
    allowOpenTeam: false,

    quickPresetKey: 'standard',
    presetOptions: flow.getPresetOptions(),
    totalMatchOptions: Array.from({ length: 200 }, (_, i) => i + 1),
    totalMatchIndex: 7,
    courtOptions: Array.from({ length: 10 }, (_, i) => i + 1),
    courtIndex: 1,
    totalMatches: 8,
    courts: 2,
    sessionMinuteOptions: flow.SESSION_MINUTE_OPTIONS,
    slotMinuteOptions: flow.SLOT_MINUTE_OPTIONS,
    sessionMinutes: flow.DEFAULT_SESSION_MINUTES,
    slotMinutes: flow.DEFAULT_SLOT_MINUTES,
    sessionMinuteIndex: 2,
    slotMinuteIndex: Math.max(0, flow.SLOT_MINUTE_OPTIONS.indexOf(flow.DEFAULT_SLOT_MINUTES)),
    suggestedMatches: 1,
    capacityMax: 1,
    capacityHintShort: '',
    capacityReason: 'time',
    rosterHint: '',

    pointsOptions: POINT_OPTIONS,
    pointsPerGame: 21,
    pointsIndex: 2,
    endConditionOptions: END_CONDITION_OPTIONS,
    endConditionType: 'total_matches',
    endConditionIndex: 0,
    endConditionTargetOptions: Array.from({ length: 200 }, (_, i) => i + 1),
    endConditionTarget: 10,
    endConditionTargetIndex: 9,
    endConditionTargetLabel: '总场数（自动）',
    endConditionTargetUnit: '场',
    endConditionTargetHint: '',
    showEndConditionTargetPicker: false,
    showSquadEndCondition: false,

    networkOffline: false,
    createBusy: false,
    canRetryAction: false,
    lastFailedActionText: ''
  },

  async onLoad(options = {}) {
    const app = getApp();
    this.setData({ networkOffline: !!(app && app.globalData && app.globalData.networkOffline) });
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.setData({ networkOffline: !!offline });
      });
    }

    const gate = await profileCore.ensureProfileForAction('create', '/pages/create/index');
    if (!gate.ok) {
      if (gate.reason === 'login_failed') {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      }
      return;
    }

    const mode = flow.normalizeMode(options.mode || storage.getDefaultMode());
    const modeLabel = flow.getModeLabel(mode);
    const sessionMinutes = flow.normalizeSessionMinutes(storage.getSessionMinutesPref(), flow.DEFAULT_SESSION_MINUTES);
    const slotMinutes = flow.normalizeSlotMinutes(storage.getSlotMinutesPref(), flow.DEFAULT_SLOT_MINUTES);
    this.setData({
      name: modeLabel,
      mode,
      modeLabel,
      showSquadEndCondition: mode === flow.MODE_SQUAD_DOUBLES,
      sessionMinutes,
      slotMinutes,
      sessionMinuteIndex: Math.max(0, flow.SESSION_MINUTE_OPTIONS.indexOf(sessionMinutes)),
      slotMinuteIndex: Math.max(0, flow.SLOT_MINUTE_OPTIONS.indexOf(slotMinutes))
    });
    this.syncEndConditionUi();
    this.refreshRecommendations({ adoptSuggested: true });
  },

  onUnload() {
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  onName(e) {
    this.setData({ name: e.detail.value });
  },

  onPickTotalMatches(e) {
    const idx = Number(e.detail.value);
    const totalMatches = (this.data.totalMatchOptions || [])[idx] || 1;
    const next = { totalMatches, totalMatchIndex: idx, quickPresetKey: 'custom' };
    if (this.data.endConditionType === 'total_matches') {
      const target = clampTarget(totalMatches, this.data.endConditionTargetOptions);
      next.endConditionTarget = target;
      next.endConditionTargetIndex = Math.max(0, target - 1);
    }
    this.setData(next, () => this.syncEndConditionUi());
  },

  onPickCourts(e) {
    const idx = Number(e.detail.value);
    const courts = (this.data.courtOptions || [])[idx] || 1;
    this.setData({ courts, courtIndex: idx, quickPresetKey: 'custom' }, () => {
      this.syncEndConditionUi();
      this.refreshRecommendations();
    });
  },

  onPickSessionMinutes(e) {
    const idx = Number(e.detail.value);
    const options = this.data.sessionMinuteOptions || flow.SESSION_MINUTE_OPTIONS;
    const sessionMinutes = Number(options[idx] || flow.DEFAULT_SESSION_MINUTES);
    storage.setSessionMinutesPref(sessionMinutes);
    this.setData({ sessionMinutes, sessionMinuteIndex: idx, quickPresetKey: 'custom' }, () => this.refreshRecommendations());
  },

  onPickSlotMinutes(e) {
    const idx = Number(e.detail.value);
    const options = this.data.slotMinuteOptions || flow.SLOT_MINUTE_OPTIONS;
    const slotMinutes = Number(options[idx] || flow.DEFAULT_SLOT_MINUTES);
    storage.setSlotMinutesPref(slotMinutes);
    this.setData({ slotMinutes, slotMinuteIndex: idx, quickPresetKey: 'custom' }, () => this.refreshRecommendations());
  },

  onPickPointsPerGame(e) {
    const idx = Number(e.detail.value);
    const options = this.data.pointsOptions || POINT_OPTIONS;
    const pointsPerGame = Number(options[idx] || 21);
    this.setData({ pointsPerGame, pointsIndex: idx });
  },

  onPickEndConditionType(e) {
    const idx = Number(e.detail.value);
    const options = this.data.endConditionOptions || END_CONDITION_OPTIONS;
    const item = options[idx] || options[0];
    const endConditionType = normalizeEndConditionType(item.key);
    const suggestedTarget = suggestEndConditionTarget(
      endConditionType,
      this.data.totalMatches,
      this.data.courts
    );
    const nextTarget = clampTarget(suggestedTarget, this.data.endConditionTargetOptions);
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

  refreshRecommendations(options = {}) {
    const opts = options || {};
    const recommendation = flow.buildMatchCountRecommendations({
      mode: this.data.mode,
      playersCount: 0,
      courts: this.data.courts,
      sessionMinutes: this.data.sessionMinutes,
      slotMinutes: this.data.slotMinutes,
      allowOpenTeam: this.data.allowOpenTeam
    });
    const suggestedMatches = Number(recommendation.suggestedMatches) || 1;
    const nextState = {
      suggestedMatches,
      capacityMax: Number(recommendation.capacityMax) || 1,
      capacityHintShort: String(recommendation.capacityHintShort || ''),
      capacityReason: String(recommendation.capacityReason || 'time'),
      rosterHint: String(recommendation.rosterHint || '')
    };
    if (opts.adoptSuggested === true) {
      const bounded = Math.max(1, Math.min(
        suggestedMatches,
        Array.isArray(this.data.totalMatchOptions) ? this.data.totalMatchOptions.length : 200
      ));
      nextState.totalMatches = bounded;
      nextState.totalMatchIndex = Math.max(0, bounded - 1);
      if (this.data.endConditionType === 'total_matches') {
        nextState.endConditionTarget = bounded;
        nextState.endConditionTargetIndex = Math.max(0, bounded - 1);
      }
    }
    this.setData(nextState, () => {
      if (opts.adoptSuggested === true) this.syncEndConditionUi();
    });
  },

  applyPreset(e) {
    const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '').trim();
    const preset = flow.getPresetOption(key);
    this.setData({
      quickPresetKey: preset.key,
      totalMatches: preset.totalMatches,
      courts: preset.courts,
      totalMatchIndex: Math.max(0, preset.totalMatches - 1),
      courtIndex: Math.max(0, preset.courts - 1)
    }, () => {
      if (this.data.endConditionType === 'total_matches') {
        const target = clampTarget(this.data.totalMatches, this.data.endConditionTargetOptions);
        this.setData({
          endConditionTarget: target,
          endConditionTargetIndex: Math.max(0, target - 1)
        }, () => {
          this.syncEndConditionUi();
          this.refreshRecommendations();
        });
        return;
      }
      this.syncEndConditionUi();
      this.refreshRecommendations();
    });
  },

  syncEndConditionUi() {
    const type = normalizeEndConditionType(this.data.endConditionType);
    const target = clampTarget(this.data.endConditionTarget, this.data.endConditionTargetOptions);
    const ui = buildEndConditionUi(type, target);
    this.setData({
      endConditionTarget: target,
      endConditionTargetIndex: Math.max(0, target - 1),
      endConditionTargetLabel: ui.targetLabel,
      endConditionTargetUnit: ui.targetUnit,
      endConditionTargetHint: ui.targetHint,
      showEndConditionTargetPicker: ui.showTargetPicker
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

  async handleCreate() {
    const name = String(this.data.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入赛事名称', icon: 'none' });
      return;
    }
    const actionKey = 'create:createTournament';
    if (actionGuard.isBusy(actionKey)) return;

    return actionGuard.runWithPageBusy(this, 'createBusy', actionKey, async () => {
      const gate = await profileCore.ensureProfileForAction('create', '/pages/create/index');
      if (!gate.ok) {
        if (gate.reason === 'login_failed') {
          wx.showToast({ title: '登录失败，请重试', icon: 'none' });
        }
        return;
      }
      const profile = gate.profile || {};

      wx.showLoading({ title: '创建中...' });
      try {
        const settings = flow.resolveCreateSettings({
          mode: this.data.mode,
          presetKey: this.data.quickPresetKey,
          totalMatches: this.data.totalMatches,
          courts: this.data.courts
        });
        const endConditionType = normalizeEndConditionType(this.data.endConditionType);
        const endConditionTarget = Math.max(1, Number(this.data.endConditionTarget) || 1);

        const res = await cloud.call('createTournament', {
          name,
          nickname: storage.getProfileNickName(profile),
          avatar: String(profile.avatar || profile.avatarUrl || '').trim(),
          mode: settings.mode,
          creatorGender: storage.normalizeGender(profile.gender),
          allowOpenTeam: false,
          totalMatches: settings.totalMatches,
          courts: settings.courts,
          presetKey: settings.presetKey,
          pointsPerGame: Number(this.data.pointsPerGame) || 21,
          endConditionType: settings.mode === flow.MODE_SQUAD_DOUBLES ? endConditionType : 'total_matches',
          endConditionTarget: settings.mode === flow.MODE_SQUAD_DOUBLES ? endConditionTarget : settings.totalMatches
        });
        wx.hideLoading();
        this.clearLastFailedAction();
        wx.redirectTo({ url: `/pages/lobby/index?tournamentId=${res.tournamentId}&fromCreate=1&presetApplied=1&shareTip=1` });
      } catch (e) {
        wx.hideLoading();
        this.setLastFailedAction('创建比赛', () => this.handleCreate());
        wx.showToast({ title: cloud.getUnifiedErrorMessage(e, '创建失败'), icon: 'none' });
      }
    });
  }
});
