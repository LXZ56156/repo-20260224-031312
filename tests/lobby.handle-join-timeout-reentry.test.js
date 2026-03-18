const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');
const joinTournamentCore = require('../miniprogram/core/joinTournament');
const nav = require('../miniprogram/core/nav');
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

test('lobby handleJoin keeps profileSaving true after timeout while request is pending', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalEnsureJoinProfile = joinTournamentCore.ensureJoinProfile;
  const originalCallJoinTournament = joinTournamentCore.callJoinTournament;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalGetUserProfile = storage.getUserProfile;
  const originalSetUserProfile = storage.setUserProfile;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const tasks = [];
  const busyTransitions = [];
  let joinCalls = 0;

  global.wx = wxBox.api;

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
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = () => {};
    ctx.handleWriteError = () => {};
    ctx.fetchTournament = async () => {};

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
    nav.markRefreshFlag = () => {};
    storage.getUserProfile = () => null;
    storage.setUserProfile = () => {};

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

    deferred.resolve();
    await settleTasks(tasks);

    assert.equal(ctx.data.profileSaving, false);
    assert.deepEqual(busyTransitions, [true, false]);
    assert.deepEqual(wxBox.loadingEvents, ['show:加入中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
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
  }
});
