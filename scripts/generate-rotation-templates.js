#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  buildTemplateKey,
  computeEffectiveCourts,
  theoreticalPlaySpread
} = require('../cloudfunctions/startTournament/rotationDoublesEngine');
const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');

let existingLibrary = { version: 'missing', cases: {} };
try {
  // eslint-disable-next-line global-require
  existingLibrary = require('../cloudfunctions/startTournament/rotation.templates');
} catch (_) {
  existingLibrary = { version: 'missing', cases: {} };
}

const ALLOWED_HORIZONS = [22, 18, 16, 12];

const HANDCRAFTED_CASES = [
  { players: 5, courts: 1, horizonMatches: 15, seed: 1 },
  { players: 6, courts: 1, horizonMatches: 18, seed: 11 },
  { players: 7, courts: 1, horizonMatches: 18, seed: 19 }
];

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function buildBandCases() {
  return [
    ...range(8, 16).map((players) => ({ players, courts: 1 })),
    ...range(8, 20).map((players) => ({ players, courts: 2 })),
    ...range(12, 24).map((players) => ({ players, courts: 3 }))
  ];
}

function seedFor(players, courts) {
  return 97 + (players * 37) + (courts * 101);
}

function configForCourts(courts) {
  if (courts === 3) {
    return {
      searchSeeds: 12,
      beamWidth: 384,
      restSetLimit: 20,
      packageLimit: 40,
      perStateLimit: 16,
      timeBudgetMs: 7000
    };
  }
  return {
    searchSeeds: 8,
    beamWidth: 256,
    restSetLimit: 16,
    packageLimit: 32,
    perStateLimit: 12,
    timeBudgetMs: 4500
  };
}

function normalizeCaseSpec(caseSpec) {
  const players = Math.max(4, Number(caseSpec.players) || 4);
  const courts = computeEffectiveCourts(players, caseSpec.courts);
  return {
    players,
    courts,
    seed: Number(caseSpec.seed) || seedFor(players, courts),
    ...configForCourts(courts),
    ...caseSpec
  };
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const out = {
    output: path.resolve(__dirname, '../cloudfunctions/startTournament/rotation.templates.js'),
    stdout: false,
    wantedKeys: null,
    workerSpec: null
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
  const usedMatchupKeys = new Set();
  let matchCount = 0;
  for (const round of Array.isArray(rounds) ? rounds : []) {
    for (const match of Array.isArray(round && round.matches) ? round.matches : []) {
      if (matchCount >= totalMatches) break;
      const teamA = stableSortIds(match.teamA);
      const teamB = stableSortIds(match.teamB);
      teamA.concat(teamB).forEach((id) => {
        playCount[id] = (playCount[id] || 0) + 1;
      });
      usedMatchupKeys.add(buildMatchupKey(teamA, teamB));
      matchCount += 1;
    }
    if (matchCount >= totalMatches) break;
  }
  const counts = Object.values(playCount);
  const min = counts.length ? Math.min(...counts) : 0;
  const max = counts.length ? Math.max(...counts) : 0;
  return {
    matchCount,
    uniqueExactMatchupCount: usedMatchupKeys.size,
    playSpread: max - min
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

function findReusableCase(key, players) {
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
  if (courts === 1) {
    if (players >= 16) return [12];
    if (players === 15) return [22, 18, 16, 12];
    if (players >= 14) return [18, 16, 12];
    return ALLOWED_HORIZONS.slice();
  }
  if (courts === 2) {
    if (players >= 17) return [12];
    if (players >= 15) return [16, 12];
    return ALLOWED_HORIZONS.slice();
  }
  if (courts === 3) {
    if (players >= 16) return [12];
    return [16, 12];
  }
  return ALLOWED_HORIZONS.slice();
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

function buildRuntimeTemplateCase(caseSpec) {
  const players = Math.max(4, Number(caseSpec.players) || 4);
  const courts = computeEffectiveCourts(players, caseSpec.courts);
  const horizonMatches = Math.max(1, Number(caseSpec.horizonMatches) || 1);
  const roster = makeIndexedPlayers(players);
  const scheduleOptions = {
    seed: Number(caseSpec.seed) || seedFor(players, courts),
    searchSeeds: Math.max(1, Number(caseSpec.searchSeeds) || configForCourts(courts).searchSeeds),
    runtimeBudgetMs: Math.max(1000, Number(caseSpec.timeBudgetMs) || configForCourts(courts).timeBudgetMs)
  };

  const fullOut = generateSchedule(roster, horizonMatches, courts, scheduleOptions);
  if (!validateScheduleOutput(fullOut, players, horizonMatches)) {
    return null;
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
    if (
      metrics.matchCount !== matches
      || metrics.uniqueExactMatchupCount !== matches
      || metrics.playSpread !== theoreticalPlaySpread(players, matches)
    ) {
      const repaired = generateSchedule(roster, matches, courts, {
        ...scheduleOptions,
        seed: scheduleOptions.seed + (matches * 131)
      });
      if (!validateScheduleOutput(repaired, players, matches)) {
        return null;
      }
      chosenRounds = mapRoundsToTemplate(repaired.rounds);
      metrics = evaluateTemplateRounds(chosenRounds, players, matches);
    }
    const variantId = chosenRounds === fullRounds
      ? mainVariantId
      : registerVariant(variants, variantBySerializedRounds, chosenRounds);
    bestPrefixByMatchCount[String(matches)] = variantId;
    prefixMetrics[String(matches)] = {
      uniqueExactMatchupCount: metrics.uniqueExactMatchupCount,
      playSpread: metrics.playSpread,
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

function wallTimeoutMsFor(caseSpec) {
  const players = Math.max(4, Number(caseSpec.players) || 4);
  const courts = computeEffectiveCourts(players, caseSpec.courts);
  if (courts >= 3 && players >= 18) return 120000;
  if (courts >= 3) return 90000;
  if (courts === 2 && players >= 18) return 120000;
  if (courts === 2 && players >= 17) return 90000;
  if (courts === 2 && players >= 15) return 45000;
  if (courts === 1 && players >= 15) return 45000;
  return 30000;
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
  const reusable = findReusableCase(key, caseSpec.players);
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
  const reusable = findReusableCase(key, normalized.players);
  if (reusable) {
    logProgress(`reused ${key} @ ${reusable.horizonMatches}`);
    return { key, caseData: reusable };
  }
  for (const horizonMatches of candidateHorizonsFor(normalized)) {
    const candidate = { ...normalized, horizonMatches };
    try {
      const resolved = buildCaseInSubprocess(candidate);
      const caseData = resolved && resolved.caseData;
      if (!validateResolvedCase(caseData, normalized.players, horizonMatches)) continue;
      logProgress(`resolved ${key} @ ${horizonMatches}`);
      return { key, caseData };
    } catch (_) {
      // try a smaller horizon
    }
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
  const content = renderLibrary({
    version: 'rotation-v3-templates',
    cases
  });
  if (args.stdout) {
    process.stdout.write(content);
    return;
  }
  fs.writeFileSync(args.output, content, 'utf8');
  logProgress(`rotation templates written: ${args.output}`);
}

main();
