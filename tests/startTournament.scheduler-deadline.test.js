const test = require('node:test');
const assert = require('node:assert/strict');

const doublesEngine = require('../cloudfunctions/startTournament/rotationDoublesEngine');
const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');

test('reserved completion time preserves the full existing schedule after slow quality search', (t) => {
  const players = Array.from({ length: 11 }, (_, index) => ({
    id: `p${index + 1}`,
    name: `P${index + 1}`
  }));
  let now = 1000;
  let searchElapsedMs = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(doublesEngine, 'resolveRuntimeSchedule', () => {
    now += searchElapsedMs;
    return null;
  });

  const options = { seed: 7, runtimeBudgetMs: 4500 };
  const expected = generateSchedule(players, 22, 2, options);

  // Quality search has exhausted the former 2500 ms budget's completion reserve.
  // The larger request allocation must preserve the existing complete fallback,
  // including its fairness objective, rather than return a partial schedule.
  now = 1000;
  searchElapsedMs = 2300;
  const actual = generateSchedule(players, 22, 2, options);

  assert.equal(actual.rounds.flatMap(round => round.matches).length, 22);
  assert.equal(actual.schedulerMeta.executionProfile, 'legacy-guarded');
  assert.deepEqual(actual.rounds, expected.rounds);
  assert.deepEqual(actual.playerStats, expected.playerStats);
  assert.deepEqual(actual.fairness, expected.fairness);
  assert.deepEqual(actual.schedulerMeta.objective, expected.schedulerMeta.objective);
  for (const round of actual.rounds) {
    const activeIds = round.matches.flatMap(match => match.teamA.concat(match.teamB));
    assert.equal(new Set(activeIds).size, activeIds.length);
    assert.ok(round.matches.length <= 2);
  }
});
