const test = require('node:test');
const assert = require('node:assert/strict');

const { generateSchedule, selectSchedulerPolicy } = require('../cloudfunctions/startTournament/rotation');

function makePlayers(n, femaleCount = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    gender: i < femaleCount ? 'female' : 'male'
  }));
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
  const out = generateSchedule(makePlayers(25, 12), 12, 1, { seed: 42, searchSeeds: 1 });
  const meta = out.schedulerMeta || {};
  assert.equal(meta.engineVersion, 'rotation-v3');
  assert.ok(['beam', 'legacy'].includes(meta.engine));
  assert.equal(meta.searchSeeds, 1);
  assert.equal(meta.selectedSearchSeeds, 1);
  assert.equal(meta.selectedEpsilon, 1.8);
  assert.equal(meta.policy && meta.policy.policyVersion, 'v3');
  assert.equal(typeof meta.executionProfile, 'string');
  assert.equal(typeof meta.timeoutGuardTriggered, 'boolean');
  assert.equal(meta.playSpread, 1);
  assert.equal(meta.uniqueExactMatchupCount, 12);
  assert.equal(meta.effectiveCourts, 1);
  assert.equal(meta.policy && meta.policy.courts, 1);
});

test('generateSchedule exposes template metadata for newly templated 17p-1c case', () => {
  const out = generateSchedule(makePlayers(17, 8), 12, 1, { seed: 42 });
  const meta = out.schedulerMeta || {};
  assert.equal(meta.engineVersion, 'rotation-v3');
  assert.equal(meta.engine, 'template');
  assert.equal(meta.templateKey, '17p-1c');
  assert.equal(meta.uniqueExactMatchupCount, 12);
  assert.equal(meta.playSpread, 1);
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

test('templated schedules expose requested and effective courts separately', () => {
  const out = generateSchedule(makePlayers(14, 6), 12, 4, { seed: 42 });
  const meta = out.schedulerMeta || {};
  assert.equal(meta.engine, 'template');
  assert.equal(meta.templateKey, '14p-3c');
  assert.equal(meta.effectiveCourts, 3);
  assert.equal(meta.policy && meta.policy.courts, 4);
});
