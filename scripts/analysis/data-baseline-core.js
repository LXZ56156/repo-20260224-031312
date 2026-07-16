'use strict';

const SCORE_ABSOLUTE_MAX = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const KNOWN_MODES = new Set(['multi_rotate', 'squad_doubles', 'fixed_pair_rr']);
const MODE_ALIASES = Object.freeze({
  doubles: 'multi_rotate',
  mixed_fallback: 'multi_rotate'
});
const ROTATION_PRESETS = Object.freeze({
  rotation_6: { players: 6, courts: [1] },
  rotation_7: { players: 7, courts: [1] },
  rotation_8: { players: 8, courts: [1, 2] }
});
const KNOWN_PRESET_KEYS = new Set(['custom', 'rotation_6', 'rotation_7', 'rotation_8', 'relax', 'standard', 'intense']);
const KNOWN_ENGINES = new Set([
  'beam',
  'template',
  'rotation-v3',
  'squad-v2-greedy',
  'squad-v3-beam',
  'fixed-pair-v1'
]);

function normalizeModeStrict(value) {
  const raw = String(value || '').trim().toLowerCase();
  const normalized = MODE_ALIASES[raw] || raw;
  return KNOWN_MODES.has(normalized) ? normalized : 'unknown';
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

function normalizePresetKey(value) {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (!normalized) return 'missing';
  return KNOWN_PRESET_KEYS.has(normalized) ? normalized : 'unknown';
}

function normalizeTemplateKey(value) {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (!normalized) return 'missing';
  if (/^\d+p-\d+c$/.test(normalized) || /^n\d+_c\d+$/.test(normalized)) return normalized;
  return 'unknown';
}

function normalizeEngine(value) {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (!normalized) return 'missing';
  return KNOWN_ENGINES.has(normalized) ? normalized : 'unknown';
}

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { value, malformed: false };
  }
  if (typeof value !== 'string' || !value.trim()) {
    return { value: {}, malformed: false };
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { value: parsed, malformed: false };
    }
  } catch (_) {
    // Report the malformed value through data quality; never leak its contents.
  }
  return { value: {}, malformed: true };
}

function getSchedulerMeta(tournament) {
  const source = tournament || {};
  const direct = parseJsonObject(source.schedulerMeta);
  if (Object.keys(direct.value).length > 0 || direct.malformed) return direct;
  return parseJsonObject(source.schedulerMetaJson);
}

function getFairnessMeta(tournament) {
  const source = tournament || {};
  const direct = parseJsonObject(source.fairness);
  if (Object.keys(direct.value).length > 0 || direct.malformed) return direct;
  return parseJsonObject(source.fairnessJson);
}

function classifyTournamentCombination(tournament) {
  const source = tournament || {};
  const schedulerMeta = getSchedulerMeta(source).value;
  const fairnessMeta = getFairnessMeta(source).value;
  const mode = normalizeModeStrict(source.mode);
  const playersCount = Array.isArray(source.players) && source.players.length > 0
    ? source.players.length
    : (toPositiveInteger(source.playersCount) || 'unknown');
  const courts = toPositiveInteger(source.courts) || 'unknown';
  const totalMatches = toPositiveInteger(source.totalMatches) || 'unknown';
  const presetKey = normalizePresetKey(source.presetKey);
  const templateKey = normalizeTemplateKey(schedulerMeta.templateKey || source.templateKey);
  const engine = normalizeEngine(
    schedulerMeta.engine || schedulerMeta.engineVersion || fairnessMeta.engine || source.engine
  );

  return {
    mode,
    playersCount,
    courts,
    totalMatches,
    presetKey,
    templateKey,
    engine,
    classifiable: mode !== 'unknown' && playersCount !== 'unknown' && courts !== 'unknown' && totalMatches !== 'unknown'
  };
}

function toFiniteScore(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function extractScorePair(match) {
  const source = match && typeof match === 'object' ? match : {};
  const nested = source.score && typeof source.score === 'object' ? source.score : {};
  const scalarTeamA = typeof source.teamA === 'number' || typeof source.teamA === 'string'
    ? source.teamA
    : undefined;
  const scalarTeamB = typeof source.teamB === 'number' || typeof source.teamB === 'string'
    ? source.teamB
    : undefined;
  return {
    a: toFiniteScore(
      nested.teamA ?? source.teamAScore ?? source.teamAScore1 ?? source.teamAScore2 ??
      source.scoreA ?? source.a ?? source.left ?? scalarTeamA
    ),
    b: toFiniteScore(
      nested.teamB ?? source.teamBScore ?? source.teamBScore1 ?? source.teamBScore2 ??
      source.scoreB ?? source.b ?? source.right ?? scalarTeamB
    )
  };
}

function isLegalFinishedScore(match) {
  if (String(match && match.status || '').trim().toLowerCase() !== 'finished') return false;
  const pair = extractScorePair(match);
  if (!Number.isInteger(pair.a) || !Number.isInteger(pair.b)) return false;
  if (pair.a < 0 || pair.b < 0 || pair.a > SCORE_ABSOLUTE_MAX || pair.b > SCORE_ABSOLUTE_MAX) return false;
  return pair.a !== pair.b;
}

function flattenMatches(tournament) {
  const rounds = Array.isArray(tournament && tournament.rounds) ? tournament.rounds : [];
  return rounds.flatMap((round) => (
    Array.isArray(round && round.matches) ? round.matches.filter((match) => match && typeof match === 'object') : []
  ));
}

function playerId(player) {
  if (typeof player === 'string' || typeof player === 'number') return String(player).trim();
  return String(player && (player.id || player.playerId || player.openid || player._id) || '').trim();
}

function isImportedGuest(player) {
  const type = String(player && player.type || '').trim().toLowerCase();
  const id = playerId(player).toLowerCase();
  return type === 'guest' || id.startsWith('guest_');
}

function hasValidPairTeams(tournament, players) {
  const validIds = new Set(players.map(playerId).filter(Boolean));
  const teams = Array.isArray(tournament && tournament.pairTeams) ? tournament.pairTeams : [];
  const usedIds = new Set();
  let validTeams = 0;
  for (const team of teams) {
    const ids = Array.isArray(team && team.playerIds)
      ? team.playerIds
      : [team && (team.playerAId || team.player1Id), team && (team.playerBId || team.player2Id)];
    const normalized = ids.map((id) => String(id || '').trim()).filter(Boolean);
    if (normalized.length !== 2 || normalized[0] === normalized[1]) return false;
    if (!normalized.every((id) => validIds.has(id)) || normalized.some((id) => usedIds.has(id))) return false;
    normalized.forEach((id) => usedIds.add(id));
    validTeams += 1;
  }
  return validTeams >= 2;
}

function rosterIsReadyFromSnapshot(tournament) {
  const source = tournament || {};
  const players = Array.isArray(source.players) ? source.players : [];
  const ids = players.map(playerId).filter(Boolean);
  const mode = normalizeModeStrict(source.mode);
  const courts = toPositiveInteger(source.courts);
  const totalMatches = toPositiveInteger(source.totalMatches);
  if (source.settingsConfigured === false || !courts || !totalMatches || mode === 'unknown') return false;
  if (players.length < 4 || ids.length !== players.length || new Set(ids).size !== ids.length) return false;

  const presetKey = String(source.presetKey || '').trim();
  const preset = ROTATION_PRESETS[presetKey];
  if (mode === 'multi_rotate' && preset) {
    if (players.length !== preset.players || !preset.courts.includes(courts)) return false;
  }
  if (mode === 'squad_doubles') {
    const squads = players.reduce((counts, player) => {
      const squad = String(player && player.squad || '').trim().toUpperCase();
      if (squad === 'A') counts.a += 1;
      if (squad === 'B') counts.b += 1;
      return counts;
    }, { a: 0, b: 0 });
    return squads.a >= 2 && squads.b >= 2;
  }
  if (mode === 'fixed_pair_rr') return hasValidPairTeams(source, players);
  return true;
}

function toTimestamp(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, '$date')) return toTimestamp(value.$date);
    if (Object.prototype.hasOwnProperty.call(value, 'date')) return toTimestamp(value.date);
    const seconds = Number(value.seconds ?? value._seconds);
    if (Number.isFinite(seconds)) {
      const nanos = Number(value.nanoseconds ?? value._nanoseconds) || 0;
      return seconds * 1000 + Math.floor(nanos / 1e6);
    }
  }
  return null;
}

function evaluateTournament(tournament) {
  const source = tournament || {};
  const matches = flattenMatches(source);
  const status = String(source.status || '').trim().toLowerCase();
  const started = status === 'running' || status === 'finished' || matches.length > 0;
  const rosterReadyFromSnapshot = rosterIsReadyFromSnapshot(source);
  const rosterReady = started || rosterReadyFromSnapshot;
  const scheduledMatches = toPositiveInteger(source.scheduledMatches);
  const configuredMatches = toPositiveInteger(source.totalMatches);
  const plannedMatches = scheduledMatches
    ? Math.max(matches.length, scheduledMatches)
    : Math.max(matches.length, configuredMatches || 0);
  const legalMatches = matches.filter(isLegalFinishedScore);
  const canceledMatches = matches.filter((match) => String(match && match.status || '').trim().toLowerCase() === 'canceled').length;
  const firstScore = started && legalMatches.length > 0;
  const halfScores = firstScore && plannedMatches > 0 && legalMatches.length >= Math.ceil(plannedMatches / 2);
  const allScores = halfScores && plannedMatches > 0 && legalMatches.length === plannedMatches;
  const rankingsPresent = Array.isArray(source.rankings) && source.rankings.length > 0;
  const effectiveCompleted = started && allScores && status === 'finished' && rankingsPresent;
  const scoredTimestamps = legalMatches.map((match) => toTimestamp(match.scoredAt)).filter(Number.isFinite).sort((a, b) => a - b);
  const scoreTimestampsComplete = legalMatches.length > 0 && scoredTimestamps.length === legalMatches.length;

  let completionTimestamp = null;
  let completionTimestampSource = 'unavailable';
  if (scoreTimestampsComplete) {
    completionTimestamp = scoredTimestamps[scoredTimestamps.length - 1];
    completionTimestampSource = 'scoredAt';
  } else {
    const candidates = [
      ['finishedAt', toTimestamp(source.finishedAt)],
      [
        'shareActivityUpdatedAt_proxy',
        Number(source.shareActivityState) === 2 ? toTimestamp(source.shareActivityUpdatedAt) : null
      ]
    ];
    const candidate = candidates.find((entry) => Number.isFinite(entry[1]));
    if (candidate) {
      completionTimestampSource = candidate[0];
      completionTimestamp = candidate[1];
    }
  }

  const hasShareEvidence = Boolean(
    toTimestamp(source.sharedAt) ||
    (Number.isFinite(Number(source.shareCount)) && Number(source.shareCount) > 0)
  );

  return {
    rosterReady,
    rosterReadyInferredFromStarted: started && !rosterReadyFromSnapshot,
    started,
    firstScore,
    halfScores,
    allScores,
    effectiveCompleted,
    plannedMatches,
    materializedMatches: matches.length,
    legalScoreMatches: legalMatches.length,
    canceledMatches,
    invalidOrIncompleteMatches: Math.max(0, matches.length - legalMatches.length),
    rankingsPresent,
    scoredTimestampMatches: scoredTimestamps.length,
    scoreTimestampsComplete,
    firstScoreTimestamp: scoreTimestampsComplete ? scoredTimestamps[0] : null,
    completionTimestamp: effectiveCompleted ? completionTimestamp : null,
    completionTimestampSource: effectiveCompleted ? completionTimestampSource : 'unavailable',
    createdTimestamp: toTimestamp(source.createdAt),
    startedTimestamp: toTimestamp(source.startedAt),
    hasShareEvidence
  };
}

function parseCutoffDate(value) {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('cutoffDate 必须使用 YYYY-MM-DD');
  }
  const start = Date.parse(`${normalized}T00:00:00+08:00`);
  if (!Number.isFinite(start) || new Date(start + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10) !== normalized) {
    throw new Error(`cutoffDate 不是有效日期: ${normalized}`);
  }
  return { normalized, start, end: start + DAY_MS - 1 };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizeDuration(values) {
  const finite = values.filter((value) => Number.isFinite(value) && value >= 0);
  return {
    available: finite.length,
    medianHours: finite.length > 0 ? median(finite) / (60 * 60 * 1000) : null
  };
}

function dateKeyBusiness(timestamp) {
  return new Date(timestamp + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

function mondayStartBusiness(timestamp) {
  const date = new Date(timestamp + SHANGHAI_OFFSET_MS);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = new Date(start).getUTCDay();
  return start - ((day + 6) % 7) * DAY_MS - SHANGHAI_OFFSET_MS;
}

function businessDayStart(timestamp) {
  const date = new Date(timestamp + SHANGHAI_OFFSET_MS);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - SHANGHAI_OFFSET_MS;
}

function buildWeeklyEffectiveCompletions(evaluatedRows, windowStart, cutoffEnd) {
  const firstWeek = mondayStartBusiness(windowStart);
  const lastWeek = mondayStartBusiness(cutoffEnd);
  const counts = new Map();
  for (const row of evaluatedRows) {
    const timestamp = row.evaluation.completionTimestamp;
    if (!row.evaluation.effectiveCompleted || !Number.isFinite(timestamp)) continue;
    if (timestamp < windowStart || timestamp > cutoffEnd) continue;
    const week = mondayStartBusiness(timestamp);
    counts.set(week, (counts.get(week) || 0) + 1);
  }

  const weeks = [];
  for (let week = firstWeek; week <= lastWeek; week += 7 * DAY_MS) {
    const count = counts.get(week) || 0;
    const observedStart = Math.max(week, windowStart);
    const observedEnd = Math.min(week + 7 * DAY_MS - 1, cutoffEnd);
    const observedDays = Math.max(0, Math.floor((businessDayStart(observedEnd) - businessDayStart(observedStart)) / DAY_MS) + 1);
    weeks.push({
      weekStart: dateKeyBusiness(week),
      observedDays,
      isPartial: observedDays < 7,
      count,
      movingAverage4w: null
    });
  }
  for (let index = 3; index < weeks.length; index += 1) {
    const slice = weeks.slice(index - 3, index + 1);
    if (slice.every((row) => !row.isPartial)) {
      const sum = slice.reduce((total, row) => total + row.count, 0);
      weeks[index].movingAverage4w = sum / 4;
    }
  }
  return weeks;
}

function makeRate(eligible, converted) {
  return {
    eligible,
    converted,
    rate: eligible > 0 ? converted / eligible : null
  };
}

function buildRetention(tournaments, windowStart, cutoffEnd) {
  const sorted = [...tournaments].sort((left, right) => (
    left.createdTimestamp - right.createdTimestamp || left.index - right.index
  ));
  const organizerEvents = new Map();
  const participantEvents = new Map();
  let importedGuestOccurrences = 0;
  const windowOrganizerIds = new Set();
  const windowParticipantIds = new Set();

  for (const row of sorted) {
    const source = row.tournament;
    const creatorId = String(source.creatorId || '').trim();
    if (creatorId) {
      if (!organizerEvents.has(creatorId)) organizerEvents.set(creatorId, []);
      organizerEvents.get(creatorId).push(row.createdTimestamp);
      if (row.createdTimestamp >= windowStart) windowOrganizerIds.add(creatorId);
    }

    const seenInTournament = new Set();
    const players = Array.isArray(source.players) ? source.players : [];
    for (const player of players) {
      if (isImportedGuest(player)) {
        if (row.createdTimestamp >= windowStart) importedGuestOccurrences += 1;
        continue;
      }
      const id = playerId(player);
      if (!id || id === creatorId || seenInTournament.has(id)) continue;
      seenInTournament.add(id);
      if (!participantEvents.has(id)) participantEvents.set(id, []);
      participantEvents.get(id).push(row.createdTimestamp);
      if (row.createdTimestamp >= windowStart) windowParticipantIds.add(id);
    }
  }

  const cohortLatestStart = cutoffEnd - 28 * DAY_MS;
  let organizerEligible = 0;
  let organizerConverted = 0;
  for (const timestamps of organizerEvents.values()) {
    const ordered = [...new Set(timestamps)].sort((a, b) => a - b);
    const first = ordered[0];
    if (!Number.isFinite(first) || first < windowStart || first > cohortLatestStart) continue;
    organizerEligible += 1;
    if (ordered.some((timestamp) => timestamp > first && timestamp <= first + 28 * DAY_MS)) {
      organizerConverted += 1;
    }
  }

  let participantEligible = 0;
  let participantRejoined = 0;
  let participantBecameOrganizer = 0;
  for (const [id, timestamps] of participantEvents.entries()) {
    const ordered = [...new Set(timestamps)].sort((a, b) => a - b);
    const first = ordered[0];
    if (!Number.isFinite(first) || first < windowStart || first > cohortLatestStart) continue;
    participantEligible += 1;
    if (ordered.some((timestamp) => timestamp > first && timestamp <= first + 28 * DAY_MS)) {
      participantRejoined += 1;
    }
    const creatorTimestamps = organizerEvents.get(id) || [];
    if (creatorTimestamps.some((timestamp) => timestamp > first && timestamp <= first + 28 * DAY_MS)) {
      participantBecameOrganizer += 1;
    }
  }

  return {
    retention: {
      organizer28d: makeRate(organizerEligible, organizerConverted),
      participantRejoin28d: makeRate(participantEligible, participantRejoined),
      participantToOrganizer28d: makeRate(participantEligible, participantBecameOrganizer)
    },
    actors: {
      uniqueOrganizers: windowOrganizerIds.size,
      uniqueActiveParticipants: windowParticipantIds.size,
      importedGuestOccurrences
    }
  };
}

function combinationKey(combination) {
  return [
    combination.mode,
    combination.playersCount,
    combination.courts,
    combination.totalMatches,
    combination.presetKey,
    combination.templateKey,
    combination.engine
  ].join('\u001f');
}

function buildPareto(evaluatedRows) {
  const startedRows = evaluatedRows.filter((row) => row.evaluation.started);
  const grouped = new Map();
  let classifiableCount = 0;
  for (const row of startedRows) {
    if (row.combination.classifiable) classifiableCount += 1;
    const key = combinationKey(row.combination);
    if (!grouped.has(key)) {
      grouped.set(key, {
        combination: row.combination,
        count: 0,
        effectiveCompletedCount: 0,
        firstScoreToCompletionDurations: [],
        key
      });
    }
    const group = grouped.get(key);
    group.count += 1;
    if (row.evaluation.effectiveCompleted) group.effectiveCompletedCount += 1;
    if (Number.isFinite(row.evaluation.firstScoreTimestamp) && Number.isFinite(row.evaluation.completionTimestamp)) {
      const duration = row.evaluation.completionTimestamp - row.evaluation.firstScoreTimestamp;
      if (duration >= 0) group.firstScoreToCompletionDurations.push(duration);
    }
  }

  const total = startedRows.length;
  const rows = [...grouped.values()]
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .map((entry) => ({
      ...entry.combination,
      count: entry.count,
      effectiveCompletedCount: entry.effectiveCompletedCount,
      effectiveCompletionRate: entry.count > 0 ? entry.effectiveCompletedCount / entry.count : null,
      firstScoreToCompletionSamples: entry.firstScoreToCompletionDurations.length,
      medianFirstScoreToCompletionHours: entry.firstScoreToCompletionDurations.length > 0
        ? median(entry.firstScoreToCompletionDurations) / (60 * 60 * 1000)
        : null
    }));
  let cumulative = 0;
  for (const row of rows) {
    cumulative += row.count;
    row.share = total > 0 ? row.count / total : null;
    row.cumulativeCount = cumulative;
    row.cumulativeCoverage = total > 0 ? cumulative / total : null;
  }

  const thresholds = {};
  for (const threshold of [0.8, 0.9, 0.95]) {
    const index = rows.findIndex((row) => Number.isFinite(row.cumulativeCoverage) && row.cumulativeCoverage + Number.EPSILON >= threshold);
    thresholds[String(threshold)] = index >= 0
      ? {
          rowCount: index + 1,
          coveredCount: rows[index].cumulativeCount,
          coverage: rows[index].cumulativeCoverage
        }
      : { rowCount: 0, coveredCount: 0, coverage: total > 0 ? 0 : null };
  }

  return {
    population: 'started_tournaments',
    total,
    classifiableCount,
    classifiableRate: total > 0 ? classifiableCount / total : null,
    rows,
    thresholds
  };
}

function normalizeStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  return ['draft', 'running', 'finished'].includes(value) ? value : 'unknown';
}

function analyzeTournamentData(input, options = {}) {
  if (!Array.isArray(input)) throw new Error('赛事输入必须是数组');
  const cutoff = parseCutoffDate(options.cutoffDate);
  const rawWindowDays = options.windowDays === undefined ? 180 : options.windowDays;
  const windowDays = toPositiveInteger(rawWindowDays);
  if (!windowDays) throw new Error('windowDays 必须是正整数');
  const windowStart = cutoff.start - (windowDays - 1) * DAY_MS;

  const invalidCreatedAt = [];
  let duplicateRecordCount = 0;
  const byKey = new Map();
  input.forEach((tournament, index) => {
    if (!tournament || typeof tournament !== 'object' || Array.isArray(tournament)) {
      invalidCreatedAt.push(index);
      return;
    }
    const createdTimestamp = toTimestamp(tournament.createdAt);
    if (!Number.isFinite(createdTimestamp)) {
      invalidCreatedAt.push(index);
      return;
    }
    const rawId = String(tournament._id || '').trim();
    const key = rawId ? `id:${rawId}` : `row:${index}`;
    const row = { tournament, index, createdTimestamp, rawId };
    if (byKey.has(key)) {
      duplicateRecordCount += 1;
      const previous = byKey.get(key);
      const previousUpdated = toTimestamp(previous.tournament.updatedAt) || previous.createdTimestamp;
      const nextUpdated = toTimestamp(tournament.updatedAt) || createdTimestamp;
      if (nextUpdated >= previousUpdated) byKey.set(key, row);
    } else {
      byKey.set(key, row);
    }
  });

  const deduplicated = [...byKey.values()];
  const historyThroughCutoff = deduplicated.filter((row) => row.createdTimestamp <= cutoff.end);
  const inWindow = deduplicated.filter((row) => row.createdTimestamp >= windowStart && row.createdTimestamp <= cutoff.end);
  const cloneSourceIds = new Set(
    inWindow.map((row) => String(row.tournament.cloneSourceTournamentId || '').trim()).filter(Boolean)
  );
  const evaluatedRows = inWindow.map((row) => ({
    ...row,
    evaluation: evaluateTournament(row.tournament),
    combination: classifyTournamentCombination(row.tournament),
    schedulerMetaMalformed: getSchedulerMeta(row.tournament).malformed
      || getFairnessMeta(row.tournament).malformed
  }));
  const evaluatedHistoryRows = historyThroughCutoff.map((row) => ({
    ...row,
    evaluation: evaluateTournament(row.tournament),
    combination: classifyTournamentCombination(row.tournament),
    schedulerMetaMalformed: getSchedulerMeta(row.tournament).malformed
      || getFairnessMeta(row.tournament).malformed
  }));

  const stageDefinitions = [
    ['created', () => true],
    ['roster_ready', (row) => row.evaluation.rosterReady],
    ['started', (row) => row.evaluation.rosterReady && row.evaluation.started],
    ['first_score', (row) => row.evaluation.rosterReady && row.evaluation.started && row.evaluation.firstScore],
    ['half_scores', (row) => row.evaluation.rosterReady && row.evaluation.started && row.evaluation.halfScores],
    ['all_scores', (row) => row.evaluation.rosterReady && row.evaluation.started && row.evaluation.allScores],
    ['effective_completed', (row) => row.evaluation.rosterReady && row.evaluation.effectiveCompleted],
    ['share_or_repeat_lower_bound', (row) => (
      row.evaluation.rosterReady && row.evaluation.effectiveCompleted &&
      (row.evaluation.hasShareEvidence || (row.rawId && cloneSourceIds.has(row.rawId)))
    )]
  ];
  const stages = stageDefinitions.map(([key, predicate], index) => {
    const count = evaluatedRows.filter(predicate).length;
    const previousCount = index === 0 ? count : null;
    return { key, count, previousCount };
  });
  stages.forEach((stage, index) => {
    const previous = index === 0 ? stage.count : stages[index - 1].count;
    stage.previousCount = previous;
    stage.conversionFromPrevious = previous > 0 ? stage.count / previous : null;
    stage.conversionFromCreated = stages[0].count > 0 ? stage.count / stages[0].count : null;
  });

  const retentionResult = buildRetention(historyThroughCutoff, windowStart, cutoff.end);
  const statusCounts = { draft: 0, running: 0, finished: 0, unknown: 0 };
  evaluatedRows.forEach((row) => { statusCounts[normalizeStatus(row.tournament.status)] += 1; });
  const formalFinishedIncomplete = evaluatedRows.filter((row) => (
    normalizeStatus(row.tournament.status) === 'finished' && !row.evaluation.effectiveCompleted
  )).length;
  const strictFinishedWithCanceledMatches = evaluatedRows.filter((row) => (
    normalizeStatus(row.tournament.status) === 'finished' && row.evaluation.canceledMatches > 0
  )).length;
  const targetWinsFinishedWithCanceledMatches = evaluatedRows.filter((row) => (
    normalizeStatus(row.tournament.status) === 'finished' &&
    row.evaluation.canceledMatches > 0 &&
    String(row.tournament && row.tournament.rules && row.tournament.rules.endCondition &&
      row.tournament.rules.endCondition.type || '').trim().toLowerCase() === 'target_wins'
  )).length;
  const finishedDataIncompleteWithoutCanceledMatches = evaluatedRows.filter((row) => (
    normalizeStatus(row.tournament.status) === 'finished' &&
    !row.evaluation.effectiveCompleted && row.evaluation.canceledMatches === 0
  )).length;
  const durationSegments = {
    createdToStart: summarizeDuration(evaluatedRows.map((row) => (
      Number.isFinite(row.evaluation.startedTimestamp)
        ? row.evaluation.startedTimestamp - row.evaluation.createdTimestamp
        : null
    ))),
    startToFirstScore: summarizeDuration(evaluatedRows.map((row) => (
      Number.isFinite(row.evaluation.startedTimestamp) && Number.isFinite(row.evaluation.firstScoreTimestamp)
        ? row.evaluation.firstScoreTimestamp - row.evaluation.startedTimestamp
        : null
    ))),
    firstScoreToCompletion: summarizeDuration(evaluatedRows.map((row) => (
      Number.isFinite(row.evaluation.firstScoreTimestamp) && Number.isFinite(row.evaluation.completionTimestamp)
        ? row.evaluation.completionTimestamp - row.evaluation.firstScoreTimestamp
        : null
    )))
  };

  return {
    schemaVersion: 1,
    cutoffDate: cutoff.normalized,
    window: {
      days: windowDays,
      startDate: dateKeyBusiness(windowStart),
      endDate: cutoff.normalized
    },
    recordCounts: {
      input: input.length,
      invalidCreatedAt: invalidCreatedAt.length,
      duplicateRecords: duplicateRecordCount,
      deduplicated: deduplicated.length,
      outsideWindow: deduplicated.length - inWindow.length,
      analyzed: inWindow.length
    },
    funnel: { stages },
    retention: retentionResult.retention,
    actors: retentionResult.actors,
    pareto: buildPareto(evaluatedRows),
    weeklyEffectiveCompletions: buildWeeklyEffectiveCompletions(evaluatedHistoryRows, windowStart, cutoff.end),
    durations: durationSegments,
    dataQuality: {
      statusCounts,
      statusConservation: Object.values(statusCounts).reduce((sum, value) => sum + value, 0) === inWindow.length,
      recordConservation: input.length === invalidCreatedAt.length + duplicateRecordCount + deduplicated.length,
      coreCombinationClassifiable: evaluatedRows.filter((row) => row.combination.classifiable).length,
      coreCombinationClassifiableRate: inWindow.length > 0
        ? evaluatedRows.filter((row) => row.combination.classifiable).length / inWindow.length
        : null,
      malformedSchedulerMeta: evaluatedRows.filter((row) => row.schedulerMetaMalformed).length,
      missingTournamentId: inWindow.filter((row) => !row.rawId).length,
      rosterReadyInferredFromStarted: evaluatedRows.filter((row) => row.evaluation.rosterReadyInferredFromStarted).length,
      materializedMatches: evaluatedRows.reduce((sum, row) => sum + row.evaluation.materializedMatches, 0),
      plannedMaterializedMismatch: evaluatedRows.filter((row) => (
        row.evaluation.plannedMatches !== row.evaluation.materializedMatches
      )).length,
      unmaterializedPlannedMatches: evaluatedRows.reduce((sum, row) => (
        sum + Math.max(0, row.evaluation.plannedMatches - row.evaluation.materializedMatches)
      ), 0),
      legalScoreMatches: evaluatedRows.reduce((sum, row) => sum + row.evaluation.legalScoreMatches, 0),
      scoredTimestampMatches: evaluatedRows.reduce((sum, row) => sum + row.evaluation.scoredTimestampMatches, 0),
      effectiveCompletionTimestampSources: evaluatedRows
        .filter((row) => row.evaluation.effectiveCompleted)
        .reduce((counts, row) => {
          const source = row.evaluation.completionTimestampSource;
          counts[source] = (counts[source] || 0) + 1;
          return counts;
        }, {}),
      invalidOrIncompleteMatches: evaluatedRows.reduce((sum, row) => sum + row.evaluation.invalidOrIncompleteMatches, 0),
      formalFinishedIncomplete,
      strictFinishedWithCanceledMatches,
      targetWinsFinishedWithCanceledMatches,
      otherFinishedWithCanceledMatches: strictFinishedWithCanceledMatches - targetWinsFinishedWithCanceledMatches,
      finishedDataIncompleteWithoutCanceledMatches,
      dynamicShareActivityRecords: evaluatedRows.filter((row) => (
        String(row.tournament.shareActivityId || row.tournament.activityId || '').trim()
      )).length,
      combinationDimensionGaps: ['mode', 'playersCount', 'courts', 'totalMatches', 'presetKey', 'templateKey', 'engine']
        .reduce((gaps, dimension) => {
          gaps[dimension] = {
            missing: evaluatedRows.filter((row) => row.combination[dimension] === 'missing').length,
            unknown: evaluatedRows.filter((row) => row.combination[dimension] === 'unknown').length
          };
          return gaps;
        }, {}),
      unavailableTimestampSegments: Object.fromEntries(
        Object.entries(durationSegments).map(([key, value]) => [key, inWindow.length - value.available])
      )
    }
  };
}

function toPublicSummary(result) {
  const source = result || {};
  const publicResult = {
    schemaVersion: source.schemaVersion || 1,
    cutoffDate: source.cutoffDate || '',
    window: source.window || null,
    recordCounts: source.recordCounts || null,
    funnel: source.funnel || null,
    retention: source.retention || null,
    actors: source.actors || null,
    pareto: source.pareto || null,
    weeklyEffectiveCompletions: source.weeklyEffectiveCompletions || [],
    durations: source.durations || null,
    dataQuality: source.dataQuality || null
  };
  return JSON.parse(JSON.stringify(publicResult));
}

module.exports = {
  DAY_MS,
  SCORE_ABSOLUTE_MAX,
  SHANGHAI_OFFSET_MS,
  analyzeTournamentData,
  classifyTournamentCombination,
  evaluateTournament,
  extractScorePair,
  isImportedGuest,
  isLegalFinishedScore,
  normalizeModeStrict,
  normalizeEngine,
  normalizePresetKey,
  normalizeTemplateKey,
  toPublicSummary,
  toTimestamp
};
