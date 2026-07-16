const test = require('node:test');
const assert = require('node:assert/strict');

const baseline = require('../scripts/analysis/data-baseline-core');

function makePlayers(prefix, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}_${index + 1}`,
    type: 'user'
  }));
}

function makeCompletedTournament(id, createdAt, overrides = {}) {
  const players = makePlayers(id, 4);
  return {
    _id: id,
    createdAt,
    updatedAt: createdAt,
    status: 'finished',
    creatorId: players[0].id,
    mode: 'multi_rotate',
    presetKey: 'custom',
    settingsConfigured: true,
    players,
    courts: 1,
    totalMatches: 2,
    rounds: [{
      matches: [
        { status: 'finished', scoreA: 21, scoreB: 18, scoredAt: '2026-06-02T01:00:00.000Z' },
        { status: 'finished', teamAScore: 19, teamBScore: 21, scoredAt: '2026-06-02T02:00:00.000Z' }
      ]
    }],
    rankings: [{ playerId: players[0].id, wins: 1 }],
    ...overrides
  };
}

test('data baseline rejects invalid cutoff dates instead of silently changing the window', () => {
  assert.throws(
    () => baseline.analyzeTournamentData([], { cutoffDate: '2026-02-30', windowDays: 90 }),
    /不是有效日期/
  );
  assert.throws(
    () => baseline.analyzeTournamentData([], { cutoffDate: '20260715', windowDays: 90 }),
    /YYYY-MM-DD/
  );
  assert.throws(
    () => baseline.analyzeTournamentData([], { cutoffDate: '2026-07-15', windowDays: 0 }),
    /windowDays/
  );
});

test('duplicate tournament snapshots keep the latest update and preserve record accounting', () => {
  const older = makeCompletedTournament('same', '2026-06-01T00:00:00.000Z', {
    updatedAt: '2026-06-02T02:00:00.000Z',
    status: 'running',
    rankings: []
  });
  const newer = makeCompletedTournament('same', '2026-06-01T00:00:00.000Z', {
    updatedAt: '2026-06-03T02:00:00.000Z'
  });

  const result = baseline.analyzeTournamentData([older, newer], {
    cutoffDate: '2026-07-15',
    windowDays: 90
  });

  assert.deepEqual(result.recordCounts, {
    input: 2,
    invalidCreatedAt: 0,
    duplicateRecords: 1,
    deduplicated: 1,
    outsideWindow: 0,
    analyzed: 1
  });
  assert.equal(result.funnel.stages.find((stage) => stage.key === 'effective_completed').count, 1);
  assert.equal(result.dataQuality.statusConservation, true);
});

test('formal finished records with missing rankings remain outside effective completion', () => {
  const incomplete = makeCompletedTournament('incomplete', '2026-06-01T00:00:00.000Z', {
    rankings: []
  });
  const result = baseline.analyzeTournamentData([incomplete], {
    cutoffDate: '2026-07-15',
    windowDays: 90
  });

  assert.equal(result.dataQuality.formalFinishedIncomplete, 1);
  assert.equal(result.funnel.stages.find((stage) => stage.key === 'all_scores').count, 1);
  assert.equal(result.funnel.stages.find((stage) => stage.key === 'effective_completed').count, 0);
});

test('materialized matches cannot hide a larger scheduled match count', () => {
  const incomplete = makeCompletedTournament('partial_materialization', '2026-06-01T00:00:00.000Z', {
    scheduledMatches: 3,
    totalMatches: 3
  });
  const evaluated = baseline.evaluateTournament(incomplete);

  assert.equal(evaluated.materializedMatches, 2);
  assert.equal(evaluated.plannedMatches, 3);
  assert.equal(evaluated.allScores, false);
  assert.equal(evaluated.effectiveCompleted, false);
});

test('configured totalMatches does not override an explicit materialized schedule count', () => {
  const complete = makeCompletedTournament('scheduled_priority', '2026-06-01T00:00:00.000Z', {
    scheduledMatches: 2,
    totalMatches: 9
  });
  const evaluated = baseline.evaluateTournament(complete);

  assert.equal(evaluated.plannedMatches, 2);
  assert.equal(evaluated.effectiveCompleted, true);
});

test('partial scoredAt coverage cannot fabricate a completion timestamp or zero duration', () => {
  const partialTimes = makeCompletedTournament('partial_times', '2026-06-01T00:00:00.000Z', {
    rounds: [{ matches: [
      { status: 'finished', scoreA: 21, scoreB: 18, scoredAt: '2026-06-02T01:00:00.000Z' },
      { status: 'finished', scoreA: 21, scoreB: 19 }
    ] }]
  });
  const evaluated = baseline.evaluateTournament(partialTimes);

  assert.equal(evaluated.effectiveCompleted, true);
  assert.equal(evaluated.scoreTimestampsComplete, false);
  assert.equal(evaluated.firstScoreTimestamp, null);
  assert.equal(evaluated.completionTimestamp, null);
  assert.equal(evaluated.completionTimestampSource, 'unavailable');
});

test('retention cohorts use older supplied history to avoid a false first-observed cohort', () => {
  const old = makeCompletedTournament('old', '2026-01-01T00:00:00.000Z', {
    creatorId: 'returning_organizer'
  });
  const current = makeCompletedTournament('current', '2026-05-01T00:00:00.000Z', {
    creatorId: 'returning_organizer'
  });
  const result = baseline.analyzeTournamentData([old, current], {
    cutoffDate: '2026-07-15',
    windowDays: 90
  });

  assert.equal(result.recordCounts.analyzed, 1);
  assert.deepEqual(result.retention.organizer28d, {
    eligible: 0,
    converted: 0,
    rate: null
  });
});

test('weekly completion includes a tournament created before the creation-cohort window', () => {
  const oldCreated = makeCompletedTournament('old_created', '2026-01-01T00:00:00.000Z', {
    rounds: [{ matches: [
      { status: 'finished', scoreA: 21, scoreB: 18, scoredAt: '2026-06-02T01:00:00.000Z' },
      { status: 'finished', scoreA: 21, scoreB: 19, scoredAt: '2026-06-02T02:00:00.000Z' }
    ] }]
  });
  const result = baseline.analyzeTournamentData([oldCreated], {
    cutoffDate: '2026-06-15',
    windowDays: 30
  });

  assert.equal(result.recordCounts.analyzed, 0);
  assert.equal(result.weeklyEffectiveCompletions.reduce((sum, row) => sum + row.count, 0), 1);
});

test('weekly series marks partial Asia/Shanghai boundary weeks and excludes them from MA4', () => {
  const result = baseline.analyzeTournamentData([], {
    cutoffDate: '2026-07-15',
    windowDays: 30
  });
  const weeks = result.weeklyEffectiveCompletions;

  assert.deepEqual(
    { weekStart: weeks[0].weekStart, observedDays: weeks[0].observedDays, isPartial: weeks[0].isPartial },
    { weekStart: '2026-06-15', observedDays: 6, isPartial: true }
  );
  assert.deepEqual(
    { weekStart: weeks.at(-1).weekStart, observedDays: weeks.at(-1).observedDays, isPartial: weeks.at(-1).isPartial },
    { weekStart: '2026-07-13', observedDays: 3, isPartial: true }
  );
  assert.equal(weeks.at(-1).movingAverage4w, null);
});

test('Pareto rows include completion rate and observable completion duration', () => {
  const complete = makeCompletedTournament('pareto_complete', '2026-06-01T00:00:00.000Z');
  const running = makeCompletedTournament('pareto_running', '2026-06-03T00:00:00.000Z', {
    status: 'running',
    rounds: [{ matches: [
      { status: 'pending' },
      { status: 'pending' }
    ] }],
    rankings: []
  });
  const result = baseline.analyzeTournamentData([complete, running], {
    cutoffDate: '2026-07-15',
    windowDays: 90
  });
  const row = result.pareto.rows[0];

  assert.equal(row.count, 2);
  assert.equal(row.effectiveCompletedCount, 1);
  assert.equal(row.effectiveCompletionRate, 0.5);
  assert.equal(row.firstScoreToCompletionSamples, 1);
  assert.equal(row.medianFirstScoreToCompletionHours, 1);
});

test('CloudBase timestamp shapes are normalized without exposing their source values', () => {
  assert.equal(
    baseline.toTimestamp({ seconds: 1780272000, nanoseconds: 500000000 }),
    1780272000500
  );
  assert.equal(
    baseline.toTimestamp({ $date: '2026-06-01T00:00:00.000Z' }),
    Date.parse('2026-06-01T00:00:00.000Z')
  );
  assert.equal(baseline.toTimestamp({ unexpected: true }), null);
});

test('free-form scheduler metadata cannot carry profile text into public dimensions', () => {
  const combination = baseline.classifyTournamentCombination({
    mode: 'multi_rotate',
    players: makePlayers('safe', 4),
    courts: 1,
    totalMatches: 2,
    presetKey: 'custom',
    schedulerMetaJson: JSON.stringify({
      templateKey: '昵称 张三',
      engine: 'https://private.example/avatar.png'
    })
  });

  assert.equal(combination.templateKey, 'unknown');
  assert.equal(combination.engine, 'unknown');
});

test('scheduler engine falls back to historical engineVersion and fairness metadata', () => {
  const engineVersion = baseline.classifyTournamentCombination({
    mode: 'squad_doubles',
    players: makePlayers('squad', 4),
    courts: 1,
    totalMatches: 3,
    schedulerMetaJson: JSON.stringify({ engineVersion: 'squad-v2-greedy' })
  });
  const fairnessEngine = baseline.classifyTournamentCombination({
    mode: 'fixed_pair_rr',
    players: makePlayers('pair', 4),
    courts: 1,
    totalMatches: 3,
    fairnessJson: JSON.stringify({ engine: 'fixed-pair-v1' })
  });

  assert.equal(engineVersion.engine, 'squad-v2-greedy');
  assert.equal(fairnessEngine.engine, 'fixed-pair-v1');
});

test('scheduler metadata uses business allowlists rather than generic identifier characters', () => {
  assert.equal(baseline.normalizeEngine('openid_private_creator'), 'unknown');
  assert.equal(baseline.normalizePresetKey('openid_private_creator'), 'unknown');
  assert.equal(baseline.normalizeTemplateKey('openid_private_creator'), 'unknown');
  assert.equal(baseline.normalizeTemplateKey('6p-1c'), '6p-1c');
});

test('fixed-pair readiness rejects a player reused across teams', () => {
  const players = makePlayers('pair_player', 4);
  const evaluated = baseline.evaluateTournament({
    status: 'draft',
    settingsConfigured: true,
    mode: 'fixed_pair_rr',
    players,
    courts: 1,
    totalMatches: 1,
    pairTeams: [
      { playerIds: [players[0].id, players[1].id] },
      { playerIds: [players[0].id, players[2].id] }
    ]
  });

  assert.equal(evaluated.rosterReady, false);
});

test('rule-driven canceled matches are split from other strict-finish data gaps', () => {
  const canceled = makeCompletedTournament('canceled_finish', '2026-06-01T00:00:00.000Z', {
    rounds: [{ matches: [
      { status: 'finished', scoreA: 21, scoreB: 18, scoredAt: '2026-06-02T01:00:00.000Z' },
      { status: 'canceled' }
    ] }]
  });
  const missingRanking = makeCompletedTournament('missing_rank', '2026-06-03T00:00:00.000Z', {
    rankings: []
  });
  const result = baseline.analyzeTournamentData([canceled, missingRanking], {
    cutoffDate: '2026-07-15',
    windowDays: 90
  });

  assert.equal(result.dataQuality.formalFinishedIncomplete, 2);
  assert.equal(result.dataQuality.strictFinishedWithCanceledMatches, 1);
  assert.equal(result.dataQuality.finishedDataIncompleteWithoutCanceledMatches, 1);
});

test('record conservation counts every discarded duplicate snapshot', () => {
  const one = makeCompletedTournament('triple', '2026-06-01T00:00:00.000Z', {
    updatedAt: '2026-06-02T00:00:00.000Z'
  });
  const two = { ...one, updatedAt: '2026-06-03T00:00:00.000Z' };
  const three = { ...one, updatedAt: '2026-06-04T00:00:00.000Z' };
  const result = baseline.analyzeTournamentData([one, two, three], {
    cutoffDate: '2026-07-15',
    windowDays: 90
  });

  assert.equal(result.recordCounts.duplicateRecords, 2);
  assert.equal(result.recordCounts.deduplicated, 1);
  assert.equal(result.dataQuality.recordConservation, true);
});

test('public summaries contain aggregates only', () => {
  const source = makeCompletedTournament('private_tournament', '2026-06-01T00:00:00.000Z', {
    creatorId: 'openid_private_creator',
    players: [
      { id: 'openid_private_creator', type: 'user', name: '私密昵称', avatar: 'https://private.example/a.png' },
      ...makePlayers('private_player', 3)
    ]
  });
  const summary = baseline.toPublicSummary(baseline.analyzeTournamentData([source], {
    cutoffDate: '2026-07-15',
    windowDays: 90
  }));
  const serialized = JSON.stringify(summary);

  assert.doesNotMatch(serialized, /openid_private|private_player|私密昵称|private\.example/);
  assert.match(serialized, /effective_completed/);
});
