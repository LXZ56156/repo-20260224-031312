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
  return (out.rounds || []).flatMap((round) => round.matches || []);
}

function computeSpread(values) {
  if (!values.length) return 0;
  return Math.max(...values) - Math.min(...values);
}

function computeOpponentSpread(matches) {
  const counts = new Map();
  matches.forEach((m) => {
    m.teamA.forEach((a) => {
      m.teamB.forEach((b) => {
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });
  });
  return { counts, spread: computeSpread([...counts.values()]) };
}

function computePartnerSpread(matches, squad) {
  const counts = new Map();
  matches.forEach((m) => {
    const team = squad === 'A' ? m.teamA : m.teamB;
    const key = team[0] < team[1] ? `${team[0]}|${team[1]}` : `${team[1]}|${team[0]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return { counts, spread: computeSpread([...counts.values()]) };
}

function computePlayCounts(matches, ids) {
  const counts = Object.fromEntries(ids.map((id) => [id, 0]));
  matches.forEach((m) => {
    m.teamA.concat(m.teamB).forEach((id) => {
      if (id in counts) counts[id] += 1;
    });
  });
  return counts;
}

function computeMaxConsecutive(rounds, ids) {
  let maxStreak = 0;
  const streak = Object.fromEntries(ids.map((id) => [id, 0]));
  rounds.forEach((round) => {
    const active = new Set();
    (round.matches || []).forEach((m) => m.teamA.concat(m.teamB).forEach((id) => active.add(id)));
    ids.forEach((id) => {
      if (active.has(id)) {
        streak[id] += 1;
        if (streak[id] > maxStreak) maxStreak = streak[id];
      } else {
        streak[id] = 0;
      }
    });
  });
  return maxStreak;
}

test('squad beam 4v4 12场 courts=1 达到完美出场均衡', () => {
  const out = buildSquadSchedule(
    makePlayers(4, 4),
    12,
    1,
    { endCondition: { type: 'total_matches', target: 12 } }
  );
  const matches = collectMatches(out);
  assert.equal(matches.length, 12);

  const idsA = ['A1', 'A2', 'A3', 'A4'];
  const idsB = ['B1', 'B2', 'B3', 'B4'];
  const allIds = idsA.concat(idsB);

  const playCounts = computePlayCounts(matches, allIds);
  // 12 场 * 4 人/场 = 48 人次；8 人均分每人 6 次
  assert.equal(computeSpread(Object.values(playCounts)), 0,
    `playSpread should be 0, counts=${JSON.stringify(playCounts)}`);
});

test('squad beam 4v4 12场 对手遭遇完全均衡 spread<=1', () => {
  const out = buildSquadSchedule(
    makePlayers(4, 4),
    12,
    1,
    { endCondition: { type: 'total_matches', target: 12 } }
  );
  const matches = collectMatches(out);
  const { counts, spread } = computeOpponentSpread(matches);
  assert.ok(spread <= 1,
    `opponent spread should be <= 1, got ${spread} (counts=${JSON.stringify([...counts.entries()])})`);
});

test('squad beam 4v4 12场 A/B 队内搭档均衡', () => {
  const out = buildSquadSchedule(
    makePlayers(4, 4),
    12,
    1,
    { endCondition: { type: 'total_matches', target: 12 } }
  );
  const matches = collectMatches(out);
  const a = computePartnerSpread(matches, 'A');
  const b = computePartnerSpread(matches, 'B');
  assert.ok(a.spread <= 1, `A partner spread should be <= 1, got ${a.spread}`);
  assert.ok(b.spread <= 1, `B partner spread should be <= 1, got ${b.spread}`);
});

test('squad beam 6v6 courts=2 限制连续上场', () => {
  const out = buildSquadSchedule(
    makePlayers(6, 6),
    12,
    2,
    { endCondition: { type: 'total_matches', target: 12 } }
  );
  const rounds = out.rounds || [];
  const ids = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6'];
  const maxStreak = computeMaxConsecutive(rounds, ids);
  assert.ok(maxStreak <= 3, `max consecutive play should be <= 3, got ${maxStreak}`);

  const matches = collectMatches(out);
  const playCounts = computePlayCounts(matches, ids);
  const spread = computeSpread(Object.values(playCounts));
  assert.ok(spread <= 1, `playSpread should be <= 1, got ${spread}`);
});

test('squad beam 正常路径 engineVersion == squad-v3-beam', () => {
  const out = buildSquadSchedule(
    makePlayers(4, 4),
    12,
    1,
    { endCondition: { type: 'total_matches', target: 12 } }
  );
  assert.equal(out.schedulerMeta && out.schedulerMeta.engineVersion, 'squad-v3-beam');
  assert.equal(out.fairness && out.fairness.engine, 'squad-v3-beam');
  assert.ok(typeof out.fairnessScore === 'number' && out.fairnessScore > 0);
  assert.equal(out.schedulerMeta && out.schedulerMeta.executionProfile, 'beam-quality');
  assert.equal(out.schedulerMeta && out.schedulerMeta.timeoutGuardTriggered, false);
  assert.equal(out.schedulerMeta && out.schedulerMeta.fairnessVersion, 'v2');
});

test('squad beam 超时路径降级到 squad-v2-greedy', () => {
  // 通过传入极小的 softDeadline 强制 beam 放弃，验证 fallback 路径
  const out = buildSquadSchedule(
    makePlayers(4, 4),
    12,
    1,
    {
      endCondition: { type: 'total_matches', target: 12 },
      // 内部约定：如果存在 _forceFallback 标志或超时预算为 0 则降级
      _debugForceFallback: true
    }
  );
  const matches = collectMatches(out);
  assert.equal(matches.length, 12, 'fallback 路径必须完成所有场次');
  assert.equal(out.schedulerMeta && out.schedulerMeta.engineVersion, 'squad-v2-greedy');
  assert.equal(out.schedulerMeta && out.schedulerMeta.executionProfile, 'greedy-debug-fallback');
  assert.equal(out.schedulerMeta && out.schedulerMeta.fallbackReason, 'debug_force_fallback');
  assert.equal(out.schedulerMeta && out.schedulerMeta.fairnessVersion, 'v2');
});

test('squad beam 质量不劣于 greedy fallback', () => {
  const beam = buildSquadSchedule(
    makePlayers(6, 6),
    18,
    2,
    { endCondition: { type: 'total_matches', target: 18 } }
  );
  const greedy = buildSquadSchedule(
    makePlayers(6, 6),
    18,
    2,
    {
      endCondition: { type: 'total_matches', target: 18 },
      _debugForceFallback: true
    }
  );
  // beam 的 fairnessScore 应该不差于 greedy（可能更高或持平）
  assert.ok(beam.fairnessScore >= greedy.fairnessScore,
    `beam fairness ${beam.fairnessScore} should be >= greedy ${greedy.fairnessScore}`);
});

test('squad beam 奇数人数兼容 5v4', () => {
  const out = buildSquadSchedule(
    makePlayers(5, 4),
    12,
    1,
    { endCondition: { type: 'total_matches', target: 12 } }
  );
  const matches = collectMatches(out);
  assert.equal(matches.length, 12);

  // 所有 9 人都应至少上场一次
  const appeared = new Set();
  matches.forEach((m) => m.teamA.concat(m.teamB).forEach((id) => appeared.add(id)));
  ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4'].forEach((id) => {
    assert.ok(appeared.has(id), `${id} should appear`);
  });
});
