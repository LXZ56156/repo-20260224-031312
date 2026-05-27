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

test('schedule page shares current tournament through the unified transfer contract', () => {
  const originalWx = global.wx;
  const definition = loadSchedulePageDefinition();
  const ctx = createSchedulePageContext(definition);
  const showCalls = [];

  global.wx = {
    showShareMenu(options = {}) {
      showCalls.push(options);
      if (typeof options.success === 'function') options.success({});
    }
  };
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
    assert.equal(share.title, '周末赛 赛程对阵已生成');
    assert.equal(share.path, '/pages/share-entry/index?tournamentId=t_1');
    assert.equal(showCalls.length, 1);
    assert.equal(showCalls[0].withShareTicket, true);
  } finally {
    global.wx = originalWx;
    delete require.cache[schedulePagePath];
  }
});

test('schedule page preheats share menu on load', () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const definition = loadSchedulePageDefinition();
  const ctx = createSchedulePageContext(definition);
  const showCalls = [];

  global.wx = {
    getStorageSync() {
      return '';
    },
    showShareMenu(options = {}) {
      showCalls.push(options);
      if (typeof options.success === 'function') options.success({});
    }
  };
  global.getApp = () => ({
    globalData: {
      openid: 'u_schedule',
      networkOffline: false,
      _avatarCache: {}
    },
    subscribeNetworkChange() {
      return () => {};
    }
  });
  ctx.fetchTournament = () => {};
  ctx.startWatch = () => {};

  try {
    ctx.onLoad({ tournamentId: 't_1' });

    assert.equal(showCalls.length, 1);
    assert.equal(showCalls[0].withShareTicket, true);
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    delete require.cache[schedulePagePath];
  }
});
