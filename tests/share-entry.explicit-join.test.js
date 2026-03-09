const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');
const nav = require('../miniprogram/core/nav');
const profileCore = require('../miniprogram/core/profile');
const tournamentSync = require('../miniprogram/core/tournamentSync');

const shareEntryPagePath = require.resolve('../miniprogram/pages/share-entry/index.js');

function loadShareEntryPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[shareEntryPagePath];
  require(shareEntryPagePath);
  global.Page = originalPage;
  return definition;
}

function createShareEntryPageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

function buildTournament() {
  return {
    _id: 't_1',
    name: '周末比赛',
    status: 'draft',
    creatorId: 'u_admin',
    mode: 'multi_rotate',
    players: [{ id: 'u_admin', name: '组织者' }],
    rankings: [],
    rounds: []
  };
}

test('share-entry only joins after explicit primary action tap', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalCloudCall = cloud.call;
  const originalEnsureProfileForAction = profileCore.ensureProfileForAction;
  const originalFetchTournament = tournamentSync.fetchTournament;
  const originalStartWatch = tournamentSync.startWatch;
  const originalMarkRefreshFlag = nav.markRefreshFlag;

  const calls = [];

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast() {},
    navigateTo() {}
  };
  global.getApp = () => ({
    globalData: { openid: 'u_viewer' }
  });

  cloud.call = async (name, payload) => {
    calls.push({ name, payload });
    return { ok: true, added: true };
  };
  profileCore.ensureProfileForAction = async () => ({
    ok: true,
    profile: {
      nickName: '新球友',
      avatar: '',
      gender: 'unknown'
    }
  });
  tournamentSync.fetchTournament = async () => ({
    ok: true,
    source: 'remote',
    doc: buildTournament()
  });
  tournamentSync.startWatch = () => {};
  nav.markRefreshFlag = () => {};

  try {
    const definition = loadShareEntryPageDefinition();
    const ctx = createShareEntryPageContext(definition);

    ctx.onLoad({ tournamentId: 't_1' });
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(calls.filter((item) => item.name === 'joinTournament').length, 0);
    assert.equal(ctx.data.preview.primaryAction.text, '加入比赛');

    await ctx.onPrimaryAction();

    const joinCalls = calls.filter((item) => item.name === 'joinTournament');
    assert.equal(joinCalls.length, 1);
    assert.equal(joinCalls[0].payload.tournamentId, 't_1');
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    cloud.call = originalCloudCall;
    profileCore.ensureProfileForAction = originalEnsureProfileForAction;
    tournamentSync.fetchTournament = originalFetchTournament;
    tournamentSync.startWatch = originalStartWatch;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    delete require.cache[shareEntryPagePath];
  }
});
