const storage = require('../../core/storage');
const shareMeta = require('../../core/shareMeta');
const flow = require('../../core/uxFlow');
const nav = require('../../core/nav');
const matchPrimaryNav = require('../../core/matchPrimaryNav');
const pageTimers = require('../../core/pageTimers');
const pageTournamentSync = require('../../core/pageTournamentSync');
const retryAction = require('../../core/retryAction');
const tournamentEntry = require('../../core/tournamentEntry');
const viewModel = require('./lobbyViewModel');
const profileActions = require('./lobbyProfileActions');
const draftActions = require('./lobbyDraftActions');
const pairTeamActions = require('./lobbyPairTeamActions');

const lobbySyncController = pageTournamentSync.createTournamentSyncMethods({
  applyDocMethod: 'setTournament',
  loadErrorMessages: {
    notFoundMessage: '分享链接可能已失效，或比赛已被删除。',
    paramMessage: '请确认分享链接或二维码是否完整。'
  },
  buildRemoteState() {
    return {
      loadError: false,
      showStaleSyncHint: false,
      loadErrorTitle: '加载失败',
      loadErrorMessage: '请检查网络或分享链接是否有效。',
      showLoadErrorHome: false
    };
  }
});

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
    showViewOnlyJoinPrompt: false,
    entryMode: '',
    viewOnlyJoinExpanded: false,
    showAllPlayers: false,
    displayPlayers: [],
    roleCards: [],
    currentRoleKey: '',
    currentRoleTitle: '',
    currentRoleSummary: '',
    statePanelTitle: '',
    statePanelRoleLabel: '',
    statePanelSummary: '',
    statePrimaryActionKey: '',
    statePrimaryActionText: '',
    stateStageBadge: '',
    showStateChecklist: false,
    showDraftRules: true,
    showDraftAdminPanel: false,
    primaryNavCurrent: 'match',
    primaryNavItems: [],

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
    nextActionDetail: '',
    quickChecklistPending: 0,
    checklistItems: [],

    sharePulse: false,
    shareCardTitle: '转发比赛',
    shareCardBadge: '比赛',
    shareButtonText: '转发',
    networkOffline: false,
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
    canRetryAction: false,
    lastFailedActionText: '',
    profileQuickFillLoading: false,
    profileNicknameFocus: false,
    profileAvatarUploading: false,
    profileSaving: false,
    profileFieldError: '',
    loadErrorTitle: '加载失败',
    loadErrorMessage: '请检查网络或分享链接是否有效。',
    showLoadErrorHome: false
  },

  ...profileActions,
  ...draftActions,
  ...pairTeamActions,
  ...lobbySyncController,
  ...retryAction.createRetryMethods(),

  onLoad(options) {
    const tid = tournamentEntry.parseTournamentIdFromOptions(options || {});
    const entryMode = String((options && options.entry) || '').trim().toLowerCase() === 'view_only' ? 'view_only' : '';
    this.setData({
      tournamentId: tid,
      entryMode,
      viewOnlyJoinExpanded: false,
      primaryNavItems: matchPrimaryNav.getPrimaryNavItems('match', tid)
    });
    this._fromCreate = String((options && options.fromCreate) || '') === '1';
    this._showShareHint = this._fromCreate && String((options && options.shareTip) || '') === '1';
    this._pendingIntentAction = '';

    const app = getApp();
    this.setData(pageTournamentSync.composePageSyncPatch(this, {
      networkOffline: !!(app && app.globalData && app.globalData.networkOffline)
    }));
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.setData(pageTournamentSync.composePageSyncPatch(this, { networkOffline: !!offline }));
      });
    }

    this.openid = getApp().globalData.openid || storage.get('openid', '');
    pageTournamentSync.initTournamentSync(this);
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
      const nick = storage.getProfileNickName(profile);
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
    pageTournamentSync.teardownTournamentSync(this);
    pageTimers.clearNamedTimer(this, 'sharePulse');
    if (this.data.sharePulse) this.setData({ sharePulse: false });
  },

  onUnload() {
    pageTournamentSync.teardownTournamentSync(this);
    pageTimers.clearAllTimers(this);
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

  onPrimaryNavTap(e) {
    const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '').trim();
    matchPrimaryNav.navigateToPrimary(key, this.data.tournamentId, 'match');
  },

  goHome() {
    wx.reLaunch({
      url: '/pages/home/index',
      fail: () => wx.navigateTo({ url: '/pages/home/index' })
    });
  },

  enterJoinFromViewOnly() {
    this.setData({
      viewOnlyJoinExpanded: true,
      profileNicknameFocus: true
    });
  },

  pulseShareHint(duration = 1800) {
    this.setData({ sharePulse: true });
    pageTimers.setNamedTimer(this, 'sharePulse', () => {
      this.setData({ sharePulse: false });
    }, duration);
  },

  applyLobbyPatch(nextPatch) {
    const patch = viewModel.diffLobbyPatch(this.data, nextPatch);
    if (Object.keys(patch).length) this.setData(patch);
    return patch;
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

    this.applyLobbyPatch(next.patch);

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
    this.applyLobbyPatch({
      showAllPlayers: next,
      displayPlayers: viewModel.buildDisplayPlayers(next ? players : players.slice(0, 12), this.avatarCache || {})
    });
    this.resolveDisplayPlayersAvatars();
  },

  onShareAppMessage() {
    const meta = shareMeta.buildShareMessage(this.data.tournament);
    return {
      title: meta.title,
      path: meta.path
    };
  }
});
