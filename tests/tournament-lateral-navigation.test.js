const test = require('node:test');
const assert = require('node:assert/strict');

const lobbyDraftActions = require('../miniprogram/pages/lobby/lobbyDraftActions');
const schedulePagePath = require.resolve('../miniprogram/pages/schedule/index.js');

function loadSchedulePageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[schedulePagePath];
  require(schedulePagePath);
  global.Page = originalPage;
  return definition;
}

function createScheduleContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('lobby analytics entry prefers redirectTo for same-tournament lateral navigation', () => {
  const originalWx = global.wx;
  const calls = [];

  global.wx = {
    redirectTo(options) {
      calls.push({ type: 'redirectTo', url: String(options && options.url || '') });
    },
    navigateTo(options) {
      calls.push({ type: 'navigateTo', url: String(options && options.url || '') });
    }
  };

  try {
    const ctx = {
      data: { tournamentId: 't_lobby' }
    };

    lobbyDraftActions.goAnalytics.call(ctx);

    assert.deepEqual(calls, [
      { type: 'redirectTo', url: '/pages/analytics/index?tournamentId=t_lobby' }
    ]);
  } finally {
    global.wx = originalWx;
  }
});

test('schedule analytics hero action prefers redirectTo for same-tournament lateral navigation', () => {
  const definition = loadSchedulePageDefinition();
  const ctx = createScheduleContext(definition);
  const originalWx = global.wx;
  const calls = [];

  global.wx = {
    redirectTo(options) {
      calls.push({ type: 'redirectTo', url: String(options && options.url || '') });
    },
    navigateTo(options) {
      calls.push({ type: 'navigateTo', url: String(options && options.url || '') });
    }
  };

  try {
    ctx.setData({
      tournamentId: 't_schedule',
      nextActionKey: 'analytics',
      heroActionBusy: false
    });

    const handled = ctx.onHeroActionTap();

    assert.equal(handled, true);
    assert.equal(ctx.data.heroActionBusy, true);
    assert.deepEqual(calls, [
      { type: 'redirectTo', url: '/pages/analytics/index?tournamentId=t_schedule' }
    ]);
  } finally {
    global.wx = originalWx;
    delete require.cache[schedulePagePath];
  }
});
