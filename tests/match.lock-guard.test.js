const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');

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
      ...(definition.data || {}),
      tournamentId: 't_1',
      roundIndex: 0,
      matchIndex: 0,
      match: { status: 'pending' },
      userCanScore: true,
      canEdit: false,
      batchMode: false,
      isAdmin: true,
      lockBusy: false
    },
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };

  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }

  return ctx;
}

test('match score lock acquire is guarded against repeated taps', async () => {
  const originalCloudCall = cloud.call;
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  let releaseCall = null;
  const payloads = [];

  global.wx = {
    showToast() {},
    showLoading() {},
    hideLoading() {},
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
      assert.equal(name, 'scoreLock');
      payloads.push(payload);
      await new Promise((resolve) => {
        releaseCall = resolve;
      });
      return {
        ok: true,
        state: 'acquired',
        ownerId: 'user_1',
        ownerName: '裁判A',
        expireAt: Date.now() + 60 * 1000,
        remainingMs: 60 * 1000
      };
    };

    const first = ctx.onStartScoring();
    const second = ctx.onStartScoring();

    assert.equal(payloads.length, 1);
    assert.equal(ctx.data.lockBusy, true);

    releaseCall();
    await Promise.all([first, second]);

    assert.equal(payloads.length, 1);
    assert.equal(ctx.data.lockState, 'locked_by_me');
    assert.equal(ctx.data.lockBusy, false);
    ctx.clearLockTimers();
  } finally {
    cloud.call = originalCloudCall;
    global.wx = originalWx;
    global.getApp = originalGetApp;
    delete require.cache[matchPagePath];
  }
});
