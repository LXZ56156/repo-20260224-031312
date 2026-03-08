const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../cloudfunctions/submitScore/logic');

test('buildIdempotentRetryResult dedupes same scorer retry on finished match', () => {
  const result = logic.buildIdempotentRetryResult(
    {
      status: 'finished',
      teamAScore: 21,
      teamBScore: 18,
      scorerId: 'user_1',
      scorerName: '裁判A'
    },
    21,
    18,
    'user_1',
    '备用名'
  );

  assert.deepEqual(result, {
    ok: true,
    deduped: true,
    finished: true,
    scorerName: '裁判A'
  });
});

test('buildIdempotentRetryResult dedupes legacy finished match without scorerId when score matches', () => {
  const result = logic.buildIdempotentRetryResult(
    {
      status: 'finished',
      score: { teamA: 15, teamB: 21 }
    },
    15,
    21,
    'user_2',
    '球友B'
  );

  assert.deepEqual(result, {
    ok: true,
    deduped: true,
    finished: true,
    scorerName: '球友B'
  });
});

test('buildIdempotentRetryResult rejects finished retry when score differs or scorer differs', () => {
  assert.equal(logic.buildIdempotentRetryResult(
    {
      status: 'finished',
      teamAScore: 21,
      teamBScore: 19,
      scorerId: 'user_1',
      scorerName: '裁判A'
    },
    21,
    18,
    'user_1',
    '备用名'
  ), null);

  assert.equal(logic.buildIdempotentRetryResult(
    {
      status: 'finished',
      teamAScore: 21,
      teamBScore: 18,
      scorerId: 'user_1',
      scorerName: '裁判A'
    },
    21,
    18,
    'user_2',
    '备用名'
  ), null);
});
