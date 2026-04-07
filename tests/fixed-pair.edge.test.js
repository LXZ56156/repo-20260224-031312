const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFixedPairSchedule } = require('../cloudfunctions/startTournament/scheduleModes');
const { buildSquadSchedule } = require('../cloudfunctions/startTournament/scheduleModes');

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

function makeSquadPlayers(aCount, bCount) {
  const players = [];
  for (let i = 0; i < aCount; i += 1) {
    players.push({ id: `A${i + 1}`, name: `A${i + 1}`, squad: 'A' });
  }
  for (let i = 0; i < bCount; i += 1) {
    players.push({ id: `B${i + 1}`, name: `B${i + 1}`, squad: 'B' });
  }
  return players;
}

// ——— fixed_pair 边界 ———

test('fixed_pair 5队（奇数）Berger BYE 不计入场次', () => {
  const { players, pairTeams } = makePairs(5);
  // C(5,2)=10 场
  const out = buildFixedPairSchedule(players, 1, pairTeams, { totalMatches: 10 });
  const matches = (out.rounds || []).flatMap((r) => r.matches || []);
  assert.equal(matches.length, 10);
  // BYE 不应出现在 teamA/teamB 里
  matches.forEach((m) => {
    assert.ok(!m.unitAId.includes('BYE'), `unitAId should not be BYE: ${m.unitAId}`);
    assert.ok(!m.unitBId.includes('BYE'), `unitBId should not be BYE: ${m.unitBId}`);
  });
  // 每队出场 4 次（10场×2队/场=20，5队均分=4）
  const playCounts = {};
  matches.forEach((m) => {
    playCounts[m.unitAId] = (playCounts[m.unitAId] || 0) + 1;
    playCounts[m.unitBId] = (playCounts[m.unitBId] || 0) + 1;
  });
  Object.values(playCounts).forEach((c) => assert.equal(c, 4));
});

test('fixed_pair courts 超出每轮最大对阵数时不崩溃', () => {
  const { players, pairTeams } = makePairs(4);
  // 4队每轮最多2场，courts=10 不应崩溃
  const out = buildFixedPairSchedule(players, 10, pairTeams, { totalMatches: 6 });
  const matches = (out.rounds || []).flatMap((r) => r.matches || []);
  assert.equal(matches.length, 6);
});

test('fixed_pair M=1 只生成 1 场', () => {
  const { players, pairTeams } = makePairs(4);
  const out = buildFixedPairSchedule(players, 1, pairTeams, { totalMatches: 1 });
  const matches = (out.rounds || []).flatMap((r) => r.matches || []);
  assert.equal(matches.length, 1);
});

test('fixed_pair 5队 M=20 支持 2 倍循环', () => {
  const { players, pairTeams } = makePairs(5);
  const out = buildFixedPairSchedule(players, 1, pairTeams, { totalMatches: 20 });
  const matches = (out.rounds || []).flatMap((r) => r.matches || []);
  assert.equal(matches.length, 20);
  const pairCounts = {};
  matches.forEach((m) => {
    const key = [m.unitAId, m.unitBId].sort().join('|');
    pairCounts[key] = (pairCounts[key] || 0) + 1;
  });
  // 10 种对阵，每种 2 次
  assert.equal(Object.keys(pairCounts).length, 10);
  Object.values(pairCounts).forEach((c) => assert.equal(c, 2));
});

test('fixed_pair rejects duplicate roster ids before scheduling', () => {
  const { pairTeams } = makePairs(2);
  assert.throws(
    () => buildFixedPairSchedule([
      { id: 'P1', name: 'P1' },
      { id: 'P1', name: 'P1 duplicate' },
      { id: 'P3', name: 'P3' },
      { id: 'P4', name: 'P4' }
    ], 1, pairTeams, { totalMatches: 1 }),
    /重复成员/
  );
});

// ——— squad beam 边界 ———

test('squad beam 2v2 courts=1 最小情况不崩溃', () => {
  const players = makeSquadPlayers(2, 2);
  const out = buildSquadSchedule(players, 4, 1, {
    endCondition: { type: 'total_matches', target: 4 }
  });
  const matches = (out.rounds || []).flatMap((r) => r.matches || []);
  assert.ok(matches.length >= 1, 'should generate at least 1 match');
  assert.ok(out.schedulerMeta && out.schedulerMeta.engineVersion, 'engineVersion should be set');
});

test('squad beam courts 超过队伍数/2 时自动限制不崩溃', () => {
  const players = makeSquadPlayers(4, 4);
  // 4v4 最多 2 courts，传入 courts=10
  const out = buildSquadSchedule(players, 8, 10, {
    endCondition: { type: 'total_matches', target: 8 }
  });
  const matches = (out.rounds || []).flatMap((r) => r.matches || []);
  assert.equal(matches.length, 8);
});

test('squad schedule rejects duplicate roster ids before generation', () => {
  assert.throws(
    () => buildSquadSchedule([
      { id: 'A1', name: 'A1', squad: 'A' },
      { id: 'A1', name: 'A1 duplicate', squad: 'A' },
      { id: 'B1', name: 'B1', squad: 'B' },
      { id: 'B2', name: 'B2', squad: 'B' }
    ], 1, 1, {
      endCondition: { type: 'total_matches', target: 1 }
    }),
    /重复成员/
  );
});
