const test = require('node:test');
const assert = require('node:assert/strict');

const storage = require('../miniprogram/core/storage');
const profileCore = require('../miniprogram/core/profile');

const minePagePath = require.resolve('../miniprogram/pages/mine/index.js');

function loadMinePageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[minePagePath];
  require(minePagePath);
  global.Page = originalPage;
  return definition;
}

function createMinePageContext(definition) {
  const updates = [];
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(update) {
      updates.push(update);
      this.data = { ...this.data, ...(update || {}) };
    },
    _updates: updates
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('mine page renders local profile before cloud sync resolves', async () => {
  const originalGetApp = global.getApp;
  const originalGetUserProfile = storage.getUserProfile;
  const originalGet = storage.get;
  const originalGetSnapshots = storage.getLocalCompletedTournamentSnapshots;
  const originalSyncCloudProfile = profileCore.syncCloudProfile;
  let resolveSync;

  global.getApp = () => ({
    globalData: { openid: 'u_1' }
  });
  storage.getUserProfile = () => ({
    nickName: '本地球友',
    avatar: 'local-avatar.png'
  });
  storage.get = (key, fallback) => {
    if (key === 'openid') return 'u_1';
    return fallback;
  };
  storage.getLocalCompletedTournamentSnapshots = () => [];
  profileCore.syncCloudProfile = () => new Promise((resolve) => {
    resolveSync = resolve;
  });

  try {
    const definition = loadMinePageDefinition();
    const ctx = createMinePageContext(definition);

    ctx.onShow();

    assert.deepEqual(ctx._updates[0], {
      nickname: '本地球友',
      avatar: 'local-avatar.png'
    });
    assert.equal(ctx.data.nickname, '本地球友');
    assert.equal(ctx.data.avatar, 'local-avatar.png');

    resolveSync({
      nickName: '云端球友',
      avatar: 'cloud-avatar.png'
    });
    await Promise.resolve();

    assert.equal(ctx.data.nickname, '云端球友');
    assert.equal(ctx.data.avatar, 'cloud-avatar.png');
  } finally {
    global.getApp = originalGetApp;
    storage.getUserProfile = originalGetUserProfile;
    storage.get = originalGet;
    storage.getLocalCompletedTournamentSnapshots = originalGetSnapshots;
    profileCore.syncCloudProfile = originalSyncCloudProfile;
    delete require.cache[minePagePath];
  }
});
