const test = require('node:test');
const assert = require('node:assert/strict');

const analyticsPagePath = require.resolve('../miniprogram/pages/analytics/index.js');
const sharePageMixinPath = require.resolve('../miniprogram/core/sharePageMixin.js');
const shareCardPreheat = require('../miniprogram/core/shareCardPreheat');

function clearPageCache() {
  delete require.cache[analyticsPagePath];
  delete require.cache[sharePageMixinPath];
}

function loadAnalyticsPageDefinition() {
  clearPageCache();
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
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
  const originalGetPreparedShareImage = shareCardPreheat.getPreparedShareImage;
  clearPageCache();

  shareCardPreheat.getPreparedShareImage = async () => '/tmp/analytics-share-card.png';

  try {
    const definition = loadAnalyticsPageDefinition();
    const ctx = createAnalyticsPageContext(definition);

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
    assert.equal(share.title, '周末赛 赛事排名已出炉');
    assert.equal(share.path, '/pages/share-entry/index?tournamentId=t_1');
    // verify share card promise is attached via mixin
    assert.ok(typeof share.promise === 'object' && typeof share.promise.then === 'function');
  } finally {
    shareCardPreheat.getPreparedShareImage = originalGetPreparedShareImage;
    clearPageCache();
  }
});

test('analytics page preheats share menu on load', () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalGetPreparedShareImage = shareCardPreheat.getPreparedShareImage;
  clearPageCache();

  shareCardPreheat.getPreparedShareImage = async () => '/tmp/analytics-share-card.png';

  const definition = loadAnalyticsPageDefinition();
  const ctx = createAnalyticsPageContext(definition);
  const showCalls = [];

  global.wx = {
    showShareMenu(options = {}) {
      showCalls.push(options);
      if (typeof options.success === 'function') options.success({});
    }
  };
  global.getApp = () => ({
    globalData: {
      networkOffline: false
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
    shareCardPreheat.getPreparedShareImage = originalGetPreparedShareImage;
    global.wx = originalWx;
    global.getApp = originalGetApp;
    clearPageCache();
  }
});

test('analytics timeline share returns correct title and query via mixin', async () => {
  const originalGetPreparedShareImage = shareCardPreheat.getPreparedShareImage;
  clearPageCache();

  shareCardPreheat.getPreparedShareImage = async () => '/tmp/analytics-timeline-card.png';

  const tournament = {
    _id: 't_1',
    name: '周末赛',
    players: [{ id: 'u_1', name: '球友A' }]
  };

  try {
    const definition = loadAnalyticsPageDefinition();
    const ctx = createAnalyticsPageContext(definition);

    ctx.setData({
      tournament,
      playerStats: [{ playerId: 'u_1', name: '球友A', wins: 2, losses: 1, played: 3, pointsFor: 54, rank: 1 }]
    });

    const share = ctx.onShareTimeline();
    assert.equal(share.title, '周末赛 赛事排名已出炉');
    assert.equal(share.query, 'tournamentId=t_1');

    const resolved = await share.promise;
    assert.equal(resolved.imageUrl, '/tmp/analytics-timeline-card.png');
    assert.equal(resolved.title, '周末赛');
    assert.equal(resolved.query, 'tournamentId=t_1');
  } finally {
    shareCardPreheat.getPreparedShareImage = originalGetPreparedShareImage;
    clearPageCache();
  }
});

test('analytics timeline share falls back gracefully when preheat fails', async () => {
  const originalGetPreparedShareImage = shareCardPreheat.getPreparedShareImage;
  clearPageCache();

  shareCardPreheat.getPreparedShareImage = async () => {
    throw new Error('preheat failed');
  };

  const tournament = {
    _id: 't_4',
    name: '周末赛',
    players: [{ id: 'u_4', name: '球友D' }]
  };

  try {
    const definition = loadAnalyticsPageDefinition();
    const ctx = createAnalyticsPageContext(definition);

    ctx.setData({
      tournament,
      playerStats: [{ playerId: 'u_4', name: '球友D', wins: 1, losses: 2, played: 3, rank: 4 }]
    });

    const share = ctx.onShareTimeline();
    const resolved = await share.promise;

    assert.equal(resolved.title, '周末赛 赛事排名已出炉');
    assert.equal(resolved.query, 'tournamentId=t_4');
    // imageUrl is absent on fallback
    assert.equal(resolved.imageUrl, undefined);
  } finally {
    shareCardPreheat.getPreparedShareImage = originalGetPreparedShareImage;
    clearPageCache();
  }
});

test('analytics onReady triggers share preheat via mixin', async () => {
  const originalPreheatShareImage = shareCardPreheat.preheatShareImage;
  clearPageCache();

  let preheatCalls = [];
  shareCardPreheat.preheatShareImage = async function (ctx, tournament, type) {
    preheatCalls.push({ tournamentId: tournament && tournament._id, type });
    return '';
  };

  const tournament = {
    _id: 't_preheat',
    name: '周末赛',
    players: [{ id: 'u_1', name: '球友A' }]
  };

  try {
    const definition = loadAnalyticsPageDefinition();
    const ctx = createAnalyticsPageContext(definition);

    // mock _getCanvas to return a fake canvas node so onReady proceeds to preheat
    ctx._getCanvas = async () => ({ id: 'analytics-preheat-canvas' });

    ctx.setData({
      tournament,
      playerStats: [{ playerId: 'u_1', name: '球友A', wins: 2, losses: 1, played: 3, rank: 1 }]
    });

    ctx.onReady();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // onReady preheats both appMessage and timeline types
    const preheatedIds = preheatCalls.map(function (c) { return c.tournamentId; });
    assert.ok(preheatedIds.includes('t_preheat'));
    assert.ok(preheatCalls.length >= 1);
  } finally {
    shareCardPreheat.preheatShareImage = originalPreheatShareImage;
    clearPageCache();
  }
});
