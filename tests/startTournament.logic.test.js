const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../cloudfunctions/startTournament/logic');

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
}

test('calcMaxMatches computes C(n,4)*3', () => {
  assert.equal(logic.calcMaxMatches(3), 0);
  assert.equal(logic.calcMaxMatches(4), 3);
  assert.equal(logic.calcMaxMatches(8), 210);
});

test('validateBeforeGenerate rejects insufficient players', () => {
  assert.throws(
    () => logic.validateBeforeGenerate({ players: makePlayers(3), totalMatches: 1, courts: 1 }),
    /参赛人数不足/
  );
});

test('validateBeforeGenerate rejects totalMatches over max', () => {
  assert.throws(
    () => logic.validateBeforeGenerate({ players: makePlayers(4), totalMatches: 4, courts: 1 }),
    /总场次不能超过最大可选/
  );
});

test('validateBeforeGenerate returns normalized values', () => {
  const out = logic.validateBeforeGenerate({ players: makePlayers(6), totalMatches: 5, courts: 99 });
  assert.equal(out.players.length, 6);
  assert.equal(out.totalMatches, 5);
  assert.equal(out.courts, 10);
  assert.equal(out.maxMatches > 0, true);
});

test('validateBeforeGenerate accepts legacy mixed mode and maps to multi_rotate', () => {
  const players = [
    { id: 'p1', name: 'P1', gender: 'male' },
    { id: 'p2', name: 'P2', gender: 'male' },
    { id: 'p3', name: 'P3', gender: 'female' },
    { id: 'p4', name: 'P4', gender: 'unknown' }
  ];
  const out = logic.validateBeforeGenerate({
    players,
    totalMatches: 1,
    courts: 1,
    mode: 'mixed_fallback',
    allowOpenTeam: false
  });
  assert.equal(out.mode, 'multi_rotate');
  assert.equal(out.maxMatches > 0, true);
});

test('validateBeforeGenerate accepts explicit multi_rotate regardless of gender mix', () => {
  const players = [
    { id: 'p1', name: 'P1', gender: 'male' },
    { id: 'p2', name: 'P2', gender: 'male' },
    { id: 'p3', name: 'P3', gender: 'female' },
    { id: 'p4', name: 'P4', gender: 'unknown' }
  ];
  const out = logic.validateBeforeGenerate({
    players,
    totalMatches: 1,
    courts: 1,
    mode: 'multi_rotate',
    allowOpenTeam: false
  });
  assert.equal(out.mode, 'multi_rotate');
  assert.equal(out.maxMatches > 0, true);
});
