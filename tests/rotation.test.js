const test = require('node:test');
const assert = require('node:assert/strict');

const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
}

test('generateSchedule creates valid deterministic schedule', () => {
  const players = makePlayers(8);
  const M = 12;
  const C = 2;

  const a = generateSchedule(players, M, C, { seed: 12345 });
  const b = generateSchedule(players, M, C, { seed: 12345 });

  assert.equal(Array.isArray(a.rounds), true);
  assert.equal(a.rounds.length > 0, true);
  assert.deepEqual(a.rounds, b.rounds);

  const allMatches = a.rounds.flatMap((r) => r.matches || []);
  assert.equal(allMatches.length, M);

  for (const r of a.rounds) {
    assert.equal((r.matches || []).length <= C, true);
    const seen = new Set();
    for (const m of (r.matches || [])) {
      assert.equal(Array.isArray(m.teamA), true);
      assert.equal(Array.isArray(m.teamB), true);
      assert.equal(m.teamA.length, 2);
      assert.equal(m.teamB.length, 2);

      for (const pid of m.teamA) {
        assert.equal(seen.has(pid), false);
        seen.add(pid);
      }
      for (const pid of m.teamB) {
        assert.equal(seen.has(pid), false);
        seen.add(pid);
      }
    }
  }

  assert.equal(typeof a.fairnessScore, 'number');
  assert.equal(a.fairnessScore > 0, true);
  assert.equal(a.seed, b.seed);
  assert.equal(typeof a.schedulerMeta, 'object');
  assert.equal(a.schedulerMeta.engineVersion, 'rotation-v2');
  assert.equal(a.schedulerMeta.selectedSeed, a.seed);
  assert.equal(Array.isArray(a.schedulerMeta.triedSeeds), true);
  assert.equal(a.schedulerMeta.triedSeeds.length, 16);
  assert.equal(typeof a.schedulerMeta.policy, 'object');
  assert.equal(a.schedulerMeta.policy.policyVersion, 'v3');
  assert.equal(a.schedulerMeta.selectedSearchSeeds, 16);
  assert.equal(a.schedulerMeta.selectedEpsilon, 1.6);
});
