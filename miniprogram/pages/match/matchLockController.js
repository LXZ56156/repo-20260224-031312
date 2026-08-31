const cloud = require('../../core/cloud');
const clientRequest = require('../../core/clientRequest');
const { normalizeLockState, buildLockHint } = require('./matchViewModel');

const LOCK_HEARTBEAT_MS = 15 * 1000;
const LOCK_AUTOPOLL_MS = 5 * 1000;
const LOCK_RELEASE_RETRY_DELAY_MS = 300;

function resolveLockResultKind(result = {}) {
  const code = String(result.code || '').trim().toUpperCase();
  if (code === 'LOCK_ACQUIRED') return 'acquired';
  if (code === 'LOCK_OCCUPIED') return 'occupied';
  if (code === 'MATCH_FINISHED') return 'finished';
  if (code === 'MATCH_CANCELED') return 'canceled';
  if (code === 'LOCK_FORBIDDEN') return 'forbidden';
  if (code === 'LOCK_EXPIRED') return 'expired';
  if (code === 'LOCK_RELEASED') return 'released';
  return String(result.state || '').trim().toLowerCase();
}

function createMatchLockController(ctx, deps = {}) {
  const cloudApi = deps.cloud || cloud;
  const setIntervalFn = deps.setIntervalFn || setInterval;
  const clearIntervalFn = deps.clearIntervalFn || clearInterval;
  const setTimeoutFn = deps.setTimeoutFn || setTimeout;
  let heartbeatTimer = null;
  let countdownTimer = null;
  let autoPollTimer = null;
  let lockSessionId = '';
  let lockRequestVersion = 0;

  function isCurrentLockSession(expectedSessionId = '', expectedVersion = lockRequestVersion) {
    if (expectedVersion !== lockRequestVersion) return false;
    if (typeof ctx.isPageActive === 'function' && !ctx.isPageActive()) return false;
    const expected = String(expectedSessionId || '').trim();
    return !expected || expected === lockSessionId;
  }

  function buildScoreLockPayload(action, force = false) {
    const normalizedAction = String(action || '').trim().toLowerCase();
    if (normalizedAction === 'acquire') {
      lockRequestVersion += 1;
      lockSessionId = clientRequest.buildClientRequestId('score_lock');
    }
    const payload = {
      action: normalizedAction,
      tournamentId: ctx.data.tournamentId,
      roundIndex: ctx.data.roundIndex,
      matchIndex: ctx.data.matchIndex,
      force: !!force
    };
    if (lockSessionId && normalizedAction !== 'status') {
      payload.lockSessionId = lockSessionId;
    }
    return payload;
  }

  function stopLockHeartbeat() {
    if (heartbeatTimer) clearIntervalFn(heartbeatTimer);
    heartbeatTimer = null;
  }

  function stopLockCountdown() {
    if (countdownTimer) clearIntervalFn(countdownTimer);
    countdownTimer = null;
  }

  function startLockCountdown(expireAt) {
    stopLockCountdown();
    const deadline = Number(expireAt) || 0;
    if (deadline <= 0) return;
    const tick = () => {
      const remainingMs = Math.max(0, deadline - Date.now());
      if (remainingMs <= 0) {
        stopLockCountdown();
        const oldState = ctx.data.lockState;
        setLockState('idle', {}, { skipApply: true });
        if (oldState === 'locked_by_me') {
          wx.showToast({ title: '录分会话已过期，请重新开始录分', icon: 'none' });
        }
        if (ctx._latestTournament) ctx.applyTournament(ctx._latestTournament, { skipLockSync: true });
        return;
      }
      ctx.setData({
        lockRemainingMs: remainingMs,
        lockHintText: buildLockHint(ctx.data.lockState, ctx.data.lockOwnerName, remainingMs)
      });
    };
    tick();
    countdownTimer = setIntervalFn(tick, 1000);
  }

  function startLockHeartbeat() {
    stopLockHeartbeat();
    heartbeatTimer = setIntervalFn(() => {
      heartbeatLock().catch(() => {});
    }, LOCK_HEARTBEAT_MS);
  }

  function stopAutoPoll() {
    if (autoPollTimer) clearIntervalFn(autoPollTimer);
    autoPollTimer = null;
  }

  function startAutoPoll() {
    stopAutoPoll();
    autoPollTimer = setIntervalFn(() => {
      syncLockStatus(true).catch(() => {});
    }, LOCK_AUTOPOLL_MS);
  }

  function updateLockTimers(lockState, expireAt) {
    if (lockState === 'locked_by_me') startLockHeartbeat();
    else stopLockHeartbeat();

    if (lockState === 'locked_by_other') startAutoPoll();
    else stopAutoPoll();

    if ((lockState === 'locked_by_me' || lockState === 'locked_by_other') && expireAt > 0) {
      startLockCountdown(expireAt);
      return;
    }
    stopLockCountdown();
  }

  function delay(ms) {
    const waitMs = Math.max(0, Number(ms) || 0);
    return new Promise((resolve) => {
      setTimeoutFn(resolve, waitMs);
    });
  }

  function warnReleaseFailure(stage, err) {
    try {
      console.warn('score lock release failed', stage, err);
    } catch (_) {
      // ignore
    }
  }

  function setLockState(state, payload = {}, options = {}) {
    const lockState = normalizeLockState(state);
    const nextLockSessionId = String(payload.lockSessionId || '').trim();
    if (lockState === 'locked_by_me' || lockState === 'submitting') {
      if (nextLockSessionId) lockSessionId = nextLockSessionId;
    } else {
      lockSessionId = '';
    }
    const ownerId = String(payload.ownerId || '').trim();
    const ownerName = String(payload.ownerName || '').trim();
    const expireAt = Number(payload.expireAt) || 0;
    const remainingMs = Math.max(0, Number(payload.remainingMs) || (expireAt > 0 ? (expireAt - Date.now()) : 0));

    ctx.setData({
      lockState,
      lockOwnerId: ownerId,
      lockOwnerName: ownerName,
      lockExpireAt: expireAt,
      lockRemainingMs: remainingMs,
      lockHintText: buildLockHint(lockState, ownerName, remainingMs)
    });
    updateLockTimers(lockState, expireAt);
    if (options.skipApply !== true && ctx._latestTournament) {
      ctx.applyTournament(ctx._latestTournament, { skipLockSync: true });
    }
  }

  async function syncLockStatus(silent = false) {
    const match = ctx.data.match;
    const status = String(match && match.status || '').trim();
    if (!ctx.data.userCanScore || !match || status === 'canceled' || ctx.data.lockBusy) return;
    const requestVersion = lockRequestVersion;
    const expectedSessionId = lockSessionId;
    try {
      const res = await cloudApi.call('scoreLock', buildScoreLockPayload('status'));
      if (!isCurrentLockSession(expectedSessionId, requestVersion)) return;
      applyScoreLockResult(res, { silent });
    } catch (err) {
      if (!silent) wx.showToast({ title: cloudApi.getUnifiedErrorMessage(err, '同步状态失败'), icon: 'none' });
    }
  }

  async function heartbeatLock() {
    if (ctx.data.lockState !== 'locked_by_me') return;
    const requestVersion = lockRequestVersion;
    const expectedSessionId = lockSessionId;
    try {
      const res = await cloudApi.call('scoreLock', buildScoreLockPayload('heartbeat'));
      if (!isCurrentLockSession(expectedSessionId, requestVersion)) return;
      applyScoreLockResult(res, { silent: true, fromHeartbeat: true });
    } catch (_) {
      // 心跳失败不立刻中断编辑，下一次交互时再校验
    }
  }

  async function releaseLockIfOwned(force = false, options = {}) {
    if (ctx.data.lockState !== 'locked_by_me' && !force) return;
    const payload = buildScoreLockPayload('release', force);
    const retryDelayMs = Number.isFinite(Number(options.retryDelayMs))
      ? Number(options.retryDelayMs)
      : LOCK_RELEASE_RETRY_DELAY_MS;
    try {
      await cloudApi.call('scoreLock', payload, { retry: false });
      return true;
    } catch (err) {
      warnReleaseFailure('initial', err);
      if (options.retry === false) return false;
    }

    if (retryDelayMs > 0) await delay(retryDelayMs);
    try {
      await cloudApi.call('scoreLock', payload, { retry: false });
      return true;
    } catch (err) {
      warnReleaseFailure('retry', err);
      return false;
    }
  }

  function applyScoreLockResult(res, options = {}) {
    const result = res && typeof res === 'object' ? res : {};
    const kind = resolveLockResultKind(result);
    if (result.ok === true && kind === 'acquired') {
      setLockState('locked_by_me', result);
      return;
    }
    if (kind === 'occupied') {
      setLockState('locked_by_other', result);
      if (!options.silent && !ctx.data.batchMode) {
        const ownerName = String(result.ownerName || '').trim();
        const message = ownerName
          ? `当前由 ${ownerName} 正在录分`
          : String(result.message || '当前有人正在录分');
        wx.showToast({ title: message, icon: 'none' });
      }
      if (typeof ctx.tryBatchSkipOnOccupied === 'function') ctx.tryBatchSkipOnOccupied();
      return;
    }
    if (kind === 'finished') {
      setLockState('finished', result);
      if (!options.silent) wx.showToast({ title: String(result.message || '该场已结束'), icon: 'none' });
      return;
    }
    if (kind === 'canceled') {
      setLockState('finished', result);
      if (!options.silent) wx.showToast({ title: String(result.message || '该场已结束'), icon: 'none' });
      return;
    }
    if (kind === 'forbidden') {
      setLockState('forbidden', result);
      if (!options.silent) wx.showToast({ title: String(result.message || '仅管理员或参赛成员可录分'), icon: 'none' });
      return;
    }
    if (kind === 'expired') {
      setLockState('idle', result);
      if (!options.silent) wx.showToast({ title: '录分会话已过期，请重新开始录分', icon: 'none' });
      return;
    }
    if (kind === 'released') {
      setLockState('idle', result);
      return;
    }
    setLockState('idle', result);
  }

  function teardown(options = {}) {
    stopLockHeartbeat();
    stopLockCountdown();
    stopAutoPoll();
    lockRequestVersion += 1;
    lockSessionId = '';
    ctx._lockStatusKey = '';
    if (options.resetState) {
      setLockState('idle', {}, { skipApply: true });
    }
  }

  return {
    buildScoreLockPayload,
    isCurrentLockSession,
    setLockState,
    syncLockStatus,
    heartbeatLock,
    releaseLockIfOwned,
    applyScoreLockResult,
    startLockCountdown,
    stopLockCountdown,
    startLockHeartbeat,
    stopLockHeartbeat,
    teardown
  };
}

module.exports = {
  LOCK_HEARTBEAT_MS,
  LOCK_AUTOPOLL_MS,
  LOCK_RELEASE_RETRY_DELAY_MS,
  createMatchLockController
};
