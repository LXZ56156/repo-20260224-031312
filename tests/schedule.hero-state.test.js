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
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx.openid = 'u_admin';
  ctx.fetchTournament = () => Promise.resolve(null);
  ctx.hasActiveWatch = () => true;
  ctx.startWatch = () => {};
  return ctx;
}

function buildTournament(overrides = {}) {
  return {
    _id: 't_schedule',
    status: 'running',
    creatorId: 'u_admin',
    mode: 'fixed_pair_rr',
    players: [
      { id: 'u_admin', name: '甲一' },
      { id: 'u_2', name: '乙二' },
      { id: 'u_3', name: '丙三' },
      { id: 'u_4', name: '丁四' }
    ],
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        status: 'pending',
        teamA: [{ id: 'u_admin', name: '甲一' }, { id: 'u_2', name: '乙二' }],
        teamB: [{ id: 'u_3', name: '丙三' }, { id: 'u_4', name: '丁四' }]
      }]
    }],
    ...overrides
  };
}

test('schedule page derives running hero copy from current pending round', () => {
  const definition = loadSchedulePageDefinition();
  const ctx = createSchedulePageContext(definition);

  try {
    ctx.applyTournament(buildTournament());

    assert.equal(ctx.data.statusText, '进行中');
    assert.equal(ctx.data.statusClass, 'hero-status-running');
    assert.equal(ctx.data.heroSummaryText, '固搭循环赛 · 第1轮');
    assert.equal(ctx.data.heroMatchText, '0 / 1 场');
    assert.equal(ctx.data.heroPendingText, '仍有 1 场待录分');
    assert.equal(ctx.data.heroProgressPercent, 0);
    assert.equal(ctx.data.nextActionText, '继续录分');
  } finally {
    delete require.cache[schedulePagePath];
  }
});

test('schedule page derives finished hero copy from completed rounds', () => {
  const definition = loadSchedulePageDefinition();
  const ctx = createSchedulePageContext(definition);

  try {
    ctx.applyTournament(buildTournament({
      status: 'finished',
      rounds: [{
        roundIndex: 0,
        matches: [{
          matchIndex: 0,
          status: 'finished',
          scoreA: 21,
          scoreB: 18,
          teamA: [{ id: 'u_admin', name: '甲一' }, { id: 'u_2', name: '乙二' }],
          teamB: [{ id: 'u_3', name: '丙三' }, { id: 'u_4', name: '丁四' }]
        }]
      }]
    }));

    assert.equal(ctx.data.statusText, '已完成');
    assert.equal(ctx.data.statusClass, 'hero-status-finished');
    assert.equal(ctx.data.heroSummaryText, '固搭循环赛 · 共 1 轮');
    assert.equal(ctx.data.heroMatchText, '1 / 1 场');
    assert.equal(ctx.data.heroPendingText, '全部 1 场已录完');
    assert.equal(ctx.data.heroProgressPercent, 100);
    assert.equal(ctx.data.nextActionText, '');
  } finally {
    delete require.cache[schedulePagePath];
  }
});

test('schedule page derives draft hero copy without progress bar', () => {
  const definition = loadSchedulePageDefinition();
  const ctx = createSchedulePageContext(definition);

  try {
    ctx.applyTournament(buildTournament({
      status: 'draft',
      rounds: []
    }));

    assert.equal(ctx.data.statusText, '尚未开始');
    assert.equal(ctx.data.statusClass, 'hero-status-draft');
    assert.equal(ctx.data.heroSummaryText, '固搭循环赛 · 尚未开始');
    assert.equal(ctx.data.heroMatchText, '暂无场次');
    assert.equal(ctx.data.heroPendingText, '开赛后将显示轮次与进度');
    assert.equal(ctx.data.heroProgressPercent, -1);
    assert.equal(ctx.data.nextActionText, '');
  } finally {
    delete require.cache[schedulePagePath];
  }
});

test('schedule hero action busy state resets on return to the page', () => {
  const originalWx = global.wx;
  const definition = loadSchedulePageDefinition();
  const ctx = createSchedulePageContext(definition);
  let navigatedUrl = '';

  try {
    global.wx = {
      navigateTo(options) {
        navigatedUrl = options.url;
      }
    };

    ctx.data.tournamentId = 't_schedule';
    ctx.data.nextActionKey = 'analytics';
    ctx.data.heroActionBusy = false;

    const handled = ctx.onHeroActionTap();

    assert.equal(handled, true);
    assert.equal(ctx.data.heroActionBusy, true);
    assert.match(navigatedUrl, /pages\/analytics\/index/);

    ctx.onShow();
    assert.equal(ctx.data.heroActionBusy, false);
  } finally {
    global.wx = originalWx;
    delete require.cache[schedulePagePath];
  }
});
