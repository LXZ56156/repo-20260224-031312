const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');
const cloud = require('../miniprogram/core/cloud');
const nav = require('../miniprogram/core/nav');
const profileCore = require('../miniprogram/core/profile');
const storage = require('../miniprogram/core/storage');
const flow = require('../miniprogram/core/uxFlow');
const settingsActions = require('../miniprogram/pages/settings/settingsActions');
const lobbyDraftActions = require('../miniprogram/pages/lobby/lobbyDraftActions');
const lobbyPairTeamActions = require('../miniprogram/pages/lobby/lobbyPairTeamActions');

const profilePagePath = require.resolve('../miniprogram/pages/profile/index.js');

function createDeferred() {
  let resolve = null;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
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
