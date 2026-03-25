const test = require('node:test');
const assert = require('node:assert/strict');

const analyticsPagePath = require.resolve('../miniprogram/pages/analytics/index.js');

function loadAnalyticsPageDefinition() {
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

function createAnalyticsContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx.data.tournamentId = 't_analytics_links';
  return ctx;
}

test('analytics page exposes lightweight links back to match, ranking, and schedule', () => {
  const definition = loadAnalyticsPageDefinition();
  const ctx = createAnalyticsContext(definition);
  const originalWx = global.wx;
  const calls = [];

  try {
    global.wx = {
      redirectTo(options) {
        calls.push({ type: 'redirectTo', url: String(options && options.url || '') });
      },
      navigateTo(options) {
        calls.push({ type: 'navigateTo', url: String(options && options.url || '') });
      }
    };

    ctx.goMatch();
    ctx.goRanking();
    ctx.goSchedule();

    assert.deepEqual(calls, [
      { type: 'redirectTo', url: '/pages/lobby/index?tournamentId=t_analytics_links' },
      { type: 'redirectTo', url: '/pages/ranking/index?tournamentId=t_analytics_links' },
      { type: 'redirectTo', url: '/pages/schedule/index?tournamentId=t_analytics_links' }
    ]);
  } finally {
    global.wx = originalWx;
    delete require.cache[analyticsPagePath];
  }
});
