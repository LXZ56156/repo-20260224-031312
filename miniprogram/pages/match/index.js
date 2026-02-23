const cloud = require('../../core/cloud');
const storage = require('../../core/storage');
const perm = require('../../permission/permission');
const { normalizeTournament, safePlayerName } = require('../../core/normalize');
const tournamentSync = require('../../core/tournamentSync');
const matchFlow = require('../../core/matchFlow');

Page({
  data: {
    tournamentId: '',
    tournamentName: '',
    roundIndex: 0,
    matchIndex: 0,
    match: null,
    scoreA: '',
    scoreB: '',
    displayScoreA: '-',
    displayScoreB: '-',
    canEdit: false,
    pair1Text: '',
    pair2Text: '',
    batchMode: false,
    autoNext: false,
    networkOffline: false,
    canRetryAction: false,
    lastFailedActionText: '',
    loadError: false
  },

  onLoad(options) {
    const tid = options.tournamentId;
    const roundIndex = Number(options.roundIndex) || 0;
    const matchIndex = Number(options.matchIndex) || 0;
    const batchMode = Number(options.batch) === 1;
    this.openid = (getApp().globalData.openid || storage.get('openid', ''));
    this.setData({ tournamentId: tid, roundIndex, matchIndex, batchMode, autoNext: batchMode });

    const app = getApp();
    this.setData({ networkOffline: !!(app && app.globalData && app.globalData.networkOffline) });
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.setData({ networkOffline: !!offline });
      });
    }

    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
    tournamentSync.closeWatcher(this);
  },

  onShow() {
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
  },

  onUnload() {
    tournamentSync.closeWatcher(this);
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  onRetry() {
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
  },

  startWatch(tid) {
    tournamentSync.startWatch(this, tid, (doc) => {
      this.applyTournament(doc);
    });
  },

  async fetchTournament(tid) {
    const doc = await tournamentSync.fetchTournament(tid, (doc) => {
      this.applyTournament(doc);
    });
    if (!doc) this.setData({ loadError: true });
  },

  applyTournament(t) {
    if (!t) return;

    const nt = normalizeTournament(t);
    const r = (nt.rounds || [])[this.data.roundIndex];
    const m0 = r && (r.matches || []).find((x) => Number(x.matchIndex) === Number(this.data.matchIndex));
    const canEdit = perm.canEditScore(nt, this.openid);

    const extractScorePair = (obj) => {
      if (!obj) return { a: '', b: '' };
      const pick = (v) => {
        if (v === 0) return '0';
        if (v === null || v === undefined || v === '') return '';
        if (Array.isArray(v)) return '';
        const n = Number(v);
        return Number.isFinite(n) ? String(n) : '';
      };
      const aVal = (obj.teamAScore ?? obj.scoreA ?? obj.a ?? obj.left ?? obj.teamA);
      const bVal = (obj.teamBScore ?? obj.scoreB ?? obj.b ?? obj.right ?? obj.teamB);
      return { a: pick(aVal), b: pick(bVal) };
    };

    let match = m0 || null;
    let pair1Text = '';
    let pair2Text = '';

    if (match) {
      const teamA = (match.teamA || []).map((p) => ({ ...p, name: safePlayerName(p) }));
      const teamB = (match.teamB || []).map((p) => ({ ...p, name: safePlayerName(p) }));
      match = { ...match, teamA, teamB };
      const aNames = teamA.map((p) => p.name).filter(Boolean);
      const bNames = teamB.map((p) => p.name).filter(Boolean);
      pair1Text = aNames.length ? aNames.join(' / ') : '待定';
      pair2Text = bNames.length ? bNames.join(' / ') : '待定';
    }

    let scoreA = this.data.scoreA;
    let scoreB = this.data.scoreB;
    if (match) {
      const sp = extractScorePair(match.score || match);
      const hasAnyScore = (sp.a !== '' || sp.b !== '');
      const shouldSync = hasAnyScore && ((!canEdit) || (match.status === 'finished') || (scoreA === '' && scoreB === ''));
      if (shouldSync) {
        scoreA = sp.a;
        scoreB = sp.b;
      }
    }

    const displayScoreA = (scoreA === '' ? '-' : String(scoreA));
    const displayScoreB = (scoreB === '' ? '-' : String(scoreB));

    this.setData({
      loadError: false,
      tournamentName: nt.name,
      match,
      canEdit,
      scoreA,
      scoreB,
      displayScoreA,
      displayScoreB,
      pair1Text,
      pair2Text
    });
  },

  onScoreA(e) { this.setData({ scoreA: e.detail.value }); },
  onScoreB(e) { this.setData({ scoreB: e.detail.value }); },
  onToggleAutoNext(e) {
    this.setData({ autoNext: !!(e && e.detail && e.detail.value) });
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

  handleWriteError(err, fallbackMessage, onRefresh) {
    const parsed = cloud.parseCloudError(err, fallbackMessage);
    if (parsed.isConflict) {
      wx.showModal({
        title: '写入冲突',
        content: '数据已被其他人更新，是否立即刷新当前比赛？',
        confirmText: '刷新',
        success: (res) => {
          if (res.confirm && typeof onRefresh === 'function') onRefresh();
        }
      });
      return;
    }
    wx.showToast({ title: parsed.userMessage || fallbackMessage, icon: 'none' });
  },

  async jumpToNextPending(tournamentDoc, noPendingMessage) {
    const nt = normalizeTournament(tournamentDoc || {});
    const next = matchFlow.findNextPending(nt.rounds, Number(this.data.roundIndex), Number(this.data.matchIndex));
    if (!next) {
      wx.showToast({ title: noPendingMessage || '已全部录完', icon: 'none' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 500);
      return;
    }

    wx.redirectTo({
      url: `/pages/match/index?tournamentId=${this.data.tournamentId}&roundIndex=${next.roundIndex}&matchIndex=${next.matchIndex}&batch=1`
    });
  },

  async refreshTournamentDoc() {
    const latest = await tournamentSync.fetchTournament(this.data.tournamentId);
    if (latest) this.applyTournament(latest);
    return latest;
  },

  async jumpAfterBatch(noPendingMessage) {
    const latest = await this.refreshTournamentDoc();
    if (latest) {
      await this.jumpToNextPending(latest, noPendingMessage);
      return true;
    }
    wx.showToast({ title: '同步失败，请稍后重试', icon: 'none' });
    return false;
  },

  async submit() {
    const a = Number(this.data.scoreA);
    const b = Number(this.data.scoreB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
      wx.showToast({ title: '请输入合法比分', icon: 'none' });
      return;
    }

    // 批量录分模式：如果当前场次已被他人录入，直接跳到下一场待录分。
    if (this.data.batchMode && this.data.match && this.data.match.status === 'finished') {
      await this.jumpAfterBatch('该场已录入，已跳到下一场');
      return;
    }

    wx.showLoading({ title: '提交中...' });
    try {
      await cloud.call('submitScore', {
        tournamentId: this.data.tournamentId,
        roundIndex: this.data.roundIndex,
        matchIndex: this.data.matchIndex,
        scoreA: a,
        scoreB: b
      });

      const latest = await tournamentSync.fetchTournament(this.data.tournamentId);
      if (latest) this.applyTournament(latest);

      wx.hideLoading();
      this.clearLastFailedAction();
      wx.showToast({ title: '已提交', icon: 'success' });
      getApp().globalData.needRefreshTournament = this.data.tournamentId;

      if (matchFlow.shouldAutoJump(this.data.batchMode, this.data.autoNext)) {
        setTimeout(() => {
          this.jumpAfterBatch('已全部录完');
        }, 300);
        return;
      }

      if (this.data.batchMode && !this.data.autoNext) {
        return;
      }

      setTimeout(() => {
        wx.navigateBack({ delta: 1 });
      }, 600);
    } catch (e) {
      wx.hideLoading();
      const parsed = cloud.parseCloudError(e, '提交失败');
      if (this.data.batchMode && parsed.isConflict) {
        await this.jumpAfterBatch('该场已录入，已跳到下一场');
        return;
      }
      this.setLastFailedAction('提交比分', () => this.submit());
      this.handleWriteError(e, '提交失败', () => this.fetchTournament(this.data.tournamentId));
    }
  },

  goBack() {
    wx.navigateBack();
  }
});
