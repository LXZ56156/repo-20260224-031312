const storage = require('../../core/storage');
const cloudApi = require('../../core/cloud');
const pageTitle = require('../../core/pageTitle');
const shareMeta = require('../../core/shareMeta');
const shareActivity = require('../../core/shareActivity');
const flow = require('../../core/uxFlow');
const nav = require('../../core/nav');
const matchPrimaryNav = require('../../core/matchPrimaryNav');
const pageTimers = require('../../core/pageTimers');
const pageTournamentSync = require('../../core/pageTournamentSync');
const tournamentEntry = require('../../core/tournamentEntry');
const uiPreferences = require('../../core/uiPreferences');
const avatarDisplay = require('../../core/avatarDisplay');
const avatarDiagnostics = require('../../core/avatarDiagnostics');
const viewModel = require('./lobbyViewModel');
const settingsViewModel = require('../settings/settingsViewModel');
const { createLobbyDelegates } = require('./lobbyDelegates');

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

const lobbyPageDelegates = createLobbyDelegates(lobbySyncController);

function getDynamicShareErrorMessage(value, fallback = '动态分享准备失败') {
  const raw = value && typeof value === 'object'
    ? (value.errMsg || value.message)
    : value;
  return String(raw || fallback).trim() || fallback;
}

function getDynamicShareFailureReason(value, fallback = 'manage_activity_id_failed') {
  const explicit = String(value && value.dynamicShareReason || '').trim();
  if (explicit) return explicit;
  const code = String(value && (value.code || value.errCode) || '').trim().toUpperCase();
  const message = getDynamicShareErrorMessage(value, '');
  if (code === 'PERMISSION_DENIED') return 'permission_denied';
  if (code === 'SHARE_ACTIVITY_DRAFT_ONLY') return 'not_draft';
  if (code === 'SHARE_ACTIVITY_LIMIT_REQUIRED') return 'player_limit_required';
  if (message.includes('createActivityId')) return 'create_activity_id_failed';
  return fallback;
}

function createDynamicShareError(reason, value, fallback) {
  const message = getDynamicShareErrorMessage(value, fallback);
  const error = value instanceof Error ? value : new Error(message);
  error.dynamicShareReason = String(reason || '').trim() || 'manage_activity_id_failed';
  return error;
}

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
    showJoinSheet: false,
    showViewOnlyJoinPrompt: false,
    adminPanelExpanded: false,
    entryMode: '',
    viewOnlyJoinExpanded: false,
    showAllPlayers: false,
    displayPlayers: [],
    playerRosterHint: '',
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
    showDraftRules: true,
    showDraftAdminPanel: false,
    primaryNavCurrent: 'match',
    primaryNavItems: [],

    createdAtText: '',
    kpiReady: false,
    kpiPlayers: '—',
    kpiMatches: '—',
    kpiCourts: '—',
    playerLimit: 0,
    playerCountText: '0 人',
    quotaFull: false,
    quotaRemaining: 0,
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
    quickConfigName: '',
    quickConfigGateHint: '',
    quickSettingsBusy: false,
    quickConfigM: 8,
    quickConfigC: 2,
    useSimpleQuickMPicker: true,
    quickConfigMOptions: [],
    quickConfigMIndex: 0,
    quickConfigMDigitRange: [],
    quickConfigMDigitValue: [],
    quickMatchShortcutOptions: [],
    quickMatchShortcutHint: '',
    quickUseMatchPresetOptions: false,
    quickShowAdvancedMatchEntry: false,
    quickShowAdvancedMatchPicker: false,
    quickCurrentCustomMatchLabel: '',
    quickMatchPresetUnavailableHint: '',
    quickConfigCOptions: Array.from({ length: 10 }, (_, i) => i + 1),
    quickConfigCIndex: 1,
    quickPointsOptions: settingsViewModel.POINT_OPTIONS,
    quickPointsPerGame: 21,
    quickPointsIndex: 2,
    quickEndConditionOptions: settingsViewModel.END_CONDITION_OPTIONS,
    quickEndConditionType: 'total_matches',
    quickEndConditionIndex: 0,
    quickEndConditionTargetOptions: Array.from({ length: 200 }, (_, i) => i + 1),
    quickEndConditionTarget: 8,
    quickEndConditionTargetIndex: 7,
    quickEndConditionTargetLabel: '总场数（自动）',
    quickEndConditionTargetUnit: '场',
    quickEndConditionTargetHint: '',
    quickShowEndConditionTargetPicker: false,
    quickShowSquadEndCondition: false,
    quickSuggestedMatches: 1,
    quickCapacityMax: 1,
    quickCapacityHintShort: '',
    quickCapacityReason: 'roster',
    quickRosterHint: '',
    maxMatches: 0,
    canConfigureSettings: false,

    nextActionKey: '',
    nextActionText: '',
    nextActionDetail: '',

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
    motionLevel: 'standard',
    uiMotionClass: 'motion-standard',
    profileQuickFillLoading: false,
    profileNicknameFocus: false,
    profileAvatarUploading: false,
    profileSaving: false,
    profileFieldError: '',
    dynamicSharePreparing: false,
    dynamicShareReady: false,
    dynamicShareError: '',
    dynamicShareUnavailableReason: '',
    loadErrorTitle: '加载失败',
    loadErrorMessage: '请检查网络或分享链接是否有效。',
    showLoadErrorHome: false
  },

  ...lobbyPageDelegates,

  onLoad(options) {
    const tid = tournamentEntry.parseTournamentIdFromOptions(options || {});
    const entryMode = String((options && options.entry) || '').trim().toLowerCase() === 'view_only' ? 'view_only' : '';
    this.setData({
      tournamentId: tid,
      entryMode,
      viewOnlyJoinExpanded: false,
      primaryNavItems: matchPrimaryNav.getPrimaryNavItems('match', tid),
      ...uiPreferences.readUiPreferencePatch()
    });
    this._pendingIntentAction = '';

    const app = getApp();
    this.setData(pageTournamentSync.composePageSyncPatch(this, {
      networkOffline: !!(app && app.globalData && app.globalData.networkOffline)
    }));
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.handleNetworkChange(offline);
      });
    }

    this.openid = getApp().globalData.openid || storage.get('openid', '');
    pageTournamentSync.initTournamentSync(this);

    this.avatarCache = avatarDisplay.getSharedAvatarCache(this.avatarCache);
    shareActivity.showShareMenuBestEffort();

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
    pageTournamentSync.pauseTournamentSync(this);
    pageTimers.clearNamedTimer(this, 'startNavigation');
  },

  onUnload() {
    this.disablePageDynamicShare();
    pageTournamentSync.teardownTournamentSync(this);
    pageTimers.clearAllTimers(this);
    this._pendingIntentAction = '';
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  onShow() {
    this.refreshUiPreferences();
    const currentId = String(this.data.tournamentId || '').trim();
    const intentAction = nav.consumeLobbyIntent(currentId);
    if (intentAction) {
      this._pendingIntentAction = intentAction;
    }
    nav.consumeRefreshFlag(currentId);
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.hasActiveWatch(this.data.tournamentId)) this.startWatch(this.data.tournamentId);
  },

  refreshUiPreferences() {
    const prefs = uiPreferences.readUiPreferencePatch();
    this.setData({
      motionLevel: prefs.motionLevel,
      uiMotionClass: prefs.uiMotionClass
    });
  },

  onPrimaryNavTap(e) {
    const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '').trim();
    matchPrimaryNav.navigateToPrimary(key, this.data.tournamentId, 'match');
  },

  onTapQuickMatchShortcut(e) {
    return lobbyPageDelegates.onTapQuickMatchShortcut.call(this, e);
  },

  toggleQuickAdvancedMatchPicker() {
    if (!this.data.canConfigureSettings || !this.data.quickShowAdvancedMatchEntry) return;
    this.setData({ quickShowAdvancedMatchPicker: !this.data.quickShowAdvancedMatchPicker });
  },

  goHome() {
    nav.goHome();
  },

  enterJoinFromViewOnly() {
    this.setData({
      viewOnlyJoinExpanded: true,
      showViewOnlyJoinPrompt: false,
      showJoin: true,
      showJoinSheet: true,
      profileNicknameFocus: true
    });
  },

  openJoinSheet() {
    this.setData({ showJoinSheet: true, profileNicknameFocus: true });
  },

  closeJoinSheet() {
    this.setData({ showJoinSheet: false });
  },

  toggleAdminPanel() {
    this.setData({ adminPanelExpanded: !this.data.adminPanelExpanded });
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

    this.ensureDynamicShareReady(next.tournament);
    this.applyLobbyPatch(next.patch);
    pageTitle.setTournamentPageTitle(this, '赛事大厅', next.tournament);

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
    this.runDevelopmentAvatarDiagnostics(next.tournament);
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
      displayPlayers: viewModel.buildDisplayPlayers(next ? players : players.slice(0, 12), this.avatarCache || {}, this.data.displayPlayers)
    });
    this.resolveDisplayPlayersAvatars();
  },

  onShareAppMessage() {
    const meta = shareMeta.buildShareMessage(this.data.tournament);
    const message = {
      title: meta.title,
      path: meta.path
    };
    this.ensureDynamicShareReady(this.data.tournament);
    return message;
  },

  onShareButtonTouchStart() {
    shareActivity.showShareMenuBestEffort();
    this.ensureDynamicShareReady(this.data.tournament);
  },

  runDevelopmentAvatarDiagnostics(tournament) {
    const runtimeEnv = cloudApi.getRuntimeEnv();
    if (String(runtimeEnv && runtimeEnv.envVersion || 'release').trim() === 'release') return;
    const key = avatarDiagnostics.buildTournamentDiagnosticKey(tournament);
    if (!key || this._avatarDiagnosticKey === key) return;
    this._avatarDiagnosticKey = key;
    avatarDiagnostics.diagnoseTournamentAvatars(tournament).catch((err) => {
      console.warn('[avatar] tournament diagnostic failed', err);
    });
  },

  nextDynamicSharePrepareToken() {
    this._dynamicSharePrepareToken = Number(this._dynamicSharePrepareToken || 0) + 1;
    return this._dynamicSharePrepareToken;
  },

  isCurrentDynamicSharePrepareToken(token) {
    return Number(token || 0) === Number(this._dynamicSharePrepareToken || 0);
  },

  setDynamicShareState(patch = {}) {
    const next = {
      dynamicSharePreparing: !!patch.dynamicSharePreparing,
      dynamicShareReady: !!patch.dynamicShareReady,
      dynamicShareError: String(patch.dynamicShareError || ''),
      dynamicShareUnavailableReason: String(patch.dynamicShareUnavailableReason || '')
    };
    const changed = {};
    Object.keys(next).forEach((key) => {
      if (this.data[key] !== next[key]) changed[key] = next[key];
    });
    if (Object.keys(changed).length) this.setData(changed);
    return changed;
  },

  disablePageDynamicShare(options = {}) {
    this.nextDynamicSharePrepareToken();
    this._dynamicShareReadyKey = '';
    this._dynamicShareReadyBaseKey = '';
    this._dynamicShareReadyActivityId = '';
    this._dynamicShareInflightBaseKey = '';
    this._dynamicShareInflightPromise = null;
    this.setDynamicShareState({
      dynamicSharePreparing: false,
      dynamicShareReady: false,
      dynamicShareError: options.error,
      dynamicShareUnavailableReason: options.reason
    });
    shareActivity.disableDynamicShareBestEffort();
  },

  buildDynamicShareBaseKey(tournament) {
    const t = tournament && typeof tournament === 'object' ? tournament : {};
    return [
      String(t._id || this.data.tournamentId || '').trim(),
      String(Number(t.version) || 0),
      String(t.status || '').trim(),
      String(shareActivity.countPlayers(t)),
      String(shareActivity.resolveRoomLimit(t))
    ].join('|');
  },

  buildDynamicShareReadyKey(tournament, activityId) {
    return `${this.buildDynamicShareBaseKey(tournament)}|${String(activityId || '').trim()}`;
  },

  ensureDynamicShareReady(tournament) {
    const t = tournament && typeof tournament === 'object' ? tournament : this.data.tournament;
    const unavailableReason = shareActivity.resolveDynamicShareUnavailableReason(t);
    if (unavailableReason) {
      console.warn('[dynamicShare] unavailable', {
        reason: unavailableReason,
        status: String(t && t.status || '').trim(),
        roomLimit: shareActivity.resolveRoomLimit(t)
      });
      this.disablePageDynamicShare({ reason: unavailableReason });
      return Promise.resolve(false);
    }

    const baseKey = this.buildDynamicShareBaseKey(t);
    if (
      (this._dynamicShareReadyBaseKey && this._dynamicShareReadyBaseKey !== baseKey) ||
      (this._dynamicShareInflightBaseKey && this._dynamicShareInflightBaseKey !== baseKey)
    ) {
      this.disablePageDynamicShare();
    }
    if (this._dynamicShareReadyBaseKey === baseKey && this._dynamicShareReadyActivityId) {
      this.setDynamicShareState({
        dynamicShareReady: true
      });
      return Promise.resolve(true);
    }
    if (this._dynamicShareInflightBaseKey === baseKey && this._dynamicShareInflightPromise) {
      return this._dynamicShareInflightPromise;
    }

    const sharePrepareToken = this.nextDynamicSharePrepareToken();
    this._dynamicShareInflightBaseKey = baseKey;
    this.setDynamicShareState({
      dynamicSharePreparing: true
    });
    const promise = this.prepareDynamicShareMessage(t, sharePrepareToken).then((res) => {
      if (!this.isCurrentDynamicSharePrepareToken(sharePrepareToken)) return false;
      const activityId = String(res && res.activityId || '').trim();
      this._dynamicShareReadyBaseKey = baseKey;
      this._dynamicShareReadyActivityId = activityId;
      this._dynamicShareReadyKey = this.buildDynamicShareReadyKey(t, activityId);
      this.setDynamicShareState({
        dynamicShareReady: true
      });
      return true;
    }).catch((err) => {
      const reason = getDynamicShareFailureReason(err);
      const message = getDynamicShareErrorMessage(err);
      console.warn('[dynamicShare] prepareDynamicShareMessage failed', {
        reason,
        message,
        errCode: err && err.errCode
      });
      if (this.isCurrentDynamicSharePrepareToken(sharePrepareToken)) {
        this.disablePageDynamicShare({ reason, error: message });
      }
      return false;
    }).finally(() => {
      if (this._dynamicShareInflightBaseKey === baseKey) {
        this._dynamicShareInflightBaseKey = '';
        this._dynamicShareInflightPromise = null;
      }
    });
    this._dynamicShareInflightPromise = promise;
    return promise;
  },

  async prepareDynamicShareMessage(tournament, sharePrepareToken) {
    const tid = String(tournament && tournament._id || this.data.tournamentId || '').trim();
    if (!tid) throw new Error('missing tournamentId');
    const runtimeEnv = cloudApi.getRuntimeEnv();
    const versionType = String(runtimeEnv && runtimeEnv.envVersion || 'release').trim() || 'release';

    if (!shareActivity.isShowShareMenuSupported()) {
      throw createDynamicShareError('api_unsupported', null, 'wx.showShareMenu unavailable');
    }
    if (!shareActivity.isUpdateShareMenuSupported()) {
      throw createDynamicShareError('api_unsupported', null, 'wx.updateShareMenu unavailable');
    }
    const templateInfo = shareActivity.buildShareMenuTemplateInfo(tournament);
    if (!shareActivity.validateShareMenuTemplateInfo(templateInfo)) {
      throw createDynamicShareError('template_info_invalid', null, 'dynamic share templateInfo invalid');
    }
    const shareMenuShown = await shareActivity.showShareMenuBestEffort();
    if (!shareMenuShown) {
      throw createDynamicShareError('show_share_menu_failed', null, 'wx.showShareMenu failed');
    }

    const activityRes = await cloudApi.call('manageActivityId', {
      action: 'getOrCreate',
      tournamentId: tid,
      versionType
    }, { retry: true });
    if (!activityRes || activityRes.ok === false) {
      throw createDynamicShareError(
        getDynamicShareFailureReason(activityRes),
        activityRes,
        '动态分享准备失败'
      );
    }
    const activityData = activityRes.data && typeof activityRes.data === 'object' ? activityRes.data : {};
    const activityId = String(activityRes.activityId || activityData.activityId || '').trim();
    if (!activityId) throw new Error('manageActivityId returned empty activityId');

    if (!this.isCurrentDynamicSharePrepareToken(sharePrepareToken)) throw new Error('dynamic share prepare canceled');
    try {
      const updated = await shareActivity.updateShareMenu({
        withShareTicket: true,
        isUpdatableMessage: true,
        activityId,
        templateInfo
      });
      if (updated === false) {
        throw createDynamicShareError('api_unsupported', null, 'wx.updateShareMenu unavailable');
      }
    } catch (err) {
      const normalized = createDynamicShareError(
        getDynamicShareFailureReason(err, 'update_share_menu_failed'),
        err,
        'wx.updateShareMenu failed'
      );
      console.warn('[dynamicShare] wx.updateShareMenu failed', {
        reason: normalized.dynamicShareReason,
        errCode: err && err.errCode,
        errMsg: getDynamicShareErrorMessage(err)
      });
      throw normalized;
    }
    return {
      activityId
    };
  }
});
