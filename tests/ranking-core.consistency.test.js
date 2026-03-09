const test = require('node:test');
const assert = require('node:assert/strict');

const frontendRankingCore = require('../miniprogram/core/rankingCore');
const cloudRankingCore = require('../cloudfunctions/rebuildRankings/lib/rankingCore');

function playerTournament() {
  return {
    mode: 'multi_rotate',
    players: [
      { id: 'u1', name: 'A' },
      { id: 'u2', name: 'B' },
      { id: 'u3', name: 'C' },
      { id: 'u4', name: 'D' }
    ],
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        status: 'finished',
        teamA: [{ id: 'u1' }, { id: 'u2' }],
        teamB: [{ id: 'u3' }, { id: 'u4' }],
        score: { teamA: 21, teamB: 18 }
      }]
    }]
  };
}

function teamTournament() {
  return {
    mode: 'fixed_pair_rr',
    pairTeams: [
      { id: 'pair_1', name: '一队' },
      { id: 'pair_2', name: '二队' }
    ],
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        status: 'finished',
        unitAId: 'pair_1',
        unitAName: '一队',
        unitBId: 'pair_2',
        unitBName: '二队',
        score: { teamA: 21, teamB: 16 }
      }]
    }]
  };
}

test('frontend and cloud ranking cores produce the same player rankings', () => {
  const tournament = playerTournament();
  assert.deepEqual(
    frontendRankingCore.computeRankings(tournament),
    cloudRankingCore.computeRankings(tournament)
  );
});

test('frontend and cloud ranking cores produce the same team rankings', () => {
  const tournament = teamTournament();
  assert.deepEqual(
    frontendRankingCore.computeRankings(tournament),
    cloudRankingCore.computeRankings(tournament)
  );
});
