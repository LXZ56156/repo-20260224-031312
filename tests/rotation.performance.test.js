const test = require('node:test');
const assert = require('node:assert/strict');

const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');
const templateLibrary = require('../cloudfunctions/startTournament/rotation.templates');

const TEMPLATE_FAST_BOUND_MS = 300;

function makePlayers(n, femaleCount = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    gender: i < femaleCount ? 'female' : 'male'
  }));
}

function normalizeTeam(team) {
  return (team || []).map((id) => String(id)).slice().sort().join('+');
}

function buildMatchupKey(teamA, teamB) {
  return [normalizeTeam(teamA), normalizeTeam(teamB)].sort().join(' vs ');
}

function collectMatchupKeys(rounds) {
  return (rounds || [])
    .flatMap((round) => (round.matches || []).map((match) => buildMatchupKey(match.teamA, match.teamB)))
    .sort();
}

test('templated schedules return within a tight bound', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(10), 22, 2, { seed: 53 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('4p-1c handcrafted template returns within a tight bound', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(4), 3, 1, { seed: 17 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '4p-1c');
  assert.equal(out.schedulerMeta.templateHorizon, 3);
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 3);
  assert.equal(out.schedulerMeta.playSpread, 0);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('template round reorder can reduce rest pressure without changing 6p-1c short-prefix matchups', () => {
  const out = generateSchedule(makePlayers(6), 12, 1, { seed: 7 });
  const expectedRounds = templateLibrary.cases['6p-1c'].variants[0].rounds.slice(0, 12).map((round) => ({
    matches: (round.matches || []).map((match) => ({
      teamA: (match.teamA || []).map((id) => `p${id}`),
      teamB: (match.teamB || []).map((id) => `p${id}`)
    }))
  }));

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '6p-1c');
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 0);
  assert.equal(out.schedulerMeta.maxConsecutivePlay, 3);
  assert.equal(Math.max(...Object.values(out.playerStats.maxRestStreak || { p1: 0 })), 1);
  assert.equal(out.fairness.partnerRepeats, 9);
  assert.equal(out.fairness.opponentRepeats, 33);
  assert.deepEqual(collectMatchupKeys(out.rounds), collectMatchupKeys(expectedRounds));
});

test('newly templated single-court cases return within a tight bound', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(9), 12, 1, { seed: 7 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('newly templated dual-court cases return within a tight bound', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(12), 12, 2, { seed: 71 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '12p-2c');
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 0);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('newly templated triple-court cases return within a tight bound', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(12), 12, 3, { seed: 83 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '12p-3c');
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 0);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('effective-court normalization can route higher requested courts into templates', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(14, 6), 12, 4, { seed: 89 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '14p-3c');
  assert.equal(out.schedulerMeta.effectiveCourts, 3);
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 1);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('17p-1c now routes through template instead of long-tail fallback', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(17, 8), 12, 1, { seed: 42, searchSeeds: 1 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '17p-1c');
  assert.equal(out.rounds.flatMap((round) => round.matches || []).length, 12);
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 1);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('16p-4c now routes through template instead of beam', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(16, 8), 12, 4, { seed: 97 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '16p-4c');
  assert.equal(out.schedulerMeta.templateHorizon, 16);
  assert.equal(out.rounds.flatMap((round) => round.matches || []).length, 12);
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 0);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('20p-1c now routes through template instead of guarded fallback', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(20, 10), 12, 1, { seed: 101, searchSeeds: 1 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '20p-1c');
  assert.equal(out.schedulerMeta.templateHorizon, 18);
  assert.equal(out.rounds.flatMap((round) => round.matches || []).length, 12);
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 1);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('24p-2c now routes through template instead of guarded fallback', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(24, 12), 12, 2, { seed: 103, searchSeeds: 1 });
  const elapsed = Date.now() - started;

  assert.equal(out.schedulerMeta.engine, 'template');
  assert.equal(out.schedulerMeta.templateKey, '24p-2c');
  assert.equal(out.schedulerMeta.templateHorizon, 18);
  assert.equal(out.rounds.flatMap((round) => round.matches || []).length, 12);
  assert.equal(out.schedulerMeta.uniqueExactMatchupCount, 12);
  assert.equal(out.schedulerMeta.playSpread, 0);
  assert.ok(elapsed < TEMPLATE_FAST_BOUND_MS, `elapsed=${elapsed}`);
});

test('runtime budget keeps guarded completion when request exceeds template horizon', () => {
  const started = Date.now();
  const out = generateSchedule(makePlayers(10, 5), 31, 2, {
    seed: 42,
    searchSeeds: 8,
    runtimeBudgetMs: 200
  });
  const elapsed = Date.now() - started;
  const matches = out.rounds.flatMap((round) => round.matches || []);

  assert.equal(matches.length, 31);
  assert.ok(['beam', 'legacy'].includes(out.schedulerMeta.engine));
  assert.ok(['beam-guarded', 'legacy-guarded'].includes(out.schedulerMeta.executionProfile));
  assert.equal(out.schedulerMeta.timeoutGuardTriggered, true);
  assert.equal(typeof out.schedulerMeta.searchElapsedMs, 'number');
  assert.equal(out.schedulerMeta.fairnessVersion, 'v2');
  assert.ok(elapsed < 1500, `elapsed=${elapsed}ms should stay under guarded bound`);
});

test('coverage-first template exceptions stay deterministic for 6p-1c and 9p-2c', () => {
  for (const seed of [1, 7, 17]) {
    const sixPlayers = generateSchedule(makePlayers(6), 18, 1, { seed });
    assert.equal(sixPlayers.schedulerMeta.templateKey, '6p-1c');
    assert.equal(sixPlayers.schedulerMeta.uniqueExactMatchupCount, 18);
    assert.equal(sixPlayers.schedulerMeta.playSpread, 0);
    assert.equal(sixPlayers.schedulerMeta.maxConsecutivePlay, 4);

    const ninePlayers = generateSchedule(makePlayers(9), 18, 2, { seed });
    assert.equal(ninePlayers.schedulerMeta.templateKey, '9p-2c');
    assert.equal(ninePlayers.schedulerMeta.uniqueExactMatchupCount, 18);
    assert.equal(ninePlayers.schedulerMeta.playSpread, 0);
    assert.equal(ninePlayers.fairness.partnerRepeats, 0);
    assert.equal(ninePlayers.schedulerMeta.maxConsecutivePlay, 8);
  }
});

test('guarded long-tail scenarios keep coverage-first metrics stable across seeds', () => {
  const scenarios = [
    { players: 10, femaleCount: 5, totalMatches: 31, courts: 2, runtimeBudgetMs: 200, expectedPlaySpread: 1, expectedUniqueExact: 31 },
    { players: 11, femaleCount: 5, totalMatches: 14, courts: 2, runtimeBudgetMs: 800, expectedPlaySpread: 1, expectedUniqueExact: 14 }
  ];

  for (const scenario of scenarios) {
    for (const seed of [1, 3, 17]) {
      const out = generateSchedule(makePlayers(scenario.players, scenario.femaleCount), scenario.totalMatches, scenario.courts, {
        seed,
        searchSeeds: 1,
        runtimeBudgetMs: scenario.runtimeBudgetMs
      });
      assert.ok(['beam-guarded', 'legacy-guarded'].includes(out.schedulerMeta.executionProfile));
      assert.equal(out.schedulerMeta.playSpread, scenario.expectedPlaySpread);
      assert.equal(out.schedulerMeta.uniqueExactMatchupCount, scenario.expectedUniqueExact);
      assert.equal(out.schedulerMeta.timeoutGuardTriggered, true);
    }
  }
});
