const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSquadSchedule } = require('../cloudfunctions/startTournament/scheduleModes');

function makePlayers(aCount, bCount) {
  const players = [];
  for (let i = 0; i < aCount; i += 1) {
    players.push({ id: `A${i + 1}`, name: `A${i + 1}`, squad: 'A' });
  }
  for (let i = 0; i < bCount; i += 1) {
    players.push({ id: `B${i + 1}`, name: `B${i + 1}`, squad: 'B' });
  }
  return players;
}

test('squad total_rounds ends by rounds instead of converted matches', () => {
  const out = buildSquadSchedule(
    makePlayers(4, 4),
    12,
    3,
    { endCondition: { type: 'total_rounds', target: 2 } }
  );
  assert.equal((out.rounds || []).length, 2);
  assert.equal((out.rounds || []).flatMap((round) => round.matches || []).length, 4);
});

test('squad target_wins uses 2*target-1 minimal pre-generation', () => {
  const target = 5;
  const out = buildSquadSchedule(
    makePlayers(6, 6),
    1,
    2,
    { endCondition: { type: 'target_wins', target } }
  );
  const totalMatches = (out.rounds || []).flatMap((round) => round.matches || []).length;
  assert.equal(totalMatches, target * 2 - 1);
});

