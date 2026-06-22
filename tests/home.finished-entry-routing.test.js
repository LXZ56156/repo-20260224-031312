const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');
const cloneTournamentCore = require('../miniprogram/core/cloneTournament');
const growthTracker = require('../miniprogram/core/growthTracker');
const homePagePath = require.resolve('../miniprogram/pages/home/index.js');

function loadHomePageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[homePagePath];
  require(homePagePath);
  global.Page = originalPage;
  return definition;
}

function createHomeContext(definition) {
  const ctx = {
    data: {
      items: [
        { _id: 'finished_1', status: 'finished', _offset: 0 },
        { _id: 'running_1', status: 'running', _offset: 0 },
        { _id: 'draft_1', status: 'draft', _offset: 0 }
      ]
    },
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('home card taps route finished to ranking, running to schedule, and draft to lobby', () => {
  const definition = loadHomePageDefinition();
  const ctx = createHomeContext(definition);
  const originalWx = global.wx;
  const originalTrack = growthTracker.track;
  const calls = [];
  const events = [];

  global.wx = {
    navigateTo(options) {
      calls.push(String(options && options.url || ''));
    }
  };
  growthTracker.track = (name, payload) => {
    events.push({ name, payload });
  };

  try {
    ctx.onCardTap({ currentTarget: { dataset: { id: 'finished_1', idx: 0 } } });
    ctx.onCardTap({ currentTarget: { dataset: { id: 'running_1', idx: 1 } } });
    ctx.onCardTap({ currentTarget: { dataset: { id: 'draft_1', idx: 2 } } });
    ctx.onQuickActionTap({ currentTarget: { dataset: { id: 'finished_1', status: 'finished' } } });

    assert.deepEqual(calls, [
      '/pages/ranking/index?tournamentId=finished_1',
      '/pages/schedule/index?tournamentId=running_1',
      '/pages/lobby/index?tournamentId=draft_1',
      '/pages/ranking/index?tournamentId=finished_1'
    ]);
    assert.deepEqual(events, [
      {
        name: 'home_finished_review_click',
        payload: {
          t: 'finished_1',
          s: 'finished',
          src: 'home',
          a: 'review_card'
        }
      },
      {
        name: 'home_finished_review_click',
        payload: {
          t: 'finished_1',
          s: 'finished',
          src: 'home',
          a: 'review'
        }
      }
    ]);
  } finally {
    growthTracker.track = originalTrack;
    global.wx = originalWx;
    delete require.cache[homePagePath];
  }
});

test('home finished clone action still copies and opens the new lobby', async () => {
  const definition = loadHomePageDefinition();
  const ctx = createHomeContext(definition);
  ctx.clearLastFailedAction = () => {};
  ctx.setLastFailedAction = () => {};
  ctx.handleWriteError = () => {};
  ctx.loadRecents = async () => {};

  const originalWx = global.wx;
  const originalTrack = growthTracker.track;
  const originalCloneTournament = cloneTournamentCore.cloneTournament;
  const calls = [];
  const cloneCalls = [];

  global.wx = {
    navigateTo(options) {
      calls.push(String(options && options.url || ''));
    },
    showLoading() {},
    hideLoading() {},
    showToast() {}
  };
  growthTracker.track = () => {};
  cloneTournamentCore.cloneTournament = async (sourceTournamentId, options) => {
    cloneCalls.push({ sourceTournamentId, options });
    return 'clone_1';
  };

  try {
    await ctx.onCloneTap(
      { currentTarget: { dataset: { id: 'finished_1' } } },
      { clientRequestId: 'test_clone_request' }
    );

    assert.deepEqual(cloneCalls, [
      {
        sourceTournamentId: 'finished_1',
        options: { clientRequestId: 'test_clone_request' }
      }
    ]);
    assert.deepEqual(calls, [
      '/pages/lobby/index?tournamentId=clone_1'
    ]);
  } finally {
    actionGuard.clear('home:cloneTournament:finished_1');
    cloneTournamentCore.cloneTournament = originalCloneTournament;
    growthTracker.track = originalTrack;
    global.wx = originalWx;
    delete require.cache[homePagePath];
  }
});
