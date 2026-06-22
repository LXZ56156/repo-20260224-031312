const test = require('node:test');
const assert = require('node:assert/strict');

const analyticsPagePath = require.resolve('../miniprogram/pages/analytics/index.js');

function loadPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[analyticsPagePath];
  require(analyticsPagePath);
  global.Page = originalPage;
  return definition;
}

test('legacy analytics route redirects once to ranking and preserves poster intent', () => {
  const definition = loadPageDefinition();
  const originalWx = global.wx;
  const calls = [];
  global.wx = {
    redirectTo(options) {
      calls.push(String(options && options.url || ''));
    }
  };

  try {
    definition.onLoad({
      tournamentId: 't_old_link',
      autoPoster: '1',
      shareIntent: 'poster'
    });

    assert.deepEqual(calls, [
      '/pages/ranking/index?tournamentId=t_old_link&autoPoster=1&shareIntent=poster'
    ]);
    assert.doesNotMatch(calls[0], /pages\/analytics\/index/);
  } finally {
    global.wx = originalWx;
    delete require.cache[analyticsPagePath];
  }
});

test('legacy analytics route without a tournament id falls back to home', () => {
  const definition = loadPageDefinition();
  const originalWx = global.wx;
  const calls = [];
  global.wx = {
    switchTab(options) {
      calls.push({ type: 'switchTab', url: String(options && options.url || '') });
    },
    redirectTo(options) {
      calls.push({ type: 'redirectTo', url: String(options && options.url || '') });
    }
  };

  try {
    definition.onLoad({});
    assert.deepEqual(calls, [{ type: 'switchTab', url: '/pages/home/index' }]);
  } finally {
    global.wx = originalWx;
    delete require.cache[analyticsPagePath];
  }
});
