const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');
const cloud = require('../miniprogram/core/cloud');
const nav = require('../miniprogram/core/nav');
const storage = require('../miniprogram/core/storage');
const profileCore = require('../miniprogram/core/profile');
const joinTournamentCore = require('../miniprogram/core/joinTournament');
const settingsActions = require('../miniprogram/pages/settings/settingsActions');
const lobbyDraftActions = require('../miniprogram/pages/lobby/lobbyDraftActions');
const lobbyPairTeamActions = require('../miniprogram/pages/lobby/lobbyPairTeamActions');
const lobbyProfileActions = require('../miniprogram/pages/lobby/lobbyProfileActions');
const flow = require('../miniprogram/core/uxFlow');

const createPagePath = require.resolve('../miniprogram/pages/create/index.js');
const shareEntryPagePath = require.resolve('../miniprogram/pages/share-entry/index.js');
const profilePagePath = require.resolve('../miniprogram/pages/profile/index.js');
const feedbackPagePath = require.resolve('../miniprogram/pages/feedback/index.js');
const analyticsPagePath = require.resolve('../miniprogram/pages/analytics/index.js');

function installFakeTimers() {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const queue = [];
  const active = new Set();

  global.setTimeout = (fn, delay) => {
    const handle = { fn, delay };
    active.add(handle);
    queue.push(handle);
    return handle;
  };
  global.clearTimeout = (handle) => {
    active.delete(handle);
  };

  return {
    async flushAll() {
      while (queue.length) {
        const handle = queue.shift();
        if (!active.has(handle)) continue;
        active.delete(handle);
        await handle.fn();
      }
    },
    restore() {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  };
}

function createDeferred() {
  let resolve = null;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createWxStub() {
  const loadingEvents = [];
  const pendingModalTasks = [];
  let loadingVisible = false;
  let hideWithoutVisibleError = null;

  return {
    loadingEvents,
    pendingModalTasks,
    getHideError() {
      return hideWithoutVisibleError;
    },
    api: {
      showLoading(options = {}) {
        loadingEvents.push(`show:${String(options.title || '')}`);
        loadingVisible = true;
      },
      hideLoading() {
        loadingEvents.push('hide');
        if (!loadingVisible) {
          hideWithoutVisibleError = new Error('hideLoading called without visible loading');
          throw hideWithoutVisibleError;
        }
        loadingVisible = false;
      },
      showToast() {},
      showModal(options = {}) {
        const task = options && typeof options.success === 'function'
          ? options.success({ confirm: true, cancel: false })
          : null;
        if (task && typeof task.then === 'function') pendingModalTasks.push(task);
      },
      navigateTo() {},
      redirectTo() {},
      navigateBack(options = {}) {
        if (typeof options.fail === 'function') options.fail();
      },
      switchTab() {},
      pageScrollTo() {},
      getStorageSync() {
        return undefined;
      },
      setStorageSync() {},
      removeStorageSync() {}
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

async function settleTasks(tasks) {
  await Promise.allSettled((tasks || []).filter((task) => task && typeof task.then === 'function'));
}

test('create handleCreate stays guarded after timeout while request is pending', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalEnsureProfileForAction = profileCore.ensureProfileForAction;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const calls = [];
  const tasks = [];

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
      endConditionTarget: 8,
      createBusy: false
    });

    profileCore.ensureProfileForAction = async () => ({
      ok: true,
      profile: {
        nickName: '发起人',
        avatar: 'cloud://avatar/create',
        gender: 'male'
      }
    });
    nav.buildTournamentUrl = (path, tournamentId) => `${path}?tournamentId=${tournamentId}`;
    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      return deferred.promise.then(() => ({ ok: true, tournamentId: 't_created' }));
    };

    const first = ctx.handleCreate();
    tasks.push(first);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(ctx.data.createBusy, true);
    assert.equal(calls.length, 1);

    await timers.flushAll();

    assert.equal(ctx.data.createBusy, true);
    assert.equal(actionGuard.isBusy('create:createTournament'), true);

    const second = ctx.handleCreate();
    tasks.push(second);
    assert.equal(calls.length, 1);

    deferred.resolve();
    await settleTasks(tasks);

    assert.equal(ctx.data.createBusy, false);
    assert.deepEqual(wxBox.loadingEvents, ['show:创建中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear('create:createTournament');
    timers.restore();
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    profileCore.ensureProfileForAction = originalEnsureProfileForAction;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
    delete require.cache[createPagePath];
  }
});

test('share-entry handleJoin keeps joinBusy true after timeout while request is pending', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalEnsureJoinProfile = joinTournamentCore.ensureJoinProfile;
  const originalCallJoinTournament = joinTournamentCore.callJoinTournament;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalSetUserProfile = storage.setUserProfile;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const tasks = [];
  let joinCalls = 0;

  global.wx = wxBox.api;

  try {
    const definition = loadPageDefinition(shareEntryPagePath);
    const ctx = createPageContext(definition, {
      tournamentId: 't_join',
      tournament: {
        _id: 't_join',
        status: 'draft',
        mode: flow.MODE_MULTI_ROTATE
      },
      joinBusy: false
    });
    ctx.fetchTournament = async () => {};
    ctx.goLobby = () => {};

    joinTournamentCore.ensureJoinProfile = async () => ({
      ok: true,
      profile: {
        nickName: '加入用户',
        avatar: 'cloud://avatar/join',
        gender: 'female'
      }
    });
    joinTournamentCore.callJoinTournament = async () => {
      joinCalls += 1;
      await deferred.promise;
      return { ok: true };
    };
    nav.markRefreshFlag = () => {};
    storage.setUserProfile = () => {};

    const first = ctx.handleJoin();
    tasks.push(first);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(ctx.data.joinBusy, true);
    assert.equal(joinCalls, 1);

    await timers.flushAll();

    assert.equal(ctx.data.joinBusy, true);
    assert.equal(actionGuard.isBusy('shareEntry:joinTournament:t_join'), true);

    const second = ctx.handleJoin();
    tasks.push(second);
    assert.equal(joinCalls, 1);

    deferred.resolve();
    await settleTasks(tasks);

    assert.equal(ctx.data.joinBusy, false);
    assert.deepEqual(wxBox.loadingEvents, ['show:加入中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear('shareEntry:joinTournament:t_join');
    timers.restore();
    global.wx = originalWx;
    joinTournamentCore.ensureJoinProfile = originalEnsureJoinProfile;
    joinTournamentCore.callJoinTournament = originalCallJoinTournament;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    storage.setUserProfile = originalSetUserProfile;
    delete require.cache[shareEntryPagePath];
  }
});

test('joinTournament core stays guarded after timeout while cloud request is pending', async () => {
  const timers = installFakeTimers();
  const originalCall = cloud.call;
  const deferred = createDeferred();
  const tasks = [];
  let callCount = 0;

  try {
    cloud.call = async () => {
      callCount += 1;
      await deferred.promise;
      return { ok: true };
    };

    const first = joinTournamentCore.callJoinTournament({ tournamentId: 't_join_core' }, {
      action: 'join',
      fallbackMessage: '加入失败'
    });
    tasks.push(first);
    assert.equal(callCount, 1);

    await timers.flushAll();

    assert.equal(actionGuard.isBusy('core:joinTournament:t_join_core'), true);

    const second = joinTournamentCore.callJoinTournament({ tournamentId: 't_join_core' }, {
      action: 'join',
      fallbackMessage: '加入失败'
    });
    tasks.push(second);
    assert.equal(callCount, 1);

    deferred.resolve();
    const [, secondResult] = await Promise.all(tasks);
    assert.equal(secondResult.ok, true);
    assert.equal(secondResult.deduped, true);
    assert.match(String(secondResult.clientRequestId || ''), /^join_/);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear('core:joinTournament:t_join_core');
    timers.restore();
    cloud.call = originalCall;
  }
});

test('settings saveSettings keeps settingsBusy until request settles after timeout', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalNavigateBackOrRedirect = nav.navigateBackOrRedirect;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const tasks = [];
  const calls = [];

  global.wx = wxBox.api;

  try {
    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      await deferred.promise;
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
      settingsBusy: false,
      mode: 'multi_rotate',
      allowOpenTeam: false
    });
    ctx.fetchTournament = async () => {};
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = () => {};
    ctx.handleWriteError = () => {};

    const first = ctx.saveSettings();
    tasks.push(first);
    assert.equal(ctx.data.settingsBusy, true);
    assert.equal(calls.length, 1);

    await timers.flushAll();

    assert.equal(ctx.data.settingsBusy, true);
    assert.equal(actionGuard.isBusy('settings:updateSettings:t_settings'), true);

    const second = ctx.saveSettings();
    tasks.push(second);
    assert.equal(calls.length, 1);

    deferred.resolve();
    await settleTasks(tasks);

    assert.equal(ctx.data.settingsBusy, false);
    assert.deepEqual(wxBox.loadingEvents, ['show:保存中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear('settings:updateSettings:t_settings');
    timers.restore();
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.navigateBackOrRedirect = originalNavigateBackOrRedirect;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
  }
});

test('lobby saveQuickSettings stays guarded after timeout while request is pending', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const tasks = [];
  const calls = [];

  global.wx = wxBox.api;

  try {
    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      await deferred.promise;
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
    ctx.setLastFailedAction = () => {};
    ctx.handleWriteError = () => {};

    const first = ctx.saveQuickSettings();
    tasks.push(first);
    assert.equal(calls.length, 1);

    await timers.flushAll();

    assert.equal(actionGuard.isBusy('lobby:updateSettings:t_lobby_settings'), true);

    const second = ctx.saveQuickSettings();
    tasks.push(second);
    assert.equal(calls.length, 1);

    deferred.resolve();
    await settleTasks(tasks);

    assert.deepEqual(wxBox.loadingEvents, ['show:保存中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear('lobby:updateSettings:t_lobby_settings');
    timers.restore();
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
  }
});

test('lobby quickImportPlayers stays guarded after timeout while request is pending', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const tasks = [];
  const calls = [];

  global.wx = wxBox.api;

  try {
    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      await deferred.promise;
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
    ctx.setLastFailedAction = () => {};
    ctx.handleWriteError = () => {};

    const first = ctx.quickImportPlayers();
    tasks.push(first);
    assert.equal(calls.length, 1);

    await timers.flushAll();

    assert.equal(actionGuard.isBusy('lobby:addPlayers:t_import'), true);

    const second = ctx.quickImportPlayers();
    tasks.push(second);
    assert.equal(calls.length, 1);

    deferred.resolve();
    await settleTasks(tasks);

    assert.deepEqual(wxBox.loadingEvents, ['show:导入中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear('lobby:addPlayers:t_import');
    timers.restore();
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
  }
});

test('analytics clone action stays guarded after timeout while request is pending', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const tasks = [];
  const calls = [];

  global.wx = wxBox.api;

  try {
    const definition = loadPageDefinition(analyticsPagePath);
    const ctx = createPageContext(definition, { tournamentId: 't_clone' });
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = () => {};

    storage.addRecentTournamentId = () => {};
    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      await deferred.promise;
      return { ok: true, tournamentId: 't_clone_new' };
    };

    const first = ctx.cloneCurrentTournament();
    tasks.push(first);
    assert.equal(calls.length, 1);

    await timers.flushAll();

    assert.equal(actionGuard.isBusy('analytics:cloneTournament:t_clone'), true);

    const second = ctx.cloneCurrentTournament();
    tasks.push(second);
    assert.equal(calls.length, 1);

    deferred.resolve();
    await settleTasks(tasks);

    assert.deepEqual(wxBox.loadingEvents, ['show:复制中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear('analytics:cloneTournament:t_clone');
    timers.restore();
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    delete require.cache[analyticsPagePath];
  }
});

test('lobby handleStart stays guarded after timeout while request is pending', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;
  const originalGetSchedulerProfile = storage.getSchedulerProfile;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const tasks = [];
  const calls = [];

  global.wx = wxBox.api;

  try {
    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      await deferred.promise;
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
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = () => {};
    ctx.handleWriteError = () => {};
    ctx.fetchTournament = async () => {};

    const first = ctx.handleStart();
    tasks.push(first);
    assert.equal(calls.length, 1);

    await timers.flushAll();

    assert.equal(actionGuard.isBusy('lobby:startTournament:t_start'), true);

    const second = ctx.handleStart();
    tasks.push(second);
    assert.equal(calls.length, 1);

    deferred.resolve();
    await settleTasks(tasks);

    assert.deepEqual(wxBox.loadingEvents, ['show:生成对阵...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear('lobby:startTournament:t_start');
    timers.restore();
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
    storage.getSchedulerProfile = originalGetSchedulerProfile;
  }
});

test('lobby cancelTournament stays guarded after timeout while request is pending', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalGoHome = nav.goHome;
  const originalRemoveRecentTournamentId = storage.removeRecentTournamentId;
  const originalRemoveSnapshot = storage.removeLocalCompletedTournamentSnapshot;
  const originalRemoveCache = storage.removeLocalTournamentCache;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const calls = [];

  global.wx = wxBox.api;

  try {
    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      await deferred.promise;
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
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = () => {};
    ctx.handleWriteError = () => {};
    ctx.fetchTournament = async () => {};

    ctx.cancelTournament();
    assert.equal(calls.length, 1);

    await timers.flushAll();

    assert.equal(actionGuard.isBusy('lobby:cancelTournament:t_cancel'), true);

    ctx.cancelTournament();
    assert.equal(calls.length, 1);

    deferred.resolve();
    await settleTasks(wxBox.pendingModalTasks);

    assert.deepEqual(wxBox.loadingEvents, ['show:取消中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    deferred.resolve();
    await settleTasks(wxBox.pendingModalTasks);
    actionGuard.clear('lobby:cancelTournament:t_cancel');
    timers.restore();
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.goHome = originalGoHome;
    storage.removeRecentTournamentId = originalRemoveRecentTournamentId;
    storage.removeLocalCompletedTournamentSnapshot = originalRemoveSnapshot;
    storage.removeLocalTournamentCache = originalRemoveCache;
  }
});

test('profile onSave keeps saving true after timeout while request is pending', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalProfileSave = profileCore.saveCloudProfile;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const tasks = [];

  global.wx = wxBox.api;

  try {
    const definition = loadPageDefinition(profilePagePath);
    const ctx = createPageContext(definition, {
      nickname: '球友A',
      gender: 'male',
      avatar: 'cloud://avatar/profile',
      pendingAvatarTempPath: '',
      avatarUploadFailed: false,
      saving: false,
      returnUrl: ''
    });
    ctx.validateProfile = () => ({ ok: true, nickname: '球友A', gender: 'male' });
    ctx.uploadPendingAvatar = async () => true;
    ctx.clearFieldError = () => {};
    ctx.setFieldError = () => {};

    profileCore.saveCloudProfile = async () => {
      await deferred.promise;
      return { nickName: '球友A' };
    };

    const first = ctx.onSave();
    tasks.push(first);
    assert.equal(ctx.data.saving, true);

    await timers.flushAll();

    assert.equal(ctx.data.saving, true);
    assert.equal(actionGuard.isBusy('profile:saveUserProfile'), true);

    const second = ctx.onSave();
    tasks.push(second);

    deferred.resolve();
    await settleTasks(tasks);

    assert.equal(ctx.data.saving, false);
    assert.deepEqual(wxBox.loadingEvents, ['show:保存中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear('profile:saveUserProfile');
    timers.restore();
    global.wx = originalWx;
    profileCore.saveCloudProfile = originalProfileSave;
    delete require.cache[profilePagePath];
  }
});

test('feedback onSubmit keeps submitting true after timeout while request is pending', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const tasks = [];
  const calls = [];

  global.wx = wxBox.api;

  try {
    const definition = loadPageDefinition(feedbackPagePath);
    const ctx = createPageContext(definition, {
      blocked: false,
      content: '这是一个足够长的反馈内容，用来验证 timeout reentry。',
      contentLength: 24,
      contact: 'wx:test',
      submitting: false
    });

    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      await deferred.promise;
      return { ok: true, feedbackId: 'fb_1' };
    };

    const first = ctx.onSubmit();
    tasks.push(first);
    assert.equal(ctx.data.submitting, true);
    assert.equal(calls.length, 1);

    await timers.flushAll();

    assert.equal(ctx.data.submitting, true);
    assert.equal(actionGuard.isBusy('feedback:submit'), true);

    const second = ctx.onSubmit();
    tasks.push(second);
    assert.equal(calls.length, 1);

    deferred.resolve();
    await settleTasks(tasks);

    assert.equal(ctx.data.submitting, false);
    assert.deepEqual(wxBox.loadingEvents, ['show:提交中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear('feedback:submit');
    timers.restore();
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    delete require.cache[feedbackPagePath];
  }
});

test('lobby saveMyProfile stays guarded after timeout while request is pending', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalGetUserProfile = storage.getUserProfile;
  const originalSetUserProfile = storage.setUserProfile;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalCallJoinTournament = joinTournamentCore.callJoinTournament;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const tasks = [];
  let joinCalls = 0;

  global.wx = wxBox.api;

  try {
    storage.getUserProfile = () => ({ gender: 'male', nickName: '旧昵称', avatar: 'cloud://avatar/old' });
    storage.setUserProfile = () => {};
    nav.markRefreshFlag = () => {};
    joinTournamentCore.callJoinTournament = async () => {
      joinCalls += 1;
      await deferred.promise;
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
    ctx.setLastFailedAction = () => {};
    ctx.handleWriteError = () => {};

    const first = ctx.saveMyProfile();
    tasks.push(first);
    assert.equal(ctx.data.profileSaving, true);
    assert.equal(joinCalls, 1);

    await timers.flushAll();

    assert.equal(ctx.data.profileSaving, true);
    assert.equal(actionGuard.isBusy('lobby:joinTournament:t_profile_join'), true);

    const second = ctx.saveMyProfile();
    tasks.push(second);
    assert.equal(joinCalls, 1);

    deferred.resolve();
    await settleTasks(tasks);

    assert.equal(ctx.data.profileSaving, false);
    assert.deepEqual(wxBox.loadingEvents, ['show:保存中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear('lobby:joinTournament:t_profile_join');
    timers.restore();
    global.wx = originalWx;
    storage.getUserProfile = originalGetUserProfile;
    storage.setUserProfile = originalSetUserProfile;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    joinTournamentCore.callJoinTournament = originalCallJoinTournament;
  }
});

test('lobby createPairTeam keeps pairTeamBusy true after timeout while request is pending', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const tasks = [];
  const calls = [];

  global.wx = wxBox.api;

  try {
    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      await deferred.promise;
      return { ok: true, pairTeams: [{ id: 'team_1', playerIds: ['u_1', 'u_2'] }] };
    };

    const ctx = createContext(lobbyPairTeamActions, {
      tournamentId: 't_pair',
      isAdmin: true,
      mode: flow.MODE_FIXED_PAIR_RR,
      pairTeamBusy: false,
      pairTeamName: '晨风',
      pairTeamCandidates: [
        { id: 'u_1', name: 'A' },
        { id: 'u_2', name: 'B' }
      ],
      pairTeamFirstIndex: 0,
      pairTeamSecondIndex: 1
    });
    ctx.fetchTournament = async () => {};
    ctx.handleWriteError = () => {};

    const first = ctx.createPairTeam();
    tasks.push(first);
    assert.equal(ctx.data.pairTeamBusy, true);
    assert.equal(calls.length, 1);

    await timers.flushAll();

    assert.equal(ctx.data.pairTeamBusy, true);
    assert.equal(actionGuard.isBusy('lobby:managePairTeams:t_pair'), true);

    const second = ctx.createPairTeam();
    tasks.push(second);
    assert.equal(calls.length, 1);

    deferred.resolve();
    await settleTasks(tasks);

    assert.equal(ctx.data.pairTeamBusy, false);
    assert.deepEqual(wxBox.loadingEvents, ['show:创建队伍...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear('lobby:managePairTeams:t_pair');
    timers.restore();
    global.wx = originalWx;
    cloud.call = originalCloudCall;
  }
});

test('lobby setPlayerSquad stays guarded after timeout while request is pending', async () => {
  const timers = installFakeTimers();
  const originalCloudCall = cloud.call;
  const deferred = createDeferred();
  const tasks = [];
  const calls = [];

  try {
    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      await deferred.promise;
      return { ok: true };
    };

    const ctx = createContext(lobbyDraftActions, {
      tournamentId: 't_squad',
      isAdmin: true,
      mode: flow.MODE_SQUAD_DOUBLES,
      tournament: { status: 'draft' },
      displayPlayers: [{ id: 'p_1', squad: 'A' }]
    });
    ctx.fetchTournament = async () => {};

    const event = { currentTarget: { dataset: { player: 'p_1' } } };
    const first = ctx.onTogglePlayerSquad(event);
    tasks.push(first);
    assert.equal(calls.length, 1);

    await timers.flushAll();

    assert.equal(actionGuard.isBusy('lobby:setPlayerSquad:t_squad:p_1'), true);

    const second = ctx.onTogglePlayerSquad(event);
    tasks.push(second);
    assert.equal(calls.length, 1);

    deferred.resolve();
    await settleTasks(tasks);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear('lobby:setPlayerSquad:t_squad:p_1');
    timers.restore();
    cloud.call = originalCloudCall;
  }
});
