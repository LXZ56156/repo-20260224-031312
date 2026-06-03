const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas } = require('canvas');

const analyticsPagePath = require.resolve('../miniprogram/pages/analytics/index.js');
const shareCard = require('../miniprogram/core/shareCard');
const shareCode = require('../miniprogram/core/shareCode');

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
  const originalWx = global.wx;
  const definition = loadAnalyticsPageDefinition();
  const ctx = createAnalyticsPageContext(definition);
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
    assert.equal(showCalls.length, 1);
    assert.equal(showCalls[0].withShareTicket, true);
  } finally {
    global.wx = originalWx;
    delete require.cache[analyticsPagePath];
  }
});

test('analytics page preheats share menu on load', () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
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
    global.wx = originalWx;
    global.getApp = originalGetApp;
    delete require.cache[analyticsPagePath];
  }
});

test('analytics timeline share waits for the canvas node before drawing', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalDrawShareCard = shareCard.drawShareCard;
  const originalGetTournamentShareCode = shareCode.getTournamentShareCode;
  const canvasNode = { id: 'analytics-share-card-canvas' };
  const tournament = {
    _id: 't_1',
    name: '周末赛',
    players: [{ id: 'u_1', name: '球友A' }, { id: 'u_2', name: '球友B' }],
    rounds: [
      { matches: [{ status: 'finished', teamA: [{ id: 'u_1' }], teamB: [{ id: 'u_2' }], score: { teamA: 21, teamB: 10 } }] },
      { matches: [{ status: 'finished', teamA: [{ id: 'u_1' }], teamB: [{ id: 'u_2' }], score: { teamA: 21, teamB: 18 } }] },
      { matches: [{ status: 'finished', teamA: [{ id: 'u_2' }], teamB: [{ id: 'u_1' }], score: { teamA: 21, teamB: 12 } }] }
    ]
  };
  const definition = loadAnalyticsPageDefinition();
  const ctx = createAnalyticsPageContext(definition);
  let drawnCanvas = null;

  global.wx = {
    createSelectorQuery() {
      return {
        select(selector) {
          assert.equal(selector, '#shareCardCanvas');
          return this;
        },
        fields(options) {
          assert.deepEqual(options, { node: true });
          return this;
        },
        exec(callback) {
          Promise.resolve().then(() => callback([{ node: canvasNode }]));
        }
      };
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_1' } });
  shareCode.getTournamentShareCode = async (tournamentId) => {
    assert.equal(tournamentId, 't_1');
    return 'cloud://test/share-codes/t_1.png';
  };
  shareCard.drawShareCard = async (canvas, data) => {
    drawnCanvas = canvas;
    assert.equal(data.qrCodeUrl, 'cloud://test/share-codes/t_1.png');
    assert.equal(data.maxWinStreak, 2);
    assert.equal(data.avgScore, 18);
    return '/tmp/analytics-share-card.png';
  };

  try {
    ctx.openid = 'u_1';
    ctx.setData({
      tournament,
      playerStats: [{ playerId: 'u_1', name: '球友A', wins: 2, losses: 1, played: 3, pointsFor: 54, rank: 1 }]
    });

    const share = ctx.onShareTimeline();
    const resolved = await share.promise;

    assert.equal(drawnCanvas, canvasNode);
    assert.equal(resolved.imageUrl, '/tmp/analytics-share-card.png');
    assert.equal(resolved.query, 'tournamentId=t_1');
  } finally {
    shareCard.drawShareCard = originalDrawShareCard;
    shareCode.getTournamentShareCode = originalGetTournamentShareCode;
    global.wx = originalWx;
    global.getApp = originalGetApp;
    delete require.cache[analyticsPagePath];
  }
});

test('analytics timeline share falls back to text for a non-medal rank', async () => {
  const originalGetApp = global.getApp;
  const originalGetTournamentShareCode = shareCode.getTournamentShareCode;
  const tournament = {
    _id: 't_4',
    name: '周末赛',
    players: [{ id: 'u_4', name: '球友D' }]
  };
  const definition = loadAnalyticsPageDefinition();
  const ctx = createAnalyticsPageContext(definition);
  let shareCodeCalls = 0;

  global.getApp = () => ({ globalData: { openid: 'u_4' } });
  shareCode.getTournamentShareCode = async () => {
    shareCodeCalls += 1;
    return 'cloud://test/share-codes/t_4.png';
  };
  try {
    ctx.openid = 'u_4';
    ctx._shareCardCanvas = createCanvas(500, 500);
    ctx.setData({
      tournament,
      playerStats: [{ playerId: 'u_4', name: '球友D', wins: 1, losses: 2, played: 3, rank: 4 }]
    });

    const resolved = await ctx.onShareTimeline().promise;

    assert.equal(resolved.title, '周末赛 赛事排名已出炉');
    assert.equal(resolved.query, 'tournamentId=t_4');
    assert.equal(Object.prototype.hasOwnProperty.call(resolved, 'imageUrl'), false);
    assert.equal(shareCodeCalls, 0);
  } finally {
    shareCode.getTournamentShareCode = originalGetTournamentShareCode;
    global.getApp = originalGetApp;
    delete require.cache[analyticsPagePath];
  }
});

test('analytics timeline share reuses the card exported after onReady preheat', async () => {
  const originalGetApp = global.getApp;
  const originalDrawShareCard = shareCard.drawShareCard;
  const originalGetTournamentShareCode = shareCode.getTournamentShareCode;
  const tournament = {
    _id: 't_preheat',
    name: '周末赛',
    players: [{ id: 'u_1', name: '球友A' }]
  };
  const definition = loadAnalyticsPageDefinition();
  const ctx = createAnalyticsPageContext(definition);
  let drawCalls = 0;

  global.getApp = () => ({ globalData: { openid: 'u_1' } });
  shareCode.getTournamentShareCode = async () => 'cloud://test/share-codes/t_preheat.png';
  shareCard.drawShareCard = async () => {
    drawCalls += 1;
    return '/tmp/analytics-preheated-card.png';
  };

  try {
    ctx.openid = 'u_1';
    ctx._getShareCardCanvas = async () => ({ id: 'analytics-preheat-canvas' });
    ctx.setData({
      tournament,
      playerStats: [{ playerId: 'u_1', name: '球友A', wins: 2, losses: 1, played: 3, rank: 1 }]
    });

    ctx.onReady();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(drawCalls, 1);

    const resolved = await ctx.onShareTimeline().promise;
    assert.equal(resolved.imageUrl, '/tmp/analytics-preheated-card.png');
    assert.equal(drawCalls, 1);
  } finally {
    shareCard.drawShareCard = originalDrawShareCard;
    shareCode.getTournamentShareCode = originalGetTournamentShareCode;
    global.getApp = originalGetApp;
    delete require.cache[analyticsPagePath];
  }
});
