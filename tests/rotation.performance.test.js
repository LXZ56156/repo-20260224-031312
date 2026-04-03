const test = require('node:test');
const assert = require('node:assert/strict');

const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
}

test('templated schedules return within a tight bound', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(10), 22, 2, { seed: 53 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.ok(elapsed < 100, `elapsed=${elapsed}`);
});

test('newly templated single-court cases return within a tight bound', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(9), 12, 1, { seed: 7 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.ok(elapsed < 100, `elapsed=${elapsed}`);
});

test('beam fallback still returns a full schedule for non-templated cases', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(12), 12, 2, { seed: 42, searchSeeds: 1 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'beam');
  assert.equal(out.schedulerMeta.searchSeeds, 1);
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 0);
  assert.ok(elapsed < 6000, `elapsed=${elapsed}`);
});
