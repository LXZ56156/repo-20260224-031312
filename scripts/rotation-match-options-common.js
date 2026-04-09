const { buildMatchCountRecommendations } = require('../miniprogram/core/ux/capacity');
const { MODE_MULTI_ROTATE } = require('../miniprogram/core/mode');

const MATCH_OPTION_OVERRIDES = Object.freeze({
  '20p-2c': Object.freeze({
    horizonMatches: 18,
    reason: 'keep 2-court large-roster horizon aligned with the stable 12/15/18 recommendation band'
  }),
  '17p-2c': Object.freeze({
    horizonMatches: 18,
    presetMatches: [10, 13, 16],
    balancedMatch: 13,
    reason: 'validated 18-match 2-court horizon; preset band aligned to capacity targets for 17-player large-roster play'
  }),
  '17p-3c': Object.freeze({
    horizonMatches: 16,
    presetMatches: [12, 15, 16],
    balancedMatch: 15,
    reason: 'validated 16-match 3-court horizon; 18-match template search is not the stable expansion point for this roster size'
  }),
  '17p-4c': Object.freeze({
    horizonMatches: 16,
    presetMatches: [12, 15, 16],
    balancedMatch: 15,
    reason: 'validated 16-match 4-court horizon; 18-match template search is not the stable expansion point for this roster size'
  }),
  '18p-2c': Object.freeze({
    horizonMatches: 18,
    presetMatches: [11, 14, 17],
    balancedMatch: 14,
    reason: 'validated 18-match 2-court horizon; preset band aligned to capacity targets for 18-player large-roster play'
  }),
  '18p-3c': Object.freeze({
    horizonMatches: 16,
    presetMatches: [13, 15, 16],
    balancedMatch: 16,
    reason: 'validated 16-match 3-court horizon; 19-match target is beyond the stable template expansion point'
  }),
  '18p-4c': Object.freeze({
    horizonMatches: 16,
    presetMatches: [13, 15, 16],
    balancedMatch: 16,
    reason: 'validated 16-match 4-court horizon; 19-match target is beyond the stable template expansion point'
  }),
  '19p-2c': Object.freeze({
    horizonMatches: 18,
    presetMatches: [11, 14, 17],
    balancedMatch: 14,
    reason: 'validated 18-match 2-court horizon; preset band aligned to capacity targets for 19-player large-roster play'
  }),
  '19p-3c': Object.freeze({
    horizonMatches: 16,
    presetMatches: [13, 15, 16],
    balancedMatch: 16,
    reason: 'validated 16-match 3-court horizon; 21-match target is beyond the stable template expansion point'
  }),
  '19p-4c': Object.freeze({
    horizonMatches: 16,
    presetMatches: [13, 15, 16],
    balancedMatch: 16,
    reason: 'validated 16-match 4-court horizon; 21-match target is beyond the stable template expansion point'
  }),
  '20p-4c': Object.freeze({
    horizonMatches: 16,
    presetMatches: [14, 15, 16],
    balancedMatch: 16,
    reason: 'validated 16-match template horizon; 18-match template search does not converge within practical generation time'
  }),
  '21p-2c': Object.freeze({
    horizonMatches: 16,
    reason: 'validated 16-match template horizon; longer 2-court search does not converge within practical generation time'
  }),
  '24p-1c': Object.freeze({
    horizonMatches: 16,
    presetMatches: [12, 15, 16],
    balancedMatch: 15,
    reason: 'validated 16-match template horizon; planned search points 12/15/18 miss the first stable expansion point'
  }),
  '22p-2c': Object.freeze({
    horizonMatches: 16,
    presetMatches: [13, 15, 16],
    balancedMatch: 16,
    reason: 'validated 16-match template horizon; longer 2-court search does not converge within practical generation time'
  }),
  '23p-2c': Object.freeze({
    horizonMatches: 16,
    reason: 'validated 16-match template horizon; longer 2-court search does not converge within practical generation time'
  }),
  '24p-2c': Object.freeze({
    horizonMatches: 18,
    reason: 'keep 2-court large-roster horizon aligned with the stable 6/12/18 recommendation band'
  }),
  '21p-4c': Object.freeze({
    horizonMatches: 16,
    presetMatches: [14, 15, 16],
    balancedMatch: 16,
    reason: 'validated 16-match template horizon; 18-match template search does not converge within practical generation time'
  }),
  '22p-4c': Object.freeze({
    horizonMatches: 16,
    reason: 'validated 16-match template horizon; 18-match template search does not converge within practical generation time'
  }),
  '23p-4c': Object.freeze({
    horizonMatches: 16,
    presetMatches: [14, 15, 16],
    balancedMatch: 16,
    reason: 'validated 16-match template horizon; 18-match template search does not converge within practical generation time'
  }),
  '24p-4c': Object.freeze({
    horizonMatches: 16,
    reason: 'validated 16-match template horizon; 18-match template search does not converge within practical generation time'
  })
});

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

function buildLargeRosterPresetSelection(candidates, slotTargets, recommendation) {
  const acceptableCandidates = candidates.filter(isQualityAcceptableCandidate);
  if (!acceptableCandidates.length) return null;
  const suggested = Number(recommendation && recommendation.suggestedMatches) || Number(slotTargets.balanced) || 1;
  const usedMatches = new Set();
  const balanced = pickCandidateForSlot(acceptableCandidates, usedMatches, suggested, {
    direction: 'any',
    preferHigher: false
  });
  if (!balanced) return null;
  usedMatches.add(balanced.matches);

  let low = pickCandidateForSlot(acceptableCandidates, usedMatches, Math.min(Number(slotTargets.low) || 1, balanced.matches), {
    direction: 'down',
    preferHigher: false
  });
  if (!low) {
    low = pickCandidateForSlot(acceptableCandidates, usedMatches, balanced.matches - 1, {
      direction: 'down',
      preferHigher: false
    });
  }
  if (low) usedMatches.add(low.matches);

  let high = pickCandidateForSlot(acceptableCandidates, usedMatches, Math.max(Number(slotTargets.high) || suggested, suggested), {
    direction: 'up',
    preferHigher: true
  });
  if (!high) {
    high = pickCandidateForSlot(acceptableCandidates, usedMatches, Math.max(Number(slotTargets.high) || suggested, suggested), {
      direction: 'any',
      preferHigher: true
    });
  }
  if (high) usedMatches.add(high.matches);

  const fillCandidates = acceptableCandidates
    .filter((candidate) => !usedMatches.has(candidate.matches))
    .sort((left, right) => left.matches - right.matches);
  if (!low && fillCandidates.length) {
    low = fillCandidates.shift();
    usedMatches.add(low.matches);
  }
  if (!high && fillCandidates.length) {
    high = fillCandidates.pop();
    usedMatches.add(high.matches);
  }

  if (!low || !high) return null;
  return finalizePresetSelection({ low, balanced, high });
}

function applyPresetSelectionOverride(key, selection) {
  const override = MATCH_OPTION_OVERRIDES[key];
  if (!override) return selection;
  const presetMatches = Array.isArray(override.presetMatches) ? override.presetMatches.slice().sort((a, b) => a - b) : selection.presetMatches;
  const balancedMatch = Number(override.balancedMatch) || selection.balancedMatch;
  return {
    ...selection,
    presetMatches,
    balancedMatch
  };
}

function buildPresetMatches(caseKey, caseData) {
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
  let selection = coverageSelection || regularSelection;

  const shouldPreferLargeRosterBand = (
    players >= 20
    && (courts >= 3 || caseKey === '20p-2c')
  );

  if (
    shouldPreferLargeRosterBand
    || (
      players >= 20
      && courts >= 2
      && Number(selection.balancedMatch) <= (Number(recommendation.suggestedMatches) - 3)
    )
  ) {
    const largeRosterSelection = buildLargeRosterPresetSelection(candidates, slotTargets, recommendation);
    if (
      largeRosterSelection
      && (
        shouldPreferLargeRosterBand
        || Number(largeRosterSelection.balancedMatch) >= Number(selection.balancedMatch)
      )
    ) {
      selection = largeRosterSelection;
    }
  }

  return applyPresetSelectionOverride(caseKey, selection);
}

function buildRecommendationAuditRows(cases) {
  return Object.entries(cases && typeof cases === 'object' ? cases : {})
    .map(([key, caseData]) => {
      const players = Number(caseData && caseData.players) || 0;
      const effectiveCourts = Number(caseData && caseData.effectiveCourts) || Number(caseData && caseData.courts) || 1;
      const recommendation = buildMatchCountRecommendations({
        mode: MODE_MULTI_ROTATE,
        playersCount: players,
        maleCount: players,
        femaleCount: 0,
        unknownCount: 0,
        courts: effectiveCourts
      });
      const presetMatches = Array.isArray(caseData && caseData.presetMatches) ? caseData.presetMatches.slice().sort((a, b) => a - b) : [];
      return {
        key,
        players,
        courts: effectiveCourts,
        horizonMatches: Number(caseData && caseData.horizonMatches) || 0,
        presetMatches,
        presetSignature: presetMatches.join('/'),
        highestPreset: presetMatches.length ? presetMatches[presetMatches.length - 1] : 0,
        balancedMatch: Number(caseData && caseData.balancedMatch) || 0,
        capacitySuggested: Number(recommendation.suggestedMatches) || 0,
        capacityBalancedRaw: Number(recommendation.balancedRaw) || 0,
        capacityIntense: Number(recommendation.recommendedMatches && recommendation.recommendedMatches[2] && recommendation.recommendedMatches[2].m) || 0,
        overrideReason: String(MATCH_OPTION_OVERRIDES[key] && MATCH_OPTION_OVERRIDES[key].reason || '')
      };
    })
    .sort((left, right) => left.players - right.players || left.courts - right.courts);
}

function buildRecommendationAuditIssues(casesOrRows) {
  const rows = Array.isArray(casesOrRows) ? casesOrRows.slice() : buildRecommendationAuditRows(casesOrRows);
  const issues = [];

  rows.forEach((row) => {
    if (row.overrideReason) return;
    if (row.players >= 20 && row.courts >= 2 && row.balancedMatch < (row.capacitySuggested - 3)) {
      issues.push({
        key: row.key,
        players: row.players,
        courts: row.courts,
        code: 'large_roster_shortfall',
        message: `balanced=${row.balancedMatch} capacitySuggested=${row.capacitySuggested}`
      });
    }
  });

  const byPlayers = new Map();
  rows.forEach((row) => {
    if (!byPlayers.has(row.players)) byPlayers.set(row.players, []);
    byPlayers.get(row.players).push(row);
  });

  for (const [players, group] of byPlayers.entries()) {
    if (players < 17) continue;
    const sortedGroup = group.slice().sort((left, right) => left.courts - right.courts);
    for (let index = 1; index < sortedGroup.length; index += 1) {
      const previous = sortedGroup[index - 1];
      const current = sortedGroup[index];
      if (current.overrideReason) continue;
      if (current.horizonMatches < previous.horizonMatches) {
        issues.push({
          key: current.key,
          players,
          courts: current.courts,
          code: 'non_monotonic_horizon',
          message: `${previous.key}:${previous.horizonMatches} -> ${current.key}:${current.horizonMatches}`
        });
      }
      if (current.highestPreset < previous.highestPreset) {
        issues.push({
          key: current.key,
          players,
          courts: current.courts,
          code: 'non_monotonic_high_preset',
          message: `${previous.key}:${previous.highestPreset} -> ${current.key}:${current.highestPreset}`
        });
      }
      if (current.balancedMatch < previous.balancedMatch) {
        issues.push({
          key: current.key,
          players,
          courts: current.courts,
          code: 'non_monotonic_balanced',
          message: `${previous.key}:${previous.balancedMatch} -> ${current.key}:${current.balancedMatch}`
        });
      }
    }

    const largeCourtGroup = sortedGroup.filter((row) => row.courts >= 2 && row.courts <= 4 && !row.overrideReason);
    if (largeCourtGroup.length >= 2) {
      const firstSignature = largeCourtGroup[0].presetSignature;
      const collapsed = largeCourtGroup.every((row) => row.presetSignature === firstSignature) && largeCourtGroup[0].highestPreset <= 12;
      if (collapsed) {
        issues.push({
          key: `${players}p-group`,
          players,
          courts: 0,
          code: 'collapsed_large_courts',
          message: `presets=${firstSignature} across ${largeCourtGroup.map((row) => row.key).join(',')}`
        });
      }
    }
  }

  return issues;
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
    const built = buildPresetMatches(key, caseData);
    const override = MATCH_OPTION_OVERRIDES[key];
    outCases[key] = {
      players,
      effectiveCourts,
      horizonMatches: Number(override && override.horizonMatches) || Number(caseData.horizonMatches) || 0,
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

module.exports = {
  MATCH_OPTION_OVERRIDES,
  buildPresetCandidate,
  isZeroSpreadExactCandidate,
  isQualityAcceptableCandidate,
  extractRecommendationTargets,
  compareCandidatesForSlot,
  pickCandidateForSlot,
  finalizePresetSelection,
  buildSlotSelection,
  buildRegularPresetSelection,
  buildCoveragePresetSelection,
  buildLargeRosterPresetSelection,
  buildPresetMatches,
  buildMatchOptionsLibrary,
  buildRecommendationAuditRows,
  buildRecommendationAuditIssues
};
