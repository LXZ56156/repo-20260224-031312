const storage = require('../../core/storage');
const tournamentSync = require('../../core/tournamentSync');
const flow = require('../../core/uxFlow');
const nav = require('../../core/nav');
const viewModel = require('./lobbyViewModel');
const profileActions = require('./lobbyProfileActions');
const draftActions = require('./lobbyDraftActions');
const pairTeamActions = require('./lobbyPairTeamActions');

Page({
  data: {
    tournamentId: '',
    tournament: null,
    statusText: '',
    statusClass: 'tag-draft',

    nickname: '',
    joinAvatar: '',
    joinAvatarDisplay: '/assets/avatar-default.png',

    showMyProfile: false,
    myNickname: '',
    myAvatar: '',
    myAvatarDisplay: '/assets/avatar-default.png',
    myJoined: false,

    isAdmin: false,

    showJoin: false,
    showAllPlayers: false,
    playersPreview: [],
    displayPlayers: [],

    createdAtText: '',
    kpiReady: false,
    kpiPlayers: '—',
    kpiMatches: '—',
    kpiCourts: '—',
    matchInfoText: '未设置',
    modeLabel: '多人转',
    mode: flow.MODE_MULTI_ROTATE,
    modeRules: [],
    pointsPerGame: 21,
    genderSummaryText: '',
    loadError: false,
    joinSquadChoice: 'A',
    pairTeams: [],
    pairTeamsUi: [],
    pairTeamCandidates: [],
    pairTeamName: '',
    pairTeamFirstIndex: 0,
    pairTeamSecondIndex: 1,
    pairTeamBusy: false,

    checkPlayersOk: false,
    playersChecklistHint: '至少 4 人',
    checkSettingsOk: false,
    checkStartReady: false,
    canEditScore: false,
    hasPending: false,

    quickImportText: '',
    importResultText: '',
    importResultDetail: '',
    focusQuickImport: false,
    quickConfigM: 8,
    quickConfigC: 2,
    useSimpleQuickMPicker: true,
    quickConfigMOptions: [],
    quickConfigMIndex: 0,
    quickConfigMDigitRange: [],
    quickConfigMDigitValue: [],
    quickConfigCOptions: Array.from({ length: 10 }, (_, i) => i + 1),
    quickConfigCIndex: 1,
    sessionMinuteOptions: flow.SESSION_MINUTE_OPTIONS,
    slotMinuteOptions: flow.SLOT_MINUTE_OPTIONS,
    sessionMinutes: flow.DEFAULT_SESSION_MINUTES,
    slotMinutes: flow.DEFAULT_SLOT_MINUTES,
    sessionMinuteIndex: 2,
    slotMinuteIndex: Math.max(0, flow.SLOT_MINUTE_OPTIONS.indexOf(flow.DEFAULT_SLOT_MINUTES)),
    quickSuggestedMatches: 1,
    quickCapacityMax: 1,
    quickCapacityHintShort: '',
    quickCapacityReason: 'time',
    quickRosterHint: '',
    maxMatches: 0,
    allowOpenTeam: false,

    nextActionKey: '',
    nextActionText: '',
    showScheduleShortcut: false,
    quickChecklistPending: 0,

    sharePulse: false,
    networkOffline: false,
    showStaleSyncHint: false,
    canRetryAction: false,
    lastFailedActionText: '',
    profileQuickFillLoading: false,
    profileNicknameFocus: false,
    profileAvatarUploading: false,
    profileSaving: false,
    profileFieldError: ''
  },

  ...profileActions,
  ...draftActions,
  ...pairTeamActions,

  onLoad(options) {
    let tid = options.tournamentId;
    if (!tid && options && options.scene) {
      const scene = decodeURIComponent(options.scene);
      const matched = /tournamentId=([^&]+)/.exec(scene) || /tid=([^&]+)/.exec(scene);
      if (matched) tid = matched[1];
    }
    this.setData({ tournamentId: tid });
    this._fromCreate = String((options && options.fromCreate) || '') === '1';
    this._showShareHint = this._fromCreate && String((options && options.shareTip) || '') === '1';
    this._pendingIntentAction = String((options && options.intent) || '').trim();

    const app = getApp();
    this.setData({ networkOffline: !!(app && app.globalData && app.globalData.networkOffline) });
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.setData({ networkOffline: !!offline });
      });
    }

    this.openid = getApp().globalData.openid || storage.get('openid', '');
    this._pageRequestSeq = 0;
    const sessionMinutes = flow.normalizeSessionMinutes(storage.getSessionMinutesPref(), flow.DEFAULT_SESSION_MINUTES);
    const slotMinutes = flow.normalizeSlotMinutes(storage.getSlotMinutesPref(), flow.DEFAULT_SLOT_MINUTES);
    this.setData({
      sessionMinutes,
      slotMinutes,
      sessionMinuteIndex: Math.max(0, flow.SESSION_MINUTE_OPTIONS.indexOf(sessionMinutes)),
      slotMinuteIndex: Math.max(0, flow.SLOT_MINUTE_OPTIONS.indexOf(slotMinutes))
    });

    this.avatarCache = {};

    const profile = storage.getUserProfile();
    if (profile && typeof profile === 'object') {
      let nick = String(profile.nickName || profile.nickname || '').trim();
      if (nick === '微信用户') nick = '';
      const avatar = String(profile.avatarUrl || profile.avatar || '').trim();
      if (nick) this.setData({ nickname: nick, myNickname: nick });
      if (avatar) {
        this.setData({ joinAvatar: avatar, myAvatar: avatar });
        this.setJoinAvatarDisplay(avatar);
        this.setMyAvatarDisplay(avatar);
      }
    }

    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
    tournamentSync.closeWatcher(this);
  },

  onUnload() {
    tournamentSync.closeWatcher(this);
    if (this._sharePulseTimer) clearTimeout(this._sharePulseTimer);
    this._sharePulseTimer = null;
    this._pendingIntentAction = '';
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  onShow() {
    const currentId = String(this.data.tournamentId || '').trim();
    const intentAction = nav.consumeLobbyIntent(currentId);
    if (intentAction) {
      this._pendingIntentAction = intentAction;
    }
    nav.consumeRefreshFlag(currentId);
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
  },

  onRetry() {
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
  },

  nextRequestSeq() {
    this._pageRequestSeq = Number(this._pageRequestSeq || 0) + 1;
    return this._pageRequestSeq;
  },

  isLatestRequestSeq(requestSeq) {
    return Number(requestSeq) === Number(this._pageRequestSeq || 0);
  },

  startWatch(tid) {
    tournamentSync.startWatch(this, tid, (doc) => {
      const requestSeq = this.nextRequestSeq();
      if (!this.isLatestRequestSeq(requestSeq)) return;
      this.setData({ showStaleSyncHint: false });
      this.setTournament(doc);
    });
  },

  async fetchTournament(tid) {
    const requestSeq = this.nextRequestSeq();
    const result = await tournamentSync.fetchTournament(tid);
    if (!this.isLatestRequestSeq(requestSeq)) return null;
    if (result && result.ok && result.doc) {
      this.setData({ showStaleSyncHint: false });
      this.setTournament(result.doc);
      return result.doc;
    }
    if (result && result.cachedDoc) {
      this.setData({ showStaleSyncHint: true, loadError: false });
      this.setTournament(result.cachedDoc);
      return result.cachedDoc;
    }
    this.setData({ loadError: true, showStaleSyncHint: false });
    return null;
  },

  setLastFailedAction(text, fn) {
    this._lastFailedAction = typeof fn === 'function' ? fn : null;
    this.setData({
      canRetryAction: !!this._lastFailedAction,
      lastFailedActionText: String(text || '').trim() || '上次操作失败，可重试'
    });
  },

  clearLastFailedAction() {
    this._lastFailedAction = null;
    this.setData({ canRetryAction: false, lastFailedActionText: '' });
  },

  retryLastAction() {
    if (typeof this._lastFailedAction === 'function') this._lastFailedAction();
  },

  pulseShareHint(duration = 1800) {
    if (this._sharePulseTimer) clearTimeout(this._sharePulseTimer);
    this.setData({ sharePulse: true });
    this._sharePulseTimer = setTimeout(() => {
      this._sharePulseTimer = null;
      this.setData({ sharePulse: false });
    }, duration);
  },

  setTournament(tournament) {
    if (!tournament) return;
    const openid = this.openid || getApp().globalData.openid || storage.get('openid', '');
    const next = viewModel.buildLobbyViewModel({
      tournament,
      openid,
      data: this.data,
      avatarCache: this.avatarCache || {}
    });

    this.setData(next.patch);

    if (this._showShareHint) {
      this._showShareHint = false;
      this.pulseShareHint(2200);
    }

    if (next.meta.showMyProfile && next.meta.myPlayer) {
      const name = String(next.meta.myPlayer.name || '').trim();
      const avatar = String(next.meta.myPlayer.avatar || next.meta.myPlayer.avatarUrl || '').trim();
      if (!this._myEditedNick) this.setData({ myNickname: name || this.data.myNickname });
      if (!this._myEditedAvatar) {
        this.setData({ myAvatar: avatar || this.data.myAvatar });
        this.setMyAvatarDisplay(avatar);
      }
    }

    this.resolveDisplayPlayersAvatars();
    storage.addRecentTournamentId(next.tournament._id);

    if (this._pendingIntentAction) {
      const action = this._pendingIntentAction;
      this._pendingIntentAction = '';
      setTimeout(() => this.runFlowAction(action), 90);
    }
  },

  togglePlayers() {
    const next = !this.data.showAllPlayers;
    const tournament = this.data.tournament;
    const players = tournament && Array.isArray(tournament.players) ? tournament.players : [];
    this.setData({
      showAllPlayers: next,
      displayPlayers: viewModel.buildDisplayPlayers(next ? players : players.slice(0, 12), this.avatarCache || {})
    }, () => {
      this.resolveDisplayPlayersAvatars();
    });
  },

  onShareAppMessage() {
    const tid = this.data.tournamentId;
    const name = (this.data.tournament && this.data.tournament.name) ? this.data.tournament.name : '羽毛球比赛';
    return {
      title: `${name} · 邀请你参赛`,
      path: `/pages/share-entry/index?tournamentId=${tid}&intent=join`
    };
  }
});
