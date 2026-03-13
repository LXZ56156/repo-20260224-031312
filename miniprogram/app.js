const auth = require('./core/auth');
const envConfig = require('./config/env');

App({
  globalData: {
    openid: '',
    currentTournamentId: '',
    networkOffline: false,
    needRefreshTournament: '',
    lobbyIntentTournamentId: '',
    lobbyIntentAction: '',
    adSessionExposureCount: 0,
    runtimeEnv: envConfig.resolveRuntimeEnv('release')
  },

  async onLaunch() {
    if (!wx.cloud) {
      console.error('请升级微信基础库以支持云开发');
      return;
    }

    const runtimeEnv = envConfig.resolveRuntimeEnv();
    this.globalData.runtimeEnv = runtimeEnv;

    wx.cloud.init({
      env: runtimeEnv.cloudEnvId,
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
      const wasOffline = !!this.globalData.networkOffline;
      this.globalData.networkOffline = !res.isConnected;
      const listeners = Array.isArray(this._networkListeners) ? this._networkListeners.slice() : [];
      for (const fn of listeners) {
        if (typeof fn !== 'function') continue;
        try {
          fn(this.globalData.networkOffline, {
            wasOffline,
            reconnected: wasOffline && !this.globalData.networkOffline
          });
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
