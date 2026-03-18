const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');
const cloud = require('../miniprogram/core/cloud');
const tournamentSync = require('../miniprogram/core/tournamentSync');
const storage = require('../miniprogram/core/storage');
const nav = require('../miniprogram/core/nav');

const matchPagePath = require.resolve('../miniprogram/pages/match/index.js');

function installFakeTimers() {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const queue = [];
  const active = new Set();

  global.setTimeout = (fn, delay) => {
    const handle = { fn, delay };
    active.add(handle);
    queue.push(handle);
    return handle;
  };
  global.clearTimeout = (handle) => {
    active.delete(handle);
  };

  return {
    async flushAll() {
      while (queue.length) {
        const handle = queue.shift();
        if (!active.has(handle)) continue;
        active.delete(handle);
        await handle.fn();
      }
    },
    restore() {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  };
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
  const busyTransitions = [];
  const ctx = {
    data: {
      tournamentId: 't_1',
      roundIndex: 0,
      matchIndex: 0,
      scoreA: 21,
      scoreB: 18,
      canEdit: true,
      batchMode: false,
      userCanScore: true,
      match: { status: 'pending' },
      lockState: 'locked_by_me',
      lockOwnerId: 'user_1',
      lockOwnerName: '裁判A',
      lockExpireAt: Date.now() + 60 * 1000,
      submitBusy: false
    },
    _undoStack: [],
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
      if (Object.prototype.hasOwnProperty.call(update || {}, 'submitBusy')) {
        busyTransitions.push(this.data.submitBusy);
      }
    }
  };

  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }

  ctx.applyTournament = () => {};
  ctx.clearLastFailedAction = () => {};
  ctx.clearScoreDraft = () => {};
  ctx.fetchTournament = async () => null;
  ctx.handleWriteError = () => {};
  ctx.jumpAfterBatch = async () => false;
  ctx.jumpToNextPending = async () => {};
  ctx.restoreLockAfterSubmitFail = () => {};
  ctx.returnToSchedule = () => {};
  ctx.setLastFailedAction = () => {};
  ctx.setLockState = () => {};
  ctx.__busyTransitions = busyTransitions;
  return ctx;
}

test('match submit stays guarded after timeout while first request is still pending', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalCloudCall = cloud.call;
  const originalFetchTournament = tournamentSync.fetchTournament;
  const originalStorageGet = storage.get;
  const originalMarkRefreshFlag = nav.markRefreshFlag;

  const loadingEvents = [];
  const cloudCalls = [];
  const releases = [];
  let loadingVisible = false;
  let hideWithoutVisibleError = null;

  global.wx = {
    showLoading(options = {}) {
      loadingEvents.push(`show:${String(options.title || '')}`);
      loadingVisible = true;
    },
    hideLoading() {
      loadingEvents.push('hide');
      if (!loadingVisible) {
        hideWithoutVisibleError = new Error('hideLoading called without visible loading');
        throw hideWithoutVisibleError;
      }
      loadingVisible = false;
    },
    showToast() {},
    redirectTo() {},
    navigateTo() {},
    navigateBack(options = {}) {
      if (typeof options.fail === 'function') options.fail();
    },
    getStorageSync() {
      return undefined;
    },
    setStorageSync() {},
    removeStorageSync() {}
  };
  global.getApp = () => ({
    globalData: {
      openid: 'user_1',
      networkOffline: false
    }
  });

  try {
    const definition = loadMatchPageDefinition();
    const ctx = createMatchPageContext(definition);

    cloud.call = async (name, payload) => {
      assert.equal(name, 'submitScore');
      cloudCalls.push(payload);
      return new Promise((resolve) => {
        releases.push(resolve);
      });
    };
    tournamentSync.fetchTournament = async () => ({ ok: true, doc: { _id: 't_1', rounds: [] }, source: 'remote' });
    storage.get = () => false;
    nav.markRefreshFlag = () => {};

    const first = ctx.submit();
    assert.equal(ctx.data.submitBusy, true);
    assert.equal(cloudCalls.length, 1);

    await timers.flushAll();

    assert.equal(ctx.data.submitBusy, true);
    assert.equal(actionGuard.isBusy('match:submitScore:t_1:0:0'), true);

    const second = ctx.submit();
    assert.equal(typeof second.then, 'function');
    assert.equal(ctx.data.submitBusy, true);
    assert.equal(cloudCalls.length, 1);
    assert.equal(await second, undefined);

    releases.shift()({ ok: true, scorerName: '裁判A' });
    await first;

    assert.equal(ctx.data.submitBusy, false);
    assert.deepEqual(ctx.__busyTransitions, [true, false]);
    assert.deepEqual(loadingEvents, [
      'show:提交中...',
      'hide'
    ]);
    assert.equal(hideWithoutVisibleError, null);
  } finally {
    while (releases.length) {
      releases.shift()({ ok: true, scorerName: '裁判A' });
    }
    actionGuard.clear('match:submitScore:t_1:0:0');
    timers.restore();
    global.wx = originalWx;
    global.getApp = originalGetApp;
    cloud.call = originalCloudCall;
    tournamentSync.fetchTournament = originalFetchTournament;
    storage.get = originalStorageGet;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    delete require.cache[matchPagePath];
  }
});
