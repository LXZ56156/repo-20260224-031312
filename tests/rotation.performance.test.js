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

test('newly templated dual-court cases return within a tight bound', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(12), 12, 2, { seed: 71 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '12p-2c');
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 0);
  assert.ok(elapsed < 100, `elapsed=${elapsed}`);
});

test('beam fallback still returns a full schedule for non-templated cases', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(12), 12, 3, { seed: 42, searchSeeds: 1 });
  const elapsed = Date.now() - started;

  assert.ok(['beam', 'legacy'].includes(out.schedulerMeta.engine));
  assert.equal(out.rounds.flatMap((round) => round.matches || []).length, 12);
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 0);
  assert.ok(elapsed < 4000, `elapsed=${elapsed}`);
});

test('runtime budget can force guarded completion while still returning a full schedule', () => {
  const out = generateSchedule(makePlayers(12), 12, 3, {
    seed: 42,
    searchSeeds: 8,
    runtimeBudgetMs: 700
  });
  const matches = out.rounds.flatMap((round) => round.matches || []);

  assert.equal(matches.length, 12);
  assert.equal(out.schedulerMeta.engine, 'beam');
  assert.equal(out.schedulerMeta.executionProfile, 'beam-guarded');
  assert.equal(out.schedulerMeta.timeoutGuardTriggered, true);
});
