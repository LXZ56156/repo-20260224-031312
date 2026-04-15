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

function computeUniqueExactMatchupCount(matches) {
  const seen = new Set();
  matches.forEach((m) => {
    const teamA = m.teamA.slice().sort().join('+');
    const teamB = m.teamB.slice().sort().join('+');
    seen.add(`${teamA} vs ${teamB}`);
  });
  return seen.size;
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

test('squad reports non-zero fairnessScore and full fairness object', () => {
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
  // 默认走 beam 路径（squad-v3-beam）；fallback 为 squad-v2-greedy
  const version = out.fairness.engine;
  assert.ok(
    version === 'squad-v3-beam' || version === 'squad-v2-greedy',
    `engine should be squad-v3-beam or squad-v2-greedy, got ${version}`
  );
  assert.equal(out.schedulerMeta && out.schedulerMeta.engineVersion, version);
  assert.equal(out.schedulerMeta && out.schedulerMeta.fairnessVersion, 'v2');
});

test('squad 4v4/1c exact-matchup templates remove full repeats for 3/6/12 matches', () => {
  const cases = [
    { matches: 3, playSpread: 1, partnerRepeats: 0, opponentRepeats: 1, maxConsecutivePlay: 2 },
    { matches: 6, playSpread: 0, partnerRepeats: 0, opponentRepeats: 8, maxConsecutivePlay: 2 },
    { matches: 12, playSpread: 0, partnerRepeats: 12, opponentRepeats: 32, maxConsecutivePlay: 2 }
  ];

  cases.forEach((entry) => {
    const out = buildSquadSchedule(
      makePlayers(4, 4),
      entry.matches,
      1,
      { endCondition: { type: 'total_matches', target: entry.matches } }
    );
    const matches = collectAllMatches(out);
    const uniqueExactMatchupCount = computeUniqueExactMatchupCount(matches);

    assert.equal(matches.length, entry.matches, `${entry.matches}m actualMatches`);
    assert.equal(uniqueExactMatchupCount, entry.matches, `${entry.matches}m uniqueExact`);
    assert.equal(matches.length - uniqueExactMatchupCount, 0, `${entry.matches}m exactRepeatCount`);
    assert.equal(out.fairness.playSpread, entry.playSpread, `${entry.matches}m playSpread`);
    assert.equal(out.fairness.partnerRepeats, entry.partnerRepeats, `${entry.matches}m partnerRepeats`);
    assert.equal(out.fairness.opponentRepeats, entry.opponentRepeats, `${entry.matches}m opponentRepeats`);
    assert.ok(out.fairness.maxConsecutivePlay <= entry.maxConsecutivePlay, `${entry.matches}m maxConsecutivePlay=${out.fairness.maxConsecutivePlay}`);
    assert.equal(out.schedulerMeta && out.schedulerMeta.executionProfile, 'beam-quality', `${entry.matches}m executionProfile`);
  });
});

test('squad 4v4/1c total_rounds path reuses exact-matchup templates without falling back to repeated pairings', () => {
  const out = buildSquadSchedule(
    makePlayers(4, 4),
    12,
    1,
    { endCondition: { type: 'total_rounds', target: 6 } }
  );
  const matches = collectAllMatches(out);
  const uniqueExactMatchupCount = computeUniqueExactMatchupCount(matches);

  assert.equal(matches.length, 6);
  assert.equal(uniqueExactMatchupCount, 6);
  assert.equal(matches.length - uniqueExactMatchupCount, 0);
  assert.equal(out.fairness.playSpread, 0);
  assert.equal(out.fairness.partnerRepeats, 0);
  assert.equal(out.fairness.opponentRepeats, 8);
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

test('squad uneven hotspots stay near structural baseline without greedy fallback', () => {
  const scenarios = [
    { a: 3, b: 4, matches: 9, courts: 1, maxPartnerRepeats: 9, maxOpponentRepeats: 24 },
    { a: 5, b: 4, matches: 12, courts: 1, maxPartnerRepeats: 15, maxOpponentRepeats: 28 },
    { a: 6, b: 5, matches: 12, courts: 2, maxPartnerRepeats: 5, maxOpponentRepeats: 18 }
  ];

  scenarios.forEach((scenario) => {
    const out = buildSquadSchedule(
      makePlayers(scenario.a, scenario.b),
      scenario.matches,
      scenario.courts,
      { endCondition: { type: 'total_matches', target: scenario.matches }, _hardDeadlineMs: 4000, _seed: 1 }
    );
    assert.equal(collectAllMatches(out).length, scenario.matches, `${scenario.a}v${scenario.b}`);
    assert.notEqual(out.schedulerMeta && out.schedulerMeta.executionProfile, 'greedy-fallback', `${scenario.a}v${scenario.b}`);
    assert.ok(out.fairness.partnerRepeats <= scenario.maxPartnerRepeats, `${scenario.a}v${scenario.b} partnerRepeats=${out.fairness.partnerRepeats}`);
    assert.ok(out.fairness.opponentRepeats <= scenario.maxOpponentRepeats, `${scenario.a}v${scenario.b} opponentRepeats=${out.fairness.opponentRepeats}`);
  });
});

test('squad 7v7/18m/3c now completes inside beam quality path', () => {
  const out = buildSquadSchedule(
    makePlayers(7, 7),
    18,
    3,
    { endCondition: { type: 'total_matches', target: 18 }, _hardDeadlineMs: 5000, _seed: 1 }
  );

  assert.equal(collectAllMatches(out).length, 18);
  assert.equal(out.schedulerMeta && out.schedulerMeta.executionProfile, 'beam-quality');
  assert.equal(out.schedulerMeta && out.schedulerMeta.timeoutGuardTriggered, false);
});

test('squad 6v6/18m/3c keeps coverage and opponent baseline while reducing partner repeats across representative seeds', () => {
  for (const seed of [1, 2, 17]) {
    const out = buildSquadSchedule(
      makePlayers(6, 6),
      18,
      3,
      { endCondition: { type: 'total_matches', target: 18 }, _hardDeadlineMs: 2500, _seed: seed }
    );

    assert.equal(collectAllMatches(out).length, 18, `seed=${seed}`);
    assert.equal(out.schedulerMeta && out.schedulerMeta.executionProfile, 'beam-quality', `seed=${seed}`);
    assert.equal(out.fairness.playSpread, 0, `seed=${seed}`);
    assert.equal(out.fairness.uniqueMatchupCount, 18, `seed=${seed}`);
    assert.equal(out.fairness.opponentRepeats, 36, `seed=${seed}`);
    assert.ok(out.fairness.partnerRepeats <= 13, `seed=${seed} partnerRepeats=${out.fairness.partnerRepeats}`);
  }
});

test('squad 4v4/12m/2c stays deterministic at repeat baseline across representative seeds', () => {
  for (const seed of [1, 2, 17]) {
    const out = buildSquadSchedule(
      makePlayers(4, 4),
      12,
      2,
      { endCondition: { type: 'total_matches', target: 12 }, _hardDeadlineMs: 2500, _seed: seed }
    );

    assert.equal(collectAllMatches(out).length, 12, `seed=${seed}`);
    assert.equal(out.schedulerMeta && out.schedulerMeta.executionProfile, 'beam-quality', `seed=${seed}`);
    assert.equal(out.fairness.playSpread, 0, `seed=${seed}`);
    assert.equal(out.fairness.uniqueMatchupCount, 12, `seed=${seed}`);
    assert.equal(out.fairness.partnerRepeats, 12, `seed=${seed}`);
    assert.equal(out.fairness.opponentRepeats, 32, `seed=${seed}`);
  }
});

test('squad 7v7/18m/3c keeps partner diversity stable across representative seeds', () => {
  for (const seed of [1, 2, 17]) {
    const out = buildSquadSchedule(
      makePlayers(7, 7),
      18,
      3,
      { endCondition: { type: 'total_matches', target: 18 }, _hardDeadlineMs: 5000, _seed: seed }
    );

    assert.equal(collectAllMatches(out).length, 18, `seed=${seed}`);
    assert.equal(out.schedulerMeta && out.schedulerMeta.executionProfile, 'beam-quality', `seed=${seed}`);
    assert.equal(out.fairness.playSpread, 1, `seed=${seed}`);
    assert.equal(out.fairness.uniqueMatchupCount, 18, `seed=${seed}`);
    assert.equal(out.fairness.opponentRepeats, 23, `seed=${seed}`);
    assert.ok(out.fairness.partnerRepeats <= 4, `seed=${seed} partnerRepeats=${out.fairness.partnerRepeats}`);
  }
});

test('squad 8v8/16m/2c deterministic hotspot path keeps maxConsecutive at 1 while reducing partner repeats', () => {
  for (const seed of [1, 2, 17]) {
    const out = buildSquadSchedule(
      makePlayers(8, 8),
      16,
      2,
      { endCondition: { type: 'total_matches', target: 16 }, _hardDeadlineMs: 2500, _seed: seed }
    );

    assert.equal(collectAllMatches(out).length, 16, `seed=${seed}`);
    assert.equal(out.schedulerMeta && out.schedulerMeta.executionProfile, 'beam-quality', `seed=${seed}`);
    assert.equal(out.fairness.playSpread, 0, `seed=${seed}`);
    assert.equal(out.fairness.maxConsecutivePlay, 1, `seed=${seed}`);
    assert.equal(out.fairness.partnerRepeats, 8, `seed=${seed}`);
    assert.equal(out.fairness.opponentRepeats, 32, `seed=${seed}`);
    assert.equal(out.fairness.uniqueMatchupCount, 16, `seed=${seed}`);
  }
});

test('squad 9v9/18m/3c hotspot keeps beam-quality while removing partner repeat excess', () => {
  for (const seed of [1, 2, 17]) {
    const out = buildSquadSchedule(
      makePlayers(9, 9),
      18,
      3,
      { endCondition: { type: 'total_matches', target: 18 }, _hardDeadlineMs: 5000, _seed: seed }
    );

    assert.equal(collectAllMatches(out).length, 18, `seed=${seed}`);
    assert.equal(out.schedulerMeta && out.schedulerMeta.executionProfile, 'beam-quality', `seed=${seed}`);
    assert.equal(out.schedulerMeta && out.schedulerMeta.timeoutGuardTriggered, false, `seed=${seed}`);
    assert.equal(out.fairness.playSpread, 0, `seed=${seed}`);
    assert.equal(out.fairness.maxConsecutivePlay, 2, `seed=${seed}`);
    assert.equal(out.fairness.partnerRepeats, 0, `seed=${seed}`);
    assert.equal(out.fairness.opponentRepeats, 9, `seed=${seed}`);
    assert.equal(out.fairness.uniqueMatchupCount, 18, `seed=${seed}`);
  }
});

test('squad 10v10/20m/4c stays as an accepted coverage-first exception', () => {
  const out = buildSquadSchedule(
    makePlayers(10, 10),
    20,
    4,
    { endCondition: { type: 'total_matches', target: 20 }, _hardDeadlineMs: 2500, _seed: 1 }
  );
  const matches = collectAllMatches(out);

  assert.equal(matches.length, 20);
  assert.equal(out.fairness.playSpread, 0);
  assert.equal(out.fairness.maxConsecutivePlay, 4);
  assert.equal(out.schedulerMeta && out.schedulerMeta.executionProfile, 'beam-quality');
  assert.equal(out.schedulerMeta && out.schedulerMeta.timeoutGuardTriggered, false);
  assert.equal(out.schedulerMeta && out.schedulerMeta.fallbackReason, '');
});

test('squad 10v10/20m/4c keeps coverage-first metrics stable across representative seeds', () => {
  for (const seed of [1, 2, 17]) {
    const out = buildSquadSchedule(
      makePlayers(10, 10),
      20,
      4,
      { endCondition: { type: 'total_matches', target: 20 }, _hardDeadlineMs: 2500, _seed: seed }
    );
    assert.equal(out.fairness.playSpread, 0, `seed=${seed}`);
    assert.equal(out.fairness.maxConsecutivePlay, 4, `seed=${seed}`);
    assert.equal(out.fairness.uniqueMatchupCount, 20, `seed=${seed}`);
    assert.equal(out.schedulerMeta && out.schedulerMeta.executionProfile, 'beam-quality', `seed=${seed}`);
    assert.equal(out.schedulerMeta && out.schedulerMeta.timeoutGuardTriggered, false, `seed=${seed}`);
  }
});
