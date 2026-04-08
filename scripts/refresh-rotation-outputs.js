#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { buildMatchCountRecommendations } = require('../miniprogram/core/ux/capacity');
const { MODE_MULTI_ROTATE } = require('../miniprogram/core/mode');

const TEMPLATE_OUTPUT = path.resolve(__dirname, '../cloudfunctions/startTournament/rotation.templates.js');
const MATCH_OPTIONS_OUTPUT = path.resolve(__dirname, '../miniprogram/core/ux/multiRotateMatchOptions.js');
const GENERATOR_SCRIPT = path.resolve(__dirname, './generate-rotation-templates.js');
const BASE_LIBRARY = require('../cloudfunctions/startTournament/rotation.templates');

const MERGE_KEYS = [
  '16p-4c',
  '20p-1c',
  '21p-1c',
  '22p-1c',
  '23p-1c',
  '24p-1c'
];

function stableSortIds(ids) {
  return (Array.isArray(ids) ? ids : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .sort();
}

function buildMatchupKey(teamA, teamB) {
  const normalize = (team) => stableSortIds(team).join('&');
  return [normalize(teamA), normalize(teamB)].sort().join(' vs ');
}

function theoreticalPlaySpread(playersCount, totalMatches) {
  return Math.ceil((4 * totalMatches) / playersCount) - Math.floor((4 * totalMatches) / playersCount);
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
    maxConsecutivePlay,
    theoreticalPlaySpread: theoreticalPlaySpread(playersCount, totalMatches)
  };
}

function augmentCase(caseData) {
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
      theoreticalPlaySpread: Number(currentMetrics.theoreticalPlaySpread) || evaluated.theoreticalPlaySpread
    };
  }

  return {
    ...caseData,
    prefixMetrics
  };
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

function renderLibrary(library) {
  return `module.exports = ${JSON.stringify(library, null, 2)};\n`;
}

function renderMatchOptionsLibrary(library) {
  const serialized = JSON.stringify(library, null, 2);
  return [
    `const MATCH_OPTION_LIBRARY = ${serialized};`,
    '',
    'function computeEffectiveCourts(playersCount, requestedCourts) {',
    '  const players = Math.max(0, Number(playersCount) || 0);',
    '  const requested = Math.max(1, Number(requestedCourts) || 1);',
    '  const maxConcurrent = Math.max(1, Math.floor(players / 4));',
    '  return Math.max(1, Math.min(requested, maxConcurrent));',
    '}',
    '',
    'function buildMatchOptionKey(playersCount, courts) {',
    '  const players = Math.max(0, Number(playersCount) || 0);',
    '  return `${players}p-${computeEffectiveCourts(players, courts)}c`;',
    '}',
    '',
    'function resolveMultiRotateMatchOptions(playersCount, courts) {',
    '  const key = buildMatchOptionKey(playersCount, courts);',
    '  return MATCH_OPTION_LIBRARY.cases[key] || null;',
    '}',
    '',
    'module.exports = {',
    '  ...MATCH_OPTION_LIBRARY,',
    '  computeEffectiveCourts,',
    '  buildMatchOptionKey,',
    '  resolveMultiRotateMatchOptions',
    '};',
    ''
  ].join('\n');
}

function loadGeneratedCase(key) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotation-merge-'));
  const templatePath = path.join(tempDir, 'templates.js');
  const matchOptionsPath = path.join(tempDir, 'match-options.js');
  execFileSync(process.execPath, [GENERATOR_SCRIPT, '--cases', key, '--output', templatePath, '--frontend-output', matchOptionsPath], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe'
  });
  const resolvedPath = require.resolve(templatePath);
  delete require.cache[resolvedPath];
  const generated = require(resolvedPath);
  const caseData = generated && generated.cases ? generated.cases[key] : null;
  if (!caseData) throw new Error(`missing generated case: ${key}`);
  return caseData;
}

function main() {
  const mergedCases = { ...(BASE_LIBRARY.cases || {}) };
  const skipMerge = process.argv.includes('--skip-merge');

  if (!skipMerge) {
    MERGE_KEYS.forEach((key) => {
      const caseData = loadGeneratedCase(key);
      mergedCases[key] = caseData;
      process.stdout.write(`merged ${key} @ ${caseData.horizonMatches}\n`);
    });
  }

  Object.keys(mergedCases).forEach((key) => {
    mergedCases[key] = augmentCase(mergedCases[key]);
  });

  const sortedCases = Object.fromEntries(Object.keys(mergedCases).sort().map((key) => [key, mergedCases[key]]));
  const templateLibrary = {
    version: 'rotation-v3-templates',
    cases: sortedCases
  };
  fs.writeFileSync(TEMPLATE_OUTPUT, renderLibrary(templateLibrary), 'utf8');

  const optionCases = {};
  Object.keys(sortedCases).forEach((key) => {
    const caseData = sortedCases[key];
    const players = Number(caseData.players) || 0;
    const effectiveCourts = Number(caseData.courts) || 1;
    if (players < 4 || players > 24) return;
    const built = buildPresetMatches(caseData);
    optionCases[key] = {
      players,
      effectiveCourts,
      horizonMatches: Number(caseData.horizonMatches) || 0,
      presetMatches: built.presetMatches,
      balancedMatch: built.balancedMatch,
      supportsAdvancedCustom: true
    };
  });

  const matchOptionLibrary = {
    version: 'rotation-v3-match-options',
    cases: optionCases
  };
  fs.writeFileSync(MATCH_OPTIONS_OUTPUT, renderMatchOptionsLibrary(matchOptionLibrary), 'utf8');

  process.stdout.write(`wrote ${TEMPLATE_OUTPUT}\n`);
  process.stdout.write(`wrote ${MATCH_OPTIONS_OUTPUT}\n`);
}

main();
