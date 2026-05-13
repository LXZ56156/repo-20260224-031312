const test = require('node:test');
const assert = require('node:assert/strict');

const matchOptions = require('../miniprogram/core/ux/multiRotateMatchOptions');
const templateLibrary = require('../cloudfunctions/startTournament/rotation.templates');

function findCoverageMatch(caseData) {
  const prefixMetrics = caseData && caseData.prefixMetrics ? caseData.prefixMetrics : {};
  return Object.keys(prefixMetrics)
    .map((value) => Number(value) || 0)
    .filter((matches) => matches > 0 && prefixMetrics[String(matches)] && prefixMetrics[String(matches)].allPartnerPairsCovered === true)
    .sort((left, right) => left - right)[0] || 0;
}

test('multi_rotate match options resolve representative preset cases', () => {
  assert.deepEqual(
    matchOptions.resolveMultiRotateMatchOptions(10, 2),
    {
      players: 10,
      effectiveCourts: 2,
      horizonMatches: 30,
      presetMatches: [15, 23, 30],
      balancedMatch: 23,
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
    matchOptions.resolveMultiRotateMatchOptions(20, 2),
    {
      players: 20,
      effectiveCourts: 2,
      horizonMatches: 18,
      presetMatches: [12, 15, 18],
      balancedMatch: 15,
      supportsAdvancedCustom: true
    }
  );

  assert.deepEqual(
    matchOptions.resolveMultiRotateMatchOptions(24, 1),
    {
      players: 24,
      effectiveCourts: 1,
      horizonMatches: 16,
      presetMatches: [12, 15, 16],
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

test('multi_rotate match options expose stabilized large-roster 3c and 4c bands', () => {
  assert.deepEqual(
    matchOptions.resolveMultiRotateMatchOptions(20, 3),
    {
      players: 20,
      effectiveCourts: 3,
      horizonMatches: 18,
      presetMatches: [14, 17, 18],
      balancedMatch: 18,
      supportsAdvancedCustom: true
    }
  );

  assert.deepEqual(
    matchOptions.resolveMultiRotateMatchOptions(20, 4),
    {
      players: 20,
      effectiveCourts: 4,
      horizonMatches: 16,
      presetMatches: [14, 15, 16],
      balancedMatch: 16,
      supportsAdvancedCustom: true
    }
  );

  assert.deepEqual(
    matchOptions.resolveMultiRotateMatchOptions(24, 3),
    {
      players: 24,
      effectiveCourts: 3,
      horizonMatches: 18,
      presetMatches: [16, 17, 18],
      balancedMatch: 18,
      supportsAdvancedCustom: true
    }
  );

  assert.deepEqual(
    matchOptions.resolveMultiRotateMatchOptions(24, 4),
    {
      players: 24,
      effectiveCourts: 4,
      horizonMatches: 16,
      presetMatches: [14, 15, 16],
      balancedMatch: 16,
      supportsAdvancedCustom: true
    }
  );
});

test('multi_rotate match options fold partner-coverage milestones into sparse cases', () => {
  const caseData = matchOptions.resolveMultiRotateMatchOptions(7, 1);
  assert.equal(Array.isArray(caseData && caseData.presetMatches), true);
  assert.equal((caseData && caseData.presetMatches && caseData.presetMatches.length) || 0, 2);
  assert.equal((caseData && caseData.presetMatches || []).includes(14), true);
  assert.equal(Math.max(...(caseData && caseData.presetMatches || [0])), 21);
  assert.equal(caseData && caseData.supportsAdvancedCustom, true);
});

test('multi_rotate match options keep audited balanced presets for up to 10 players', () => {
  const expected = {
    '4p-1c': { players: 4, courts: 1, presets: [1, 2, 3], balanced: 3 },
    '5p-1c': { players: 5, courts: 1, presets: [5, 10, 15], balanced: 5 },
    '6p-1c': { players: 6, courts: 1, presets: [9, 15, 18], balanced: 9 },
    '7p-1c': { players: 7, courts: 1, presets: [14, 21], balanced: 14 },
    '8p-1c': { players: 8, courts: 1, presets: [8, 14, 16], balanced: 14 },
    '8p-2c': { players: 8, courts: 2, presets: [8, 14, 16], balanced: 14 },
    '9p-1c': { players: 9, courts: 1, presets: [8, 9, 18], balanced: 18 },
    '9p-2c': { players: 9, courts: 2, presets: [9, 10, 18], balanced: 18 },
    '10p-1c': { players: 10, courts: 1, presets: [15, 23, 30], balanced: 23 },
    '10p-2c': { players: 10, courts: 2, presets: [15, 23, 30], balanced: 23 }
  };

  for (const [key, item] of Object.entries(expected)) {
    const out = matchOptions.resolveMultiRotateMatchOptions(item.players, item.courts);
    const coverageMatch = findCoverageMatch(templateLibrary.cases[key]);
    const balancedMetrics = templateLibrary.cases[key].prefixMetrics[String(item.balanced)] || {};
    assert.deepEqual(out && out.presetMatches, item.presets, key);
    assert.equal(out && out.balancedMatch, item.balanced, key);
    assert.equal(coverageMatch <= item.balanced, true, `${key} coverage`);
    assert.equal(balancedMetrics.allPartnerPairsCovered, true, `${key} balanced coverage`);
  }
});

test('multi_rotate match options normalize requested courts and return null when no case exists', () => {
  const normalized = matchOptions.resolveMultiRotateMatchOptions(14, 4);
  assert.equal(normalized && normalized.effectiveCourts, 3);
  assert.equal(Array.isArray(normalized && normalized.presetMatches), true);
  assert.equal((normalized && normalized.presetMatches && normalized.presetMatches.length) || 0, 3);

  assert.equal(matchOptions.resolveMultiRotateMatchOptions(25, 1), null);

  const tenPlayers = matchOptions.resolveMultiRotateMatchOptions(10, 4);
  assert.equal(tenPlayers && tenPlayers.effectiveCourts, 2);
  assert.deepEqual(tenPlayers && tenPlayers.presetMatches, [15, 23, 30]);
});

test('multi_rotate match options expose equal-play and coverage-first notes for accepted exception cases', () => {
  const sixPlayers = matchOptions.resolveMultiRotateMatchOptions(6, 1);
  assert.deepEqual(sixPlayers && sixPlayers.coveragePriorityPresetMatches, [9, 15, 18]);
  assert.match(String(sixPlayers && sixPlayers.coveragePriorityNote || ''), /每人 6 场/);

  const ninePlayers = matchOptions.resolveMultiRotateMatchOptions(9, 2);
  assert.deepEqual(ninePlayers && ninePlayers.coveragePriorityPresetMatches, [18]);
  assert.match(String(ninePlayers && ninePlayers.coveragePriorityNote || ''), /balancedMatch=18/);
});

test('multi_rotate match options keep sorted presets and a balanced match inside the list', () => {
  for (const [key, caseData] of Object.entries(matchOptions.cases || {})) {
    const presetMatches = Array.isArray(caseData && caseData.presetMatches) ? caseData.presetMatches : [];
    assert.equal([2, 3].includes(presetMatches.length), true, key);
    assert.deepEqual(presetMatches.slice().sort((left, right) => left - right), presetMatches);
    assert.equal(new Set(presetMatches).size, presetMatches.length, key);
    assert.equal(presetMatches.includes(caseData.balancedMatch), true);
  }
  assert.equal(matchOptions.cases['7p-1c'].presetMatches.length, 2, '7p-1c keeps two recommendation slots');
});
