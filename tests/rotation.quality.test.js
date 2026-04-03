const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
}

function measure(config) {
  const players = makePlayers(config.n);
  let elapsedMs = 0;
  let uniqueExact = 0;
  let playSpread = 0;

  for (let seed = 1; seed <= config.seeds; seed += 1) {
    const started = performance.now();
    const out = generateSchedule(players, config.totalMatches, config.courts, {
      seed,
      ...(config.searchSeeds ? { searchSeeds: config.searchSeeds } : {})
    });
    elapsedMs += performance.now() - started;
    uniqueExact += Number(out.schedulerMeta && out.schedulerMeta.uniqueExactMatchupCount) || 0;
    playSpread += Number(out.schedulerMeta && out.schedulerMeta.playSpread) || 0;
  }

  return {
    avgMs: elapsedMs / config.seeds,
    avgUniqueExact: uniqueExact / config.seeds,
    avgPlaySpread: playSpread / config.seeds
  };
}

test('templated scenarios stay fast while preserving full exact-matchup coverage', () => {
  const scenarios = [
    { n: 6, totalMatches: 12, courts: 1, seeds: 5, expectedSpread: 0 },
    { n: 9, totalMatches: 12, courts: 1, seeds: 5, expectedSpread: 1 },
    { n: 13, totalMatches: 12, courts: 1, seeds: 5, expectedSpread: 1 },
    { n: 10, totalMatches: 18, courts: 2, seeds: 5, expectedSpread: 1 }
  ];

  for (const item of scenarios) {
    const metrics = measure(item);
    assert.ok(metrics.avgMs < 80, `${item.n}p/${item.totalMatches}m/${item.courts}c avgMs=${metrics.avgMs.toFixed(1)}`);
    assert.equal(metrics.avgUniqueExact, item.totalMatches, `${item.n}p/${item.totalMatches}m/${item.courts}c`);
    assert.equal(metrics.avgPlaySpread, item.expectedSpread, `${item.n}p/${item.totalMatches}m/${item.courts}c`);
  }
});

test('beam fallback keeps non-templated generation coverage-first', () => {
  const metrics = measure({ n: 12, totalMatches: 12, courts: 2, seeds: 1, searchSeeds: 1 });
  assert.ok(metrics.avgMs < 6000, `12p/12m/2c avgMs=${metrics.avgMs.toFixed(1)}`);
  assert.equal(metrics.avgUniqueExact, 12);
  assert.equal(metrics.avgPlaySpread, 0);
});
