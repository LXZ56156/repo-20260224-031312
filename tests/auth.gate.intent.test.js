const test = require('node:test');
const assert = require('node:assert/strict');

const profile = require('../miniprogram/core/profile');
const auth = require('../miniprogram/core/auth');
const cloud = require('../miniprogram/core/cloud');
const storage = require('../miniprogram/core/storage');

function withPatched(fn) {
  const orig = {
    authLogin: auth.login,
    cloudCall: cloud.call,
    getUserProfile: storage.getUserProfile,
    setUserProfile: storage.setUserProfile,
    isProfileComplete: storage.isProfileComplete,
    wx: global.wx
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      auth.login = orig.authLogin;
      cloud.call = orig.cloudCall;
      storage.getUserProfile = orig.getUserProfile;
      storage.setUserProfile = orig.setUserProfile;
      storage.isProfileComplete = orig.isProfileComplete;
      global.wx = orig.wx;
    });
}

test('ensureProfileForAction returns login_failed when auth login fails', async () => {
  await withPatched(async () => {
    auth.login = async () => { throw new Error('login fail'); };
    storage.getUserProfile = () => null;
    storage.isProfileComplete = () => false;
    global.wx = { navigateTo: () => {} };

    const out = await profile.ensureProfileForAction('create', '/pages/create/index');
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'login_failed');
  });
});

test('ensureProfileForAction returns need_profile and navigates to profile page', async () => {
  await withPatched(async () => {
    const navCalls = [];
    auth.login = async () => 'openid-test';
    cloud.call = async () => ({ profile: null });
    storage.getUserProfile = () => ({ nickName: '', gender: 'unknown' });
    storage.setUserProfile = () => {};
    storage.isProfileComplete = () => false;
    global.wx = {
      navigateTo: (payload) => navCalls.push(payload)
    };

    const out = await profile.ensureProfileForAction('create', '/pages/create/index');
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'need_profile');
    assert.equal(navCalls.length, 1);
    assert.match(String(navCalls[0].url || ''), /\/pages\/profile\/index\?returnUrl=/);
  });
});

test('ensureProfileForAction returns ok for complete profile without redirect', async () => {
  await withPatched(async () => {
    const navCalls = [];
    let cloudCallCount = 0;
    auth.login = async () => 'openid-test';
    cloud.call = async () => {
      cloudCallCount += 1;
      return {};
    };
    storage.getUserProfile = () => ({ nickName: '球友A', gender: 'male' });
    storage.isProfileComplete = (p) => !!(p && p.nickName && p.gender === 'male');
    global.wx = {
      navigateTo: (payload) => navCalls.push(payload)
    };

    const out = await profile.ensureProfileForAction('create', '/pages/create/index');
    assert.equal(out.ok, true);
    assert.equal(out.reason, 'ok');
    assert.equal(navCalls.length, 0);
    assert.equal(cloudCallCount, 0);
  });
});
