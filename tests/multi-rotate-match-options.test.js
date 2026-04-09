const test = require('node:test');
const assert = require('node:assert/strict');

const matchOptions = require('../miniprogram/core/ux/multiRotateMatchOptions');

test('multi_rotate match options resolve representative preset cases', () => {
  assert.deepEqual(
    matchOptions.resolveMultiRotateMatchOptions(10, 2),
    {
      players: 10,
      effectiveCourts: 2,
      horizonMatches: 22,
      presetMatches: [5, 10, 15],
      balancedMatch: 10,
      supportsAdvancedCustom: true
    }
  );

  assert.deepEqual(
    matchOptions.resolveMultiRotateMatchOptions(16, 4),
    {
      players: 16,
      effectiveCourts: 4,
      horizonMatches: 16,
      presetMatches: [8, 12, 16],
      balancedMatch: 12,
      supportsAdvancedCustom: true
    }
  );

  assert.deepEqual(
    matchOptions.resolveMultiRotateMatchOptions(8, 2),
    {
      players: 8,
      effectiveCourts: 2,
      horizonMatches: 16,
      presetMatches: [8, 14, 16],
      balancedMatch: 14,
      supportsAdvancedCustom: true
    }
  );
});

test('multi_rotate match options include expanded large-roster presets', () => {
  assert.deepEqual(
    matchOptions.resolveMultiRotateMatchOptions(20, 1),
    {
      players: 20,
      effectiveCourts: 1,
      horizonMatches: 18,
      presetMatches: [5, 10, 15],
      balancedMatch: 15,
      supportsAdvancedCustom: true
    }
  );

  assert.deepEqual(
    matchOptions.resolveMultiRotateMatchOptions(24, 2),
    {
      players: 24,
      effectiveCourts: 2,
      horizonMatches: 18,
      presetMatches: [6, 12, 18],
      balancedMatch: 18,
      supportsAdvancedCustom: true
    }
  );
});

test('multi_rotate match options fold partner-coverage milestones into sparse cases', () => {
  const caseData = matchOptions.resolveMultiRotateMatchOptions(7, 1);
  assert.equal(Array.isArray(caseData && caseData.presetMatches), true);
  assert.equal((caseData && caseData.presetMatches && caseData.presetMatches.length) || 0, 3);
  assert.equal((caseData && caseData.presetMatches || []).includes(11), true);
  assert.equal(Math.max(...(caseData && caseData.presetMatches || [0])), 18);
  assert.equal(caseData && caseData.supportsAdvancedCustom, true);
});

test('multi_rotate match options normalize requested courts and return null when no case exists', () => {
  const normalized = matchOptions.resolveMultiRotateMatchOptions(14, 4);
  assert.equal(normalized && normalized.effectiveCourts, 3);
  assert.equal(Array.isArray(normalized && normalized.presetMatches), true);
  assert.equal((normalized && normalized.presetMatches && normalized.presetMatches.length) || 0, 3);

  assert.equal(matchOptions.resolveMultiRotateMatchOptions(25, 1), null);
});

test('multi_rotate match options always keep three sorted presets and a balanced match inside the list', () => {
  for (const caseData of Object.values(matchOptions.cases || {})) {
    const presetMatches = Array.isArray(caseData && caseData.presetMatches) ? caseData.presetMatches : [];
    assert.equal(presetMatches.length, 3, `${caseData && caseData.players}p-${caseData && caseData.effectiveCourts}c`);
    assert.deepEqual(presetMatches.slice().sort((left, right) => left - right), presetMatches);
    assert.equal(presetMatches.includes(caseData.balancedMatch), true);
  }
});
