const flow = require('../../core/uxFlow');
const nav = require('../../core/nav');

Page({
  data: {
    redirecting: true
  },

  onLoad(options = {}) {
    const hasSelection = !!String(options.mode || options.presetKey || '').trim();
    if (hasSelection) {
      const mode = flow.normalizeMode(options.mode || flow.MODE_MULTI_ROTATE);
      const presetKey = mode === flow.MODE_MULTI_ROTATE
        ? flow.normalizePresetKey(options.presetKey)
        : 'custom';
      nav.setLaunchIntent({ mode, presetKey });
    }
    this.goLaunch();
  },

  goLaunch() {
    this.setData({ redirecting: true });
    wx.switchTab({
      url: '/pages/launch/index',
      fail: () => this.setData({ redirecting: false })
    });
  }
});
