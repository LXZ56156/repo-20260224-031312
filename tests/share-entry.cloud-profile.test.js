const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');
const nav = require('../miniprogram/core/nav');
const profileCore = require('../miniprogram/core/profile');
const storage = require('../miniprogram/core/storage');
const writeErrorUi = require('../miniprogram/core/writeErrorUi');
const joinTournamentCore = require('../miniprogram/core/joinTournament');
const flow = require('../miniprogram/core/uxFlow');

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

function createShareEntryPageContext(definition, dataOverrides = {}) {
  const ctx = {
    data: { ...JSON.parse(JSON.stringify(definition.data || {})), ...dataOverrides },
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  Object.keys(definition || {}).forEach((key) => {
    if (typeof definition[key] === 'function') ctx[key] = definition[key];
  });
  return ctx;
}

function createWxStub() {
  return {
    showLoading() {},
    hideLoading() {},
    showToast() {},
    redirectTo() {},
    navigateTo() {},
    getStorageSync() {
      return undefined;
    },
    setStorageSync() {},
    removeStorageSync() {}
  };
}

function buildShareEntryContext(definition) {
  const ctx = createShareEntryPageContext(definition, {
    tournamentId: 't_share_profile',
    tournament: {
      _id: 't_share_profile',
      status: 'draft',
      mode: flow.MODE_MULTI_ROTATE
    },
    joinBusy: false
  });
  ctx.fetchTournament = async () => {};
  return ctx;
}

test('share-entry handleJoin saves joined profile to cloud profile with the join request id', async () => {
  const originalWx = global.wx;
  const originalEnsureJoinProfile = joinTournamentCore.ensureJoinProfile;
  const originalCallJoinTournament = joinTournamentCore.callJoinTournament;
  const originalSaveCloudProfile = profileCore.saveCloudProfile;
  const originalSetUserProfile = storage.setUserProfile;
  const originalMarkRefreshFlag = nav.markRefreshFlag;

  const savedProfiles = [];
  const localProfiles = [];
  const requestIds = [];

  global.wx = createWxStub();

  try {
    const definition = loadShareEntryPageDefinition();
    const ctx = buildShareEntryContext(definition);
    ctx.goLobby = () => {};

    joinTournamentCore.ensureJoinProfile = async () => ({
      ok: true,
      profile: { nickName: '分享昵称', avatar: 'cloud://avatar/share', gender: 'female' }
    });
    joinTournamentCore.callJoinTournament = async (_payload, options = {}) => {
      requestIds.push(options.clientRequestId);
      return { ok: true };
    };
    profileCore.saveCloudProfile = async (profile, options = {}) => {
      savedProfiles.push({ profile, clientRequestId: options.clientRequestId });
      return { ok: true };
    };
    storage.setUserProfile = (profile) => {
      localProfiles.push(profile);
      return true;
    };
    nav.markRefreshFlag = () => {};

    await ctx.handleJoin();

    assert.equal(savedProfiles.length, 1);
    assert.equal(savedProfiles[0].clientRequestId, requestIds[0]);
    assert.deepEqual(savedProfiles[0].profile, {
      nickName: '分享昵称',
      avatar: 'cloud://avatar/share',
      gender: 'female'
    });
    assert.deepEqual(localProfiles[0], {
      nickName: '分享昵称',
      avatar: 'cloud://avatar/share',
      gender: 'female'
    });
  } finally {
    actionGuard.clear('shareEntry:joinTournament:t_share_profile');
    global.wx = originalWx;
    joinTournamentCore.ensureJoinProfile = originalEnsureJoinProfile;
    joinTournamentCore.callJoinTournament = originalCallJoinTournament;
    profileCore.saveCloudProfile = originalSaveCloudProfile;
    storage.setUserProfile = originalSetUserProfile;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    delete require.cache[shareEntryPagePath];
  }
});

test('share-entry cloud profile save failure keeps successful join flow', async () => {
  const originalWx = global.wx;
  const originalWarn = console.warn;
  const originalEnsureJoinProfile = joinTournamentCore.ensureJoinProfile;
  const originalCallJoinTournament = joinTournamentCore.callJoinTournament;
  const originalSaveCloudProfile = profileCore.saveCloudProfile;
  const originalSetUserProfile = storage.setUserProfile;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalPresentWriteError = writeErrorUi.presentWriteError;

  const localProfiles = [];
  const warnings = [];
  let writeErrors = 0;
  let navigated = false;

  global.wx = createWxStub();
  console.warn = (...args) => {
    warnings.push(args);
  };

  try {
    const definition = loadShareEntryPageDefinition();
    const ctx = buildShareEntryContext(definition);
    ctx.goLobby = () => {
      navigated = true;
    };

    joinTournamentCore.ensureJoinProfile = async () => ({
      ok: true,
      profile: { nickName: '分享昵称', avatar: 'cloud://avatar/share', gender: 'female' }
    });
    joinTournamentCore.callJoinTournament = async () => ({ ok: true });
    profileCore.saveCloudProfile = () => {
      throw new Error('profile save timeout');
    };
    storage.setUserProfile = (profile) => {
      localProfiles.push(profile);
      return true;
    };
    nav.markRefreshFlag = () => {};
    writeErrorUi.presentWriteError = () => {
      writeErrors += 1;
    };

    await ctx.handleJoin();

    assert.equal(writeErrors, 0);
    assert.equal(navigated, true);
    assert.equal(localProfiles.length, 1);
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0] || ''), /saveCloudProfile/);
  } finally {
    actionGuard.clear('shareEntry:joinTournament:t_share_profile');
    global.wx = originalWx;
    console.warn = originalWarn;
    joinTournamentCore.ensureJoinProfile = originalEnsureJoinProfile;
    joinTournamentCore.callJoinTournament = originalCallJoinTournament;
    profileCore.saveCloudProfile = originalSaveCloudProfile;
    storage.setUserProfile = originalSetUserProfile;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    writeErrorUi.presentWriteError = originalPresentWriteError;
    delete require.cache[shareEntryPagePath];
  }
});
