const test = require('node:test');
const assert = require('node:assert/strict');

const {
  loadPageDefinition,
  createPageContext
} = require('./timeout-reentry.helpers');

const actionGuard = require('../miniprogram/core/actionGuard');
const cloud = require('../miniprogram/core/cloud');
const nav = require('../miniprogram/core/nav');
const profileCore = require('../miniprogram/core/profile');

const launchPagePath = require.resolve('../miniprogram/pages/launch/index.js');
const createPagePath = require.resolve('../miniprogram/pages/create/index.js');

function installWxStub(overrides = {}) {
  const calls = {
    navigateTo: [],
    redirectTo: [],
    toast: []
  };
  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast(options = {}) {
      calls.toast.push(options);
    },
    navigateTo(options = {}) {
      calls.navigateTo.push(options);
    },
    redirectTo(options = {}) {
      calls.redirectTo.push(options);
    },
    ...overrides
  };
  return calls;
}

test('launch fixed rotation card navigates with multi_rotate mode and presetKey', async () => {
  const originalWx = global.wx;
  const originalEnsureProfile = profileCore.ensureProfileForAction;
  const calls = installWxStub();

  try {
    profileCore.ensureProfileForAction = async () => ({ ok: true, profile: {} });
    const definition = loadPageDefinition(launchPagePath);
    const ctx = createPageContext(definition);

    await ctx.onStart({
      currentTarget: {
        dataset: {
          mode: 'multi_rotate',
          presetKey: 'rotation_7'
        }
      }
    });

    assert.equal(calls.navigateTo.length, 1);
    assert.match(calls.navigateTo[0].url, /\/pages\/create\/index\?mode=multi_rotate&presetKey=rotation_7/);
  } finally {
    global.wx = originalWx;
    profileCore.ensureProfileForAction = originalEnsureProfile;
    delete require.cache[launchPagePath];
  }
});

test('create page keeps fixed rotation label and sends presetKey to createTournament', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalEnsureProfile = profileCore.ensureProfileForAction;
  const originalCloudCall = cloud.call;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;
  const calls = installWxStub();
  let createPayload = null;

  global.getApp = () => ({
    globalData: { networkOffline: false },
    subscribeNetworkChange() {
      return () => {};
    }
  });

  try {
    profileCore.ensureProfileForAction = async () => ({
      ok: true,
      profile: { nickName: '发起人', avatar: 'cloud://avatar/create', gender: 'male' }
    });
    cloud.call = async (name, payload) => {
      assert.equal(name, 'createTournament');
      createPayload = payload;
      return { ok: true, tournamentId: 't_rotation_8' };
    };
    nav.buildTournamentUrl = (path, tournamentId, query = {}) => {
      const suffix = Object.entries(query).map(([key, value]) => `${key}=${value}`).join('&');
      return `${path}?tournamentId=${tournamentId}${suffix ? `&${suffix}` : ''}`;
    };

    const definition = loadPageDefinition(createPagePath);
    const ctx = createPageContext(definition);
    await ctx.onLoad({ mode: 'multi_rotate', presetKey: 'rotation_8' });

    assert.equal(ctx.data.mode, 'multi_rotate');
    assert.equal(ctx.data.presetKey, 'rotation_8');
    assert.equal(ctx.data.modeLabel, '8人转');
    assert.equal(ctx.data.name, '8人转');
    assert.equal(ctx.data.canEditTournamentName, false);
    assert.match(ctx.data.createFlowSteps.join('\n'), /邀请或导入至 8 人/);

    ctx.onName({ detail: { value: '周末自定义' } });
    await ctx.handleCreate();

    assert.equal(createPayload.mode, 'multi_rotate');
    assert.equal(createPayload.presetKey, 'rotation_8');
    assert.equal(createPayload.name, '8人转');
    assert.equal(calls.redirectTo.length, 1);
  } finally {
    actionGuard.clear('create:createTournament');
    global.wx = originalWx;
    global.getApp = originalGetApp;
    profileCore.ensureProfileForAction = originalEnsureProfile;
    cloud.call = originalCloudCall;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
    delete require.cache[createPagePath];
  }
});
