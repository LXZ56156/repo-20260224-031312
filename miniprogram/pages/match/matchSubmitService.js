const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const pageTournamentSync = require('../../core/pageTournamentSync');
const syncStatus = require('../../core/syncStatus');
const storage = require('../../core/storage');
const tournamentSync = require('../../core/tournamentSync');
const matchFlow = require('../../core/matchFlow');
const nav = require('../../core/nav');
const { normalizeTournament } = require('../../core/normalize');
const { clampScore, buildClientRequestId } = require('./matchViewModel');

const SCORE_AUTO_RETURN_KEY = 'score_auto_return';
const SCORE_AUTO_NEXT_KEY = 'score_auto_next';

function createMatchSubmitService(ctx, deps = {}) {
  const cloudApi = deps.cloud || cloud;
  const storageApi = deps.storage || storage;
  const tournamentSyncApi = deps.tournamentSync || tournamentSync;
  const matchFlowApi = deps.matchFlow || matchFlow;
  const navApi = deps.nav || nav;

  function scheduleNavigation(fn, delay = 0) {
    if (typeof fn !== 'function') return null;
    const wait = Math.max(0, Number(delay) || 0);
    if (wait <= 0) {
      if (typeof ctx.isPageActive === 'function' && !ctx.isPageActive()) return null;
      return fn();
    }
    if (typeof ctx.registerNavTimer === 'function') {
      return ctx.registerNavTimer(fn, wait);
    }
    return setTimeout(() => {
      if (typeof ctx.isPageActive === 'function' && !ctx.isPageActive()) return;
      fn();
    }, wait);
  }

  function returnToSchedule(delay = 0) {
    const tid = String(ctx.data.tournamentId || '').trim();
    if (!tid) return;
    const url = `/pages/schedule/index?tournamentId=${tid}`;
    if (delay > 0) {
      scheduleNavigation(() => navApi.redirectOrBack(url, 0), delay);
      return;
    }
    if (typeof ctx.isPageActive === 'function' && !ctx.isPageActive()) return;
    navApi.redirectOrBack(url, 0);
  }

  async function jumpToNextPending(tournamentDoc, noPendingMessage, forceBatch = false) {
    const nt = normalizeTournament(tournamentDoc || {});
    const next = matchFlowApi.findNextPending(nt.rounds, Number(ctx.data.roundIndex), Number(ctx.data.matchIndex));
    if (!next) {
      wx.showToast({ title: noPendingMessage || '已全部录完', icon: 'none' });
      returnToSchedule(420);
      return;
    }

    wx.redirectTo({
      url: `/pages/match/index?tournamentId=${ctx.data.tournamentId}&roundIndex=${next.roundIndex}&matchIndex=${next.matchIndex}${forceBatch ? '&batch=1' : ''}`
    });
  }

  async function refreshTournamentDoc() {
    const tournamentId = String(ctx.data.tournamentId || '').trim();
    if (!tournamentId) return null;
    const requestSeq = typeof ctx.nextFetchSeq === 'function' ? ctx.nextFetchSeq() : 0;
    const result = await tournamentSyncApi.fetchTournament(tournamentId);
    if (requestSeq && typeof ctx.isLatestFetchSeq === 'function' && !ctx.isLatestFetchSeq(requestSeq)) {
      return null;
    }
    if (result && result.ok && result.doc) {
      ctx.setData(pageTournamentSync.composePageSyncPatch(ctx, {
        loadError: false,
        showStaleSyncHint: false,
        syncRefreshing: false,
        syncUsingCache: false,
        syncCachedAt: 0,
        syncLastUpdatedAt: syncStatus.pickTournamentTimestamp(result.doc) || Number(ctx.data.syncLastUpdatedAt || 0) || 0
      }));
      ctx.applyTournament(result.doc, { requestSeq });
      return result.doc;
    }
    if (result && result.cachedDoc) {
      ctx.setData(pageTournamentSync.composePageSyncPatch(ctx, {
        loadError: false,
        showStaleSyncHint: true,
        syncRefreshing: false,
        syncUsingCache: true,
        syncCachedAt: Number(result.cachedAt || 0) || 0,
        syncLastUpdatedAt: syncStatus.pickTournamentTimestamp(result.cachedDoc) || Number(ctx.data.syncLastUpdatedAt || 0) || 0
      }));
      ctx.applyTournament(result.cachedDoc, { requestSeq });
      return result.cachedDoc;
    }
    return null;
  }

  async function jumpAfterBatch(noPendingMessage) {
    const latest = await refreshTournamentDoc();
    if (latest) {
      await jumpToNextPending(latest, noPendingMessage, true);
      return true;
    }
    wx.showToast({ title: '同步失败，请稍后重试', icon: 'none' });
    return false;
  }

  function restoreLockAfterSubmitFail(snapshot) {
    const snap = snapshot || {};
    ctx.lockController.setLockState('locked_by_me', {
      ownerId: snap.ownerId,
      ownerName: snap.ownerName,
      expireAt: snap.expireAt,
      remainingMs: Math.max(0, Number(snap.expireAt) - Date.now())
    });
  }

  function handleSubmitResultCode(res, lockSnapshot) {
    const code = String((res && res.code) || '').trim().toUpperCase();
    if (code === 'LOCK_OCCUPIED') {
      ctx.lockController.applyScoreLockResult({ ...res, state: 'occupied' });
      return true;
    }
    if (code === 'LOCK_EXPIRED') {
      ctx.lockController.applyScoreLockResult({ ...res, state: 'expired' });
      return true;
    }
    if (code === 'MATCH_FINISHED') {
      ctx.lockController.setLockState('finished', res);
      if (ctx.data.batchMode) {
        scheduleNavigation(() => jumpAfterBatch('该场已录完，已跳到下一场'), 160);
      } else {
        refreshTournamentDoc();
      }
      return true;
    }
    if (code === 'PERMISSION_DENIED') {
      ctx.lockController.setLockState('forbidden', res);
      wx.showToast({ title: String(res.message || '无权限录分'), icon: 'none' });
      return true;
    }
    if (code === 'VERSION_CONFLICT') {
      restoreLockAfterSubmitFail(lockSnapshot);
      ctx.setLastFailedAction('提交比分', () => submit());
      ctx.handleWriteError(res, '提交失败', () => ctx.fetchTournament(ctx.data.tournamentId));
      return true;
    }
    return false;
  }

  async function submit() {
    const scoreA = clampScore(ctx.data.scoreA);
    const scoreB = clampScore(ctx.data.scoreB);
    if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB) || scoreA < 0 || scoreB < 0) {
      wx.showToast({ title: '请输入合法比分', icon: 'none' });
      return;
    }

    if (ctx.data.batchMode && ctx.data.match && ctx.data.match.status === 'finished') {
      await jumpAfterBatch('该场已录入，已跳到下一场');
      return;
    }

    if (!ctx.data.canEdit) {
      if (ctx.data.lockState === 'locked_by_other') {
        ctx.tryBatchSkipOnOccupied();
        if (!ctx.data.batchMode) wx.showToast({ title: '当前有人正在录分', icon: 'none' });
        return;
      }
      if (ctx.data.userCanScore && ctx.data.lockState === 'idle') {
        wx.showToast({ title: '请先点击“开始录分”', icon: 'none' });
        return;
      }
      wx.showToast({ title: '当前不可录分', icon: 'none' });
      return;
    }

    const lockSnapshot = {
      ownerId: ctx.data.lockOwnerId,
      ownerName: ctx.data.lockOwnerName,
      expireAt: ctx.data.lockExpireAt
    };
    const clientRequestId = buildClientRequestId();
    const actionKey = `match:submitScore:${ctx.data.tournamentId}:${ctx.data.roundIndex}:${ctx.data.matchIndex}`;
    if (actionGuard.isBusy(actionKey)) return;

    return actionGuard.runWithPageBusy(ctx, 'submitBusy', actionKey, async () => {
      ctx.lockController.setLockState('submitting', lockSnapshot, { skipApply: true });
      wx.showLoading({ title: '提交中...' });
      try {
        const res = await cloudApi.call('submitScore', {
          tournamentId: ctx.data.tournamentId,
          roundIndex: ctx.data.roundIndex,
          matchIndex: ctx.data.matchIndex,
          scoreA,
          scoreB,
          clientRequestId
        });

        if (res && res.ok === false) {
          if (handleSubmitResultCode(res, lockSnapshot)) return;
          restoreLockAfterSubmitFail(lockSnapshot);
          wx.showToast({ title: String(res.message || '提交失败'), icon: 'none' });
          return;
        }

        await refreshTournamentDoc();

        ctx.clearLastFailedAction();
        ctx.matchDraft.clearScoreDraft();
        ctx.matchDraft.clearUndo();
        ctx.lockController.setLockState('finished', {
          ownerId: lockSnapshot.ownerId,
          ownerName: String((res && res.scorerName) || lockSnapshot.ownerName || '')
        });
        wx.showToast({ title: '已提交', icon: 'success' });
        navApi.markRefreshFlag(ctx.data.tournamentId);

        if (ctx.data.batchMode) {
          scheduleNavigation(() => {
            jumpAfterBatch('已全部录完');
          }, 260);
          return;
        }

        const autoNext = storageApi.get(SCORE_AUTO_NEXT_KEY, true) !== false;
        const autoReturn = storageApi.get(SCORE_AUTO_RETURN_KEY, true) !== false;
        if (autoNext) {
          scheduleNavigation(async () => {
            const latestDoc = await refreshTournamentDoc();
            if (latestDoc) {
              await jumpToNextPending(latestDoc, '已全部录完', false);
              return;
            }
            if (autoReturn) returnToSchedule(420);
          }, 260);
          return;
        }
        if (autoReturn) returnToSchedule(420);
      } catch (err) {
        restoreLockAfterSubmitFail(lockSnapshot);
        ctx.setLastFailedAction('提交比分', () => submit());
        ctx.handleWriteError(err, '提交失败', () => ctx.fetchTournament(ctx.data.tournamentId));
      } finally {
        wx.hideLoading();
      }
    });
  }

  return {
    returnToSchedule,
    jumpToNextPending,
    refreshTournamentDoc,
    jumpAfterBatch,
    restoreLockAfterSubmitFail,
    handleSubmitResultCode,
    submit
  };
}

module.exports = {
  createMatchSubmitService
};
