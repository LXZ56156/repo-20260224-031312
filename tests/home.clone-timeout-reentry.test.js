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
const homeCloneActionKey = 'home:cloneTournament';

function prepareHomeContext(definition) {
  const ctx = createPageContext(definition);
  ctx.clearLastFailedAction = () => {};
  ctx.setLastFailedAction = () => {};
  ctx.handleWriteError = () => {};
  ctx.loadRecents = async () => {};
  ctx.refreshUiPreferences = () => {};
  ctx.refreshProfileNudgeState = () => {};
  ctx.refreshHomeAdSlot = () => {};
  return ctx;
}

test('home onCloneTap keeps one clone flow pending and through successful navigation', async () => {
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
    const ctx = prepareHomeContext(definition);

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

    assert.equal(actionGuard.isBusy(homeCloneActionKey), true);

    const second = ctx.onCloneTap(event);
    const other = ctx.onCloneTap({ currentTarget: { dataset: { id: 't_clone_other' } } });
    tasks.push(second);
    tasks.push(other);
    assert.equal(cloneCalls.length, 1);

    deferred.resolve();
    await settleTasks(tasks);

    await ctx.onCloneTap({ currentTarget: { dataset: { id: 't_clone_after_success' } } });
    assert.equal(cloneCalls.length, 1);

    assert.deepEqual(wxBox.loadingEvents, ['show:复制中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    deferred.resolve();
    await settleTasks(tasks);
    actionGuard.clear(homeCloneActionKey);
    timers.restore();
    global.wx = originalWx;
    cloneTournamentCore.cloneTournament = originalCloneTournament;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
    delete require.cache[homePagePath];
  }
});

test('home releases the clone flow when opening the copied tournament fails', async () => {
  const originalWx = global.wx;
  const originalCloneTournament = cloneTournamentCore.cloneTournament;
  const wxBox = createWxStub();
  let cloneCalls = 0;

  wxBox.api.navigateTo = (options = {}) => {
    if (typeof options.fail === 'function') options.fail(new Error('navigation failed'));
  };
  global.wx = wxBox.api;

  try {
    const definition = loadPageDefinition(homePagePath);
    const ctx = prepareHomeContext(definition);
    cloneTournamentCore.cloneTournament = async () => {
      cloneCalls += 1;
      return `t_clone_new_${cloneCalls}`;
    };

    ctx.onShow();
    await ctx.onCloneTap({ currentTarget: { dataset: { id: 't_clone_1' } } });
    await ctx.onCloneTap({ currentTarget: { dataset: { id: 't_clone_2' } } });

    assert.equal(cloneCalls, 2);
    assert.equal(ctx._cloneFlowActive, false);
  } finally {
    actionGuard.clear(homeCloneActionKey);
    global.wx = originalWx;
    cloneTournamentCore.cloneTournament = originalCloneTournament;
    delete require.cache[homePagePath];
  }
});

test('home ignores a late clone success after hide and show', async () => {
  const originalWx = global.wx;
  const originalCloneTournament = cloneTournamentCore.cloneTournament;
  const originalGoLobby = nav.goLobby;
  const deferred = createDeferred();
  const wxBox = createWxStub();
  const effects = [];

  wxBox.api.showToast = () => effects.push('toast');
  global.wx = wxBox.api;

  try {
    const definition = loadPageDefinition(homePagePath);
    const ctx = prepareHomeContext(definition);
    ctx.clearLastFailedAction = () => effects.push('clear-retry');
    ctx.setLastFailedAction = () => effects.push('set-retry');
    ctx.handleWriteError = () => effects.push('error');
    cloneTournamentCore.cloneTournament = async () => {
      await deferred.promise;
      return 't_clone_late';
    };
    nav.goLobby = () => effects.push('navigate');

    ctx.onShow();
    const pending = ctx.onCloneTap({ currentTarget: { dataset: { id: 't_clone' } } });
    await Promise.resolve();
    ctx.onHide();
    ctx.onShow();
    deferred.resolve();
    await pending;

    assert.deepEqual(effects, []);
    assert.deepEqual(wxBox.loadingEvents, ['show:复制中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    deferred.resolve();
    actionGuard.clear(homeCloneActionKey);
    global.wx = originalWx;
    cloneTournamentCore.cloneTournament = originalCloneTournament;
    nav.goLobby = originalGoLobby;
    delete require.cache[homePagePath];
  }
});

test('home ignores a late clone failure after hide and show', async () => {
  const originalWx = global.wx;
  const originalCloneTournament = cloneTournamentCore.cloneTournament;
  const wxBox = createWxStub();
  const effects = [];
  let rejectClone = null;

  wxBox.api.showToast = () => effects.push('toast');
  global.wx = wxBox.api;

  try {
    const definition = loadPageDefinition(homePagePath);
    const ctx = prepareHomeContext(definition);
    ctx.clearLastFailedAction = () => effects.push('clear-retry');
    ctx.setLastFailedAction = () => effects.push('set-retry');
    ctx.handleWriteError = () => effects.push('error');
    cloneTournamentCore.cloneTournament = () => new Promise((_resolve, reject) => {
      rejectClone = reject;
    });

    ctx.onShow();
    const pending = ctx.onCloneTap({ currentTarget: { dataset: { id: 't_clone' } } });
    await Promise.resolve();
    ctx.onHide();
    ctx.onShow();
    rejectClone(new Error('clone failed'));
    await pending;

    assert.deepEqual(effects, []);
    assert.deepEqual(wxBox.loadingEvents, ['show:复制中...', 'hide']);
    assert.equal(wxBox.getHideError(), null);
  } finally {
    actionGuard.clear(homeCloneActionKey);
    global.wx = originalWx;
    cloneTournamentCore.cloneTournament = originalCloneTournament;
    delete require.cache[homePagePath];
  }
});
