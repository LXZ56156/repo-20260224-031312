const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../cloudfunctions/startTournament/logic');
const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');
const { buildSquadSchedule, buildFixedPairSchedule } = require('../cloudfunctions/startTournament/scheduleModes');

test('validateBeforeGenerate canonicalizes playerId roster entries to player.id', () => {
  const out = logic.validateBeforeGenerate({
    players: [
      { playerId: 'p1', name: 'P1' },
      { playerId: 'p2', name: 'P2' },
      { playerId: 'p3', name: 'P3' },
      { playerId: 'p4', name: 'P4' }
    ],
    totalMatches: 1,
    courts: 1,
    mode: 'multi_rotate'
  });

  assert.deepEqual(out.players.map((player) => player.id), ['p1', 'p2', 'p3', 'p4']);
});

test('generateSchedule accepts roster entries using playerId', () => {
  const out = generateSchedule([
    { playerId: 'p1', name: 'P1', gender: 'male' },
    { playerId: 'p2', name: 'P2', gender: 'female' },
    { playerId: 'p3', name: 'P3', gender: 'male' },
    { playerId: 'p4', name: 'P4', gender: 'female' }
  ], 1, 1, { seed: 1 });

  assert.equal(Array.isArray(out.rounds), true);
  assert.equal(out.rounds.length, 1);
  assert.equal(out.rounds[0].matches.length, 1);
});

test('buildSquadSchedule accepts roster entries using _id', () => {
  const out = buildSquadSchedule([
    { _id: 'A1', name: 'A1', squad: 'A' },
    { _id: 'A2', name: 'A2', squad: 'A' },
    { _id: 'B1', name: 'B1', squad: 'B' },
    { _id: 'B2', name: 'B2', squad: 'B' }
  ], 1, 1, { endCondition: { type: 'total_matches', target: 1 } });

  assert.equal(Array.isArray(out.rounds), true);
  assert.equal(out.rounds.length, 1);
  assert.equal(out.rounds[0].matches.length, 1);
});

test('buildFixedPairSchedule accepts roster entries using playerId', () => {
  const out = buildFixedPairSchedule([
    { playerId: 'p1', name: 'P1' },
    { playerId: 'p2', name: 'P2' },
    { playerId: 'p3', name: 'P3' },
    { playerId: 'p4', name: 'P4' }
  ], 1, [
    { id: 'team_1', name: '一队', playerIds: ['p1', 'p2'] },
    { id: 'team_2', name: '二队', playerIds: ['p3', 'p4'] }
  ], { totalMatches: 1 });

  assert.equal(Array.isArray(out.rounds), true);
  assert.equal(out.rounds.length, 1);
  assert.deepEqual(out.rounds[0].matches[0].teamA, ['p1', 'p2']);
  assert.deepEqual(out.rounds[0].matches[0].teamB, ['p3', 'p4']);
});
