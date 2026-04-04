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

function collectAllMatches(out) {
  return (out.rounds || []).flatMap((round) => round.matches || []);
}

function computePartnerCounts(matches) {
  const result = new Map();
  const bump = (a, b) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    result.set(key, (result.get(key) || 0) + 1);
  };
  matches.forEach((m) => {
    bump(m.teamA[0], m.teamA[1]);
    bump(m.teamB[0], m.teamB[1]);
  });
  return result;
}

function computeOpponentCounts(matches) {
  const result = new Map();
  matches.forEach((m) => {
    m.teamA.forEach((a) => {
      m.teamB.forEach((b) => {
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        result.set(key, (result.get(key) || 0) + 1);
      });
    });
  });
  return result;
}

function computePlayCountSpread(matches, ids) {
  const counts = Object.fromEntries(ids.map((id) => [id, 0]));
  matches.forEach((m) => {
    m.teamA.concat(m.teamB).forEach((id) => {
      if (id in counts) counts[id] += 1;
    });
  });
  const values = Object.values(counts);
  return Math.max(...values) - Math.min(...values);
}

function computeMaxConsecutivePlay(rounds, ids) {
  let maxStreak = 0;
  const current = Object.fromEntries(ids.map((id) => [id, 0]));
  rounds.forEach((round) => {
    const active = new Set();
    (round.matches || []).forEach((m) => {
      m.teamA.concat(m.teamB).forEach((id) => active.add(id));
    });
    ids.forEach((id) => {
      if (active.has(id)) {
        current[id] += 1;
        if (current[id] > maxStreak) maxStreak = current[id];
      } else {
        current[id] = 0;
      }
    });
  });
  return maxStreak;
}

test('squad v2 keeps opponent encounters balanced across cross-team matchups', () => {
  const out = buildSquadSchedule(
    makePlayers(4, 4),
    12,
    1,
    { endCondition: { type: 'total_matches', target: 12 } }
  );
  const matches = collectAllMatches(out);
  assert.equal(matches.length, 12);

  const opponentCounts = computeOpponentCounts(matches);
  const values = [...opponentCounts.values()];
  const spread = Math.max(...values) - Math.min(...values);
  assert.ok(
    spread <= 1,
    `opponent spread should be <= 1, got ${spread} (counts=${JSON.stringify([...opponentCounts.entries()])})`
  );
});

test('squad v2 keeps intra-team partner counts balanced', () => {
  const out = buildSquadSchedule(
    makePlayers(4, 4),
    12,
    1,
    { endCondition: { type: 'total_matches', target: 12 } }
  );
  const matches = collectAllMatches(out);
  const partnerCounts = computePartnerCounts(matches);
  const values = [...partnerCounts.values()];
  const spread = Math.max(...values) - Math.min(...values);
  assert.ok(
    spread <= 1,
    `partner spread should be <= 1, got ${spread} (counts=${JSON.stringify([...partnerCounts.entries()])})`
  );
});

test('squad v2 distributes play count evenly inside each squad', () => {
  const out = buildSquadSchedule(
    makePlayers(4, 4),
    12,
    1,
    { endCondition: { type: 'total_matches', target: 12 } }
  );
  const matches = collectAllMatches(out);
  const idsA = ['A1', 'A2', 'A3', 'A4'];
  const idsB = ['B1', 'B2', 'B3', 'B4'];
  assert.ok(computePlayCountSpread(matches, idsA) <= 1, 'A squad playCount spread should be <= 1');
  assert.ok(computePlayCountSpread(matches, idsB) <= 1, 'B squad playCount spread should be <= 1');
});

test('squad v2 limits max consecutive play rounds when bench exists', () => {
  // 6v6 courts=2 每轮 4 人/队上场、2 人/队休息，6 轮下每人约 4 次上场 2 次轮空，
  // 理想最大连续上场 2-3 次。5v5 这类只剩 1 个休息席位的配置在 6 轮内结构性
  // 下限 ≥4，不在算法可控范围。
  const out = buildSquadSchedule(
    makePlayers(6, 6),
    12,
    2,
    { endCondition: { type: 'total_matches', target: 12 } }
  );
  const rounds = out.rounds || [];
  const ids = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6'];
  const maxStreak = computeMaxConsecutivePlay(rounds, ids);
  assert.ok(
    maxStreak <= 3,
    `max consecutive play should be <= 3 when bench exists, got ${maxStreak}`
  );
});

test('squad v2 reports non-zero fairnessScore and full fairness object', () => {
  const out = buildSquadSchedule(
    makePlayers(4, 4),
    12,
    1,
    { endCondition: { type: 'total_matches', target: 12 } }
  );
  assert.ok(typeof out.fairnessScore === 'number' && out.fairnessScore > 0, 'fairnessScore should be > 0');
  assert.ok(out.fairness && typeof out.fairness === 'object', 'fairness object should exist');
  assert.equal(typeof out.fairness.playSpread, 'number');
  assert.equal(typeof out.fairness.maxConsecutivePlay, 'number');
  assert.equal(typeof out.fairness.partnerRepeats, 'number');
  assert.equal(typeof out.fairness.opponentRepeats, 'number');
  assert.equal(out.fairness.engine, 'squad-v2');
  assert.equal(out.schedulerMeta && out.schedulerMeta.engineVersion, 'squad-v2');
});

test('squad v2 handles uneven squad sizes without crash and completes scheduling', () => {
  const out = buildSquadSchedule(
    makePlayers(3, 4),
    9,
    1,
    { endCondition: { type: 'total_matches', target: 9 } }
  );
  const matches = collectAllMatches(out);
  assert.equal(matches.length, 9);

  const matches2 = collectAllMatches(
    buildSquadSchedule(
      makePlayers(5, 4),
      12,
      1,
      { endCondition: { type: 'total_matches', target: 12 } }
    )
  );
  assert.equal(matches2.length, 12);

  // Every participating player should show up at least once across the schedule.
  const appeared = new Set();
  matches2.forEach((m) => m.teamA.concat(m.teamB).forEach((id) => appeared.add(id)));
  ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4'].forEach((id) => {
    assert.ok(appeared.has(id), `${id} should appear in at least one match`);
  });
});
