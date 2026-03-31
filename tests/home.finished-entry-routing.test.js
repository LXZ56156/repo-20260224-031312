const test = require('node:test');
const assert = require('node:assert/strict');

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
        { _id: 'running_1', status: 'running', _offset: 0 }
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

test('home finished card opens match page while review stays behind the quick action', () => {
  const definition = loadHomePageDefinition();
  const ctx = createHomeContext(definition);
  const originalWx = global.wx;
  const calls = [];

  global.wx = {
    navigateTo(options) {
      calls.push(String(options && options.url || ''));
    }
  };

  try {
    ctx.onCardTap({ currentTarget: { dataset: { id: 'finished_1', idx: 0 } } });
    ctx.onQuickActionTap({ currentTarget: { dataset: { id: 'finished_1', status: 'finished' } } });

    assert.deepEqual(calls, [
      '/pages/lobby/index?tournamentId=finished_1',
      '/pages/analytics/index?tournamentId=finished_1'
    ]);
  } finally {
    global.wx = originalWx;
    delete require.cache[homePagePath];
  }
});
