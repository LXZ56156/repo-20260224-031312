const test = require('node:test');
const assert = require('node:assert/strict');

const submitLogic = require('../cloudfunctions/submitScore/logic');

function buildTournament() {
  return {
    _id: 't_1',
    mode: 'multi_rotate',
    status: 'running',
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
          status: 'pending',
          teamA: [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }],
          teamB: [{ id: 'u3', name: 'C' }, { id: 'u4', name: 'D' }]
        }]
      },
      {
        roundIndex: 1,
        matches: [{
          matchIndex: 0,
          status: 'pending',
          teamA: [{ id: 'u1', name: 'A' }, { id: 'u3', name: 'C' }],
          teamB: [{ id: 'u2', name: 'B' }, { id: 'u4', name: 'D' }]
        }]
      }
    ]
  };
}

function applySequence(steps) {
  let tournament = buildTournament();
  for (const step of steps) {
    const result = submitLogic.buildSubmitResult(
      tournament,
      step.roundIndex,
      step.matchIndex,
      step.scoreA,
      step.scoreB,
      {
        id: step.scorerId,
        name: step.scorerName,
        scoredAt: step.scoredAt
      }
    );
    tournament = {
      ...tournament,
      status: result.nextStatus,
      rounds: result.rounds,
      rankings: result.rankings
    };
  }
  return tournament.rankings.map((item) => ({
    id: item.id,
    wins: item.wins,
    losses: item.losses,
    points: item.points,
    pointDiff: item.pointDiff
  }));
}

test('concurrent submit order does not change final rankings once all score writes are applied', () => {
  const steps = [
    {
      roundIndex: 0,
      matchIndex: 0,
      scoreA: 21,
      scoreB: 15,
      scorerId: 'u1',
      scorerName: 'A',
      scoredAt: '2026-03-14T10:00:00.000Z'
    },
    {
      roundIndex: 1,
      matchIndex: 0,
      scoreA: 18,
      scoreB: 21,
      scorerId: 'u2',
      scorerName: 'B',
      scoredAt: '2026-03-14T10:01:00.000Z'
    }
  ];

  const orderAB = applySequence(steps);
  const orderBA = applySequence([steps[1], steps[0]]);

  assert.deepEqual(orderAB, orderBA);
});
