const test = require('node:test');
const assert = require('node:assert/strict');

const frontend = require('../miniprogram/core/scoreUtils');
const cloud = require('../cloudfunctions/scoreLock/lib/score');

test('frontend and cloud score helpers parse and validate score objects consistently', () => {
  const payload = {
    score: { teamA: '21', teamB: '19' }
  };

  assert.deepEqual(frontend.extractScorePairAny(payload), cloud.extractScorePairAny(payload));
  assert.deepEqual(frontend.normalizeScoreObject(payload), cloud.normalizeScoreObject(payload));
  assert.equal(frontend.isValidFinishedScore(payload), cloud.isValidFinishedScore(payload));
  assert.equal(frontend.isScoreWithinBounds(payload), cloud.isScoreWithinBounds(payload));
});
