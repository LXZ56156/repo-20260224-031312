const test = require('node:test');
const assert = require('node:assert/strict');

const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');

function makePlayersWithGender(genders) {
  return genders.map((gender, idx) => ({
    id: `p${idx + 1}`,
    name: `P${idx + 1}`,
    gender
  }));
}

function teamType(team, genderById) {
  const g1 = genderById[team[0]] || 'unknown';
  const g2 = genderById[team[1]] || 'unknown';
  if (g1 === 'male' && g2 === 'male') return 'MM';
  if (g1 === 'female' && g2 === 'female') return 'FF';
  if ((g1 === 'male' && g2 === 'female') || (g1 === 'female' && g2 === 'male')) return 'MX';
  return 'OPEN';
}

test('mixed_fallback generates only same-type matchups', () => {
  const players = makePlayersWithGender([
    'male', 'male', 'male', 'male',
    'female', 'female', 'female', 'female'
  ]);
  const genderById = Object.fromEntries(players.map((p) => [p.id, p.gender]));
  const out = generateSchedule(players, 10, 2, {
    mode: 'mixed_fallback',
    allowOpen: false,
    seed: 42
  });

  for (const round of out.rounds || []) {
    for (const match of round.matches || []) {
      const typeA = teamType(match.teamA, genderById);
      const typeB = teamType(match.teamB, genderById);
      assert.equal(typeA, typeB);
      assert.notEqual(typeA, 'OPEN');
    }
  }
});

test('mixed_fallback can degrade to MM when only men exist', () => {
  const players = makePlayersWithGender([
    'male', 'male', 'male', 'male',
    'male', 'male', 'male', 'male'
  ]);
  const genderById = Object.fromEntries(players.map((p) => [p.id, p.gender]));
  const out = generateSchedule(players, 6, 1, {
    mode: 'mixed_fallback',
    allowOpen: false,
    seed: 7
  });

  assert.equal((out.rounds || []).length > 0, true);
  for (const round of out.rounds || []) {
    for (const match of round.matches || []) {
      const typeA = teamType(match.teamA, genderById);
      const typeB = teamType(match.teamB, genderById);
      assert.equal(typeA, 'MM');
      assert.equal(typeB, 'MM');
    }
  }
});
