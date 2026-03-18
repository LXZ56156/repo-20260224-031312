const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');
const cloneTournamentCore = require('../miniprogram/core/cloneTournament');
const nav = require('../miniprogram/core/nav');
const {
  installFakeTimers,
  createDeferred,
  createWxStub,
  loadPageDefinition,
  createPageContext,
  settleTasks
} = require('./timeout-reentry.helpers');

const homePagePath = require.resolve('../miniprogram/pages/home/index.js');

test('home onCloneTap stays guarded after timeout while request is pending', async () => {
  const timers = installFakeTimers();
  const originalWx = global.wx;
  const originalCloneTournament = cloneTournamentCore.cloneTournament;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;

  const deferred = createDeferred();
  const wxBox = createWxStub();
  const tasks = [];
  const cloneCalls = [];

  global.wx = wxBox.api;

  try {
    const definition = loadPageDefinition(homePagePath);
    const ctx = createPageContext(definition);
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = () => {};
    ctx.loadRecents = async () => {};

    cloneTournamentCore.cloneTournament = async (sourceTournamentId, options) => {
      cloneCalls.push({ sourceTournamentId, options });
      await deferred.promise;
      return 't_clone_new';
    };
    nav.buildTournamentUrl = (path, tournamentId) => `${path}?tournamentId=${tournamentId}`;

    const event = { currentTarget: { dataset: { id: 't_clone' } } };
    const first = ctx.onCloneTap(event);
    tasks.push(first);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(cloneCalls.length, 1);

    await timers.flushAll();

    assert.equal(actionGuard.isBusy('home:cloneTournament:t_clone'), true);

    const second = ctx.onCloneTap(event);
    tasks.push(second);
    assert.equal(cloneCalls.length, 1);

    deferred.resolve();
    await settleTasks(tasks);

    assert.deepEqual(wxBox.loadingEvents, ['show:复制中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear('home:cloneTournament:t_clone');
    timers.restore();
    global.wx = originalWx;
    cloneTournamentCore.cloneTournament = originalCloneTournament;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
    delete require.cache[homePagePath];
  }
});
