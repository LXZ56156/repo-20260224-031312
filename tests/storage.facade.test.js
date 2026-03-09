const test = require('node:test');
const assert = require('node:assert/strict');

const storage = require('../miniprogram/core/storage');

test('storage facade re-exports domain APIs with backward-compatible surface', () => {
  assert.equal(typeof storage.get, 'function');
  assert.equal(typeof storage.getUserProfile, 'function');
  assert.equal(typeof storage.getRecentTournamentIds, 'function');
  assert.equal(typeof storage.getSessionMinutesPref, 'function');
  assert.equal(typeof storage.buildScoreDraftKey, 'function');
  assert.equal(typeof storage.getAdLastExposure, 'function');
});
