const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');
const cloud = require('../miniprogram/core/cloud');
const nav = require('../miniprogram/core/nav');
const profileCore = require('../miniprogram/core/profile');
const storage = require('../miniprogram/core/storage');
const joinTournamentCore = require('../miniprogram/core/joinTournament');
const tournamentSync = require('../miniprogram/core/tournamentSync');
const settingsActions = require('../miniprogram/pages/settings/settingsActions');
const lobbyDraftActions = require('../miniprogram/pages/lobby/lobbyDraftActions');
const lobbyProfileActions = require('../miniprogram/pages/lobby/lobbyProfileActions');
const flow = require('../miniprogram/core/uxFlow');

const createPagePath = require.resolve('../miniprogram/pages/create/index.js');
const analyticsPagePath = require.resolve('../miniprogram/pages/analytics/index.js');

function createWxStub() {
  const pendingModalTasks = [];
  return {
    pendingModalTasks,
    api: {
      showLoading() {},
      hideLoading() {},
      showToast() {},
      navigateTo() {},
      redirectTo() {},
      navigateBack(options = {}) {
        if (typeof options.fail === 'function') options.fail();
      },
      switchTab() {},
      showModal(options = {}) {
        const task = options && typeof options.success === 'function'
          ? options.success({ confirm: true, cancel: false })
          : null;
        if (task && typeof task.then === 'function') pendingModalTasks.push(task);
      }
    }
  };
}

function loadPageDefinition(pagePath) {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[pagePath];
  require(pagePath);
  global.Page = originalPage;
  return definition;
}

function createPageContext(definition, dataOverrides = {}) {
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

function createContext(methods, data = {}) {
  const ctx = {
    data: { ...(data || {}) },
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  Object.keys(methods || {}).forEach((key) => {
    if (typeof methods[key] === 'function') ctx[key] = methods[key];
  });
  return ctx;
}

test('create retry reuses the same clientRequestId', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalEnsureProfileForAction = profileCore.ensureProfileForAction;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;

  const wxBox = createWxStub();
  const requestIds = [];
  let callCount = 0;

  global.wx = wxBox.api;

  try {
    const definition = loadPageDefinition(createPagePath);
    const ctx = createPageContext(definition, {
      name: '周末比赛'
    });

    profileCore.ensureProfileForAction = async () => ({
      ok: true,
      profile: { nickName: '发起人', avatar: 'cloud://avatar/create', gender: 'male' }
    });
    nav.buildTournamentUrl = (path, tournamentId) => `${path}?tournamentId=${tournamentId}`;
    cloud.call = async (_name, payload) => {
      requestIds.push(payload.clientRequestId);
      callCount += 1;
      if (callCount === 1) throw new Error('network timeout');
      return { ok: true, tournamentId: 't_new' };
    };

    await ctx.handleCreate();
    assert.equal(typeof ctx.retryLastAction, 'function');
    await ctx.retryLastAction();

    assert.equal(requestIds.length, 2);
    assert.equal(requestIds[0], requestIds[1]);
    assert.match(String(requestIds[0] || ''), /^create_/);
  } finally {
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    profileCore.ensureProfileForAction = originalEnsureProfileForAction;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
    delete require.cache[createPagePath];
  }
});

test('settings saveSettings retry reuses the same clientRequestId', async () => {
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalNavigateBackOrRedirect = nav.navigateBackOrRedirect;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;

  const wxBox = createWxStub();
  const submittedPayloads = [];
  let callCount = 0;
  let retryFn = null;

  global.wx = wxBox.api;
  global.setTimeout = (fn) => {
    if (typeof fn === 'function') fn();
    return 1;
  };
  global.clearTimeout = () => {};

  try {
    cloud.call = async (_name, payload) => {
      submittedPayloads.push(JSON.parse(JSON.stringify(payload)));
      callCount += 1;
      if (callCount === 1) throw new Error('network timeout');
      return { ok: true, version: 2 };
    };
    nav.markRefreshFlag = () => {};
    nav.navigateBackOrRedirect = () => {};
    nav.buildTournamentUrl = (path, tournamentId) => `${path}?tournamentId=${tournamentId}`;

    const ctx = createContext(settingsActions, {
      tournamentId: 't_settings',
      isAdmin: true,
      tournament: {
        status: 'draft',
        mode: 'multi_rotate',
        presetKey: 'custom',
        players: [
          { id: 'u1', name: 'A' },
          { id: 'u2', name: 'B' },
          { id: 'u3', name: 'C' },
          { id: 'u4', name: 'D' }
        ]
      },
      name: '周二场',
      maxMatches: 0,
      editM: 1,
      editC: 1,
      pointsPerGame: 21,
      endConditionType: 'total_matches',
      endConditionTarget: 1,
      endConditionTargetOptions: [1],
      showSquadEndCondition: false,
      showWaterSettings: true,
      waterEnabled: true,
      waterDefaultUnitsPerLoser: 2,
      mode: 'multi_rotate',
      allowOpenTeam: false,
      canConfigureSettings: true
    });
    ctx.fetchTournament = async () => {
      ctx.data.waterEnabled = false;
      ctx.data.waterDefaultUnitsPerLoser = 1;
    };
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = (_text, fn) => {
      retryFn = fn;
    };
    ctx.handleWriteError = () => {};

    await ctx.saveSettings();
    assert.equal(typeof retryFn, 'function');
    await retryFn();

    assert.equal(submittedPayloads.length, 2);
    assert.equal(submittedPayloads[0].clientRequestId, submittedPayloads[1].clientRequestId);
    assert.match(String(submittedPayloads[0].clientRequestId || ''), /^update_settings_/);
    assert.deepEqual(submittedPayloads[0].water, {
      enabled: true,
      defaultUnitsPerLoser: 2
    });
    assert.deepEqual(submittedPayloads[1].water, submittedPayloads[0].water);
  } finally {
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.navigateBackOrRedirect = originalNavigateBackOrRedirect;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
  }
});

test('lobby saveQuickSettings retry reuses the same clientRequestId', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;

  const wxBox = createWxStub();
  const requestIds = [];
  let callCount = 0;
  let retryFn = null;

  global.wx = wxBox.api;

  try {
    cloud.call = async (_name, payload) => {
      requestIds.push(payload.clientRequestId);
      callCount += 1;
      if (callCount === 1) throw new Error('network timeout');
      return { ok: true, version: 2 };
    };
    nav.markRefreshFlag = () => {};

    const ctx = createContext(lobbyDraftActions, {
      tournamentId: 't_lobby_settings',
      isAdmin: true,
      tournament: {
        status: 'draft',
        players: [
          { id: 'u1', name: 'A' },
          { id: 'u2', name: 'B' },
          { id: 'u3', name: 'C' },
          { id: 'u4', name: 'D' }
        ]
      },
      quickConfigName: '大厅比赛',
      quickConfigM: 4,
      quickConfigC: 2,
      quickPointsPerGame: 21,
      quickShowSquadEndCondition: false,
      quickEndConditionType: 'total_matches',
      quickEndConditionTarget: 4,
      quickEndConditionTargetOptions: [1, 2, 3, 4],
      maxMatches: 0,
      allowOpenTeam: false,
      canConfigureSettings: true
    });
    ctx.fetchTournament = async () => {};
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = (_text, fn) => {
      retryFn = fn;
    };
    ctx.handleWriteError = () => {};

    await ctx.saveQuickSettings();
    assert.equal(typeof retryFn, 'function');
    await retryFn();

    assert.equal(requestIds.length, 2);
    assert.equal(requestIds[0], requestIds[1]);
    assert.match(String(requestIds[0] || ''), /^update_settings_/);
  } finally {
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
  }
});

test('lobby quickImportPlayers retry reuses the same clientRequestId', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;

  const wxBox = createWxStub();
  const requestIds = [];
  let callCount = 0;
  let retryFn = null;

  global.wx = wxBox.api;

  try {
    cloud.call = async (_name, payload) => {
      requestIds.push(payload.clientRequestId);
      callCount += 1;
      if (callCount === 1) throw new Error('network timeout');
      return { ok: true, addedCount: 2, duplicateCount: 0, invalidCount: 0, maleCount: 1, femaleCount: 1, unknownCount: 0 };
    };
    nav.markRefreshFlag = () => {};

    const ctx = createContext(lobbyDraftActions, {
      tournamentId: 't_import',
      isAdmin: true,
      tournament: { status: 'draft' },
      quickImportText: '球友A 球友B'
    });
    ctx.fetchTournament = async () => {};
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = (_text, fn) => {
      retryFn = fn;
    };
    ctx.handleWriteError = () => {};

    await ctx.quickImportPlayers();
    assert.equal(typeof retryFn, 'function');
    await retryFn();

    assert.equal(requestIds.length, 2);
    assert.equal(requestIds[0], requestIds[1]);
    assert.match(String(requestIds[0] || ''), /^add_players_/);
  } finally {
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
  }
});

test('lobby handleStart retry reuses the same clientRequestId', async () => {
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;
  const originalGetSchedulerProfile = storage.getSchedulerProfile;
  const originalFetchTournament = tournamentSync.fetchTournament;

  const wxBox = createWxStub();
  const requestIds = [];
  let callCount = 0;
  let retryFn = null;

  global.wx = wxBox.api;
  global.setTimeout = (fn) => {
    if (typeof fn === 'function') fn();
    return 1;
  };

  try {
    cloud.call = async (_name, payload) => {
      requestIds.push(payload.clientRequestId);
      callCount += 1;
      if (callCount === 1) throw new Error('network timeout');
      return { ok: true, version: 2 };
    };
    nav.markRefreshFlag = () => {};
    nav.buildTournamentUrl = (path, tournamentId) => `${path}?tournamentId=${tournamentId}`;
    storage.getSchedulerProfile = () => 'balanced';
    tournamentSync.fetchTournament = async () => ({ ok: false, cachedDoc: null });

    const ctx = createContext(lobbyDraftActions, {
      tournamentId: 't_start',
      tournament: { status: 'draft' },
      isAdmin: true,
      checkPlayersOk: true,
      checkSettingsOk: true
    });
    ctx.fetchTournament = async () => {};
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = (_text, fn) => {
      retryFn = fn;
    };
    ctx.handleWriteError = () => {};

    await ctx.handleStart();
    assert.equal(typeof retryFn, 'function');
    await retryFn();

    assert.equal(requestIds.length, 2);
    assert.equal(requestIds[0], requestIds[1]);
    assert.match(String(requestIds[0] || ''), /^start_/);
  } finally {
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
    storage.getSchedulerProfile = originalGetSchedulerProfile;
    tournamentSync.fetchTournament = originalFetchTournament;
  }
});

test('lobby cancelTournament retry reuses the same clientRequestId', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalGoHome = nav.goHome;
  const originalRemoveRecentTournamentId = storage.removeRecentTournamentId;
  const originalRemoveSnapshot = storage.removeLocalCompletedTournamentSnapshot;
  const originalRemoveCache = storage.removeLocalTournamentCache;

  const wxBox = createWxStub();
  const requestIds = [];
  let callCount = 0;
  let retryFn = null;

  global.wx = wxBox.api;

  try {
    cloud.call = async (_name, payload) => {
      requestIds.push(payload.clientRequestId);
      callCount += 1;
      if (callCount === 1) throw new Error('network timeout');
      return { ok: true };
    };
    nav.markRefreshFlag = () => {};
    nav.goHome = () => {};
    storage.removeRecentTournamentId = () => {};
    storage.removeLocalCompletedTournamentSnapshot = () => {};
    storage.removeLocalTournamentCache = () => {};

    const ctx = createContext(lobbyDraftActions, {
      tournamentId: 't_cancel',
      tournament: { status: 'draft' },
      isAdmin: true
    });
    ctx.fetchTournament = async () => {};
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = (_text, fn) => {
      retryFn = fn;
    };
    ctx.handleWriteError = () => {};

    ctx.cancelTournament();
    await Promise.all(wxBox.pendingModalTasks);
    assert.equal(typeof retryFn, 'function');

    wxBox.pendingModalTasks.length = 0;
    await retryFn();
    await Promise.all(wxBox.pendingModalTasks);

    assert.equal(requestIds.length, 2);
    assert.equal(requestIds[0], requestIds[1]);
    assert.match(String(requestIds[0] || ''), /^delete_/);
  } finally {
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.goHome = originalGoHome;
    storage.removeRecentTournamentId = originalRemoveRecentTournamentId;
    storage.removeLocalCompletedTournamentSnapshot = originalRemoveSnapshot;
    storage.removeLocalTournamentCache = originalRemoveCache;
  }
});

test('lobby removePlayer retry reuses the same clientRequestId', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;

  const wxBox = createWxStub();
  const requestIds = [];
  let callCount = 0;
  let retryFn = null;

  global.wx = wxBox.api;

  try {
    cloud.call = async (_name, payload) => {
      requestIds.push(payload.clientRequestId);
      callCount += 1;
      if (callCount === 1) throw new Error('network timeout');
      return { ok: true, state: 'removed' };
    };
    nav.markRefreshFlag = () => {};

    const ctx = createContext(lobbyDraftActions, {
      tournamentId: 't_remove',
      tournament: {
        status: 'draft',
        players: [
          { id: 'u_admin', name: '管理员' },
          { id: 'p_remove', name: '待移除' }
        ]
      },
      isAdmin: true,
      displayPlayers: [
        { id: 'u_admin', name: '管理员' },
        { id: 'p_remove', name: '待移除' }
      ]
    });
    ctx.openid = 'u_admin';
    ctx.fetchTournament = async () => {};
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = (_text, fn) => {
      retryFn = fn;
    };
    ctx.handleWriteError = () => {};

    ctx.onPlayerLongPress({ currentTarget: { dataset: { player: 'p_remove', name: '待移除' } } });
    await Promise.all(wxBox.pendingModalTasks);
    assert.equal(typeof retryFn, 'function');

    await retryFn();

    assert.equal(requestIds.length, 2);
    assert.equal(requestIds[0], requestIds[1]);
    assert.match(String(requestIds[0] || ''), /^remove_player_/);
  } finally {
    actionGuard.clear('lobby:removePlayer:t_remove:p_remove');
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
  }
});

test('analytics clone retry reuses the same clientRequestId', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;

  const wxBox = createWxStub();
  const requestIds = [];
  let callCount = 0;

  global.wx = wxBox.api;

  try {
    const definition = loadPageDefinition(analyticsPagePath);
    const ctx = createPageContext(definition, { tournamentId: 't_clone' });

    storage.addRecentTournamentId = () => {};
    cloud.call = async (_name, payload) => {
      requestIds.push(payload.clientRequestId);
      callCount += 1;
      if (callCount === 1) throw new Error('network timeout');
      return { ok: true, tournamentId: 't_copy' };
    };

    await ctx.cloneCurrentTournament();
    await ctx.retryLastAction();

    assert.equal(requestIds.length, 2);
    assert.equal(requestIds[0], requestIds[1]);
    assert.match(String(requestIds[0] || ''), /^clone_/);
  } finally {
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    delete require.cache[analyticsPagePath];
  }
});

test('lobby saveMyProfile retry reuses the same clientRequestId', async () => {
  const originalWx = global.wx;
  const originalGetUserProfile = storage.getUserProfile;
  const originalSetUserProfile = storage.setUserProfile;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalCallJoinTournament = joinTournamentCore.callJoinTournament;
  const originalSaveCloudProfile = profileCore.saveCloudProfile;

  const wxBox = createWxStub();
  const requestIds = [];
  const profileRequestIds = [];
  let callCount = 0;
  let retryFn = null;

  global.wx = wxBox.api;

  try {
    storage.getUserProfile = () => ({ gender: 'male', nickName: '旧昵称', avatar: 'cloud://avatar/old' });
    storage.setUserProfile = () => {};
    nav.markRefreshFlag = () => {};
    joinTournamentCore.callJoinTournament = async (_payload, options = {}) => {
      requestIds.push(options.clientRequestId);
      callCount += 1;
      if (callCount === 1) throw new Error('network timeout');
      return { ok: true };
    };
    profileCore.saveCloudProfile = async (_profile, options = {}) => {
      profileRequestIds.push(options.clientRequestId);
      return { ok: true };
    };

    const ctx = createContext(lobbyProfileActions, {
      tournamentId: 't_profile_join',
      tournament: { status: 'draft' },
      mode: flow.MODE_MULTI_ROTATE,
      joinSquadChoice: 'A',
      myNickname: '新昵称',
      myAvatar: 'cloud://avatar/new',
      profileSaving: false,
      profileAvatarUploading: false,
      profileQuickFillLoading: false
    });
    ctx.fetchTournament = async () => {};
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = (_text, fn) => {
      retryFn = fn;
    };
    ctx.handleWriteError = () => {};

    await ctx.saveMyProfile();
    assert.equal(typeof retryFn, 'function');
    await retryFn();

    assert.equal(requestIds.length, 2);
    assert.equal(requestIds[0], requestIds[1]);
    assert.match(String(requestIds[0] || ''), /^join_profile_/);
    assert.deepEqual(profileRequestIds, [requestIds[1]]);
  } finally {
    global.wx = originalWx;
    storage.getUserProfile = originalGetUserProfile;
    storage.setUserProfile = originalSetUserProfile;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    joinTournamentCore.callJoinTournament = originalCallJoinTournament;
    profileCore.saveCloudProfile = originalSaveCloudProfile;
  }
});

test('lobby handleJoin saves joined profile to cloud profile with the join request id', async () => {
  const originalWx = global.wx;
  const originalGetUserProfile = storage.getUserProfile;
  const originalSetUserProfile = storage.setUserProfile;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;
  const originalEnsureJoinProfile = joinTournamentCore.ensureJoinProfile;
  const originalCallJoinTournament = joinTournamentCore.callJoinTournament;
  const originalSaveCloudProfile = profileCore.saveCloudProfile;

  const wxBox = createWxStub();
  const savedProfiles = [];
  const requestIds = [];

  global.wx = wxBox.api;

  try {
    storage.getUserProfile = () => ({ gender: 'female', nickName: '旧昵称', avatar: 'cloud://avatar/old' });
    storage.setUserProfile = () => {};
    nav.markRefreshFlag = () => {};
    nav.buildTournamentUrl = (path, tournamentId) => `${path}?tournamentId=${tournamentId}`;
    joinTournamentCore.ensureJoinProfile = async () => ({
      ok: true,
      profile: { nickName: '加入昵称', avatar: 'cloud://avatar/join', gender: 'male' }
    });
    joinTournamentCore.callJoinTournament = async (_payload, options = {}) => {
      requestIds.push(options.clientRequestId);
      return {
        ok: true,
        player: { id: 'u_join', name: '加入昵称', avatar: 'cloud://avatar/join', gender: 'male' }
      };
    };
    profileCore.saveCloudProfile = async (profile, options = {}) => {
      savedProfiles.push({ profile, clientRequestId: options.clientRequestId });
      return { ok: true };
    };

    const ctx = createContext(lobbyProfileActions, {
      tournamentId: 't_join_profile',
      mode: flow.MODE_MULTI_ROTATE,
      joinSquadChoice: 'A',
      nickname: '',
      joinAvatar: '',
      profileSaving: false,
      profileAvatarUploading: false,
      profileQuickFillLoading: false
    });
    ctx.fetchTournament = async () => {};
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = () => {};
    ctx.handleWriteError = () => {};

    await ctx.handleJoin();

    assert.equal(savedProfiles.length, 1);
    assert.equal(savedProfiles[0].clientRequestId, requestIds[0]);
    assert.deepEqual(savedProfiles[0].profile, {
      nickName: '加入昵称',
      avatar: 'cloud://avatar/join',
      gender: 'male'
    });
  } finally {
    global.wx = originalWx;
    storage.getUserProfile = originalGetUserProfile;
    storage.setUserProfile = originalSetUserProfile;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
    joinTournamentCore.ensureJoinProfile = originalEnsureJoinProfile;
    joinTournamentCore.callJoinTournament = originalCallJoinTournament;
    profileCore.saveCloudProfile = originalSaveCloudProfile;
  }
});

test('lobby profile cloud save failure keeps the tournament write successful and retryable', async () => {
  const originalWx = global.wx;
  const originalGetUserProfile = storage.getUserProfile;
  const originalSetUserProfile = storage.setUserProfile;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalCallJoinTournament = joinTournamentCore.callJoinTournament;
  const originalSaveCloudProfile = profileCore.saveCloudProfile;

  const wxBox = createWxStub();
  const profileRequestIds = [];
  const profileWrites = [];
  let retryFn = null;
  let writeErrors = 0;
  let saveAttempts = 0;

  global.wx = wxBox.api;

  try {
    storage.getUserProfile = () => ({ gender: 'male', nickName: '旧昵称', avatar: 'cloud://avatar/old' });
    storage.setUserProfile = (profile) => {
      profileWrites.push(profile);
      return true;
    };
    nav.markRefreshFlag = () => {};
    joinTournamentCore.callJoinTournament = async () => ({
      ok: true,
      player: { id: 'u_profile', name: '新昵称', avatar: 'cloud://avatar/new', gender: 'male' }
    });
    profileCore.saveCloudProfile = async (_profile, options = {}) => {
      profileRequestIds.push(options.clientRequestId);
      saveAttempts += 1;
      if (saveAttempts === 1) throw new Error('profile save timeout');
      return { ok: true };
    };

    const ctx = createContext(lobbyProfileActions, {
      tournamentId: 't_profile_join',
      tournament: { status: 'draft' },
      mode: flow.MODE_MULTI_ROTATE,
      joinSquadChoice: 'A',
      myNickname: '新昵称',
      myAvatar: 'cloud://avatar/new',
      profileSaving: false,
      profileAvatarUploading: false,
      profileQuickFillLoading: false
    });
    ctx.fetchTournament = async () => {};
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = (text, fn) => {
      assert.equal(text, '保存我的信息');
      retryFn = fn;
    };
    ctx.handleWriteError = () => {
      writeErrors += 1;
    };

    await ctx.saveMyProfile();

    assert.equal(writeErrors, 0);
    assert.deepEqual(profileWrites, []);
    assert.equal(typeof retryFn, 'function');
    await retryFn();
    assert.equal(profileRequestIds.length, 2);
    assert.equal(profileRequestIds[0], profileRequestIds[1]);
    assert.match(String(profileRequestIds[0] || ''), /^join_profile_/);
  } finally {
    global.wx = originalWx;
    storage.getUserProfile = originalGetUserProfile;
    storage.setUserProfile = originalSetUserProfile;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    joinTournamentCore.callJoinTournament = originalCallJoinTournament;
    profileCore.saveCloudProfile = originalSaveCloudProfile;
  }
});
