const test = require('node:test');
const assert = require('node:assert/strict');

const { findNextPending } = require('../miniprogram/core/matchFlow');
const flow = require('../miniprogram/core/uxFlow');

test('findNextPending ignores canceled matches', () => {
  const rounds = [
    {
      roundIndex: 0,
      matches: [
        { matchIndex: 0, status: 'finished' },
        { matchIndex: 1, status: 'canceled' }
      ]
    },
    {
      roundIndex: 1,
      matches: [
        { matchIndex: 0, status: 'pending' }
      ]
    }
  ];
  const next = findNextPending(rounds, 0, 0);
  assert.deepEqual(next, { roundIndex: 1, matchIndex: 0 });
});

test('hasPendingMatch treats canceled as terminal status', () => {
  const rounds = [
    {
      roundIndex: 0,
      matches: [
        { matchIndex: 0, status: 'finished' },
        { matchIndex: 1, status: 'canceled' }
      ]
    }
  ];
  assert.equal(flow.hasPendingMatch(rounds), false);
});

