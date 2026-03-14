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
    const url = navApi.buildTournamentUrl('/pages/schedule/index', tid);
    if (delay > 0) {
      scheduleNavigation(() => navApi.redirectOrBack(url, 0), delay);
      return;
    }
    if (typeof ctx.isPageActive === 'function' && !ctx.isPageActive()) return;
    navApi.redirectOrBack(url, 0);
  }

  function extractMatchScore(match) {
    const source = match && typeof match === 'object' ? match : {};
    const score = source.score && typeof source.score === 'object' ? source.score : source;
    const scoreA = clampScore(score.teamA ?? source.teamAScore ?? source.scoreA ?? source.a);
    const scoreB = clampScore(score.teamB ?? source.teamBScore ?? source.scoreB ?? source.b);
    return { scoreA, scoreB };
  }

  function findCurrentMatch(tournamentDoc) {
    const rounds = Array.isArray(tournamentDoc && tournamentDoc.rounds) ? tournamentDoc.rounds : [];
    const round = rounds.find((item) => Number(item && item.roundIndex) === Number(ctx.data.roundIndex));
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    return matches.find((item) => Number(item && item.matchIndex) === Number(ctx.data.matchIndex)) || null;
  }

  function allMatchesFinished(rounds) {
    for (const round of (rounds || [])) {
      for (const match of (round && round.matches) || []) {
        const status = String((match && match.status) || '').trim();
        if (status !== 'finished' && status !== 'canceled') return false;
      }
    }
    return true;
  }

  function buildLocalSubmittedTournament(scoreA, scoreB, lockSnapshot, result = {}) {
    const currentTournament = ctx._latestTournament || (ctx.data && ctx.data.tournament) || null;
    if (!currentTournament || typeof currentTournament !== 'object') return null;

    const nextTournament = JSON.parse(JSON.stringify(currentTournament));
    const rounds = Array.isArray(nextTournament.rounds) ? nextTournament.rounds : [];
    const round = rounds.find((item) => Number(item && item.roundIndex) === Number(ctx.data.roundIndex));
    if (!round) return null;
    const matches = Array.isArray(round.matches) ? round.matches : [];
    const match = matches.find((item) => Number(item && item.matchIndex) === Number(ctx.data.matchIndex));
    if (!match) return null;

    delete match.teamAScore;
    delete match.teamBScore;
    delete match.scoreA;
    delete match.scoreB;
    delete match.a;
    delete match.b;
    match.score = { teamA: scoreA, teamB: scoreB };
    match.status = 'finished';
    match.scorerId = String(lockSnapshot.ownerId || ctx.data.lockOwnerId || '').trim();
    match.scorerName = String((result && result.scorerName) || lockSnapshot.ownerName || ctx.data.lockOwnerName || '').trim();
    match.scoredAt = new Date().toISOString();

    const resultVersion = Number(result && result.version) || 0;
    const currentVersion = Number(nextTournament.version) || 0;
    if (resultVersion > 0) nextTournament.version = Math.max(currentVersion, resultVersion);
    nextTournament.status = allMatchesFinished(rounds) ? 'finished' : 'running';
    nextTournament.updatedAtTs = Date.now();
    nextTournament.rounds = rounds;
    return nextTournament;
  }

  function applyCommittedTournament(tournamentDoc) {
    if (!tournamentDoc || typeof tournamentDoc !== 'object') return null;
    const updatedAt = syncStatus.pickTournamentTimestamp(tournamentDoc) || Date.now();
    ctx._latestTournament = tournamentDoc;
    ctx._lastAppliedDocTs = Math.max(Number(ctx._lastAppliedDocTs || 0), updatedAt);
    ctx.setData(pageTournamentSync.composePageSyncPatch(ctx, {
      loadError: false,
      showStaleSyncHint: false,
      syncRefreshing: false,
      syncUsingCache: false,
      syncCachedAt: 0,
      syncLastUpdatedAt: updatedAt
    }));
    ctx.applyTournament(tournamentDoc, { skipLockSync: true });
    return tournamentDoc;
  }

  function isSubmittedMatch(tournamentDoc, scoreA, scoreB) {
    const match = findCurrentMatch(tournamentDoc);
    if (!match) return false;
    if (String(match.status || '').trim() !== 'finished') return false;
    const current = extractMatchScore(match);
    return Number(current.scoreA) === Number(scoreA) && Number(current.scoreB) === Number(scoreB);
  }

  async function tryRecoverSubmittedResult(scoreA, scoreB) {
    const latest = await refreshTournamentDoc();
    if (isSubmittedMatch(latest, scoreA, scoreB)) return latest;
    return null;
  }

  async function finalizeSubmitSuccess(result, lockSnapshot, options = {}) {
    const scoreA = clampScore(ctx.data.scoreA);
    const scoreB = clampScore(ctx.data.scoreB);
    const resolvedTournament = options.tournamentDoc || await refreshTournamentDoc();
    if (!isSubmittedMatch(resolvedTournament, scoreA, scoreB)) {
      const localCommitted = buildLocalSubmittedTournament(
        scoreA,
        scoreB,
        lockSnapshot,
        result
      );
      if (localCommitted) applyCommittedTournament(localCommitted);
    }
  }

  async function jumpToNextPending(tournamentDoc, noPendingMessage, forceBatch = false) {
    const nt = normalizeTournament(tournamentDoc || {});
    const next = matchFlowApi.findNextPending(nt.rounds, Number(ctx.data.roundIndex), Number(ctx.data.matchIndex));
    if (!next) {
      wx.showToast({ title: noPendingMessage || '已全部录完', icon: 'none' });
      returnToSchedule(420);
      return;
    }

    navApi.redirectOrNavigate(navApi.buildTournamentUrl('/pages/match/index', ctx.data.tournamentId, {
      roundIndex: next.roundIndex,
      matchIndex: next.matchIndex,
      batch: forceBatch ? 1 : ''
    }));
  }

  async function refreshTournamentDoc() {
    const tournamentId = String(ctx.data.tournamentId || '').trim();
    if (!tournamentId) return null;
    if (typeof ctx.fetchTournament === 'function') {
      return ctx.fetchTournament(tournamentId);
    }
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

  function restoreLockAfterSubmitFail(snapshot, options = {}) {
    const snap = snapshot || {};
    const nowTs = Date.now();
    const expireAt = Number(snap.expireAt) || 0;
    const forceExpired = options.forceExpired === true;
    if (forceExpired || (expireAt > 0 && expireAt <= nowTs)) {
      ctx.lockController.applyScoreLockResult({
        ok: false,
        code: 'LOCK_EXPIRED',
        message: '录分会话已过期，请重新开始录分',
        state: 'expired',
        expireAt
      }, {
        silent: options.silent === true
      });
      return;
    }
    ctx.lockController.setLockState('locked_by_me', {
      ownerId: snap.ownerId,
      ownerName: snap.ownerName,
      expireAt,
      remainingMs: Math.max(0, expireAt - nowTs)
    });
  }

  function handleSubmitResultCode(res, lockSnapshot, options = {}) {
    const code = String((res && res.code) || '').trim().toUpperCase();
    const retrySubmit = typeof options.retrySubmit === 'function' ? options.retrySubmit : null;
    if (code === 'LOCK_OCCUPIED') {
      ctx.lockController.applyScoreLockResult({ ...res, state: 'occupied' });
      return true;
    }
    if (code === 'LOCK_EXPIRED') {
      restoreLockAfterSubmitFail(lockSnapshot, { forceExpired: true });
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
      ctx.setLastFailedAction('提交比分', () => {
        if (retrySubmit) return retrySubmit();
        return submit();
      }, {
        actionKey: `match:submitScore:${ctx.data.tournamentId}:${ctx.data.roundIndex}:${ctx.data.matchIndex}`
      });
      ctx.handleWriteError(res, '提交失败', () => ctx.fetchTournament(ctx.data.tournamentId));
      return true;
    }
    return false;
  }

  async function submit(options = {}) {
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
    const clientRequestId = String(options.clientRequestId || '').trim() || buildClientRequestId();
    const actionKey = `match:submitScore:${ctx.data.tournamentId}:${ctx.data.roundIndex}:${ctx.data.matchIndex}`;
    if (actionGuard.isBusy(actionKey)) return;

    return actionGuard.runWithPageBusy(ctx, 'submitBusy', actionKey, async () => {
      const retrySubmit = () => submit({ clientRequestId });
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
          if (handleSubmitResultCode(res, lockSnapshot, { retrySubmit })) return;
          restoreLockAfterSubmitFail(lockSnapshot);
          wx.showToast({ title: String(res.message || '提交失败'), icon: 'none' });
          return;
        }

        await finalizeSubmitSuccess(res, lockSnapshot);
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
        const parsed = typeof cloudApi.parseCloudError === 'function'
          ? cloudApi.parseCloudError(err, '提交失败')
          : null;
        if (parsed && parsed.isNetwork) {
          const recovered = await tryRecoverSubmittedResult(scoreA, scoreB);
          if (recovered) {
            await finalizeSubmitSuccess({
              ok: true,
              scorerName: lockSnapshot.ownerName
            }, lockSnapshot, { tournamentDoc: recovered });
            ctx.clearLastFailedAction();
            ctx.matchDraft.clearScoreDraft();
            ctx.matchDraft.clearUndo();
            ctx.lockController.setLockState('finished', {
              ownerId: lockSnapshot.ownerId,
              ownerName: String(lockSnapshot.ownerName || '')
            });
            wx.showToast({ title: '已提交', icon: 'success' });
            navApi.markRefreshFlag(ctx.data.tournamentId);
            return;
          }
        }
        restoreLockAfterSubmitFail(lockSnapshot);
        ctx.setLastFailedAction('提交比分', retrySubmit, { actionKey });
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
