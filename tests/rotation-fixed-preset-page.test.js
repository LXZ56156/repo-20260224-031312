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

test('launch fixed rotation card creates directly with multi_rotate mode and presetKey', async () => {
  const originalWx = global.wx;
  const originalEnsureProfile = profileCore.ensureProfileForAction;
  const originalCloudCall = cloud.call;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;
  const calls = installWxStub();
  let createPayload = null;

  try {
    profileCore.ensureProfileForAction = async () => ({
      ok: true,
      profile: { nickName: '发起人', avatar: 'cloud://avatar/launch', gender: 'male' }
    });
    cloud.call = async (name, payload) => {
      assert.equal(name, 'createTournament');
      createPayload = payload;
      return { ok: true, tournamentId: 't_rotation_7' };
    };
    nav.buildTournamentUrl = (path, tournamentId) => `${path}?tournamentId=${tournamentId}`;
    const definition = loadPageDefinition(launchPagePath);
    const ctx = createPageContext(definition);

    await ctx.onCreate({
      currentTarget: {
        dataset: {
          mode: 'multi_rotate',
          presetKey: 'rotation_7'
        }
      }
    });

    assert.equal(calls.navigateTo.length, 0);
    assert.equal(createPayload.mode, 'multi_rotate');
    assert.equal(createPayload.presetKey, 'rotation_7');
    assert.equal(createPayload.name, '7人转');
    assert.equal(calls.redirectTo.length, 1);
    assert.match(calls.redirectTo[0].url, /\/pages\/lobby\/index\?tournamentId=t_rotation_7/);
  } finally {
    actionGuard.clear('launch:createTournament');
    global.wx = originalWx;
    profileCore.ensureProfileForAction = originalEnsureProfile;
    cloud.call = originalCloudCall;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
    delete require.cache[launchPagePath];
  }
});

test('create compatibility route forwards fixed rotation intent without creating', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalSetLaunchIntent = nav.setLaunchIntent;
  const switchCalls = [];
  const intents = [];
  let cloudCalls = 0;

  global.wx = {
    switchTab(options = {}) {
      switchCalls.push(options);
    }
  };

  try {
    nav.setLaunchIntent = (intent) => intents.push(intent);
    cloud.call = async () => {
      cloudCalls += 1;
      return { ok: true };
    };

    const definition = loadPageDefinition(createPagePath);
    const ctx = createPageContext(definition);
    await ctx.onLoad({ mode: 'multi_rotate', presetKey: 'rotation_8' });

    assert.deepEqual(intents, [{ mode: 'multi_rotate', presetKey: 'rotation_8' }]);
    assert.equal(switchCalls.length, 1);
    assert.equal(cloudCalls, 0);
  } finally {
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    nav.setLaunchIntent = originalSetLaunchIntent;
    delete require.cache[createPagePath];
  }
});
