const profileCore = require('../../core/profile');
const flow = require('./flow');

Page({
  data: {
    title: '正在进入赛事',
    message: '请稍候...',
    showRetry: false,
    tournamentId: '',
    intent: 'join'
  },

  async onLoad(options) {
    options = options || {};
    const tournamentId = flow.parseTournamentId(options);
    const intent = String(options.intent || 'join').trim() || 'join';
    this.setData({ tournamentId, intent });
    await this.enterFlow();
  },

  async enterFlow() {
    const tournamentId = String(this.data.tournamentId || '').trim();
    const intent = String(this.data.intent || 'join').trim();
    const invalid = flow.resolveShareEntryFlow({ tournamentId, intent, gate: null });
    if (invalid.action === 'invalid') {
      this.setData(invalid.state);
      return;
    }

    this.setData({
      title: '正在校验资料',
      message: '首次进入需完善昵称和性别。',
      showRetry: false
    });
    const returnUrl = flow.buildReturnUrl(tournamentId, intent);
    const gate = await profileCore.ensureProfileForAction('share_join', returnUrl);
    const next = flow.resolveShareEntryFlow({ tournamentId, intent, gate });
    this.setData(next.state);
    if (next.action !== 'redirect') {
      return;
    }

    wx.redirectTo({
      url: next.lobbyUrl,
      fail: () => {
        this.setData({
          title: '进入失败',
          message: '请稍后重试。',
          showRetry: true
        });
      }
    });
  },

  async onRetry() {
    await this.enterFlow();
  }
});
