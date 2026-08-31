const test = require('node:test');
const assert = require('node:assert/strict');

const { createMatchSubmitService } = require('../miniprogram/pages/match/matchSubmitService');

const matchPagePath = require.resolve('../miniprogram/pages/match/index.js');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadMatchPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[matchPagePath];
  require(matchPagePath);
  global.Page = originalPage;
  return definition;
}

function createMatchPageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx.matchDraft = {
    clearUndo() {},
    teardown() {}
  };
  ctx.lockController = {
    releaseLockIfOwned() {
      return Promise.resolve();
    },
    teardown() {}
  };
  ctx.submitService = {};
  return ctx;
}

test('match page cancels occupied batch skip and restores its retry key on hide', async () => {
  const originalWx = global.wx;
  const definition = loadMatchPageDefinition();
  const ctx = createMatchPageContext(definition);
  let fired = false;

  global.wx = { showToast() {} };

  try {
    ctx.data.batchMode = true;
    ctx.data.tournamentId = 't_1';
    ctx.data.roundIndex = 0;
    ctx.data.matchIndex = 1;
    ctx._pageActive = true;
    ctx._navTimers = new Set();
    ctx.jumpAfterBatch = () => {
      fired = true;
    };

    ctx.tryBatchSkipOnOccupied();
    ctx.onHide();
    await wait(220);

    assert.equal(fired, false);
    assert.equal(ctx._navTimers.size, 0);
    assert.equal(ctx._batchOccupiedKey, '');
  } finally {
    global.wx = originalWx;
    delete require.cache[matchPagePath];
  }
});

test('match page allows occupied batch skip to retry after navigation refresh fails', async () => {
  const originalWx = global.wx;
  const definition = loadMatchPageDefinition();
  const ctx = createMatchPageContext(definition);
  const scheduled = [];
  let jumpCalls = 0;

  global.wx = { showToast() {} };

  try {
    ctx.data.batchMode = true;
    ctx.data.tournamentId = 't_1';
    ctx.data.roundIndex = 0;
    ctx.data.matchIndex = 1;
    ctx._batchOccupiedKey = '';
    ctx.registerNavTimer = (fn) => {
      scheduled.push(fn);
      return scheduled.length;
    };
    ctx.jumpAfterBatch = async () => {
      jumpCalls += 1;
      return false;
    };

    ctx.tryBatchSkipOnOccupied();
    await scheduled[0]();
    ctx.tryBatchSkipOnOccupied();
    await scheduled[1]();

    assert.equal(jumpCalls, 2);
    assert.equal(ctx._batchOccupiedKey, '');
  } finally {
    global.wx = originalWx;
    delete require.cache[matchPagePath];
  }
});

test('match batch jump does not revive after the page hides and shows during refresh', async () => {
  const originalWx = global.wx;
  let resolveRefresh;
  let pageActive = true;
  let toastCalls = 0;
  let navCalls = 0;

  global.wx = {
    showToast() {
      toastCalls += 1;
    }
  };

  try {
    const ctx = {
      _pageLifecycleSeq: 0,
      data: {
        tournamentId: 't_1',
        roundIndex: 0,
        matchIndex: 1
      },
      isPageActive() {
        return pageActive;
      },
      fetchTournament() {
        return new Promise((resolve) => {
          resolveRefresh = resolve;
        });
      }
    };
    const service = createMatchSubmitService(ctx, {
      matchFlow: {
        findNextPending() {
          return { roundIndex: 1, matchIndex: 0 };
        }
      },
      nav: {
        buildTournamentUrl() {
          return '/pages/match/index?tournamentId=t_1';
        },
        redirectOrNavigate() {
          navCalls += 1;
        }
      }
    });

    const jumpTask = service.jumpAfterBatch('已全部录完');
    pageActive = false;
    ctx._pageLifecycleSeq += 1;
    pageActive = true;
    resolveRefresh({ _id: 't_1', rounds: [] });

    assert.equal(await jumpTask, false);
    assert.equal(navCalls, 0);
    assert.equal(toastCalls, 0);
  } finally {
    global.wx = originalWx;
  }
});

test('match submit service uses page navigation timers for delayed post-submit redirects', async () => {
  const originalWx = global.wx;
  const scheduled = [];
  const navCalls = [];

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast() {},
    redirectTo() {},
    navigateTo() {},
    navigateBack() {}
  };

  try {
    const ctx = {
      data: {
        tournamentId: 't_1',
        roundIndex: 0,
        matchIndex: 0,
        scoreA: 21,
        scoreB: 18,
        batchMode: false,
        canEdit: true,
        match: { status: 'pending' },
        lockState: 'locked_by_me',
        lockOwnerId: 'user_1',
        lockOwnerName: '裁判A',
        lockExpireAt: Date.now() + 60 * 1000
      },
      setData() {},
      isPageActive() {
        return true;
      },
      registerNavTimer(fn, delay) {
        scheduled.push(delay);
        return { fn, delay };
      },
      nextFetchSeq() {
        return 1;
      },
      isLatestFetchSeq() {
        return true;
      },
      applyTournament() {},
      clearLastFailedAction() {},
      fetchTournament() {},
      setLastFailedAction() {},
      handleWriteError() {},
      matchDraft: {
        clearScoreDraft() {},
        clearUndo() {}
      },
      lockController: {
        setLockState() {},
        applyScoreLockResult() {}
      }
    };

    const service = createMatchSubmitService(ctx, {
      cloud: {
        async call() {
          return { ok: true, scorerName: '裁判A' };
        }
      },
      tournamentSync: {
        async fetchTournament() {
          return {
            ok: true,
            doc: {
              _id: 't_1',
              status: 'running',
              players: [],
              rounds: []
            }
          };
        }
      },
      storage: {
        get(key, fallback) {
          if (key === 'score_auto_next') return false;
          if (key === 'score_auto_return') return true;
          return fallback;
        }
      },
      matchFlow: {
        findNextPending() {
          return null;
        }
      },
      nav: {
        markRefreshFlag() {},
        buildTournamentUrl(path, tournamentId, query = {}) {
          const entries = Object.entries({ tournamentId, ...(query || {}) })
            .filter(([, value]) => value !== undefined && value !== null && String(value) !== '');
          return `${path}?${entries.map(([key, value]) => `${key}=${value}`).join('&')}`;
        },
        redirectOrBack(url, delay) {
          navCalls.push({ url, delay });
        }
      }
    });

    await service.submit();

    assert.deepEqual(scheduled, [420]);
    assert.deepEqual(navCalls, []);
  } finally {
    global.wx = originalWx;
    delete require.cache[matchPagePath];
  }
});
