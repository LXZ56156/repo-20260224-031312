const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');
const actionGuard = require('../miniprogram/core/actionGuard');
const storage = require('../miniprogram/core/storage');

const analyticsPagePath = require.resolve('../miniprogram/pages/analytics/index.js');

function loadAnalyticsPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[analyticsPagePath];
  require(analyticsPagePath);
  global.Page = originalPage;
  return definition;
}

function createAnalyticsPageContext(definition) {
  const ctx = {
    data: {
      tournamentId: 't_1'
    },
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    clearLastFailedAction() {},
    setLastFailedAction() {}
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('analytics clone action is guarded against repeated taps', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalIsBusy = actionGuard.isBusy;
  const originalRun = actionGuard.run;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;

  let releaseCall;
  const calls = [];

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast() {},
    navigateTo() {}
  };

  try {
    const definition = loadAnalyticsPageDefinition();
    const ctx = createAnalyticsPageContext(definition);

    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      await new Promise((resolve) => {
        releaseCall = resolve;
      });
      return { tournamentId: 't_2' };
    };
    actionGuard.isBusy = originalIsBusy;
    actionGuard.run = originalRun;
    storage.addRecentTournamentId = () => {};

    const first = ctx.cloneCurrentTournament();
    const second = ctx.cloneCurrentTournament();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'cloneTournament');
    assert.equal(calls[0].payload.sourceTournamentId, 't_1');
    assert.match(String(calls[0].payload.clientRequestId || ''), /^clone_/);

    releaseCall();
    await Promise.all([first, second]);

    assert.equal(calls.length, 1);
  } finally {
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    actionGuard.isBusy = originalIsBusy;
    actionGuard.run = originalRun;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    delete require.cache[analyticsPagePath];
  }
});
