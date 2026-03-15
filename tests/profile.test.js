const test = require('node:test');
const assert = require('node:assert/strict');

// --- Mock wx and cloud globals before requiring profile ---
global.wx = global.wx || {
  cloud: { callFunction: async () => ({ result: {} }), uploadFile: async () => ({ fileID: '' }) },
  getStorageSync: () => '',
  setStorageSync: () => {},
  removeStorageSync: () => {},
  navigateTo: () => {},
  showToast: () => {},
  showModal: () => {},
  showLoading: () => {},
  hideLoading: () => {}
};

const storage = require('../miniprogram/core/storage');
const profile = require('../miniprogram/core/profile');

// --- mergeProfile ---

test('mergeProfile merges two profiles with incoming priority', () => {
  const base = { nickName: 'Alice', avatar: 'old.png', gender: 'female' };
  const incoming = { nickName: 'Bob', avatar: 'new.png', gender: 'male' };
  const merged = profile.mergeProfile(base, incoming);
  assert.equal(merged.nickName, 'Bob');
  assert.equal(merged.avatar, 'new.png');
  assert.equal(merged.gender, 'male');
});

test('mergeProfile falls back to base when incoming fields are empty', () => {
  const base = { nickName: 'Alice', avatar: 'base.png', gender: 'female' };
  const incoming = {};
  const merged = profile.mergeProfile(base, incoming);
  assert.equal(merged.nickName, 'Alice');
  assert.equal(merged.avatar, 'base.png');
  assert.equal(merged.gender, 'female');
});

test('mergeProfile handles null base', () => {
  const incoming = { nickName: 'Bob', avatar: 'bob.png', gender: 'male' };
  const merged = profile.mergeProfile(null, incoming);
  assert.equal(merged.nickName, 'Bob');
  assert.equal(merged.avatar, 'bob.png');
});

test('mergeProfile handles null incoming', () => {
  const base = { nickName: 'Alice', avatar: 'alice.png', gender: 'female' };
  const merged = profile.mergeProfile(base, null);
  assert.equal(merged.nickName, 'Alice');
  assert.equal(merged.avatar, 'alice.png');
});

test('mergeProfile handles both null', () => {
  const merged = profile.mergeProfile(null, null);
  assert.equal(merged.nickName, '');
  assert.equal(merged.avatar, '');
});

test('mergeProfile normalizes avatarUrl and avatar cross-fields', () => {
  const incoming = { avatarUrl: 'cloud://avatar.png' };
  const merged = profile.mergeProfile({}, incoming);
  assert.equal(merged.avatar, 'cloud://avatar.png');
  assert.equal(merged.avatarUrl, 'cloud://avatar.png');
});

test('mergeProfile removes legacy nickname field', () => {
  const base = { nickname: 'lower', nickName: 'Upper' };
  const merged = profile.mergeProfile(base, {});
  assert.equal(Object.prototype.hasOwnProperty.call(merged, 'nickname'), false);
  assert.equal(merged.nickName, 'Upper');
});

test('mergeProfile normalizes gender to known values', () => {
  const merged = profile.mergeProfile({}, { gender: 'invalid' });
  assert.equal(merged.gender, 'unknown');
});

// --- readLocalProfile ---

test('readLocalProfile returns null when storage is empty', () => {
  const originalGet = storage.getUserProfile;
  storage.getUserProfile = () => null;
  try {
    assert.equal(profile.readLocalProfile(), null);
  } finally {
    storage.getUserProfile = originalGet;
  }
});

test('readLocalProfile returns stored profile', () => {
  const stored = { nickName: 'Test', avatar: 'test.png', gender: 'male' };
  const originalGet = storage.getUserProfile;
  storage.getUserProfile = () => stored;
  try {
    const result = profile.readLocalProfile();
    assert.deepEqual(result, stored);
  } finally {
    storage.getUserProfile = originalGet;
  }
});

// --- normalizeQuickFillInput ---

test('normalizeQuickFillInput extracts avatarTempPath and nickName', () => {
  const result = profile.normalizeQuickFillInput(
    { avatarTempPath: '/tmp/avatar.png', nickName: 'Player' },
    {}
  );
  assert.equal(result.avatarTempPath, '/tmp/avatar.png');
  assert.equal(result.nickName, 'Player');
  assert.equal(result.nicknameFilled, true);
  assert.equal(result.cancelled, false);
});

test('normalizeQuickFillInput marks cancelled when no avatar', () => {
  const result = profile.normalizeQuickFillInput({}, {});
  assert.equal(result.cancelled, true);
  assert.equal(result.avatarTempPath, '');
});

test('normalizeQuickFillInput falls back to profile nickName', () => {
  const result = profile.normalizeQuickFillInput(
    { avatarTempPath: '/tmp/a.png' },
    { nickName: 'FromProfile' }
  );
  assert.equal(result.nickName, 'FromProfile');
  assert.equal(result.nicknameFilled, true);
});

// --- buildProfileUrl ---

test('buildProfileUrl returns base url without returnUrl', () => {
  assert.equal(profile.buildProfileUrl(), '/pages/profile/index');
  assert.equal(profile.buildProfileUrl(''), '/pages/profile/index');
});

test('buildProfileUrl includes returnUrl param', () => {
  const url = profile.buildProfileUrl('/pages/create/index');
  assert.match(url, /\/pages\/profile\/index\?/);
  assert.match(url, /returnUrl=/);
});

// --- DEFAULT_AVATAR ---

test('DEFAULT_AVATAR is a non-empty string', () => {
  assert.equal(typeof profile.DEFAULT_AVATAR, 'string');
  assert.ok(profile.DEFAULT_AVATAR.length > 0);
});
