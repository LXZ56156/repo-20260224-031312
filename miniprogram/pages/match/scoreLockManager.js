const actionGuard = require('../../core/actionGuard');
const cloud = require('../../core/cloud');
const writeErrorUi = require('../../core/writeErrorUi');
const { createMatchLockController } = require('./matchLockController');
const { createMatchSubmitService } = require('./matchSubmitService');

function createScoreLockManager(ctx, deps = {}) {
  const cloudApi = deps.cloud || cloud;
  const lockController = createMatchLockController(ctx, deps.lockController || {});
  ctx.lockController = lockController;

  const submitService = createMatchSubmitService(ctx, deps.submitService || {});
  ctx.submitService = submitService;

  function buildLockActionKey(action) {
    const tournamentId = String((ctx && ctx.data && ctx.data.tournamentId) || '').trim();
    const roundIndex = Number(ctx && ctx.data && ctx.data.roundIndex);
    const matchIndex = Number(ctx && ctx.data && ctx.data.matchIndex);
    return `match:scoreLock:${tournamentId}:${roundIndex}:${matchIndex}:${String(action || '').trim() || 'status'}`;
  }

  async function acquireLock(force = false) {
    const actionKey = buildLockActionKey(force ? 'takeover' : 'acquire');
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.runWithPageBusy(ctx, 'lockBusy', actionKey, async () => {
      try {
        const payload = lockController.buildScoreLockPayload('acquire', force);
        const res = await cloudApi.call('scoreLock', payload);
        if (!lockController.isCurrentLockSession(payload.lockSessionId)) {
          const resultSessionId = String((res && (res.lockSessionId || (res.data && res.data.lockSessionId))) || '').trim();
          const resultState = String((res && res.state) || '').trim().toLowerCase();
          if (res && res.ok === true && resultState === 'acquired' && resultSessionId === payload.lockSessionId) {
            await cloudApi.call('scoreLock', { ...payload, action: 'release' }, { retry: false }).catch(() => {});
          }
          return;
        }
        lockController.applyScoreLockResult(res);
      } catch (err) {
        if (typeof ctx.isPageActive === 'function' && !ctx.isPageActive()) return;
        writeErrorUi.presentWriteError({ err, fallbackMessage: force ? '接管失败' : '开始录分失败' });
      }
    });
  }

  async function refreshLockStatus() {
    const actionKey = buildLockActionKey('status');
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.runWithPageBusy(ctx, 'lockBusy', actionKey, async () => {
      await lockController.syncLockStatus(false);
    });
  }

  return {
    lockController,
    submitService,
    acquireLock,
    refreshLockStatus,

    buildScoreLockPayload(...args) {
      return lockController.buildScoreLockPayload(...args);
    },
    setLockState(...args) {
      return lockController.setLockState(...args);
    },
    syncLockStatus(...args) {
      return lockController.syncLockStatus(...args);
    },
    heartbeatLock(...args) {
      return lockController.heartbeatLock(...args);
    },
    releaseLockIfOwned(...args) {
      return lockController.releaseLockIfOwned(...args);
    },
    applyScoreLockResult(...args) {
      return lockController.applyScoreLockResult(...args);
    },
    clearLockTimers(...args) {
      return lockController.teardown(...args);
    },

    returnToSchedule(...args) {
      return submitService.returnToSchedule(...args);
    },
    jumpToNextPending(...args) {
      return submitService.jumpToNextPending(...args);
    },
    refreshTournamentDoc(...args) {
      return submitService.refreshTournamentDoc(...args);
    },
    jumpAfterBatch(...args) {
      return submitService.jumpAfterBatch(...args);
    },
    restoreLockAfterSubmitFail(...args) {
      return submitService.restoreLockAfterSubmitFail(...args);
    },
    handleSubmitResultCode(...args) {
      return submitService.handleSubmitResultCode(...args);
    },
    submit(...args) {
      return submitService.submit(...args);
    },

    teardown(options = {}) {
      lockController.teardown(options);
    }
  };
}

module.exports = {
  createScoreLockManager
};
