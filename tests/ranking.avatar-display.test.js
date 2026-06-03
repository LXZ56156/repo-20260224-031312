const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rankingPagePath = require.resolve('../miniprogram/pages/ranking/index.js');
const shareCard = require('../miniprogram/core/shareCard');
const shareCode = require('../miniprogram/core/shareCode');

function loadRankingPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[rankingPagePath];
  require(rankingPagePath);
  global.Page = originalPage;
  return definition;
}

function createRankingPageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx.data.tournamentId = 't_rank_avatar';
  ctx.avatarCache = {};
  return ctx;
}

test('ranking page decorates personal rankings with a single avatar item', () => {
  const definition = loadRankingPageDefinition();
  const ctx = createRankingPageContext(definition);

  try {
    ctx.avatarCache = {
      'cloud://avatar/u_1': 'https://temp/avatar/u_1.png'
    };
    ctx.applyTournament({
      _id: 't_rank_avatar',
      status: 'running',
      mode: 'multi_rotate',
      players: [
        { id: 'u_1', nickName: '球友A', avatar: 'cloud://avatar/u_1' },
        { id: 'u_2', name: '球友B' }
      ],
      rounds: [],
      rankings: [
        { playerId: 'u_1', wins: 2, losses: 0, played: 2, pointsFor: 42, pointsAgainst: 30, pointDiff: 12 },
        { playerId: 'u_2', wins: 0, losses: 2, played: 2, pointsFor: 30, pointsAgainst: 42, pointDiff: -12 }
      ]
    });

    const first = ctx.data.rankings.find((row) => row.entityId === 'u_1');
    const second = ctx.data.rankings.find((row) => row.entityId === 'u_2');
    assert.equal(first.avatarItems.length, 1);
    assert.equal(first.avatarItems[0].avatarDisplay, 'https://temp/avatar/u_1.png');
    assert.equal(first.avatarItems[0].name, '球友A');
    assert.equal(first.rank, 1);
    assert.equal(second.rank, 2);
  } finally {
    delete require.cache[rankingPagePath];
  }
});

test('ranking page keeps initials visible before cloud avatar temp url resolves', () => {
  const definition = loadRankingPageDefinition();
  const ctx = createRankingPageContext(definition);

  try {
    ctx.applyTournament({
      _id: 't_rank_avatar',
      status: 'running',
      mode: 'multi_rotate',
      players: [
        { id: 'u_1', nickName: '球友A', avatar: 'cloud://avatar/u_1' }
      ],
      rounds: [],
      rankings: [
        { playerId: 'u_1', wins: 1, losses: 0, played: 1, pointsFor: 21, pointsAgainst: 18, pointDiff: 3 }
      ]
    });

    const first = ctx.data.rankings[0];
    assert.equal(first.avatarItems[0].avatarRaw, 'cloud://avatar/u_1');
    assert.equal(first.avatarItems[0].avatarDisplay, '');
    assert.equal(first.avatarItems[0].initial, '球');
  } finally {
    delete require.cache[rankingPagePath];
  }
});

test('ranking page restores initial fallback when avatar image fails to load', () => {
  const definition = loadRankingPageDefinition();
  const ctx = createRankingPageContext(definition);

  try {
    ctx.avatarCache = {
      'cloud://avatar/u_1': 'https://temp/avatar/u_1.png'
    };
    ctx.applyTournament({
      _id: 't_rank_avatar',
      status: 'running',
      mode: 'multi_rotate',
      players: [
        { id: 'u_1', nickName: '球友A', avatar: 'cloud://avatar/u_1' }
      ],
      rounds: [],
      rankings: [
        { playerId: 'u_1', wins: 1, losses: 0, played: 1, pointsFor: 21, pointsAgainst: 18, pointDiff: 3 }
      ]
    });
    assert.equal(ctx.data.rankings[0].avatarItems[0].avatarDisplay, 'https://temp/avatar/u_1.png');

    ctx.onAvatarImageError({ currentTarget: { dataset: { avatarRaw: 'cloud://avatar/u_1' } } });

    assert.equal(ctx.data.rankings[0].avatarItems[0].avatarDisplay, '');
    assert.equal(ctx.data.rankings[0].avatarItems[0].initial, '球');
  } finally {
    delete require.cache[rankingPagePath];
  }
});

test('ranking page decorates fixed pair rows with side-by-side avatars', () => {
  const definition = loadRankingPageDefinition();
  const ctx = createRankingPageContext(definition);

  try {
    ctx.avatarCache = {
      'cloud://avatar/u_1': 'https://temp/avatar/u_1.png',
      'cloud://avatar/u_2': 'https://temp/avatar/u_2.png'
    };
    ctx.applyTournament({
      _id: 't_rank_avatar',
      status: 'running',
      mode: 'fixed_pair_rr',
      players: [
        { id: 'u_1', name: '甲一', avatar: 'cloud://avatar/u_1' },
        { id: 'u_2', name: '乙二', avatar: 'cloud://avatar/u_2' }
      ],
      pairTeams: [
        { id: 'pair_1', name: '一号队', playerIds: ['u_1', 'u_2'] }
      ],
      rounds: [],
      rankings: [
        { entityType: 'team', entityId: 'pair_1', wins: 1, losses: 0, played: 1, pointsFor: 21, pointsAgainst: 18, pointDiff: 3 }
      ]
    });

    const row = ctx.data.rankings[0];
    assert.equal(row.avatarItems.length, 2);
    assert.equal(row.avatarItems[0].avatarDisplay, 'https://temp/avatar/u_1.png');
    assert.equal(row.avatarItems[1].avatarDisplay, 'https://temp/avatar/u_2.png');
    assert.equal(row.displayName, '甲一 / 乙二');
    assert.equal(row.subtitle, '一号队');
  } finally {
    delete require.cache[rankingPagePath];
  }
});

test('ranking page keeps squad rankings avatarless', () => {
  const definition = loadRankingPageDefinition();
  const ctx = createRankingPageContext(definition);

  try {
    ctx.applyTournament({
      _id: 't_rank_avatar',
      status: 'running',
      mode: 'squad_doubles',
      players: [
        { id: 'u_1', name: '甲一', squad: 'A' },
        { id: 'u_2', name: '乙二', squad: 'B' }
      ],
      rounds: [],
      rankings: [
        { entityType: 'team', entityId: 'A', wins: 1, losses: 0, played: 1, pointsFor: 21, pointsAgainst: 18, pointDiff: 3 },
        { entityType: 'team', entityId: 'B', wins: 0, losses: 1, played: 1, pointsFor: 18, pointsAgainst: 21, pointDiff: -3 }
      ]
    });

    assert.ok(ctx.data.rankings.every((row) => Array.isArray(row.avatarItems) && row.avatarItems.length === 0));
  } finally {
    delete require.cache[rankingPagePath];
  }
});

test('ranking page renders pair display names on one ellipsized title line', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/ranking/index.wxml'),
    'utf8'
  );

  assert.match(wxml, /\{\{r\.displayName \|\| r\.name\}\}/);
  assert.match(wxml, /class="player-title ellipsis"/);
});

test('ranking timeline share waits for the canvas node before drawing', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalDrawShareCard = shareCard.drawShareCard;
  const originalGetTournamentShareCode = shareCode.getTournamentShareCode;
  const canvasNode = { id: 'ranking-share-card-canvas' };
  const tournament = {
    _id: 't_rank_share',
    name: '周末赛',
    players: [{ id: 'u_1', name: '球友A' }, { id: 'u_2', name: '球友B' }],
    rounds: [
      { matches: [{ status: 'finished', teamA: [{ id: 'u_1' }], teamB: [{ id: 'u_2' }], score: { teamA: 21, teamB: 10 } }] },
      { matches: [{ status: 'finished', teamA: [{ id: 'u_1' }], teamB: [{ id: 'u_2' }], score: { teamA: 21, teamB: 18 } }] },
      { matches: [{ status: 'finished', teamA: [{ id: 'u_2' }], teamB: [{ id: 'u_1' }], score: { teamA: 21, teamB: 12 } }] }
    ]
  };
  const definition = loadRankingPageDefinition();
  const ctx = createRankingPageContext(definition);
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
    assert.equal(tournamentId, 't_rank_share');
    return 'cloud://test/share-codes/t_rank_share.png';
  };
  shareCard.drawShareCard = async (canvas, data) => {
    drawnCanvas = canvas;
    assert.equal(data.rank, 2);
    assert.equal(data.qrCodeUrl, 'cloud://test/share-codes/t_rank_share.png');
    assert.equal(data.maxWinStreak, 2);
    assert.equal(data.avgScore, 18);
    return '/tmp/ranking-share-card.png';
  };

  try {
    ctx.openid = 'u_1';
    ctx.setData({
      tournament,
      rankings: [
        { playerId: 'u_2', name: '球友B', wins: 3, losses: 0, played: 3, rank: 1 },
        { playerId: 'u_1', name: '球友A', wins: 2, losses: 1, played: 3, pointsFor: 54, rank: 2 }
      ]
    });

    const share = ctx.onShareTimeline();
    const resolved = await share.promise;

    assert.equal(drawnCanvas, canvasNode);
    assert.equal(resolved.imageUrl, '/tmp/ranking-share-card.png');
    assert.equal(resolved.query, 'tournamentId=t_rank_share');
  } finally {
    shareCard.drawShareCard = originalDrawShareCard;
    shareCode.getTournamentShareCode = originalGetTournamentShareCode;
    global.wx = originalWx;
    global.getApp = originalGetApp;
    delete require.cache[rankingPagePath];
  }
});

test('ranking timeline share reuses the card exported after onReady preheat', async () => {
  const originalGetApp = global.getApp;
  const originalDrawShareCard = shareCard.drawShareCard;
  const originalGetTournamentShareCode = shareCode.getTournamentShareCode;
  const tournament = {
    _id: 't_rank_preheat',
    name: '周末赛',
    players: [{ id: 'u_1', name: '球友A' }]
  };
  const definition = loadRankingPageDefinition();
  const ctx = createRankingPageContext(definition);
  let drawCalls = 0;

  global.getApp = () => ({ globalData: { openid: 'u_1' } });
  shareCode.getTournamentShareCode = async () => 'cloud://test/share-codes/t_rank_preheat.png';
  shareCard.drawShareCard = async () => {
    drawCalls += 1;
    return '/tmp/ranking-preheated-card.png';
  };

  try {
    ctx.openid = 'u_1';
    ctx._getShareCardCanvas = async () => ({ id: 'ranking-preheat-canvas' });
    ctx.setData({
      tournament,
      rankings: [{ playerId: 'u_1', name: '球友A', wins: 2, losses: 1, played: 3, rank: 1 }]
    });

    ctx.onReady();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(drawCalls, 1);

    const resolved = await ctx.onShareTimeline().promise;
    assert.equal(resolved.imageUrl, '/tmp/ranking-preheated-card.png');
    assert.equal(drawCalls, 1);
  } finally {
    shareCard.drawShareCard = originalDrawShareCard;
    shareCode.getTournamentShareCode = originalGetTournamentShareCode;
    global.getApp = originalGetApp;
    delete require.cache[rankingPagePath];
  }
});
