const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../cloudfunctions/getMyPerformanceStats/logic');

test('computeMyPerformanceStats aggregates finished participated data across modes', () => {
  const openid = 'u1';
  const tournaments = [
    {
      _id: 't1',
      status: 'finished',
      mode: 'multi_rotate',
      playerIds: ['u1', 'u2', 'u3', 'u4'],
      updatedAt: '2026-02-26T10:00:00.000Z',
      rounds: [{
        matches: [
          { status: 'finished', teamA: ['u1', 'u2'], teamB: ['u3', 'u4'], teamAScore: 21, teamBScore: 18, scoredAt: '2026-02-26T10:10:00.000Z' },
          { status: 'finished', teamA: ['u1', 'u3'], teamB: ['u2', 'u4'], teamAScore: 21, teamBScore: 21 },
          { status: 'canceled', teamA: ['u1', 'u4'], teamB: ['u2', 'u3'], teamAScore: 21, teamBScore: 17 }
        ]
      }]
    },
    {
      _id: 't2',
      status: 'finished',
      mode: 'squad_doubles',
      players: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }, { id: 'u4' }],
      updatedAt: '2026-02-27T10:00:00.000Z',
      rounds: [{
        matches: [
          { status: 'finished', teamA: ['u1', 'u2'], teamB: ['u3', 'u4'], scoreA: 15, scoreB: 21, scoredAt: '2026-02-27T10:05:00.000Z' }
        ]
      }]
    },
    {
      _id: 't3',
      status: 'finished',
      mode: 'fixed_pair_rr',
      playerIds: ['u1', 'u5', 'u6', 'u7'],
      updatedAt: '2026-02-28T10:00:00.000Z',
      rounds: [{
        matches: [
          { status: 'finished', teamA: ['u1', 'u5'], teamB: ['u6', 'u7'], score: { teamA: 11, teamB: 8 }, scoredAt: '2026-02-28T10:01:00.000Z' }
        ]
      }]
    },
    {
      _id: 't4',
      status: 'finished',
      playerIds: ['x1', 'x2', 'x3', 'x4'],
      rounds: [{
        matches: [
          { status: 'finished', teamA: ['x1', 'x2'], teamB: ['x3', 'x4'], teamAScore: 21, teamBScore: 19 }
        ]
      }]
    }
  ];

  const out = logic.computeMyPerformanceStats(tournaments, openid, 'all', Date.parse('2026-03-01T00:00:00.000Z'));

  assert.equal(out.tournamentsCompleted, 3);
  assert.equal(out.matchesPlayed, 3);
  assert.equal(out.wins, 2);
  assert.equal(out.losses, 1);
  assert.equal(out.pointsFor, 47);
  assert.equal(out.pointsAgainst, 47);
  assert.equal(out.pointDiff, 0);
  assert.equal(out.winRate, Number((2 / 3).toFixed(4)));
  assert.deepEqual(out.last10, { wins: 2, losses: 1 });
});

test('computeMyPerformanceStats applies last_30_days window', () => {
  const openid = 'u1';
  const nowMs = Date.parse('2026-03-01T00:00:00.000Z');
  const tournaments = [
    {
      status: 'finished',
      playerIds: ['u1', 'u2', 'u3', 'u4'],
      updatedAt: '2026-02-20T12:00:00.000Z',
      rounds: [{
        matches: [{ status: 'finished', teamA: ['u1', 'u2'], teamB: ['u3', 'u4'], teamAScore: 21, teamBScore: 16 }]
      }]
    },
    {
      status: 'finished',
      playerIds: ['u1', 'u5', 'u6', 'u7'],
      updatedAt: '2025-12-20T12:00:00.000Z',
      rounds: [{
        matches: [{ status: 'finished', teamA: ['u1', 'u5'], teamB: ['u6', 'u7'], teamAScore: 21, teamBScore: 18 }]
      }]
    }
  ];

  const out = logic.computeMyPerformanceStats(tournaments, openid, 'last_30_days', nowMs);
  assert.equal(out.scope, 'last_30_days_completed_participated');
  assert.equal(out.tournamentsCompleted, 1);
  assert.equal(out.matchesPlayed, 1);
  assert.equal(out.wins, 1);
  assert.equal(out.losses, 0);
});
