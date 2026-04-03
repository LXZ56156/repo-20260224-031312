const test = require('node:test');
const assert = require('node:assert/strict');

const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');
const templateLibrary = require('../cloudfunctions/startTournament/rotation.templates');

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
}

function theoreticalPlaySpread(playersCount, totalMatches) {
  return Math.ceil((4 * totalMatches) / playersCount) - Math.floor((4 * totalMatches) / playersCount);
}

const REQUIRED_CASES = [
  ['5p-1c', 5, 1, 15],
  ['6p-1c', 6, 1, 18],
  ['7p-1c', 7, 1, 18],
  ['8p-1c', 8, 1, 12],
  ['9p-1c', 9, 1, 18],
  ['10p-1c', 10, 1, 12],
  ['11p-1c', 11, 1, 12],
  ['12p-1c', 12, 1, 12],
  ['13p-1c', 13, 1, 12],
  ['8p-2c', 8, 2, 16],
  ['9p-2c', 9, 2, 18],
  ['10p-2c', 10, 2, 22]
];

test('rotation template library contains every approved template case', () => {
  const cases = templateLibrary && templateLibrary.cases ? templateLibrary.cases : {};
  for (const [key, players, courts, horizonMatches] of REQUIRED_CASES) {
    assert.equal(Boolean(cases[key]), true, key);
    assert.equal(cases[key].players, players, key);
    assert.equal(cases[key].courts, courts, key);
    assert.equal(cases[key].horizonMatches, horizonMatches, key);
    assert.ok(Array.isArray(cases[key].variants) && cases[key].variants.length >= 1, key);
  }
});

test('templated cases keep exact-matchup coverage and theoretical play spread for every prefix', () => {
  for (const [key, playersCount, courts, horizonMatches] of REQUIRED_CASES) {
    const caseData = templateLibrary.cases[key];
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
