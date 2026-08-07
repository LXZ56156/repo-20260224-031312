const nav = require('../../core/nav');
const profileCore = require('../../core/profile');
const flow = require('../../core/uxFlow');

Page({
  data: {
    modeCards: flow.getLaunchModes()
  },

  onStartWater() {
    wx.navigateTo({ url: '/pages/water/index' });
  },

  async onStart(e) {
    const dataset = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset
      : {};
    const mode = flow.normalizeMode(dataset.mode || flow.MODE_MULTI_ROTATE);
    const presetKey = flow.normalizePresetKey(dataset.presetKey);
    const gate = await profileCore.ensureProfileForAction('create', '/pages/create/index');
    if (!gate.ok) {
      if (gate.reason === 'login_failed') {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      }
      return;
    }
    wx.navigateTo({ url: nav.buildUrl('/pages/create/index', {
      mode,
      presetKey: presetKey === 'custom' ? '' : presetKey
    }) });
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
