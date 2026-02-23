const test = require('node:test');
const assert = require('node:assert/strict');

const matchFlow = require('../miniprogram/core/matchFlow');

function fixtureRounds() {
  return [
    {
      roundIndex: 0,
      matches: [
        { matchIndex: 0, status: 'finished' },
        { matchIndex: 1, status: 'pending' }
      ]
    },
    {
      roundIndex: 1,
      matches: [
        { matchIndex: 0, status: 'pending' },
        { matchIndex: 1, status: 'pending' }
      ]
    }
  ];
}

test('findNextPending returns next pending match after current', () => {
  const next = matchFlow.findNextPending(fixtureRounds(), 0, 0);
  assert.deepEqual(next, { roundIndex: 0, matchIndex: 1 });
});

test('findNextPending wraps to first pending when current is after all pending', () => {
  const next = matchFlow.findNextPending(fixtureRounds(), 9, 9);
  assert.deepEqual(next, { roundIndex: 0, matchIndex: 1 });
});

test('findNextPending returns null when no pending matches', () => {
  const rounds = [{ roundIndex: 0, matches: [{ matchIndex: 0, status: 'finished' }] }];
  assert.equal(matchFlow.findNextPending(rounds, 0, 0), null);
});

test('shouldAutoJump only true when both batchMode and autoNext are true', () => {
  assert.equal(matchFlow.shouldAutoJump(true, true), true);
  assert.equal(matchFlow.shouldAutoJump(true, false), false);
  assert.equal(matchFlow.shouldAutoJump(false, true), false);
  assert.equal(matchFlow.shouldAutoJump(false, false), false);
});
