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
  ['5p-1c', 5, 1, 15],
  ['6p-1c', 6, 1, 18],
  ['7p-1c', 7, 1, 18]
];

const BANDED_CASES = [
  ...range(8, 17).map((players) => [`${players}p-1c`, players, 1]),
  ...range(8, 20).map((players) => [`${players}p-2c`, players, 2]),
  ...range(12, 24).map((players) => [`${players}p-3c`, players, 3])
];

const REQUIRED_CASES = [
  ...HANDCRAFTED_CASES,
  ...BANDED_CASES
];

const ALLOWED_AUTO_HORIZONS = new Set([12, 16, 18, 22]);

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
    assert.equal(ALLOWED_AUTO_HORIZONS.has(cases[key].horizonMatches), true, `${key} horizon`);
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

      assert.equal(meta.engine, 'template', `${key}@${matches}`);
      assert.equal(meta.templateKey, key, `${key}@${matches}`);
      assert.equal(meta.uniqueExactMatchupCount, matches, `${key}@${matches}`);
      assert.equal(meta.playSpread, theoreticalPlaySpread(playersCount, matches), `${key}@${matches}`);
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
