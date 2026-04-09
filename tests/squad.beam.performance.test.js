const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSquadSchedule } = require('../cloudfunctions/startTournament/scheduleModes');

function makePlayers(aCount, bCount) {
  const players = [];
  for (let i = 0; i < aCount; i += 1) {
    players.push({ id: `A${i + 1}`, name: `A${i + 1}`, squad: 'A' });
  }
  for (let i = 0; i < bCount; i += 1) {
    players.push({ id: `B${i + 1}`, name: `B${i + 1}`, squad: 'B' });
  }
  return players;
}

function collectMatches(out) {
  return (out.rounds || []).flatMap((r) => r.matches || []);
}

test('squad beam 4v4 12场 完成时间 < 2500ms', () => {
  const start = Date.now();
  const out = buildSquadSchedule(
    makePlayers(4, 4),
    12,
    1,
    { endCondition: { type: 'total_matches', target: 12 } }
  );
  const elapsed = Date.now() - start;
  assert.equal(collectMatches(out).length, 12);
  assert.ok(elapsed < 2500, `elapsed=${elapsed}ms should be < 2500ms`);
});

test('squad beam 6v6 18场 courts=2 完成时间 < 6000ms', () => {
  const start = Date.now();
  const out = buildSquadSchedule(
    makePlayers(6, 6),
    18,
    2,
    { endCondition: { type: 'total_matches', target: 18 } }
  );
  const elapsed = Date.now() - start;
  assert.equal(collectMatches(out).length, 18);
  assert.ok(elapsed < 6000, `elapsed=${elapsed}ms should be < 6000ms`);
});

test('squad beam 8v8 18场 courts=2 最坏场景 < 7000ms', () => {
  const start = Date.now();
  const out = buildSquadSchedule(
    makePlayers(8, 8),
    18,
    2,
    { endCondition: { type: 'total_matches', target: 18 } }
  );
  const elapsed = Date.now() - start;
  assert.equal(collectMatches(out).length, 18);
  assert.ok(elapsed < 7000, `elapsed=${elapsed}ms should be < 7000ms`);
});

test('squad beam fairnessScore 不差于 greedy fallback（4v4）', () => {
  const beam = buildSquadSchedule(
    makePlayers(4, 4),
    12,
    1,
    { endCondition: { type: 'total_matches', target: 12 } }
  );
  const greedy = buildSquadSchedule(
    makePlayers(4, 4),
    12,
    1,
    { endCondition: { type: 'total_matches', target: 12 }, _debugForceFallback: true }
  );
  assert.ok(
    beam.fairnessScore >= greedy.fairnessScore,
    `beam=${beam.fairnessScore} should >= greedy=${greedy.fairnessScore}`
  );
});

test('squad beam fairnessScore 不差于 greedy fallback（8v8 courts=2）', () => {
  const beam = buildSquadSchedule(
    makePlayers(8, 8),
    18,
    2,
    { endCondition: { type: 'total_matches', target: 18 } }
  );
  const greedy = buildSquadSchedule(
    makePlayers(8, 8),
    18,
    2,
    { endCondition: { type: 'total_matches', target: 18 }, _debugForceFallback: true }
  );
  assert.ok(
    beam.fairnessScore >= greedy.fairnessScore,
    `beam=${beam.fairnessScore} should >= greedy=${greedy.fairnessScore}`
  );
});

test('squad 10v10 courts=4 在预算内返回并暴露 fallback 元数据', () => {
  const start = Date.now();
  const out = buildSquadSchedule(
    makePlayers(10, 10),
    20,
    4,
    { endCondition: { type: 'total_matches', target: 20 }, _hardDeadlineMs: 2500 }
  );
  const elapsed = Date.now() - start;
  assert.equal(collectMatches(out).length, 20);
  assert.ok(elapsed < 3000, `elapsed=${elapsed}ms should be < 3000ms`);
  assert.ok(['squad-v3-beam', 'squad-v2-greedy'].includes(out.schedulerMeta && out.schedulerMeta.engineVersion));
  assert.equal(typeof (out.schedulerMeta && out.schedulerMeta.executionProfile), 'string');
  assert.equal(typeof (out.schedulerMeta && out.schedulerMeta.fallbackReason), 'string');
  assert.equal(typeof (out.schedulerMeta && out.schedulerMeta.searchElapsedMs), 'number');
  assert.equal(out.schedulerMeta && out.schedulerMeta.fairnessVersion, 'v2');
});
