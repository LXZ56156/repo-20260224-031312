#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const scenarioCommon = require('./scheduler-scenario-common');
const { generateSchedule, computeEffectiveCourts } = require('../cloudfunctions/startTournament/rotation');
const { buildSquadSchedule, buildFixedPairSchedule } = require('../cloudfunctions/startTournament/scheduleModes');
const templateLibrary = require('../cloudfunctions/startTournament/rotation.templates');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, 'docs/tasks/parallel-development/evidence');
const DEFAULT_JSON_NAME = '02-scheduler-observability-audit.json';
const DEFAULT_MARKDOWN_NAME = '02-scheduler-observability-audit.md';
const DEFAULT_BENCHMARK_REPEATS = 20;
const DEFAULT_BENCHMARK_WARMUPS = 2;

const DONE_TIMING_FIELDS = [
  'scheduleMs',
  'materializeMs',
  'writeMs',
  'totalMs',
  'engine',
  'engineVersion',
  'executionProfile',
  'templateKey',
  'fallbackReason',
  'searchElapsedMs',
  'requestedCourts',
  'effectiveCourts',
  'playersCount',
  'totalMatches',
  'mode',
  'scheduledMatches'
];

function range(start, end) {
  if (end < start) return [];
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function sortTemplateEntries(entries) {
  return entries.slice().sort(([left], [right]) => left.localeCompare(right, 'en', { numeric: true }));
}

function countVariantMatches(variant) {
  return (variant && Array.isArray(variant.rounds) ? variant.rounds : [])
    .reduce((sum, round) => sum + (round && Array.isArray(round.matches) ? round.matches.length : 0), 0);
}

function buildTemplateCoverageMatrix(library = templateLibrary) {
  const cases = library && library.cases && typeof library.cases === 'object' ? library.cases : {};
  return sortTemplateEntries(Object.entries(cases)).map(([templateKey, caseData]) => {
    const horizonMatches = Math.max(0, Number(caseData && caseData.horizonMatches) || 0);
    const variants = caseData && Array.isArray(caseData.variants) ? caseData.variants : [];
    const variantCapacities = Object.fromEntries(variants.map((variant) => [
      String(variant && variant.id ? variant.id : ''),
      countVariantMatches(variant)
    ]));
    const variantIds = Object.keys(variantCapacities).filter(Boolean).sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
    const variantIdSet = new Set(variantIds);
    const bestPrefixByMatchCount = caseData && caseData.bestPrefixByMatchCount
      ? caseData.bestPrefixByMatchCount
      : {};
    const prefixMetrics = caseData && caseData.prefixMetrics ? caseData.prefixMetrics : {};
    const supportedMatchCounts = [];
    const missingMatchCounts = [];
    const invalidVariantMatchCounts = [];
    const insufficientVariantMatchCounts = [];

    for (let matches = 1; matches <= horizonMatches; matches += 1) {
      const key = String(matches);
      const variantId = String(bestPrefixByMatchCount[key] || '');
      const hasMetrics = Object.prototype.hasOwnProperty.call(prefixMetrics, key);
      if (!variantId || !hasMetrics) missingMatchCounts.push(matches);
      if (variantId && !variantIdSet.has(variantId)) invalidVariantMatchCounts.push(matches);
      if (variantIdSet.has(variantId) && Number(variantCapacities[variantId]) < matches) {
        insufficientVariantMatchCounts.push(matches);
      }
      if (
        variantId
        && hasMetrics
        && variantIdSet.has(variantId)
        && Number(variantCapacities[variantId]) >= matches
      ) {
        supportedMatchCounts.push(matches);
      }
    }

    return {
      templateKey,
      templateLibraryVersion: String(library && library.version ? library.version : ''),
      playersCount: Number(caseData && caseData.players) || 0,
      effectiveCourts: Number(caseData && caseData.courts) || 0,
      horizonMatches,
      variantCount: variantIds.length,
      variantIds,
      variantCapacities,
      supportedMatchCount: supportedMatchCounts.length,
      supportedMatchCounts,
      missingMatchCounts,
      invalidVariantMatchCounts,
      insufficientVariantMatchCounts
    };
  });
}

function inspectScheduleIntegrity(schedule, rosterIds, options = {}) {
  const ids = Array.isArray(rosterIds) ? rosterIds.map((id) => String(id)) : [];
  const rosterSet = new Set(ids);
  const rosterDuplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
    .filter((id, index, list) => list.indexOf(id) === index);
  const errors = [];
  let matchCount = 0;
  let malformedMatchCount = 0;
  let duplicateMemberMatchCount = 0;
  let unknownMemberCount = 0;
  let roundCollisionCount = 0;
  let courtCapacityExceededCount = 0;
  const effectiveCourts = Math.max(0, Number(options.effectiveCourts) || 0);
  const rounds = schedule && Array.isArray(schedule.rounds) ? schedule.rounds : [];

  if (rosterDuplicateIds.length) {
    errors.push({ code: 'duplicate_roster_ids', ids: rosterDuplicateIds });
  }

  rounds.forEach((round, roundIndex) => {
    const matches = round && Array.isArray(round.matches) ? round.matches : [];
    const activeInRound = new Set();
    if (effectiveCourts && matches.length > effectiveCourts) {
      courtCapacityExceededCount += 1;
      errors.push({
        code: 'court_capacity_exceeded',
        roundIndex,
        matches: matches.length,
        effectiveCourts
      });
    }

    matches.forEach((match, matchOffset) => {
      matchCount += 1;
      const teamA = match && Array.isArray(match.teamA) ? match.teamA.map(String) : [];
      const teamB = match && Array.isArray(match.teamB) ? match.teamB.map(String) : [];
      const members = teamA.concat(teamB);
      const uniqueMembers = new Set(members);
      if (teamA.length !== 2 || teamB.length !== 2 || members.length !== 4) {
        malformedMatchCount += 1;
        errors.push({
          code: 'malformed_match_members',
          roundIndex,
          matchOffset,
          teamASize: teamA.length,
          teamBSize: teamB.length
        });
      }
      if (uniqueMembers.size !== members.length) {
        duplicateMemberMatchCount += 1;
        errors.push({ code: 'duplicate_member_in_match', roundIndex, matchOffset });
      }
      const unknownMembers = members.filter((id) => !rosterSet.has(id));
      if (unknownMembers.length) {
        unknownMemberCount += unknownMembers.length;
        errors.push({ code: 'unknown_member', roundIndex, matchOffset, ids: unknownMembers });
      }
      const collisions = [...uniqueMembers].filter((id) => activeInRound.has(id));
      if (collisions.length) {
        roundCollisionCount += 1;
        errors.push({ code: 'same_round_collision', roundIndex, matchOffset, ids: collisions });
      }
      uniqueMembers.forEach((id) => activeInRound.add(id));
    });
  });

  return {
    valid: errors.length === 0,
    errorCount: errors.length,
    matchCount,
    rosterDuplicateIds,
    malformedMatchCount,
    duplicateMemberMatchCount,
    unknownMemberCount,
    roundCollisionCount,
    courtCapacityExceededCount,
    errors
  };
}

function classifyExecutionPath(value = {}) {
  const errorText = String(value.errorMessage || '');
  const engine = String(value.engine || '').toLowerCase();
  const profile = String(value.executionProfile || '').toLowerCase();
  const combined = `${engine} ${profile}`;
  if (errorText || profile === 'error') return 'error';
  if (combined.includes('template')) return 'template';
  if (combined.includes('legacy')) return 'legacy';
  if (combined.includes('beam')) return 'beam';
  if (combined.includes('coverage')) return 'coverage';
  if (combined.includes('fixed-pair')) return 'fixed_pair';
  if (combined.includes('greedy')) return 'greedy';
  return 'other';
}

function buildScenarioRosterIds(scenario) {
  if (!scenario || scenario.mode === 'rotation') {
    return scenarioCommon.makeRotationPlayers(Number(scenario && scenario.playersCount) || 0)
      .map((player) => player.id);
  }
  return scenarioCommon.makeSquadPlayers(
    Number(scenario.squadAPlayers) || 0,
    Number(scenario.squadBPlayers) || 0
  ).map((player) => player.id);
}

function buildRestCounts(ids, playCounts, totalRounds) {
  const rounds = Math.max(0, Number(totalRounds) || 0);
  return Object.fromEntries(ids.map((id) => [id, Math.max(0, rounds - (Number(playCounts[id]) || 0))]));
}

function scheduleDigest(schedule) {
  const rounds = schedule && Array.isArray(schedule.rounds) ? schedule.rounds : [];
  const normalized = rounds.map((round) => (round && Array.isArray(round.matches) ? round.matches : []).map((match) => ({
    teamA: match && Array.isArray(match.teamA) ? match.teamA.map(String) : [],
    teamB: match && Array.isArray(match.teamB) ? match.teamB.map(String) : []
  })));
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function buildScenarioObservation(result) {
  const scenario = result && result.scenario ? result.scenario : {};
  const out = result && result.out ? result.out : { rounds: [], schedulerMeta: {} };
  const meta = out.schedulerMeta && typeof out.schedulerMeta === 'object' ? out.schedulerMeta : {};
  const ids = buildScenarioRosterIds(scenario);
  const matches = scenarioCommon.collectMatches(out);
  const playCounts = scenarioCommon.computePlayCounts(matches, ids);
  const playCountValues = Object.values(playCounts);
  const computedPlaySpread = scenarioCommon.computeSpread(playCountValues);
  const totalRounds = Math.max(0, Number(result && result.totalRounds) || (out.rounds || []).length);
  const restCounts = buildRestCounts(ids, playCounts, totalRounds);
  const playersCount = ids.length;
  const totalMatches = Math.max(0, Number(scenario.totalMatches) || 0);
  const actualMatches = matches.length;
  const isRotation = !scenario.mode || scenario.mode === 'rotation';
  const requestedCourts = Math.max(1, Number(scenario.courts) || 1);
  const effectiveCourts = Math.max(1, Number(result && result.effectiveCourts) || Number(meta.effectiveCourts) || requestedCourts);
  const configuredRuntimeBudget = Number(scenario.options && scenario.options.runtimeBudgetMs);
  const requestedRuntimeBudgetMs = Number.isFinite(configuredRuntimeBudget)
    ? configuredRuntimeBudget
    : null;
  const effectiveRuntimeBudgetMs = isRotation
    ? Math.max(600, requestedRuntimeBudgetMs === null ? 2500 : requestedRuntimeBudgetMs)
    : null;
  const playCountTotal = playCountValues.reduce((sum, count) => sum + (Number(count) || 0), 0);
  const expectedPlayerAppearances = actualMatches * 4;
  const appearanceConserved = playCountTotal === expectedPlayerAppearances;
  const equalPlayMathematicallyPossible = isRotation && playersCount > 0
    ? ((4 * totalMatches) % playersCount === 0)
    : null;
  const equalPlayAchieved = isRotation ? (computedPlaySpread === 0 && appearanceConserved) : null;
  const engine = String(result && result.engine ? result.engine : meta.engine || '');
  const executionProfile = String(result && result.executionProfile ? result.executionProfile : meta.executionProfile || '');
  const errorMessage = String(result && result.errorMessage ? result.errorMessage : '');
  const integrity = inspectScheduleIntegrity(out, ids, { effectiveCourts });
  const theoreticalPlaySpread = isRotation && playersCount > 0
    ? scenarioCommon.theoreticalPlaySpread(playersCount, totalMatches)
    : null;

  return {
    scenarioId: String(scenario.id || ''),
    scenarioName: String(scenario.name || ''),
    mode: isRotation ? 'multi_rotate' : 'squad_doubles',
    kind: String(scenario.kind || ''),
    caseKey: String(scenario.caseKey || ''),
    playersCount,
    requestedCourts,
    effectiveCourts,
    requestedRuntimeBudgetMs,
    effectiveRuntimeBudgetMs,
    totalMatches,
    actualMatches,
    totalRounds,
    engine,
    engineVersion: String(meta.engineVersion || ''),
    executionProfile,
    pathClass: classifyExecutionPath({ engine, executionProfile, errorMessage }),
    templateKey: String(result && result.templateKey ? result.templateKey : meta.templateKey || ''),
    templateVariantId: String(meta.templateVariantId || ''),
    templateHorizon: Number(meta.templateHorizon) || 0,
    fallbackReason: String(result && result.fallbackReason ? result.fallbackReason : meta.fallbackReason || ''),
    timeoutGuardTriggered: Boolean(result && result.timeoutGuardTriggered),
    seed: Number(out.seed) || 0,
    searchElapsedMs: Number(result && result.searchElapsedMs),
    localAlgorithmMs: Number(result && result.elapsedMs) || 0,
    fairnessScore: Number(result && result.fairnessScore) || 0,
    theoreticalPlaySpread,
    playSpread: computedPlaySpread,
    playSpreadExcess: Number.isFinite(theoreticalPlaySpread)
      ? Math.max(0, computedPlaySpread - theoreticalPlaySpread)
      : null,
    equalPlayMathematicallyPossible,
    equalPlayAchieved,
    playCounts,
    playCountTotal,
    expectedPlayerAppearances,
    appearanceConserved,
    restCounts,
    restCountSpread: scenarioCommon.computeSpread(Object.values(restCounts)),
    maxRestStreak: Number(result && result.maxRestStreak) || 0,
    maxConsecutivePlay: Number(result && result.computedMaxConsecutivePlay) || Number(result && result.maxConsecutivePlay) || 0,
    uniqueExactMatchupCount: Number(result && result.computedUniqueExactMatchupCount) || Number(result && result.uniqueExactMatchupCount) || 0,
    exactRepeatCount: Number(result && result.exactRepeatCount) || 0,
    exactRepeatBaseline: Number(result && result.exactRepeatBaseline) || 0,
    exactRepeatExcess: Number(result && result.exactRepeatExcess) || 0,
    uniquePartnerPairs: Number(result && result.uniquePartnerPairs) || 0,
    uniqueOpponentPairs: Number(result && result.uniqueOpponentPairs) || 0,
    partnerRepeats: Number(result && result.partnerRepeats) || 0,
    opponentRepeats: Number(result && result.opponentRepeats) || 0,
    partnerRepeatBaseline: Number(result && result.partnerRepeatBaseline) || 0,
    opponentRepeatBaseline: Number(result && result.opponentRepeatBaseline) || 0,
    partnerRepeatExcess: Number(result && result.partnerRepeatExcess) || 0,
    opponentRepeatExcess: Number(result && result.opponentRepeatExcess) || 0,
    partnerCoveragePct: Number(result && result.partnerCoveragePct) || 0,
    opponentCoveragePct: Number(result && result.opponentCoveragePct) || 0,
    scheduleDigest: scheduleDigest(out),
    integrity,
    warnings: Array.isArray(result && result.warnings) ? result.warnings : [],
    failures: Array.isArray(result && result.failures) ? result.failures : [],
    errorMessage
  };
}

function buildCourtNormalizationScenarios(library = templateLibrary) {
  const cases = library && library.cases ? library.cases : {};
  return range(4, 24).flatMap((playersCount) => range(1, 4).map((requestedCourts) => {
    const expectedEffectiveCourts = computeEffectiveCourts(playersCount, requestedCourts);
    const expectedTemplateKey = `${playersCount}p-${expectedEffectiveCourts}c`;
    const templateCase = cases[expectedTemplateKey] || {};
    const totalMatches = Math.max(1, Math.min(12, Number(templateCase.horizonMatches) || 1));
    return {
      id: `rotation-court-normalization-${playersCount}p-${requestedCourts}requested-${expectedEffectiveCourts}effective`,
      name: `rotation court normalization ${playersCount}p/${totalMatches}m/${requestedCourts}c requested`,
      mode: 'rotation',
      kind: 'rotation_court_normalization',
      caseKey: expectedTemplateKey,
      playersCount,
      femaleCount: 0,
      totalMatches,
      targetMatches: totalMatches,
      courts: requestedCourts,
      options: { seed: 7 },
      maxElapsedMs: scenarioCommon.TEMPLATE_FAST_BOUND_MS,
      expectTemplate: true,
      expectedTemplateKey,
      expectedEffectiveCourts,
      expectedPlaySpread: scenarioCommon.theoreticalPlaySpread(playersCount, totalMatches)
    };
  }));
}

function buildOutOfTemplateScenarios() {
  return [
    {
      id: 'rotation-outside-template-20p-5c',
      name: 'rotation outside template band 20p/12m/5c',
      playersCount: 20,
      totalMatches: 12,
      courts: 5,
      expectedEffectiveCourts: 5,
      runtimeBudgetMs: 600
    },
    {
      id: 'rotation-outside-template-24p-6c',
      name: 'rotation outside template band 24p/12m/6c',
      playersCount: 24,
      totalMatches: 12,
      courts: 6,
      expectedEffectiveCourts: 6,
      runtimeBudgetMs: 600
    },
    {
      id: 'rotation-outside-template-24p-6c-legacy-window',
      name: 'rotation outside template band 24p/12m/6c legacy window',
      playersCount: 24,
      totalMatches: 12,
      courts: 6,
      expectedEffectiveCourts: 6,
      runtimeBudgetMs: 800
    },
    {
      id: 'rotation-outside-template-25p-4c',
      name: 'rotation outside roster template band 25p/12m/4c',
      playersCount: 25,
      totalMatches: 12,
      courts: 4,
      expectedEffectiveCourts: 4,
      runtimeBudgetMs: 600
    }
  ].map((entry) => ({
    ...entry,
    mode: 'rotation',
    kind: 'rotation_out_of_template',
    caseKey: `${entry.playersCount}p-${entry.expectedEffectiveCourts}c`,
    femaleCount: 0,
    targetMatches: entry.totalMatches,
    options: { seed: 7, searchSeeds: 1, runtimeBudgetMs: entry.runtimeBudgetMs },
    maxElapsedMs: scenarioCommon.ROTATION_LONGTAIL_BOUND_MS
  }));
}

function runObservedScenario(scenario) {
  try {
    const result = scenarioCommon.runScenario(scenario);
    const evaluation = scenarioCommon.evaluateScenario(result);
    return buildScenarioObservation({
      ...result,
      warnings: evaluation.warnings,
      failures: evaluation.failures
    });
  } catch (error) {
    const playersCount = Number(scenario && scenario.playersCount) || 0;
    const configuredRuntimeBudget = Number(scenario && scenario.options && scenario.options.runtimeBudgetMs);
    const requestedRuntimeBudgetMs = Number.isFinite(configuredRuntimeBudget)
      ? configuredRuntimeBudget
      : null;
    return {
      scenarioId: String(scenario && scenario.id ? scenario.id : ''),
      scenarioName: String(scenario && scenario.name ? scenario.name : ''),
      mode: 'multi_rotate',
      kind: String(scenario && scenario.kind ? scenario.kind : ''),
      caseKey: String(scenario && scenario.caseKey ? scenario.caseKey : ''),
      playersCount,
      requestedCourts: Math.max(1, Number(scenario && scenario.courts) || 1),
      effectiveCourts: playersCount >= 4
        ? computeEffectiveCourts(playersCount, Number(scenario && scenario.courts) || 1)
        : 0,
      requestedRuntimeBudgetMs,
      effectiveRuntimeBudgetMs: Math.max(600, requestedRuntimeBudgetMs === null ? 2500 : requestedRuntimeBudgetMs),
      totalMatches: Number(scenario && scenario.totalMatches) || 0,
      actualMatches: 0,
      engine: '',
      engineVersion: '',
      executionProfile: 'error',
      pathClass: 'error',
      templateKey: '',
      fallbackReason: error && error.message ? String(error.message) : 'unknown error',
      errorMessage: error && error.message ? String(error.message) : 'unknown error',
      integrity: { valid: false, errorCount: 1, errors: [{ code: 'runtime_error' }] },
      warnings: [],
      failures: [{ code: 'runtime_error', message: error && error.message ? String(error.message) : 'unknown error' }]
    };
  }
}

function buildInvalidInputProbeRecords() {
  const duplicatePlayers = scenarioCommon.makeRotationPlayers(4);
  duplicatePlayers[3] = { ...duplicatePlayers[3], id: duplicatePlayers[2].id };
  const probes = [
    {
      id: 'invalid-less-than-four-players',
      label: '3 players cannot form a doubles match',
      errorClass: 'insufficient_roster',
      players: scenarioCommon.makeRotationPlayers(3),
      totalMatches: 1,
      courts: 1
    },
    {
      id: 'invalid-duplicate-player-id',
      label: 'duplicate roster ids are rejected',
      errorClass: 'duplicate_roster',
      players: duplicatePlayers,
      totalMatches: 1,
      courts: 1
    }
  ];

  return probes.map((probe) => {
    try {
      const out = generateSchedule(probe.players, probe.totalMatches, probe.courts, { seed: 7 });
      return {
        scenarioId: probe.id,
        scenarioName: probe.label,
        kind: 'invalid_input_probe',
        playersCount: probe.players.length,
        requestedCourts: probe.courts,
        totalMatches: probe.totalMatches,
        pathClass: classifyExecutionPath(out.schedulerMeta || {}),
        outcome: 'unexpected_schedule',
        errorClass: probe.errorClass,
        errorMessage: ''
      };
    } catch (error) {
      return {
        scenarioId: probe.id,
        scenarioName: probe.label,
        mode: 'multi_rotate',
        kind: 'invalid_input_probe',
        playersCount: probe.players.length,
        requestedCourts: probe.courts,
        effectiveCourts: probe.players.length >= 4
          ? computeEffectiveCourts(probe.players.length, probe.courts)
          : 0,
        totalMatches: probe.totalMatches,
        actualMatches: 0,
        engine: '',
        engineVersion: '',
        executionProfile: 'error',
        pathClass: 'error',
        templateKey: '',
        fallbackReason: error && error.message ? String(error.message) : 'unknown error',
        outcome: 'no_legal_result',
        errorClass: probe.errorClass,
        errorMessage: error && error.message ? String(error.message) : 'unknown error'
      };
    }
  });
}

function summarizePathCounts(rows) {
  const counts = {};
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = String(row && row.pathClass ? row.pathClass : 'other');
    counts[key] = (counts[key] || 0) + 1;
  });
  const sortedCounts = Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, 'en')));
  const total = Array.isArray(rows) ? rows.length : 0;
  const classified = Object.values(sortedCounts).reduce((sum, count) => sum + count, 0);
  return {
    total,
    classified,
    conserved: total === classified,
    counts: sortedCounts
  };
}

function summarizePathStabilityRuns(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const pathCounts = summarizePathCounts(list).counts;
  const profileCounts = {};
  const fallbackReasonCounts = {};
  list.forEach((row) => {
    const profile = String(row && row.executionProfile ? row.executionProfile : '<empty>');
    const reason = String(row && row.fallbackReason ? row.fallbackReason : '<empty>');
    profileCounts[profile] = (profileCounts[profile] || 0) + 1;
    fallbackReasonCounts[reason] = (fallbackReasonCounts[reason] || 0) + 1;
  });
  const observedPathClasses = Object.keys(pathCounts).sort((left, right) => left.localeCompare(right, 'en'));
  return {
    runs: list.length,
    stablePath: observedPathClasses.length <= 1,
    observedPathClasses,
    pathCounts,
    profileCounts: Object.fromEntries(Object.entries(profileCounts).sort(([left], [right]) => left.localeCompare(right, 'en'))),
    fallbackReasonCounts: Object.fromEntries(Object.entries(fallbackReasonCounts).sort(([left], [right]) => left.localeCompare(right, 'en'))),
    successfulRuns: list.filter((row) => row.pathClass !== 'error').length,
    errorRuns: list.filter((row) => row.pathClass === 'error').length
  };
}

function runPathStabilityAudit(scenarios, repeats = 5) {
  const normalizedRepeats = Math.max(2, Math.floor(Number(repeats) || 5));
  return (Array.isArray(scenarios) ? scenarios : []).map((scenario) => {
    const results = range(1, normalizedRepeats).map(() => runObservedScenario(scenario));
    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      playersCount: scenario.playersCount,
      requestedCourts: scenario.courts,
      expectedEffectiveCourts: scenario.expectedEffectiveCourts,
      requestedRuntimeBudgetMs: scenario.options && scenario.options.runtimeBudgetMs,
      summary: summarizePathStabilityRuns(results),
      results
    };
  });
}

function roundMs(value) {
  return Number((Number(value) || 0).toFixed(3));
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return 0;
  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * ratio) - 1));
  return sortedValues[index];
}

function summarizeDurations(values) {
  const sorted = (Array.isArray(values) ? values : [])
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!sorted.length) {
    return { samples: 0, minMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0 };
  }
  return {
    samples: sorted.length,
    minMs: roundMs(sorted[0]),
    medianMs: roundMs(percentile(sorted, 0.5)),
    p95Ms: roundMs(percentile(sorted, 0.95)),
    maxMs: roundMs(sorted[sorted.length - 1])
  };
}

function extractTimingPhaseFields(source) {
  const text = String(source || '');
  const phases = {};
  const logPattern = /console\.info\(\s*['"]\[startTournament:timing\]['"]\s*,\s*JSON\.stringify\(\s*\{([\s\S]*?)\}\s*\)\s*\)/g;
  let match = logPattern.exec(text);
  while (match) {
    const body = match[1];
    const phaseMatch = body.match(/\bphase\s*:\s*['"]([^'"]+)['"]/);
    if (phaseMatch) {
      const fields = new Set();
      const propertyPattern = /(?:^|,|\n)\s*([A-Za-z_$][\w$]*)\s*(?=:|,|\n|$)/g;
      let propertyMatch = propertyPattern.exec(body);
      while (propertyMatch) {
        fields.add(propertyMatch[1]);
        propertyMatch = propertyPattern.exec(body);
      }
      phases[phaseMatch[1]] = [...fields].sort((left, right) => left.localeCompare(right, 'en'));
    }
    match = logPattern.exec(text);
  }
  return phases;
}

function buildTimingFieldAudit(source) {
  const phases = extractTimingPhaseFields(source);
  const doneFields = new Set(phases.done || []);
  const fieldRows = DONE_TIMING_FIELDS.map((field) => ({
    field,
    presentInPhases: Object.entries(phases)
      .filter(([, fields]) => fields.includes(field))
      .map(([phase]) => phase)
      .sort((left, right) => left.localeCompare(right, 'en')),
    presentInDone: doneFields.has(field)
  }));
  return {
    phases,
    requiredDoneFields: DONE_TIMING_FIELDS.slice(),
    missingDoneFields: DONE_TIMING_FIELDS.filter((field) => !doneFields.has(field)),
    fields: fieldRows
  };
}

function isPopulatedMetaValue(value) {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

function describeSchedulerMeta(mode, output) {
  const meta = output && output.schedulerMeta && typeof output.schedulerMeta === 'object'
    ? output.schedulerMeta
    : {};
  const fields = [
    'engineVersion',
    'engine',
    'executionProfile',
    'templateKey',
    'fallbackReason',
    'searchElapsedMs',
    'effectiveCourts'
  ];
  return {
    mode,
    fields: Object.fromEntries(fields.map((field) => [field, {
      present: Object.prototype.hasOwnProperty.call(meta, field),
      populated: isPopulatedMetaValue(meta[field]),
      value: meta[field] ?? null
    }]))
  };
}

function buildSchedulerMetaModeAudit() {
  const rotationOutput = generateSchedule(scenarioCommon.makeRotationPlayers(8), 8, 2, { seed: 7 });
  const squadOutput = buildSquadSchedule(
    scenarioCommon.makeSquadPlayers(4, 4),
    12,
    1,
    { endCondition: { type: 'total_matches', target: 12 }, _seed: 1 }
  );
  const fixedPlayers = [];
  const pairTeams = [];
  for (let index = 0; index < 4; index += 1) {
    const firstId = `F${index * 2 + 1}`;
    const secondId = `F${index * 2 + 2}`;
    fixedPlayers.push({ id: firstId, name: firstId }, { id: secondId, name: secondId });
    pairTeams.push({
      id: `fixed-team-${index + 1}`,
      name: `Fixed Team ${index + 1}`,
      playerIds: [firstId, secondId]
    });
  }
  const fixedOutput = buildFixedPairSchedule(fixedPlayers, 2, pairTeams, { totalMatches: 6 });

  return [
    describeSchedulerMeta('multi_rotate', rotationOutput),
    describeSchedulerMeta('squad_doubles', squadOutput),
    describeSchedulerMeta('fixed_pair_rr', fixedOutput)
  ];
}

function buildBenchmarkScenarios() {
  const templateScenarios = [
    { playersCount: 6, totalMatches: 12, courts: 1 },
    { playersCount: 16, totalMatches: 12, courts: 4 },
    { playersCount: 24, totalMatches: 12, courts: 2 }
  ].map((entry) => ({
    id: `benchmark-template-${entry.playersCount}p-${entry.totalMatches}m-${entry.courts}c`,
    name: `template ${entry.playersCount}p/${entry.totalMatches}m/${entry.courts}c`,
    mode: 'rotation',
    kind: 'benchmark_template',
    caseKey: `${entry.playersCount}p-${entry.courts}c`,
    playersCount: entry.playersCount,
    femaleCount: 0,
    totalMatches: entry.totalMatches,
    targetMatches: entry.totalMatches,
    courts: entry.courts,
    options: { seed: 7 },
    maxElapsedMs: scenarioCommon.TEMPLATE_FAST_BOUND_MS,
    expectTemplate: true,
    expectedTemplateKey: `${entry.playersCount}p-${entry.courts}c`,
    expectedPlaySpread: scenarioCommon.theoreticalPlaySpread(entry.playersCount, entry.totalMatches)
  }));
  return templateScenarios.concat(scenarioCommon.buildRotationLongTailAuditScenarios().map((scenario) => ({
    ...scenario,
    id: `benchmark-${scenario.id}`,
    name: scenario.name.replace(/^rotation longtail /, 'beam '),
    kind: 'benchmark_dynamic'
  })));
}

function qualityDigest(record) {
  return crypto.createHash('sha256').update(JSON.stringify({
    actualMatches: record.actualMatches,
    playCounts: record.playCounts,
    playSpread: record.playSpread,
    maxConsecutivePlay: record.maxConsecutivePlay,
    partnerRepeats: record.partnerRepeats,
    opponentRepeats: record.opponentRepeats,
    restCounts: record.restCounts,
    engine: record.engine,
    executionProfile: record.executionProfile,
    templateKey: record.templateKey,
    fallbackReason: record.fallbackReason
  })).digest('hex');
}

function benchmarkScenario(scenario, repeats, warmups) {
  const normalizedRepeats = Math.max(2, Math.floor(Number(repeats) || DEFAULT_BENCHMARK_REPEATS));
  const normalizedWarmups = Math.max(0, Math.floor(Number(warmups) || 0));
  for (let index = 0; index < normalizedWarmups; index += 1) {
    scenarioCommon.runScenario(scenario);
  }

  const sampleMs = [];
  const records = [];
  for (let index = 0; index < normalizedRepeats; index += 1) {
    const startedAt = performance.now();
    const result = scenarioCommon.runScenario(scenario);
    const duration = performance.now() - startedAt;
    sampleMs.push(roundMs(duration));
    records.push(buildScenarioObservation(result));
  }
  const pathClasses = [...new Set(records.map((record) => record.pathClass))];
  const qualityDigests = [...new Set(records.map(qualityDigest))];
  const scheduleDigests = [...new Set(records.map((record) => record.scheduleDigest))];
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    kind: scenario.kind,
    playersCount: Number(scenario.playersCount) || 0,
    requestedCourts: Number(scenario.courts) || 0,
    totalMatches: Number(scenario.totalMatches) || 0,
    requestedRuntimeBudgetMs: records[0] ? records[0].requestedRuntimeBudgetMs : null,
    effectiveRuntimeBudgetMs: records[0] ? records[0].effectiveRuntimeBudgetMs : null,
    warmups: normalizedWarmups,
    repeats: normalizedRepeats,
    timer: 'node:perf_hooks.performance.now',
    pathClass: pathClasses.length === 1 ? pathClasses[0] : 'mixed',
    engine: records[0] ? records[0].engine : '',
    executionProfile: records[0] ? records[0].executionProfile : '',
    templateKey: records[0] ? records[0].templateKey : '',
    fallbackReason: records[0] ? records[0].fallbackReason : '',
    sampleMs,
    duration: summarizeDurations(sampleMs),
    deterministicQuality: qualityDigests.length === 1,
    deterministicSchedule: scheduleDigests.length === 1,
    qualityDigestCount: qualityDigests.length,
    scheduleDigestCount: scheduleDigests.length,
    integrityFailures: records.filter((record) => !record.integrity.valid).length
  };
}

function summarizeBenchmarkGroups(rows) {
  const grouped = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = String(row.pathClass || 'other');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(...(row.sampleMs || []));
  });
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([pathClass, samples]) => ({ pathClass, ...summarizeDurations(samples) }));
}

function buildTemplateDeterminismRows(matrix) {
  return (Array.isArray(matrix) ? matrix : []).map((entry) => {
    const totalMatches = entry.horizonMatches;
    const buildScenario = (seed) => ({
      id: `determinism-${entry.templateKey}-${seed}`,
      name: `determinism ${entry.templateKey}@${totalMatches} seed=${seed}`,
      mode: 'rotation',
      kind: 'template_determinism',
      caseKey: entry.templateKey,
      playersCount: entry.playersCount,
      femaleCount: 0,
      totalMatches,
      targetMatches: totalMatches,
      courts: entry.effectiveCourts,
      options: { seed },
      maxElapsedMs: scenarioCommon.TEMPLATE_FAST_BOUND_MS,
      expectTemplate: true,
      expectedTemplateKey: entry.templateKey,
      expectedPlaySpread: scenarioCommon.theoreticalPlaySpread(entry.playersCount, totalMatches)
    });
    const first = buildScenarioObservation(scenarioCommon.runScenario(buildScenario(7)));
    const second = buildScenarioObservation(scenarioCommon.runScenario(buildScenario(7)));
    const alternate = buildScenarioObservation(scenarioCommon.runScenario(buildScenario(17)));
    return {
      templateKey: entry.templateKey,
      totalMatches,
      sameSeedReproducible: first.scheduleDigest === second.scheduleDigest,
      sameSeedQualityStable: qualityDigest(first) === qualityDigest(second),
      crossSeedRouteStable: first.pathClass === alternate.pathClass && alternate.pathClass === 'template',
      crossSeedTemplateKeyStable: first.templateKey === alternate.templateKey && alternate.templateKey === entry.templateKey,
      crossSeedScheduleSame: first.scheduleDigest === alternate.scheduleDigest,
      seed7VariantId: first.templateVariantId,
      seed17VariantId: alternate.templateVariantId,
      integrityValid: first.integrity.valid && second.integrity.valid && alternate.integrity.valid
    };
  });
}

function getGitMetadata() {
  function runGit(args) {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  }
  return {
    head: runGit(['rev-parse', '--short', 'HEAD']),
    branch: runGit(['branch', '--show-current']),
    dirty: Boolean(runGit(['status', '--short']))
  };
}

function getRuntimeEnvironment(repeats, warmups) {
  const cpus = os.cpus();
  return {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    osRelease: os.release(),
    cpuModel: cpus[0] ? String(cpus[0].model || '').replace(/\s+/g, ' ').trim() : '',
    logicalCpuCount: cpus.length,
    timer: 'node:perf_hooks.performance.now',
    benchmarkRepeats: repeats,
    benchmarkWarmups: warmups
  };
}

function buildFairnessSummary(records) {
  const rows = Array.isArray(records) ? records : [];
  const possible = rows.filter((row) => row.equalPlayMathematicallyPossible === true);
  const impossible = rows.filter((row) => row.equalPlayMathematicallyPossible === false);
  return {
    scenarios: rows.length,
    integrityFailureScenarios: rows.filter((row) => !row.integrity.valid).length,
    appearanceConservationFailures: rows.filter((row) => !row.appearanceConserved).length,
    equalPlayMathematicallyPossible: possible.length,
    equalPlayPossibleButNotAchieved: possible.filter((row) => !row.equalPlayAchieved).length,
    equalPlayMathematicallyImpossible: impossible.length,
    impossibleButClaimedEqual: impossible.filter((row) => row.equalPlayAchieved).length,
    playSpreadExcessScenarios: rows.filter((row) => Number(row.playSpreadExcess) > 0).length,
    maxPlaySpread: Math.max(0, ...rows.map((row) => Number(row.playSpread) || 0)),
    maxConsecutivePlay: Math.max(0, ...rows.map((row) => Number(row.maxConsecutivePlay) || 0)),
    maxRestCountSpread: Math.max(0, ...rows.map((row) => Number(row.restCountSpread) || 0)),
    maxPartnerRepeats: Math.max(0, ...rows.map((row) => Number(row.partnerRepeats) || 0)),
    maxOpponentRepeats: Math.max(0, ...rows.map((row) => Number(row.opponentRepeats) || 0))
  };
}

function buildAuditData(options = {}) {
  const repeats = Math.max(2, Math.floor(Number(options.repeats) || DEFAULT_BENCHMARK_REPEATS));
  const warmups = Math.max(0, Math.floor(Number(options.warmups) || DEFAULT_BENCHMARK_WARMUPS));
  const templateMatrix = buildTemplateCoverageMatrix(templateLibrary);
  const templateScenarios = scenarioCommon.buildRotationTemplateAuditScenarios();
  const templateResults = templateScenarios.map(runObservedScenario);
  const courtNormalizationScenarios = buildCourtNormalizationScenarios(templateLibrary);
  const courtNormalizationResults = courtNormalizationScenarios.map(runObservedScenario);
  const dynamicResults = scenarioCommon.buildRotationLongTailAuditScenarios().map(runObservedScenario);
  const outOfTemplateScenarios = buildOutOfTemplateScenarios();
  const outOfTemplatePathStability = runPathStabilityAudit(outOfTemplateScenarios, 5);
  const outOfTemplateResults = outOfTemplatePathStability.map((row) => row.results[0]);
  const invalidInputResults = buildInvalidInputProbeRecords();
  const pathRows = templateResults
    .concat(courtNormalizationResults)
    .concat(dynamicResults)
    .concat(outOfTemplateResults)
    .concat(invalidInputResults);
  const determinismRows = buildTemplateDeterminismRows(templateMatrix);
  const benchmarkRows = buildBenchmarkScenarios().map((scenario) => benchmarkScenario(scenario, repeats, warmups));
  const timingSource = fs.readFileSync(path.join(REPO_ROOT, 'cloudfunctions/startTournament/index.js'), 'utf8');
  const timingFieldAudit = buildTimingFieldAudit(timingSource);
  const templateRegistryIssueCount = templateMatrix.reduce((sum, row) => sum
    + row.missingMatchCounts.length
    + row.invalidVariantMatchCounts.length
    + row.insufficientVariantMatchCounts.length, 0);
  const templateAuditFailureCount = templateResults.filter((row) => (
    row.pathClass !== 'template'
    || row.templateKey !== row.caseKey
    || row.actualMatches !== row.totalMatches
    || !row.integrity.valid
    || !row.appearanceConserved
  )).length;
  const courtNormalizationFailureCount = courtNormalizationResults.filter((row, index) => {
    const scenario = courtNormalizationScenarios[index];
    return row.effectiveCourts !== scenario.expectedEffectiveCourts
      || row.templateKey !== scenario.expectedTemplateKey
      || row.pathClass !== 'template'
      || !row.integrity.valid;
  }).length;
  const legacyObservedValidScenarios = outOfTemplatePathStability
    .filter((row) => Number(row.summary.pathCounts.legacy) > 0).length;
  const legacyObservedValidRuns = outOfTemplatePathStability
    .reduce((sum, row) => sum + (Number(row.summary.pathCounts.legacy) || 0), 0);
  const performanceSummary = {
    scenarios: benchmarkRows.length,
    deterministicScheduleFailures: benchmarkRows.filter((row) => !row.deterministicSchedule).length,
    deterministicQualityFailures: benchmarkRows.filter((row) => !row.deterministicQuality).length,
    integrityFailures: benchmarkRows.reduce((sum, row) => sum + row.integrityFailures, 0)
  };
  const git = getGitMetadata();

  return {
    schemaVersion: 'scheduler-observability-v1',
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedFromHead: git.head,
      branch: git.branch,
      sourceTreeDirtyDuringGeneration: git.dirty,
      templateLibraryVersion: String(templateLibrary.version || ''),
      runtime: getRuntimeEnvironment(repeats, warmups)
    },
    boundaries: {
      productionSchedulerFilesModified: false,
      templatesAddedOrRefreshed: false,
      realTournamentDataRead: false,
      realCloudDataWritten: false,
      cloudFunctionDeployed: false,
      miniProgramPreviewOrUpload: false,
      remoteGitOperation: false
    },
    templateCoverage: {
      summary: {
        templateKeys: templateMatrix.length,
        templateVariants: templateMatrix.reduce((sum, row) => sum + row.variantCount, 0),
        supportedMatchPrefixes: templateMatrix.reduce((sum, row) => sum + row.supportedMatchCount, 0),
        registryIssueCount: templateRegistryIssueCount,
        auditedPrefixScenarios: templateResults.length,
        auditFailureCount: templateAuditFailureCount
      },
      matrix: templateMatrix,
      scenarioResults: templateResults
    },
    pathAudit: {
      summary: summarizePathCounts(pathRows),
      courtNormalization: {
        scenarios: courtNormalizationResults.length,
        failures: courtNormalizationFailureCount,
        results: courtNormalizationResults
      },
      dynamicFallbackResults: dynamicResults,
      outOfTemplateResults,
      outOfTemplatePathStability,
      invalidInputResults,
      legacyPath: {
        observedValidScenarios: legacyObservedValidScenarios,
        observedValidRuns: legacyObservedValidRuns,
        implementationPresent: true,
        conclusion: legacyObservedValidScenarios > 0
          ? `当前有效审计中有 ${legacyObservedValidScenarios} 个场景、${legacyObservedValidRuns} 次运行实际命中 legacy；它是 beam 无可用结果时的保护路径。`
          : '当前有效审计场景未命中 legacy；它仍是 beam 无可用结果时的保护路径，不能据此宣称已移除。'
      }
    },
    fairnessAudit: {
      summary: buildFairnessSummary(templateResults),
      note: '绝对等场仅在 4 × totalMatches % playersCount == 0 时才被视为数学上可能；公平性、重复、连场、轮空与性能分别记录。'
    },
    determinismAudit: {
      summary: {
        templateKeys: determinismRows.length,
        sameSeedScheduleFailures: determinismRows.filter((row) => !row.sameSeedReproducible).length,
        sameSeedQualityFailures: determinismRows.filter((row) => !row.sameSeedQualityStable).length,
        crossSeedRouteFailures: determinismRows.filter((row) => !row.crossSeedRouteStable || !row.crossSeedTemplateKeyStable).length,
        crossSeedScheduleDifferences: determinismRows.filter((row) => !row.crossSeedScheduleSame).length,
        integrityFailures: determinismRows.filter((row) => !row.integrityValid).length
      },
      rows: determinismRows
    },
    performance: {
      scope: {
        localAlgorithm: 'measured',
        materialize: 'not_measured_no_cloud_transaction',
        write: 'not_measured_no_real_cloud_write',
        endToEnd: 'not_measured_no_cloud_invocation',
        note: '本地 benchmark 只测排阵算法；materialize/write/total 只核对生产 timing 字段，未伪装成本地端到端数据。'
      },
      environment: getRuntimeEnvironment(repeats, warmups),
      summary: performanceSummary,
      benchmarks: benchmarkRows,
      groups: summarizeBenchmarkGroups(benchmarkRows)
    },
    timingFieldAudit,
    schedulerMetaModeAudit: buildSchedulerMetaModeAudit(),
    timingSemantics: {
      scheduleMs: '排阵生成加完整性校验；不含此前的 policy/profile 计算。',
      materializeMs: 'round/player 对象物化；idToPlayerMap 在计时开始前。',
      writeMs: '赛事更新及可选 client request log；不含 transaction callback 返回后的工作。',
      totalMs: '截至 transaction callback 内写入完成；不含后置分享消息更新，因此不是严格云函数端到端。',
      failureSampling: '去重提前返回、排阵异常与写入异常没有统一 done timing，生产分布存在成功样本偏差。'
    },
    p01CoverageMapping: {
      status: 'pending_p01_pareto',
      source: null,
      combinations: [],
      conclusion: '工作线 01 的脱敏组合 Pareto 尚未提供；本轮只完成现状矩阵，不新增或刷新模板。'
    },
    recommendations: [
      '收到工作线 01 的 mode × playersCount × courts × totalMatches Pareto 后，直接与 templateCoverage.matrix 做覆盖映射。',
      '若要在生产日志计算 engine/version/fallback 分布，另行审批后最小补充 engineVersion、fallbackReason、searchElapsedMs；本任务不修改生产文件。',
      '将超过模板 horizon 的 dynamic 场景作为 beam/guarded 回归基线，不再用实际命中模板的场景冒充 fallback。',
      '动态路径受真实时钟 deadline 影响；性能采样中若同 seed 的排阵或质量 digest 不一致，只作为负载敏感风险，不据此改写确定性公平性结论。',
      `legacy 是有效安全路径，本轮有 ${legacyObservedValidScenarios} 个场景、${legacyObservedValidRuns} 次运行命中；后续若修改 fallback 政策，需单独审批和回归。`
    ]
  };
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function markdownTable(columns, rows) {
  const header = `| ${columns.map((column) => escapeCell(column.label)).join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = (rows.length ? rows : [{ empty: 'none' }]).map((row) => (
    `| ${columns.map((column) => escapeCell(row[column.key] ?? '')).join(' | ')} |`
  ));
  return [header, separator, ...body].join('\n');
}

function renderMarkdown(report) {
  const templateSummary = report.templateCoverage.summary;
  const fairness = report.fairnessAudit.summary;
  const determinism = report.determinismAudit.summary;
  const pathSummary = report.pathAudit.summary;
  const timingRows = report.timingFieldAudit.fields.map((row) => ({
    field: row.field,
    phases: row.presentInPhases.join(', ') || 'none',
    done: row.presentInDone ? 'yes' : 'no'
  }));
  const modeMetaRows = report.schedulerMetaModeAudit.flatMap((modeRow) => Object.entries(modeRow.fields).map(([field, details]) => ({
    mode: modeRow.mode,
    field,
    present: details.present ? 'yes' : 'no',
    populated: details.populated ? 'yes' : 'no',
    value: details.value === null ? '' : details.value
  })));
  const dynamicRows = report.pathAudit.dynamicFallbackResults.concat(report.pathAudit.outOfTemplateResults).map((row) => ({
    scenario: row.scenarioName,
    path: row.pathClass,
    profile: row.executionProfile,
    fallback: row.fallbackReason || 'none',
    matches: `${row.actualMatches}/${row.totalMatches}`,
    playSpread: row.playSpread,
    budget: `${row.requestedRuntimeBudgetMs ?? 'default'} / ${row.effectiveRuntimeBudgetMs ?? 'n/a'}`,
    integrity: row.integrity.valid ? 'pass' : 'fail'
  }));
  const benchmarkRows = report.performance.benchmarks.map((row) => ({
    scenario: row.scenarioName,
    path: row.pathClass,
    repeats: row.repeats,
    median: row.duration.medianMs,
    p95: row.duration.p95Ms,
    min: row.duration.minMs,
    max: row.duration.maxMs,
    budget: `${row.requestedRuntimeBudgetMs ?? 'default'} / ${row.effectiveRuntimeBudgetMs ?? 'n/a'}`,
    deterministic: row.deterministicSchedule ? 'yes' : 'no'
  }));
  const matrixRows = report.templateCoverage.matrix.map((row) => ({
    key: row.templateKey,
    players: row.playersCount,
    courts: row.effectiveCourts,
    horizon: row.horizonMatches,
    variants: row.variantCount,
    prefixes: row.supportedMatchCount,
    issues: row.missingMatchCounts.length
      + row.invalidVariantMatchCounts.length
      + row.insufficientVariantMatchCounts.length
  }));
  const invalidRows = report.pathAudit.invalidInputResults.map((row) => ({
    scenario: row.scenarioName,
    class: row.errorClass,
    outcome: row.outcome,
    reason: row.errorMessage
  }));
  const pathStabilityRows = report.pathAudit.outOfTemplatePathStability.map((row) => ({
    scenario: row.scenarioName,
    runs: row.summary.runs,
    budget: row.requestedRuntimeBudgetMs,
    paths: JSON.stringify(row.summary.pathCounts),
    profiles: JSON.stringify(row.summary.profileCounts),
    reasons: JSON.stringify(row.summary.fallbackReasonCounts),
    stable: row.summary.stablePath ? 'yes' : 'no'
  }));

  return [
    '# 工作线 02：排阵观测与模板覆盖审计证据',
    '',
    `- 生成时间：\`${report.metadata.generatedAt}\``,
    `- 分支 / 基线：\`${report.metadata.branch}@${report.metadata.generatedFromHead}\``,
    `- 模板库：\`${report.metadata.templateLibraryVersion}\``,
    `- 运行环境：\`${report.metadata.runtime.nodeVersion} / ${report.metadata.runtime.platform} ${report.metadata.runtime.architecture}\``,
    '',
    '## 结论',
    '',
    `当前树实时枚举到 ${templateSummary.templateKeys} 个模板键、${templateSummary.templateVariants} 个模板 variant、${templateSummary.supportedMatchPrefixes} 个连续场数前缀；注册表问题 ${templateSummary.registryIssueCount}，模板路径审计失败 ${templateSummary.auditFailureCount}。本轮没有新增或刷新模板，也没有改变任何生产排阵行为。`,
    '',
    `路径分类共 ${pathSummary.total} 条，分类守恒：${pathSummary.conserved ? '是' : '否'}；计数为 \`${JSON.stringify(pathSummary.counts)}\`。有效长尾场景均进入 beam guarded 路径；legacy 实现存在，但本轮有效场景命中数为 ${report.pathAudit.legacyPath.observedValidScenarios}。`,
    '',
    '## 模板覆盖矩阵',
    '',
    markdownTable([
      { key: 'key', label: 'templateKey' },
      { key: 'players', label: 'players' },
      { key: 'courts', label: 'effectiveCourts' },
      { key: 'horizon', label: 'horizonMatches' },
      { key: 'variants', label: 'variants' },
      { key: 'prefixes', label: 'supported prefixes' },
      { key: 'issues', label: 'issues' }
    ], matrixRows),
    '',
    `场地降级矩阵覆盖 ${report.pathAudit.courtNormalization.scenarios} 个 \`playersCount × requestedCourts\` 组合，失败 ${report.pathAudit.courtNormalization.failures}。完整逐前缀与逐人数据见同名 JSON。`,
    '',
    '## fallback 与无合法结果',
    '',
    markdownTable([
      { key: 'scenario', label: 'scenario' },
      { key: 'path', label: 'path' },
      { key: 'profile', label: 'executionProfile' },
      { key: 'fallback', label: 'fallbackReason' },
      { key: 'matches', label: 'matches' },
      { key: 'playSpread', label: 'playSpread' },
      { key: 'budget', label: 'runtime budget requested / effective ms' },
      { key: 'integrity', label: 'integrity' }
    ], dynamicRows),
    '',
    '带外路径重复采样（保留同输入出现不同 deadline 结果的事实）：',
    '',
    markdownTable([
      { key: 'scenario', label: 'scenario' },
      { key: 'runs', label: 'runs' },
      { key: 'budget', label: 'requested budget ms' },
      { key: 'paths', label: 'path counts' },
      { key: 'profiles', label: 'profile counts' },
      { key: 'reasons', label: 'fallback reason counts' },
      { key: 'stable', label: 'stable path' }
    ], pathStabilityRows),
    '',
    markdownTable([
      { key: 'scenario', label: 'invalid input' },
      { key: 'class', label: 'error class' },
      { key: 'outcome', label: 'outcome' },
      { key: 'reason', label: 'reason' }
    ], invalidRows),
    '',
    '## 完整性与公平性',
    '',
    `- 模板前缀场景：${fairness.scenarios}；完整性错误场景：${fairness.integrityFailureScenarios}；\`Σplays = 4 × matches\` 失败：${fairness.appearanceConservationFailures}。`,
    `- 数学上可绝对等场：${fairness.equalPlayMathematicallyPossible}；可等场但未达成：${fairness.equalPlayPossibleButNotAchieved}。`,
    `- 数学上不可绝对等场：${fairness.equalPlayMathematicallyImpossible}；错误宣称等场：${fairness.impossibleButClaimedEqual}。`,
    `- 最大 playSpread / 连场 / 轮空差：${fairness.maxPlaySpread} / ${fairness.maxConsecutivePlay} / ${fairness.maxRestCountSpread}。搭档与对手重复独立记录，不以 fairnessScore 替代。`,
    '',
    `同 seed 排阵复现失败 ${determinism.sameSeedScheduleFailures}/${determinism.templateKeys}；同 seed 质量失败 ${determinism.sameSeedQualityFailures}/${determinism.templateKeys}；跨 seed 模板路由失败 ${determinism.crossSeedRouteFailures}/${determinism.templateKeys}；跨 seed 排阵内容不同 ${determinism.crossSeedScheduleDifferences}/${determinism.templateKeys}。`,
    '',
    '## 本地性能基线',
    '',
    `计时器 \`${report.performance.environment.timer}\`，每个场景 warmup=${report.performance.environment.benchmarkWarmups}、repeats=${report.performance.environment.benchmarkRepeats}。公平性结论来自确定性审计，不用墙钟快慢替代。`,
    '',
    markdownTable([
      { key: 'scenario', label: 'scenario' },
      { key: 'path', label: 'path' },
      { key: 'repeats', label: 'N' },
      { key: 'median', label: 'median ms' },
      { key: 'p95', label: 'P95 ms' },
      { key: 'min', label: 'min ms' },
      { key: 'max', label: 'max ms' },
      { key: 'budget', label: 'runtime budget requested / effective ms' },
      { key: 'deterministic', label: 'same schedule' }
    ], benchmarkRows),
    '',
    `真实性能采样中，同 seed 排阵 digest 变化 ${report.performance.summary.deterministicScheduleFailures}/${report.performance.summary.scenarios}，质量 digest 变化 ${report.performance.summary.deterministicQualityFailures}/${report.performance.summary.scenarios}。这反映动态 deadline 的负载敏感性；模板公平性结论来自独立确定性审计，不由墙钟样本改写。`,
    '',
    '本地只测算法。`materializeMs`、`writeMs`、`totalMs` 未通过假数据冒充云端端到端耗时；本轮仅核对这些字段在生产 timing 日志中的可用性，未调用云函数、未写真实云数据。',
    '',
    '## timing / meta 字段',
    '',
    markdownTable([
      { key: 'field', label: 'field' },
      { key: 'phases', label: 'present phases' },
      { key: 'done', label: 'present in done' }
    ], timingRows),
    '',
    '字段键存在不代表各 mode 有可聚合值：',
    '',
    markdownTable([
      { key: 'mode', label: 'mode' },
      { key: 'field', label: 'schedulerMeta field' },
      { key: 'present', label: 'present' },
      { key: 'populated', label: 'populated' },
      { key: 'value', label: 'sample value' }
    ], modeMetaRows),
    '',
    `最小观测缺口：\`${report.timingFieldAudit.missingDoneFields.join(', ') || 'none'}\`。其中 schedulerMeta 已有的诊断字段若要进入生产 timing 聚合，应由集成对话另行批准；本任务未修改生产文件。`,
    '',
    `计时语义：schedule=${report.timingSemantics.scheduleMs} materialize=${report.timingSemantics.materializeMs} write=${report.timingSemantics.writeMs} total=${report.timingSemantics.totalMs} ${report.timingSemantics.failureSampling}`,
    '',
    '## 工作线 01 依赖',
    '',
    report.p01CoverageMapping.conclusion,
    '',
    '## 边界确认',
    '',
    '- 未修改 `cloudfunctions/startTournament/**`、模板库、算法、fallback、seed、阈值、赛事规则或任何 UI。',
    '- 未读取真实赛事数据，未写真实云数据，未 preview/upload、发布或部署云函数。',
    '- 未 push、未创建 PR；本证据只属于工作线 02 独立分支。',
    ''
  ].join('\n');
}

function writeEvidence(report, outputDir = DEFAULT_OUTPUT_DIR) {
  const directory = path.resolve(outputDir);
  fs.mkdirSync(directory, { recursive: true });
  const jsonPath = path.join(directory, DEFAULT_JSON_NAME);
  const markdownPath = path.join(directory, DEFAULT_MARKDOWN_NAME);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderMarkdown(report), 'utf8');
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const options = {
    repeats: DEFAULT_BENCHMARK_REPEATS,
    warmups: DEFAULT_BENCHMARK_WARMUPS,
    outputDir: DEFAULT_OUTPUT_DIR
  };
  (Array.isArray(argv) ? argv : []).forEach((arg) => {
    if (arg.startsWith('--repeats=')) options.repeats = Number(arg.slice('--repeats='.length));
    if (arg.startsWith('--warmups=')) options.warmups = Number(arg.slice('--warmups='.length));
    if (arg.startsWith('--output-dir=')) options.outputDir = path.resolve(arg.slice('--output-dir='.length));
  });
  return options;
}

function hasBlockingAuditFailure(report) {
  return report.templateCoverage.summary.registryIssueCount > 0
    || report.templateCoverage.summary.auditFailureCount > 0
    || report.pathAudit.courtNormalization.failures > 0
    || !report.pathAudit.summary.conserved
    || report.fairnessAudit.summary.integrityFailureScenarios > 0
    || report.fairnessAudit.summary.appearanceConservationFailures > 0
    || report.fairnessAudit.summary.equalPlayPossibleButNotAchieved > 0
    || report.fairnessAudit.summary.impossibleButClaimedEqual > 0
    || report.determinismAudit.summary.sameSeedScheduleFailures > 0
    || report.determinismAudit.summary.sameSeedQualityFailures > 0
    || report.determinismAudit.summary.crossSeedRouteFailures > 0
    || report.determinismAudit.summary.integrityFailures > 0
    || report.performance.benchmarks.some((row) => row.integrityFailures > 0);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildAuditData(options);
  const outputs = writeEvidence(report, options.outputDir);
  console.log(`[scheduler-observability] templates=${report.templateCoverage.summary.templateKeys} variants=${report.templateCoverage.summary.templateVariants} prefixes=${report.templateCoverage.summary.supportedMatchPrefixes}`);
  console.log(`[scheduler-observability] paths=${JSON.stringify(report.pathAudit.summary.counts)} conserved=${report.pathAudit.summary.conserved}`);
  console.log(`[scheduler-observability] json=${outputs.jsonPath}`);
  console.log(`[scheduler-observability] markdown=${outputs.markdownPath}`);
  if (hasBlockingAuditFailure(report)) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  DONE_TIMING_FIELDS,
  buildTemplateCoverageMatrix,
  inspectScheduleIntegrity,
  classifyExecutionPath,
  buildScenarioObservation,
  buildCourtNormalizationScenarios,
  buildOutOfTemplateScenarios,
  buildInvalidInputProbeRecords,
  summarizePathCounts,
  summarizePathStabilityRuns,
  runPathStabilityAudit,
  summarizeDurations,
  extractTimingPhaseFields,
  buildTimingFieldAudit,
  buildSchedulerMetaModeAudit,
  buildBenchmarkScenarios,
  benchmarkScenario,
  summarizeBenchmarkGroups,
  buildTemplateDeterminismRows,
  buildFairnessSummary,
  buildAuditData,
  renderMarkdown,
  writeEvidence,
  hasBlockingAuditFailure
};
