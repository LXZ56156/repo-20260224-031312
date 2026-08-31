const nav = require('../../core/nav');
const profileCore = require('../../core/profile');
const flow = require('../../core/uxFlow');

Page({
  data: {
    modeCards: flow.getLaunchModes()
  },

  onShow() {
    this._entryGeneration = Number(this._entryGeneration || 0) + 1;
    this._entryBusy = false;
  },

  onHide() {
    this._entryGeneration = Number(this._entryGeneration || 0) + 1;
  },

  onStartWater() {
    if (this._entryBusy) return;
    this._entryBusy = true;
    const entryGeneration = Number(this._entryGeneration || 0);
    wx.navigateTo({
      url: '/pages/water/index',
      fail: () => {
        if (Number(this._entryGeneration || 0) === entryGeneration) this._entryBusy = false;
      }
    });
  },

  async onStart(e) {
    if (this._entryBusy) return;
    this._entryBusy = true;
    const entryGeneration = Number(this._entryGeneration || 0);
    const dataset = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset
      : {};
    const mode = flow.normalizeMode(dataset.mode || flow.MODE_MULTI_ROTATE);
    const presetKey = flow.normalizePresetKey(dataset.presetKey);
    const createUrl = nav.buildUrl('/pages/create/index', {
      mode,
      presetKey: presetKey === 'custom' ? '' : presetKey
    });
    let gate;
    try {
      gate = await profileCore.ensureProfileForAction('create', createUrl, { silent: true });
    } catch (err) {
      if (Number(this._entryGeneration || 0) === entryGeneration) this._entryBusy = false;
      throw err;
    }
    if (Number(this._entryGeneration || 0) !== entryGeneration) return;
    if (!gate.ok) {
      if (gate.reason === 'login_failed') {
        this._entryBusy = false;
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      } else {
        wx.navigateTo({
          url: profileCore.buildProfileUrl(createUrl),
          fail: () => {
            if (Number(this._entryGeneration || 0) === entryGeneration) this._entryBusy = false;
          }
        });
      }
      return;
    }
    wx.navigateTo({
      url: createUrl,
      fail: () => {
        if (Number(this._entryGeneration || 0) === entryGeneration) this._entryBusy = false;
      }
    });
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
