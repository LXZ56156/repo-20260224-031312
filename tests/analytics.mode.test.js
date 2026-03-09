const test = require('node:test');
const assert = require('node:assert/strict');

const analyticsLogic = require('../miniprogram/pages/analytics/logic');

function makeMatch(teamA, teamB, scoreA, scoreB, extra = {}) {
  return {
    matchIndex: 0,
    status: 'finished',
    teamA,
    teamB,
    teamAScore: scoreA,
    teamBScore: scoreB,
    ...extra
  };
}

test('analytics keeps personal rows for multi_rotate', () => {
  const analytics = analyticsLogic.computeAnalytics({
    mode: 'multi_rotate',
    players: [
      { id: 'u1', name: 'A' },
      { id: 'u2', name: 'B' },
      { id: 'u3', name: 'C' },
      { id: 'u4', name: 'D' }
    ],
    rounds: [{
      roundIndex: 0,
      matches: [makeMatch([{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }], [{ id: 'u3', name: 'C' }, { id: 'u4', name: 'D' }], 21, 18)]
    }],
    rankings: [
      { entityType: 'player', entityId: 'u1', playerId: 'u1', name: 'A', wins: 1, losses: 0, played: 1, pointsFor: 21, pointsAgainst: 18, pointDiff: 3 },
      { entityType: 'player', entityId: 'u2', playerId: 'u2', name: 'B', wins: 1, losses: 0, played: 1, pointsFor: 21, pointsAgainst: 18, pointDiff: 3 }
    ]
  });

  assert.equal(analytics.rankingTitle, '球员数据');
  assert.equal(analytics.playerStats.length, 4);
  assert.ok(analytics.playerStats.every((row) => row.entityType === 'player'));
});

test('analytics keeps only squad teams for squad_doubles', () => {
  const analytics = analyticsLogic.computeAnalytics({
    mode: 'squad_doubles',
    players: [
      { id: 'u1', name: 'A1', squad: 'A' },
      { id: 'u2', name: 'A2', squad: 'A' },
      { id: 'u3', name: 'B1', squad: 'B' },
      { id: 'u4', name: 'B2', squad: 'B' }
    ],
    rounds: [{
      roundIndex: 0,
      matches: [makeMatch([{ id: 'u1', name: 'A1' }, { id: 'u2', name: 'A2' }], [{ id: 'u3', name: 'B1' }, { id: 'u4', name: 'B2' }], 21, 15, {
        unitAId: 'A',
        unitBId: 'B',
        unitAName: 'A队',
        unitBName: 'B队'
      })]
    }],
    rankings: [
      { entityType: 'team', entityId: 'A', playerId: 'A', name: 'A队', wins: 1, losses: 0, played: 1, pointsFor: 21, pointsAgainst: 15, pointDiff: 6 }
    ]
  });

  assert.equal(analytics.rankingTitle, '队伍数据');
  assert.deepEqual(
    analytics.playerStats.map((row) => row.entityId),
    ['A', 'B']
  );
  assert.ok(analytics.playerStats.every((row) => row.entityType === 'team'));
});

test('analytics keeps only pair teams for fixed_pair_rr', () => {
  const analytics = analyticsLogic.computeAnalytics({
    mode: 'fixed_pair_rr',
    players: [
      { id: 'u1', name: 'A1' },
      { id: 'u2', name: 'A2' },
      { id: 'u3', name: 'B1' },
      { id: 'u4', name: 'B2' }
    ],
    pairTeams: [
      { id: 'pair_a', name: '晨风', playerIds: ['u1', 'u2'] },
      { id: 'pair_b', name: '山海', playerIds: ['u3', 'u4'] }
    ],
    rounds: [{
      roundIndex: 0,
      matches: [makeMatch([{ id: 'u1', name: 'A1' }, { id: 'u2', name: 'A2' }], [{ id: 'u3', name: 'B1' }, { id: 'u4', name: 'B2' }], 21, 17, {
        unitAId: 'pair_a',
        unitBId: 'pair_b',
        unitAName: '晨风',
        unitBName: '山海'
      })]
    }],
    rankings: [
      { entityType: 'team', entityId: 'pair_a', playerId: 'pair_a', name: '晨风', wins: 1, losses: 0, played: 1, pointsFor: 21, pointsAgainst: 17, pointDiff: 4 }
    ]
  });

  assert.equal(analytics.rankingTitle, '队伍数据');
  assert.deepEqual(
    analytics.playerStats.map((row) => row.entityId),
    ['pair_a', 'pair_b']
  );
  assert.ok(analytics.playerStats.every((row) => row.entityType === 'team'));
});
