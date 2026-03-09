const test = require('node:test');
const assert = require('node:assert/strict');

const scoreUtils = require('../miniprogram/core/scoreUtils');

test('scoreUtils reads standard and legacy score fields into one pair format', () => {
  assert.deepEqual(scoreUtils.extractScorePairAny({ score: { teamA: 21, teamB: 18 } }), { a: 21, b: 18 });
  assert.deepEqual(scoreUtils.extractScorePairAny({ teamAScore: 19, teamBScore: 21 }), { a: 19, b: 21 });
  assert.deepEqual(scoreUtils.extractScorePairAny({ scoreA: '15', scoreB: '10' }), { a: 15, b: 10 });
});

test('scoreUtils normalizes to standard score object and validates finished scores', () => {
  assert.deepEqual(scoreUtils.normalizeScoreObject({ teamAScore: 21, teamBScore: 17 }), { teamA: 21, teamB: 17 });
  assert.equal(scoreUtils.isValidFinishedScore({ score: { teamA: 21, teamB: 17 } }), true);
  assert.equal(scoreUtils.isValidFinishedScore({ scoreA: 21, scoreB: 21 }), false);
  assert.equal(scoreUtils.isValidFinishedScore({ scoreA: -1, scoreB: 21 }), false);
  assert.equal(scoreUtils.normalizeScoreObject({ teamA: [], teamB: [] }), null);
});
