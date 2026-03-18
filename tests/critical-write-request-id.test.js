const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');
const nav = require('../miniprogram/core/nav');
const profileCore = require('../miniprogram/core/profile');
const storage = require('../miniprogram/core/storage');
const joinTournamentCore = require('../miniprogram/core/joinTournament');
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
      name: '周末比赛',
      totalMatches: 8,
      courts: 2,
      quickPresetKey: 'standard',
      pointsPerGame: 21,
      endConditionType: 'total_matches',
      endConditionTarget: 8
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
  const requestIds = [];
  let callCount = 0;
  let retryFn = null;

  global.wx = wxBox.api;
  global.setTimeout = () => 1;
  global.clearTimeout = () => {};

  try {
    cloud.call = async (_name, payload) => {
      requestIds.push(payload.clientRequestId);
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
      tournament: { status: 'draft', players: [] },
      name: '周二场',
      maxMatches: 0,
      editM: 1,
      editC: 1,
      pointsPerGame: 21,
      endConditionType: 'total_matches',
      endConditionTarget: 1,
      endConditionTargetOptions: [1],
      showSquadEndCondition: false,
      mode: 'multi_rotate',
      allowOpenTeam: false
    });
    ctx.fetchTournament = async () => {};
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = (_text, fn) => {
      retryFn = fn;
    };
    ctx.handleWriteError = () => {};

    await ctx.saveSettings();
    assert.equal(typeof retryFn, 'function');
    await retryFn();

    assert.equal(requestIds.length, 2);
    assert.equal(requestIds[0], requestIds[1]);
    assert.match(String(requestIds[0] || ''), /^update_settings_/);
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
      tournament: { status: 'draft' },
      quickConfigM: 4,
      quickConfigC: 2,
      maxMatches: 0,
      allowOpenTeam: false
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

  const wxBox = createWxStub();
  const requestIds = [];
  let callCount = 0;
  let retryFn = null;

  global.wx = wxBox.api;
  global.setTimeout = () => 1;

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

  const wxBox = createWxStub();
  const requestIds = [];
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
  } finally {
    global.wx = originalWx;
    storage.getUserProfile = originalGetUserProfile;
    storage.setUserProfile = originalSetUserProfile;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    joinTournamentCore.callJoinTournament = originalCallJoinTournament;
  }
});
