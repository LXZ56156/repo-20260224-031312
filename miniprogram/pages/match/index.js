const cloud = require('../../core/cloud');
const storage = require('../../core/storage');
const tournamentSync = require('../../core/tournamentSync');
const nav = require('../../core/nav');
const { buildInitialData, clampScore, buildTournamentViewState } = require('./matchViewModel');
const { createMatchLockController } = require('./matchLockController');
const { createMatchDraftController } = require('./matchDraftController');
const { createMatchSubmitService } = require('./matchSubmitService');

function ensureControllers(ctx) {
  if (!ctx.matchDraft) ctx.matchDraft = createMatchDraftController(ctx);
  if (!ctx.lockController) ctx.lockController = createMatchLockController(ctx);
  if (!ctx.submitService) ctx.submitService = createMatchSubmitService(ctx);
}

function releaseAndTeardown(ctx) {
  ensureControllers(ctx);
  tournamentSync.closeWatcher(ctx);
  ctx.lockController.releaseLockIfOwned().catch(() => {});
  ctx.lockController.teardown({ resetState: true });
}

Page({
  data: buildInitialData(),

  onLoad(options) {
    ensureControllers(this);
    const tid = String(options && options.tournamentId || '').trim();
    const roundIndex = Number(options && options.roundIndex) || 0;
    const matchIndex = Number(options && options.matchIndex) || 0;
    const batchMode = Number(options && options.batch) === 1;

    this.openid = (getApp().globalData.openid || storage.get('openid', ''));
    this._lockStatusKey = '';
    this._batchOccupiedKey = '';
    this._latestTournament = null;
    this._pageRequestSeq = 0;
    this._lastFailedAction = null;
    this._pageActive = true;
    this._navTimers = new Set();
    this.matchDraft.clearUndo();

    this.setData({ tournamentId: tid, roundIndex, matchIndex, batchMode });

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
    this._pageActive = false;
    this.clearNavTimers();
    releaseAndTeardown(this);
  },

  onShow() {
    ensureControllers(this);
    this._pageActive = true;
    this._lockStatusKey = '';
    const currentId = String(this.data.tournamentId || '').trim();
    nav.consumeRefreshFlag(currentId);
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
  },

  onUnload() {
    this._pageActive = false;
    this.clearNavTimers();
    releaseAndTeardown(this);
    this.matchDraft.teardown();
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  nextRequestSeq() {
    this._pageRequestSeq = Number(this._pageRequestSeq || 0) + 1;
    return this._pageRequestSeq;
  },

  isLatestRequestSeq(requestSeq) {
    return Number(requestSeq) === Number(this._pageRequestSeq || 0);
  },

  isPageActive() {
    return this._pageActive !== false;
  },

  registerNavTimer(fn, delay = 0) {
    if (typeof fn !== 'function') return null;
    if (!(this._navTimers instanceof Set)) this._navTimers = new Set();
    let timerId = null;
    timerId = setTimeout(() => {
      if (this._navTimers instanceof Set) this._navTimers.delete(timerId);
      if (!this.isPageActive()) return;
      fn();
    }, Math.max(0, Number(delay) || 0));
    this._navTimers.add(timerId);
    return timerId;
  },

  clearNavTimers() {
    if (!(this._navTimers instanceof Set)) {
      this._navTimers = new Set();
      return;
    }
    for (const timerId of this._navTimers) clearTimeout(timerId);
    this._navTimers.clear();
  },

  onRetry() {
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
  },

  startWatch(tournamentId) {
    if (!tournamentId) return;
    ensureControllers(this);
    tournamentSync.startWatch(this, tournamentId, (doc) => {
      const requestSeq = this.nextRequestSeq();
      this.setData({ showStaleSyncHint: false });
      this.applyTournament(doc, { requestSeq });
    });
  },

  async fetchTournament(tournamentId) {
    if (!tournamentId) return null;
    ensureControllers(this);
    const requestSeq = this.nextRequestSeq();
    const result = await tournamentSync.fetchTournament(tournamentId);
    if (!this.isLatestRequestSeq(requestSeq)) return null;
    if (result && result.ok && result.doc) {
      this.setData({ showStaleSyncHint: false });
      this.applyTournament(result.doc, { requestSeq });
      return result.doc;
    }
    if (result && result.cachedDoc) {
      this.setData({ showStaleSyncHint: true, loadError: false });
      this.applyTournament(result.cachedDoc, { requestSeq });
      return result.cachedDoc;
    }
    this.setData({ loadError: true, showStaleSyncHint: false });
    return null;
  },

  applyTournament(tournament, options = {}) {
    if (!tournament) return;
    ensureControllers(this);
    const requestSeq = Number(options.requestSeq) || 0;
    if (requestSeq && !this.isLatestRequestSeq(requestSeq)) return;

    const viewState = buildTournamentViewState(tournament, {
      tournamentId: this.data.tournamentId,
      roundIndex: this.data.roundIndex,
      matchIndex: this.data.matchIndex,
      openid: this.openid,
      lockState: this.data.lockState,
      currentScoreA: this.data.scoreA,
      currentScoreB: this.data.scoreB,
      draft: this.matchDraft.getScoreDraft(),
      undoSize: this.matchDraft.getUndoSize()
    });
    if (!viewState) return;

    this._latestTournament = viewState.tournament;
    if (viewState.lockTransition) {
      this.lockController.setLockState(viewState.lockTransition, {}, { skipApply: true });
    }
    if (viewState.shouldClearDraft) {
      this.matchDraft.clearScoreDraft();
      this.matchDraft.clearUndo();
    }
    this.setData(viewState.data);

    if (viewState.shouldSyncLock && this._lockStatusKey !== viewState.lockSyncKey && options.skipLockSync !== true) {
      this._lockStatusKey = viewState.lockSyncKey;
      this.lockController.syncLockStatus(true);
    }
  },

  buildScoreLockPayload(action, force = false) {
    ensureControllers(this);
    return this.lockController.buildScoreLockPayload(action, force);
  },

  setLockState(state, payload = {}, options = {}) {
    ensureControllers(this);
    this.lockController.setLockState(state, payload, options);
  },

  clearLockTimers() {
    ensureControllers(this);
    this.lockController.teardown();
  },

  async syncLockStatus(silent = false) {
    ensureControllers(this);
    return this.lockController.syncLockStatus(silent);
  },

  async heartbeatLock() {
    ensureControllers(this);
    return this.lockController.heartbeatLock();
  },

  async releaseLockIfOwned(force = false) {
    ensureControllers(this);
    return this.lockController.releaseLockIfOwned(force);
  },

  applyScoreLockResult(res, options = {}) {
    ensureControllers(this);
    this.lockController.applyScoreLockResult(res, options);
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
    try {
      await this.syncLockStatus(false);
    } finally {
      this.setData({ lockBusy: false });
    }
  },

  getScoreDraft() {
    ensureControllers(this);
    return this.matchDraft.getScoreDraft();
  },

  saveScoreDraft(scoreA, scoreB) {
    ensureControllers(this);
    this.matchDraft.saveScoreDraft(scoreA, scoreB);
  },

  clearScoreDraft() {
    ensureControllers(this);
    this.matchDraft.clearScoreDraft();
  },

  pushUndo(scoreA, scoreB) {
    ensureControllers(this);
    this.matchDraft.pushUndo(scoreA, scoreB);
  },

  setEditableScores(nextA, nextB, options = {}) {
    if (!this.data.canEdit) return;
    ensureControllers(this);
    const scoreA = clampScore(nextA);
    const scoreB = clampScore(nextB);
    const prevA = clampScore(this.data.scoreA);
    const prevB = clampScore(this.data.scoreB);
    const changed = scoreA !== prevA || scoreB !== prevB;

    if (options.recordHistory !== false && changed) this.matchDraft.pushUndo(prevA, prevB);
    this.setData({
      scoreA,
      scoreB,
      scoreAIndex: scoreA,
      scoreBIndex: scoreB,
      displayScoreA: String(scoreA),
      displayScoreB: String(scoreB),
      canUndo: this.matchDraft.getUndoSize() > 0
    });
    if (options.persist !== false) this.matchDraft.saveScoreDraft(scoreA, scoreB);
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
    ensureControllers(this);
    const last = this.matchDraft.undo();
    if (!last) return;
    this.setEditableScores(last.a, last.b, { recordHistory: false, persist: true });
    this.setData({ canUndo: this.matchDraft.getUndoSize() > 0 });
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
    ensureControllers(this);
    cloud.presentWriteError({
      err,
      fallbackMessage,
      conflictContent: '数据已被其他人更新，刷新后可继续提交，当前输入会保留。',
      onRefresh,
      onKeepDraft: () => {
        this.matchDraft.saveScoreDraft(this.data.scoreA, this.data.scoreB);
      }
    });
  },

  returnToSchedule(delay = 0) {
    ensureControllers(this);
    return this.submitService.returnToSchedule(delay);
  },

  async jumpToNextPending(tournamentDoc, noPendingMessage, forceBatch = false) {
    ensureControllers(this);
    return this.submitService.jumpToNextPending(tournamentDoc, noPendingMessage, forceBatch);
  },

  async refreshTournamentDoc() {
    ensureControllers(this);
    return this.submitService.refreshTournamentDoc();
  },

  async jumpAfterBatch(noPendingMessage) {
    ensureControllers(this);
    return this.submitService.jumpAfterBatch(noPendingMessage);
  },

  restoreLockAfterSubmitFail(snapshot) {
    ensureControllers(this);
    this.submitService.restoreLockAfterSubmitFail(snapshot);
  },

  handleSubmitResultCode(res, lockSnapshot) {
    ensureControllers(this);
    return this.submitService.handleSubmitResultCode(res, lockSnapshot);
  },

  async submit() {
    ensureControllers(this);
    return this.submitService.submit();
  }
});
