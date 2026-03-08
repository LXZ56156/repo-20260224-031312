const auth = require('./core/auth');

App({
  globalData: {
    openid: '',
    currentTournamentId: '',
    networkOffline: false,
    needRefreshTournament: '',
    lobbyIntentTournamentId: '',
    lobbyIntentAction: '',
    adSessionExposureCount: 0
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

    this._networkListeners = [];
    wx.getNetworkType({
      success: (res) => {
        this.globalData.networkOffline = res.networkType === 'none';
      }
    });
    wx.onNetworkStatusChange((res) => {
      this.globalData.networkOffline = !res.isConnected;
      const listeners = Array.isArray(this._networkListeners) ? this._networkListeners.slice() : [];
      for (const fn of listeners) {
        if (typeof fn !== 'function') continue;
        try {
          fn(this.globalData.networkOffline);
        } catch (err) {
          console.error('network listener failed', err);
        }
      }
    });
  },

  subscribeNetworkChange(fn) {
    if (typeof fn !== 'function') return () => {};
    this._networkListeners = Array.isArray(this._networkListeners) ? this._networkListeners : [];
    this._networkListeners.push(fn);
    return () => {
      this._networkListeners = (this._networkListeners || []).filter((x) => x !== fn);
    };
  }
});
