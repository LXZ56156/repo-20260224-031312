const test = require('node:test');
const assert = require('node:assert/strict');

const { createMatchSubmitService } = require('../miniprogram/pages/match/matchSubmitService');
const { buildLockHint, buildTournamentViewState } = require('../miniprogram/pages/match/matchViewModel');

function buildPendingTournament() {
  return {
    _id: 't_1',
    name: '周末比赛',
    status: 'running',
    version: 1,
    players: [
      { id: 'user_1', name: '裁判A' },
      { id: 'u2', name: '球友B' },
      { id: 'u3', name: '球友C' },
      { id: 'u4', name: '球友D' }
    ],
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        status: 'pending',
        teamA: [{ id: 'user_1', name: '裁判A' }, { id: 'u2', name: '球友B' }],
        teamB: [{ id: 'u3', name: '球友C' }, { id: 'u4', name: '球友D' }]
      }]
    }]
  };
}

function buildFinishedTournament(scoreA = 21, scoreB = 18) {
  return {
    ...buildPendingTournament(),
    status: 'finished',
    version: 2,
    updatedAt: '2026-03-14T11:00:00.000Z',
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        status: 'finished',
        teamA: [{ id: 'user_1', name: '裁判A' }, { id: 'u2', name: '球友B' }],
        teamB: [{ id: 'u3', name: '球友C' }, { id: 'u4', name: '球友D' }],
        score: { teamA: scoreA, teamB: scoreB },
        scorerId: 'user_1',
        scorerName: '裁判A'
      }]
    }]
  };
}

function createCtx(overrides = {}) {
  const toastCalls = [];
  const ctx = {
    data: {
      tournamentId: 't_1',
      roundIndex: 0,
      matchIndex: 0,
      scoreA: 21,
      scoreB: 18,
      canEdit: true,
      userCanScore: true,
      batchMode: false,
      match: { status: 'pending' },
      lockState: 'locked_by_me',
      lockOwnerId: 'user_1',
      lockOwnerName: '裁判A',
      lockExpireAt: Date.now() + 60_000,
      syncLastUpdatedAt: 0
    },
    _latestTournament: buildPendingTournament(),
    _lastAppliedDocTs: 0,
    _draft: { scoreA: 21, scoreB: 18 },
    _retryAction: null,
    _writeErrors: [],
    _clearDraftCount: 0,
    _clearUndoCount: 0,
    _lockStates: [],
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    applyTournament(tournament) {
      const viewState = buildTournamentViewState(tournament, {
        tournamentId: this.data.tournamentId,
        roundIndex: this.data.roundIndex,
        matchIndex: this.data.matchIndex,
        openid: 'user_1',
        lockState: this.data.lockState,
        currentScoreA: this.data.scoreA,
        currentScoreB: this.data.scoreB,
        draft: this.matchDraft.getScoreDraft(),
        undoSize: 0
      });
      this._latestTournament = viewState.tournament;
      this.data = { ...this.data, ...(viewState.data || {}) };
    },
    fetchTournament: async () => null,
    clearLastFailedAction() {
      this._retryAction = null;
    },
    setLastFailedAction(_text, action) {
      this._retryAction = action;
    },
    handleWriteError(err) {
      this._writeErrors.push(err);
    },
    matchDraft: {
      getScoreDraft() {
        return ctx._draft;
      },
      saveScoreDraft(scoreA, scoreB) {
        ctx._draft = { scoreA, scoreB };
      },
      clearScoreDraft() {
        ctx._draft = null;
        ctx._clearDraftCount += 1;
      },
      clearUndo() {
        ctx._clearUndoCount += 1;
      }
    },
    lockController: {
      setLockState(state, payload = {}) {
        ctx._lockStates.push(state);
        ctx.data.lockState = state;
        ctx.data.lockOwnerId = String(payload.ownerId || '');
        ctx.data.lockOwnerName = String(payload.ownerName || '');
        ctx.data.lockExpireAt = Number(payload.expireAt) || 0;
      },
      applyScoreLockResult(result = {}) {
        ctx._lockStates.push(String(result.state || 'idle'));
        ctx.data.lockState = String(result.state || 'idle') === 'expired' ? 'idle' : String(result.state || 'idle');
        ctx.applyTournament(ctx._latestTournament);
      }
    },
    registerNavTimer() {
      throw new Error('unexpected navigation timer');
    }
  };
  return Object.assign(ctx, overrides);
}

async function submitProjectedScore({ pointsPerGame = 21, scoreA, scoreB,
  mode = 'singles_round_robin', renderedTournament, legacyOnly = false }) {
  const originalWx = global.wx;
  const toasts = [];
  const requests = [];
  let loadingCount = 0;
  global.wx = {
    showLoading() { loadingCount += 1; }, hideLoading() {},
    showToast(payload) { toasts.push(payload); }
  };
  try {
    const ctx = createCtx();
    ctx._draft = { scoreA, scoreB };
    Object.assign(ctx.data, { scoreA, scoreB });
    if (renderedTournament !== undefined) ctx.data.tournament = renderedTournament;
    const tournament = { ...buildPendingTournament(), mode, rules: { pointsPerGame } };
    if (mode === 'singles_round_robin') {
      tournament.players = tournament.players.slice(0, 2);
      tournament.rounds[0].matches[0].teamA = [tournament.players[0]];
      tournament.rounds[0].matches[0].teamB = [tournament.players[1]];
    }
    // Use the production view-state producer through the same apply seam as the
    // existing recovery tests. Its render patch does not carry the full document.
    ctx.applyTournament(tournament);
    assert.equal(ctx.data.canEdit, true);
    assert.equal(ctx._latestTournament.mode, mode);
    assert.equal(ctx._latestTournament.rules.pointsPerGame, pointsPerGame);
    if (renderedTournament === undefined) {
      assert.equal(Object.hasOwn(ctx.data, 'tournament'), false);
    } else assert.deepEqual(ctx.data.tournament, renderedTournament);
    if (legacyOnly) ctx._latestTournament = null;
    const service = createMatchSubmitService(ctx, {
      cloud: { async call(name, payload) {
        requests.push({ name, ...payload });
        // Stop after observing a valid dispatch; no success navigation/timer is
        // needed to prove local score validation or its effect on the lock.
        return { ok: false, code: 'LOCK_EXPIRED', state: 'expired' };
      } }
    });
    await service.submit();
    return { ctx, toasts, requests, loadingCount };
  } finally { global.wx = originalWx; }
}

for (const [pointsPerGame, scoreA, scoreB, valid] of [
  [21, 0, 0, false], [21, 21, 20, false], [21, 30, 30, false], [21, 31, 29, false],
  [21, 21, 19, true], [21, 22, 20, true], [21, 30, 29, true],
  [11, 11, 11, false], [11, 12, 10, false], [11, 10, 9, false], [11, 11, 10, true],
  [15, 15, 15, false], [15, 16, 14, false], [15, 14, 13, false], [15, 15, 14, true]
]) {
  test(`match submit consumes production singles projection for ${pointsPerGame}-point ${scoreA}:${scoreB}`, async () => {
    const result = await submitProjectedScore({ pointsPerGame, scoreA, scoreB });
    assert.equal(result.requests.length, valid ? 1 : 0);
    if (valid) {
      assert.equal(result.requests[0].name, 'submitScore');
      assert.deepEqual([result.requests[0].scoreA, result.requests[0].scoreB], [scoreA, scoreB]);
    } else {
      assert.equal(result.loadingCount, 0);
      assert.deepEqual(result.ctx._lockStates, []);
      assert.equal(result.ctx._clearDraftCount, 0);
      assert.deepEqual(result.ctx._draft, { scoreA, scoreB });
      assert.equal(result.toasts.at(-1).title, pointsPerGame === 21
        ? '21 分单局：20 平后领先 2 分，30 分封顶，不接受平局'
        : `${pointsPerGame} 分单局：先到 ${pointsPerGame} 分即胜，不接受平局`);
    }
  });
}

test('match submit uses authoritative singles rules ahead of stale rendered rules', async () => {
  const result = await submitProjectedScore({ pointsPerGame: 11, scoreA: 11, scoreB: 10,
    renderedTournament: { mode: 'singles_round_robin', rules: { pointsPerGame: 21 } } });
  assert.equal(result.requests.length, 1);
});

test('match submit retains legacy tournament fallback when the authoritative document is absent', async () => {
  const result = await submitProjectedScore({ pointsPerGame: 15, scoreA: 15, scoreB: 15, legacyOnly: true,
    renderedTournament: { mode: 'singles_round_robin', rules: { pointsPerGame: 15 } } });
  assert.equal(result.requests.length, 0);
  assert.equal(result.toasts.at(-1).title, '15 分单局：先到 15 分即胜，不接受平局');
});

test('match submit keeps doubles local dispatch semantics after production projection', async () => {
  const result = await submitProjectedScore({ mode: 'multi_rotate', scoreA: 0, scoreB: 0 });
  assert.equal(result.requests.length, 1);
});

test('match submit does not apply stale singles validation to authoritative doubles', async () => {
  const result = await submitProjectedScore({ mode: 'multi_rotate', scoreA: 21, scoreB: 20,
    renderedTournament: { mode: 'singles_round_robin', rules: { pointsPerGame: 21 } } });
  assert.equal(result.requests.length, 1);
});

test('match submit retry reuses the same clientRequestId after a network failure', async () => {
  const originalWx = global.wx;
  const payloads = [];
  let callCount = 0;

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast(payload) {
      payloads.push({ type: 'toast', payload });
    }
  };

  try {
    const ctx = createCtx();
    ctx.lockController.buildScoreLockPayload = () => ({ lockSessionId: 'session-submit-retry' });
    const requestIds = [];
    const service = createMatchSubmitService(ctx, {
      cloud: {
        async call(_name, payload) {
          assert.equal(payload.lockSessionId, 'session-submit-retry');
          requestIds.push(payload.clientRequestId);
          callCount += 1;
          if (callCount === 1) throw new Error('network timeout');
          return { ok: true, scorerName: '裁判A', version: 2 };
        },
        parseCloudError() {
          return { isNetwork: true };
        }
      },
      storage: {
        get(key, fallback) {
          if (key === 'score_auto_next' || key === 'score_auto_return') return false;
          return fallback;
        }
      },
      nav: {
        markRefreshFlag() {},
        buildTournamentUrl(path, tournamentId, query = {}) {
          return `${path}?tournamentId=${tournamentId}&roundIndex=${query.roundIndex || 0}&matchIndex=${query.matchIndex || 0}`;
        },
        redirectOrBack() {},
        redirectOrNavigate() {}
      }
    });

    await service.submit();
    assert.equal(typeof ctx._retryAction, 'function');
    assert.equal(ctx._writeErrors.length, 1);
    assert.equal(ctx._clearDraftCount, 0);

    await ctx._retryAction();

    assert.equal(requestIds.length, 2);
    assert.equal(requestIds[0], requestIds[1]);
    assert.equal(ctx._writeErrors.length, 1);
    assert.equal(ctx._clearDraftCount, 1);
    assert.equal(ctx._clearUndoCount, 1);
  } finally {
    global.wx = originalWx;
  }
});

test('match submit treats network timeout as success when refreshed tournament already contains the submitted score', async () => {
  const originalWx = global.wx;
  const toastCalls = [];
  const scheduled = [];
  const redirectCalls = [];

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast(payload) {
      toastCalls.push(payload);
    }
  };

  try {
    const ctx = createCtx({
      fetchTournament: async () => buildFinishedTournament(21, 18),
      registerNavTimer(fn, delay) {
        scheduled.push({ fn, delay });
        return scheduled.length;
      }
    });
    const service = createMatchSubmitService(ctx, {
      cloud: {
        async call() {
          throw new Error('network timeout');
        },
        parseCloudError() {
          return { isNetwork: true };
        }
      },
      storage: {
        get(key, fallback) {
          if (key === 'score_auto_next') return false;
          if (key === 'score_auto_return') return true;
          return fallback;
        }
      },
      nav: {
        markRefreshFlag() {},
        buildTournamentUrl(path, tournamentId, query = {}) {
          return `${path}?tournamentId=${tournamentId}&roundIndex=${query.roundIndex || 0}&matchIndex=${query.matchIndex || 0}`;
        },
        redirectOrBack(url, delay) {
          redirectCalls.push({ url, delay });
        },
        redirectOrNavigate() {}
      }
    });

    await service.submit();

    assert.equal(ctx._writeErrors.length, 0);
    assert.equal(ctx._retryAction, null);
    assert.equal(ctx._clearDraftCount, 1);
    assert.equal(ctx._clearUndoCount, 1);
    assert.ok(ctx._lockStates.includes('finished'));
    assert.equal(toastCalls.some((item) => item.title === '已提交'), true);
    assert.deepEqual(scheduled.map((item) => item.delay), [420]);
    assert.deepEqual(redirectCalls, []);

    scheduled[0].fn();

    assert.deepEqual(redirectCalls, [{
      url: '/pages/schedule/index?tournamentId=t_1&roundIndex=0&matchIndex=0',
      delay: 0
    }]);
  } finally {
    global.wx = originalWx;
  }
});

test('match view state keeps local draft visible after lock expiry so the user can reacquire and retry', () => {
  const viewState = buildTournamentViewState(buildPendingTournament(), {
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    openid: 'user_1',
    lockState: 'idle',
    currentScoreA: 0,
    currentScoreB: 0,
    draft: { scoreA: 21, scoreB: 18 },
    undoSize: 0
  });

  assert.equal(viewState.data.canEdit, false);
  assert.equal(viewState.data.hasScoreDraft, true);
  assert.equal(viewState.data.displayScoreA, '21');
  assert.equal(viewState.data.displayScoreB, '18');
});

test('match view state shows finished scores as editable only after acquiring a lock', () => {
  const readonlyState = buildTournamentViewState(buildFinishedTournament(21, 18), {
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    openid: 'user_1',
    lockState: 'idle',
    currentScoreA: 0,
    currentScoreB: 0,
    draft: { scoreA: 22, scoreB: 20 },
    undoSize: 0
  });

  assert.equal(readonlyState.data.canEdit, false);
  assert.equal(readonlyState.data.lockActionText, '修改比分');
  assert.equal(readonlyState.data.lockHintText, '点击“修改比分”即可进入录分');
  assert.equal(readonlyState.data.canUseScoreLock, true);
  assert.equal(readonlyState.shouldSyncLock, true);
  assert.equal(readonlyState.shouldClearDraft, false);
  assert.equal(readonlyState.data.displayScoreA, '21');
  assert.equal(readonlyState.data.displayScoreB, '18');

  const editState = buildTournamentViewState(buildFinishedTournament(21, 18), {
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    openid: 'user_1',
    lockState: 'locked_by_me',
    currentScoreA: 21,
    currentScoreB: 18,
    draft: { scoreA: 22, scoreB: 20 },
    undoSize: 1
  });

  assert.equal(editState.data.canEdit, true);
  assert.equal(editState.data.lockActionText, '修改比分');
  assert.equal(Object.hasOwn(editState.data, 'lockHintText'), false);
  assert.equal(editState.data.scoreA, 22);
  assert.equal(editState.data.scoreB, 20);
  assert.equal(editState.data.displayScoreA, '22');
  assert.equal(editState.data.displayScoreB, '20');
  assert.equal(editState.data.canUndo, true);
});

test('match view state keeps pending CTA and canceled matches readonly', () => {
  const pendingState = buildTournamentViewState(buildPendingTournament(), {
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    openid: 'user_1',
    lockState: 'idle'
  });

  assert.equal(pendingState.data.lockActionText, '开始录分');
  assert.equal(pendingState.data.lockHintText, '点击“开始录分”即可进入录分');
  assert.equal(pendingState.data.canUseScoreLock, true);

  const canceledTournament = buildFinishedTournament(21, 18);
  canceledTournament.rounds[0].matches[0].status = 'canceled';
  const canceledState = buildTournamentViewState(canceledTournament, {
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    openid: 'user_1',
    lockState: 'idle',
    draft: { scoreA: 22, scoreB: 20 }
  });

  assert.equal(canceledState.data.canEdit, false);
  assert.equal(canceledState.data.canUseScoreLock, false);
  assert.equal(canceledState.shouldSyncLock, false);
  assert.equal(canceledState.shouldClearDraft, true);
  assert.equal(canceledState.data.matchStatusText, '已取消');
  assert.equal(Object.hasOwn(canceledState.data, 'lockHintText'), false);
});

test('finished match idle instructions follow the current CTA without replacing lock or permission hints', () => {
  const options = {
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    openid: 'user_1'
  };
  const resetState = buildTournamentViewState(buildFinishedTournament(), {
    ...options, lockState: 'finished'
  });
  assert.equal(resetState.lockTransition, 'idle');
  assert.equal(resetState.data.lockHintText, '点击“修改比分”即可进入录分');
  for (const state of ['locked_by_me', 'locked_by_other', 'submitting']) {
    const viewState = buildTournamentViewState(buildFinishedTournament(), {
      ...options, lockState: state
    });
    assert.equal(Object.hasOwn(viewState.data, 'lockHintText'), false);
    assert.equal(buildLockHint(state, '裁判B', 5000, '修改比分'), buildLockHint(state, '裁判B', 5000));
  }
  const forbiddenState = buildTournamentViewState(buildFinishedTournament(), {
    ...options, openid: 'spectator', lockState: 'idle'
  });
  assert.equal(forbiddenState.lockTransition, 'forbidden');
  assert.equal(forbiddenState.data.canEdit, false);
  assert.equal(Object.hasOwn(forbiddenState.data, 'lockHintText'), false);
  assert.equal(buildLockHint('forbidden', '', 0, '修改比分'), '仅管理员或参赛成员可录分');
});

test('match submit can recover from lock expiry after reacquiring lock and retrying submit', async () => {
  const originalWx = global.wx;
  const toastCalls = [];
  let submitCalls = 0;

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast(payload) {
      toastCalls.push(payload);
    }
  };

  try {
    const ctx = createCtx();
    const service = createMatchSubmitService(ctx, {
      cloud: {
        async call(_name, payload) {
          submitCalls += 1;
          assert.match(String(payload.clientRequestId || ''), /^submit_/);
          if (submitCalls === 1) {
            return {
              ok: false,
              code: 'LOCK_EXPIRED',
              message: '录分会话已过期，请重新开始录分',
              state: 'expired'
            };
          }
          return { ok: true, scorerName: '裁判A', version: 2 };
        },
        parseCloudError() {
          return { isNetwork: false };
        }
      },
      storage: {
        get(key, fallback) {
          if (key === 'score_auto_next' || key === 'score_auto_return') return false;
          return fallback;
        }
      },
      nav: {
        markRefreshFlag() {},
        buildTournamentUrl(path, tournamentId, query = {}) {
          return `${path}?tournamentId=${tournamentId}&roundIndex=${query.roundIndex || 0}&matchIndex=${query.matchIndex || 0}`;
        },
        redirectOrBack() {},
        redirectOrNavigate() {}
      }
    });

    await service.submit();

    assert.equal(submitCalls, 1);
    assert.equal(ctx.data.lockState, 'idle');
    assert.equal(ctx._clearDraftCount, 0);
    assert.equal(ctx._retryAction, null);
    assert.deepEqual(ctx._draft, { scoreA: 21, scoreB: 18 });

    ctx.lockController.setLockState('locked_by_me', {
      ownerId: 'user_1',
      ownerName: '裁判A',
      expireAt: Date.now() + 60_000
    });
    ctx.applyTournament(ctx._latestTournament);

    await service.submit();

    assert.equal(submitCalls, 2);
    assert.equal(ctx.data.lockState, 'finished');
    assert.equal(ctx._clearDraftCount, 1);
    assert.equal(ctx._clearUndoCount, 1);
    assert.equal(ctx._retryAction, null);
    assert.equal(ctx._latestTournament && ctx._latestTournament.status, 'finished');
    assert.equal(toastCalls.some((item) => item.title === '已提交'), true);
  } finally {
    global.wx = originalWx;
  }
});

test('match submit absorbs MATCH_CANCELED without falling into generic write error flow', async () => {
  const originalWx = global.wx;
  const toastCalls = [];
  let submitCalls = 0;

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast(payload) {
      toastCalls.push(payload);
    }
  };

  try {
    const ctx = createCtx();
    const service = createMatchSubmitService(ctx, {
      cloud: {
        async call() {
          submitCalls += 1;
          return {
            ok: false,
            code: 'MATCH_CANCELED',
            message: '该场已结束',
            state: 'canceled'
          };
        },
        parseCloudError() {
          return { isNetwork: false };
        }
      },
      storage: {
        get(key, fallback) {
          if (key === 'score_auto_next' || key === 'score_auto_return') return false;
          return fallback;
        }
      },
      nav: {
        markRefreshFlag() {},
        buildTournamentUrl(path, tournamentId, query = {}) {
          return `${path}?tournamentId=${tournamentId}&roundIndex=${query.roundIndex || 0}&matchIndex=${query.matchIndex || 0}`;
        },
        redirectOrBack() {},
        redirectOrNavigate() {}
      }
    });

    await service.submit();

    assert.equal(submitCalls, 1);
    assert.equal(ctx.data.lockState, 'finished');
    assert.equal(ctx._writeErrors.length, 0);
    assert.equal(ctx._retryAction, null);
    assert.equal(ctx._clearDraftCount, 0);
    assert.equal(toastCalls.length, 0);
  } finally {
    global.wx = originalWx;
  }
});



async function submitWithInterleavedDocument(t, { resultVersion = 2, fetch, call } = {}) {
  const previousWx = global.wx;
  global.wx = { showLoading() {}, hideLoading() {}, showToast() {} };
  t.after(() => { global.wx = previousWx; });
  const ctx = createCtx();
  if (fetch) ctx.fetchTournament = () => fetch(ctx);
  const service = createMatchSubmitService(ctx, {
    cloud: { call: () => call ? call(ctx) : Promise.resolve({ ok: true, version: resultVersion }) },
    storage: { get: () => false },
    nav: { markRefreshFlag() {} }
  });
  await service.submit();
  return ctx;
}

function correctedTournament(version = 3) {
  const doc = buildFinishedTournament(18, 21);
  doc.version = version;
  Object.assign(doc.rounds[0].matches[0], { scorerId: 'u2', scorerName: '裁判B' });
  return doc;
}

function assertAuthoritativeScore(ctx, expected) {
  const actual = ctx._latestTournament;
  const match = actual.rounds[0].matches[0];
  const expectedMatch = expected.rounds[0].matches[0];
  assert.equal(actual.version, expected.version);
  assert.equal(actual.status, expected.status);
  assert.deepEqual(match.score, expectedMatch.score);
  assert.equal(match.scorerId, expectedMatch.scorerId);
  assert.equal(match.scorerName, expectedMatch.scorerName);
  assert.equal(match.scoredAt, expectedMatch.scoredAt);
}

test('late submit response preserves a newer authoritative correction returned by refresh', async (t) => {
  const newer = correctedTournament();
  const ctx = await submitWithInterleavedDocument(t, { fetch: async () => newer });
  assertAuthoritativeScore(ctx, newer);
  assert.equal(ctx._writeErrors.length, 0);
  assert.equal(ctx._clearDraftCount, 1);
});

test('late submit response preserves the watch correction when refresh fails', async (t) => {
  const newer = correctedTournament();
  const ctx = await submitWithInterleavedDocument(t, {
    call: async (page) => { page.applyTournament(newer); return { ok: true, version: 2 }; },
    fetch: async () => null
  });
  assertAuthoritativeScore(ctx, newer);
  assert.equal(ctx._latestTournament.version, 3);
});

test('submit compensation uses the dispatched score when refresh changed the score inputs', async (t) => {
  const ctx = await submitWithInterleavedDocument(t, {
    call: async (page) => { page.setData({ scoreA: 10, scoreB: 9 }); return { ok: true, version: 2 }; }
  });
  assert.deepEqual(ctx._latestTournament.rounds[0].matches[0].score, { teamA: 21, teamB: 18 });
  assert.equal(ctx._latestTournament.version, 2);
});

test('successful submit compensates an older snapshot even when refresh rejects', async (t) => {
  const ctx = await submitWithInterleavedDocument(t, { fetch: async () => { throw new Error('refresh unavailable'); } });
  assert.deepEqual(ctx._latestTournament.rounds[0].matches[0].score, { teamA: 21, teamB: 18 });
  assert.equal(ctx._latestTournament.version, 2);
  assert.equal(ctx._writeErrors.length, 0);
  assert.equal(ctx._clearDraftCount, 1);
});

test('equal-version authoritative correction and versionless success are never overwritten', async (t) => {
  const equal = correctedTournament(2);
  const ctx = await submitWithInterleavedDocument(t, { fetch: async () => equal });
  assertAuthoritativeScore(ctx, equal);
  const unknown = await submitWithInterleavedDocument(t, { resultVersion: null, fetch: async () => equal });
  assertAuthoritativeScore(unknown, equal);
});

test('a watch correction arriving during refresh survives an older refresh result', async (t) => {
  const newer = correctedTournament(4);
  const ctx = await submitWithInterleavedDocument(t, {
    fetch: async (page) => { page.applyTournament(newer); return buildFinishedTournament(); }
  });
  assertAuthoritativeScore(ctx, newer);
});

test('versionless success with failed refresh does not invent a confirmed score', async (t) => {
  const ctx = await submitWithInterleavedDocument(t, { resultVersion: null });
  assert.equal(ctx._latestTournament.version, 1);
  assert.equal(ctx._latestTournament.rounds[0].matches[0].status, 'pending');
  assert.equal(ctx._writeErrors.length, 0);
});
