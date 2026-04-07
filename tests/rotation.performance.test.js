const test = require('node:test');
const assert = require('node:assert/strict');

const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');

function makePlayers(n, femaleCount = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    gender: i < femaleCount ? 'female' : 'male'
  }));
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

test('newly templated triple-court cases return within a tight bound', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(12), 12, 3, { seed: 83 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '12p-3c');
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 0);
  assert.ok(elapsed < 100, `elapsed=${elapsed}`);
});

test('effective-court normalization can route higher requested courts into templates', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(14, 6), 12, 4, { seed: 89 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '14p-3c');
  assert.equal(out.schedulerMeta.effectiveCourts, 3);
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 1);
  assert.ok(elapsed < 100, `elapsed=${elapsed}`);
});

test('17p-1c now routes through template instead of long-tail fallback', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(17, 8), 12, 1, { seed: 42, searchSeeds: 1 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '17p-1c');
  assert.equal(out.rounds.flatMap((round) => round.matches || []).length, 12);
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 1);
  assert.ok(elapsed < 100, `elapsed=${elapsed}`);
});

test('runtime budget can force guarded completion while still returning a full schedule', () => {
  const out = generateSchedule(makePlayers(18, 9), 12, 1, {
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
