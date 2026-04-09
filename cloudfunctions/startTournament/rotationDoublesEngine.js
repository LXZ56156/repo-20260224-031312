const { pairKey, stableSortIds } = require('./utils');
const {
  squareCost,
  incrementalSquareCost,
  normalizeSeed,
  hashString,
  countComb,
  enumerateCombinations,
  computeCountSpread,
  computeRoundsSinceRest,
  countDoublesMatchups
} = require('./schedulerShared');

function nowMs() {
  return Date.now();
}

function normalizeTeamKey(team) {
  return stableSortIds(team).join('&');
}

function buildMatchupKey(teamA, teamB) {
  return [normalizeTeamKey(teamA), normalizeTeamKey(teamB)].sort().join(' vs ');
}

function groupKey(players4) {
  return stableSortIds(players4).join('|');
}

function buildMatchesForGroup(group) {
  const players4 = stableSortIds(group);
  if (players4.length !== 4) return [];
  const splits = [
    [[players4[0], players4[1]], [players4[2], players4[3]]],
    [[players4[0], players4[2]], [players4[1], players4[3]]],
    [[players4[0], players4[3]], [players4[1], players4[2]]]
  ];
  return splits.map(([teamA, teamB]) => {
    const left = stableSortIds(teamA);
    const right = stableSortIds(teamB);
    const matchupKey = buildMatchupKey(left, right);
    return {
      players: players4.slice(),
      teamA: left,
      teamB: right,
      matchupKey,
      stableKey: `${groupKey(players4)}::${matchupKey}`
    };
  });
}

function buildAllMatches(ids) {
  const ordered = stableSortIds(ids);
  const out = [];
  enumerateCombinations(ordered, 4, (group) => {
    out.push(...buildMatchesForGroup(group));
  }, { stable: false });
  return out;
}

function buildMatchesForActiveIds(ids, deadlineAtMs = 0) {
  const ordered = stableSortIds(ids);
  const out = [];
  const completed = enumerateCombinations(ordered, 4, (group) => {
    out.push(...buildMatchesForGroup(group));
    return true;
  }, { stable: false, deadlineAtMs, nowFn: nowMs });
  return { matches: out, completed };
}

function deadlineReached(deadlineAtMs) {
  return Number(deadlineAtMs) > 0 && nowMs() >= Number(deadlineAtMs);
}

function compareRestPriorityEntry(left, right) {
  if (left.roundsSinceRest !== right.roundsSinceRest) return right.roundsSinceRest - left.roundsSinceRest;
  if (left.playStreak !== right.playStreak) return right.playStreak - left.playStreak;
  return String(left.id).localeCompare(String(right.id));
}

function compareRestPriorityVector(left, right) {
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a && !b) break;
    if (!a) return 1;
    if (!b) return -1;
    const entryCmp = compareRestPriorityEntry(a, b);
    if (entryCmp !== 0) return entryCmp;
  }
  return 0;
}

function comparePackageCandidate(left, right) {
  if (left.newExactMatchups !== right.newExactMatchups) return right.newExactMatchups - left.newExactMatchups;
  if (left.partnerPenaltyDelta !== right.partnerPenaltyDelta) return left.partnerPenaltyDelta - right.partnerPenaltyDelta;
  if (left.opponentPenaltyDelta !== right.opponentPenaltyDelta) return left.opponentPenaltyDelta - right.opponentPenaltyDelta;
  if (left.seedRank !== right.seedRank) return left.seedRank - right.seedRank;
  return String(left.stableKey || '').localeCompare(String(right.stableKey || ''));
}

function compareRestSetCandidate(left, right) {
  if (left.nextPlaySpread !== right.nextPlaySpread) return left.nextPlaySpread - right.nextPlaySpread;
  if (left.nextMaxConsecutivePlay !== right.nextMaxConsecutivePlay) return left.nextMaxConsecutivePlay - right.nextMaxConsecutivePlay;
  if (left.byeCountSpread !== right.byeCountSpread) return left.byeCountSpread - right.byeCountSpread;
  const vectorCmp = compareRestPriorityVector(left.restPriorityVector, right.restPriorityVector);
  if (vectorCmp !== 0) return vectorCmp;
  if (left.seedRank !== right.seedRank) return left.seedRank - right.seedRank;
  return String(left.stableKey || '').localeCompare(String(right.stableKey || ''));
}

function compareRoundCandidate(left, right) {
  const restCmp = compareRestSetCandidate(left.restCandidate, right.restCandidate);
  if (restCmp !== 0) return restCmp;
  const packageCmp = comparePackageCandidate(left.packageCandidate, right.packageCandidate);
  if (packageCmp !== 0) return packageCmp;
  return String(left.stableKey || '').localeCompare(String(right.stableKey || ''));
}

function compareObjective(left, right) {
  if (left.playSpread !== right.playSpread) return left.playSpread - right.playSpread;
  if (left.maxConsecutivePlay !== right.maxConsecutivePlay) return left.maxConsecutivePlay - right.maxConsecutivePlay;
  if (left.restPriorityTotal !== right.restPriorityTotal) return right.restPriorityTotal - left.restPriorityTotal;
  if (left.uniqueExactMatchupCount !== right.uniqueExactMatchupCount) return right.uniqueExactMatchupCount - left.uniqueExactMatchupCount;
  if ((left.partnerCoverageCount || 0) !== (right.partnerCoverageCount || 0)) return (right.partnerCoverageCount || 0) - (left.partnerCoverageCount || 0);
  if (left.partnerPenalty !== right.partnerPenalty) return left.partnerPenalty - right.partnerPenalty;
  if (left.opponentPenalty !== right.opponentPenalty) return left.opponentPenalty - right.opponentPenalty;
  return 0;
}

function compareBeamState(left, right) {
  if (left.playSpread !== right.playSpread) return left.playSpread - right.playSpread;
  if ((left.targetPlayGap || 0) !== (right.targetPlayGap || 0)) return (left.targetPlayGap || 0) - (right.targetPlayGap || 0);
  if (left.maxConsecutivePlay !== right.maxConsecutivePlay) return left.maxConsecutivePlay - right.maxConsecutivePlay;
  if (left.restPriorityTotal !== right.restPriorityTotal) return right.restPriorityTotal - left.restPriorityTotal;
  if (left.uniqueExactMatchupCount !== right.uniqueExactMatchupCount) return right.uniqueExactMatchupCount - left.uniqueExactMatchupCount;
  if ((left.partnerCoverageCount || 0) !== (right.partnerCoverageCount || 0)) return (right.partnerCoverageCount || 0) - (left.partnerCoverageCount || 0);
  if (left.partnerPenalty !== right.partnerPenalty) return left.partnerPenalty - right.partnerPenalty;
  if (left.opponentPenalty !== right.opponentPenalty) return left.opponentPenalty - right.opponentPenalty;
  return 0;
}

function compareState(left, right) {
  const objectiveCmp = compareObjective(left.objective, right.objective);
  if (objectiveCmp !== 0) return objectiveCmp;
  return String(left.historyKey || '').localeCompare(String(right.historyKey || ''));
}

function computeEffectiveCourts(playersCount, requestedCourts) {
  const players = Math.max(0, Number(playersCount) || 0);
  const requested = Math.max(1, Number(requestedCourts) || 1);
  const maxConcurrent = Math.max(1, Math.floor(players / 4));
  return Math.max(1, Math.min(requested, maxConcurrent));
}

function buildTemplateKey(playersCount, courts) {
  const players = Math.max(0, Number(playersCount) || 0);
  const effectiveCourts = computeEffectiveCourts(players, courts);
  return `${players}p-${effectiveCourts}c`;
}

function theoreticalPlaySpread(playersCount, totalMatches) {
  const totalPlayers = Math.max(1, Number(playersCount) || 1);
  const matches = Math.max(0, Number(totalMatches) || 0);
  const totalPlays = matches * 4;
  return Math.ceil(totalPlays / totalPlayers) - Math.floor(totalPlays / totalPlayers);
}

function buildInitialState(ids) {
  return {
    rounds: [],
    matchCount: 0,
    playCount: Object.fromEntries(ids.map((id) => [id, 0])),
    byeCount: Object.fromEntries(ids.map((id) => [id, 0])),
    playStreak: Object.fromEntries(ids.map((id) => [id, 0])),
    restStreak: Object.fromEntries(ids.map((id) => [id, 0])),
    maxRestStreak: Object.fromEntries(ids.map((id) => [id, 0])),
    lastRestRound: Object.fromEntries(ids.map((id) => [id, -1])),
    partnerCount: {},
    opponentCount: {},
    usedMatchupKeys: new Set(),
    uniqueMatchupCount: 0,
    partnerCoverageCount: 0,
    partnerPenalty: 0,
    opponentPenalty: 0,
    playSpread: 0,
    targetPlayGap: 0,
    maxConsecutivePlay: 0,
    restPriorityTotal: 0,
    historyKey: '',
    objective: {
      playSpread: 0,
      targetPlayGap: 0,
      maxConsecutivePlay: 0,
      restPriorityTotal: 0,
      uniqueExactMatchupCount: 0,
      partnerCoverageCount: 0,
      partnerPenalty: 0,
      opponentPenalty: 0
    }
  };
}

function buildBeamContext(ids, totalMatches, courts, config = {}) {
  const totalUniqueMatchups = countDoublesMatchups(ids.length);
  const useLazyMatchEnumeration = ids.length >= 20 || totalUniqueMatchups > 12000;
  return {
    ids: stableSortIds(ids),
    totalMatches,
    courts,
    lowTargetPlay: Math.floor((totalMatches * 4) / Math.max(1, ids.length)),
    highTargetPlay: Math.ceil((totalMatches * 4) / Math.max(1, ids.length)),
    totalUniqueMatchups,
    useLazyMatchEnumeration,
    allMatches: useLazyMatchEnumeration ? null : buildAllMatches(ids),
    activeMatchCache: new Map(),
    beamWidth: Number(config.beamWidth) || 64,
    restSetLimit: Number(config.restSetLimit) || 12,
    packageLimit: Number(config.packageLimit) || 24,
    perStateLimit: Number(config.perStateLimit) || 8,
    forceUniqueAll: config.forceUniqueAll === true,
    preferFreshExact: config.preferFreshExact !== false,
    enforceTargetBounds: config.enforceTargetBounds === true,
    timeBudgetMs: Number(config.timeBudgetMs) || 150,
    deadlineAtMs: Number(config.deadlineAtMs) || 0,
    templateKey: buildTemplateKey(ids.length, courts)
  };
}

function buildObjectiveFromState(state) {
  return {
    playSpread: state.playSpread,
    targetPlayGap: state.targetPlayGap || 0,
    maxConsecutivePlay: state.maxConsecutivePlay,
    restPriorityTotal: state.restPriorityTotal,
    uniqueExactMatchupCount: state.uniqueMatchupCount,
    partnerCoverageCount: state.partnerCoverageCount || 0,
    partnerPenalty: state.partnerPenalty,
    opponentPenalty: state.opponentPenalty
  };
}

function computeTargetPlayGap(playCount, ids, remainingRounds, lowTargetPlay, highTargetPlay) {
  let gap = 0;
  for (const id of ids) {
    const current = Number(playCount[id]) || 0;
    if (current > highTargetPlay) {
      gap += current - highTargetPlay;
      continue;
    }
    if ((current + remainingRounds) < lowTargetPlay) {
      gap += lowTargetPlay - (current + remainingRounds);
    }
  }
  return gap;
}

function isTargetPlayReachable(playCount, ids, remainingRounds, lowTargetPlay, highTargetPlay) {
  for (const id of ids) {
    const current = Number(playCount[id]) || 0;
    if (current > highTargetPlay) return false;
    if ((current + remainingRounds) < lowTargetPlay) return false;
  }
  return true;
}

function buildRestCandidate(ids, restIds, state, seed) {
  const roundIndex = state.rounds.length;
  const rested = new Set(restIds);
  const activeIds = ids.filter((id) => !rested.has(id));

  const nextPlayCount = { ...state.playCount };
  const nextByeCount = { ...state.byeCount };
  let nextMaxConsecutivePlay = state.maxConsecutivePlay || 0;
  const restPriorityVector = restIds.map((id) => ({
    id,
    roundsSinceRest: computeRoundsSinceRest(state, roundIndex, id),
    playStreak: Number(state.playStreak[id]) || 0
  })).sort(compareRestPriorityEntry);
  const restPriorityScoreDelta = restPriorityVector.reduce((sum, item) => sum + (item.roundsSinceRest * 100) + item.playStreak, 0);

  for (const id of activeIds) {
    nextPlayCount[id] = (nextPlayCount[id] || 0) + 1;
    const nextStreak = (state.playStreak[id] || 0) + 1;
    if (nextStreak > nextMaxConsecutivePlay) nextMaxConsecutivePlay = nextStreak;
  }
  for (const id of restIds) {
    nextByeCount[id] = (nextByeCount[id] || 0) + 1;
  }

  return {
    restIds: stableSortIds(restIds),
    activeIds,
    nextPlayCount,
    nextByeCount,
    nextPlaySpread: computeCountSpread(nextPlayCount, ids),
    nextMaxConsecutivePlay,
    byeCountSpread: computeCountSpread(nextByeCount, ids),
    restPriorityVector,
    restPriorityScoreDelta,
    seedRank: hashString(`${normalizeSeed(seed)}::${restIds.join('|')}`),
    stableKey: restIds.join('|')
  };
}

function scoreSingleMatch(match, state, seed) {
  const p1 = state.partnerCount[pairKey(match.teamA[0], match.teamA[1])] || 0;
  const p2 = state.partnerCount[pairKey(match.teamB[0], match.teamB[1])] || 0;
  let opponentPenaltyDelta = 0;
  for (const a of match.teamA) {
    for (const b of match.teamB) {
      opponentPenaltyDelta += incrementalSquareCost(state.opponentCount[pairKey(a, b)] || 0);
    }
  }
  return {
    match,
    newExactMatchups: state.usedMatchupKeys.has(match.matchupKey) ? 0 : 1,
    partnerPenaltyDelta: incrementalSquareCost(p1) + incrementalSquareCost(p2),
    opponentPenaltyDelta,
    seedRank: hashString(`${normalizeSeed(seed)}::${match.stableKey}`),
    stableKey: match.stableKey
  };
}

function getActiveMatches(context, activeIds) {
  const key = activeIds.join('|');
  if (context.activeMatchCache.has(key)) {
    return context.activeMatchCache.get(key);
  }
  if (!context.useLazyMatchEnumeration && Array.isArray(context.allMatches)) {
    const activeSet = new Set(activeIds);
    const matches = context.allMatches.filter((match) => match.players.every((id) => activeSet.has(id)));
    context.activeMatchCache.set(key, matches);
    return matches;
  }
  const { matches, completed } = buildMatchesForActiveIds(activeIds, context.deadlineAtMs);
  if (completed) {
    context.activeMatchCache.set(key, matches);
  }
  return matches;
}

function buildPackageStableKey(matches) {
  return matches.map((item) => item.matchupKey).sort().join(' || ');
}

function buildPackageCandidates(state, restCandidate, context, seed) {
  const packageSize = restCandidate.activeIds.length / 4;
  if (packageSize <= 0) return [];
  if (deadlineReached(context.deadlineAtMs)) return [];
  const rawMatches = [];
  const activeMatches = getActiveMatches(context, restCandidate.activeIds);
  for (const match of activeMatches) {
    if (deadlineReached(context.deadlineAtMs)) break;
    rawMatches.push(scoreSingleMatch(match, state, seed));
  }
  if (context.forceUniqueAll) {
    for (let i = rawMatches.length - 1; i >= 0; i -= 1) {
      if (rawMatches[i].newExactMatchups !== 1) rawMatches.splice(i, 1);
    }
  }
  rawMatches.sort(comparePackageCandidate);
  const matchLimit = Math.max(context.packageLimit * Math.max(2, packageSize), context.packageLimit);
  const limited = rawMatches.slice(0, matchLimit);
  const packages = [];
  const seen = new Set();
  const chosen = [];
  const usedPlayers = new Set();

  const walk = (startIndex) => {
    if (deadlineReached(context.deadlineAtMs)) return;
    if (packages.length >= context.packageLimit * 4) return;
    if (chosen.length === packageSize) {
      const stableKey = buildPackageStableKey(chosen.map((item) => item.match));
      if (seen.has(stableKey)) return;
      seen.add(stableKey);
      packages.push({
        matches: chosen.map((item) => item.match),
        newExactMatchups: chosen.reduce((sum, item) => sum + item.newExactMatchups, 0),
        partnerPenaltyDelta: chosen.reduce((sum, item) => sum + item.partnerPenaltyDelta, 0),
        opponentPenaltyDelta: chosen.reduce((sum, item) => sum + item.opponentPenaltyDelta, 0),
        seedRank: hashString(`${normalizeSeed(seed)}::${stableKey}`),
        stableKey
      });
      return;
    }

    for (let i = startIndex; i < limited.length; i += 1) {
      if (deadlineReached(context.deadlineAtMs)) return;
      const candidate = limited[i];
      if (candidate.match.players.some((id) => usedPlayers.has(id))) continue;
      candidate.match.players.forEach((id) => usedPlayers.add(id));
      chosen.push(candidate);
      walk(i + 1);
      chosen.pop();
      candidate.match.players.forEach((id) => usedPlayers.delete(id));
    }
  };

  walk(0);
  packages.sort(comparePackageCandidate);
  if (context.forceUniqueAll) {
    return packages.filter((item) => item.newExactMatchups === packageSize).slice(0, context.packageLimit);
  }
  return packages.slice(0, context.packageLimit);
}

function compareRoundFairness(left, right) {
  if (left.nextPlaySpread !== right.nextPlaySpread) return left.nextPlaySpread - right.nextPlaySpread;
  if (left.nextMaxConsecutivePlay !== right.nextMaxConsecutivePlay) return left.nextMaxConsecutivePlay - right.nextMaxConsecutivePlay;
  if (left.byeCountSpread !== right.byeCountSpread) return left.byeCountSpread - right.byeCountSpread;
  return compareRestPriorityVector(left.restPriorityVector, right.restPriorityVector);
}

function applyRoundCandidate(state, roundCandidate, ids) {
  const next = {
    rounds: state.rounds.slice(),
    matchCount: state.matchCount + roundCandidate.packageCandidate.matches.length,
    playCount: { ...state.playCount },
    byeCount: { ...state.byeCount },
    playStreak: { ...state.playStreak },
    restStreak: { ...state.restStreak },
    maxRestStreak: { ...state.maxRestStreak },
    lastRestRound: { ...state.lastRestRound },
    partnerCount: { ...state.partnerCount },
    opponentCount: { ...state.opponentCount },
    usedMatchupKeys: new Set(state.usedMatchupKeys),
    uniqueMatchupCount: state.uniqueMatchupCount,
    partnerCoverageCount: state.partnerCoverageCount || 0,
    partnerPenalty: state.partnerPenalty,
    opponentPenalty: state.opponentPenalty,
    playSpread: state.playSpread,
    targetPlayGap: state.targetPlayGap || 0,
    maxConsecutivePlay: state.maxConsecutivePlay,
    restPriorityTotal: state.restPriorityTotal,
    historyKey: state.historyKey
  };

  const played = new Set();
  const roundMatches = roundCandidate.packageCandidate.matches.map((match, index) => {
    const teamA = match.teamA.slice();
    const teamB = match.teamB.slice();
    teamA.concat(teamB).forEach((id) => played.add(id));

    const pk1 = pairKey(teamA[0], teamA[1]);
    const pk2 = pairKey(teamB[0], teamB[1]);
    const p1 = next.partnerCount[pk1] || 0;
    const p2 = next.partnerCount[pk2] || 0;
    if (p1 === 0) next.partnerCoverageCount += 1;
    if (p2 === 0) next.partnerCoverageCount += 1;
    next.partnerPenalty += incrementalSquareCost(p1) + incrementalSquareCost(p2);
    next.partnerCount[pk1] = p1 + 1;
    next.partnerCount[pk2] = p2 + 1;

    for (const a of teamA) {
      for (const b of teamB) {
        const key = pairKey(a, b);
        const current = next.opponentCount[key] || 0;
        next.opponentPenalty += incrementalSquareCost(current);
        next.opponentCount[key] = current + 1;
      }
    }

    if (!next.usedMatchupKeys.has(match.matchupKey)) {
      next.usedMatchupKeys.add(match.matchupKey);
      next.uniqueMatchupCount += 1;
    }

    return {
      matchIndex: state.matchCount + index,
      matchType: '',
      teamA,
      teamB,
      status: 'pending',
      score: null
    };
  });

  const restPlayers = ids.filter((id) => !played.has(id));
  const roundIndex = state.rounds.length;
  for (const id of ids) {
    if (played.has(id)) {
      next.playCount[id] = (next.playCount[id] || 0) + 1;
      next.playStreak[id] = (state.playStreak[id] || 0) + 1;
      next.restStreak[id] = 0;
      if (next.playStreak[id] > next.maxConsecutivePlay) next.maxConsecutivePlay = next.playStreak[id];
    } else {
      next.byeCount[id] = (next.byeCount[id] || 0) + 1;
      next.playStreak[id] = 0;
      next.restStreak[id] = (state.restStreak[id] || 0) + 1;
      next.lastRestRound[id] = roundIndex;
      if (next.restStreak[id] > (next.maxRestStreak[id] || 0)) {
        next.maxRestStreak[id] = next.restStreak[id];
      }
    }
  }

  next.restPriorityTotal += roundCandidate.restCandidate.restPriorityScoreDelta;
  next.playSpread = computeCountSpread(next.playCount, ids);
  const totalMatches = Math.max(next.matchCount, Number(roundCandidate.totalMatches) || next.matchCount);
  const remainingMatches = Math.max(0, totalMatches - next.matchCount);
  const remainingRounds = Math.ceil(remainingMatches / Math.max(1, Number(roundCandidate.courts) || 1));
  next.targetPlayGap = computeTargetPlayGap(
    next.playCount,
    ids,
    remainingRounds,
    Number(roundCandidate.lowTargetPlay) || 0,
    Number(roundCandidate.highTargetPlay) || 0
  );
  const packageKey = `${roundCandidate.restCandidate.stableKey}::${roundCandidate.packageCandidate.stableKey}`;
  next.historyKey = next.historyKey ? `${next.historyKey}>>${packageKey}` : packageKey;
  next.rounds.push({
    roundIndex,
    matches: roundMatches,
    restPlayers
  });
  next.objective = buildObjectiveFromState(next);
  return next;
}

function buildRoundCandidates(state, context, seed) {
  const remainingMatches = context.totalMatches - state.matchCount;
  const packageSize = Math.min(context.courts, remainingMatches, Math.floor(context.ids.length / 4));
  if (packageSize <= 0) return [];
  if (deadlineReached(context.deadlineAtMs)) return [];

  const restCount = context.ids.length - (packageSize * 4);
  const restCandidates = [];
  if (restCount <= 0) {
    restCandidates.push(buildRestCandidate(context.ids, [], state, seed));
  } else {
    const totalComb = countComb(context.ids.length, restCount);
    const shouldEnumerateAll = totalComb <= Math.max(512, context.restSetLimit * 12);
    const rankedPool = context.ids.slice().sort((left, right) => {
      const leftByes = Number(state.byeCount[left]) || 0;
      const rightByes = Number(state.byeCount[right]) || 0;
      if (leftByes !== rightByes) return leftByes - rightByes;
      const leftRounds = computeRoundsSinceRest(state, state.rounds.length, left);
      const rightRounds = computeRoundsSinceRest(state, state.rounds.length, right);
      if (leftRounds !== rightRounds) return rightRounds - leftRounds;
      const leftStreak = Number(state.playStreak[left]) || 0;
      const rightStreak = Number(state.playStreak[right]) || 0;
      if (leftStreak !== rightStreak) return rightStreak - leftStreak;
      return left.localeCompare(right);
    });
    const restPool = shouldEnumerateAll
      ? rankedPool
      : rankedPool.slice(0, Math.min(rankedPool.length, Math.max(restCount + 5, context.restSetLimit + 3)));
    enumerateCombinations(restPool, restCount, (combo) => {
      if (deadlineReached(context.deadlineAtMs)) return false;
      restCandidates.push(buildRestCandidate(context.ids, combo, state, seed));
      return true;
    }, { stable: false, deadlineAtMs: context.deadlineAtMs, nowFn: nowMs });
  }

  const remainingMatchesAfterRound = Math.max(0, context.totalMatches - state.matchCount - packageSize);
  const remainingRoundsAfterRound = Math.ceil(remainingMatchesAfterRound / Math.max(1, context.courts));
  const reachableRestCandidates = context.enforceTargetBounds
    ? restCandidates.filter((candidate) => isTargetPlayReachable(
      candidate.nextPlayCount,
      context.ids,
      remainingRoundsAfterRound,
      context.lowTargetPlay,
      context.highTargetPlay
    ))
    : restCandidates;

  reachableRestCandidates.sort(compareRestSetCandidate);
  const limitedRest = reachableRestCandidates.slice(0, context.restSetLimit);
  const roundCandidates = [];
  for (const restCandidate of limitedRest) {
    if (deadlineReached(context.deadlineAtMs)) break;
    const packages = buildPackageCandidates(state, restCandidate, context, seed);
    for (const packageCandidate of packages) {
      if (deadlineReached(context.deadlineAtMs)) break;
      roundCandidates.push({
        restCandidate,
        packageCandidate,
        stableKey: `${restCandidate.stableKey}::${packageCandidate.stableKey}`
      });
    }
  }
  if (!roundCandidates.length) return [];

  if (!context.forceUniqueAll && context.preferFreshExact !== false) {
    const allNew = roundCandidates.filter((item) => item.packageCandidate.newExactMatchups === item.packageCandidate.matches.length);
    if (allNew.length) {
      const bestAllNew = allNew.slice().sort(compareRoundCandidate)[0];
      return roundCandidates
        .filter((candidate) => (
          candidate.packageCandidate.newExactMatchups === candidate.packageCandidate.matches.length ||
          compareRoundFairness(candidate.restCandidate, bestAllNew.restCandidate) < 0
        ))
        .sort(compareRoundCandidate)
        .slice(0, context.perStateLimit);
    }
  }

  return roundCandidates.sort(compareRoundCandidate).slice(0, context.perStateLimit);
}

function greedilyCompleteState(state, context, seed) {
  let current = state;
  while (current && current.matchCount < context.totalMatches) {
    if (context.deadlineAtMs > 0 && nowMs() >= context.deadlineAtMs) break;
    const nextRounds = buildRoundCandidates(current, context, seed);
    if (!nextRounds.length) break;
    current = applyRoundCandidate(current, {
      ...nextRounds[0],
      totalMatches: context.totalMatches,
      courts: context.courts,
      lowTargetPlay: context.lowTargetPlay,
      highTargetPlay: context.highTargetPlay
    }, context.ids);
  }
  return current;
}

function runSingleBeam(ids, totalMatches, courts, seed, config = {}) {
  const context = buildBeamContext(ids, totalMatches, courts, config);
  let beam = [buildInitialState(context.ids)];
  const startedAt = nowMs();
  let timedOut = false;

  while (beam.length) {
    if (beam.every((state) => state.matchCount >= totalMatches)) break;
    if ((nowMs() - startedAt) >= context.timeBudgetMs) {
      timedOut = true;
      break;
    }
    if (deadlineReached(context.deadlineAtMs)) {
      timedOut = true;
      break;
    }
    const expanded = [];
    for (const state of beam) {
      if (deadlineReached(context.deadlineAtMs)) {
        timedOut = true;
        break;
      }
      if (state.matchCount >= totalMatches) {
        expanded.push(state);
        continue;
      }
      const nextRounds = buildRoundCandidates(state, context, seed + state.matchCount);
      for (const roundCandidate of nextRounds) {
        expanded.push(applyRoundCandidate(state, {
          ...roundCandidate,
          totalMatches: context.totalMatches,
          courts: context.courts,
          lowTargetPlay: context.lowTargetPlay,
          highTargetPlay: context.highTargetPlay
        }, context.ids));
      }
    }
    if (!expanded.length) break;
    expanded.sort((left, right) => {
      const beamCmp = compareBeamState(left.objective, right.objective);
      if (beamCmp !== 0) return beamCmp;
      return compareState(left, right);
    });
    beam = expanded.slice(0, context.beamWidth);
  }

  const completed = beam.filter((state) => state.matchCount >= totalMatches).sort(compareState);
  if (completed.length) {
    return { state: completed[0], timedOut: false };
  }

  const greedyCompleted = beam
    .map((state) => greedilyCompleteState(state, context, seed + 100003))
    .filter((state) => state && state.matchCount >= totalMatches)
    .sort(compareState);
  if (greedyCompleted.length) {
    return { state: greedyCompleted[0], timedOut };
  }

  const bestPartial = beam.slice().sort(compareState)[0];
  return { state: bestPartial || buildInitialState(context.ids), timedOut: true };
}

function buildStats(rounds, ids) {
  const playCount = Object.fromEntries(ids.map((id) => [id, 0]));
  const partnerCount = {};
  const opponentCount = {};
  const maxRestStreak = Object.fromEntries(ids.map((id) => [id, 0]));
  const restStreak = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const round of rounds) {
    const played = new Set();
    for (const match of round.matches || []) {
      const teamA = match.teamA || [];
      const teamB = match.teamB || [];
      teamA.concat(teamB).forEach((id) => {
        played.add(id);
        playCount[id] = (playCount[id] || 0) + 1;
      });
      const pk1 = pairKey(teamA[0], teamA[1]);
      const pk2 = pairKey(teamB[0], teamB[1]);
      partnerCount[pk1] = (partnerCount[pk1] || 0) + 1;
      partnerCount[pk2] = (partnerCount[pk2] || 0) + 1;
      for (const a of teamA) {
        for (const b of teamB) {
          const key = pairKey(a, b);
          opponentCount[key] = (opponentCount[key] || 0) + 1;
        }
      }
    }
    for (const id of ids) {
      if (played.has(id)) {
        restStreak[id] = 0;
      } else {
        restStreak[id] = (restStreak[id] || 0) + 1;
        if (restStreak[id] > (maxRestStreak[id] || 0)) {
          maxRestStreak[id] = restStreak[id];
        }
      }
    }
  }
  const partnerValues = Object.values(partnerCount);
  const opponentValues = Object.values(opponentCount);
  const partnerRepeats = partnerValues.reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const opponentRepeats = opponentValues.reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return {
    playCount,
    maxRestStreak,
    partnerRepeats,
    opponentRepeats
  };
}

function buildFairnessScore(state, totalUniqueMatchups) {
  const uniqueGap = Math.max(0, totalUniqueMatchups - state.uniqueMatchupCount);
  const penalty =
    (state.playSpread * 50000) +
    (state.maxConsecutivePlay * 20000) +
    (uniqueGap * 12000) +
    (state.partnerPenalty * 120) +
    (state.opponentPenalty * 10) -
    (state.restPriorityTotal * 5);
  return Math.max(1, Math.round(1000000 / (1 + Math.max(0, penalty))));
}

function finalizeSchedule(state, ids, seed, meta = {}) {
  const stats = buildStats(state.rounds, ids);
  const totalUniqueMatchups = Number(meta.totalUniqueMatchups) || countDoublesMatchups(ids.length);
  const fairnessScore = buildFairnessScore(state, totalUniqueMatchups);
  return {
    rounds: state.rounds,
    playerStats: {
      playCount: stats.playCount,
      partnerRepeats: stats.partnerRepeats,
      opponentRepeats: stats.opponentRepeats,
      maxRestStreak: stats.maxRestStreak,
      matchTypeCount: { MX: 0, MM: 0, FF: 0 },
      uniqueMatchupCount: state.uniqueMatchupCount
    },
    fairness: {
      mode: 'doubles',
      playSpread: state.playSpread,
      maxConsecutivePlay: state.maxConsecutivePlay,
      restPriorityTotal: state.restPriorityTotal,
      uniqueMatchupCount: state.uniqueMatchupCount,
      totalUniqueMatchups,
      partnerRepeats: stats.partnerRepeats,
      opponentRepeats: stats.opponentRepeats,
      partnerPenalty: state.partnerPenalty,
      opponentPenalty: state.opponentPenalty
    },
    objective: {
      ...state.objective,
      totalUniqueMatchups
    },
    fairnessScore,
    seed,
    engine: meta.engine || 'beam',
    templateKey: meta.templateKey || '',
    templateVariantId: meta.templateVariantId || '',
    templateHorizon: Number(meta.templateHorizon) || 0,
    effectiveCourts: Math.max(1, Number(meta.effectiveCourts) || computeEffectiveCourts(ids.length, 1)),
    searchSeedsUsed: Number(meta.searchSeedsUsed) || 0,
    triedSeeds: Array.isArray(meta.triedSeeds) ? meta.triedSeeds.slice() : [],
    timedOut: meta.timedOut === true,
    executionProfile: String(meta.executionProfile || meta.engine || 'beam'),
    timeoutGuardTriggered: meta.timeoutGuardTriggered === true,
    fallbackReason: String(meta.fallbackReason || '')
  };
}

function countScheduledMatches(rounds) {
  return (Array.isArray(rounds) ? rounds : []).reduce((sum, round) => {
    return sum + ((round && Array.isArray(round.matches)) ? round.matches.length : 0);
  }, 0);
}

function loadTemplateLibrary() {
  try {
    // Keep lazy load so the generator can run before the file exists.
    // eslint-disable-next-line global-require
    const library = require('./rotation.templates');
    if (library && typeof library === 'object') return library;
  } catch (_) {
    // ignore
  }
  return { version: 'missing', cases: {} };
}

function findTemplateCase(playersCount, courts, totalMatches, library = null) {
  const templateLibrary = library || loadTemplateLibrary();
  const templateKey = buildTemplateKey(playersCount, courts);
  const templateCase = templateLibrary && templateLibrary.cases ? templateLibrary.cases[templateKey] : null;
  if (!templateCase) return null;
  if (Math.max(1, Number(totalMatches) || 1) > Number(templateCase.horizonMatches || 0)) return null;
  return {
    templateKey,
    templateCase,
    effectiveCourts: computeEffectiveCourts(playersCount, courts)
  };
}

function mapTemplateValue(value, orderedIds) {
  const index = Number(value);
  if (!Number.isFinite(index) || index < 1 || index > orderedIds.length) {
    throw new Error(`invalid template player index: ${value}`);
  }
  return orderedIds[index - 1];
}

function instantiateTemplate(caseData, ids, totalMatches) {
  const orderedIds = stableSortIds(ids);
  const variantId = String(
    (caseData.bestPrefixByMatchCount && (caseData.bestPrefixByMatchCount[String(totalMatches)] || caseData.bestPrefixByMatchCount[totalMatches]))
      || (Array.isArray(caseData.variants) && caseData.variants[0] && caseData.variants[0].id)
      || ''
  );
  const variant = (Array.isArray(caseData.variants) ? caseData.variants : []).find((item) => String(item.id || '') === variantId);
  if (!variant) return null;

  const rounds = [];
  let matchIndex = 0;
  for (let roundIndex = 0; roundIndex < (variant.rounds || []).length && matchIndex < totalMatches; roundIndex += 1) {
    const sourceRound = variant.rounds[roundIndex] || {};
    const sourceMatches = Array.isArray(sourceRound.matches) ? sourceRound.matches : [];
    const roundMatches = [];
    for (let i = 0; i < sourceMatches.length && matchIndex < totalMatches; i += 1) {
      const sourceMatch = sourceMatches[i] || {};
      const teamA = (Array.isArray(sourceMatch.teamA) ? sourceMatch.teamA : []).map((value) => mapTemplateValue(value, orderedIds));
      const teamB = (Array.isArray(sourceMatch.teamB) ? sourceMatch.teamB : []).map((value) => mapTemplateValue(value, orderedIds));
      roundMatches.push({
        matchIndex,
        matchType: '',
        teamA,
        teamB,
        status: 'pending',
        score: null
      });
      matchIndex += 1;
    }
    if (!roundMatches.length) continue;
    const played = new Set();
    roundMatches.forEach((match) => {
      match.teamA.concat(match.teamB).forEach((id) => played.add(id));
    });
    rounds.push({
      roundIndex: rounds.length,
      matches: roundMatches,
      restPlayers: orderedIds.filter((id) => !played.has(id))
    });
  }

  const replay = buildInitialState(orderedIds);
  let current = replay;
  for (const round of rounds) {
    const packageCandidate = {
      matches: (round.matches || []).map((match) => ({
        teamA: stableSortIds(match.teamA),
        teamB: stableSortIds(match.teamB),
        players: stableSortIds((match.teamA || []).concat(match.teamB || [])),
        matchupKey: buildMatchupKey(match.teamA, match.teamB),
        stableKey: `${groupKey((match.teamA || []).concat(match.teamB || []))}::${buildMatchupKey(match.teamA, match.teamB)}`
      }))
    };
    const restCandidate = buildRestCandidate(orderedIds, round.restPlayers || [], current, 1);
    current = applyRoundCandidate(current, {
      restCandidate,
      packageCandidate: {
        matches: packageCandidate.matches,
        newExactMatchups: packageCandidate.matches.length,
        partnerPenaltyDelta: 0,
        opponentPenaltyDelta: 0,
        stableKey: buildPackageStableKey(packageCandidate.matches)
      },
      totalMatches,
      courts: caseData.courts,
      lowTargetPlay: Math.floor((totalMatches * 4) / Math.max(1, orderedIds.length)),
      highTargetPlay: Math.ceil((totalMatches * 4) / Math.max(1, orderedIds.length))
    }, orderedIds);
  }

  return finalizeSchedule(current, orderedIds, 0, {
    engine: 'template',
    templateKey: buildTemplateKey(caseData.players, caseData.courts),
    templateVariantId: variantId,
    templateHorizon: caseData.horizonMatches,
    effectiveCourts: computeEffectiveCourts(caseData.players, caseData.courts),
    totalUniqueMatchups: Number(caseData.totalUniqueMatchups) || countDoublesMatchups(orderedIds.length),
    searchSeedsUsed: 0,
    triedSeeds: []
  });
}

function pickBestOutput(outputs) {
  return outputs
    .filter(Boolean)
    .slice()
    .sort((left, right) => {
      const cmp = compareObjective(left.objective || {}, right.objective || {});
      if (cmp !== 0) return cmp;
      return Number(left.seed || 0) - Number(right.seed || 0);
    })[0] || null;
}

function generateBeamSchedules(ids, totalMatches, courts, options = {}) {
  const searchSeeds = Math.max(1, Number(options.searchSeeds) || 4);
  const seedStep = Math.max(1, Number(options.seedStep) || 7919);
  const baseSeed = normalizeSeed(options.seed);
  const outputs = [];
  const totalUniqueMatchups = countDoublesMatchups(ids.length);
  for (let i = 0; i < searchSeeds; i += 1) {
    const seed = normalizeSeed(baseSeed + (i * seedStep));
    const { state, timedOut } = runSingleBeam(ids, totalMatches, courts, seed, options);
    outputs.push(finalizeSchedule(state, stableSortIds(ids), seed, {
      engine: 'beam',
      totalUniqueMatchups,
      searchSeedsUsed: searchSeeds,
      triedSeeds: [seed],
      timedOut,
      executionProfile: 'beam-quality',
      timeoutGuardTriggered: false
    }));
  }
  return outputs;
}

function pickBestStateCandidate(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  const cmp = compareState(left.state, right.state);
  if (cmp !== 0) return cmp <= 0 ? left : right;
  return Number(left.seed || 0) <= Number(right.seed || 0) ? left : right;
}

function createRuntimeQualityConfig(courts) {
  return courts === 1
    ? { beamWidth: 64, restSetLimit: 12, packageLimit: 24, perStateLimit: 10, timeBudgetMs: 150, preferFreshExact: true }
    : { beamWidth: 96, restSetLimit: 16, packageLimit: 32, perStateLimit: 12, timeBudgetMs: 220, preferFreshExact: true };
}

function createGuardedConfig(courts, deadlineAtMs) {
  return courts === 1
    ? {
      beamWidth: 24,
      restSetLimit: 6,
      packageLimit: 12,
      perStateLimit: 3,
      preferFreshExact: false,
      enforceTargetBounds: false,
      deadlineAtMs
    }
    : {
      beamWidth: 32,
      restSetLimit: 8,
      packageLimit: 12,
      perStateLimit: 4,
      preferFreshExact: false,
      enforceTargetBounds: false,
      deadlineAtMs
    };
}

function resolveRuntimeSchedule(ids, totalMatches, courts, options = {}) {
  const templateLibrary = loadTemplateLibrary();
  const effectiveCourts = computeEffectiveCourts(ids.length, courts);
  const templateMatch = findTemplateCase(ids.length, effectiveCourts, totalMatches, templateLibrary);
  if (templateMatch && templateMatch.templateCase) {
    const out = instantiateTemplate(templateMatch.templateCase, ids, totalMatches);
    if (out && countScheduledMatches(out.rounds) >= totalMatches) {
      out.engine = 'template';
      out.templateKey = templateMatch.templateKey;
      out.executionProfile = 'template';
      out.timeoutGuardTriggered = false;
      out.fallbackReason = '';
      out.effectiveCourts = effectiveCourts;
      return out;
    }
  }

  const triedSeeds = [];
  const beamSearchSeeds = Math.max(1, Number(options.searchSeeds) || 4);
  const seedStep = Math.max(1, Number(options.seedStep) || 7919);
  const baseSeed = normalizeSeed(options.seed);
  const outputs = [];
  const runtimeConfig = createRuntimeQualityConfig(effectiveCourts);
  const totalUniqueMatchups = countDoublesMatchups(ids.length);
  const softDeadlineAtMs = Number(options.softDeadlineAtMs) || 0;
  const guardDeadlineAtMs = Number(options.guardDeadlineAtMs) || 0;
  let timeoutGuardTriggered = false;
  let bestPartial = null;
  for (let i = 0; i < beamSearchSeeds; i += 1) {
    const now = nowMs();
    if (softDeadlineAtMs > 0 && now >= softDeadlineAtMs) {
      timeoutGuardTriggered = true;
      break;
    }
    const seed = normalizeSeed(baseSeed + (i * seedStep));
    triedSeeds.push(seed);
    const remainingToSoft = softDeadlineAtMs > 0 ? Math.max(0, softDeadlineAtMs - now) : runtimeConfig.timeBudgetMs;
    const { state, timedOut } = runSingleBeam(ids, totalMatches, effectiveCourts, seed, {
      ...runtimeConfig,
      timeBudgetMs: Math.max(25, Math.min(runtimeConfig.timeBudgetMs, remainingToSoft || runtimeConfig.timeBudgetMs)),
      deadlineAtMs: softDeadlineAtMs,
      forceUniqueAll: false
    });
    bestPartial = pickBestStateCandidate(bestPartial, { state, seed });
    outputs.push(finalizeSchedule(state, stableSortIds(ids), seed, {
      engine: 'beam',
      totalUniqueMatchups,
      searchSeedsUsed: triedSeeds.length,
      triedSeeds,
      timedOut,
      effectiveCourts,
      executionProfile: 'beam-quality',
      timeoutGuardTriggered: false
    }));
  }
  const completedOutputs = outputs.filter((item) => countScheduledMatches(item.rounds) >= totalMatches);
  const bestCompleted = pickBestOutput(completedOutputs);
  const searchedAllSeeds = triedSeeds.length >= beamSearchSeeds;
  if (!timeoutGuardTriggered && searchedAllSeeds && bestCompleted) {
    bestCompleted.triedSeeds = triedSeeds.slice();
    bestCompleted.searchSeedsUsed = triedSeeds.length;
    bestCompleted.effectiveCourts = effectiveCourts;
    bestCompleted.executionProfile = 'beam-quality';
    bestCompleted.timeoutGuardTriggered = false;
    bestCompleted.fallbackReason = '';
    return bestCompleted;
  }

  timeoutGuardTriggered = timeoutGuardTriggered || !bestCompleted;
  if (bestCompleted) {
    bestCompleted.triedSeeds = triedSeeds.slice();
    bestCompleted.searchSeedsUsed = triedSeeds.length;
    bestCompleted.effectiveCourts = effectiveCourts;
    bestCompleted.executionProfile = 'beam-guarded';
    bestCompleted.timeoutGuardTriggered = timeoutGuardTriggered;
    bestCompleted.fallbackReason = 'soft_deadline_guard';
    return bestCompleted;
  }

  if (!bestPartial) return null;
  if (guardDeadlineAtMs > 0 && nowMs() >= guardDeadlineAtMs) return null;
  const guardContext = buildBeamContext(ids, totalMatches, effectiveCourts, createGuardedConfig(effectiveCourts, guardDeadlineAtMs));
  const guardedState = greedilyCompleteState(bestPartial.state, guardContext, bestPartial.seed + 100003);
  if (!guardedState || guardedState.matchCount < totalMatches) return null;
  return finalizeSchedule(guardedState, stableSortIds(ids), bestPartial.seed, {
    engine: 'beam',
    totalUniqueMatchups,
    searchSeedsUsed: triedSeeds.length,
    triedSeeds,
    timedOut: false,
    effectiveCourts,
    executionProfile: 'beam-guarded',
    timeoutGuardTriggered: true,
    fallbackReason: 'guarded_greedy_completion'
  });
}

function buildTemplateCase(caseSpec) {
  const players = Math.max(4, Number(caseSpec.players) || 4);
  const courts = Math.max(1, Number(caseSpec.courts) || 1);
  const horizonMatches = Math.max(1, Number(caseSpec.horizonMatches) || 1);
  const handcrafted = buildHandcraftedTemplateCase(players, courts, horizonMatches);
  if (handcrafted) return handcrafted;
  const ids = Array.from({ length: players }, (_, index) => String(index + 1));
  const searchConfig = {
    searchSeeds: Math.max(1, Number(caseSpec.searchSeeds) || 32),
    seedStep: Math.max(1, Number(caseSpec.seedStep) || 7919),
    seed: Math.max(1, Number(caseSpec.seed) || 1),
    beamWidth: Math.max(64, Number(caseSpec.beamWidth) || 512),
    restSetLimit: Math.max(12, Number(caseSpec.restSetLimit) || 24),
    packageLimit: Math.max(24, Number(caseSpec.packageLimit) || 96),
    perStateLimit: Math.max(8, Number(caseSpec.perStateLimit) || 32),
    timeBudgetMs: Math.max(1000, Number(caseSpec.timeBudgetMs) || 15000),
    forceUniqueAll: true,
    enforceTargetBounds: true
  };
  const totalUniqueMatchups = countDoublesMatchups(ids.length);
  const fullOutputs = generateBeamSchedules(ids, horizonMatches, courts, searchConfig);
  const primary = pickBestOutput(fullOutputs);
  if (!primary) {
    throw new Error(`template search failed for ${players}p/${courts}c`);
  }

  const variants = [];
  const bestPrefixByMatchCount = {};
  const prefixMetrics = {};
  const variantBySerializedRounds = new Map();

  const registerVariant = (schedule) => {
    const rounds = (schedule.rounds || []).map((round) => ({
      matches: (round.matches || []).map((match) => ({
        teamA: (match.teamA || []).map((id) => Number(id)),
        teamB: (match.teamB || []).map((id) => Number(id))
      }))
    }));
    const serialized = serializeTemplateRounds(rounds);
    if (variantBySerializedRounds.has(serialized)) {
      return variantBySerializedRounds.get(serialized);
    }
    const id = variants.length === 0 ? 'main' : `v${variants.length + 1}`;
    variants.push({ id, rounds });
    variantBySerializedRounds.set(serialized, id);
    return id;
  };

  const primaryVariantId = registerVariant(primary);
  const primaryCaseData = {
    players,
    courts,
    horizonMatches,
    totalUniqueMatchups,
    variants,
    bestPrefixByMatchCount: {}
  };
  const allowPrefixRepairs = (courts === 1 && players <= 8)
    || (courts === 2 && players <= 14)
    || (courts === 3 && players <= 14);

  for (let m = 1; m <= horizonMatches; m += 1) {
    primaryCaseData.bestPrefixByMatchCount[String(m)] = primaryVariantId;
    const primaryPrefix = instantiateTemplate(primaryCaseData, ids, m);
    const expectedSpread = theoreticalPlaySpread(players, m);
    const uniqueCount = Number(primaryPrefix && primaryPrefix.playerStats && primaryPrefix.playerStats.uniqueMatchupCount) || 0;
    const playSpread = Number(primaryPrefix && primaryPrefix.fairness && primaryPrefix.fairness.playSpread) || 0;

    let variantId = primaryVariantId;
    let bestPrefix = primaryPrefix;
    if (allowPrefixRepairs && (uniqueCount !== m || playSpread !== expectedSpread)) {
      const prefixOutputs = generateBeamSchedules(ids, m, courts, searchConfig);
      const prefixBest = pickBestOutput(prefixOutputs);
      if (!prefixBest) {
        throw new Error(`template prefix search failed for ${players}p/${courts}c @ ${m}`);
      }
      variantId = registerVariant(prefixBest);
      bestPrefix = prefixBest;
    }

    bestPrefixByMatchCount[String(m)] = variantId;
    prefixMetrics[String(m)] = {
      uniqueExactMatchupCount: Number(bestPrefix.playerStats && bestPrefix.playerStats.uniqueMatchupCount) || 0,
      playSpread: Number(bestPrefix.fairness && bestPrefix.fairness.playSpread) || 0,
      maxConsecutivePlay: Number(bestPrefix.fairness && bestPrefix.fairness.maxConsecutivePlay) || 0,
      theoreticalPlaySpread: expectedSpread
    };
  }

  return {
    key: buildTemplateKey(players, courts),
    players,
    courts,
    horizonMatches,
    totalUniqueMatchups,
    variants,
    bestPrefixByMatchCount,
    prefixMetrics
  };
}

function buildTemplateLibrary(caseSpecs = []) {
  const cases = {};
  for (const caseSpec of caseSpecs) {
    const templateCase = buildTemplateCase(caseSpec);
    cases[templateCase.key] = {
      players: templateCase.players,
      courts: templateCase.courts,
      horizonMatches: templateCase.horizonMatches,
      totalUniqueMatchups: templateCase.totalUniqueMatchups,
      variants: templateCase.variants,
      bestPrefixByMatchCount: templateCase.bestPrefixByMatchCount,
      prefixMetrics: templateCase.prefixMetrics
    };
  }
  return {
    version: 'rotation-v3-templates',
    cases
  };
}

function serializeTemplateRounds(rounds) {
  return JSON.stringify((Array.isArray(rounds) ? rounds : []).map((round) => ({
    matches: (Array.isArray(round && round.matches) ? round.matches : []).map((match) => ({
      teamA: (match.teamA || []).map((id) => Number(id)),
      teamB: (match.teamB || []).map((id) => Number(id))
    }))
  })));
}

function buildHandcraftedTemplateCase(players, courts, horizonMatches) {
  if (players === 4 && courts === 1 && horizonMatches <= 3) {
    const rounds = [
      { matches: [{ teamA: [1, 2], teamB: [3, 4] }] },
      { matches: [{ teamA: [1, 3], teamB: [2, 4] }] },
      { matches: [{ teamA: [1, 4], teamB: [2, 3] }] }
    ];
    const ids = Array.from({ length: players }, (_, index) => String(index + 1));
    const prefixMetrics = {};
    for (let m = 1; m <= horizonMatches; m += 1) {
      const schedule = instantiateTemplate({
        players,
        courts,
        horizonMatches,
        totalUniqueMatchups: 3,
        variants: [{ id: 'main', rounds }],
        bestPrefixByMatchCount: { [String(m)]: 'main' }
      }, ids, m);
      prefixMetrics[String(m)] = {
        uniqueExactMatchupCount: Number(schedule.playerStats && schedule.playerStats.uniqueMatchupCount) || 0,
        playSpread: Number(schedule.fairness && schedule.fairness.playSpread) || 0,
        maxConsecutivePlay: Number(schedule.fairness && schedule.fairness.maxConsecutivePlay) || 0,
        theoreticalPlaySpread: theoreticalPlaySpread(players, m)
      };
    }
    const bestPrefixByMatchCount = {};
    for (let m = 1; m <= horizonMatches; m += 1) {
      bestPrefixByMatchCount[String(m)] = 'main';
    }
    return {
      key: buildTemplateKey(players, courts),
      players,
      courts,
      horizonMatches,
      totalUniqueMatchups: 3,
      variants: [{ id: 'main', rounds }],
      bestPrefixByMatchCount,
      prefixMetrics
    };
  }
  if (players === 6 && courts === 1 && horizonMatches <= 18) {
    const rounds = [
      // 前8轮覆盖全部15对搭档（8场×2搭档槽=16，含1对重复），spread=1
      { matches: [{ teamA: [1, 2], teamB: [3, 4] }] },
      { matches: [{ teamA: [1, 3], teamB: [5, 6] }] },
      { matches: [{ teamA: [2, 5], teamB: [4, 6] }] },
      { matches: [{ teamA: [1, 4], teamB: [2, 6] }] },
      { matches: [{ teamA: [3, 5], teamB: [1, 6] }] },
      { matches: [{ teamA: [2, 3], teamB: [4, 5] }] },
      { matches: [{ teamA: [1, 5], teamB: [3, 6] }] },
      { matches: [{ teamA: [2, 4], teamB: [1, 3] }] },
      { matches: [{ teamA: [1, 2], teamB: [3, 5] }] },
      { matches: [{ teamA: [2, 3], teamB: [5, 6] }] },
      { matches: [{ teamA: [1, 2], teamB: [4, 6] }] },
      { matches: [{ teamA: [1, 3], teamB: [4, 5] }] },
      { matches: [{ teamA: [2, 3], teamB: [4, 6] }] },
      { matches: [{ teamA: [1, 3], teamB: [5, 6] }] },
      { matches: [{ teamA: [1, 2], teamB: [4, 5] }] },
      { matches: [{ teamA: [2, 3], teamB: [4, 5] }] },
      { matches: [{ teamA: [1, 2], teamB: [3, 6] }] },
      { matches: [{ teamA: [1, 4], teamB: [5, 6] }] }
    ];
    const ids = Array.from({ length: players }, (_, index) => String(index + 1));
    const prefixMetrics = {};
    for (let m = 1; m <= horizonMatches; m += 1) {
      const schedule = instantiateTemplate({
        players,
        courts,
        horizonMatches,
        totalUniqueMatchups: 45,
        variants: [{ id: 'main', rounds }],
        bestPrefixByMatchCount: { [String(m)]: 'main' }
      }, ids, m);
      prefixMetrics[String(m)] = {
        uniqueExactMatchupCount: Number(schedule.playerStats && schedule.playerStats.uniqueMatchupCount) || 0,
        playSpread: Number(schedule.fairness && schedule.fairness.playSpread) || 0,
        maxConsecutivePlay: Number(schedule.fairness && schedule.fairness.maxConsecutivePlay) || 0,
        theoreticalPlaySpread: theoreticalPlaySpread(players, m)
      };
    }
    const bestPrefixByMatchCount = {};
    for (let m = 1; m <= horizonMatches; m += 1) {
      bestPrefixByMatchCount[String(m)] = 'main';
    }
    return {
      key: buildTemplateKey(players, courts),
      players,
      courts,
      horizonMatches,
      totalUniqueMatchups: 45,
      variants: [{ id: 'main', rounds }],
      bestPrefixByMatchCount,
      prefixMetrics
    };
  }
  return null;
}

module.exports = {
  buildTemplateKey,
  computeEffectiveCourts,
  findTemplateCase,
  theoreticalPlaySpread,
  resolveRuntimeSchedule,
  buildTemplateLibrary
};
