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
    modeLabel: flow.getModeLabel(flow.MODE_MULTI_ROTATE),
    networkOffline: false,
    createBusy: false,
    canRetryAction: false,
    lastFailedActionText: ''
  },

  ...retryAction.createRetryMethods(),

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
    this.setData({
      name: modeLabel,
      mode,
      modeLabel
    });
  },

  onUnload() {
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  onName(e) {
    this.setData({ name: e.detail.value });
  },

  async handleCreate(options = {}) {
    const name = String(this.data.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入赛事名称', icon: 'none' });
      return;
    }
    const actionKey = 'create:createTournament';
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'create');
    if (actionGuard.isBusy(actionKey)) return;

    return actionGuard.runWithCriticalPageBusy(this, 'createBusy', actionKey, async () => {
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
        const res = cloud.assertWriteResult(await cloud.call('createTournament', {
          name,
          nickname: storage.getProfileNickName(profile),
          avatar: String(profile.avatar || profile.avatarUrl || '').trim(),
          mode: this.data.mode,
          creatorGender: storage.normalizeGender(profile.gender),
          clientRequestId
        }), '创建失败');
        wx.hideLoading();
        this.clearLastFailedAction();
        wx.redirectTo({
          url: nav.buildTournamentUrl('/pages/lobby/index', res.tournamentId, {
            fromCreate: 1,
            shareTip: 1
          })
        });
      } catch (e) {
        wx.hideLoading();
        this.setLastFailedAction('创建比赛', () => this.handleCreate({ clientRequestId }), { actionKey });
        wx.showToast({ title: cloud.getUnifiedErrorMessage(e, '创建失败'), icon: 'none' });
      }
    });
  }
});
