const test = require('node:test');
const assert = require('node:assert/strict');

const { generateSchedule, selectSchedulerPolicy } = require('../cloudfunctions/startTournament/rotation');

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
}

test('selectSchedulerPolicy picks expected searchSeeds and epsilon', () => {
  const a = selectSchedulerPolicy(9, 2, 16);
  assert.equal(a.selectedSearchSeeds, 16);
  assert.equal(a.selectedEpsilon, 1.6);

  const b = selectSchedulerPolicy(10, 2, 18);
  assert.equal(b.selectedSearchSeeds, 10);
  assert.equal(b.selectedEpsilon, 1.6);

  const c = selectSchedulerPolicy(12, 1, 18);
  assert.equal(c.selectedSearchSeeds, 16);
  assert.equal(c.selectedEpsilon, 1.8);
  assert.equal(c.policyVersion, 'v3');
});

test('generateSchedule exposes policy metadata in schedulerMeta', () => {
  const out = generateSchedule(makePlayers(12), 12, 3, { seed: 42, searchSeeds: 1 });
  const meta = out.schedulerMeta || {};
  assert.equal(meta.engineVersion, 'rotation-v3');
  assert.ok(['beam', 'legacy'].includes(meta.engine));
  assert.equal(meta.searchSeeds, 1);
  assert.equal(meta.selectedSearchSeeds, 1);
  assert.equal(meta.selectedEpsilon, 1.6);
  assert.equal(meta.policy && meta.policy.policyVersion, 'v3');
  assert.equal(typeof meta.executionProfile, 'string');
  assert.equal(typeof meta.timeoutGuardTriggered, 'boolean');
  assert.equal(meta.playSpread, 0);
  assert.equal(meta.uniqueExactMatchupCount, 12);
});

test('generateSchedule exposes template metadata for templated doubles cases', () => {
  const out = generateSchedule(makePlayers(10), 18, 2, { seed: 42 });
  const meta = out.schedulerMeta || {};
  assert.equal(meta.engineVersion, 'rotation-v3');
  assert.equal(meta.engine, 'template');
  assert.equal(meta.templateKey, '10p-2c');
  assert.equal(meta.templateHorizon, 22);
  assert.equal(meta.playSpread, 1);
  assert.equal(meta.uniqueExactMatchupCount, 18);
});
