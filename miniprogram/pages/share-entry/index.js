const auth = require('../../core/auth');
const actionGuard = require('../../core/actionGuard');
const cloud = require('../../core/cloud');
const joinError = require('../../core/joinTournamentError');
const nav = require('../../core/nav');
const pageTournamentSync = require('../../core/pageTournamentSync');
const pageTimers = require('../../core/pageTimers');
const profileCore = require('../../core/profile');
const shareMeta = require('../../core/shareMeta');
const storage = require('../../core/storage');
const flow = require('./flow');

const IDENTITY_TIMEOUT_MS = 2500;

function buildJoinPayload(page, profile = {}) {
  const localProfile = storage.getUserProfile() || {};
  const nickName = storage.getProfileNickName(profile) || storage.getProfileNickName(localProfile);
  const avatar = String(profile.avatar || profile.avatarUrl || localProfile.avatar || localProfile.avatarUrl || '').trim();
  const gender = storage.normalizeGender(profile.gender || localProfile.gender || 'unknown');
  const tournament = page.data.tournament || {};
  const mode = String(tournament.mode || '').trim();
  return {
    tournamentId: page.data.tournamentId,
    nickname: nickName,
    avatar,
    gender,
    squadChoice: mode === 'squad_doubles' ? String(page.data.joinSquadChoice || 'A').trim().toUpperCase() : ''
  };
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
        this.setData(pageTournamentSync.composePageSyncPatch(this, { networkOffline: !!offline }));
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
    pageTournamentSync.teardownTournamentSync(this);
    pageTimers.clearNamedTimer(this, 'identityPending');
  },

  onShow() {
    const currentId = String(this.data.tournamentId || '').trim();
    if (!currentId) return;
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
    if (!this.watcher) this.startWatch(currentId);
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
    this.openid = appOpenid || String(storage.get('openid', '') || '').trim() || this.openid;
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
    let preview = shareMeta.buildShareEntryViewModel({
      tournament,
      openid: this.openid
    });
    const lifecycle = String((tournament && tournament.status) || '').trim();
    if (this.data.identityPending && !String(this.openid || '').trim() && lifecycle === 'draft') {
      preview = {
        ...preview,
        viewModeLabel: '识别中',
        availabilityText: '正在识别你的参赛状态，完成后会显示加入或进入比赛。',
        primaryAction: { key: 'identity_pending', text: '识别中...' }
      };
    } else if (this.data.identityTimedOut && !String(this.openid || '').trim() && lifecycle === 'draft') {
      preview = {
        ...preview,
        viewModeLabel: '游客查看',
        availabilityText: '身份识别较慢，你可以先以游客身份查看比赛，稍后仍可加入。',
        primaryAction: { key: 'lobby_view', text: '先观赛' },
        secondaryAction: null
      };
    }
    this.setData({
      loadError: false,
      tournament,
      preview
    });
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
    wx.navigateTo({ url: flow.buildLobbyUrl(this.data.tournamentId, entryMode) });
  },

  goSchedule() {
    wx.navigateTo({ url: flow.buildScheduleUrl(this.data.tournamentId) });
  },

  goRanking() {
    wx.navigateTo({ url: flow.buildRankingUrl(this.data.tournamentId) });
  },

  goAnalytics() {
    wx.navigateTo({ url: flow.buildAnalyticsUrl(this.data.tournamentId) });
  },

  goHome() {
    wx.reLaunch({
      url: '/pages/home/index',
      fail: () => wx.navigateTo({ url: '/pages/home/index' })
    });
  },

  async handleJoin() {
    if (this.data.joinBusy) return;
    const tournamentId = String(this.data.tournamentId || '').trim();
    if (!tournamentId) {
      wx.showToast({ title: '未识别到比赛', icon: 'none' });
      return;
    }

    const actionKey = `shareEntry:joinTournament:${tournamentId}`;
    return actionGuard.runWithPageBusy(this, 'joinBusy', actionKey, async () => {
      const gate = await profileCore.ensureProfileForAction('share_join', flow.buildReturnUrl(tournamentId, 'view'));
      if (!gate.ok) {
        if (gate.reason === 'login_failed') {
          wx.showToast({ title: '登录失败，请稍后重试', icon: 'none' });
        }
        return;
      }

      const payload = buildJoinPayload(this, gate.profile || {});
      wx.showLoading({ title: '加入中...' });
      try {
        let res = await cloud.call('joinTournament', payload);
        if (res && res.ok === false && joinError.isConflictResult(res)) {
          res = await cloud.call('joinTournament', payload);
        }
        if (res && res.ok === false) {
          throw joinError.normalizeJoinFailure(res, '加入失败，请稍后重试');
        }
        wx.hideLoading();
        nav.markRefreshFlag(tournamentId);
        wx.showToast({ title: '已加入比赛', icon: 'success' });
        await this.fetchTournament(tournamentId);
        this.goLobby();
      } catch (err) {
        wx.hideLoading();
        wx.showToast({ title: joinError.resolveJoinFailureMessage(err, '加入失败，请稍后重试', { action: 'join' }), icon: 'none' });
        await this.fetchTournament(tournamentId);
      }
    });
  },

  onPrimaryAction() {
    const key = String((this.data.preview && this.data.preview.primaryAction && this.data.preview.primaryAction.key) || '').trim();
    if (key === 'identity_pending') return;
    if (key === 'join') return this.handleJoin();
    if (key === 'lobby_view') return this.goLobby('view_only');
    if (key === 'enter') return this.goLobby();
    if (key === 'watch') return this.goSchedule();
    if (key === 'result') return this.goAnalytics();
    return this.onRetry();
  },

  onSecondaryAction() {
    const key = String((this.data.preview && this.data.preview.secondaryAction && this.data.preview.secondaryAction.key) || '').trim();
    if (key === 'home') return this.goHome();
  }
});
