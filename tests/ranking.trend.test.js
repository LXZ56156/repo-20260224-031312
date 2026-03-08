const test = require('node:test');
const assert = require('node:assert/strict');

const rankingCore = require('../miniprogram/core/ranking');

function fixtureTournament() {
  return {
    players: [
      { id: 'u1', name: 'A' },
      { id: 'u2', name: 'B' },
      { id: 'u3', name: 'C' },
      { id: 'u4', name: 'D' }
    ],
    rounds: [
      {
        roundIndex: 0,
        matches: [{
          matchIndex: 0,
          status: 'finished',
          teamA: [{ id: 'u1' }, { id: 'u2' }],
          teamB: [{ id: 'u3' }, { id: 'u4' }],
          teamAScore: 21,
          teamBScore: 19
        }]
      },
      {
        roundIndex: 1,
        matches: [{
          matchIndex: 0,
          status: 'finished',
          teamA: [{ id: 'u1' }, { id: 'u2' }],
          teamB: [{ id: 'u3' }, { id: 'u4' }],
          teamAScore: 10,
          teamBScore: 21
        }]
      }
    ],
    rankings: [
      { playerId: 'u1', name: 'A', wins: 1, losses: 1, played: 2, pointsFor: 31, pointsAgainst: 40, pointDiff: -9 },
      { playerId: 'u2', name: 'B', wins: 1, losses: 1, played: 2, pointsFor: 31, pointsAgainst: 40, pointDiff: -9 },
      { playerId: 'u3', name: 'C', wins: 1, losses: 1, played: 2, pointsFor: 40, pointsAgainst: 31, pointDiff: 9 },
      { playerId: 'u4', name: 'D', wins: 1, losses: 1, played: 2, pointsFor: 40, pointsAgainst: 31, pointDiff: 9 }
    ]
  };
}

test('buildRankingWithTrend returns up/down trend based on previous round', () => {
  const list = rankingCore.buildRankingWithTrend(fixtureTournament());
  assert.equal(list[0].name, 'C');
  assert.equal(list[0].trendText, '↑2');
  assert.equal(list[1].name, 'D');
  assert.equal(list[1].trendText, '↑2');
  assert.equal(list[2].name, 'A');
  assert.equal(list[2].trendText, '↓2');
  assert.equal(list[3].name, 'B');
  assert.equal(list[3].trendText, '↓2');
});

test('buildRankingWithTrend returns flat trend when no previous finished round', () => {
  const t = fixtureTournament();
  t.rounds = [{
    roundIndex: 0,
    matches: []
  }];
  const list = rankingCore.buildRankingWithTrend(t);
  assert.ok(list.every((x) => x.trendText === '-'));
});
