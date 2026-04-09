#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  buildTemplateKey,
  buildTemplateLibrary,
  computeEffectiveCourts,
  theoreticalPlaySpread
} = require('../cloudfunctions/startTournament/rotationDoublesEngine');
const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');
const { buildMatchCountRecommendations } = require('../miniprogram/core/ux/capacity');
const {
  MATCH_OPTION_OVERRIDES,
  buildMatchOptionsLibrary,
  buildRecommendationAuditIssues
} = require('./rotation-match-options-common');

const DEFAULT_TEMPLATE_OUTPUT = path.resolve(__dirname, '../cloudfunctions/startTournament/rotation.templates.js');
const DEFAULT_MATCH_OPTIONS_OUTPUT = path.resolve(__dirname, '../miniprogram/core/ux/multiRotateMatchOptions.js');

let existingLibrary = { version: 'missing', cases: {} };
try {
  // eslint-disable-next-line global-require
  existingLibrary = require('../cloudfunctions/startTournament/rotation.templates');
} catch (_) {
  existingLibrary = { version: 'missing', cases: {} };
}

const HANDCRAFTED_CASES = [
  { players: 4, courts: 1, horizonMatches: 3, seed: 1 },
  { players: 5, courts: 1, horizonMatches: 15, seed: 1 },
  { players: 6, courts: 1, horizonMatches: 18, seed: 11 },
  { players: 7, courts: 1, horizonMatches: 18, seed: 19 }
];

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function buildBandCases() {
  return [
    ...range(8, 24).map((players) => ({ players, courts: 1 })),
    ...range(8, 24).map((players) => ({ players, courts: 2 })),
    ...range(12, 24).map((players) => ({ players, courts: 3 })),
    ...range(16, 24).map((players) => ({ players, courts: 4 }))
  ];
}

function seedFor(players, courts) {
  return 97 + (players * 37) + (courts * 101);
}

function configForCourts(courts, players = 0) {
  const normalizedCourts = Math.max(1, Number(courts) || 1);
  const normalizedPlayers = Math.max(4, Number(players) || 4);
  if (normalizedCourts === 1 && normalizedPlayers >= 12 && normalizedPlayers <= 13) {
    return {
      searchSeeds: 20,
      beamWidth: 640,
      restSetLimit: 24,
      packageLimit: 48,
      perStateLimit: 18,
      timeBudgetMs: 15000
    };
  }
  if (normalizedCourts >= 3) {
    const isLargeField = normalizedPlayers >= 18;
    return {
      searchSeeds: isLargeField ? 14 : 12,
      beamWidth: isLargeField ? 448 : 384,
      restSetLimit: isLargeField ? 22 : 20,
      packageLimit: isLargeField ? 44 : 40,
      perStateLimit: isLargeField ? 18 : 16,
      timeBudgetMs: isLargeField ? 9000 : 7000
    };
  }
  const isLargeRoster = normalizedPlayers >= 18;
  return {
    searchSeeds: isLargeRoster ? 10 : 8,
    beamWidth: isLargeRoster ? 320 : 256,
    restSetLimit: isLargeRoster ? 18 : 16,
    packageLimit: isLargeRoster ? 36 : 32,
    perStateLimit: isLargeRoster ? 14 : 12,
    timeBudgetMs: isLargeRoster ? 6000 : 4500
  };
}

function normalizeCaseSpec(caseSpec) {
  const players = Math.max(4, Number(caseSpec.players) || 4);
  const courts = computeEffectiveCourts(players, caseSpec.courts);
  return {
    players,
    courts,
    seed: Number(caseSpec.seed) || seedFor(players, courts),
    ...configForCourts(courts, players),
    ...caseSpec
  };
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const out = {
    output: DEFAULT_TEMPLATE_OUTPUT,
    frontendOutput: DEFAULT_MATCH_OPTIONS_OUTPUT,
    stdout: false,
    wantedKeys: null,
    workerSpec: null,
    skipFrontendOutput: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i] || '').trim();
    if (arg === '--stdout') {
      out.stdout = true;
      continue;
    }
    if (arg === '--output') {
      out.output = path.resolve(process.cwd(), String(args[i + 1] || '').trim());
      i += 1;
      continue;
    }
    if (arg === '--frontend-output') {
      out.frontendOutput = path.resolve(process.cwd(), String(args[i + 1] || '').trim());
      i += 1;
      continue;
    }
    if (arg === '--skip-frontend-output') {
      out.skipFrontendOutput = true;
      continue;
    }
    if (arg === '--cases') {
      const raw = String(args[i + 1] || '').trim();
      out.wantedKeys = new Set(raw.split(',').map((item) => item.trim()).filter(Boolean));
      i += 1;
      continue;
    }
    if (arg === '--worker') {
      out.workerSpec = JSON.parse(String(args[i + 1] || '').trim());
      i += 1;
    }
  }
  return out;
}

function countComb(n, k) {
  const total = Math.max(0, Number(n) || 0);
  const choose = Math.max(0, Number(k) || 0);
  if (choose < 0 || choose > total) return 0;
  if (choose === 0 || choose === total) return 1;
  const upper = Math.min(choose, total - choose);
  let acc = 1;
  for (let i = 1; i <= upper; i += 1) {
    acc = Math.floor((acc * (total - upper + i)) / i);
  }
  return acc;
}

function totalUniqueMatchups(players) {
  return countComb(players, 4) * 3;
}

function stableSortIds(ids) {
  return (Array.isArray(ids) ? ids : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function normalizeTeamKey(team) {
  return stableSortIds(team).join('&');
}

function buildMatchupKey(teamA, teamB) {
  return [normalizeTeamKey(teamA), normalizeTeamKey(teamB)].sort().join(' vs ');
}

function buildPartnerPairKey(team) {
  const normalized = stableSortIds(team);
  return normalized.length === 2 ? normalized.join('|') : '';
}

function totalPartnerPairs(playersCount) {
  return countComb(playersCount, 2);
}

function makeIndexedPlayers(playersCount) {
  const femaleCount = Math.floor(playersCount / 2);
  return Array.from({ length: playersCount }, (_, index) => ({
    id: String(index + 1),
    name: `P${index + 1}`,
    gender: index < femaleCount ? 'female' : 'male'
  }));
}

function mapRoundsToTemplate(rounds) {
  return (Array.isArray(rounds) ? rounds : []).map((round) => ({
    matches: (Array.isArray(round && round.matches) ? round.matches : []).map((match) => ({
      teamA: stableSortIds(match.teamA).map((id) => Number(id)),
      teamB: stableSortIds(match.teamB).map((id) => Number(id))
    }))
  })).filter((round) => round.matches.length > 0);
}

function serializeTemplateRounds(rounds) {
  return JSON.stringify((Array.isArray(rounds) ? rounds : []).map((round) => ({
    matches: (Array.isArray(round && round.matches) ? round.matches : []).map((match) => ({
      teamA: (match.teamA || []).map((id) => Number(id)),
      teamB: (match.teamB || []).map((id) => Number(id))
    }))
  })));
}

function evaluateTemplateRounds(rounds, playersCount, totalMatches) {
  const playCount = Object.fromEntries(Array.from({ length: playersCount }, (_, index) => [String(index + 1), 0]));
  const playStreak = Object.fromEntries(Array.from({ length: playersCount }, (_, index) => [String(index + 1), 0]));
  const usedMatchupKeys = new Set();
  const partnerCoverage = new Set();
  let matchCount = 0;
  let maxConsecutivePlay = 0;
  for (const round of Array.isArray(rounds) ? rounds : []) {
    const playedThisRound = new Set();
    for (const match of Array.isArray(round && round.matches) ? round.matches : []) {
      if (matchCount >= totalMatches) break;
      const teamA = stableSortIds(match.teamA);
      const teamB = stableSortIds(match.teamB);
      teamA.concat(teamB).forEach((id) => {
        playCount[id] = (playCount[id] || 0) + 1;
        playedThisRound.add(id);
      });
      usedMatchupKeys.add(buildMatchupKey(teamA, teamB));
      const partnerA = buildPartnerPairKey(teamA);
      const partnerB = buildPartnerPairKey(teamB);
      if (partnerA) partnerCoverage.add(partnerA);
      if (partnerB) partnerCoverage.add(partnerB);
      matchCount += 1;
    }
    Object.keys(playStreak).forEach((id) => {
      if (playedThisRound.has(id)) {
        playStreak[id] = (playStreak[id] || 0) + 1;
        if (playStreak[id] > maxConsecutivePlay) maxConsecutivePlay = playStreak[id];
        return;
      }
      playStreak[id] = 0;
    });
    if (matchCount >= totalMatches) break;
  }
  const counts = Object.values(playCount);
  const min = counts.length ? Math.min(...counts) : 0;
  const max = counts.length ? Math.max(...counts) : 0;
  const totalPartners = totalPartnerPairs(playersCount);
  return {
    matchCount,
    uniqueExactMatchupCount: usedMatchupKeys.size,
    playSpread: max - min,
    maxConsecutivePlay,
    theoreticalPlaySpread: theoreticalPlaySpread(playersCount, totalMatches),
    partnerCoverageCount: partnerCoverage.size,
    totalPartnerPairs: totalPartners,
    allPartnerPairsCovered: totalPartners > 0 && partnerCoverage.size === totalPartners
  };
}

function buildPrefixMetricsEntryFromRounds(rounds, playersCount, totalMatches, maxConsecutiveOverride) {
  const metrics = evaluateTemplateRounds(rounds, playersCount, totalMatches);
  return {
    uniqueExactMatchupCount: metrics.uniqueExactMatchupCount,
    playSpread: metrics.playSpread,
    maxConsecutivePlay: Number.isFinite(Number(maxConsecutiveOverride))
      ? Number(maxConsecutiveOverride)
      : metrics.maxConsecutivePlay,
    theoreticalPlaySpread: metrics.theoreticalPlaySpread,
    partnerCoverageCount: metrics.partnerCoverageCount,
    totalPartnerPairs: metrics.totalPartnerPairs,
    allPartnerPairsCovered: metrics.allPartnerPairsCovered
  };
}

function validateResolvedCase(caseData, players, horizonMatches) {
  if (!caseData) return false;
  for (let matches = 1; matches <= horizonMatches; matches += 1) {
    const metrics = caseData.prefixMetrics && caseData.prefixMetrics[String(matches)];
    if (!metrics) return false;
    if (Number(metrics.uniqueExactMatchupCount) !== matches) return false;
    if (Number(metrics.playSpread) !== Number(metrics.theoreticalPlaySpread)) return false;
  }
  return true;
}

function augmentCasePrefixMetrics(caseData) {
  const players = Number(caseData && caseData.players) || 0;
  const variants = Array.isArray(caseData && caseData.variants) ? caseData.variants : [];
  const variantMap = new Map(variants.map((variant) => [String(variant && variant.id || ''), variant]));
  const horizonMatches = Number(caseData && caseData.horizonMatches) || 0;
  const prefixMetrics = {};

  for (let matches = 1; matches <= horizonMatches; matches += 1) {
    const key = String(matches);
    const currentMetrics = { ...((caseData && caseData.prefixMetrics && caseData.prefixMetrics[key]) || {}) };
    const variantId = String(caseData && caseData.bestPrefixByMatchCount && caseData.bestPrefixByMatchCount[key] || '');
    const variant = variantMap.get(variantId);
    const evaluated = evaluateTemplateRounds(variant && variant.rounds, players, matches);
    prefixMetrics[key] = {
      uniqueExactMatchupCount: Number(currentMetrics.uniqueExactMatchupCount) || evaluated.uniqueExactMatchupCount,
      playSpread: Number(currentMetrics.playSpread) || evaluated.playSpread,
      maxConsecutivePlay: Number.isFinite(Number(currentMetrics.maxConsecutivePlay))
        ? Number(currentMetrics.maxConsecutivePlay)
        : evaluated.maxConsecutivePlay,
      theoreticalPlaySpread: Number(currentMetrics.theoreticalPlaySpread) || evaluated.theoreticalPlaySpread,
      partnerCoverageCount: Number(currentMetrics.partnerCoverageCount) || evaluated.partnerCoverageCount,
      totalPartnerPairs: Number(currentMetrics.totalPartnerPairs) || evaluated.totalPartnerPairs,
      allPartnerPairsCovered: currentMetrics.allPartnerPairsCovered === true || evaluated.allPartnerPairsCovered === true
    };
  }

  return {
    ...caseData,
    prefixMetrics
  };
}

function findReusableCase(key, players, minimumHorizon = 0) {
  const caseData = existingLibrary && existingLibrary.cases ? augmentCasePrefixMetrics(existingLibrary.cases[key]) : null;
  if (!caseData) return null;
  const horizonMatches = Number(caseData.horizonMatches) || 0;
  if (horizonMatches <= 0) return null;
  const requiredHorizon = Math.max(1, Number(minimumHorizon) || horizonMatches);
  if (horizonMatches < requiredHorizon) return null;
  if (!validateResolvedCase(caseData, players, requiredHorizon)) return null;
  return caseData;
}

function findValidatedExistingCase(key, players) {
  const caseData = existingLibrary && existingLibrary.cases ? augmentCasePrefixMetrics(existingLibrary.cases[key]) : null;
  if (!caseData) return null;
  const horizonMatches = Number(caseData.horizonMatches) || 0;
  if (horizonMatches <= 0) return null;
  if (!validateResolvedCase(caseData, players, horizonMatches)) return null;
  return caseData;
}

function buildSearchUpperBound(players, courts) {
  if (courts <= 2) {
    if (players >= 20 && courts === 2) return 22;
    return 18;
  }
  if (players >= 20) return 18;
  return 16;
}

function candidateHorizonsFor(caseSpec) {
  const players = Math.max(4, Number(caseSpec.players) || 4);
  const courts = computeEffectiveCourts(players, caseSpec.courts);
  const explicitHorizon = Number(caseSpec.horizonMatches) || 0;
  if (explicitHorizon > 0) return [explicitHorizon];
  const key = buildTemplateKey(players, courts);
  const overrideHorizon = Number(MATCH_OPTION_OVERRIDES[key] && MATCH_OPTION_OVERRIDES[key].horizonMatches) || 0;
  if (overrideHorizon > 0) return [overrideHorizon];
  const existingCase = findValidatedExistingCase(key, players);
  const existingHorizon = Number(existingCase && existingCase.horizonMatches) || 0;
  const recommendation = buildMatchCountRecommendations({
    mode: 'multi_rotate',
    playersCount: players,
    maleCount: players,
    femaleCount: 0,
    unknownCount: 0,
    courts
  });
  const balancedTarget = Number(recommendation && recommendation.suggestedMatches) || 0;
  const intenseTarget = Number(
    recommendation
    && recommendation.recommendedMatches
    && recommendation.recommendedMatches[2]
    && recommendation.recommendedMatches[2].m
  ) || 0;
  const upperBound = Math.min(totalUniqueMatchups(players), buildSearchUpperBound(players, courts));
  return Array.from(new Set([
    existingHorizon,
    Math.min(upperBound, balancedTarget),
    Math.min(upperBound, intenseTarget),
    upperBound
  ].filter((value) => Number.isFinite(value) && value >= 1))).sort((left, right) => left - right);
}

function registerVariant(variants, variantBySerializedRounds, rounds) {
  const serialized = serializeTemplateRounds(rounds);
  if (variantBySerializedRounds.has(serialized)) {
    return variantBySerializedRounds.get(serialized);
  }
  const id = variants.length === 0 ? 'main' : `v${variants.length + 1}`;
  variants.push({ id, rounds });
  variantBySerializedRounds.set(serialized, id);
  return id;
}

function validateScheduleOutput(out, players, matches) {
  if (!out || !Array.isArray(out.rounds)) return false;
  const templateRounds = mapRoundsToTemplate(out.rounds);
  const metrics = evaluateTemplateRounds(templateRounds, players, matches);
  if (metrics.matchCount !== matches) return false;
  if (metrics.uniqueExactMatchupCount !== matches) return false;
  if (metrics.playSpread !== theoreticalPlaySpread(players, matches)) return false;
  return true;
}

function buildExactTemplateCase(caseSpec, players, courts, horizonMatches) {
  try {
    const library = buildTemplateLibrary([caseSpec]);
    const key = buildTemplateKey(players, courts);
    const caseData = library && library.cases ? library.cases[key] : null;
    if (!validateResolvedCase(caseData, players, horizonMatches)) return null;
    return {
      key,
      ...caseData
    };
  } catch (_) {
    return null;
  }
}

function buildScheduleOptionsFor(caseSpec, players, courts) {
  const defaultConfig = configForCourts(courts, players);
  return {
    seed: Number(caseSpec.seed) || seedFor(players, courts),
    searchSeeds: Math.max(1, Number(caseSpec.searchSeeds) || defaultConfig.searchSeeds),
    runtimeBudgetMs: Math.max(1000, Number(caseSpec.timeBudgetMs) || defaultConfig.timeBudgetMs)
  };
}

function resolveValidPrefixSchedule(roster, players, courts, matches, scheduleOptions) {
  const seeds = candidateSeedsFor({ players, courts, seed: scheduleOptions.seed });
  for (const seed of seeds) {
    let candidate = null;
    try {
      candidate = generateSchedule(roster, matches, courts, {
        ...scheduleOptions,
        seed: seed + (matches * 131)
      });
    } catch (_) {
      continue;
    }
    if (validateScheduleOutput(candidate, players, matches)) return candidate;
  }
  return null;
}

function buildPrefixOnlyTemplateCase(caseSpec, players, courts, horizonMatches, roster, scheduleOptions) {
  const variants = [];
  const variantBySerializedRounds = new Map();
  const bestPrefixByMatchCount = {};
  const prefixMetrics = {};

  for (let matches = 1; matches <= horizonMatches; matches += 1) {
    const schedule = resolveValidPrefixSchedule(roster, players, courts, matches, scheduleOptions);
    if (!schedule) return null;
    const rounds = mapRoundsToTemplate(schedule.rounds);
    const variantId = registerVariant(variants, variantBySerializedRounds, rounds);
    bestPrefixByMatchCount[String(matches)] = variantId;
    prefixMetrics[String(matches)] = buildPrefixMetricsEntryFromRounds(
      rounds,
      players,
      matches,
      Number(schedule.fairness && schedule.fairness.maxConsecutivePlay)
    );
  }

  return {
    key: buildTemplateKey(players, courts),
    players,
    courts,
    horizonMatches,
    totalUniqueMatchups: totalUniqueMatchups(players),
    variants,
    bestPrefixByMatchCount,
    prefixMetrics
  };
}

function extendExistingTemplateCase(caseSpec, existingCase, targetHorizon) {
  const players = Math.max(4, Number(caseSpec.players) || 4);
  const courts = computeEffectiveCourts(players, caseSpec.courts);
  const currentHorizon = Number(existingCase && existingCase.horizonMatches) || 0;
  if (currentHorizon <= 0 || currentHorizon >= targetHorizon) return null;
  const roster = makeIndexedPlayers(players);
  const scheduleOptions = buildScheduleOptionsFor(caseSpec, players, courts);
  const variants = (Array.isArray(existingCase.variants) ? existingCase.variants : []).map((variant) => ({
    id: String(variant && variant.id || 'main'),
    rounds: Array.isArray(variant && variant.rounds) ? variant.rounds : []
  }));
  const variantBySerializedRounds = new Map();
  variants.forEach((variant) => {
    variantBySerializedRounds.set(serializeTemplateRounds(variant.rounds), variant.id);
  });
  const bestPrefixByMatchCount = { ...(existingCase.bestPrefixByMatchCount || {}) };
  const prefixMetrics = { ...(existingCase.prefixMetrics || {}) };

  for (let matches = currentHorizon + 1; matches <= targetHorizon; matches += 1) {
    const schedule = resolveValidPrefixSchedule(roster, players, courts, matches, scheduleOptions);
    if (!schedule) return null;
    const rounds = mapRoundsToTemplate(schedule.rounds);
    const variantId = registerVariant(variants, variantBySerializedRounds, rounds);
    bestPrefixByMatchCount[String(matches)] = variantId;
    prefixMetrics[String(matches)] = buildPrefixMetricsEntryFromRounds(
      rounds,
      players,
      matches,
      Number(schedule.fairness && schedule.fairness.maxConsecutivePlay)
    );
  }

  return {
    key: buildTemplateKey(players, courts),
    players,
    courts,
    horizonMatches: targetHorizon,
    totalUniqueMatchups: Number(existingCase.totalUniqueMatchups) || totalUniqueMatchups(players),
    variants,
    bestPrefixByMatchCount,
    prefixMetrics
  };
}

function buildRuntimeTemplateCase(caseSpec) {
  const players = Math.max(4, Number(caseSpec.players) || 4);
  const courts = computeEffectiveCourts(players, caseSpec.courts);
  const horizonMatches = Math.max(1, Number(caseSpec.horizonMatches) || 1);
  const key = buildTemplateKey(players, courts);
  const roster = makeIndexedPlayers(players);
  const scheduleOptions = buildScheduleOptionsFor(caseSpec, players, courts);

  let fullOut = null;
  try {
    fullOut = generateSchedule(roster, horizonMatches, courts, scheduleOptions);
  } catch (_) {
    fullOut = null;
  }
  if (!validateScheduleOutput(fullOut, players, horizonMatches)) {
    return buildPrefixOnlyTemplateCase(caseSpec, players, courts, horizonMatches, roster, scheduleOptions)
      || buildExactTemplateCase(caseSpec, players, courts, horizonMatches);
  }

  const variants = [];
  const variantBySerializedRounds = new Map();
  const fullRounds = mapRoundsToTemplate(fullOut.rounds);
  const mainVariantId = registerVariant(variants, variantBySerializedRounds, fullRounds);
  const bestPrefixByMatchCount = {};
  const prefixMetrics = {};

  for (let matches = 1; matches <= horizonMatches; matches += 1) {
    let chosenRounds = fullRounds;
    let metrics = evaluateTemplateRounds(chosenRounds, players, matches);
    let repairedOut = null;
    if (
      metrics.matchCount !== matches
      || metrics.uniqueExactMatchupCount !== matches
      || metrics.playSpread !== theoreticalPlaySpread(players, matches)
    ) {
      repairedOut = resolveValidPrefixSchedule(roster, players, courts, matches, scheduleOptions);
      if (!repairedOut) {
        return buildPrefixOnlyTemplateCase(caseSpec, players, courts, horizonMatches, roster, scheduleOptions)
          || buildExactTemplateCase(caseSpec, players, courts, horizonMatches);
      }
      chosenRounds = mapRoundsToTemplate(repairedOut.rounds);
      metrics = evaluateTemplateRounds(chosenRounds, players, matches);
    }
    const variantId = chosenRounds === fullRounds
      ? mainVariantId
      : registerVariant(variants, variantBySerializedRounds, chosenRounds);
    bestPrefixByMatchCount[String(matches)] = variantId;
    prefixMetrics[String(matches)] = buildPrefixMetricsEntryFromRounds(
      chosenRounds,
      players,
      matches,
      Number(
        (repairedOut && repairedOut.fairness && repairedOut.fairness.maxConsecutivePlay)
        || (fullOut && fullOut.fairness && fullOut.fairness.maxConsecutivePlay)
        || metrics.maxConsecutivePlay
        || 0
      )
    );
  }

  return {
    key,
    players,
    courts,
    horizonMatches,
    totalUniqueMatchups: totalUniqueMatchups(players),
    variants,
    bestPrefixByMatchCount,
    prefixMetrics
  };
}

function wallTimeoutMsFor(caseSpec) {
  const players = Math.max(4, Number(caseSpec.players) || 4);
  const courts = computeEffectiveCourts(players, caseSpec.courts);
  if (courts === 1 && players >= 12 && players <= 13) return 120000;
  if (courts >= 4 && players >= 18) return 180000;
  if (courts >= 3 && players >= 18) return 120000;
  if (courts >= 3) return 90000;
  if (courts === 2 && players >= 18) return 120000;
  if (courts === 2 && players >= 17) return 90000;
  if (courts === 2 && players >= 15) return 45000;
  if (courts === 1 && players >= 15) return 45000;
  return 30000;
}

function candidateSeedsFor(caseSpec) {
  const players = Math.max(4, Number(caseSpec.players) || 4);
  const courts = computeEffectiveCourts(players, caseSpec.courts);
  const baseSeed = Number(caseSpec.seed) || seedFor(players, courts);
  if (courts === 1 && ((players >= 12 && players <= 13) || players >= 20)) {
    return [baseSeed, baseSeed + 97, baseSeed + 389, baseSeed + 997];
  }
  return [baseSeed];
}

function buildCaseInSubprocess(candidate) {
  const result = spawnSync(process.execPath, [__filename, '--worker', JSON.stringify(candidate)], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    timeout: wallTimeoutMsFor(candidate),
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') return null;
    throw result.error;
  }
  if (result.status !== 0) return null;
  const stdout = String(result.stdout || '').trim();
  if (!stdout) return null;
  return JSON.parse(stdout);
}

function resolveHandcraftedCase(caseSpec) {
  const key = buildTemplateKey(caseSpec.players, caseSpec.courts);
  const reusable = findReusableCase(key, caseSpec.players, caseSpec.horizonMatches);
  if (reusable) {
    logProgress(`reused ${key} @ ${reusable.horizonMatches}`);
    return { key, caseData: reusable };
  }
  const resolved = buildCaseInSubprocess(normalizeCaseSpec(caseSpec));
  const caseData = resolved && resolved.caseData;
  if (!validateResolvedCase(caseData, caseSpec.players, caseSpec.horizonMatches)) {
    throw new Error(`handcrafted template validation failed for ${key}`);
  }
  logProgress(`resolved ${key} @ ${caseSpec.horizonMatches}`);
  return { key, caseData };
}

function resolveAutoCase(caseSpec) {
  const normalized = normalizeCaseSpec(caseSpec);
  const key = buildTemplateKey(normalized.players, normalized.courts);
  const existingCase = findValidatedExistingCase(key, normalized.players);
  const candidateHorizons = candidateHorizonsFor(normalized);

  for (const horizonMatches of candidateHorizons.slice().sort((left, right) => right - left)) {
    const reusable = findReusableCase(key, normalized.players, horizonMatches);
    if (reusable) {
      logProgress(`reused ${key} @ ${reusable.horizonMatches}`);
      return { key, caseData: reusable };
    }
    if (existingCase && Number(existingCase.horizonMatches) < horizonMatches) {
      const extended = extendExistingTemplateCase(normalized, existingCase, horizonMatches);
      if (extended && validateResolvedCase(extended, normalized.players, horizonMatches)) {
        logProgress(`extended ${key} @ ${horizonMatches}`);
        return { key, caseData: extended };
      }
    }
    for (const seed of candidateSeedsFor(normalized)) {
      const candidate = { ...normalized, horizonMatches, seed };
      try {
        const resolved = buildCaseInSubprocess(candidate);
        const caseData = resolved && resolved.caseData;
        if (!validateResolvedCase(caseData, normalized.players, horizonMatches)) continue;
        logProgress(`resolved ${key} @ ${horizonMatches}`);
        return { key, caseData };
      } catch (_) {
        // try the next deterministic seed
      }
    }
  }
  if (existingCase) {
    logProgress(`kept ${key} @ ${existingCase.horizonMatches}`);
    return { key, caseData: existingCase };
  }
  throw new Error(`failed to resolve template horizon for ${key}`);
}

function resolveCases(wantedKeys = null) {
  const cases = {};
  for (const caseSpec of HANDCRAFTED_CASES) {
    const key = buildTemplateKey(caseSpec.players, caseSpec.courts);
    if (wantedKeys && !wantedKeys.has(key)) continue;
    const resolved = resolveHandcraftedCase(caseSpec);
    cases[resolved.key] = resolved.caseData;
  }
  for (const caseSpec of buildBandCases()) {
    const key = buildTemplateKey(caseSpec.players, caseSpec.courts);
    if (wantedKeys && !wantedKeys.has(key)) continue;
    const resolved = resolveAutoCase(caseSpec);
    cases[resolved.key] = resolved.caseData;
  }
  return cases;
}

function renderLibrary(library) {
  return `module.exports = ${JSON.stringify(library, null, 2)};\n`;
}

function renderMatchOptionsLibrary(library) {
  const serialized = JSON.stringify(library, null, 2);
  return `const MATCH_OPTION_LIBRARY = ${serialized};

function computeEffectiveCourts(playersCount, requestedCourts) {
  const players = Math.max(0, Number(playersCount) || 0);
  const requested = Math.max(1, Number(requestedCourts) || 1);
  const maxConcurrent = Math.max(1, Math.floor(players / 4));
  return Math.max(1, Math.min(requested, maxConcurrent));
}

function buildMatchOptionKey(playersCount, courts) {
  const players = Math.max(0, Number(playersCount) || 0);
  return \`\${players}p-\${computeEffectiveCourts(players, courts)}c\`;
}

function resolveMultiRotateMatchOptions(playersCount, courts) {
  const key = buildMatchOptionKey(playersCount, courts);
  return MATCH_OPTION_LIBRARY.cases[key] || null;
}

module.exports = {
  ...MATCH_OPTION_LIBRARY,
  computeEffectiveCourts,
  buildMatchOptionKey,
  resolveMultiRotateMatchOptions
};
`;
}

function logProgress(message) {
  process.stderr.write(`${message}\n`);
}

function assertMatchOptionRationality(matchOptionLibrary) {
  const issues = buildRecommendationAuditIssues(matchOptionLibrary && matchOptionLibrary.cases);
  if (!issues.length) return;
  issues.forEach((issue) => {
    logProgress(`match-options issue ${issue.code} ${issue.key}: ${issue.message}`);
  });
  throw new Error(`match option rationality failed with ${issues.length} issue(s)`);
}

function runWorker(workerSpec) {
  const normalized = normalizeCaseSpec(workerSpec || {});
  const caseData = buildRuntimeTemplateCase(normalized);
  process.stdout.write(JSON.stringify({
    key: buildTemplateKey(normalized.players, normalized.courts),
    caseData
  }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.workerSpec) {
    runWorker(args.workerSpec);
    return;
  }
  const cases = resolveCases(args.wantedKeys);
  const templateLibrary = {
    version: 'rotation-v3-templates',
    cases
  };
  const content = renderLibrary(templateLibrary);
  if (args.stdout) {
    process.stdout.write(content);
    return;
  }
  fs.writeFileSync(args.output, content, 'utf8');
  logProgress(`rotation templates written: ${args.output}`);
  if (!args.skipFrontendOutput) {
    const matchOptionLibrary = buildMatchOptionsLibrary(cases);
    assertMatchOptionRationality(matchOptionLibrary);
    const matchOptionContent = renderMatchOptionsLibrary(matchOptionLibrary);
    fs.writeFileSync(args.frontendOutput, matchOptionContent, 'utf8');
    logProgress(`multi-rotate match options written: ${args.frontendOutput}`);
  }
}

main();
