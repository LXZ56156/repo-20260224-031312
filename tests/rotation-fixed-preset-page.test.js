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
    getStorageSync() {
      return [];
    },
    setStorageSync() {},
    ...overrides
  };
  return calls;
}

test('launch fixed rotation card navigates with multi_rotate mode and presetKey', async () => {
  const originalWx = global.wx;
  const originalEnsureProfile = profileCore.ensureProfileForAction;
  const calls = installWxStub();
  let profileRedirect = '';
  const resolveProfiles = [];
  let profileCalls = 0;

  try {
    profileCore.ensureProfileForAction = (action, redirect) => {
      assert.equal(action, 'create');
      profileCalls += 1;
      profileRedirect = redirect;
      return new Promise((resolve) => {
        resolveProfiles.push(resolve);
      });
    };
    const definition = loadPageDefinition(launchPagePath);
    const ctx = createPageContext(definition);

    const event = {
      currentTarget: {
        dataset: {
          mode: 'multi_rotate',
          presetKey: 'rotation_7'
        }
      }
    };
    const first = ctx.onStart(event);
    const second = ctx.onStart(event);

    assert.equal(profileCalls, 1);
    resolveProfiles[0]({ ok: true, profile: {} });
    await Promise.all([first, second]);

    assert.equal(calls.navigateTo.length, 1);
    assert.match(calls.navigateTo[0].url, /\/pages\/create\/index\?mode=multi_rotate&presetKey=rotation_7/);
    assert.equal(profileRedirect, calls.navigateTo[0].url);

    ctx.onShow();
    const stale = ctx.onStart(event);
    ctx.onHide();
    ctx.onShow();
    const current = ctx.onStart(event);
    assert.equal(profileCalls, 3);
    resolveProfiles[1]({ ok: true, profile: {} });
    await stale;
    assert.equal(calls.navigateTo.length, 1);
    resolveProfiles[2]({ ok: true, profile: {} });
    await current;
    assert.equal(calls.navigateTo.length, 2);

    ctx.onShow();
    ctx.onStartWater();
    ctx.onStartWater();
    assert.equal(calls.navigateTo.filter((call) => call.url === '/pages/water/index').length, 1);
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
  const profileRedirects = [];

  global.getApp = () => ({
    globalData: { networkOffline: false },
    subscribeNetworkChange() {
      return () => {};
    }
  });

  try {
    profileCore.ensureProfileForAction = async (action, redirect) => {
      assert.equal(action, 'create');
      profileRedirects.push(redirect);
      if (profileRedirects.length === 1) {
        return { ok: false, reason: 'need_profile', profile: null };
      }
      return {
        ok: true,
        profile: { nickName: '发起人', avatar: 'cloud://avatar/create', gender: 'male' }
      };
    };
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
    assert.equal(profileRedirects[0], '/pages/create/index?mode=multi_rotate&presetKey=rotation_8');
    assert.match(calls.navigateTo[0].url, /\/pages\/profile\/index/);

    ctx.onName({ detail: { value: '周末自定义' } });
    await ctx.handleCreate();

    assert.equal(createPayload.mode, 'multi_rotate');
    assert.equal(createPayload.presetKey, 'rotation_8');
    assert.equal(createPayload.name, '8人转');
    assert.equal(calls.redirectTo.length, 1);
    assert.equal(profileRedirects[1], '/pages/create/index?mode=multi_rotate&presetKey=rotation_8');
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
