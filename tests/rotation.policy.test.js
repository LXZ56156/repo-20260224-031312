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
  assert.equal(b.selectedSearchSeeds, 12);
  assert.equal(b.selectedEpsilon, 1.6);

  const c = selectSchedulerPolicy(12, 1, 18);
  assert.equal(c.selectedSearchSeeds, 16);
  assert.equal(c.selectedEpsilon, 1.8);
  assert.equal(c.policyVersion, 'v3');
});

test('generateSchedule exposes policy metadata in schedulerMeta', () => {
  const out = generateSchedule(makePlayers(10), 18, 2, { seed: 42 });
  const meta = out.schedulerMeta || {};
  assert.equal(meta.searchSeeds, 12);
  assert.equal(meta.selectedSearchSeeds, 12);
  assert.equal(meta.selectedEpsilon, 1.6);
  assert.equal(meta.policy && meta.policy.policyVersion, 'v3');
});
