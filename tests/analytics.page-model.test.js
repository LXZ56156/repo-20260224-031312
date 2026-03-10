const test = require('node:test');
const assert = require('node:assert/strict');

const analyticsLogic = require('../miniprogram/pages/analytics/logic');

function makeMatch(teamA, teamB, scoreA, scoreB) {
  return {
    matchIndex: 0,
    status: 'finished',
    teamA,
    teamB,
    teamAScore: scoreA,
    teamBScore: scoreB
  };
}

test('analytics page model promotes concise hero and remaining rankings', () => {
  const analytics = analyticsLogic.computeAnalytics({
    mode: 'multi_rotate',
    status: 'finished',
    players: [
      { id: 'u1', name: 'A' },
      { id: 'u2', name: 'B' },
      { id: 'u3', name: 'C' },
      { id: 'u4', name: 'D' },
      { id: 'u5', name: 'E' }
    ],
    rounds: [{
      roundIndex: 0,
      matches: [
        makeMatch([{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }], [{ id: 'u3', name: 'C' }, { id: 'u4', name: 'D' }], 21, 18),
        makeMatch([{ id: 'u1', name: 'A' }, { id: 'u5', name: 'E' }], [{ id: 'u3', name: 'C' }, { id: 'u4', name: 'D' }], 21, 16)
      ]
    }],
    rankings: [
      { entityType: 'player', entityId: 'u1', playerId: 'u1', name: 'A', wins: 2, losses: 0, played: 2, pointsFor: 42, pointsAgainst: 34, pointDiff: 8 },
      { entityType: 'player', entityId: 'u2', playerId: 'u2', name: 'B', wins: 1, losses: 0, played: 1, pointsFor: 21, pointsAgainst: 18, pointDiff: 3 },
      { entityType: 'player', entityId: 'u3', playerId: 'u3', name: 'C', wins: 0, losses: 2, played: 2, pointsFor: 34, pointsAgainst: 42, pointDiff: -8 },
      { entityType: 'player', entityId: 'u4', playerId: 'u4', name: 'D', wins: 0, losses: 2, played: 2, pointsFor: 34, pointsAgainst: 42, pointDiff: -8 },
      { entityType: 'player', entityId: 'u5', playerId: 'u5', name: 'E', wins: 1, losses: 0, played: 1, pointsFor: 21, pointsAgainst: 16, pointDiff: 5 }
    ]
  });
  const report = analyticsLogic.buildBattleReport(analytics);
  const pageModel = analyticsLogic.buildAnalyticsPageModel(analytics, report);

  assert.equal(pageModel.modeLabel, '多人转');
  assert.equal(pageModel.statusLabel, '已结束');
  assert.equal(pageModel.heroStats.length, 3);
  assert.match(pageModel.heroHeadline, /榜首/);
  assert.equal(pageModel.summaryStats.length, 3);
  assert.equal(pageModel.top3.length, 3);
  assert.equal(pageModel.fullRankings.length, 5);
  assert.equal(pageModel.fullRankings[0].rank, 1);
  assert.ok(pageModel.focusFacts.length >= 3);
});
