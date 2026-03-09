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

test('match page clears delayed navigation timers on hide to prevent ghost redirects', async () => {
  const definition = loadMatchPageDefinition();
  const ctx = createMatchPageContext(definition);
  let fired = false;

  ctx._pageActive = true;
  ctx._navTimers = new Set();
  ctx.registerNavTimer(() => {
    fired = true;
  }, 20);

  ctx.onHide();
  await wait(40);

  assert.equal(fired, false);
  assert.equal(ctx._navTimers.size, 0);

  delete require.cache[matchPagePath];
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
      nextRequestSeq() {
        return 1;
      },
      isLatestRequestSeq() {
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
