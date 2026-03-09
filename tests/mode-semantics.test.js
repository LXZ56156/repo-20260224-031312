const test = require('node:test');
const assert = require('node:assert/strict');

const modeHelper = require('../miniprogram/core/mode');
const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');

function makePlayers() {
  return Array.from({ length: 8 }, (_, idx) => ({
    id: `p${idx + 1}`,
    name: `P${idx + 1}`,
    gender: idx < 4 ? 'male' : 'female'
  }));
}

test('global normalizeMode stays on business semantics while rotation still resolves scheduler aliases', () => {
  assert.equal(modeHelper.normalizeMode('mixed_fallback'), modeHelper.MODE_MULTI_ROTATE);
  assert.equal(modeHelper.normalizeMode('doubles'), modeHelper.MODE_MULTI_ROTATE);

  const out = generateSchedule(makePlayers(), 6, 1, {
    mode: 'mixed_fallback',
    allowOpen: false,
    seed: 42
  });

  assert.equal(Array.isArray(out.rounds), true);
  assert.equal(out.rounds.length > 0, true);
});
