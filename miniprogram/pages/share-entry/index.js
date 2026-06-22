const auth = require('../../core/auth');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const joinTournamentCore = require('../../core/joinTournament');
const loading = require('../../core/loading');
const nav = require('../../core/nav');
const pageTitle = require('../../core/pageTitle');
const pageTournamentSync = require('../../core/pageTournamentSync');
const pageTimers = require('../../core/pageTimers');
const profileCore = require('../../core/profile');
const shareMeta = require('../../core/shareMeta');
const storage = require('../../core/storage');
const writeErrorUi = require('../../core/writeErrorUi');
const growthTracker = require('../../core/growthTracker');
const avatarDisplay = require('../../core/avatarDisplay');
const flow = require('./flow');

const IDENTITY_TIMEOUT_MS = 2500;
const TRACKABLE_STATUSES = { draft: true, running: true, finished: true };
const TRACKABLE_MODES = { multi_rotate: true, squad_doubles: true, fixed_pair_rr: true };

function warnCloudProfileSaveFailure(err) {
  console.warn('[share-entry] saveCloudProfile failed after join', err);
}

function isTrackableShareEntryTournament(tournament) {
  const status = String((tournament && tournament.status) || '').trim();
  const mode = String((tournament && tournament.mode) || '').trim();
  return !!(TRACKABLE_STATUSES[status] && TRACKABLE_MODES[mode]);
}

const shareEntrySyncController = pageTournamentSync.createTournamentSyncMethods({
  buildLoadErrorState(result) {
    const errorType = String((result && result.errorType) || '').trim();
    let preview = shareMeta.buildRetryableShareEntryState('同步失败，请稍后重试');
    if (errorType === 'not_found') {
      preview = shareMeta.buildInvalidShareEntryState('比赛不存在或已关闭');
    } else if (errorType === 'param') {
      preview = shareMeta.buildInvalidShareEntryState('链接无效');
    }
    return {
      loadError: true,
      showStaleSyncHint: false,
      tournament: null,
      preview
    };
  }
});

Page({
  data: {
    tournamentId: '',
    intent: 'view',
    tournament: null,
    preview: shareMeta.buildInvalidShareEntryState('正在读取比赛信息'),
    networkOffline: false,
    showStaleSyncHint: false,
    loadError: false,
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
    identityPending: false,
    identityTimedOut: false,
    joinBusy: false,
    joinSquadChoice: 'A'
  },

  ...shareEntrySyncController,

  onLoad(options) {
    const tournamentId = flow.parseTournamentId(options || {});
    const intent = flow.normalizeIntent(options && options.intent);
    const app = getApp();
    this.openid = '';
    this._trackedShareEntryView = false;
    pageTournamentSync.initTournamentSync(this);
    this._identityAttemptSeq = 0;
    this.readCachedOpenid();
    this.setData(pageTournamentSync.composePageSyncPatch(this, {
      tournamentId,
      intent,
      networkOffline: !!(app && app.globalData && app.globalData.networkOffline),
      identityPending: !String(this.openid || '').trim(),
      identityTimedOut: false
    }));
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.handleNetworkChange(offline);
      });
    }
    if (!tournamentId) {
      this.setData({ preview: shareMeta.buildInvalidShareEntryState('链接无效') });
      return;
    }
    this.fetchTournament(tournamentId);
    this.startWatch(tournamentId);
    this.primeViewerIdentity();
  },

  onHide() {
    pageTournamentSync.pauseTournamentSync(this);
    pageTimers.clearNamedTimer(this, 'identityPending');
  },

  onShow() {
    const currentId = String(this.data.tournamentId || '').trim();
    if (!currentId) return;
    this.trackShareEntryView();
    nav.consumeRefreshFlag(currentId);
    const beforeOpenid = String(this.openid || '').trim();
    this.readCachedOpenid();
    const afterOpenid = String(this.openid || '').trim();
    if (afterOpenid && !beforeOpenid && (this.data.identityPending || this.data.identityTimedOut)) {
      this.finishIdentityResolution({ timedOut: false });
    } else if (!afterOpenid && this.data.identityPending) {
      this.startIdentityTimeout(this._identityAttemptSeq);
    }
    this.fetchTournament(currentId);
    if (!this.hasActiveWatch(currentId)) this.startWatch(currentId);
  },

  onUnload() {
    pageTournamentSync.teardownTournamentSync(this);
    this.invalidateIdentityAttempt();
    pageTimers.clearAllTimers(this);
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  readCachedOpenid() {
    const appOpenid = (() => {
      try {
        if (typeof getApp !== 'function') return '';
        const app = getApp();
        return String((app && app.globalData && app.globalData.openid) || '').trim();
      } catch (_) {
        return '';
      }
    })();
    const cachedOpenid = typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function'
      ? storage.get('openid', '')
      : '';
    this.openid = appOpenid || String(cachedOpenid || '').trim() || this.openid;
  },

  invalidateIdentityAttempt() {
    this._identityAttemptSeq = Number(this._identityAttemptSeq || 0) + 1;
  },

  startIdentityTimeout(attemptSeq) {
    pageTimers.setNamedTimer(this, 'identityPending', () => {
      if (Number(attemptSeq) !== Number(this._identityAttemptSeq || 0)) return;
      if (String(this.openid || '').trim() || !this.data.identityPending) return;
      this.finishIdentityResolution({ timedOut: true });
    }, IDENTITY_TIMEOUT_MS);
  },

  finishIdentityResolution(options = {}) {
    const timedOut = options.timedOut === true;
    pageTimers.clearNamedTimer(this, 'identityPending');
    this.setData({
      identityPending: false,
      identityTimedOut: timedOut
    });
    if (this.data.tournament) this.applyTournament(this.data.tournament);
  },

  async primeViewerIdentity() {
    if (String(this.openid || '').trim()) {
      if (this.data.identityPending || this.data.identityTimedOut) {
        this.finishIdentityResolution({ timedOut: false });
      }
      return;
    }
    this.invalidateIdentityAttempt();
    const attemptSeq = this._identityAttemptSeq;
    this.startIdentityTimeout(attemptSeq);
    try {
      const openid = await auth.login();
      if (Number(attemptSeq) !== Number(this._identityAttemptSeq || 0)) return;
      if (!openid) {
        this.finishIdentityResolution({ timedOut: false });
        return;
      }
      this.openid = String(openid || '').trim();
      this.finishIdentityResolution({ timedOut: false });
    } catch (_) {
      if (Number(attemptSeq) !== Number(this._identityAttemptSeq || 0)) return;
      this.finishIdentityResolution({ timedOut: false });
    }
  },

  applyTournament(tournament) {
    this.ensureAvatarRuntime();
    let preview = shareMeta.buildShareEntryViewModel({
      tournament,
      openid: this.openid
    });
    preview = this.resolvePreviewParticipantAvatars(preview);
    const lifecycle = String((tournament && tournament.status) || '').trim();
    if (this.data.identityPending && !String(this.openid || '').trim() && lifecycle === 'draft') {
      preview = {
        ...preview,
        viewModeLabel: '识别中',
        identityStatusText: '正在识别你的参赛状态',
        primaryAction: { key: 'identity_pending', text: '识别中...' }
      };
    } else if (this.data.identityTimedOut && !String(this.openid || '').trim() && lifecycle === 'draft') {
      preview = {
        ...preview,
        viewModeLabel: '游客查看',
        identityStatusText: '身份识别较慢，可先查看比赛',
        primaryAction: { key: 'view', text: '查看比赛' },
        secondaryAction: null
      };
    }
    this.setData({
      loadError: false,
      tournament,
      preview
    });
    this.refreshParticipantAvatars();
    pageTitle.setTournamentPageTitle(this, preview.joinAllowed && !preview.joined ? '加入比赛' : '查看比赛', tournament);
    this.trackShareEntryView(tournament);
  },

  ensureAvatarRuntime() {
    this.avatarCache = avatarDisplay.getSharedAvatarCache(this.avatarCache);
  },

  resolvePreviewParticipantAvatars(preview = {}) {
    const list = Array.isArray(preview.participantPreviewList) ? preview.participantPreviewList : [];
    if (!list.length) return preview;
    const participantPreviewList = list.map((item) => {
      const raw = String((item && (item.avatarRaw || item.avatarUrl)) || '').trim();
      let displayUrl = raw;
      if (avatarDisplay.isCloudAvatar(raw)) {
        displayUrl = avatarDisplay.getCachedAvatarUrl(this.avatarCache, raw);
      }
      return {
        ...item,
        avatarRaw: raw,
        avatarUrl: displayUrl,
        showAvatar: !!displayUrl
      };
    });
    return { ...preview, participantPreviewList };
  },

  async refreshParticipantAvatars() {
    this.ensureAvatarRuntime();
    const pending = avatarDisplay.collectCloudAvatarFileIds({
      participantPreviewList: this.data.preview && this.data.preview.participantPreviewList
    }, this.avatarCache);
    if (!pending.length) return;
    const result = await avatarDisplay.resolveCloudAvatarFileIds(pending, this.avatarCache);
    if (!result.updated) return;
    const tournament = this.data.tournament;
    if (tournament) this.applyTournament(tournament);
  },

  onParticipantAvatarError(e) {
    this.ensureAvatarRuntime();
    const raw = String(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.avatarRaw || '').trim();
    if (!avatarDisplay.isCloudAvatar(raw)) return;
    avatarDisplay.markAvatarUrlFailed(this.avatarCache, raw);
    const tournament = this.data.tournament;
    if (tournament) this.applyTournament(tournament);
  },

  trackShareEntryView(tournament) {
    if (this._trackedShareEntryView) return;
    const source = tournament || this.data.tournament;
    if (!source) return;
    const tid = String(this.data.tournamentId || source._id || source.id || '').trim();
    if (!tid) return;
    if (!isTrackableShareEntryTournament(source)) {
      if (!this._warnedShareEntryViewIncomplete) {
        this._warnedShareEntryViewIncomplete = true;
        console.warn('[share-entry] skip share_entry_view until status and mode are ready', {
          status: String(source.status || '').trim(),
          mode: String(source.mode || '').trim()
        });
      }
      return;
    }
    this._trackedShareEntryView = true;
    growthTracker.track('share_entry_view', growthTracker.fromTournament(source, {
      tournamentId: tid,
      src: 'share_entry',
      a: 'view'
    }));
  },

  onRetry() {
    const tournamentId = String(this.data.tournamentId || '').trim();
    if (!tournamentId) {
      this.setData({ preview: shareMeta.buildInvalidShareEntryState('链接无效') });
      return;
    }
    this.fetchTournament(tournamentId);
  },

  onPickJoinSquad(e) {
    const squad = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.squad) || '').trim().toUpperCase();
    if (squad !== 'A' && squad !== 'B') return;
    this.setData({ joinSquadChoice: squad });
  },

  goLobby(entryMode = '') {
    const url = flow.buildLobbyUrl(this.data.tournamentId, entryMode);
    wx.redirectTo({ url, fail: () => nav.redirectOrNavigate(url) });
  },

  goSchedule() {
    growthTracker.track('share_entry_go_schedule', growthTracker.fromTournament(this.data.tournament, {
      tournamentId: this.data.tournamentId,
      src: 'share_entry',
      a: 'click'
    }));
    nav.redirectOrNavigate(flow.buildScheduleUrl(this.data.tournamentId));
  },

  goRanking() {
    growthTracker.track('share_entry_go_ranking', growthTracker.fromTournament(this.data.tournament, {
      tournamentId: this.data.tournamentId,
      src: 'share_entry',
      a: 'click'
    }));
    nav.redirectOrNavigate(flow.buildRankingUrl(this.data.tournamentId));
  },

  goHome() {
    nav.goHome();
  },

  saveCloudProfileBestEffort(payload, clientRequestId) {
    try {
      const task = profileCore.saveCloudProfile({
        nickName: payload.nickname,
        avatar: payload.avatar,
        gender: payload.gender
      }, { clientRequestId });
      if (task && typeof task.catch === 'function') task.catch(warnCloudProfileSaveFailure);
    } catch (err) {
      warnCloudProfileSaveFailure(err);
    }
  },

  async handleJoin(options = {}) {
    if (this.data.joinBusy) return;
    const tournamentId = String(this.data.tournamentId || '').trim();
    if (!tournamentId) {
      wx.showToast({ title: '未识别到比赛', icon: 'none' });
      return;
    }

    const actionKey = `shareEntry:joinTournament:${tournamentId}`;
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'join');
    return actionGuard.runWithCriticalPageBusy(this, 'joinBusy', actionKey, async () => {
      const gate = await joinTournamentCore.ensureJoinProfile({
        action: 'share_join',
        redirect: flow.buildReturnUrl(tournamentId, 'view')
      });
      if (!gate.ok) {
        if (gate.reason === 'login_failed') {
          wx.showToast({ title: '登录失败，请稍后重试', icon: 'none' });
        }
        return;
      }

      const payload = joinTournamentCore.buildJoinPayload({
        tournamentId,
        mode: String((this.data.tournament && this.data.tournament.mode) || '').trim(),
        squadChoice: this.data.joinSquadChoice,
        profile: gate.profile || {}
      });
      try {
        await loading.withLoading('加入中...', () => joinTournamentCore.callJoinTournament(payload, {
          action: 'join',
          fallbackMessage: '加入失败，请稍后重试',
          clientRequestId
        }));
        nav.markRefreshFlag(tournamentId);
        storage.setUserProfile({ nickName: payload.nickname, avatar: payload.avatar, gender: payload.gender });
        this.saveCloudProfileBestEffort(payload, clientRequestId);
        wx.showToast({ title: '已加入比赛', icon: 'success' });
        growthTracker.track('share_entry_join_success', growthTracker.fromTournament(this.data.tournament, {
          tournamentId,
          src: 'share_entry',
          a: 'join',
          r: 'success'
        }));
        await this.fetchTournament(tournamentId);
        const lifecycle = String((this.data.tournament && this.data.tournament.status) || '').trim();
        if (lifecycle === 'running') {
          wx.redirectTo({ url: flow.buildScheduleUrl(tournamentId), fail: () => this.goLobby() });
        } else if (lifecycle === 'finished') {
          wx.redirectTo({ url: flow.buildAnalyticsUrl(tournamentId), fail: () => this.goLobby() });
        } else {
          this.goLobby();
        }
      } catch (err) {
        writeErrorUi.presentWriteError({
          err,
          fallbackMessage: '加入失败，请稍后重试',
          conflictContent: '数据已被更新，是否刷新后重试？',
          onRefresh: () => this.fetchTournament(tournamentId)
        });
        await this.fetchTournament(tournamentId);
      }
    });
  },

  onPrimaryAction() {
    const key = String((this.data.preview && this.data.preview.primaryAction && this.data.preview.primaryAction.key) || '').trim();
    growthTracker.track('share_entry_primary_click', growthTracker.fromTournament(this.data.tournament, {
      tournamentId: this.data.tournamentId,
      src: 'share_entry',
      a: key || 'click'
    }));
    if (key === 'identity_pending') return;
    if (key === 'join') return this.handleJoin();
    if (key === 'view' || key === 'lobby_view') return this.goLobby('view_only');
    if (key === 'enter') return this.goLobby();
    if (key === 'schedule') return this.goSchedule();
    if (key === 'ranking') return this.goRanking();
    if (key === 'analytics') return this.goRanking();
    return this.onRetry();
  },

  onSecondaryAction() {
    const key = String((this.data.preview && this.data.preview.secondaryAction && this.data.preview.secondaryAction.key) || '').trim();
    if (key === 'home') return this.goHome();
    if (key === 'schedule') return this.goSchedule();
    if (key === 'ranking') return this.goRanking();
    if (key === 'analytics') return this.goRanking();
  }
});
