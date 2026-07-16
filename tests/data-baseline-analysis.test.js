const test = require('node:test');
const assert = require('node:assert/strict');

const baseline = require('../scripts/analysis/data-baseline-core');

function player(id, type = 'user', extra = {}) {
  return { id, type, ...extra };
}

function match(status, scoreA, scoreB, scoredAt) {
  return {
    status,
    score: scoreA == null && scoreB == null ? null : { teamA: scoreA, teamB: scoreB },
    ...(scoredAt ? { scoredAt } : {})
  };
}

function tournament(id, createdAt, overrides = {}) {
  return {
    _id: id,
    createdAt,
    updatedAt: createdAt,
    status: 'draft',
    creatorId: `${id}_creator`,
    mode: 'multi_rotate',
    presetKey: 'custom',
    settingsConfigured: true,
    players: [
      player(`${id}_creator`),
      player(`${id}_p2`),
      player(`${id}_p3`),
      player(`${id}_p4`)
    ],
    courts: 1,
    totalMatches: 2,
    rounds: [],
    rankings: [],
    ...overrides
  };
}

test('strict mode and combination classification preserve missing fields as unknown', () => {
  assert.equal(baseline.normalizeModeStrict('doubles'), 'multi_rotate');
  assert.equal(baseline.normalizeModeStrict('mixed_fallback'), 'multi_rotate');
  assert.equal(baseline.normalizeModeStrict(''), 'unknown');
  assert.equal(baseline.normalizeModeStrict('future_mode'), 'unknown');

  const row = baseline.classifyTournamentCombination({
    mode: '',
    players: [],
    courts: null,
    totalMatches: 0,
    presetKey: '',
    schedulerMetaJson: '{"engine":"template"}'
  });

  assert.deepEqual(row, {
    mode: 'unknown',
    playersCount: 'unknown',
    courts: 'unknown',
    totalMatches: 'unknown',
    presetKey: 'missing',
    templateKey: 'missing',
    engine: 'template',
    classifiable: false
  });
});

test('effective completion requires start, legal scores for every planned match, finished status, and rankings', () => {
  const complete = tournament('complete', '2026-06-01T00:00:00.000Z', {
    status: 'finished',
    rounds: [{ matches: [
      match('finished', 21, 18, '2026-06-01T01:00:00.000Z'),
      match('finished', 15, 21, '2026-06-01T02:00:00.000Z')
    ] }],
    rankings: [{ playerId: 'complete_creator', wins: 1 }]
  });

  const evaluated = baseline.evaluateTournament(complete);
  assert.equal(evaluated.started, true);
  assert.equal(evaluated.firstScore, true);
  assert.equal(evaluated.halfScores, true);
  assert.equal(evaluated.allScores, true);
  assert.equal(evaluated.effectiveCompleted, true);
  assert.equal(evaluated.completionTimestampSource, 'scoredAt');

  const tiedScore = baseline.evaluateTournament({
    ...complete,
    rounds: [{ matches: [
      match('finished', 21, 21, '2026-06-01T01:00:00.000Z'),
      match('finished', 15, 21, '2026-06-01T02:00:00.000Z')
   ] }]
  });
  assert.equal(tiedScore.allScores, false);
  assert.equal(tiedScore.effectiveCompleted, false);

  const canceled = baseline.evaluateTournament({
    ...complete,
    rounds: [{ matches: [
      match('finished', 21, 18, '2026-06-01T01:00:00.000Z'),
      match('canceled', null, null)
   ] }]
  });
  assert.equal(canceled.allScores, false);
  assert.equal(canceled.effectiveCompleted, false);
});

test('legacy score fields are accepted only when they satisfy current score bounds', () => {
  assert.equal(baseline.isLegalFinishedScore({ status: 'finished', teamAScore: 21, teamBScore: 19 }), true);
  assert.equal(baseline.isLegalFinishedScore({ status: 'finished', scoreA: 61, scoreB: 59 }), false);
  assert.equal(baseline.isLegalFinishedScore({ status: 'finished', a: 11, b: 11 }), false);
  assert.equal(baseline.isLegalFinishedScore({ status: 'pending', score: { teamA: 21, teamB: 18 } }), false);
});

test('funnel is monotonic and repeat lower bound uses clone source linkage', () => {
  const source = tournament('source', '2026-06-01T00:00:00.000Z', {
    status: 'finished',
    rounds: [{ matches: [
      match('finished', 21, 18, '2026-06-02T00:00:00.000Z'),
      match('finished', 21, 17, '2026-06-02T01:00:00.000Z')
   ] }],
    rankings: [{ playerId: 'source_creator', wins: 2 }]
  });
  const clone = tournament('clone', '2026-06-10T00:00:00.000Z', {
    cloneSourceTournamentId: 'source'
  });
  const draft = tournament('draft', '2026-06-11T00:00:00.000Z', {
    players: [player('draft_creator')]
  });

  const result = baseline.analyzeTournamentData([source, clone, draft], {
    cutoffDate: '2026-07-15',
    windowDays: 180
  });

  assert.deepEqual(result.funnel.stages.map((stage) => stage.count), [3, 2, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(result.funnel.stages.map((stage) => stage.key), [
    'created',
    'roster_ready',
    'started',
    'first_score',
    'half_scores',
    'all_scores',
    'effective_completed',
    'share_or_repeat_lower_bound'
  ]);
});

test('28-day cohorts exclude imported guests and only include fully observable cohorts', () => {
  const organizerFirst = tournament('o1', '2026-05-01T00:00:00.000Z', {
    creatorId: 'org_a',
    players: [player('org_a'), player('participant_a'), player('guest_1', 'guest')]
  });
  const organizerRepeat = tournament('o2', '2026-05-20T00:00:00.000Z', {
    creatorId: 'org_a',
    players: [player('org_a'), player('participant_a')]
  });
  const participantAgain = tournament('o3', '2026-05-25T00:00:00.000Z', {
    creatorId: 'org_b',
    players: [player('org_b'), player('participant_a')]
  });
  const participantTurnsOrganizer = tournament('o4', '2026-05-28T00:00:00.000Z', {
    creatorId: 'participant_a',
    players: [player('participant_a'), player('someone_else')]
  });
  const tooRecent = tournament('recent', '2026-07-10T00:00:00.000Z', {
    creatorId: 'org_recent',
    players: [player('org_recent'), player('participant_recent')]
  });

  const result = baseline.analyzeTournamentData([
    organizerFirst,
    organizerRepeat,
    participantAgain,
    participantTurnsOrganizer,
    tooRecent
  ], {
    cutoffDate: '2026-07-15',
    windowDays: 180
  });

  assert.deepEqual(result.retention.organizer28d, {
    eligible: 3,
    converted: 1,
    rate: 1 / 3
  });
  assert.deepEqual(result.retention.participantRejoin28d, {
    eligible: 2,
    converted: 1,
    rate: 1 / 2
  });
  assert.deepEqual(result.retention.participantToOrganizer28d, {
    eligible: 2,
    converted: 1,
    rate: 1 / 2
  });
  assert.equal(result.actors.importedGuestOccurrences, 1);
});

test('Pareto rows are deterministic and expose cumulative 80/90/95 percent coverage', () => {
  const rows = [];
  const counts = [5, 3, 2];
  counts.forEach((count, idx) => {
    for (let i = 0; i < count; i += 1) {
      rows.push(tournament(`p${idx}_${i}`, `2026-06-${String(idx + 1).padStart(2, '0')}T00:00:00.000Z`, {
        status: 'running',
        players: Array.from({ length: 6 + idx }, (_, pIdx) => player(`g${idx}_p${pIdx}`)),
        totalMatches: 9 + idx,
        rounds: [{ matches: [match('pending')] }],
        schedulerMetaJson: JSON.stringify({
          templateKey: `n${6 + idx}_c1`,
          engine: idx === 0 ? 'template' : 'beam'
        })
      }));
    }
  });

  const first = baseline.analyzeTournamentData(rows, {
    cutoffDate: '2026-07-15',
    windowDays: 180
  });
  const second = baseline.analyzeTournamentData(rows, {
    cutoffDate: '2026-07-15',
    windowDays: 180
  });

  assert.deepEqual(first.pareto.rows, second.pareto.rows);
  assert.deepEqual(first.pareto.rows.map((row) => row.count), [5, 3, 2]);
  assert.deepEqual(first.pareto.thresholds, {
    '0.8': { rowCount: 2, coveredCount: 8, coverage: 0.8 },
    '0.9': { rowCount: 3, coveredCount: 10, coverage: 1 },
    '0.95': { rowCount: 3, coveredCount: 10, coverage: 1 }
  });
});

test('four-week moving average includes zero weeks and output contains no actor identifiers or profile fields', () => {
  const dates = [
    ['2026-05-05T00:00:00.000Z', '2026-05-06T00:00:00.000Z', '2026-05-06T01:00:00.000Z'],
    ['2026-05-19T00:00:00.000Z', '2026-05-20T00:00:00.000Z', '2026-05-20T01:00:00.000Z'],
    ['2026-06-02T00:00:00.000Z', '2026-06-03T00:00:00.000Z', '2026-06-03T01:00:00.000Z']
  ];
  const completed = dates.map(([createdAt, scoreOneAt, scoreTwoAt], idx) => tournament(`weekly_${idx}`, createdAt, {
    creatorId: `private_creator_${idx}`,
    status: 'finished',
    players: [
      player(`private_creator_${idx}`, 'user', { name: '不应输出的昵称', avatar: 'https://private.example/avatar.png' }),
      player(`private_participant_${idx}`),
      player(`x_${idx}`),
      player(`y_${idx}`)
    ],
    rounds: [{ matches: [
      match('finished', 21, 18, scoreOneAt),
      match('finished', 21, 19, scoreTwoAt)
   ] }],
    rankings: [{ playerId: `private_creator_${idx}`, wins: 2 }]
  }));

  const result = baseline.analyzeTournamentData(completed, {
    cutoffDate: '2026-06-15',
    windowDays: 60
  });
  const weeks = result.weeklyEffectiveCompletions;
  assert.ok(weeks.length >= 4);
  assert.equal(weeks.some((row) => row.count === 0), true);
  assert.equal(weeks.at(-1).movingAverage4w >= 0, true);

  const serialized = JSON.stringify(baseline.toPublicSummary(result));
  assert.doesNotMatch(serialized, /private_creator|private_participant|不应输出的昵称|private\.example/);
});
