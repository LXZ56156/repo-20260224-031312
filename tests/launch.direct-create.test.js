const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  loadPageDefinition,
  createPageContext
} = require('./timeout-reentry.helpers');

const actionGuard = require('../miniprogram/core/actionGuard');
const cloud = require('../miniprogram/core/cloud');
const nav = require('../miniprogram/core/nav');
const profileCore = require('../miniprogram/core/profile');

const launchPagePath = require.resolve('../miniprogram/pages/launch/index.js');

function installWxStub() {
  const calls = {
    loading: [],
    redirects: [],
    toasts: []
  };
  global.wx = {
    showLoading(options = {}) {
      calls.loading.push(`show:${String(options.title || '')}`);
    },
    hideLoading() {
      calls.loading.push('hide');
    },
    showToast(options = {}) {
      calls.toasts.push(options);
    },
    redirectTo(options = {}) {
      calls.redirects.push(options);
    },
    showModal() {}
  };
  return calls;
}

function createEvent(mode = 'multi_rotate', presetKey = 'custom') {
  return {
    currentTarget: {
      dataset: { mode, presetKey }
    }
  };
}

test('launch direct create keeps profile gate, default name and lobby redirect', async () => {
  const originalWx = global.wx;
  const originalEnsureProfile = profileCore.ensureProfileForAction;
  const originalCloudCall = cloud.call;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;
  const calls = installWxStub();
  let gateRedirect = '';
  let payload = null;

  try {
    profileCore.ensureProfileForAction = async (_action, redirect) => {
      gateRedirect = redirect;
      return {
        ok: true,
        profile: { nickName: '小羽', avatar: 'cloud://avatar/u1', gender: 'female' }
      };
    };
    cloud.call = async (name, data) => {
      assert.equal(name, 'createTournament');
      payload = data;
      return { ok: true, tournamentId: 't_direct' };
    };
    nav.buildTournamentUrl = (target, tournamentId, query = {}) => (
      `${target}?tournamentId=${tournamentId}&fromCreate=${query.fromCreate}&shareTip=${query.shareTip}`
    );

    const definition = loadPageDefinition(launchPagePath);
    const ctx = createPageContext(definition);
    await ctx.onCreate(createEvent('squad_doubles', 'custom'));

    assert.equal(gateRedirect, '/pages/launch/index');
    assert.equal(payload.name, '小队转');
    assert.equal(payload.mode, 'squad_doubles');
    assert.equal(payload.presetKey, '');
    assert.equal(payload.nickname, '小羽');
    assert.equal(payload.avatar, 'cloud://avatar/u1');
    assert.equal(payload.creatorGender, 'female');
    assert.match(String(payload.clientRequestId || ''), /^create_/);
    assert.deepEqual(calls.loading, ['show:创建中...', 'hide']);
    assert.equal(calls.redirects.length, 1);
    assert.match(calls.redirects[0].url, /pages\/lobby\/index\?tournamentId=t_direct/);
  } finally {
    actionGuard.clear('launch:createTournament');
    global.wx = originalWx;
    profileCore.ensureProfileForAction = originalEnsureProfile;
    cloud.call = originalCloudCall;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
    delete require.cache[launchPagePath];
  }
});

test('launch direct create deduplicates repeated taps while the write is pending', async () => {
  const originalWx = global.wx;
  const originalEnsureProfile = profileCore.ensureProfileForAction;
  const originalCloudCall = cloud.call;
  const calls = installWxStub();
  let resolveWrite;
  let callCount = 0;
  let first = null;
  let second = null;
  const pendingWrite = new Promise((resolve) => {
    resolveWrite = resolve;
  });

  try {
    profileCore.ensureProfileForAction = async () => ({ ok: true, profile: { nickName: '小羽', gender: 'male' } });
    cloud.call = async () => {
      callCount += 1;
      await pendingWrite;
      return { ok: true, tournamentId: 't_once' };
    };
    const definition = loadPageDefinition(launchPagePath);
    const ctx = createPageContext(definition);

    first = ctx.onCreate(createEvent('multi_rotate', 'rotation_6'));
    second = ctx.onCreate(createEvent('multi_rotate', 'rotation_6'));
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(callCount, 1);
    assert.equal(ctx.data.createBusy, true);

    resolveWrite();
    await Promise.all([first, second]);

    assert.equal(callCount, 1);
    assert.equal(ctx.data.createBusy, false);
    assert.equal(calls.redirects.length, 1);
  } finally {
    resolveWrite();
    await Promise.allSettled([first, second].filter(Boolean));
    actionGuard.clear('launch:createTournament');
    global.wx = originalWx;
    profileCore.ensureProfileForAction = originalEnsureProfile;
    cloud.call = originalCloudCall;
    delete require.cache[launchPagePath];
  }
});

test('launch retry reuses the original create clientRequestId', async () => {
  const originalWx = global.wx;
  const originalEnsureProfile = profileCore.ensureProfileForAction;
  const originalCloudCall = cloud.call;
  installWxStub();
  const requestIds = [];

  try {
    profileCore.ensureProfileForAction = async () => ({ ok: true, profile: { nickName: '小羽', gender: 'male' } });
    cloud.call = async (_name, payload) => {
      requestIds.push(payload.clientRequestId);
      if (requestIds.length === 1) throw new Error('network timeout');
      return { ok: true, tournamentId: 't_retry' };
    };
    const definition = loadPageDefinition(launchPagePath);
    const ctx = createPageContext(definition);

    await ctx.onCreate(createEvent('fixed_pair_rr', 'custom'));
    assert.equal(typeof ctx.retryLastAction, 'function');
    await ctx.retryLastAction();

    assert.equal(requestIds.length, 2);
    assert.equal(requestIds[0], requestIds[1]);
  } finally {
    actionGuard.clear('launch:createTournament');
    global.wx = originalWx;
    profileCore.ensureProfileForAction = originalEnsureProfile;
    cloud.call = originalCloudCall;
    delete require.cache[launchPagePath];
  }
});

test('launch presents explicit create buttons without linking to the confirmation page', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/launch/index.wxml'), 'utf8');
  assert.match(wxml, /bindtap="onCreate"/);
  assert.match(wxml, />创建<\/button>/);
  assert.doesNotMatch(wxml, /pages\/create\/index|>发起<\/button>/);
});
