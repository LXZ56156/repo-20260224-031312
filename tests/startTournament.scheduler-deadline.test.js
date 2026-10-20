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

test('default budget retains the existing complete fallback before slow optional search', (t) => {
  let now = 1000;
  let searchElapsedMs = 0;
  let prepare = false;
  let capturedDeadlines;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(doublesEngine, 'resolveRuntimeSchedule', (ids, matches, courts, options) => {
    capturedDeadlines = [options.softDeadlineAtMs, options.guardDeadlineAtMs, options.hardReturnDeadlineAtMs];
    if (prepare && options.prepareFallback) options.prepareFallback();
    now += searchElapsedMs;
    return null;
  });
  for (const count of [20, 21, 23]) {
    const players = Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
    for (const matches of [14, 15, 16]) {
      now = 1000; searchElapsedMs = 0; prepare = false;
      const expected = generateSchedule(players, matches, 4, { seed: 7 });
      now = 1000; searchElapsedMs = 2300; prepare = true;
      const actual = generateSchedule(players, matches, 4, { seed: 7 });
      assert.equal(actual.rounds.flatMap(round => round.matches).length, matches);
      assert.equal(actual.schedulerMeta.executionProfile, 'legacy-guarded');
      assert.deepEqual(capturedDeadlines, [2700, 3200, 3500], 'original default deadlines stay anchored');
      assert.deepEqual(actual.rounds, expected.rounds);
      assert.deepEqual(actual.playerStats, expected.playerStats);
      assert.deepEqual(actual.fairness, expected.fairness);
      assert.deepEqual(actual.schedulerMeta.objective, expected.schedulerMeta.objective);
      now = 1000; searchElapsedMs = 400;
      const short = generateSchedule(players, matches, 4, { seed: 7, runtimeBudgetMs: 200 });
      assert.deepEqual(capturedDeadlines, [1200, 1450, 1600], 'original clamped short deadlines stay anchored');
      assert.deepEqual(short.rounds, expected.rounds);
      assert.deepEqual(short.fairness, expected.fairness);
      for (const round of actual.rounds) {
        const ids = round.matches.flatMap(match => match.teamA.concat(match.teamB));
        assert.equal(new Set(ids).size, ids.length);
        assert.ok(round.matches.length <= 4);
      }
    }
  }
});

test('fallback preparation happens only after template miss and before optional search', (t) => {
  let calls = 0;
  const prepareFallback = () => { calls++; };
  const ids = Array.from({ length: 20 }, (_, i) => `p${i + 1}`);
  t.mock.method(Date, 'now', () => 1000);
  const options = { prepareFallback, softDeadlineAtMs: 900, guardDeadlineAtMs: 950, seed: 7 };
  const template = doublesEngine.resolveRuntimeSchedule(ids, 12, 1, options);
  assert.equal(template.engine, 'template');
  assert.equal(calls, 0);
  assert.equal(doublesEngine.resolveRuntimeSchedule(ids, 16, 4, options), null);
  assert.equal(calls, 1, 'complete candidate must exist even when quality search has no remaining time');
});
