const test = require('node:test');
const assert = require('node:assert/strict');

const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');

const TEMPLATE_FAST_BOUND_MS = 300;

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
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('4p-1c handcrafted template returns within a tight bound', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(4), 3, 1, { seed: 17 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '4p-1c');
  assert.equal(out.schedulerMeta.templateHorizon, 3);
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 3);
  assert.equal(out.schedulerMeta.playSpread, 0);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('newly templated single-court cases return within a tight bound', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(9), 12, 1, { seed: 7 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('newly templated dual-court cases return within a tight bound', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(12), 12, 2, { seed: 71 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '12p-2c');
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 0);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('newly templated triple-court cases return within a tight bound', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(12), 12, 3, { seed: 83 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '12p-3c');
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 0);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
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
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
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
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('16p-4c now routes through template instead of beam', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(16, 8), 12, 4, { seed: 97 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '16p-4c');
  assert.equal(out.schedulerMeta.templateHorizon, 16);
  assert.equal(out.rounds.flatMap((round) => round.matches || []).length, 12);
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 0);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('20p-1c now routes through template instead of guarded fallback', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(20, 10), 12, 1, { seed: 101, searchSeeds: 1 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '20p-1c');
  assert.equal(out.schedulerMeta.templateHorizon, 18);
  assert.equal(out.rounds.flatMap((round) => round.matches || []).length, 12);
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 1);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('24p-2c now routes through template instead of guarded fallback', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(24, 12), 12, 2, { seed: 103, searchSeeds: 1 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '24p-2c');
  assert.equal(out.schedulerMeta.templateHorizon, 18);
  assert.equal(out.rounds.flatMap((round) => round.matches || []).length, 12);
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 0);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('runtime budget keeps guarded completion when request exceeds template horizon', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(10, 5), 23, 2, {
    seed: 42,
    searchSeeds: 8,
    runtimeBudgetMs: 200
  });
  const elapsed = Date.now() - started;
  const matches = out.rounds.flatMap((round) => round.matches || []);

  assert.equal(matches.length, 23);
  assert.ok(['beam', 'legacy'].includes(out.schedulerMeta.engine));
  assert.ok(['beam-guarded', 'legacy-guarded'].includes(out.schedulerMeta.executionProfile));
  assert.equal(out.schedulerMeta.timeoutGuardTriggered, true);
  assert.equal(typeof out.schedulerMeta.searchElapsedMs, 'number');
  assert.equal(out.schedulerMeta.fairnessVersion, 'v2');
  assert.ok(elapsed < 1500, `elapsed=${elapsed}ms should stay under guarded bound`);
});
