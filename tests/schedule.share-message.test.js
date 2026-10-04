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
  const events = [];

  global.wx = {
    reportEvent(name, payload) { events.push({ name, payload }); },
    showShareMenu(options = {}) {
      showCalls.push(options);
      if (typeof options.success === 'function') options.success({});
    }
  };
  try {
    ctx.setData({ tournamentId: 't_1' });
    ctx.applyTournament({
      _id: 't_1',
      name: '周末赛',
      status: 'running',
      mode: 'multi_rotate',
      players: [],
      rankings: [],
      rounds: []
    });

    assert.equal(events.length, 0);
    const share = ctx.onShareAppMessage();
    assert.equal(share.title, '周末赛 赛程对阵已生成');
    assert.equal(share.path, '/pages/share-entry/index?tournamentId=t_1');
    assert.equal(showCalls.length, 1);
    assert.equal(showCalls[0].withShareTicket, true);
    assert.deepEqual(events.map((event) => event.name), ['activity_attempt', 'activity_result']);
    assert.ok(events.every((event) => event.payload.action === 'tournament_share'));
    assert.equal(events[0].payload.operationId, events[1].payload.operationId);
    assert.equal(events[1].payload.result, 'unknown');
    assert.equal(events[1].payload.resultCode, 'DELIVERY_UNKNOWN');
    assert.ok(!JSON.stringify(events).includes('周末赛'));
    global.wx.reportEvent = () => { throw new Error('report unavailable'); };
    assert.equal(ctx.onShareAppMessage().title, share.title);
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
