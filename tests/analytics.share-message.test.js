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

function createAnalyticsPageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('analytics page shares current tournament through the unified transfer contract', () => {
  const definition = loadAnalyticsPageDefinition();
  const ctx = createAnalyticsPageContext(definition);

  try {
    ctx.setData({
      tournamentId: 't_1',
      tournament: {
        _id: 't_1',
        name: '周末赛',
        status: 'finished',
        mode: 'multi_rotate',
        players: [],
        rankings: [],
        rounds: []
      }
    });

    const share = ctx.onShareAppMessage();
    assert.equal(share.title, '周末赛 · 查看比赛');
    assert.equal(share.path, '/pages/share-entry/index?tournamentId=t_1');
  } finally {
    delete require.cache[analyticsPagePath];
  }
});
