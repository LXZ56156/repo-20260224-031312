const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSinglesSchedule } = require('../cloudfunctions/startTournament/singlesRoundRobinV1');
const cloudMode = require('../cloudfunctions/startTournament/lib/mode');
const mode = require('../miniprogram/core/mode');
const cloudScore = require('../cloudfunctions/submitScore/lib/score');
const score = require('../miniprogram/core/scoreUtils');
const ranking = require('../miniprogram/core/rankingCore');
const cloudRanking = require('../cloudfunctions/submitScore/lib/rankingCore');
const { validateBeforeGenerate } = require('../cloudfunctions/startTournament/logic');
const readiness = require('../miniprogram/core/draftStartReadiness');
const settings = require('../miniprogram/pages/settings/settingsViewModel');
const lobby = require('../miniprogram/pages/lobby/lobbyViewModel');
const analytics = require('../miniprogram/pages/analytics/logic');
const share = require('../miniprogram/core/shareMeta');
const { buildTournamentViewState } = require('../miniprogram/pages/match/matchViewModel');
const scheduleContract = require('../cloudfunctions/startTournament/lib/schedule');
const { buildManualFinish } = require('../cloudfunctions/finishTournament/logic');
const { buildSubmitResult } = require('../cloudfunctions/submitScore/logic');
const { buildResetTournamentPatch } = require('../cloudfunctions/resetTournament/logic');
const MODE = 'singles_round_robin';
const players = (count) => Array.from({ length: count }, (_, index) => ({ id: `p${index}`, name: `球友${index}` }));

function tournament(count = 4, courts = 2, cycles = 1, target = 21) {
  const roster = players(count);
  const generated = buildSinglesSchedule(roster, courts, { cycles });
  const map = Object.fromEntries(roster.map((p) => [p.id, p]));
  return { _id: 'singles-test', name: '单打循环', creatorId: 'p0', status: 'running', mode: MODE,
    players: roster, playerIds: roster.map((p) => p.id), courts, settingsConfigured: true,
    rules: { cycles, gamesPerMatch: 1, pointsPerGame: target },
    totalMatches: count * (count - 1) / 2 * cycles,
    rounds: generated.rounds.map((round) => ({ ...round,
      matches: round.matches.map((match) => ({ ...match, teamA: match.teamA.map((id) => map[id]),
        teamB: match.teamB.map((id) => map[id]), status: 'pending' })) })), rankings: [] };
}

for (let count = 2; count <= 8; count += 1) {
  for (const courts of [1, 2]) for (const cycles of [1, 2]) {
    test(`singles ${count} players/${courts} courts/${cycles} cycles: complete pairs, court exclusion and byes`, () => {
      const roster = players(count);
      const before = JSON.stringify(roster);
      const { rounds } = buildSinglesSchedule(roster, courts, { cycles });
      const pairCounts = new Map();
      const appearances = Object.fromEntries(roster.map((p) => [p.id, 0]));
      const byes = Object.fromEntries(roster.map((p) => [p.id, 0]));
      const coordinates = new Set();
      const logicalPlayers = new Map();
      const logicalRoundsPerCycle = count % 2 ? count : count - 1;
      assert.equal(rounds.length, logicalRoundsPerCycle * Math.ceil(Math.floor(count / 2) / courts) * cycles);
      for (const round of rounds) {
        const logicalKey = `${round.cycleIndex}/${round.logicalRound}`;
        if (!logicalPlayers.has(logicalKey)) logicalPlayers.set(logicalKey, new Set());
        const batch = new Set();
        assert.ok(round.matches.length > 0 && round.matches.length <= courts);
        for (const match of round.matches) {
          scheduleContract.assertValidMatchTeams(match, MODE);
          const all = match.teamA.concat(match.teamB);
          for (const id of all) {
            assert.ok(!batch.has(id));
            assert.ok(!logicalPlayers.get(logicalKey).has(id));
            batch.add(id); logicalPlayers.get(logicalKey).add(id); appearances[id] += 1;
          }
          const pair = `${round.cycleIndex}:${all.slice().sort().join('|')}`;
          pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
          const coordinate = `${round.roundIndex}/${match.matchIndex}`;
          assert.ok(!coordinates.has(coordinate)); coordinates.add(coordinate);
        }
        for (const id of round.byePlayers) {
          assert.equal(round.batchIndex, 1);
          byes[id] += 1;
          assert.ok(!batch.has(id) && !round.waitingPlayers.includes(id) && !round.restingPlayers.includes(id));
        }
        assert.deepEqual(new Set(round.restPlayers), new Set(roster.map((p) => p.id).filter((id) => !batch.has(id))));
        round.waitingPlayers.forEach((id) => assert.ok(!batch.has(id) && !round.restingPlayers.includes(id)));
        if (round.batchIndex === round.batchCount) assert.deepEqual(round.waitingPlayers, []);
      }
      assert.equal(pairCounts.size, count * (count - 1) / 2 * cycles);
      assert.ok([...pairCounts.values()].every((value) => value === 1));
      assert.ok(Object.values(appearances).every((value) => value === (count - 1) * cycles));
      assert.ok(Object.values(byes).every((value) => value === (count % 2 ? cycles : 0)));
      assert.equal(logicalPlayers.size, logicalRoundsPerCycle * cycles);
      assert.equal(JSON.stringify(roster), before);
      assert.ok(rounds.slice(0, rounds.length / cycles).every((round) => round.cycleIndex === 1));
    });
  }
}

test('singles rejects invalid count, roster, courts, cycles and expired deadline without changing candidate', () => {
  for (const count of [0, 1, 9]) assert.throws(() => buildSinglesSchedule(players(count)), /2–8/);
  for (const courts of [0, 3, 1.5]) assert.throws(() => buildSinglesSchedule(players(4), courts), /场地/);
  for (const cycles of [0, 3, 1.5]) assert.throws(() => buildSinglesSchedule(players(4), 1, { cycles }), /循环/);
  assert.throws(() => buildSinglesSchedule([{ id: 'same' }, { id: 'same' }]), /重复/);
  assert.throws(() => buildSinglesSchedule([{ id: 'p1' }, {}]), /标识/);
  assert.throws(() => buildSinglesSchedule(players(8), 2, { deadlineAtMs: Date.now() - 1 }), { code: 'START_TIMEOUT' });
});

for (const target of [11, 15, 21]) {
  test(`single-game ${target} points accepts only a terminal score consistently on client and cloud`, () => {
    const t = { mode: MODE, rules: { pointsPerGame: target } };
    const valid = target === 21 ? [[21, 0], [21, 19], [22, 20], [29, 27], [30, 28], [30, 29]] : [[target, 0], [target, target - 1]];
    const invalid = target === 21 ? [[0, 0], [20, 18], [21, 20], [21, 21], [22, 19], [23, 20], [30, 27], [31, 29]] : [[target - 1, 0], [target, target], [target + 1, target - 1]];
    for (const [a, b] of valid) for (const pair of [[a, b], [b, a]]) {
      assert.equal(score.isValidFinishedScore({ scoreA: pair[0], scoreB: pair[1] }, t), true);
      assert.equal(cloudScore.isValidFinishedScore({ scoreA: pair[0], scoreB: pair[1] }, t), true);
    }
    for (const [a, b] of invalid) {
      assert.equal(score.isValidFinishedScore({ scoreA: a, scoreB: b }, t), false);
      assert.equal(cloudScore.isValidFinishedScore({ scoreA: a, scoreB: b }, t), false);
    }
    assert.equal(score.isValidFinishedScore({ score: { teamA: String(target), teamB: '0' } }, t), true);
    for (const malformed of [true, false, '', ' ', ' 21', '21 ', '21.0', '21.9', 21.9, [], [21], null]) {
      assert.equal(score.isValidFinishedScore({ scoreA: malformed, scoreB: 0 }, t), false, String(malformed));
      assert.equal(cloudScore.isValidFinishedScore({ scoreA: malformed, scoreB: 0 }, t), false, String(malformed));
    }
  });
}

test('old modes retain free-score validation and positional ranks; new mode keeps competition ties', () => {
  for (const oldMode of ['multi_rotate', 'squad_doubles', 'fixed_pair_rr']) {
    const t = { mode: oldMode, rules: { pointsPerGame: 21 } };
    assert.equal(score.isValidFinishedScore({ scoreA: 10, scoreB: 8 }, t), true);
    assert.equal(cloudScore.isValidFinishedScore({ scoreA: 60, scoreB: 59 }, t), true);
    assert.equal(score.isValidFinishedScore({ scoreA: 21.9, scoreB: 18 }, t), true);
    assert.equal(ranking.sortRanking([{ name: 'A', wins: 0 }], oldMode)[0].rank, undefined);
  }
  const rows = [
    { name: '甲', playerId: 'a', wins: 3, pointDiff: 10, pointsFor: 80 },
    { name: '首', playerId: 'b', wins: 4, pointDiff: 20, pointsFor: 90 },
    { name: '乙', playerId: 'c', wins: 3, pointDiff: 10, pointsFor: 80 },
    { name: '尾', playerId: 'd', wins: 2, pointDiff: 0, pointsFor: 60 }
  ];
  assert.deepEqual(ranking.sortRanking(rows, MODE).map((row) => row.rank), [1, 2, 2, 4]);
  assert.deepEqual(cloudRanking.sortRanking(rows, MODE), ranking.sortRanking(rows, MODE));
  const t = { ...tournament(), players: rows.map((row) => ({ id: row.playerId, name: row.name })), rankings: rows };
  assert.deepEqual(share.buildRankingPreview(t).map((row) => row.rank), [1, 2, 2]);
  assert.deepEqual(analytics.computeAnalytics(t).playerStats.map((row) => row.rank), [1, 2, 2, 4]);
});

test('singles opening recomputes complete count from current roster and freezes valid rules', () => {
  const t = { ...tournament(6, 2, 2, 15), totalMatches: 1, status: 'draft' };
  const checked = validateBeforeGenerate(t);
  assert.equal(checked.totalMatches, 30);
  assert.equal(checked.rules.cycles, 2);
  assert.equal(checked.rules.pointsPerGame, 15);
  assert.deepEqual(checked.pairTeams, []);
  assert.equal(readiness.buildDraftStartReadiness(t).checkStartReady, true);
  for (const count of [0, 1, 9]) assert.equal(readiness.buildDraftStartReadiness({ ...t, players: players(count) }).checkStartReady, false);
  assert.equal(readiness.buildDraftStartReadiness({ ...t, courts: 3 }).checkStartReady, false);
  assert.equal(mode.normalizeMode(MODE), MODE);
  assert.deepEqual(cloudMode.getSinglesConfig(t), mode.getSinglesConfig(t));
});

test('singles draft UI configures 0/1-person drafts, counts 6-person batches and targets existing pages', () => {
  for (const count of [0, 1, 2, 3, 4, 6, 8]) {
    const t = { ...tournament(2), status: 'draft', players: players(count), creatorId: 'p0' };
    const form = settings.buildSettingsFormState(t, { openid: 'p0' });
    assert.equal(form.isSingles, true);
    assert.equal(form.canConfigureSettings, true);
    assert.deepEqual(form.courtOptions, [1, 2]);
    assert.equal(form.editM, count >= 2 ? count * (count - 1) / 2 : 0);
    const view = lobby.buildLobbyViewModel({ tournament: t, openid: 'p0' }).patch;
    assert.equal(view.isSingles, true);
    if (count >= 2) assert.equal(view.primaryTaskKey, 'start');
  }
  const t = { ...tournament(6), status: 'draft' };
  const form = settings.buildSettingsFormState(t);
  assert.equal(form.editM, 15);
  assert.match(form.singlesSummary, /每人 5 场.*10 批/);
  const changed = settings.buildSettingsFormState(t, { draft: { singlesCycles: 2, editC: 1 } });
  assert.equal(changed.editM, 30);
  assert.match(changed.singlesSummary, /每人 10 场.*30 批/);
  const running = tournament(3);
  const match = buildTournamentViewState(running, { openid: 'p0', roundIndex: 0, matchIndex: 0 });
  assert.ok(match.data.pair1Text && match.data.pair2Text);
  assert.ok(!match.data.pair1Text.includes('/') && !match.data.pair2Text.includes('/'));
  assert.match(match.data.scoreRuleHint, /30/);
});

test('singles correction, manual finish, canceled matches and reset preserve personal totals', () => {
  const t = tournament(3, 1, 1, 11);
  const scored = buildSubmitResult(t, 0, 0, 11, 10);
  const corrected = buildSubmitResult({ ...t, rounds: scored.rounds }, 0, 0, 9, 11);
  const winner = t.rounds[0].matches[0].teamB[0].id;
  assert.equal(corrected.rankings.find((row) => row.playerId === winner).wins, 1);
  assert.equal(corrected.rankings.reduce((sum, row) => sum + row.played, 0), 2);
  const finish = buildManualFinish({ ...t, rounds: corrected.rounds });
  assert.equal(finish.completedMatches, 1);
  assert.equal(finish.canceledMatches, 2);
  assert.ok(finish.rounds.flatMap((r) => r.matches).filter((m) => m.status === 'canceled').every((m) => !m.score));
  assert.deepEqual(finish.rankings, corrected.rankings);
  const reset = buildResetTournamentPatch({ ...t, rounds: finish.rounds, rankings: finish.rankings });
  assert.equal(reset.status, 'draft');
  assert.deepEqual(reset.rounds, []);
  assert.ok(reset.rankings.every((row) => row.wins === 0 && row.played === 0));
  const dirty = { ...t, rounds: [{ roundIndex: 0, matches: [{ ...t.rounds[0].matches[0], status: 'finished', scoreA: 10, scoreB: 9 }] }] };
  assert.ok(ranking.computeRankings(dirty).every((row) => row.played === 0));
  assert.equal(buildManualFinish(dirty).completedMatches, 0);
});
