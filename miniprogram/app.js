const auth = require('./core/auth');

App({
  globalData: {
    openid: '',
    currentTournamentId: ''
  },

  async onLaunch() {
    if (!wx.cloud) {
      console.error('请升级微信基础库以支持云开发');
      return;
    }

    wx.cloud.init({
      env: 'cloud1-1ghmqjyt6428702b',
      traceUser: true
    });

    try {
      const openid = await auth.login();
      this.globalData.openid = openid;
    } catch (e) {
      console.error('登录失败', e);
    }
  }
});
