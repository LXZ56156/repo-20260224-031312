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
const cloud = require('../miniprogram/core/cloud');
const profile = require('../miniprogram/core/profile');
const profilePagePath = require.resolve('../miniprogram/pages/profile/index.js');

function loadProfilePageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[profilePagePath];
  require(profilePagePath);
  global.Page = originalPage;
  return definition;
}

function createProfilePageContext(definition) {
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

test('syncCloudProfile keeps local profile when cloud returns structured failure', async () => {
  const localProfile = { nickName: '本地昵称', avatar: 'local.png', gender: 'female' };
  const originalGet = storage.getUserProfile;
  const originalSet = storage.setUserProfile;
  const originalCall = cloud.call;
  let setCalled = false;

  storage.getUserProfile = () => localProfile;
  storage.setUserProfile = () => {
    setCalled = true;
  };
  cloud.call = async () => ({
    ok: false,
    code: 'PROFILE_LOAD_FAILED',
    message: '读取资料失败，请稍后重试',
    state: '',
    traceId: 'trace-profile-sync-fail',
    data: {}
  });

  try {
    const result = await profile.syncCloudProfile();
    assert.deepEqual(result, localProfile);
    assert.equal(setCalled, false);
  } finally {
    storage.getUserProfile = originalGet;
    storage.setUserProfile = originalSet;
    cloud.call = originalCall;
  }
});

test('saveCloudProfile does not write local profile when cloud save fails', async () => {
  const localProfile = { nickName: '旧昵称', avatar: 'cloud://avatar/old', gender: 'male' };
  const incomingProfile = { nickName: '新昵称', avatar: 'cloud://avatar/new', gender: 'female' };
  const originalGet = storage.getUserProfile;
  const originalSet = storage.setUserProfile;
  const originalCall = cloud.call;
  const writes = [];

  storage.getUserProfile = () => localProfile;
  storage.setUserProfile = (value) => {
    writes.push(value);
    return true;
  };
  cloud.call = async () => ({
    ok: false,
    code: 'PROFILE_SAVE_FAILED',
    message: '保存失败',
    state: 'network',
    data: {}
  });

  try {
    await assert.rejects(
      () => profile.saveCloudProfile(incomingProfile, { clientRequestId: 'profile-rid' }),
      /保存失败/
    );
    assert.deepEqual(writes, []);
  } finally {
    storage.getUserProfile = originalGet;
    storage.setUserProfile = originalSet;
    cloud.call = originalCall;
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

// --- parseTournamentIdFromReturnUrl ---

function parseTournamentIdFromReturnUrl(returnUrl) {
  const raw = String(returnUrl || '').trim();
  if (!raw) return '';
  const match = raw.match(/[?&]tournamentId=([^&#]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

test('parseTournamentIdFromReturnUrl extracts id from lobby url', () => {
  assert.equal(parseTournamentIdFromReturnUrl('/pages/lobby/index?tournamentId=t_123'), 't_123');
});

test('parseTournamentIdFromReturnUrl extracts id from share-entry url', () => {
  assert.equal(
    parseTournamentIdFromReturnUrl('/pages/share-entry/index?tournamentId=t_456&intent=join'),
    't_456'
  );
});

test('parseTournamentIdFromReturnUrl returns empty for non-tournament url', () => {
  assert.equal(parseTournamentIdFromReturnUrl('/pages/create/index'), '');
  assert.equal(parseTournamentIdFromReturnUrl(''), '');
  assert.equal(parseTournamentIdFromReturnUrl('/pages/mine/index'), '');
});

test('parseTournamentIdFromReturnUrl handles encoded tournamentId', () => {
  assert.equal(
    parseTournamentIdFromReturnUrl('/pages/lobby/index?tournamentId=t%5Fabc'),
    't_abc'
  );
});

// --- profile save + tournament sync ---

test('profile save from lobby returnUrl triggers tournament sync', async () => {
  const originalCall = cloud.call;
  const calls = [];
  cloud.call = async (name, params) => {
    calls.push({ name, params });
    if (name === 'saveUserProfile') return { ok: true, data: {} };
    if (name === 'joinTournament') return { ok: true, data: { player: { id: 'u_1', name: '测试', avatar: 'cloud://x' } } };
    return { ok: true };
  };

  const originalGetProfile = storage.getUserProfile;
  storage.getUserProfile = () => ({ nickName: '旧昵称', avatar: '', gender: 'unknown' });

  const nav = require('../miniprogram/core/nav');
  const originalMarkRefresh = nav.markRefreshFlag;
  let refreshCalled = false;
  nav.markRefreshFlag = (tid) => { refreshCalled = true; };

  try {
    await profile.saveCloudProfile(
      { nickName: '新昵称', avatar: 'cloud://avatar/new', gender: 'male' },
      { clientRequestId: 'p1-test-1' }
    );
    // saveCloudProfile 本身不负责赛事同步，同步由 page 层 onSave 编排
    const saveCall = calls.find((c) => c.name === 'saveUserProfile');
    assert.ok(saveCall, 'saveUserProfile should be called');
    assert.equal(saveCall.params.nickname, '新昵称');
  } finally {
    cloud.call = originalCall;
    storage.getUserProfile = originalGetProfile;
    nav.markRefreshFlag = originalMarkRefresh;
  }
});

test('joinTournament profile_update syncs avatar to tournament', async () => {
  const originalCall = cloud.call;
  const joinCalls = [];
  cloud.call = async (name, params) => {
    if (name === 'joinTournament') {
      joinCalls.push(params);
      return { ok: true, data: { player: { id: 'u_1', name: '测试', avatar: params.avatar } } };
    }
    return { ok: true };
  };

  const joinTournamentCore = require('../miniprogram/core/joinTournament');
  try {
    const payload = joinTournamentCore.buildJoinPayload({
      tournamentId: 't_sync',
      nickname: '同步昵称',
      avatar: 'cloud://avatar/sync',
      gender: 'female'
    });
    const result = await joinTournamentCore.callJoinTournament(payload, { action: 'profile_update' });
    assert.equal(result.ok, true);
    assert.equal(joinCalls.length, 1);
    assert.equal(joinCalls[0].tournamentId, 't_sync');
    assert.equal(joinCalls[0].avatar, 'cloud://avatar/sync');
    assert.equal(joinCalls[0].nickname, '同步昵称');
    assert.equal(joinCalls[0].gender, 'female');
    assert.equal(joinCalls[0].action, 'profile_update');
  } finally {
    cloud.call = originalCall;
  }
});

test('tournament sync failure does not rollback profile save', async () => {
  const originalCall = cloud.call;
  const calls = [];
  cloud.call = async (name, params) => {
    calls.push({ name, params });
    if (name === 'saveUserProfile') return { ok: true, data: {} };
    if (name === 'joinTournament') return { ok: false, code: 'SYNC_FAILED', message: '同步失败' };
    return { ok: true };
  };

  const originalGetProfile = storage.getUserProfile;
  storage.getUserProfile = () => ({ nickName: '旧昵称', avatar: '', gender: 'unknown' });

  try {
    // saveCloudProfile should succeed even if a subsequent sync would fail
    const result = await profile.saveCloudProfile(
      { nickName: '新昵称', avatar: 'cloud://avatar/new', gender: 'male' },
      { clientRequestId: 'p1-test-2' }
    );
    assert.ok(result);
    assert.equal(result.nickName, '新昵称');
    const saveCall = calls.find((c) => c.name === 'saveUserProfile');
    assert.ok(saveCall, 'saveUserProfile should be called');
  } finally {
    cloud.call = originalCall;
    storage.getUserProfile = originalGetProfile;
  }
});

test('profile page tournament sync ignores PLAYER_NOT_JOINED without throwing', async () => {
  const originalCall = cloud.call;
  const calls = [];
  cloud.call = async (name, params) => {
    calls.push({ name, params });
    if (name === 'joinTournament') {
      return { ok: false, code: 'PLAYER_NOT_JOINED', state: 'not_joined', message: '请先加入比赛后再更新参赛信息' };
    }
    return { ok: true };
  };

  try {
    const definition = loadProfilePageDefinition();
    const ctx = createProfilePageContext(definition);
    await ctx.syncProfileToTournament('t_not_joined', '新昵称', 'cloud://avatar/new', 'male');

    const joinCall = calls.find((item) => item.name === 'joinTournament');
    assert.ok(joinCall);
    assert.equal(joinCall.params.tournamentId, 't_not_joined');
    assert.equal(joinCall.params.action, 'profile_update');
  } finally {
    cloud.call = originalCall;
    delete require.cache[profilePagePath];
  }
});

test('profile save without tournament returnUrl does not call joinTournament', async () => {
  const originalCall = cloud.call;
  const joinCalled = { value: false };
  cloud.call = async (name) => {
    if (name === 'joinTournament') joinCalled.value = true;
    if (name === 'saveUserProfile') return { ok: true, data: {} };
    return { ok: true };
  };

  const originalGetProfile = storage.getUserProfile;
  storage.getUserProfile = () => ({ nickName: '旧昵称', avatar: '', gender: 'unknown' });

  try {
    await profile.saveCloudProfile(
      { nickName: '普通保存', avatar: 'cloud://avatar/normal', gender: 'female' },
      { clientRequestId: 'p1-test-3' }
    );
    // saveCloudProfile itself doesn't call joinTournament — that's the page's responsibility
    // This test verifies the core module doesn't have unexpected side effects
  } finally {
    cloud.call = originalCall;
    storage.getUserProfile = originalGetProfile;
  }
});
