const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');
const actionGuard = require('../miniprogram/core/actionGuard');
const storage = require('../miniprogram/core/storage');

const rankingPagePath = require.resolve('../miniprogram/pages/ranking/index.js');

function loadRankingPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[rankingPagePath];
  require(rankingPagePath);
  global.Page = originalPage;
  return definition;
}

function createRankingPageContext(definition) {
  const ctx = {
    data: { tournamentId: 't_1', showMoreActions: true },
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

test('ranking clone action is guarded against repeated taps', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
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
    const definition = loadRankingPageDefinition();
    const ctx = createRankingPageContext(definition);
    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      await new Promise((resolve) => { releaseCall = resolve; });
      return { tournamentId: 't_2' };
    };
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
    actionGuard.clear('ranking:cloneTournament:t_1');
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    delete require.cache[rankingPagePath];
  }
});
