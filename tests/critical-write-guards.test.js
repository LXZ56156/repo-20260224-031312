const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');
const cloud = require('../miniprogram/core/cloud');
const cloneTournamentCore = require('../miniprogram/core/cloneTournament');
const nav = require('../miniprogram/core/nav');
const profileCore = require('../miniprogram/core/profile');
const storage = require('../miniprogram/core/storage');
const flow = require('../miniprogram/core/uxFlow');
const settingsActions = require('../miniprogram/pages/settings/settingsActions');
const lobbyDraftActions = require('../miniprogram/pages/lobby/lobbyDraftActions');
const lobbyLifecycleActions = require('../miniprogram/pages/lobby/lobbyLifecycleActions');
const lobbyPairTeamActions = require('../miniprogram/pages/lobby/lobbyPairTeamActions');

const profilePagePath = require.resolve('../miniprogram/pages/profile/index.js');

function createDeferred() {
  let resolve = null;
  let reject = null;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createContext(methods, data) {
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

function buildWxStub() {
  const pendingModalTasks = [];
  return {
    pendingModalTasks,
    api: {
      showLoading() {},
      hideLoading() {},
      showToast() {},
      navigateTo() {},
      switchTab() {},
      redirectTo() {},
      navigateBack() {},
      pageScrollTo() {},
      showModal(options = {}) {
        const task = options && typeof options.success === 'function'
          ? options.success({ confirm: true, cancel: false })
          : null;
        if (task && typeof task.then === 'function') pendingModalTasks.push(task);
      }
    }
  };
}

test('settings saveSettings deduplicates repeated taps', async () => {
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalNavigateBackOrRedirect = nav.navigateBackOrRedirect;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;

  const deferred = createDeferred();
  const calls = [];
  const { api: wxStub } = buildWxStub();
  global.wx = wxStub;
  global.setTimeout = (fn) => {
    fn();
    return 1;
  };
  global.clearTimeout = () => {};

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
      tournament: {
        status: 'draft',
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
      settingsBusy: false,
      mode: 'multi_rotate',
      allowOpenTeam: false,
      canConfigureSettings: true
    });
    ctx.fetchTournament = async () => {};
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = () => {};

    const first = ctx.saveSettings();
    const second = ctx.saveSettings();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'updateSettings');

    deferred.resolve();
    await Promise.all([first, second]);

    assert.equal(calls.length, 1);
    assert.equal(ctx.data.settingsBusy, false);
  } finally {
    actionGuard.clear('settings:updateSettings:t_settings');
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.navigateBackOrRedirect = originalNavigateBackOrRedirect;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
  }
});

test('lobby handleStart deduplicates repeated taps', async () => {
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;
  const originalSchedulerProfile = storage.getSchedulerProfile;

  const deferred = createDeferred();
  const calls = [];
  const { api: wxStub } = buildWxStub();
  global.wx = wxStub;
  global.setTimeout = (fn) => {
    fn();
    return 1;
  };

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
    const second = ctx.handleStart();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'startTournament');
    assert.equal(calls[0].payload.schedulerProfile, 'balanced');

    deferred.resolve();
    await Promise.all([first, second]);

    assert.equal(calls.length, 1);
  } finally {
    actionGuard.clear('lobby:startTournament:t_start');
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
    storage.getSchedulerProfile = originalSchedulerProfile;
  }
});

test('lobby cancelTournament deduplicates repeated taps after confirm', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalGoHome = nav.goHome;
  const originalRemoveRecentTournamentId = storage.removeRecentTournamentId;
  const originalRemoveSnapshot = storage.removeLocalCompletedTournamentSnapshot;
  const originalRemoveCache = storage.removeLocalTournamentCache;

  const deferred = createDeferred();
  const calls = [];
  const wxBox = buildWxStub();
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
    ctx.cancelTournament();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'deleteTournament');

    deferred.resolve();
    await Promise.all(wxBox.pendingModalTasks);

    assert.equal(calls.length, 1);
  } finally {
    actionGuard.clear('lobby:cancelTournament:t_cancel');
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.goHome = originalGoHome;
    storage.removeRecentTournamentId = originalRemoveRecentTournamentId;
    storage.removeLocalCompletedTournamentSnapshot = originalRemoveSnapshot;
    storage.removeLocalTournamentCache = originalRemoveCache;
  }
});

test('lobby onPlayerLongPress deduplicates repeated remove confirmations', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;

  const deferred = createDeferred();
  const calls = [];
  const wxBox = buildWxStub();
  let clearRetryCalls = 0;
  let fetchCalls = 0;
  let refreshFlags = 0;
  let retryCalls = 0;
  let toastCalls = 0;
  global.wx = wxBox.api;
  global.wx.showToast = () => {
    toastCalls += 1;
  };

  try {
    nav.markRefreshFlag = () => {
      refreshFlags += 1;
    };
    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      await deferred.promise;
      return { ok: true, state: 'removed' };
    };

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
    ctx._lifecycleGeneration = 0;
    ctx.openid = 'u_admin';
    ctx.fetchTournament = async () => {
      fetchCalls += 1;
    };
    ctx.clearLastFailedAction = () => {
      clearRetryCalls += 1;
    };
    ctx.setLastFailedAction = () => {
      retryCalls += 1;
    };
    ctx.handleWriteError = () => {};

    const event = { currentTarget: { dataset: { player: 'p_remove', name: '待移除' } } };
    ctx.onPlayerLongPress(event);
    ctx.onPlayerLongPress(event);
    await Promise.resolve();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'removePlayer');
    assert.equal(calls[0].payload.playerId, 'p_remove');

    ctx._lifecycleGeneration += 1;
    deferred.resolve();
    await Promise.all(wxBox.pendingModalTasks);

    assert.equal(calls.length, 1);
    assert.equal(clearRetryCalls, 0);
    assert.equal(retryCalls, 0);
    assert.equal(fetchCalls, 0);
    assert.equal(refreshFlags, 0);
    assert.equal(toastCalls, 0);
  } finally {
    actionGuard.clear('lobby:removePlayer:t_remove:p_remove');
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
  }
});

test('lobby onPlayerLongPress ignores another player for non-admin members', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  let modalCalls = 0;
  let cloudCalls = 0;

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast() {},
    showModal() {
      modalCalls += 1;
    }
  };

  try {
    cloud.call = async () => {
      cloudCalls += 1;
      return { ok: true };
    };
    const ctx = createContext(lobbyDraftActions, {
      tournamentId: 't_remove',
      tournament: {
        status: 'draft',
        players: [
          { id: 'u_member', name: '自己' },
          { id: 'p_other', name: '别人' }
        ]
      },
      isAdmin: false,
      displayPlayers: [
        { id: 'u_member', name: '自己' },
        { id: 'p_other', name: '别人' }
      ]
    });
    ctx.openid = 'u_member';

    await ctx.onPlayerLongPress({ currentTarget: { dataset: { player: 'p_other', name: '别人' } } });

    assert.equal(modalCalls, 0);
    assert.equal(cloudCalls, 0);
  } finally {
    global.wx = originalWx;
    cloud.call = originalCloudCall;
  }
});

test('lobby onPlayerLongPress lets member remove self with exit copy', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const modalCalls = [];
  const toastCalls = [];
  const calls = [];
  let fetchCount = 0;

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast(options = {}) {
      toastCalls.push(options);
    },
    showModal(options = {}) {
      modalCalls.push(options);
      if (typeof options.success === 'function') {
        return options.success({ confirm: true, cancel: false });
      }
      return undefined;
    }
  };

  try {
    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      return { ok: true, state: 'removed' };
    };
    const ctx = createContext(lobbyDraftActions, {
      tournamentId: 't_remove_self',
      tournament: {
        status: 'draft',
        players: [
          { id: 'u_admin', name: '管理员' },
          { id: 'u_member', name: '自己' }
        ]
      },
      isAdmin: false,
      displayPlayers: [
        { id: 'u_admin', name: '管理员' },
        { id: 'u_member', name: '自己' }
      ]
    });
    ctx.openid = 'u_member';
    ctx.fetchTournament = async () => {
      fetchCount += 1;
    };
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = () => {};
    ctx.handleWriteError = () => {};

    await ctx.onPlayerLongPress({ currentTarget: { dataset: { player: 'u_member', name: '自己' } } });
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(modalCalls.length, 1);
    assert.equal(modalCalls[0].title, '退出参赛？');
    assert.equal(modalCalls[0].confirmText, '退出');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'removePlayer');
    assert.equal(calls[0].payload.playerId, 'u_member');
    assert.equal(toastCalls[0].title, '已退出参赛');
    assert.equal(fetchCount, 1);
  } finally {
    actionGuard.clear('lobby:removePlayer:t_remove_self:u_member');
    global.wx = originalWx;
    cloud.call = originalCloudCall;
  }
});

test('lobby onPlayerLongPress ignores non-draft tournaments', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  let modalCalls = 0;
  let cloudCalls = 0;

  global.wx = {
    showModal() {
      modalCalls += 1;
    }
  };

  try {
    cloud.call = async () => {
      cloudCalls += 1;
      return { ok: true };
    };
    const ctx = createContext(lobbyDraftActions, {
      tournamentId: 't_running',
      tournament: { status: 'running', players: [{ id: 'u_admin', name: '管理员' }] },
      isAdmin: true,
      displayPlayers: [{ id: 'u_admin', name: '管理员' }]
    });
    ctx.openid = 'u_admin';

    await ctx.onPlayerLongPress({ currentTarget: { dataset: { player: 'u_admin', name: '管理员' } } });

    assert.equal(modalCalls, 0);
    assert.equal(cloudCalls, 0);
  } finally {
    global.wx = originalWx;
    cloud.call = originalCloudCall;
  }
});

test('lobby player longpress suppresses following squad tap', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  let cloudCalls = 0;

  global.wx = {
    showModal(options = {}) {
      if (typeof options.success === 'function') {
        options.success({ confirm: false, cancel: true });
      }
    },
    showToast() {}
  };

  try {
    cloud.call = async () => {
      cloudCalls += 1;
      return { ok: true };
    };
    const ctx = createContext(lobbyDraftActions, {
      tournamentId: 't_squad',
      tournament: {
        status: 'draft',
        players: [
          { id: 'u_admin', name: '管理员', squad: 'A' },
          { id: 'p_other', name: '别人', squad: 'B' }
        ]
      },
      isAdmin: true,
      mode: flow.MODE_SQUAD_DOUBLES,
      displayPlayers: [
        { id: 'u_admin', name: '管理员', squad: 'A' },
        { id: 'p_other', name: '别人', squad: 'B' }
      ]
    });
    ctx.openid = 'u_admin';

    const event = { currentTarget: { dataset: { player: 'p_other', name: '别人' } } };
    await ctx.onPlayerLongPress(event);
    await ctx.onTogglePlayerSquad(event);

    assert.equal(cloudCalls, 0);
  } finally {
    actionGuard.clear('lobby:setPlayerSquad:t_squad:p_other');
    global.wx = originalWx;
    cloud.call = originalCloudCall;
  }
});

test('lobby createPairTeam deduplicates repeated taps', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;

  const deferred = createDeferred();
  const calls = [];
  const { api: wxStub } = buildWxStub();
  global.wx = wxStub;

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
    const second = ctx.createPairTeam();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'managePairTeams');
    assert.equal(calls[0].payload.action, 'create');

    deferred.resolve();
    await Promise.all([first, second]);

    assert.equal(calls.length, 1);
    assert.equal(ctx.data.pairTeamBusy, false);
  } finally {
    actionGuard.clear('lobby:managePairTeams:t_pair');
    global.wx = originalWx;
    cloud.call = originalCloudCall;
  }
});

test('profile onSave deduplicates repeated taps', async () => {
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  const originalProfileSave = profileCore.saveCloudProfile;

  const deferred = createDeferred();
  let saveCalls = 0;
  const { api: wxStub } = buildWxStub();
  global.wx = wxStub;
  global.setTimeout = (fn) => {
    fn();
    return 1;
  };

  try {
    profileCore.saveCloudProfile = async () => {
      saveCalls += 1;
      await deferred.promise;
      return { nickName: '球友A' };
    };

    const definition = loadProfilePageDefinition();
    const ctx = createContext(definition, {
      nickname: '球友A',
      gender: 'male',
      avatar: 'cloud://avatar',
      pendingAvatarTempPath: '',
      avatarUploadFailed: false,
      saving: false,
      returnUrl: ''
    });
    ctx.validateProfile = () => ({ ok: true, nickname: '球友A', gender: 'male' });
    ctx.uploadPendingAvatar = async () => true;
    ctx.clearFieldError = () => {};
    ctx.setFieldError = () => {};

    const first = ctx.onSave();
    const second = ctx.onSave();

    assert.equal(saveCalls, 1);
    assert.equal(ctx.data.saving, true);

    deferred.resolve();
    await Promise.all([first, second]);

    assert.equal(saveCalls, 1);
    assert.equal(ctx.data.saving, false);
  } finally {
    actionGuard.clear('profile:saveUserProfile');
    delete require.cache[profilePagePath];
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
    profileCore.saveCloudProfile = originalProfileSave;
  }
});

test('lobby clone drops success and failure effects after leaving the page', async () => {
  const originalWx = global.wx;
  const originalCloneTournament = cloneTournamentCore.cloneTournament;
  const originalGoLobby = nav.goLobby;
  const successDeferred = createDeferred();
  const failureDeferred = createDeferred();
  const { api: wxStub } = buildWxStub();
  const effects = [];

  wxStub.showToast = () => effects.push('toast');
  global.wx = wxStub;
  nav.goLobby = () => effects.push('navigate');

  function makeContext(tournamentId) {
    const ctx = createContext(lobbyLifecycleActions, { tournamentId });
    ctx._lifecycleGeneration = 0;
    ctx.clearLastFailedAction = () => effects.push('clear-retry');
    ctx.setLastFailedAction = () => effects.push('set-retry');
    ctx.handleWriteError = () => effects.push('error');
    ctx.fetchTournament = async () => effects.push('fetch');
    return ctx;
  }

  try {
    cloneTournamentCore.cloneTournament = async () => {
      await successDeferred.promise;
      return 't_clone_new';
    };
    const successCtx = makeContext('t_clone_success');
    const successTask = successCtx.cloneCurrentTournament();
    await Promise.resolve();
    successCtx._lifecycleGeneration += 1;
    successDeferred.resolve();
    await successTask;

    cloneTournamentCore.cloneTournament = () => failureDeferred.promise;
    const failureCtx = makeContext('t_clone_failure');
    const failureTask = failureCtx.cloneCurrentTournament();
    await Promise.resolve();
    failureCtx._lifecycleGeneration += 1;
    failureDeferred.reject(new Error('clone failed'));
    await failureTask;

    assert.deepEqual(effects, []);
  } finally {
    successDeferred.resolve();
    failureDeferred.resolve();
    actionGuard.clear('lobby:cloneTournament:t_clone_success');
    actionGuard.clear('lobby:cloneTournament:t_clone_failure');
    global.wx = originalWx;
    cloneTournamentCore.cloneTournament = originalCloneTournament;
    nav.goLobby = originalGoLobby;
  }
});
