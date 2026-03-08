const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
}

function variance(values) {
  const n = values.length;
  if (!n) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  return values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
}

function scheduleMetrics(result) {
  const stats = (result && result.playerStats) || {};
  const repeatSum = Number(stats.partnerRepeats || 0) + Number(stats.opponentRepeats || 0);
  const playVar = variance(Object.values(stats.playCount || {}));
  const restValues = Object.values(stats.maxRestStreak || {});
  const maxRestStreak = restValues.length ? Math.max(...restValues) : 0;
  return { repeatSum, playVar, maxRestStreak };
}

function aggregateScenario(config, buildOptions) {
  const players = makePlayers(config.n);
  let repeatSum = 0;
  let playVar = 0;
  let maxRestStreak = 0;
  let elapsedMs = 0;

  for (let seed = 1; seed <= config.seeds; seed++) {
    const t0 = performance.now();
    const out = generateSchedule(players, config.totalMatches, config.courts, buildOptions(seed));
    elapsedMs += performance.now() - t0;
    const metrics = scheduleMetrics(out);
    repeatSum += metrics.repeatSum;
    playVar += metrics.playVar;
    maxRestStreak += metrics.maxRestStreak;
  }

  return {
    avgRepeatSum: repeatSum / config.seeds,
    avgPlayVar: playVar / config.seeds,
    avgMaxRestStreak: maxRestStreak / config.seeds,
    avgMs: elapsedMs / config.seeds
  };
}

test('policy-driven defaults keep quality near fixed 16/1.6 baseline', () => {
  const scenarios = [
    { name: '9p/16m/2c', n: 9, totalMatches: 16, courts: 2, seeds: 24 },
    { name: '10p/18m/2c', n: 10, totalMatches: 18, courts: 2, seeds: 24 },
    { name: '12p/22m/2c', n: 12, totalMatches: 22, courts: 2, seeds: 24 },
    { name: '12p/18m/1c', n: 12, totalMatches: 18, courts: 1, seeds: 20 }
  ];

  for (const item of scenarios) {
    const policy = aggregateScenario(item, (seed) => ({ seed }));
    const fixed = aggregateScenario(item, (seed) => ({ seed, searchSeeds: 16, seedStep: 7919, epsilon: 1.6 }));

    const repeatRatio = fixed.avgRepeatSum > 0 ? (policy.avgRepeatSum / fixed.avgRepeatSum) : 1;
    const varRatio = fixed.avgPlayVar > 0 ? (policy.avgPlayVar / fixed.avgPlayVar) : 1;

    // 允许轻微波动：重复对阵不劣于 +3%，出场方差不劣于 +8%
    assert.ok(repeatRatio <= 1.03, `${item.name} repeat ratio=${repeatRatio.toFixed(3)}`);
    assert.ok(varRatio <= 1.08, `${item.name} variance ratio=${varRatio.toFixed(3)}`);

    // 单场地场景要求连休不退化
    if (item.courts === 1) {
      const restRatio = fixed.avgMaxRestStreak > 0 ? (policy.avgMaxRestStreak / fixed.avgMaxRestStreak) : 1;
      assert.ok(restRatio <= 1.0, `${item.name} rest ratio=${restRatio.toFixed(3)}`);
    }
  }
});

test('policy-driven defaults reduce dual-court generation time by at least 20%', () => {
  const scenarios = [
    { n: 10, totalMatches: 18, courts: 2, seeds: 24 },
    { n: 12, totalMatches: 22, courts: 2, seeds: 24 }
  ];

  for (const item of scenarios) {
    const policy = aggregateScenario(item, (seed) => ({ seed }));
    const fixed = aggregateScenario(item, (seed) => ({ seed, searchSeeds: 16, seedStep: 7919, epsilon: 1.6 }));
    const perfRatio = fixed.avgMs > 0 ? (policy.avgMs / fixed.avgMs) : 1;
    assert.ok(perfRatio <= 0.8, `${item.n}p/${item.totalMatches}m/${item.courts}c perf ratio=${perfRatio.toFixed(3)}`);
  }
});

test('rest penalty substantially reduces long-rest peaks against epsilon=0', () => {
  const config = { n: 12, totalMatches: 18, courts: 1, seeds: 20 };
  const withPolicy = aggregateScenario(config, (seed) => ({ seed }));
  const withoutRestPenalty = aggregateScenario(
    config,
    (seed) => ({ seed, searchSeeds: 16, seedStep: 7919, epsilon: 0 })
  );

  const restRatio = withoutRestPenalty.avgMaxRestStreak > 0
    ? (withPolicy.avgMaxRestStreak / withoutRestPenalty.avgMaxRestStreak)
    : 1;
  assert.ok(restRatio <= 0.95, `rest ratio=${restRatio.toFixed(3)}`);
});
