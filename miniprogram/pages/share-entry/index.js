const profileCore = require('../../core/profile');

function parseTournamentId(options = {}) {
  let tid = String(options.tournamentId || '').trim();
  if (!tid && options.scene) {
    const scene = decodeURIComponent(options.scene);
    const m = /tournamentId=([^&]+)/.exec(scene) || /tid=([^&]+)/.exec(scene);
    if (m) tid = m[1];
  }
  return tid;
}

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
    const tournamentId = parseTournamentId(options);
    const intent = String(options.intent || 'join').trim() || 'join';
    this.setData({ tournamentId, intent });
    await this.enterFlow();
  },

  async enterFlow() {
    const tournamentId = String(this.data.tournamentId || '').trim();
    const intent = String(this.data.intent || 'join').trim();
    if (!tournamentId) {
      this.setData({
        title: '链接无效',
        message: '未识别到赛事信息，请重新打开分享链接。',
        showRetry: true
      });
      return;
    }

    this.setData({
      title: '正在校验资料',
      message: '首次进入需完善昵称和性别。',
      showRetry: false
    });
    const returnUrl = `/pages/share-entry/index?tournamentId=${encodeURIComponent(tournamentId)}&intent=${encodeURIComponent(intent)}`;
    const gate = await profileCore.ensureProfileForAction('share_join', returnUrl);
    if (!gate.ok) {
      if (gate.reason === 'login_failed') {
        this.setData({
          title: '登录失败',
          message: '请检查网络后重试。',
          showRetry: true
        });
      }
      return;
    }

    this.setData({
      title: '正在进入比赛',
      message: '即将打开赛事页面...'
    });
    wx.redirectTo({
      url: `/pages/lobby/index?tournamentId=${encodeURIComponent(tournamentId)}&intent=${encodeURIComponent(intent)}&fromShare=1`,
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
