const auth = require('../../core/auth');
const actionGuard = require('../../core/actionGuard');
const cloud = require('../../core/cloud');
const joinError = require('../../core/joinTournamentError');
const nav = require('../../core/nav');
const pageTimers = require('../../core/pageTimers');
const profileCore = require('../../core/profile');
const shareMeta = require('../../core/shareMeta');
const storage = require('../../core/storage');
const tournamentSync = require('../../core/tournamentSync');
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

Page({
  data: {
    tournamentId: '',
    intent: 'view',
    tournament: null,
    preview: shareMeta.buildInvalidShareEntryState('正在读取比赛信息'),
    showStaleSyncHint: false,
    loadError: false,
    identityPending: false,
    identityTimedOut: false,
    joinBusy: false,
    joinSquadChoice: 'A'
  },

  onLoad(options) {
    const tournamentId = flow.parseTournamentId(options || {});
    const intent = flow.normalizeIntent(options && options.intent);
    this.openid = '';
    this._fetchSeq = 0;
    this._watchGen = 0;
    this._identityAttemptSeq = 0;
    this.readCachedOpenid();
    this.setData({
      tournamentId,
      intent,
      identityPending: !String(this.openid || '').trim(),
      identityTimedOut: false
    });
    if (!tournamentId) {
      this.setData({ preview: shareMeta.buildInvalidShareEntryState('链接无效') });
      return;
    }
    this.fetchTournament(tournamentId);
    this.startWatch(tournamentId);
    this.primeViewerIdentity();
  },

  onHide() {
    this.invalidateFetchSeq();
    this.invalidateWatchGen();
    pageTimers.clearNamedTimer(this, 'identityPending');
    tournamentSync.closeWatcher(this);
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
    this.invalidateFetchSeq();
    this.invalidateWatchGen();
    this.invalidateIdentityAttempt();
    pageTimers.clearAllTimers(this);
    tournamentSync.closeWatcher(this);
  },

  nextFetchSeq() {
    this._fetchSeq = Number(this._fetchSeq || 0) + 1;
    return this._fetchSeq;
  },

  isLatestFetchSeq(requestSeq) {
    return Number(requestSeq) === Number(this._fetchSeq || 0);
  },

  invalidateFetchSeq() {
    this._fetchSeq = Number(this._fetchSeq || 0) + 1;
  },

  nextWatchGen() {
    this._watchGen = Number(this._watchGen || 0) + 1;
    return this._watchGen;
  },

  isActiveWatchGen(watchGen) {
    return Number(watchGen) === Number(this._watchGen || 0);
  },

  invalidateWatchGen() {
    this._watchGen = Number(this._watchGen || 0) + 1;
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

  startWatch(tournamentId) {
    const watchGen = this.nextWatchGen();
    tournamentSync.startWatch(this, tournamentId, (doc) => {
      if (!this.isActiveWatchGen(watchGen)) return;
      this.setData({ showStaleSyncHint: false });
      this.applyTournament(doc);
    });
  },

  async fetchTournament(tournamentId) {
    const requestSeq = this.nextFetchSeq();
    const result = await tournamentSync.fetchTournament(tournamentId);
    if (!this.isLatestFetchSeq(requestSeq)) return null;

    if (result && result.ok && result.doc) {
      this.setData({ showStaleSyncHint: false });
      this.applyTournament(result.doc);
      return result.doc;
    }

    if (result && result.cachedDoc) {
      this.setData({ showStaleSyncHint: true, loadError: false });
      this.applyTournament(result.cachedDoc);
      return result.cachedDoc;
    }

    const errorType = String((result && result.errorType) || '').trim();
    let preview = shareMeta.buildRetryableShareEntryState('同步失败，请稍后重试');
    if (errorType === 'not_found') {
      preview = shareMeta.buildInvalidShareEntryState('比赛不存在或已关闭');
    } else if (errorType === 'param') {
      preview = shareMeta.buildInvalidShareEntryState('链接无效');
    }
    this.setData({
      loadError: true,
      showStaleSyncHint: false,
      tournament: null,
      preview
    });
    return null;
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
        secondaryAction: { key: 'join', text: '继续加入' }
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
        const res = await cloud.call('joinTournament', payload);
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
    if (key === 'join') return this.handleJoin();
    if (key === 'lobby') return this.goLobby();
    if (key === 'lobby_view') return this.goLobby('view_only');
    if (key === 'ranking') return this.goRanking();
    if (key === 'home') return this.goHome();
  }
});
