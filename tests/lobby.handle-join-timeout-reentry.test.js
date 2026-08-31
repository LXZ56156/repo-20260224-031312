const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');
const joinTournamentCore = require('../miniprogram/core/joinTournament');
const nav = require('../miniprogram/core/nav');
const profileCore = require('../miniprogram/core/profile');
const storage = require('../miniprogram/core/storage');
const flow = require('../miniprogram/core/uxFlow');
const lobbyProfileActions = require('../miniprogram/pages/lobby/lobbyProfileActions');
const {
  installFakeTimers,
  createDeferred,
  createWxStub,
  createContext,
  settleTasks
} = require('./timeout-reentry.helpers');

test('lobby handleJoin keeps profileSaving guarded and drops hidden-page success effects', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalEnsureJoinProfile = joinTournamentCore.ensureJoinProfile;
  const originalCallJoinTournament = joinTournamentCore.callJoinTournament;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalGetUserProfile = storage.getUserProfile;
  const originalSetUserProfile = storage.setUserProfile;
  const originalSaveCloudProfile = profileCore.saveCloudProfile;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const tasks = [];
  const busyTransitions = [];
  let clearRetryCalls = 0;
  let fetchCalls = 0;
  let joinCalls = 0;
  let profileSaveCalls = 0;
  let refreshFlags = 0;
  let toastCalls = 0;

  global.wx = wxBox.api;
  global.wx.showToast = () => {
    toastCalls += 1;
  };

  try {
    const ctx = createContext(lobbyProfileActions, {
      tournamentId: 't_join',
      mode: flow.MODE_MULTI_ROTATE,
      joinSquadChoice: '',
      nickname: '',
      joinAvatar: '',
      profileSaving: false,
      profileAvatarUploading: false,
      profileQuickFillLoading: false,
      profileFieldError: 'old'
    });
    ctx.setData = function setData(update) {
      this.data = { ...this.data, ...(update || {}) };
      if (Object.prototype.hasOwnProperty.call(update || {}, 'profileSaving')) {
        busyTransitions.push(this.data.profileSaving);
      }
    };
    ctx._lifecycleGeneration = 0;
    ctx.clearLastFailedAction = () => {
      clearRetryCalls += 1;
    };
    ctx.setLastFailedAction = () => {};
    ctx.handleWriteError = () => {};
    ctx.fetchTournament = async () => {
      fetchCalls += 1;
    };

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
    nav.buildTournamentUrl = (path, tournamentId) => `${path}?tournamentId=${tournamentId}`;
    nav.markRefreshFlag = () => {
      refreshFlags += 1;
    };
    storage.getUserProfile = () => null;
    storage.setUserProfile = () => {};
    profileCore.saveCloudProfile = async () => {
      profileSaveCalls += 1;
      return { ok: true };
    };

    const first = ctx.handleJoin();
    tasks.push(first);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(ctx.data.profileSaving, true);
    assert.equal(joinCalls, 1);

    await timers.flushAll();

    assert.equal(ctx.data.profileSaving, true);
    assert.equal(actionGuard.isBusy('lobby:joinTournament:t_join'), true);

    const second = ctx.handleJoin();
    tasks.push(second);
    assert.equal(joinCalls, 1);

    ctx._lifecycleGeneration += 1;
    deferred.resolve();
    await settleTasks(tasks);

    assert.equal(ctx.data.profileSaving, false);
    assert.deepEqual(busyTransitions, [true, false]);
    assert.deepEqual(wxBox.loadingEvents, ['show:加入中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
    assert.equal(profileSaveCalls, 0);
    assert.equal(clearRetryCalls, 0);
    assert.equal(fetchCalls, 0);
    assert.equal(refreshFlags, 0);
    assert.equal(toastCalls, 0);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear('lobby:joinTournament:t_join');
    timers.restore();
    global.wx = originalWx;
    joinTournamentCore.ensureJoinProfile = originalEnsureJoinProfile;
    joinTournamentCore.callJoinTournament = originalCallJoinTournament;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    storage.getUserProfile = originalGetUserProfile;
    storage.setUserProfile = originalSetUserProfile;
    profileCore.saveCloudProfile = originalSaveCloudProfile;
  }
});

test('lobby handleJoin does not start joining after its profile gate becomes stale', async () => {
  const originalWx = global.wx;
  const originalEnsureJoinProfile = joinTournamentCore.ensureJoinProfile;
  const originalCallJoinTournament = joinTournamentCore.callJoinTournament;
  const gateDeferred = createDeferred();
  const wxBox = createWxStub();
  let joinCalls = 0;
  let toastCalls = 0;

  global.wx = wxBox.api;
  global.wx.showToast = () => {
    toastCalls += 1;
  };

  try {
    const ctx = createContext(lobbyProfileActions, {
      tournamentId: 't_join_gate',
      mode: flow.MODE_MULTI_ROTATE,
      joinSquadChoice: '',
      nickname: '',
      joinAvatar: '',
      profileSaving: false,
      profileAvatarUploading: false,
      profileQuickFillLoading: false,
      profileFieldError: ''
    });
    ctx._lifecycleGeneration = 0;
    joinTournamentCore.ensureJoinProfile = () => gateDeferred.promise;
    joinTournamentCore.callJoinTournament = async () => {
      joinCalls += 1;
      return { ok: true };
    };

    const pending = ctx.handleJoin();
    await Promise.resolve();
    ctx._lifecycleGeneration += 1;
    gateDeferred.resolve({ ok: true, profile: { nickName: '过期资料' } });
    await pending;

    assert.equal(joinCalls, 0);
    assert.equal(toastCalls, 0);
    assert.equal(ctx.data.profileSaving, false);
  } finally {
    gateDeferred.resolve({ ok: false });
    actionGuard.clear('lobby:joinTournament:t_join_gate');
    global.wx = originalWx;
    joinTournamentCore.ensureJoinProfile = originalEnsureJoinProfile;
    joinTournamentCore.callJoinTournament = originalCallJoinTournament;
  }
});
