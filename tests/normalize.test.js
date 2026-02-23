const test = require('node:test');
const assert = require('node:assert/strict');

const normalize = require('../miniprogram/core/normalize');

test('safePlayerName falls back to id suffix when name missing', () => {
  const p = { id: 'guest_abc1234' };
  assert.equal(normalize.safePlayerName(p), '1234');
});

test('normalizeTournament migrates legacy flat score fields', () => {
  const t = {
    players: [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }, { id: 'u3', name: 'C' }, { id: 'u4', name: 'D' }],
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        teamA: ['u1', 'u2'],
        teamB: ['u3', 'u4'],
        teamAScore: 21,
        teamBScore: 17,
        status: 'finished'
      }],
      restPlayers: []
    }]
  };

  const nt = normalize.normalizeTournament(t);
  const m = nt.rounds[0].matches[0];

  assert.deepEqual(m.score, { teamA: 21, teamB: 17 });
  assert.equal(m.teamA[0].name, 'A');
  assert.equal(m.teamB[1].name, 'D');
});
