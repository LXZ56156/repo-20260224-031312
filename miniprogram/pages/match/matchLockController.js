const cloud = require('../../core/cloud');
const { normalizeLockState, buildLockHint } = require('./matchViewModel');

const LOCK_HEARTBEAT_MS = 15 * 1000;
const LOCK_AUTOPOLL_MS = 5 * 1000;

function createMatchLockController(ctx, deps = {}) {
  const cloudApi = deps.cloud || cloud;
  const setIntervalFn = deps.setIntervalFn || setInterval;
  const clearIntervalFn = deps.clearIntervalFn || clearInterval;
  let heartbeatTimer = null;
  let countdownTimer = null;
  let autoPollTimer = null;

  function buildScoreLockPayload(action, force = false) {
    return {
      action,
      tournamentId: ctx.data.tournamentId,
      roundIndex: ctx.data.roundIndex,
      matchIndex: ctx.data.matchIndex,
      force: !!force
    };
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

  function setLockState(state, payload = {}, options = {}) {
    const lockState = normalizeLockState(state);
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
    if (!ctx.data.userCanScore || !match || status === 'finished' || status === 'canceled') return;
    try {
      const res = await cloudApi.call('scoreLock', buildScoreLockPayload('status'));
      applyScoreLockResult(res, { silent });
    } catch (err) {
      if (!silent) wx.showToast({ title: cloudApi.getUnifiedErrorMessage(err, '同步状态失败'), icon: 'none' });
    }
  }

  async function heartbeatLock() {
    if (ctx.data.lockState !== 'locked_by_me') return;
    try {
      const res = await cloudApi.call('scoreLock', buildScoreLockPayload('heartbeat'));
      applyScoreLockResult(res, { silent: true, fromHeartbeat: true });
    } catch (_) {
      // 心跳失败不立刻中断编辑，下一次交互时再校验
    }
  }

  async function releaseLockIfOwned(force = false) {
    if (ctx.data.lockState !== 'locked_by_me' && !force) return;
    try {
      await cloudApi.call('scoreLock', buildScoreLockPayload('release', force));
    } catch (_) {
      // ignore
    }
  }

  function applyScoreLockResult(res, options = {}) {
    const result = res && typeof res === 'object' ? res : {};
    const state = String(result.state || '').trim();
    if (result.ok === true && state === 'acquired') {
      setLockState('locked_by_me', result);
      return;
    }
    if (state === 'occupied') {
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
    if (state === 'finished') {
      setLockState('finished', result);
      if (!options.silent) wx.showToast({ title: String(result.message || '该场已结束'), icon: 'none' });
      return;
    }
    if (state === 'forbidden') {
      setLockState('forbidden', result);
      if (!options.silent) wx.showToast({ title: String(result.message || '仅管理员或参赛成员可录分'), icon: 'none' });
      return;
    }
    if (state === 'expired') {
      setLockState('idle', result);
      if (!options.silent) wx.showToast({ title: '录分会话已过期，请重新开始录分', icon: 'none' });
      return;
    }
    if (state === 'released') {
      setLockState('idle', result);
      return;
    }
    setLockState('idle', result);
  }

  function teardown(options = {}) {
    stopLockHeartbeat();
    stopLockCountdown();
    stopAutoPoll();
    ctx._lockStatusKey = '';
    if (options.resetState) {
      setLockState('idle', {}, { skipApply: true });
    }
  }

  return {
    buildScoreLockPayload,
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
  createMatchLockController
};
