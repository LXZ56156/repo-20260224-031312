const test = require('node:test');
const assert = require('node:assert/strict');

const flow = require('../miniprogram/core/uxFlow');

function pickMatches(out) {
  return out.recommendedMatches.map((item) => item.m);
}

test('buildMatchCountRecommendations returns v2 metadata and ordered tiers', () => {
  const out = flow.buildMatchCountRecommendations({
    playersCount: 8,
    courts: 2,
    sessionMinutes: 180,
    slotMinutes: 15
  });

  const [relax, balanced, intense] = pickMatches(out);
  assert.equal(out.recommendedModelVersion, flow.RECOMMEND_MODEL_VERSION);
  assert.equal(out.recommendedModelVersion, 'v2');
  assert.equal(out.capReason, 'time');
  assert.equal(out.estimatedMode, false);
  assert.equal(out.recommendedCap, 22);
  assert.ok(relax < balanced);
  assert.ok(balanced < intense);
  assert.ok(intense <= out.recommendedCap);
});

test('buildMatchCountRecommendations is bounded by combinatorics when needed', () => {
  const out = flow.buildMatchCountRecommendations({
    playersCount: 4,
    courts: 4,
    sessionMinutes: 180,
    slotMinutes: 13
  });

  assert.equal(out.maxByCombinatorics, 3);
  assert.ok(out.maxByTime > out.maxByCombinatorics);
  assert.equal(out.capReason, 'combinatorics');
  assert.equal(out.recommendedCap, 3);
  assert.deepEqual(pickMatches(out), [1, 2, 3]);
});

test('buildMatchCountRecommendations applies estimated-mode discount when players < 4', () => {
  const estimated = flow.buildMatchCountRecommendations({
    playersCount: 2,
    courts: 2,
    sessionMinutes: 120,
    slotMinutes: 15
  });
  const known = flow.buildMatchCountRecommendations({
    playersCount: 8,
    courts: 2,
    sessionMinutes: 120,
    slotMinutes: 15
  });

  assert.equal(estimated.estimatedMode, true);
  assert.equal(estimated.capReason, 'estimated');
  assert.equal(estimated.maxByCombinatorics, 0);
  assert.ok(estimated.balancedRaw < known.balancedRaw);
  assert.ok(estimated.recommendedMatches[1].m < known.recommendedMatches[1].m);
});

test('buildMatchCountRecommendations keeps every tier within hard cap', () => {
  const out = flow.buildMatchCountRecommendations({
    playersCount: 6,
    courts: 1,
    sessionMinutes: 90,
    slotMinutes: 18
  });
  const cap = Math.min(out.maxByTime, out.maxByCombinatorics > 0 ? out.maxByCombinatorics : Number.POSITIVE_INFINITY);
  for (const item of out.recommendedMatches) {
    assert.ok(item.m >= 1);
    assert.ok(item.m <= cap);
  }
});

test('buildMatchCountRecommendations snapshots core scenarios', () => {
  const cases = [
    { playersCount: 6, courts: 1, sessionMinutes: 90, slotMinutes: 15, tiers: [2, 3, 4], capReason: 'time' },
    { playersCount: 8, courts: 1, sessionMinutes: 120, slotMinutes: 15, tiers: [4, 6, 7], capReason: 'time' },
    { playersCount: 12, courts: 2, sessionMinutes: 180, slotMinutes: 15, tiers: [11, 14, 17], capReason: 'time' }
  ];

  for (const item of cases) {
    const out = flow.buildMatchCountRecommendations(item);
    assert.deepEqual(pickMatches(out), item.tiers);
    assert.equal(out.capReason, item.capReason);
  }
});

test('buildMatchCountRecommendations normalizes legacy mixed mode to multi_rotate', () => {
  const out = flow.buildMatchCountRecommendations({
    mode: 'mixed_fallback',
    playersCount: 8,
    maleCount: 4,
    femaleCount: 4,
    unknownCount: 0,
    courts: 2,
    sessionMinutes: 120,
    slotMinutes: 15
  });
  assert.equal(out.mode, flow.MODE_MULTI_ROTATE);
  assert.equal(out.recommendedModelVersion, flow.RECOMMEND_MODEL_VERSION);
  assert.equal(out.recommendedCap > 0, true);
  const tiers = pickMatches(out);
  assert.ok(tiers[0] <= tiers[1]);
  assert.ok(tiers[1] <= tiers[2]);
});

test('buildMatchCountRecommendations uses estimated hint with unknown roster', () => {
  const out = flow.buildMatchCountRecommendations({
    mode: 'mixed_fallback',
    playersCount: 0,
    maleCount: 0,
    femaleCount: 0,
    unknownCount: 0,
    courts: 2,
    sessionMinutes: 120,
    slotMinutes: 15
  });
  assert.equal(out.estimatedMode, true);
  assert.equal(out.capReason, 'estimated');
});
