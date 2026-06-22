const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const nav = require('../../core/nav');
const profileCore = require('../../core/profile');
const retryAction = require('../../core/retryAction');
const storage = require('../../core/storage');
const flow = require('../../core/uxFlow');

Page({
  data: {
    modeCards: flow.getLaunchModes(),
    createBusy: false,
    createBusyKey: '',
    canRetryAction: false,
    lastFailedActionText: ''
  },

  ...retryAction.createRetryMethods(),

  async onCreate(e) {
    const dataset = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset
      : {};
    const mode = flow.normalizeMode(dataset.mode || flow.MODE_MULTI_ROTATE);
    const presetKey = flow.normalizePresetKey(dataset.presetKey);
    const cardKey = String(dataset.key || presetKey || mode).trim();
    return this.createSelectedTournament({ mode, presetKey, cardKey });
  },

  async createSelectedTournament(selection = {}, options = {}) {
    const mode = flow.normalizeMode(selection.mode || flow.MODE_MULTI_ROTATE);
    const presetKey = flow.normalizePresetKey(selection.presetKey);
    const cardKey = String(selection.cardKey || presetKey || mode).trim();
    const actionKey = 'launch:createTournament';
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'create');
    if (actionGuard.isBusy(actionKey)) return;

    this.setData({ createBusyKey: cardKey });
    try {
      return await actionGuard.runWithCriticalPageBusy(this, 'createBusy', actionKey, async () => {
        const gate = await profileCore.ensureProfileForAction('create', '/pages/launch/index');
        if (!gate.ok) {
          if (gate.reason === 'login_failed') {
            wx.showToast({ title: '登录失败，请重试', icon: 'none' });
          }
          return;
        }

        const profile = gate.profile || {};
        const modeLabel = flow.getModeDisplayLabel(mode, presetKey);
        const name = flow.getSynchronizedTournamentName(modeLabel, mode, presetKey) || modeLabel;
        wx.showLoading({ title: '创建中...' });
        try {
          const result = cloud.assertWriteResult(await cloud.call('createTournament', {
            name,
            nickname: storage.getProfileNickName(profile),
            avatar: String(profile.avatar || profile.avatarUrl || '').trim(),
            mode,
            presetKey: presetKey === 'custom' ? '' : presetKey,
            creatorGender: storage.normalizeGender(profile.gender),
            clientRequestId
          }), '创建失败');
          wx.hideLoading();
          this.clearLastFailedAction();
          wx.redirectTo({
            url: nav.buildTournamentUrl('/pages/lobby/index', result.tournamentId, {
              fromCreate: 1,
              shareTip: 1
            })
          });
        } catch (error) {
          wx.hideLoading();
          this.setLastFailedAction('创建比赛', () => this.createSelectedTournament({
            mode,
            presetKey,
            cardKey
          }, { clientRequestId }), { actionKey });
          wx.showToast({ title: cloud.getUnifiedErrorMessage(error, '创建失败'), icon: 'none' });
        }
      });
    } finally {
      this.setData({ createBusyKey: '' });
    }
  },

  onShowRules(e) {
    const dataset = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset
      : {};
    const mode = flow.normalizeMode(dataset.mode || flow.MODE_MULTI_ROTATE);
    const presetKey = flow.normalizePresetKey(dataset.presetKey);
    const title = `${flow.getModeDisplayLabel(mode, presetKey)}规则`;
    const content = flow.getModeRuleLines(mode, presetKey).join('\n');
    wx.showModal({
      title,
      content,
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
