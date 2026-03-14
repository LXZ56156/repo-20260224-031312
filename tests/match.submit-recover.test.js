const test = require('node:test');
const assert = require('node:assert/strict');

const { createMatchSubmitService } = require('../miniprogram/pages/match/matchSubmitService');
const { buildTournamentViewState } = require('../miniprogram/pages/match/matchViewModel');

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
    const requestIds = [];
    const service = createMatchSubmitService(ctx, {
      cloud: {
        async call(_name, payload) {
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

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast(payload) {
      toastCalls.push(payload);
    }
  };

  try {
    const ctx = createCtx({
      fetchTournament: async () => buildFinishedTournament(21, 18)
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

    assert.equal(ctx._writeErrors.length, 0);
    assert.equal(ctx._retryAction, null);
    assert.equal(ctx._clearDraftCount, 1);
    assert.equal(ctx._clearUndoCount, 1);
    assert.ok(ctx._lockStates.includes('finished'));
    assert.equal(toastCalls.some((item) => item.title === '已提交'), true);
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
  assert.equal(viewState.data.displayScoreA, '21');
  assert.equal(viewState.data.displayScoreB, '18');
});
