const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');
const tournamentSync = require('../miniprogram/core/tournamentSync');
const storage = require('../miniprogram/core/storage');
const nav = require('../miniprogram/core/nav');

const matchPagePath = require.resolve('../miniprogram/pages/match/index.js');

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
  return ctx;
}

test('match submitBusy prevents repeated submit requests and sends clientRequestId', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalCloudCall = cloud.call;
  const originalFetchTournament = tournamentSync.fetchTournament;
  const originalStorageGet = storage.get;
  const originalMarkRefreshFlag = nav.markRefreshFlag;

  global.wx = {
    showLoading() {},
    hideLoading() {},
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

    const payloads = [];
    let releaseCall;
    cloud.call = async (name, payload) => {
      assert.equal(name, 'submitScore');
      payloads.push(payload);
      await new Promise((resolve) => {
        releaseCall = resolve;
      });
      return { ok: true, scorerName: '裁判A' };
    };
    tournamentSync.fetchTournament = async () => ({ _id: 't_1', rounds: [] });
    storage.get = () => false;
    nav.markRefreshFlag = () => {};

    const first = ctx.submit();
    assert.equal(ctx.data.submitBusy, true);
    const second = ctx.submit();

    assert.equal(payloads.length, 1);
    assert.match(String(payloads[0].clientRequestId || ''), /^submit_/);

    releaseCall();
    await Promise.all([first, second]);

    assert.equal(payloads.length, 1);
    assert.equal(ctx.data.submitBusy, false);
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    cloud.call = originalCloudCall;
    tournamentSync.fetchTournament = originalFetchTournament;
    storage.get = originalStorageGet;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    delete require.cache[matchPagePath];
  }
});
