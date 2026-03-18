const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');
const cloud = require('../miniprogram/core/cloud');
const flow = require('../miniprogram/core/uxFlow');
const lobbyPairTeamActions = require('../miniprogram/pages/lobby/lobbyPairTeamActions');
const {
  installFakeTimers,
  createDeferred,
  createWxStub,
  createContext,
  settleTasks
} = require('./timeout-reentry.helpers');

test('autoGeneratePairTeams stays guarded after timeout while request is pending', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const tasks = [];
  const busyTransitions = [];
  const calls = [];

  global.wx = wxBox.api;

  try {
    const ctx = createContext(lobbyPairTeamActions, {
      tournamentId: 't_pair',
      isAdmin: true,
      mode: flow.MODE_FIXED_PAIR_RR,
      pairTeamBusy: false
    });
    ctx.setData = function setData(update) {
      this.data = { ...this.data, ...(update || {}) };
      if (Object.prototype.hasOwnProperty.call(update || {}, 'pairTeamBusy')) {
        busyTransitions.push(this.data.pairTeamBusy);
      }
    };
    ctx.fetchTournament = async () => {};
    ctx.handleWriteError = () => {};

    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      await deferred.promise;
      return { ok: true, warnings: [] };
    };

    const first = ctx.autoGeneratePairTeams();
    tasks.push(first);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(ctx.data.pairTeamBusy, true);
    assert.equal(calls.length, 1);

    await timers.flushAll();

    assert.equal(ctx.data.pairTeamBusy, true);
    assert.equal(actionGuard.isBusy('lobby:managePairTeams:t_pair'), true);

    const second = ctx.autoGeneratePairTeams();
    tasks.push(second);
    assert.equal(calls.length, 1);

    deferred.resolve();
    await settleTasks(tasks);

    assert.equal(ctx.data.pairTeamBusy, false);
    assert.deepEqual(busyTransitions, [true, false]);
    assert.deepEqual(wxBox.loadingEvents, ['show:自动组队中...', 'hide']);
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
