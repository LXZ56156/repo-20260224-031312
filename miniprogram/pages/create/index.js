const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const retryAction = require('../../core/retryAction');
const storage = require('../../core/storage');
const flow = require('../../core/uxFlow');
const nav = require('../../core/nav');
const profileCore = require('../../core/profile');

Page({
  data: {
    name: '',
    mode: flow.MODE_MULTI_ROTATE,
    presetKey: 'custom',
    modeLabel: flow.getModeLabel(flow.MODE_MULTI_ROTATE),
    canEditTournamentName: true,
    createFlowSteps: [
      '1. 先邀请成员或导入名单',
      '2. 满 4 人后在比赛大厅设置参数并开赛'
    ],
    networkOffline: false,
    createBusy: false,
    canRetryAction: false,
    lastFailedActionText: ''
  },

  ...retryAction.createRetryMethods(),

  async onLoad(options = {}) {
    this._lifecycleGeneration = 0;
    const lifecycleGeneration = 0;
    const app = getApp();
    this.setData({ networkOffline: !!(app && app.globalData && app.globalData.networkOffline) });
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.setData({ networkOffline: !!offline });
      });
    }

    const mode = flow.normalizeMode(options.mode || storage.getDefaultMode());
    const presetKey = mode === flow.MODE_MULTI_ROTATE
      ? flow.normalizePresetKey(options.presetKey)
      : 'custom';
    const preset = flow.resolveRotationPreset(presetKey);
    const modeLabel = flow.getModeDisplayLabel(mode, presetKey);
    const canEditTournamentName = flow.canEditTournamentName(mode, presetKey);
    this.setData({
      name: flow.getSynchronizedTournamentName(modeLabel, mode, presetKey) || modeLabel,
      mode,
      presetKey,
      modeLabel,
      canEditTournamentName,
      createFlowSteps: preset
        ? [
          `1. 邀请或导入至 ${preset.playerLimit} 人`,
          '2. 人齐后可直接开赛'
        ]
        : [
          '1. 先邀请成员或导入名单',
          '2. 满 4 人后在比赛大厅设置参数并开赛'
        ]
    });
    const createUrl = nav.buildUrl('/pages/create/index', {
      mode,
      presetKey: presetKey === 'custom' ? '' : presetKey
    });
    const gate = await profileCore.ensureProfileForAction('create', createUrl, { silent: true });
    if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
    if (!gate.ok) {
      if (gate.reason === 'login_failed') {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      } else {
        wx.navigateTo({ url: profileCore.buildProfileUrl(createUrl) });
      }
      return;
    }
  },

  onHide() {
    this._lifecycleGeneration = Number(this._lifecycleGeneration || 0) + 1;
  },

  onUnload() {
    this._lifecycleGeneration = Number(this._lifecycleGeneration || 0) + 1;
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  onName(e) {
    if (!this.data.canEditTournamentName) {
      this.setData({
        name: flow.getSynchronizedTournamentName(this.data.name, this.data.mode, this.data.presetKey)
      });
      return;
    }
    this.setData({ name: e.detail.value });
  },

  async handleCreate(options = {}) {
    const name = flow.getSynchronizedTournamentName(
      this.data.name,
      this.data.mode,
      this.data.presetKey
    );
    if (!name) {
      wx.showToast({ title: '请输入赛事名称', icon: 'none' });
      return;
    }
    const createUrl = nav.buildUrl('/pages/create/index', {
      mode: this.data.mode,
      presetKey: this.data.presetKey === 'custom' ? '' : this.data.presetKey
    });
    const actionKey = 'create:createTournament';
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'create');
    const lifecycleGeneration = Number(this._lifecycleGeneration || 0);
    if (actionGuard.isBusy(actionKey)) return;

    return actionGuard.runWithCriticalPageBusy(this, 'createBusy', actionKey, async () => {
      const gate = await profileCore.ensureProfileForAction('create', createUrl, { silent: true });
      if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
      if (!gate.ok) {
        if (gate.reason === 'login_failed') {
          wx.showToast({ title: '登录失败，请重试', icon: 'none' });
        } else {
          wx.navigateTo({ url: profileCore.buildProfileUrl(createUrl) });
        }
        return;
      }
      const profile = gate.profile || {};

      wx.showLoading({ title: '创建中...' });
      try {
        const res = cloud.assertWriteResult(await cloud.call('createTournament', {
          name,
          nickname: storage.getProfileNickName(profile),
          avatar: String(profile.avatar || profile.avatarUrl || '').trim(),
          mode: this.data.mode,
          presetKey: this.data.presetKey === 'custom' ? '' : this.data.presetKey,
          creatorGender: storage.normalizeGender(profile.gender),
          clientRequestId
        }), '创建失败');
        wx.hideLoading();
        storage.addRecentTournamentId(res.tournamentId);
        if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
        this.clearLastFailedAction();
        wx.redirectTo({
          url: nav.buildTournamentUrl('/pages/lobby/index', res.tournamentId, {
            fromCreate: 1,
            shareTip: 1
          })
        });
      } catch (e) {
        wx.hideLoading();
        if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
        this.setLastFailedAction('创建比赛', () => this.handleCreate({ clientRequestId }), { actionKey });
        wx.showToast({ title: cloud.getUnifiedErrorMessage(e, '创建失败'), icon: 'none' });
      }
    });
  }
});
