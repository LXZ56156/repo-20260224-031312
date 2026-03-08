const cloud = require('../../core/cloud');
const storage = require('../../core/storage');
const perm = require('../../permission/permission');
const { normalizeTournament, safePlayerName } = require('../../core/normalize');
const tournamentSync = require('../../core/tournamentSync');
const matchFlow = require('../../core/matchFlow');
const nav = require('../../core/nav');

const SCORE_AUTO_RETURN_KEY = 'score_auto_return';
const SCORE_AUTO_NEXT_KEY = 'score_auto_next';
const SCORE_MAX = 60;
const LOCK_HEARTBEAT_MS = 15 * 1000;

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const v = Math.floor(n);
  if (v < 0) return 0;
  if (v > SCORE_MAX) return SCORE_MAX;
  return v;
}

function extractScorePair(obj) {
  if (!obj) return { a: null, b: null };
  const pick = (v) => {
    if (v === 0 || v === '0') return 0;
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.floor(n) : null;
  };
  const aVal = (obj.teamAScore ?? obj.scoreA ?? obj.a ?? obj.left ?? obj.teamA);
  const bVal = (obj.teamBScore ?? obj.scoreB ?? obj.b ?? obj.right ?? obj.teamB);
  return { a: pick(aVal), b: pick(bVal) };
}

function formatRemaining(remainingMs) {
  const ms = Number(remainingMs) || 0;
  if (ms <= 0) return '0秒';
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return `${seconds}秒`;
}

function normalizeLockState(state) {
  const s = String(state || '').trim();
  if (s === 'locked_by_me') return s;
  if (s === 'locked_by_other') return s;
  if (s === 'submitting') return s;
  if (s === 'finished') return s;
  if (s === 'forbidden') return s;
  return 'idle';
}

function buildLockHint(state, ownerName, remainingMs) {
  const s = normalizeLockState(state);
  const name = String(ownerName || '').trim();
  if (s === 'locked_by_me') return '你正在录入比分';
  if (s === 'locked_by_other') {
    const display = name || '其他成员';
    return `${display} 正在录入比分（剩余${formatRemaining(remainingMs)}）`;
  }
  if (s === 'submitting') return '正在提交比分...';
  if (s === 'finished') return '该场已录完';
  if (s === 'forbidden') return '仅管理员或参赛成员可录分';
  return '点击“开始录分”即可成为本场裁判';
}

Page({
  data: {
    tournamentId: '',
    tournamentName: '',
    roundIndex: 0,
    matchIndex: 0,
    match: null,
    scoreA: 0,
    scoreB: 0,
    scoreAIndex: 0,
    scoreBIndex: 0,
    scoreOptions: Array.from({ length: SCORE_MAX + 1 }, (_, i) => i),
    canUndo: false,
    displayScoreA: '-',
    displayScoreB: '-',
    canEdit: false,
    userCanScore: false,
    isAdmin: false,
    pair1Text: '',
    pair2Text: '',
    batchMode: false,
    networkOffline: false,
    canRetryAction: false,
    lastFailedActionText: '',
    loadError: false,
    lockState: 'idle',
    lockOwnerId: '',
    lockOwnerName: '',
    lockExpireAt: 0,
    lockRemainingMs: 0,
    lockHintText: buildLockHint('idle', '', 0),
    lockBusy: false,
    matchStatusText: '待录分',
    pointsPerGame: 21
  },

  onLoad(options) {
    const tid = options.tournamentId;
    const roundIndex = Number(options.roundIndex) || 0;
    const matchIndex = Number(options.matchIndex) || 0;
    const batchMode = Number(options.batch) === 1;
    this.openid = (getApp().globalData.openid || storage.get('openid', ''));
    this.setData({ tournamentId: tid, roundIndex, matchIndex, batchMode });
    this._undoStack = [];
    this._lockStatusKey = '';
    this._batchOccupiedKey = '';
    this._latestTournament = null;

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
    this.releaseLockIfOwned();
    this._lockStatusKey = '';
    this.setLockState('idle', {}, { skipApply: true });
  },

  onShow() {
    this._lockStatusKey = '';
    const currentId = String(this.data.tournamentId || '').trim();
    nav.consumeRefreshFlag(currentId);
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
  },

  onUnload() {
    tournamentSync.closeWatcher(this);
    this.releaseLockIfOwned();
    this.clearLockTimers();
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
    const doc = await tournamentSync.fetchTournament(tid, (item) => {
      this.applyTournament(item);
    });
    if (!doc) this.setData({ loadError: true });
  },

  applyTournament(t, options = {}) {
    if (!t) return;
    const nt = normalizeTournament(t);
    this._latestTournament = nt;

    const r = (nt.rounds || [])[this.data.roundIndex];
    const m0 = r && (r.matches || []).find((x) => Number(x.matchIndex) === Number(this.data.matchIndex));
    const userCanScore = perm.canEditScore(nt, this.openid);
    const isAdmin = perm.isAdmin(nt, this.openid);

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

    if (!match) {
      this.setData({
        loadError: false,
        tournamentName: nt.name,
        match: null,
        userCanScore,
        isAdmin,
        canEdit: false,
        pair1Text,
        pair2Text
      });
      return;
    }

    const matchStatus = String(match.status || '').trim();
    const finished = matchStatus === 'finished' || matchStatus === 'canceled';
    const matchStatusText = matchStatus === 'canceled' ? '已取消' : (matchStatus === 'finished' ? '已完赛' : '待录分');
    if (finished && this.data.lockState !== 'finished') {
      this.setLockState('finished', {}, { skipApply: true });
      this.clearScoreDraft();
      this._undoStack = [];
    } else if (!userCanScore && this.data.lockState !== 'forbidden') {
      this.setLockState('forbidden', {}, { skipApply: true });
    } else if (userCanScore && this.data.lockState === 'forbidden') {
      this.setLockState('idle', {}, { skipApply: true });
    }

    const canEdit = userCanScore && !finished && this.data.lockState === 'locked_by_me';
    const scorePair = extractScorePair(match && (match.score || match));
    const hasServerScore = scorePair.a !== null && scorePair.b !== null;
    const draft = this.getScoreDraft();

    let scoreA = clampScore(this.data.scoreA);
    let scoreB = clampScore(this.data.scoreB);

    if (finished) {
      if (hasServerScore) {
        scoreA = clampScore(scorePair.a);
        scoreB = clampScore(scorePair.b);
      }
    } else if (canEdit) {
      if (draft) {
        scoreA = clampScore(draft.scoreA);
        scoreB = clampScore(draft.scoreB);
      } else if (hasServerScore) {
        scoreA = clampScore(scorePair.a);
        scoreB = clampScore(scorePair.b);
      }
    } else if (hasServerScore) {
      scoreA = clampScore(scorePair.a);
      scoreB = clampScore(scorePair.b);
    }

    const displayScoreA = (canEdit || finished || hasServerScore) ? String(scoreA) : '-';
    const displayScoreB = (canEdit || finished || hasServerScore) ? String(scoreB) : '-';

    this.setData({
      loadError: false,
      tournamentName: nt.name,
      match,
      matchStatusText,
      pointsPerGame: Math.max(1, Number(nt.rules && nt.rules.pointsPerGame) || 21),
      userCanScore,
      isAdmin,
      canEdit,
      scoreA,
      scoreB,
      scoreAIndex: scoreA,
      scoreBIndex: scoreB,
      displayScoreA,
      displayScoreB,
      pair1Text,
      pair2Text,
      canUndo: canEdit ? (this._undoStack || []).length > 0 : false
    });

    const key = `${this.data.tournamentId}_${this.data.roundIndex}_${this.data.matchIndex}`;
    if (!finished && userCanScore && this._lockStatusKey !== key && options.skipLockSync !== true) {
      this._lockStatusKey = key;
      this.syncLockStatus(true);
    }
  },

  buildScoreLockPayload(action, force = false) {
    return {
      action,
      tournamentId: this.data.tournamentId,
      roundIndex: this.data.roundIndex,
      matchIndex: this.data.matchIndex,
      force: !!force
    };
  },

  setLockState(state, payload = {}, options = {}) {
    const lockState = normalizeLockState(state);
    const ownerId = String(payload.ownerId || '').trim();
    const ownerName = String(payload.ownerName || '').trim();
    const expireAt = Number(payload.expireAt) || 0;
    const remainingMs = Math.max(0, Number(payload.remainingMs) || (expireAt > 0 ? (expireAt - Date.now()) : 0));
    this.setData({
      lockState,
      lockOwnerId: ownerId,
      lockOwnerName: ownerName,
      lockExpireAt: expireAt,
      lockRemainingMs: remainingMs,
      lockHintText: buildLockHint(lockState, ownerName, remainingMs)
    });
    this.updateLockTimers(lockState, expireAt);
    if (options.skipApply !== true && this._latestTournament) {
      this.applyTournament(this._latestTournament, { skipLockSync: true });
    }
  },

  updateLockTimers(lockState, expireAt) {
    if (lockState === 'locked_by_me') this.startLockHeartbeat();
    else this.stopLockHeartbeat();
    if ((lockState === 'locked_by_me' || lockState === 'locked_by_other') && expireAt > 0) {
      this.startLockCountdown(expireAt);
    } else {
      this.stopLockCountdown();
    }
  },

  clearLockTimers() {
    this.stopLockHeartbeat();
    this.stopLockCountdown();
  },

  startLockCountdown(expireAt) {
    this.stopLockCountdown();
    const deadline = Number(expireAt) || 0;
    if (deadline <= 0) return;
    const tick = () => {
      const remainingMs = Math.max(0, deadline - Date.now());
      if (remainingMs <= 0) {
        this.stopLockCountdown();
        const oldState = this.data.lockState;
        this.setLockState('idle', {}, { skipApply: true });
        if (oldState === 'locked_by_me') {
          wx.showToast({ title: '录分会话已过期，请重新开始录分', icon: 'none' });
        }
        if (this._latestTournament) this.applyTournament(this._latestTournament, { skipLockSync: true });
        return;
      }
      this.setData({
        lockRemainingMs: remainingMs,
        lockHintText: buildLockHint(this.data.lockState, this.data.lockOwnerName, remainingMs)
      });
    };
    tick();
    this._countdownTimer = setInterval(tick, 1000);
  },

  stopLockCountdown() {
    if (this._countdownTimer) clearInterval(this._countdownTimer);
    this._countdownTimer = null;
  },

  startLockHeartbeat() {
    this.stopLockHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      this.heartbeatLock().catch(() => {});
    }, LOCK_HEARTBEAT_MS);
  },

  stopLockHeartbeat() {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = null;
  },

  async syncLockStatus(silent = false) {
    if (!this.data.userCanScore || !this.data.match || String(this.data.match.status || '') === 'finished') return;
    try {
      const res = await cloud.call('scoreLock', this.buildScoreLockPayload('status'));
      this.applyScoreLockResult(res, { silent });
    } catch (err) {
      if (!silent) wx.showToast({ title: cloud.getUnifiedErrorMessage(err, '同步状态失败'), icon: 'none' });
    }
  },

  async heartbeatLock() {
    if (this.data.lockState !== 'locked_by_me') return;
    try {
      const res = await cloud.call('scoreLock', this.buildScoreLockPayload('heartbeat'));
      this.applyScoreLockResult(res, { silent: true, fromHeartbeat: true });
    } catch (_) {
      // 心跳失败不立刻中断编辑，下一次交互时再校验
    }
  },

  async releaseLockIfOwned(force = false) {
    if (this.data.lockState !== 'locked_by_me' && !force) return;
    try {
      await cloud.call('scoreLock', this.buildScoreLockPayload('release', force));
    } catch (_) {
      // ignore
    }
  },

  applyScoreLockResult(res, options = {}) {
    const result = res && typeof res === 'object' ? res : {};
    const state = String(result.state || '').trim();
    if (result.ok === true && state === 'acquired') {
      this.setLockState('locked_by_me', result);
      return;
    }
    if (state === 'occupied') {
      this.setLockState('locked_by_other', result);
      this.tryBatchSkipOnOccupied();
      return;
    }
    if (state === 'finished') {
      this.setLockState('finished', result);
      return;
    }
    if (state === 'forbidden') {
      this.setLockState('forbidden', result);
      if (!options.silent) wx.showToast({ title: '仅管理员或参赛成员可录分', icon: 'none' });
      return;
    }
    if (state === 'expired') {
      this.setLockState('idle', result);
      if (!options.silent) wx.showToast({ title: '录分会话已过期，请重新开始录分', icon: 'none' });
      return;
    }
    if (state === 'released') {
      this.setLockState('idle', result);
      return;
    }
    this.setLockState('idle', result);
  },

  tryBatchSkipOnOccupied() {
    if (!this.data.batchMode) return;
    const key = `${this.data.tournamentId}_${this.data.roundIndex}_${this.data.matchIndex}`;
    if (this._batchOccupiedKey === key) return;
    this._batchOccupiedKey = key;
    wx.showToast({ title: '该场有人录入中，已跳到下一场', icon: 'none' });
    setTimeout(() => {
      this.jumpAfterBatch('该场有人录入中，已跳到下一场');
    }, 180);
  },

  async onStartScoring() {
    if (this.data.lockBusy) return;
    this.setData({ lockBusy: true });
    try {
      const res = await cloud.call('scoreLock', this.buildScoreLockPayload('acquire'));
      this.applyScoreLockResult(res);
    } catch (err) {
      wx.showToast({ title: cloud.getUnifiedErrorMessage(err, '开始录分失败'), icon: 'none' });
    } finally {
      this.setData({ lockBusy: false });
    }
  },

  async onTakeOverScoring() {
    if (!this.data.isAdmin || this.data.lockBusy) return;
    this.setData({ lockBusy: true });
    try {
      const res = await cloud.call('scoreLock', this.buildScoreLockPayload('acquire', true));
      this.applyScoreLockResult(res);
    } catch (err) {
      wx.showToast({ title: cloud.getUnifiedErrorMessage(err, '接管失败'), icon: 'none' });
    } finally {
      this.setData({ lockBusy: false });
    }
  },

  async onRefreshLock() {
    if (this.data.lockBusy) return;
    this.setData({ lockBusy: true });
    await this.syncLockStatus(false);
    this.setData({ lockBusy: false });
  },

  getScoreDraft() {
    return storage.getScoreDraft(
      this.data.tournamentId,
      this.data.roundIndex,
      this.data.matchIndex
    );
  },

  saveScoreDraft(scoreA, scoreB) {
    storage.setScoreDraft(
      this.data.tournamentId,
      this.data.roundIndex,
      this.data.matchIndex,
      {
        scoreA: clampScore(scoreA),
        scoreB: clampScore(scoreB),
        updatedAt: Date.now()
      }
    );
  },

  clearScoreDraft() {
    storage.removeScoreDraft(
      this.data.tournamentId,
      this.data.roundIndex,
      this.data.matchIndex
    );
  },

  pushUndo(a, b) {
    this._undoStack = Array.isArray(this._undoStack) ? this._undoStack : [];
    this._undoStack.push({ a: clampScore(a), b: clampScore(b) });
    if (this._undoStack.length > 20) this._undoStack.shift();
  },

  setEditableScores(nextA, nextB, options = {}) {
    if (!this.data.canEdit) return;
    const a = clampScore(nextA);
    const b = clampScore(nextB);
    const prevA = clampScore(this.data.scoreA);
    const prevB = clampScore(this.data.scoreB);
    const changed = a !== prevA || b !== prevB;
    if (options.recordHistory !== false && changed) this.pushUndo(prevA, prevB);
    this.setData({
      scoreA: a,
      scoreB: b,
      scoreAIndex: a,
      scoreBIndex: b,
      displayScoreA: String(a),
      displayScoreB: String(b),
      canUndo: (this._undoStack || []).length > 0
    });
    if (options.persist !== false) this.saveScoreDraft(a, b);
  },

  onPickScoreA(e) {
    const idx = clampScore(Number(e.detail.value));
    this.setEditableScores(idx, this.data.scoreB, { recordHistory: true, persist: true });
  },

  onPickScoreB(e) {
    const idx = clampScore(Number(e.detail.value));
    this.setEditableScores(this.data.scoreA, idx, { recordHistory: true, persist: true });
  },

  onUndoStep() {
    if (!this.data.canEdit) return;
    this._undoStack = Array.isArray(this._undoStack) ? this._undoStack : [];
    const last = this._undoStack.pop();
    if (!last) return;
    this.setEditableScores(last.a, last.b, { recordHistory: false, persist: true });
    this.setData({ canUndo: (this._undoStack || []).length > 0 });
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
    cloud.presentWriteError({
      err,
      fallbackMessage,
      conflictContent: '数据已被其他人更新，刷新后可继续提交，当前输入会保留。',
      onRefresh,
      onKeepDraft: () => {
        this.saveScoreDraft(this.data.scoreA, this.data.scoreB);
      }
    });
  },

  returnToSchedule(delay = 0) {
    const tid = String(this.data.tournamentId || '').trim();
    if (!tid) return;
    nav.redirectOrBack(`/pages/schedule/index?tournamentId=${tid}`, delay);
  },

  async jumpToNextPending(tournamentDoc, noPendingMessage, forceBatch = false) {
    const nt = normalizeTournament(tournamentDoc || {});
    const next = matchFlow.findNextPending(nt.rounds, Number(this.data.roundIndex), Number(this.data.matchIndex));
    if (!next) {
      wx.showToast({ title: noPendingMessage || '已全部录完', icon: 'none' });
      this.returnToSchedule(420);
      return;
    }

    wx.redirectTo({
      url: `/pages/match/index?tournamentId=${this.data.tournamentId}&roundIndex=${next.roundIndex}&matchIndex=${next.matchIndex}${forceBatch ? '&batch=1' : ''}`
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
      await this.jumpToNextPending(latest, noPendingMessage, true);
      return true;
    }
    wx.showToast({ title: '同步失败，请稍后重试', icon: 'none' });
    return false;
  },

  restoreLockAfterSubmitFail(snapshot) {
    const snap = snapshot || {};
    this.setLockState('locked_by_me', {
      ownerId: snap.ownerId,
      ownerName: snap.ownerName,
      expireAt: snap.expireAt,
      remainingMs: Math.max(0, Number(snap.expireAt) - Date.now())
    });
  },

  handleSubmitResultCode(res, lockSnapshot) {
    const code = String((res && res.code) || '').trim().toUpperCase();
    if (code === 'LOCK_OCCUPIED') {
      this.applyScoreLockResult({ ...res, state: 'occupied' });
      return true;
    }
    if (code === 'LOCK_EXPIRED') {
      this.applyScoreLockResult({ ...res, state: 'expired' });
      return true;
    }
    if (code === 'MATCH_FINISHED') {
      this.setLockState('finished', res);
      if (this.data.batchMode) {
        setTimeout(() => this.jumpAfterBatch('该场已录完，已跳到下一场'), 160);
      } else {
        this.refreshTournamentDoc();
      }
      return true;
    }
    if (code === 'PERMISSION_DENIED') {
      this.setLockState('forbidden', res);
      wx.showToast({ title: String(res.message || '无权限录分'), icon: 'none' });
      return true;
    }
    if (code === 'VERSION_CONFLICT') {
      this.restoreLockAfterSubmitFail(lockSnapshot);
      this.setLastFailedAction('提交比分', () => this.submit());
      this.handleWriteError(new Error(String(res.message || '写入冲突')), '提交失败', () => this.fetchTournament(this.data.tournamentId));
      return true;
    }
    return false;
  },

  async submit() {
    const a = clampScore(this.data.scoreA);
    const b = clampScore(this.data.scoreB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
      wx.showToast({ title: '请输入合法比分', icon: 'none' });
      return;
    }

    if (this.data.batchMode && this.data.match && this.data.match.status === 'finished') {
      await this.jumpAfterBatch('该场已录入，已跳到下一场');
      return;
    }

    if (!this.data.canEdit) {
      if (this.data.lockState === 'locked_by_other') {
        this.tryBatchSkipOnOccupied();
        if (!this.data.batchMode) wx.showToast({ title: '当前有人正在录分', icon: 'none' });
        return;
      }
      if (this.data.userCanScore && this.data.lockState === 'idle') {
        wx.showToast({ title: '请先点击“开始录分”', icon: 'none' });
        return;
      }
      wx.showToast({ title: '当前不可录分', icon: 'none' });
      return;
    }

    const lockSnapshot = {
      ownerId: this.data.lockOwnerId,
      ownerName: this.data.lockOwnerName,
      expireAt: this.data.lockExpireAt
    };

    this.setLockState('submitting', lockSnapshot, { skipApply: true });
    wx.showLoading({ title: '提交中...' });
    try {
      const res = await cloud.call('submitScore', {
        tournamentId: this.data.tournamentId,
        roundIndex: this.data.roundIndex,
        matchIndex: this.data.matchIndex,
        scoreA: a,
        scoreB: b
      });
      if (res && res.ok === false) {
        wx.hideLoading();
        if (this.handleSubmitResultCode(res, lockSnapshot)) return;
        this.restoreLockAfterSubmitFail(lockSnapshot);
        wx.showToast({ title: String(res.message || '提交失败'), icon: 'none' });
        return;
      }

      const latest = await tournamentSync.fetchTournament(this.data.tournamentId);
      if (latest) this.applyTournament(latest);

      wx.hideLoading();
      this.clearLastFailedAction();
      this.clearScoreDraft();
      this._undoStack = [];
      this.setLockState('finished', {
        ownerId: lockSnapshot.ownerId,
        ownerName: String((res && res.scorerName) || lockSnapshot.ownerName || '')
      });
      wx.showToast({ title: '已提交', icon: 'success' });
      nav.markRefreshFlag(this.data.tournamentId);

      if (this.data.batchMode) {
        setTimeout(() => {
          this.jumpAfterBatch('已全部录完');
        }, 260);
        return;
      }

      const autoNext = storage.get(SCORE_AUTO_NEXT_KEY, true) !== false;
      const autoReturn = storage.get(SCORE_AUTO_RETURN_KEY, true) !== false;
      if (autoNext) {
        setTimeout(async () => {
          const latestDoc = await this.refreshTournamentDoc();
          if (latestDoc) {
            await this.jumpToNextPending(latestDoc, '已全部录完', false);
            return;
          }
          if (autoReturn) this.returnToSchedule(420);
        }, 260);
        return;
      }
      if (autoReturn) {
        this.returnToSchedule(420);
      }
    } catch (err) {
      wx.hideLoading();
      this.restoreLockAfterSubmitFail(lockSnapshot);
      this.setLastFailedAction('提交比分', () => this.submit());
      this.handleWriteError(err, '提交失败', () => this.fetchTournament(this.data.tournamentId));
    }
  }
});
