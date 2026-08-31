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
    runtimeEnv: envConfig.resolveRuntimeEnv('release'),
    lastEnterOptions: null
  },

  async onLaunch(options) {
    this.globalData.lastEnterOptions = options || null;

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

    this._networkListeners = [];
    const updateNetworkStatus = (offline) => {
      const wasOffline = !!this.globalData.networkOffline;
      this.globalData.networkOffline = !!offline;
      const listeners = this._networkListeners.slice();
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
    };
    wx.getNetworkType({
      success: (res) => updateNetworkStatus(res.networkType === 'none')
    });
    wx.onNetworkStatusChange((res) => updateNetworkStatus(!res.isConnected));

    try {
      const openid = await auth.login();
      this.globalData.openid = openid;
    } catch (e) {
      console.error('登录失败', e);
    }
  },

  onShow(options) {
    this.globalData.lastEnterOptions = options || null;
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
