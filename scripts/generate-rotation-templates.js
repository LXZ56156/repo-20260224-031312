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
const { MODE_MULTI_ROTATE } = require('../miniprogram/core/mode');

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
  return {
    matchCount,
    uniqueExactMatchupCount: usedMatchupKeys.size,
    playSpread: max - min,
    maxConsecutivePlay
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

function findReusableCase(key, players, minimumHorizon = 0) {
  const caseData = existingLibrary && existingLibrary.cases ? existingLibrary.cases[key] : null;
  if (!caseData) return null;
  const horizonMatches = Number(caseData.horizonMatches) || 0;
  if (horizonMatches <= 0) return null;
  const requiredHorizon = Math.max(1, Number(minimumHorizon) || horizonMatches);
  if (horizonMatches < requiredHorizon) return null;
  if (!validateResolvedCase(caseData, players, requiredHorizon)) return null;
  return caseData;
}

function findValidatedExistingCase(key, players) {
  const caseData = existingLibrary && existingLibrary.cases ? existingLibrary.cases[key] : null;
  if (!caseData) return null;
  const horizonMatches = Number(caseData.horizonMatches) || 0;
  if (horizonMatches <= 0) return null;
  if (!validateResolvedCase(caseData, players, horizonMatches)) return null;
  return caseData;
}

function candidateHorizonsFor(caseSpec) {
  const players = Math.max(4, Number(caseSpec.players) || 4);
  const courts = computeEffectiveCourts(players, caseSpec.courts);
  const explicitHorizon = Number(caseSpec.horizonMatches) || 0;
  if (explicitHorizon > 0) return [explicitHorizon];
  if (courts === 1 && ((players >= 12 && players <= 13) || (players >= 16 && players <= 19) || players >= 22)) return [12];
  const key = buildTemplateKey(players, courts);
  const existingCase = existingLibrary && existingLibrary.cases ? existingLibrary.cases[key] : null;
  const existingHorizon = Number(existingCase && existingCase.horizonMatches) || 0;
  const baseline = courts <= 2 ? 18 : 16;
  const boundedBaseline = Math.min(totalUniqueMatchups(players), baseline);
  return [Math.max(existingHorizon, boundedBaseline)];
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
    const candidate = generateSchedule(roster, matches, courts, {
      ...scheduleOptions,
      seed: seed + (matches * 131)
    });
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
    prefixMetrics[String(matches)] = {
      uniqueExactMatchupCount: Number(schedule.playerStats && schedule.playerStats.uniqueMatchupCount) || 0,
      playSpread: Number(schedule.fairness && schedule.fairness.playSpread) || 0,
      maxConsecutivePlay: Number(schedule.fairness && schedule.fairness.maxConsecutivePlay) || 0,
      theoreticalPlaySpread: theoreticalPlaySpread(players, matches)
    };
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
    prefixMetrics[String(matches)] = {
      uniqueExactMatchupCount: Number(schedule.playerStats && schedule.playerStats.uniqueMatchupCount) || 0,
      playSpread: Number(schedule.fairness && schedule.fairness.playSpread) || 0,
      maxConsecutivePlay: Number(schedule.fairness && schedule.fairness.maxConsecutivePlay) || 0,
      theoreticalPlaySpread: theoreticalPlaySpread(players, matches)
    };
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

  const fullOut = generateSchedule(roster, horizonMatches, courts, scheduleOptions);
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
    prefixMetrics[String(matches)] = {
      uniqueExactMatchupCount: metrics.uniqueExactMatchupCount,
      playSpread: metrics.playSpread,
      maxConsecutivePlay: Number(
        (repairedOut && repairedOut.fairness && repairedOut.fairness.maxConsecutivePlay)
        || (fullOut && fullOut.fairness && fullOut.fairness.maxConsecutivePlay)
        || metrics.maxConsecutivePlay
        || 0
      ),
      theoreticalPlaySpread: theoreticalPlaySpread(players, matches)
    };
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
  const desiredHorizon = candidateHorizonsFor(normalized)[0];
  const reusable = findReusableCase(key, normalized.players, desiredHorizon);
  if (reusable) {
    logProgress(`reused ${key} @ ${reusable.horizonMatches}`);
    return { key, caseData: reusable };
  }
  const existingCase = findValidatedExistingCase(key, normalized.players);
  if (existingCase) {
    const extended = extendExistingTemplateCase(normalized, existingCase, desiredHorizon);
    if (extended && validateResolvedCase(extended, normalized.players, desiredHorizon)) {
      logProgress(`extended ${key} @ ${desiredHorizon}`);
      return { key, caseData: extended };
    }
  }
  for (const horizonMatches of [desiredHorizon]) {
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

function buildPresetCandidate(caseData, matches) {
  const metrics = caseData && caseData.prefixMetrics ? caseData.prefixMetrics[String(matches)] : null;
  if (!metrics) return null;
  return {
    matches,
    uniqueExactMatchupCount: Number(metrics.uniqueExactMatchupCount) || 0,
    playSpread: Number(metrics.playSpread) || 0,
    maxConsecutivePlay: Number(metrics.maxConsecutivePlay) || 0
  };
}

function compareFallbackPresetCandidate(left, right, suggestedMatches) {
  const leftDistance = Math.abs(left.matches - suggestedMatches);
  const rightDistance = Math.abs(right.matches - suggestedMatches);
  if (leftDistance !== rightDistance) return leftDistance - rightDistance;
  if (left.playSpread !== right.playSpread) return left.playSpread - right.playSpread;
  if (left.maxConsecutivePlay !== right.maxConsecutivePlay) return left.maxConsecutivePlay - right.maxConsecutivePlay;
  return right.matches - left.matches;
}

function pickBalancedMatch(presetMatches, suggestedMatches) {
  return (Array.isArray(presetMatches) ? presetMatches : [])
    .slice()
    .sort((left, right) => {
      const leftDistance = Math.abs(left - suggestedMatches);
      const rightDistance = Math.abs(right - suggestedMatches);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return left - right;
    })[0] || 0;
}

function buildPresetMatches(caseData) {
  const players = Number(caseData && caseData.players) || 0;
  const courts = Number(caseData && caseData.courts) || 1;
  const horizonMatches = Number(caseData && caseData.horizonMatches) || 0;
  const recommendation = buildMatchCountRecommendations({
    mode: MODE_MULTI_ROTATE,
    playersCount: players,
    maleCount: players,
    femaleCount: 0,
    unknownCount: 0,
    courts
  });
  const suggestedMatches = Number(recommendation.suggestedMatches) || 1;
  const candidates = [];
  for (let matches = 1; matches <= horizonMatches; matches += 1) {
    const candidate = buildPresetCandidate(caseData, matches);
    if (candidate) candidates.push(candidate);
  }
  const selected = [];
  const selectedMatches = new Set();
  const perfect = candidates
    .filter((candidate) => candidate.uniqueExactMatchupCount === candidate.matches && candidate.playSpread === 0)
    .sort((left, right) => left.matches - right.matches);

  perfect.slice(0, 3).forEach((candidate) => {
    selected.push(candidate);
    selectedMatches.add(candidate.matches);
  });

  const fallback = candidates
    .filter((candidate) => !selectedMatches.has(candidate.matches))
    .sort((left, right) => compareFallbackPresetCandidate(left, right, suggestedMatches));

  for (const candidate of fallback) {
    if (selected.length >= 3) break;
    selected.push(candidate);
    selectedMatches.add(candidate.matches);
  }

  const presetMatches = selected
    .map((candidate) => candidate.matches)
    .filter((value, index, list) => list.indexOf(value) === index)
    .sort((left, right) => left - right);

  return {
    presetMatches,
    balancedMatch: pickBalancedMatch(presetMatches, suggestedMatches)
  };
}

function buildMatchOptionsLibrary(cases) {
  const outCases = {};
  const sourceCases = cases && typeof cases === 'object' ? cases : {};
  Object.keys(sourceCases).sort().forEach((key) => {
    const caseData = sourceCases[key];
    if (!caseData) return;
    const players = Number(caseData.players) || 0;
    const effectiveCourts = Number(caseData.courts) || 1;
    if (players < 4 || players > 24) return;
    const built = buildPresetMatches(caseData);
    outCases[key] = {
      players,
      effectiveCourts,
      horizonMatches: Number(caseData.horizonMatches) || 0,
      presetMatches: built.presetMatches,
      balancedMatch: built.balancedMatch,
      supportsAdvancedCustom: true
    };
  });
  return {
    version: 'rotation-v3-match-options',
    cases: outCases
  };
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
    const matchOptionContent = renderMatchOptionsLibrary(matchOptionLibrary);
    fs.writeFileSync(args.frontendOutput, matchOptionContent, 'utf8');
    logProgress(`multi-rotate match options written: ${args.frontendOutput}`);
  }
}

main();
