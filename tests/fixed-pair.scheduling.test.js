const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFixedPairSchedule } = require('../cloudfunctions/startTournament/scheduleModes');

function makePairs(count) {
  const players = [];
  const pairTeams = [];
  for (let i = 0; i < count; i += 1) {
    const a = `P${i * 2 + 1}`;
    const b = `P${i * 2 + 2}`;
    players.push({ id: a, name: a });
    players.push({ id: b, name: b });
    pairTeams.push({ id: `team${i + 1}`, name: `第${i + 1}队`, playerIds: [a, b] });
  }
  return { players, pairTeams };
}

// ——— 基础功能 ———

test('fixed_pair 4队 标准循环 生成 C(4,2)=6 场', () => {
  const { players, pairTeams } = makePairs(4);
  const out = buildFixedPairSchedule(players, 1, pairTeams, { totalMatches: 6 });
  const matches = (out.rounds || []).flatMap((r) => r.matches || []);
  assert.equal(matches.length, 6);
  // 每队恰好出场 3 次
  const playCounts = {};
  matches.forEach((m) => {
    playCounts[m.unitAId] = (playCounts[m.unitAId] || 0) + 1;
    playCounts[m.unitBId] = (playCounts[m.unitBId] || 0) + 1;
  });
  const vals = Object.values(playCounts);
  assert.ok(vals.every((v) => v === 3), `play counts=${JSON.stringify(playCounts)}`);
});

test('fixed_pair 4队 标准循环 每对组合恰好出现一次', () => {
  const { players, pairTeams } = makePairs(4);
  const out = buildFixedPairSchedule(players, 1, pairTeams, { totalMatches: 6 });
  const matches = (out.rounds || []).flatMap((r) => r.matches || []);
  const seen = new Set();
  matches.forEach((m) => {
    const key = [m.unitAId, m.unitBId].sort().join('|');
    assert.ok(!seen.has(key), `matchup ${key} appeared twice`);
    seen.add(key);
  });
  assert.equal(seen.size, 6);
});

test('fixed_pair 2队 最小情况 生成 1 场', () => {
  const { players, pairTeams } = makePairs(2);
  const out = buildFixedPairSchedule(players, 1, pairTeams, { totalMatches: 1 });
  const matches = (out.rounds || []).flatMap((r) => r.matches || []);
  assert.equal(matches.length, 1);
});

// ——— 重复循环 ———

test('fixed_pair 4队 M=12 支持 2 倍循环（每对出现恰好 2 次）', () => {
  const { players, pairTeams } = makePairs(4);
  const out = buildFixedPairSchedule(players, 1, pairTeams, { totalMatches: 12 });
  const matches = (out.rounds || []).flatMap((r) => r.matches || []);
  assert.equal(matches.length, 12, 'should generate 12 matches');

  const pairCounts = {};
  matches.forEach((m) => {
    const key = [m.unitAId, m.unitBId].sort().join('|');
    pairCounts[key] = (pairCounts[key] || 0) + 1;
  });
  // 6 种对阵，每种出现 2 次
  assert.equal(Object.keys(pairCounts).length, 6, `pairCounts=${JSON.stringify(pairCounts)}`);
  Object.values(pairCounts).forEach((count) => {
    assert.equal(count, 2, `each pair should appear exactly 2x, got ${JSON.stringify(pairCounts)}`);
  });
});

test('fixed_pair 4队 M=9 支持不整除循环（截断到恰好 9 场）', () => {
  const { players, pairTeams } = makePairs(4);
  const out = buildFixedPairSchedule(players, 1, pairTeams, { totalMatches: 9 });
  const matches = (out.rounds || []).flatMap((r) => r.matches || []);
  assert.equal(matches.length, 9);
});

test('fixed_pair 6队 M=30 支持 2 倍循环（C(6,2)=15, 15×2=30）', () => {
  const { players, pairTeams } = makePairs(6);
  const out = buildFixedPairSchedule(players, 1, pairTeams, { totalMatches: 30 });
  const matches = (out.rounds || []).flatMap((r) => r.matches || []);
  assert.equal(matches.length, 30);

  const pairCounts = {};
  matches.forEach((m) => {
    const key = [m.unitAId, m.unitBId].sort().join('|');
    pairCounts[key] = (pairCounts[key] || 0) + 1;
  });
  assert.equal(Object.keys(pairCounts).length, 15);
  Object.values(pairCounts).forEach((count) => {
    assert.equal(count, 2);
  });
});

// ——— fairness 字段 ———

test('fixed_pair fairnessScore 不为 0，fairness 包含真实字段', () => {
  const { players, pairTeams } = makePairs(4);
  const out = buildFixedPairSchedule(players, 1, pairTeams, { totalMatches: 6 });
  assert.ok(typeof out.fairnessScore === 'number' && out.fairnessScore > 0,
    `fairnessScore should > 0, got ${out.fairnessScore}`);
  assert.ok(out.fairness && typeof out.fairness === 'object');
  assert.equal(typeof out.fairness.playSpread, 'number');
  assert.equal(typeof out.fairness.matchupRepeatSpread, 'number');
  assert.equal(typeof out.fairness.totalMatches, 'number');
  assert.equal(typeof out.fairness.uniquePairs, 'number');
  assert.ok(
    out.schedulerMeta && out.schedulerMeta.engineVersion,
    'schedulerMeta.engineVersion should be set'
  );
  assert.equal(typeof out.schedulerMeta.logicalRounds, 'number');
  assert.equal(typeof out.schedulerMeta.materializedRounds, 'number');
});

test('fixed_pair fairness.playSpread and matchupRepeatSpread use real fixed-pair semantics', () => {
  const { players, pairTeams } = makePairs(4);
  const out = buildFixedPairSchedule(players, 1, pairTeams, { totalMatches: 9 });

  assert.equal(out.fairness.playSpread, 1);
  assert.equal(out.fairness.matchupRepeatSpread, 1);
  assert.equal(out.schedulerMeta.logicalRounds, 5);
  assert.equal(out.schedulerMeta.materializedRounds, 9);
});

// ——— courts 多场地 ———

test('fixed_pair courts=2 每轮最多 2 场同时进行', () => {
  const { players, pairTeams } = makePairs(4);
  const out = buildFixedPairSchedule(players, 2, pairTeams, { totalMatches: 6 });
  const rounds = out.rounds || [];
  rounds.forEach((r) => {
    assert.ok(r.matches.length <= 2,
      `round ${r.roundIndex} has ${r.matches.length} matches (expected <= 2)`);
  });
  const totalMatches = rounds.reduce((s, r) => s + r.matches.length, 0);
  assert.equal(totalMatches, 6);
  assert.equal(out.schedulerMeta.logicalRounds, 3);
  assert.equal(out.schedulerMeta.materializedRounds, 3);
});

test('fixed_pair courts=2 同一轮内没有重复队伍上场', () => {
  const { players, pairTeams } = makePairs(6);
  const out = buildFixedPairSchedule(players, 2, pairTeams, { totalMatches: 15 });
  const rounds = out.rounds || [];
  rounds.forEach((r) => {
    const seen = new Set();
    r.matches.forEach((m) => {
      assert.ok(!seen.has(m.unitAId), `team ${m.unitAId} appears twice in round ${r.roundIndex}`);
      assert.ok(!seen.has(m.unitBId), `team ${m.unitBId} appears twice in round ${r.roundIndex}`);
      seen.add(m.unitAId);
      seen.add(m.unitBId);
    });
  });
});

// ——— 边界 ———

test('fixed_pair 无效 pairTeams 少于 2 队时抛出错误', () => {
  const { players } = makePairs(1);
  assert.throws(
    () => buildFixedPairSchedule(players, 1, [], { totalMatches: 1 }),
    /至少需要 2/
  );
});

test('fixed_pair totalMatches 默认为 C(n,2)', () => {
  const { players, pairTeams } = makePairs(4);
  const out = buildFixedPairSchedule(players, 1, pairTeams);
  const matches = (out.rounds || []).flatMap((r) => r.matches || []);
  assert.equal(matches.length, 6);
});
