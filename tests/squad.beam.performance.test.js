const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

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

function measureSchedule(fn) {
  const startedAt = performance.now();
  const out = fn();
  return {
    out,
    elapsedMs: performance.now() - startedAt
  };
}

test('squad beam 4v4 12场 完成时间 < 2500ms', () => {
  const { out, elapsedMs } = measureSchedule(() => buildSquadSchedule(
    makePlayers(4, 4),
    12,
    1,
    { endCondition: { type: 'total_matches', target: 12 } }
  ));
  assert.equal(collectMatches(out).length, 12);
  assert.ok(elapsedMs < 2500, `elapsed=${elapsedMs}ms should be < 2500ms`);
});

test('squad beam 6v6 18场 courts=2 完成时间 < 6000ms', () => {
  const { out, elapsedMs } = measureSchedule(() => buildSquadSchedule(
    makePlayers(6, 6),
    18,
    2,
    { endCondition: { type: 'total_matches', target: 18 } }
  ));
  assert.equal(collectMatches(out).length, 18);
  assert.ok(elapsedMs < 6000, `elapsed=${elapsedMs}ms should be < 6000ms`);
});

test('squad beam 8v8 18场 courts=2 最坏场景 < 7000ms', () => {
  const { out, elapsedMs } = measureSchedule(() => buildSquadSchedule(
    makePlayers(8, 8),
    18,
    2,
    { endCondition: { type: 'total_matches', target: 18 } }
  ));
  assert.equal(collectMatches(out).length, 18);
  assert.ok(elapsedMs < 7000, `elapsed=${elapsedMs}ms should be < 7000ms`);
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
  const { out, elapsedMs } = measureSchedule(() => buildSquadSchedule(
    makePlayers(10, 10),
    20,
    4,
    { endCondition: { type: 'total_matches', target: 20 }, _hardDeadlineMs: 2500 }
  ));
  assert.equal(collectMatches(out).length, 20);
  assert.ok(elapsedMs < 3000, `elapsed=${elapsedMs}ms should be < 3000ms`);
  assert.ok(['squad-v3-beam', 'squad-v2-greedy'].includes(out.schedulerMeta && out.schedulerMeta.engineVersion));
  assert.equal(typeof (out.schedulerMeta && out.schedulerMeta.executionProfile), 'string');
  assert.equal(typeof (out.schedulerMeta && out.schedulerMeta.fallbackReason), 'string');
  assert.equal(typeof (out.schedulerMeta && out.schedulerMeta.searchElapsedMs), 'number');
  assert.equal(out.schedulerMeta && out.schedulerMeta.fairnessVersion, 'v2');
});

[
  { aCount: 9, bCount: 9, totalMatches: 12, courts: 4 },
  { aCount: 9, bCount: 9, totalMatches: 24, courts: 4, hardDeadlineMs: 6000 },
  { aCount: 10, bCount: 10, totalMatches: 12, courts: 2 },
  { aCount: 10, bCount: 10, totalMatches: 18, courts: 3 }
].forEach(({ aCount, bCount, totalMatches, courts, hardDeadlineMs }) => {
  test(`squad ${aCount}v${bCount}/${totalMatches}m/${courts}c 不降级到 greedy-fallback`, () => {
    const { out } = measureSchedule(() => buildSquadSchedule(
      makePlayers(aCount, bCount),
      totalMatches,
      courts,
      {
        endCondition: { type: 'total_matches', target: totalMatches },
        ...(Number.isFinite(hardDeadlineMs) ? { _hardDeadlineMs: hardDeadlineMs } : {})
      }
    ));
    const meta = out.schedulerMeta || {};

    assert.equal(collectMatches(out).length, totalMatches);
    assert.equal(meta.engineVersion, 'squad-v3-beam');
    assert.notEqual(meta.executionProfile, 'greedy-fallback');
    assert.equal(meta.fairnessVersion, 'v2');
  });
});
