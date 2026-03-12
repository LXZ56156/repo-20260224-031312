const storage = require('../../core/storage');
const nav = require('../../core/nav');
const flow = require('../../core/uxFlow');
const pageTournamentSync = require('../../core/pageTournamentSync');
const retryAction = require('../../core/retryAction');
const settingsActions = require('./settingsActions');
const settingsSyncController = require('./settingsSyncController');
const settingsViewModel = require('./settingsViewModel');

Page({
  data: {
    tournamentId: '',
    tournament: null,
    pageTitle: '高级参数',
    contextTitle: '',
    showLobbyReturn: false,
    isAdmin: false,
    editM: 0,
    editC: 1,
    useSimpleMPicker: true,
    mOptions: [],
    mIndex: 0,
    mDigitRange: [],
    mDigitValue: [],
    courtOptions: Array.from({ length: 10 }, (_, i) => i + 1),
    courtIndex: 0,
    mode: flow.MODE_MULTI_ROTATE,
    modeLabel: flow.getModeLabel(flow.MODE_MULTI_ROTATE),
    allowOpenTeam: false,
    genderOptions: ['未设', '男', '女'],
    maxMatches: 0,
    suggestedMatches: 1,
    capacityMax: 1,
    capacityHintShort: '',
    capacityReason: 'time',
    rosterHint: '',
    sessionMinuteOptions: flow.SESSION_MINUTE_OPTIONS,
    slotMinuteOptions: flow.SLOT_MINUTE_OPTIONS,
    sessionMinutes: flow.DEFAULT_SESSION_MINUTES,
    slotMinutes: flow.DEFAULT_SLOT_MINUTES,
    sessionMinuteIndex: 2,
    slotMinuteIndex: Math.max(0, flow.SLOT_MINUTE_OPTIONS.indexOf(flow.DEFAULT_SLOT_MINUTES)),
    isDraft: false,
    settingsReady: false,
    playersReady: false,
    playersCount: 0,
    playersGap: 0,
    playersStatusText: '',
    mandatoryDone: 0,
    mandatoryTotal: 2,
    networkOffline: false,
    settingsBusy: false,
    canRetryAction: false,
    lastFailedActionText: '',
    showStaleSyncHint: false,
    syncRefreshing: false,
    syncUsingCache: false,
    syncPollingFallback: false,
    syncCachedAt: 0,
    syncLastUpdatedAt: 0,
    syncStatusVisible: false,
    syncStatusTone: 'info',
    syncStatusText: '',
    syncStatusMeta: '',
    syncStatusActionText: '刷新',
    loadError: false,
    loadErrorTitle: '加载失败',
    loadErrorMessage: '请检查网络后重试。',
    showLoadErrorHome: false
  },

  ...settingsSyncController,
  ...settingsActions,
  ...retryAction.createRetryMethods(),

  onLoad(options) {
    const tid = options.tournamentId;
    const section = String((options && options.section) || '').trim().toLowerCase();
    this._initialSection = section;
    this.openid = (getApp().globalData.openid || storage.get('openid', ''));
    pageTournamentSync.initTournamentSync(this);
    const sessionMinutes = flow.normalizeSessionMinutes(storage.getSessionMinutesPref(), flow.DEFAULT_SESSION_MINUTES);
    const slotMinutes = flow.normalizeSlotMinutes(storage.getSlotMinutesPref(), flow.DEFAULT_SLOT_MINUTES);
    this.setData({ tournamentId: tid });
    this.setData({
      sessionMinutes,
      slotMinutes,
      sessionMinuteIndex: Math.max(0, flow.SESSION_MINUTE_OPTIONS.indexOf(sessionMinutes)),
      slotMinuteIndex: Math.max(0, flow.SLOT_MINUTE_OPTIONS.indexOf(slotMinutes))
    });

    const app = getApp();
    this.setData(pageTournamentSync.composePageSyncPatch(this, {
      networkOffline: !!(app && app.globalData && app.globalData.networkOffline)
    }));
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.setData(pageTournamentSync.composePageSyncPatch(this, { networkOffline: !!offline }));
      });
    }

    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
    pageTournamentSync.teardownTournamentSync(this);
  },

  onUnload() {
    pageTournamentSync.teardownTournamentSync(this);
    if (this._autoBackTimer) clearTimeout(this._autoBackTimer);
    this._autoBackTimer = null;
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  onShow() {
    const currentId = String(this.data.tournamentId || '').trim();
    nav.consumeRefreshFlag(currentId);
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
  },

  applyTournament(tournament) {
    if (!tournament) return;
    const viewState = settingsViewModel.buildSettingsViewState(tournament, {
      openid: this.openid,
      sessionMinutes: this.data.sessionMinutes,
      slotMinutes: this.data.slotMinutes
    });
    this.setData(viewState);

    if (this._initialSection) {
      const sectionMap = {
        params: '#section-params',
        players: '#section-players'
      };
      const selector = sectionMap[this._initialSection];
      this._initialSection = '';
      if (selector) {
        setTimeout(() => this.scrollToSection(selector), 90);
      }
    }

    this.clearLastFailedAction();
  }
});
