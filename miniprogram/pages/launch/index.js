const profileCore = require('../../core/profile');
const flow = require('../../core/uxFlow');

Page({
  data: {
    modeCards: flow.getLaunchModes()
  },

  async onStart(e) {
    const mode = flow.normalizeMode(
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.mode
        : flow.MODE_MULTI_ROTATE
    );
    const gate = await profileCore.ensureProfileForAction('create', '/pages/create/index');
    if (!gate.ok) {
      if (gate.reason === 'login_failed') {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      }
      return;
    }
    wx.navigateTo({ url: `/pages/create/index?mode=${encodeURIComponent(mode)}` });
  },

  onShowRules(e) {
    const mode = flow.normalizeMode(
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.mode
        : flow.MODE_MULTI_ROTATE
    );
    const title = `${flow.getModeLabel(mode)}规则`;
    const content = flow.getModeRuleLines(mode).join('\n');
    wx.showModal({
      title,
      content,
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
