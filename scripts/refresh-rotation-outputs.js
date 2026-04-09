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

function buildPartnerPairKey(team) {
  const normalized = stableSortIds(team);
  return normalized.length === 2 ? normalized.join('|') : '';
}

function totalPartnerPairs(playersCount) {
  const players = Math.max(0, Number(playersCount) || 0);
  return Math.floor((players * (players - 1)) / 2);
}

function theoreticalPlaySpread(playersCount, totalMatches) {
  return Math.ceil((4 * totalMatches) / playersCount) - Math.floor((4 * totalMatches) / playersCount);
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

function buildPresetCandidate(caseData, matches) {
  const metrics = caseData && caseData.prefixMetrics ? caseData.prefixMetrics[String(matches)] : null;
  if (!metrics) return null;
  return {
    matches,
    uniqueExactMatchupCount: Number(metrics.uniqueExactMatchupCount) || 0,
    playSpread: Number(metrics.playSpread) || 0,
    maxConsecutivePlay: Number(metrics.maxConsecutivePlay) || 0,
    theoreticalPlaySpread: Number(metrics.theoreticalPlaySpread) || 0,
    partnerCoverageCount: Number(metrics.partnerCoverageCount) || 0,
    totalPartnerPairs: Number(metrics.totalPartnerPairs) || 0,
    allPartnerPairsCovered: metrics.allPartnerPairsCovered === true
  };
}

function isZeroSpreadExactCandidate(candidate) {
  return candidate.uniqueExactMatchupCount === candidate.matches && candidate.playSpread === 0;
}

function isQualityAcceptableCandidate(candidate) {
  return candidate.uniqueExactMatchupCount === candidate.matches
    && candidate.playSpread === candidate.theoreticalPlaySpread;
}

function extractRecommendationTargets(recommendation) {
  const items = Array.isArray(recommendation && recommendation.recommendedMatches)
    ? recommendation.recommendedMatches
    : [];
  const byKey = Object.fromEntries(items.map((item) => [String(item && item.key || ''), Number(item && item.m) || 0]));
  return {
    low: byKey.relax || Number(items[0] && items[0].m) || 1,
    balanced: byKey.balanced || Number(items[1] && items[1].m) || Number(items[0] && items[0].m) || 1,
    high: byKey.intense || Number(items[2] && items[2].m) || Number(items[items.length - 1] && items[items.length - 1].m) || 1
  };
}

function compareCandidatesForSlot(left, right, target, options = {}) {
  const direction = String(options.direction || 'any');
  const preferHigher = options.preferHigher === true;
  const spreadFirst = options.spreadFirst === true;
  const leftDirectionPenalty = direction === 'down'
    ? (left.matches > target ? 1 : 0)
    : (direction === 'up' ? (left.matches < target ? 1 : 0) : 0);
  const rightDirectionPenalty = direction === 'down'
    ? (right.matches > target ? 1 : 0)
    : (direction === 'up' ? (right.matches < target ? 1 : 0) : 0);
  if (leftDirectionPenalty !== rightDirectionPenalty) return leftDirectionPenalty - rightDirectionPenalty;

  if (spreadFirst) {
    const leftSpreadGap = Math.max(0, left.playSpread - left.theoreticalPlaySpread);
    const rightSpreadGap = Math.max(0, right.playSpread - right.theoreticalPlaySpread);
    if (leftSpreadGap !== rightSpreadGap) return leftSpreadGap - rightSpreadGap;
    if (left.maxConsecutivePlay !== right.maxConsecutivePlay) return left.maxConsecutivePlay - right.maxConsecutivePlay;
  }

  const leftDistance = Math.abs(left.matches - target);
  const rightDistance = Math.abs(right.matches - target);
  if (leftDistance !== rightDistance) return leftDistance - rightDistance;
  if (!spreadFirst && left.maxConsecutivePlay !== right.maxConsecutivePlay) {
    return left.maxConsecutivePlay - right.maxConsecutivePlay;
  }
  return preferHigher ? (right.matches - left.matches) : (left.matches - right.matches);
}

function pickCandidateForSlot(candidates, usedMatches, target, options = {}) {
  const available = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate && !usedMatches.has(candidate.matches));
  if (!available.length) return null;
  return available.slice().sort((left, right) => compareCandidatesForSlot(left, right, target, options))[0] || null;
}

function finalizePresetSelection(selection) {
  const presetMatches = Object.values(selection || {})
    .filter(Boolean)
    .map((candidate) => candidate.matches)
    .filter((value, index, list) => list.indexOf(value) === index)
    .sort((left, right) => left - right);
  return {
    presetMatches,
    balancedMatch: Number(selection && selection.balanced && selection.balanced.matches) || 0,
    selection
  };
}

function buildSlotSelection(slotTargets, primaryCandidates, secondaryCandidates, fallbackCandidates = []) {
  const usedMatches = new Set();
  const selection = {};
  const slotSpecs = [
    { key: 'low', target: Number(slotTargets.low) || 1, direction: 'down', preferHigher: false },
    { key: 'balanced', target: Number(slotTargets.balanced) || Number(slotTargets.low) || 1, direction: 'any', preferHigher: false },
    { key: 'high', target: Number(slotTargets.high) || Number(slotTargets.balanced) || Number(slotTargets.low) || 1, direction: 'up', preferHigher: true }
  ];

  for (const slot of slotSpecs) {
    let candidate = pickCandidateForSlot(primaryCandidates, usedMatches, slot.target, slot);
    if (!candidate) {
      candidate = pickCandidateForSlot(secondaryCandidates, usedMatches, slot.target, slot);
    }
    if (!candidate) {
      candidate = pickCandidateForSlot(fallbackCandidates, usedMatches, slot.target, {
        ...slot,
        spreadFirst: true
      });
    }
    if (!candidate) continue;
    selection[slot.key] = candidate;
    usedMatches.add(candidate.matches);
  }

  return selection;
}

function buildRegularPresetSelection(candidates, slotTargets) {
  const primaryCandidates = candidates.filter(isZeroSpreadExactCandidate);
  const secondaryCandidates = candidates.filter((candidate) => (
    isQualityAcceptableCandidate(candidate) && !primaryCandidates.some((item) => item.matches === candidate.matches)
  ));
  const fallbackCandidates = candidates.filter((candidate) => (
    !primaryCandidates.some((item) => item.matches === candidate.matches)
      && !secondaryCandidates.some((item) => item.matches === candidate.matches)
  ));
  return finalizePresetSelection(buildSlotSelection(
    slotTargets,
    primaryCandidates,
    secondaryCandidates,
    fallbackCandidates
  ));
}

function buildCoveragePresetSelection(baseSelection, candidates) {
  const presetMatches = Array.isArray(baseSelection && baseSelection.presetMatches)
    ? baseSelection.presetMatches
    : [];
  const acceptableCandidates = candidates.filter(isQualityAcceptableCandidate);
  const coverageCandidate = acceptableCandidates
    .filter((candidate) => candidate.allPartnerPairsCovered)
    .sort((left, right) => left.matches - right.matches)[0] || null;
  if (!coverageCandidate || presetMatches.includes(coverageCandidate.matches)) return null;

  const highestAcceptable = acceptableCandidates
    .slice()
    .sort((left, right) => left.matches - right.matches)
    .slice(-1)[0] || null;
  if (!highestAcceptable || !presetMatches.length) return null;

  const lowTarget = Math.max(...presetMatches);
  const slotTargets = {
    low: lowTarget,
    balanced: (lowTarget + highestAcceptable.matches) / 2,
    high: highestAcceptable.matches
  };
  const selection = buildSlotSelection(slotTargets, acceptableCandidates, [], []);
  if (!selection.low || !selection.balanced || !selection.high) return null;

  const alreadyIncluded = [selection.low, selection.balanced, selection.high]
    .filter(Boolean)
    .some((candidate) => candidate.matches === coverageCandidate.matches);
  if (!alreadyIncluded) {
    const lowDistance = Math.abs(selection.low.matches - coverageCandidate.matches);
    const balancedDistance = Math.abs(selection.balanced.matches - coverageCandidate.matches);
    const replaceKey = balancedDistance <= lowDistance ? 'balanced' : 'low';
    selection[replaceKey] = coverageCandidate;
  }

  return finalizePresetSelection(selection);
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
  const candidates = [];

  for (let matches = 1; matches <= horizonMatches; matches += 1) {
    const candidate = buildPresetCandidate(caseData, matches);
    if (candidate) candidates.push(candidate);
  }
  const slotTargets = extractRecommendationTargets(recommendation);
  const regularSelection = buildRegularPresetSelection(candidates, slotTargets);
  const coverageSelection = buildCoveragePresetSelection(regularSelection, candidates);
  return coverageSelection || regularSelection;
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
