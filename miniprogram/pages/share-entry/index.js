const auth = require('../../core/auth');
const actionGuard = require('../../core/actionGuard');
const cloud = require('../../core/cloud');
const nav = require('../../core/nav');
const profileCore = require('../../core/profile');
const shareMeta = require('../../core/shareMeta');
const storage = require('../../core/storage');
const tournamentSync = require('../../core/tournamentSync');
const flow = require('./flow');

function resolveJoinErrorMessage(err) {
  const raw = String((err && (err.message || err.errMsg)) || err || '').trim();
  if (!raw) return '加入失败，请稍后重试';
  if (raw.includes('非草稿阶段不可加入')) return '比赛当前不可加入，可先查看赛况或结果';
  if (raw.includes('赛事不存在')) return '比赛已不存在，请确认分享链接是否有效';
  if (raw.includes('并发冲突')) return '名单刚刚更新，请稍后再试';
  return cloud.getUnifiedErrorMessage(err, '加入失败，请稍后重试');
}

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
    joinBusy: false,
    joinSquadChoice: 'A'
  },

  onLoad(options) {
    const tournamentId = flow.parseTournamentId(options || {});
    const intent = flow.normalizeIntent(options && options.intent);
    this.openid = '';
    this._pageRequestSeq = 0;
    this.setData({ tournamentId, intent });
    if (!tournamentId) {
      this.setData({ preview: shareMeta.buildInvalidShareEntryState('链接无效') });
      return;
    }
    this.readCachedOpenid();
    this.fetchTournament(tournamentId);
    this.startWatch(tournamentId);
    this.primeViewerIdentity();
  },

  onHide() {
    tournamentSync.closeWatcher(this);
  },

  onShow() {
    const currentId = String(this.data.tournamentId || '').trim();
    if (!currentId) return;
    nav.consumeRefreshFlag(currentId);
    this.readCachedOpenid();
    this.fetchTournament(currentId);
    if (!this.watcher) this.startWatch(currentId);
  },

  onUnload() {
    tournamentSync.closeWatcher(this);
  },

  nextRequestSeq() {
    this._pageRequestSeq = Number(this._pageRequestSeq || 0) + 1;
    return this._pageRequestSeq;
  },

  isLatestRequestSeq(requestSeq) {
    return Number(requestSeq) === Number(this._pageRequestSeq || 0);
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

  async primeViewerIdentity() {
    if (String(this.openid || '').trim()) return;
    try {
      const openid = await auth.login();
      if (!openid) return;
      this.openid = String(openid || '').trim();
      if (this.data.tournament) this.applyTournament(this.data.tournament);
    } catch (_) {
      // Preview remains available without login; joined state will refresh once identity is ready.
    }
  },

  startWatch(tournamentId) {
    tournamentSync.startWatch(this, tournamentId, (doc) => {
      const requestSeq = this.nextRequestSeq();
      if (!this.isLatestRequestSeq(requestSeq)) return;
      this.setData({ showStaleSyncHint: false });
      this.applyTournament(doc);
    });
  },

  async fetchTournament(tournamentId) {
    const requestSeq = this.nextRequestSeq();
    const result = await tournamentSync.fetchTournament(tournamentId);
    if (!this.isLatestRequestSeq(requestSeq)) return null;

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

    const invalidReason = result && result.errorType === 'not_found'
      ? '比赛不存在或已关闭'
      : (result && result.errorType === 'param' ? '链接无效' : '加载失败');
    this.setData({
      loadError: true,
      showStaleSyncHint: false,
      tournament: null,
      preview: shareMeta.buildInvalidShareEntryState(invalidReason)
    });
    return null;
  },

  applyTournament(tournament) {
    const preview = shareMeta.buildShareEntryViewModel({
      tournament,
      openid: this.openid
    });
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

  goLobby() {
    wx.navigateTo({ url: flow.buildLobbyUrl(this.data.tournamentId) });
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
          throw new Error(String(res.message || '加入失败'));
        }
        wx.hideLoading();
        nav.markRefreshFlag(tournamentId);
        wx.showToast({ title: '已加入比赛', icon: 'success' });
        await this.fetchTournament(tournamentId);
        this.goLobby();
      } catch (err) {
        wx.hideLoading();
        wx.showToast({ title: resolveJoinErrorMessage(err), icon: 'none' });
        await this.fetchTournament(tournamentId);
      }
    });
  },

  onPrimaryAction() {
    const key = String((this.data.preview && this.data.preview.primaryAction && this.data.preview.primaryAction.key) || '').trim();
    if (key === 'join') return this.handleJoin();
    if (key === 'enter') return this.goLobby();
    if (key === 'watch') return this.goSchedule();
    if (key === 'result') return this.goAnalytics();
    return this.onRetry();
  },

  onSecondaryAction() {
    const key = String((this.data.preview && this.data.preview.secondaryAction && this.data.preview.secondaryAction.key) || '').trim();
    if (key === 'lobby') return this.goLobby();
    if (key === 'ranking') return this.goRanking();
  }
});
