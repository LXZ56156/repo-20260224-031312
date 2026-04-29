const test = require('node:test');
const assert = require('node:assert/strict');

const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');
const templateLibrary = require('../cloudfunctions/startTournament/rotation.templates');

function makePlayers(n, femaleCount = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    gender: i < femaleCount ? 'female' : 'male'
  }));
}

function theoreticalPlaySpread(playersCount, totalMatches) {
  return Math.ceil((4 * totalMatches) / playersCount) - Math.floor((4 * totalMatches) / playersCount);
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

const HANDCRAFTED_CASES = [
  ['4p-1c', 4, 1, 3],
  ['5p-1c', 5, 1, 15],
  ['6p-1c', 6, 1, 18],
  ['7p-1c', 7, 1, 18]
];

const BANDED_CASES = [
  ...range(8, 24).map((players) => [`${players}p-1c`, players, 1]),
  ...range(8, 24).map((players) => [`${players}p-2c`, players, 2]),
  ...range(12, 24).map((players) => [`${players}p-3c`, players, 3]),
  ...range(16, 24).map((players) => [`${players}p-4c`, players, 4])
];

const REQUIRED_CASES = [
  ...HANDCRAFTED_CASES,
  ...BANDED_CASES
];

const SPECIAL_EXPECTED_HORIZONS = {
  '8p-1c': 16,
  '10p-1c': 30,
  '10p-2c': 30,
  '16p-4c': 16,
  '17p-2c': 18,
  '17p-3c': 16,
  '17p-4c': 16,
  '18p-2c': 18,
  '18p-3c': 16,
  '18p-4c': 16,
  '19p-2c': 18,
  '19p-3c': 16,
  '19p-4c': 16,
  '20p-1c': 18,
  '20p-2c': 18,
  '20p-3c': 18,
  '21p-1c': 18,
  '21p-2c': 16,
  '21p-3c': 18,
  '22p-1c': 12,
  '22p-2c': 16,
  '22p-3c': 18,
  '22p-4c': 16,
  '23p-1c': 12,
  '23p-2c': 16,
  '23p-3c': 18,
  '24p-1c': 16,
  '24p-2c': 18
};

function buildGenderFixtures(playersCount) {
  const halfFemale = Math.floor(playersCount / 2);
  const skewFemale = Math.max(2, Math.min(playersCount - 2, 2));
  const skewMale = Math.max(2, Math.min(playersCount - 2, playersCount - 2));
  return [
    { key: 'all-male', femaleCount: 0 },
    { key: 'all-female', femaleCount: playersCount },
    { key: 'mixed-balanced', femaleCount: halfFemale },
    { key: 'mixed-skewed-female', femaleCount: skewFemale },
    { key: 'mixed-skewed-male', femaleCount: skewMale }
  ];
}

test('rotation template library contains every approved template case', () => {
  const cases = templateLibrary && templateLibrary.cases ? templateLibrary.cases : {};
  for (const [key, players, courts, horizonMatches] of HANDCRAFTED_CASES) {
    assert.equal(Boolean(cases[key]), true, key);
    assert.equal(cases[key].players, players, key);
    assert.equal(cases[key].courts, courts, key);
    assert.equal(cases[key].horizonMatches, horizonMatches, key);
    assert.ok(Array.isArray(cases[key].variants) && cases[key].variants.length >= 1, key);
  }

  for (const [key, players, courts] of BANDED_CASES) {
    assert.equal(Boolean(cases[key]), true, key);
    assert.equal(cases[key].players, players, key);
    assert.equal(cases[key].courts, courts, key);
    const expectedHorizon = SPECIAL_EXPECTED_HORIZONS[key];
    if (expectedHorizon) {
      assert.equal(cases[key].horizonMatches, expectedHorizon, `${key} horizon`);
    } else {
      assert.ok((Number(cases[key].horizonMatches) || 0) >= 12, `${key} horizon`);
    }
    assert.equal(
      Object.keys(cases[key].prefixMetrics || {}).length,
      Number(cases[key].horizonMatches) || 0,
      `${key} prefix coverage`
    );
    assert.ok(Array.isArray(cases[key].variants) && cases[key].variants.length >= 1, key);
  }
});

test('templated cases keep exact-matchup coverage and theoretical play spread for every prefix', () => {
  for (const [key, playersCount, courts] of REQUIRED_CASES) {
    const caseData = templateLibrary.cases[key];
    const horizonMatches = Number(caseData.horizonMatches) || 0;
    const variantIds = new Set((caseData.variants || []).map((item) => String(item.id || '')));
    for (let matches = 1; matches <= horizonMatches; matches += 1) {
      const variantId = String(caseData.bestPrefixByMatchCount[String(matches)] || '');
      assert.equal(variantIds.has(variantId), true, `${key}@${matches}`);

      const out = generateSchedule(makePlayers(playersCount), matches, courts, { seed: 7 });
      const meta = out.schedulerMeta || {};
      const metrics = caseData.prefixMetrics[String(matches)] || {};

      assert.equal(meta.engine, 'template', `${key}@${matches}`);
      assert.equal(meta.templateKey, key, `${key}@${matches}`);
      assert.equal(meta.uniqueExactMatchupCount, matches, `${key}@${matches}`);
      assert.equal(meta.playSpread, theoreticalPlaySpread(playersCount, matches), `${key}@${matches}`);
      assert.equal(typeof metrics.maxConsecutivePlay, 'number', `${key}@${matches}`);
    }
  }
});

test('templated cases expose partner coverage metadata for every prefix', () => {
  for (const [key] of REQUIRED_CASES) {
    const caseData = templateLibrary.cases[key];
    const totalPartnerPairs = (Number(caseData.players) * (Number(caseData.players) - 1)) / 2;
    for (let matches = 1; matches <= Number(caseData.horizonMatches || 0); matches += 1) {
      const metrics = caseData.prefixMetrics[String(matches)] || {};
      assert.equal(typeof metrics.partnerCoverageCount, 'number', `${key}@${matches}`);
      assert.equal(metrics.partnerCoverageCount >= 0, true, `${key}@${matches}`);
      assert.equal(metrics.partnerCoverageCount <= totalPartnerPairs, true, `${key}@${matches}`);
      assert.equal(metrics.totalPartnerPairs, totalPartnerPairs, `${key}@${matches}`);
      assert.equal(typeof metrics.allPartnerPairsCovered, 'boolean', `${key}@${matches}`);
      assert.equal(metrics.allPartnerPairsCovered, metrics.partnerCoverageCount === totalPartnerPairs, `${key}@${matches}`);
    }
  }
});

test('templated coverage milestones are flagged for representative cases', () => {
  const expectedCoverageMatches = {
    '4p-1c': 3,
    '5p-1c': 5,
    '6p-1c': 8,
    '7p-1c': 11,
    '8p-1c': 14,
    '8p-2c': 14,
    '9p-1c': 18,
    '9p-2c': 18,
    '10p-1c': 23,
    '10p-2c': 23
  };

  for (const [key, coverageMatch] of Object.entries(expectedCoverageMatches)) {
    const caseData = templateLibrary.cases[key];
    const beforeMetrics = caseData.prefixMetrics[String(coverageMatch - 1)] || null;
    const metrics = caseData.prefixMetrics[String(coverageMatch)] || {};
    assert.equal(metrics.allPartnerPairsCovered, true, `${key}@${coverageMatch}`);
    assert.equal(metrics.partnerCoverageCount, metrics.totalPartnerPairs, `${key}@${coverageMatch}`);
    if (beforeMetrics) {
      assert.equal(beforeMetrics.allPartnerPairsCovered, false, `${key}@${coverageMatch - 1}`);
    }
  }
});

test('template routing normalizes requested courts to effective courts', () => {
  const a = generateSchedule(makePlayers(11), 12, 3, { seed: 7 });
  assert.equal(a.schedulerMeta.engine, 'template');
  assert.equal(a.schedulerMeta.templateKey, '11p-2c');
  assert.equal(a.schedulerMeta.effectiveCourts, 2);

  const b = generateSchedule(makePlayers(11), 12, 4, { seed: 7 });
  assert.equal(b.schedulerMeta.engine, 'template');
  assert.equal(b.schedulerMeta.templateKey, '11p-2c');
  assert.equal(b.schedulerMeta.effectiveCourts, 2);

  const c = generateSchedule(makePlayers(14), 12, 4, { seed: 7 });
  assert.equal(c.schedulerMeta.engine, 'template');
  assert.equal(c.schedulerMeta.templateKey, '14p-3c');
  assert.equal(c.schedulerMeta.effectiveCourts, 3);
});

test('templated cases still hit the same template when the roster includes women', () => {
  for (const [key, playersCount, requestedCourts] of REQUIRED_CASES) {
    const caseData = templateLibrary.cases[key];
    const matches = Math.min(12, Number(caseData.horizonMatches) || 12);
    for (const fixture of buildGenderFixtures(playersCount)) {
      const out = generateSchedule(makePlayers(playersCount, fixture.femaleCount), matches, requestedCourts, { seed: 7 });
      const meta = out.schedulerMeta || {};
      assert.equal(meta.engine, 'template', `${key}:${fixture.key}`);
      assert.equal(meta.templateKey, key, `${key}:${fixture.key}`);
      assert.equal(meta.uniqueExactMatchupCount, matches, `${key}:${fixture.key}`);
      assert.equal(meta.playSpread, theoreticalPlaySpread(playersCount, matches), `${key}:${fixture.key}`);
    }
  }
});
