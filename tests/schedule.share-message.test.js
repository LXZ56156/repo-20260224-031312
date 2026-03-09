const test = require('node:test');
const assert = require('node:assert/strict');

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

function createSchedulePageContext(definition) {
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

test('schedule page shares running tournaments as watch links', () => {
  const definition = loadSchedulePageDefinition();
  const ctx = createSchedulePageContext(definition);

  try {
    ctx.setData({
      tournamentId: 't_1',
      tournament: {
        _id: 't_1',
        name: '周末赛',
        status: 'running',
        mode: 'multi_rotate',
        players: [],
        rankings: [],
        rounds: []
      }
    });

    const share = ctx.onShareAppMessage();
    assert.match(share.title, /查看赛况与排名/);
    assert.match(share.path, /intent=watch/);
  } finally {
    delete require.cache[schedulePagePath];
  }
});
