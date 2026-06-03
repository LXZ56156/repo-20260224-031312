const assert = require('node:assert/strict');
const test = require('node:test');

const shareCardStats = require('../miniprogram/core/shareCardStats');

function match(teamA, teamB, scoreA, scoreB, extra = {}) {
  return {
    status: 'finished',
    teamA: teamA.map((id) => ({ id })),
    teamB: teamB.map((id) => ({ id })),
    score: { teamA: scoreA, teamB: scoreB },
    ...extra
  };
}

test('shareCardStats calculates player streaks across appearances and avg score', () => {
  const tournament = {
    rounds: [
      { matches: [match(['u_1'], ['u_2'], 21, 10)] },
      { matches: [match(['u_3'], ['u_4'], 21, 18)] },
      { matches: [match(['u_1'], ['u_3'], 21, 19)] },
      { matches: [match(['u_2'], ['u_1'], 21, 16)] },
      { matches: [match(['u_1'], ['u_4'], 21, 17)] }
    ]
  };

  assert.deepEqual(
    shareCardStats.buildShareCardStats(tournament, {
      entityType: 'player',
      playerId: 'u_1',
      played: 4,
      wins: 3,
      pointsFor: 79
    }),
    {
      totalMatches: 4,
      maxWinStreak: 2,
      avgScore: 19.75,
      winRate: '75%'
    }
  );
});

test('shareCardStats calculates team streaks from unit ids', () => {
  const tournament = {
    rounds: [
      { matches: [match([], [], 21, 10, { unitAId: 'A', unitBId: 'B' })] },
      { matches: [match([], [], 21, 18, { unitAId: 'A', unitBId: 'B' })] },
      { matches: [match([], [], 18, 21, { unitAId: 'A', unitBId: 'B' })] }
    ]
  };

  assert.equal(
    shareCardStats.calculateMaxWinStreak(tournament, { entityType: 'team', entityId: 'A' }),
    2
  );
});

test('shareCardStats returns explicit zero values for empty rows', () => {
  assert.deepEqual(shareCardStats.buildShareCardStats({}, {}), {
    totalMatches: 0,
    maxWinStreak: 0,
    avgScore: 0,
    winRate: '0%'
  });
});

test('shareCardStats derives win rate from wins and played instead of stale row values', () => {
  assert.equal(
    shareCardStats.buildShareCardStats({}, { wins: 4, played: 6, winRate: '0%' }).winRate,
    '66.7%'
  );
});
