// squad_doubles 专用 beam search 引擎
// 设计目标：保证 A 队两人 + B 队两人的对阵结构下的全局公平性
// 不依赖 rotationDoublesEngine，避免污染 multi_rotate 稳定路径

const { performance: nodePerf } = require('perf_hooks');
const { pairKey, stableSortIds } = require('./utils');
const {
  incrementalSquareCost,
  normalizeSeed,
  hashString,
  countComb,
  enumerateCombinations,
  computeCountSpread,
  computeRoundsSinceRest
} = require('./schedulerShared');

// 使用 performance.now() 代替 Date.now()，避免 WSL2/虚拟化环境下系统时钟跳变
const perfNowBase = nodePerf.now();
const dateNowBase = Date.now();
function nowMs() {
  return dateNowBase + (nodePerf.now() - perfNowBase);
}

function deadlineReached(deadlineAtMs) {
  return Number(deadlineAtMs) > 0 && nowMs() >= Number(deadlineAtMs);
}

// 把一组 active 选手（偶数个）穷举拆分成 k 个不相交的 2 人对
// 返回：Array<Array<[id, id]>>，每个子数组是一种"全部分完"的方案
function enumeratePairPartitions(active, options = {}) {
  const results = [];
  if (!active.length || active.length % 2 !== 0) return results;
  const sorted = stableSortIds(active);
  const n = sorted.length;
  const used = new Array(n).fill(false);
  const current = [];
  const limit = Math.max(0, Number(options.limit) || 0);
  const deadlineAtMs = Number(options.deadlineAtMs) || 0;

  const walk = () => {
    if ((limit > 0 && results.length >= limit) || deadlineReached(deadlineAtMs)) return;
    // 找第一个未用的元素作 pair 的 left
    let left = -1;
    for (let i = 0; i < n; i += 1) {
      if (!used[i]) { left = i; break; }
    }
    if (left === -1) {
      results.push(current.slice());
      return;
    }
    used[left] = true;
    for (let right = left + 1; right < n; right += 1) {
      if ((limit > 0 && results.length >= limit) || deadlineReached(deadlineAtMs)) break;
      if (used[right]) continue;
      used[right] = true;
      current.push([sorted[left], sorted[right]]);
      walk();
      current.pop();
      used[right] = false;
    }
    used[left] = false;
  };
  walk();
  return results;
}

function buildMatchupKey(teamA, teamB) {
  // squad 有 A/B 方向性，key 保留方向
  const a = stableSortIds(teamA).join('&');
  const b = stableSortIds(teamB).join('&');
  return `A[${a}]vsB[${b}]`;
}

function pairStableKey(pair) {
  return stableSortIds(pair).join('&');
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
    const cmp = compareRestPriorityEntry(a, b);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

// squad 的评分函数：
// 对 squad 而言，对手遭遇均衡的重要性 >= 搭档均衡（因为 A/B 队伍天然分隔，搭档空间更小）
function compareObjective(left, right) {
  if (left.playSpread !== right.playSpread) return left.playSpread - right.playSpread;
  if (left.maxConsecutivePlay !== right.maxConsecutivePlay) return left.maxConsecutivePlay - right.maxConsecutivePlay;
  if (left.opponentPenalty !== right.opponentPenalty) return left.opponentPenalty - right.opponentPenalty;
  if (left.partnerPenalty !== right.partnerPenalty) return left.partnerPenalty - right.partnerPenalty;
  if (left.uniqueMatchupCount !== right.uniqueMatchupCount) return right.uniqueMatchupCount - left.uniqueMatchupCount;
  if (left.restPriorityTotal !== right.restPriorityTotal) return right.restPriorityTotal - left.restPriorityTotal;
  return 0;
}

function compareState(left, right) {
  const cmp = compareObjective(left.objective, right.objective);
  if (cmp !== 0) return cmp;
  return String(left.historyKey || '').localeCompare(String(right.historyKey || ''));
}

function buildInitialState(idsA, idsB) {
  const all = idsA.concat(idsB);
  return {
    rounds: [],
    matchCount: 0,
    playCount: Object.fromEntries(all.map((id) => [id, 0])),
    byeCount: Object.fromEntries(all.map((id) => [id, 0])),
    playStreak: Object.fromEntries(all.map((id) => [id, 0])),
    restStreak: Object.fromEntries(all.map((id) => [id, 0])),
    lastRestRound: Object.fromEntries(all.map((id) => [id, -1])),
    partnerCount: {},
    opponentCount: {},
    usedMatchupKeys: new Set(),
    uniqueMatchupCount: 0,
    partnerPenalty: 0,
    opponentPenalty: 0,
    playSpread: 0,
    maxConsecutivePlay: 0,
    restPriorityTotal: 0,
    historyKey: '',
    objective: {
      playSpread: 0,
      maxConsecutivePlay: 0,
      opponentPenalty: 0,
      partnerPenalty: 0,
      uniqueMatchupCount: 0,
      restPriorityTotal: 0
    }
  };
}

function buildBeamContext(idsA, idsB, totalMatches, courts, config = {}) {
  const sortedA = stableSortIds(idsA);
  const sortedB = stableSortIds(idsB);
  const packageSize = Math.max(1, Math.min(
    Number(courts) || 1,
    Math.floor(sortedA.length / 2),
    Math.floor(sortedB.length / 2)
  ));
  return {
    idsA: sortedA,
    idsB: sortedB,
    allIds: sortedA.concat(sortedB),
    totalMatches,
    courts,
    packageSize,
    activeASize: packageSize * 2,
    activeBSize: packageSize * 2,
    beamWidth: Number(config.beamWidth) || 48,
    restSetLimit: Number(config.restSetLimit) || 10,
    packageLimit: Number(config.packageLimit) || 24,
    perStateLimit: Number(config.perStateLimit) || 8,
    greedyRestLimit: Number(config.greedyRestLimit) || 0,
    timeBudgetMs: Number(config.timeBudgetMs) || 180,
    deadlineAtMs: Number(config.deadlineAtMs) || 0
  };
}

// 为某队枚举"谁坐下"的候选
function enumerateRestForSquad(teamIds, restCount, state, limit, deadlineAtMs = 0) {
  if (restCount <= 0) return [[]];
  const n = teamIds.length;
  const totalComb = countComb(n, restCount);
  const comboLimit = Math.max(1, Number(limit) || 0);
  const rankedPool = teamIds.slice().sort((left, right) => {
    const lb = Number(state.byeCount[left]) || 0;
    const rb = Number(state.byeCount[right]) || 0;
    if (lb !== rb) return lb - rb;
    const lr = computeRoundsSinceRest(state, state.rounds.length, left);
    const rr = computeRoundsSinceRest(state, state.rounds.length, right);
    if (lr !== rr) return rr - lr;
    const ls = Number(state.playStreak[left]) || 0;
    const rs = Number(state.playStreak[right]) || 0;
    if (ls !== rs) return rs - ls;
    return left.localeCompare(right);
  });
  const shouldEarlyStop = totalComb > comboLimit;
  const result = [];
  enumerateCombinations(rankedPool, restCount, (combo) => {
    result.push(combo.slice());
    if (!shouldEarlyStop) return true;
    return result.length < comboLimit;
  }, { stable: false, deadlineAtMs, nowFn: nowMs });
  return result;
}

// 评分：把一个 (pairA, pairB) 配对的增量成本计算出来
function scoreMatchup(pairA, pairB, state) {
  const pkA = pairKey(pairA[0], pairA[1]);
  const pkB = pairKey(pairB[0], pairB[1]);
  const partnerDelta = incrementalSquareCost(state.partnerCount[pkA] || 0)
    + incrementalSquareCost(state.partnerCount[pkB] || 0);
  let opponentDelta = 0;
  for (const a of pairA) {
    for (const b of pairB) {
      opponentDelta += incrementalSquareCost(state.opponentCount[pairKey(a, b)] || 0);
    }
  }
  const matchupKey = buildMatchupKey(pairA, pairB);
  const isNew = state.usedMatchupKeys.has(matchupKey) ? 0 : 1;
  return { partnerDelta, opponentDelta, isNew, matchupKey };
}

function buildPackageCandidate(score, tail, seed) {
  const matchupKeys = [score.matchupKey].concat(tail.matchupKeys);
  const stableKey = matchupKeys.slice().sort().join(' || ');
  return {
    matches: [{
      teamA: score.pairA.slice(),
      teamB: score.pairB.slice(),
      matchupKey: score.matchupKey
    }].concat(tail.matches),
    matchupKeys,
    partnerDelta: score.partnerDelta + tail.partnerDelta,
    opponentDelta: score.opponentDelta + tail.opponentDelta,
    newMatchups: score.isNew + tail.newMatchups,
    seedRank: hashString(`${normalizeSeed(seed)}::${stableKey}`),
    stableKey
  };
}

function comparePackageCandidateMetrics(left, right) {
  if (right.newMatchups !== left.newMatchups) return right.newMatchups - left.newMatchups;
  if (left.opponentDelta !== right.opponentDelta) return left.opponentDelta - right.opponentDelta;
  if (left.partnerDelta !== right.partnerDelta) return left.partnerDelta - right.partnerDelta;
  if (left.seedRank !== right.seedRank) return left.seedRank - right.seedRank;
  return left.stableKey.localeCompare(right.stableKey);
}

function selectBestPackageForPartitions(partitionA, partitionB, state, seed, deadlineAtMs = 0) {
  const packageSize = partitionA.length;
  if (packageSize !== partitionB.length) return null;
  const scoreMatrix = partitionA.map((pairA) => {
    return partitionB.map((pairB) => ({
      pairA,
      pairB,
      ...scoreMatchup(pairA, pairB, state)
    }));
  });
  const cache = new Map();

  const solve = (index, usedMask) => {
    if (deadlineReached(deadlineAtMs)) return null;
    if (index >= packageSize) {
      return {
        matches: [],
        matchupKeys: [],
        partnerDelta: 0,
        opponentDelta: 0,
        newMatchups: 0,
        seedRank: 0,
        stableKey: ''
      };
    }
    const cacheKey = `${index}:${usedMask}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    let best = null;
    for (let bIndex = 0; bIndex < packageSize; bIndex += 1) {
      if ((usedMask & (1 << bIndex)) !== 0) continue;
      const score = scoreMatrix[index][bIndex];
      const tail = solve(index + 1, usedMask | (1 << bIndex));
      if (!tail) continue;
      const candidate = buildPackageCandidate(score, tail, seed);
      if (!best || comparePackageCandidateMetrics(candidate, best) < 0) {
        best = candidate;
      }
    }
    cache.set(cacheKey, best);
    return best;
  };

  return solve(0, 0);
}

function buildActivePairEntries(activeIds) {
  const sorted = stableSortIds(activeIds);
  const entries = [];
  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      entries.push({
        pair: [sorted[left], sorted[right]],
        mask: (1 << left) | (1 << right),
        stableKey: pairStableKey([sorted[left], sorted[right]])
      });
    }
  }
  entries.sort((left, right) => left.stableKey.localeCompare(right.stableKey));
  return entries;
}

function firstUnusedBitIndex(mask, size) {
  for (let index = 0; index < size; index += 1) {
    if ((mask & (1 << index)) === 0) return index;
  }
  return -1;
}

function selectBestPackageForLargeActiveSet(activeA, activeB, state, seed, deadlineAtMs = 0) {
  if (activeA.length !== activeB.length || activeA.length < 6) return null;

  const pairsA = buildActivePairEntries(activeA);
  const pairsB = buildActivePairEntries(activeB);
  const fullAMask = (1 << activeA.length) - 1;
  const fullBMask = (1 << activeB.length) - 1;
  const scoreMatrix = pairsA.map((entryA) => pairsB.map((entryB) => ({
    pairA: entryA.pair,
    pairB: entryB.pair,
    ...scoreMatchup(entryA.pair, entryB.pair, state)
  })));
  const cache = new Map();

  const solve = (usedAMask, usedBMask) => {
    if (deadlineReached(deadlineAtMs)) return null;
    if (usedAMask === fullAMask && usedBMask === fullBMask) {
      return {
        matches: [],
        matchupKeys: [],
        partnerDelta: 0,
        opponentDelta: 0,
        newMatchups: 0,
        seedRank: 0,
        stableKey: ''
      };
    }
    const cacheKey = `${usedAMask}:${usedBMask}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const anchorIndex = firstUnusedBitIndex(usedAMask, activeA.length);
    let best = null;

    for (let aIndex = 0; aIndex < pairsA.length; aIndex += 1) {
      const pairA = pairsA[aIndex];
      if ((pairA.mask & usedAMask) !== 0) continue;
      if ((pairA.mask & (1 << anchorIndex)) === 0) continue;
      for (let bIndex = 0; bIndex < pairsB.length; bIndex += 1) {
        const pairB = pairsB[bIndex];
        if ((pairB.mask & usedBMask) !== 0) continue;
        const tail = solve(usedAMask | pairA.mask, usedBMask | pairB.mask);
        if (!tail) continue;
        const candidate = buildPackageCandidate(scoreMatrix[aIndex][bIndex], tail, seed);
        if (!best || comparePackageCandidateMetrics(candidate, best) < 0) {
          best = candidate;
        }
      }
    }

    cache.set(cacheKey, best);
    return best;
  };

  return solve(0, 0);
}

// 生成本轮对阵组合候选（packageSize 场比赛）
// 枚举 A 的 pair 分割 × B 的 pair 分割，然后用 bitmask DP 选最优 bijection
function buildPackageCandidates(activeA, activeB, state, context, seed) {
  const packageSize = activeA.length / 2;
  if (packageSize <= 0) return [];
  if (activeA.length !== activeB.length) return [];
  if (deadlineReached(context.deadlineAtMs)) return [];

  if (activeA.length >= 6) {
    const bestPackage = selectBestPackageForLargeActiveSet(
      activeA,
      activeB,
      state,
      seed,
      context.deadlineAtMs
    );
    return bestPackage ? [bestPackage] : [];
  }

  // 限制组合爆炸：partition 数量过大时截断
  const maxPartitionsPerSide = context.packageLimit * 2;
  const pa = enumeratePairPartitions(activeA, {
    limit: maxPartitionsPerSide,
    deadlineAtMs: context.deadlineAtMs
  });
  const pb = enumeratePairPartitions(activeB, {
    limit: maxPartitionsPerSide,
    deadlineAtMs: context.deadlineAtMs
  });

  const packages = [];
  const seen = new Set();

  for (const partitionA of pa) {
    if (deadlineReached(context.deadlineAtMs)) break;
    for (const partitionB of pb) {
      if (deadlineReached(context.deadlineAtMs)) break;
      const bestPackage = selectBestPackageForPartitions(
        partitionA,
        partitionB,
        state,
        seed,
        context.deadlineAtMs
      );
      if (!bestPackage) continue;
      if (seen.has(bestPackage.stableKey)) continue;
      seen.add(bestPackage.stableKey);
      packages.push(bestPackage);
    }
  }

  packages.sort(comparePackageCandidateMetrics);

  return packages.slice(0, context.packageLimit);
}

// 生成本轮所有候选（rest 选择 × 对阵组合）
function buildRoundCandidates(state, context, seed) {
  const remaining = context.totalMatches - state.matchCount;
  if (remaining <= 0) return [];
  if (deadlineReached(context.deadlineAtMs)) return [];
  const packageSize = Math.min(context.packageSize, remaining);
  const restACount = context.idsA.length - (packageSize * 2);
  const restBCount = context.idsB.length - (packageSize * 2);

  const restA_list = enumerateRestForSquad(
    context.idsA,
    restACount,
    state,
    context.restSetLimit,
    context.deadlineAtMs
  );
  const restB_list = enumerateRestForSquad(
    context.idsB,
    restBCount,
    state,
    context.restSetLimit,
    context.deadlineAtMs
  );

  // 评分 rest 方案：按 rest 后的 playSpread / playStreak 指标排序取 top
  const restCandidates = [];
  for (const restA of restA_list) {
    if (deadlineReached(context.deadlineAtMs)) break;
    for (const restB of restB_list) {
      if (deadlineReached(context.deadlineAtMs)) break;
      const restIds = restA.concat(restB);
      const activeA = context.idsA.filter((id) => !restA.includes(id));
      const activeB = context.idsB.filter((id) => !restB.includes(id));
      // 估算下一步 playCount
      const nextPlayCount = { ...state.playCount };
      let nextMaxConsecutive = state.maxConsecutivePlay;
      for (const id of activeA.concat(activeB)) {
        nextPlayCount[id] = (nextPlayCount[id] || 0) + 1;
        const ns = (state.playStreak[id] || 0) + 1;
        if (ns > nextMaxConsecutive) nextMaxConsecutive = ns;
      }
      const restVector = restIds.map((id) => ({
        id,
        roundsSinceRest: computeRoundsSinceRest(state, state.rounds.length, id),
        playStreak: Number(state.playStreak[id]) || 0
      })).sort(compareRestPriorityEntry);
      const restPriorityDelta = restVector.reduce((sum, item) => sum + (item.roundsSinceRest * 100) + item.playStreak, 0);
      restCandidates.push({
        restA,
        restB,
        activeA,
        activeB,
        nextPlaySpread: computeCountSpread(nextPlayCount, context.allIds),
        nextMaxConsecutive,
        restVector,
        restPriorityDelta,
        stableKey: `${restA.join(',')}|${restB.join(',')}`
      });
    }
  }

  restCandidates.sort((l, r) => {
    if (l.nextPlaySpread !== r.nextPlaySpread) return l.nextPlaySpread - r.nextPlaySpread;
    if (l.nextMaxConsecutive !== r.nextMaxConsecutive) return l.nextMaxConsecutive - r.nextMaxConsecutive;
    const vectorCmp = compareRestPriorityVector(l.restVector, r.restVector);
    if (vectorCmp !== 0) return vectorCmp;
    return l.stableKey.localeCompare(r.stableKey);
  });

  // rest 候选截断：只有当 restCandidates 极多时才裁剪，避免过早丢弃对均衡有利的 rest 方案
  // 6v6 courts=2 有 C(6,2)²=225 种组合，4v4 有 36 种，均应全量通过
  const largeRoster = Math.max(context.idsA.length, context.idsB.length) >= 9;
  const limitedRest = largeRoster && restCandidates.length > context.restSetLimit
    ? restCandidates.slice(0, context.restSetLimit)
    : (restCandidates.length <= 512
      ? restCandidates
      : restCandidates.slice(0, context.restSetLimit));

  const greedyRestLimit = Math.max(0, Number(context.greedyRestLimit) || 0);
  const packageRestCandidates = greedyRestLimit > 0
    ? limitedRest.slice(0, greedyRestLimit)
    : limitedRest;

  const roundCandidates = [];
  for (const restCand of packageRestCandidates) {
    if (deadlineReached(context.deadlineAtMs)) break;
    const packages = buildPackageCandidates(restCand.activeA, restCand.activeB, state, context, seed);
    for (const pkg of packages) {
      if (deadlineReached(context.deadlineAtMs)) break;
      const combined = `${restCand.stableKey}::${pkg.stableKey}`;
      roundCandidates.push({
        restCandidate: restCand,
        packageCandidate: pkg,
        stableKey: combined,
        // seedRank 基于 stateSeed（= seed，已包含 historyKey 哈希）——
        // 不同路径的 beam state 使用不同的 stateSeed，相同候选的 seedRank 因此不同
        // 这让每个 beam state 探索不同的并列候选顺序，实现真正的多样性
        seedRank: hashString(`${seed}::${combined}`)
      });
    }
  }
  if (!roundCandidates.length) return [];

  // 候选排序：play spread → 连续上场 → 组合代价（等权）→ 新对阵数 → seedRank（per-state 多样性）
  // nextPlaySpread / nextMaxConsecutive 确保 rest 质量优先，seedRank 在真正并列时打破字典序偏倚
  roundCandidates.sort((l, r) => {
    const lPlaySpread = l.restCandidate.nextPlaySpread;
    const rPlaySpread = r.restCandidate.nextPlaySpread;
    if (lPlaySpread !== rPlaySpread) return lPlaySpread - rPlaySpread;
    const lMaxCons = l.restCandidate.nextMaxConsecutive;
    const rMaxCons = r.restCandidate.nextMaxConsecutive;
    if (lMaxCons !== rMaxCons) return lMaxCons - rMaxCons;
    const lp = l.packageCandidate;
    const rp = r.packageCandidate;
    const lCost = lp.opponentDelta + lp.partnerDelta;
    const rCost = rp.opponentDelta + rp.partnerDelta;
    if (lCost !== rCost) return lCost - rCost;
    if (rp.newMatchups !== lp.newMatchups) return rp.newMatchups - lp.newMatchups;
    if (l.seedRank !== r.seedRank) return l.seedRank - r.seedRank;
    return l.stableKey.localeCompare(r.stableKey);
  });

  return roundCandidates.slice(0, context.perStateLimit);
}

function applyRoundCandidate(state, roundCand, context) {
  const next = {
    rounds: state.rounds.slice(),
    matchCount: state.matchCount + roundCand.packageCandidate.matches.length,
    playCount: { ...state.playCount },
    byeCount: { ...state.byeCount },
    playStreak: { ...state.playStreak },
    restStreak: { ...state.restStreak },
    lastRestRound: { ...state.lastRestRound },
    partnerCount: { ...state.partnerCount },
    opponentCount: { ...state.opponentCount },
    usedMatchupKeys: new Set(state.usedMatchupKeys),
    uniqueMatchupCount: state.uniqueMatchupCount,
    partnerPenalty: state.partnerPenalty,
    opponentPenalty: state.opponentPenalty,
    playSpread: state.playSpread,
    maxConsecutivePlay: state.maxConsecutivePlay,
    restPriorityTotal: state.restPriorityTotal,
    historyKey: state.historyKey
  };

  const played = new Set();
  const roundIndex = state.rounds.length;
  const roundMatches = roundCand.packageCandidate.matches.map((m, index) => {
    const teamA = m.teamA.slice();
    const teamB = m.teamB.slice();
    teamA.concat(teamB).forEach((id) => played.add(id));

    const pkA = pairKey(teamA[0], teamA[1]);
    const pkB = pairKey(teamB[0], teamB[1]);
    next.partnerPenalty += incrementalSquareCost(next.partnerCount[pkA] || 0)
      + incrementalSquareCost(next.partnerCount[pkB] || 0);
    next.partnerCount[pkA] = (next.partnerCount[pkA] || 0) + 1;
    next.partnerCount[pkB] = (next.partnerCount[pkB] || 0) + 1;

    for (const a of teamA) {
      for (const b of teamB) {
        const k = pairKey(a, b);
        next.opponentPenalty += incrementalSquareCost(next.opponentCount[k] || 0);
        next.opponentCount[k] = (next.opponentCount[k] || 0) + 1;
      }
    }

    if (!next.usedMatchupKeys.has(m.matchupKey)) {
      next.usedMatchupKeys.add(m.matchupKey);
      next.uniqueMatchupCount += 1;
    }

    return {
      matchIndex: state.matchCount + index,
      matchType: 'SQUAD',
      unitAId: 'A',
      unitBId: 'B',
      unitAName: 'A队',
      unitBName: 'B队',
      teamA,
      teamB,
      status: 'pending',
      logicalRound: roundIndex
    };
  });

  for (const id of context.allIds) {
    if (played.has(id)) {
      next.playCount[id] = (next.playCount[id] || 0) + 1;
      next.playStreak[id] = (state.playStreak[id] || 0) + 1;
      next.restStreak[id] = 0;
      if (next.playStreak[id] > next.maxConsecutivePlay) {
        next.maxConsecutivePlay = next.playStreak[id];
      }
    } else {
      next.byeCount[id] = (next.byeCount[id] || 0) + 1;
      next.playStreak[id] = 0;
      next.restStreak[id] = (state.restStreak[id] || 0) + 1;
      next.lastRestRound[id] = roundIndex;
    }
  }

  next.restPriorityTotal += roundCand.restCandidate.restPriorityDelta;
  next.playSpread = computeCountSpread(next.playCount, context.allIds);
  // 用滚动数字哈希代替字符串拼接，避免字典序偏倚导致 beam 剪枝系统性偏向
  // 特定名字排序靠前（如 A1,A2 rest → A3|A4 上场）会使对应 historyKey 更小而总是存活
  next.historyKey = hashString(`${next.historyKey || 0}:${roundCand.stableKey}`);

  const restPlayers = context.allIds.filter((id) => !played.has(id));
  next.rounds.push({
    roundIndex,
    matches: roundMatches,
    restPlayers
  });

  next.objective = {
    playSpread: next.playSpread,
    maxConsecutivePlay: next.maxConsecutivePlay,
    opponentPenalty: next.opponentPenalty,
    partnerPenalty: next.partnerPenalty,
    uniqueMatchupCount: next.uniqueMatchupCount,
    restPriorityTotal: next.restPriorityTotal
  };
  return next;
}

function greedilyCompleteState(state, context, seed) {
  let current = state;
  while (current && current.matchCount < context.totalMatches) {
    if (context.deadlineAtMs > 0 && nowMs() >= context.deadlineAtMs) break;
    const candidates = buildRoundCandidates(current, context, seed);
    if (!candidates.length) break;
    current = applyRoundCandidate(current, candidates[0], context);
  }
  return current;
}

function runSingleBeam(idsA, idsB, totalMatches, courts, seed, config = {}) {
  const context = buildBeamContext(idsA, idsB, totalMatches, courts, config);
  let beam = [buildInitialState(context.idsA, context.idsB)];
  const startedAt = nowMs();
  let timedOut = false;

  while (beam.length) {
    if (beam.every((s) => s.matchCount >= totalMatches)) break;
    if ((nowMs() - startedAt) >= context.timeBudgetMs) {
      timedOut = true;
      break;
    }
    if (context.deadlineAtMs > 0 && nowMs() >= context.deadlineAtMs) {
      timedOut = true;
      break;
    }
    const expanded = [];
    for (const state of beam) {
      // 内部 deadline 检查：避免单轮扩展多个 state 导致超时
      if (deadlineReached(context.deadlineAtMs)
          || (nowMs() - startedAt) >= context.timeBudgetMs) {
        timedOut = true;
        expanded.push(state);
        continue;
      }
      if (state.matchCount >= totalMatches) {
        expanded.push(state);
        continue;
      }
      // 用状态历史哈希而非单纯轮次作 seed，让不同路径的 beam state 探索不同候选顺序
      const stateSeed = normalizeSeed(seed + (Number(state.historyKey) || state.matchCount));
      const candidates = buildRoundCandidates(state, context, stateSeed);
      for (const cand of candidates) {
        expanded.push(applyRoundCandidate(state, cand, context));
      }
    }
    if (!expanded.length) break;
    expanded.sort(compareState);
    beam = expanded.slice(0, context.beamWidth);
  }

  const completed = beam.filter((s) => s.matchCount >= totalMatches).sort(compareState);
  if (completed.length) {
    return { state: completed[0], timedOut: false };
  }

  // 贪心补齐
  const greedyCompleted = beam
    .map((s) => greedilyCompleteState(s, context, seed + 100003))
    .filter((s) => s && s.matchCount >= totalMatches)
    .sort(compareState);
  if (greedyCompleted.length) {
    return { state: greedyCompleted[0], timedOut };
  }

  const bestPartial = beam.slice().sort(compareState)[0];
  return { state: bestPartial || buildInitialState(context.idsA, context.idsB), timedOut: true };
}

function buildFairnessScore(state) {
  const penalty =
    (state.playSpread * 50000)
    + (state.maxConsecutivePlay * 20000)
    + (state.opponentPenalty * 200)
    + (state.partnerPenalty * 120)
    - (state.restPriorityTotal * 5);
  return Math.max(1, Math.round(1000000 / (1 + Math.max(0, penalty))));
}

function buildStats(rounds, allIds) {
  const playCount = Object.fromEntries(allIds.map((id) => [id, 0]));
  const partnerCount = {};
  const opponentCount = {};
  for (const round of rounds) {
    for (const match of round.matches || []) {
      const teamA = match.teamA || [];
      const teamB = match.teamB || [];
      teamA.concat(teamB).forEach((id) => {
        playCount[id] = (playCount[id] || 0) + 1;
      });
      partnerCount[pairKey(teamA[0], teamA[1])] = (partnerCount[pairKey(teamA[0], teamA[1])] || 0) + 1;
      partnerCount[pairKey(teamB[0], teamB[1])] = (partnerCount[pairKey(teamB[0], teamB[1])] || 0) + 1;
      for (const a of teamA) {
        for (const b of teamB) {
          const k = pairKey(a, b);
          opponentCount[k] = (opponentCount[k] || 0) + 1;
        }
      }
    }
  }
  const partnerRepeats = Object.values(partnerCount).reduce((s, c) => s + Math.max(0, c - 1), 0);
  const opponentRepeats = Object.values(opponentCount).reduce((s, c) => s + Math.max(0, c - 1), 0);
  return { playCount, partnerRepeats, opponentRepeats };
}

function finalizeSchedule(state, idsA, idsB, seed, meta = {}) {
  const allIds = idsA.concat(idsB);
  const stats = buildStats(state.rounds, allIds);
  const fairnessScore = buildFairnessScore(state);
  return {
    rounds: state.rounds,
    fairnessScore,
    fairness: {
      engine: 'squad-v3-beam',
      playSpread: state.playSpread,
      maxConsecutivePlay: state.maxConsecutivePlay,
      partnerRepeats: stats.partnerRepeats,
      opponentRepeats: stats.opponentRepeats,
      partnerPenalty: state.partnerPenalty,
      opponentPenalty: state.opponentPenalty,
      uniqueMatchupCount: state.uniqueMatchupCount,
      restPriorityTotal: state.restPriorityTotal
    },
    playerStats: { playCount: stats.playCount },
    seed,
    executionProfile: String(meta.executionProfile || 'beam-quality'),
    timeoutGuardTriggered: meta.timeoutGuardTriggered === true,
    fallbackReason: String(meta.fallbackReason || ''),
    searchElapsedMs: Number(meta.searchElapsedMs) || 0,
    schedulerMeta: {
      engineVersion: 'squad-v3-beam',
      mode: 'squad_doubles',
      executionProfile: String(meta.executionProfile || 'beam-quality'),
      timeoutGuardTriggered: meta.timeoutGuardTriggered === true,
      fallbackReason: String(meta.fallbackReason || ''),
      searchElapsedMs: Number(meta.searchElapsedMs) || 0,
      effectiveCourts: Number(meta.effectiveCourts) || 0
    }
  };
}

function computeAdaptiveConfig(playersPerSquad, effectiveCourts) {
  // ≤5 人/side, 1 court：组合空间小，多 seed 提升质量
  if (playersPerSquad <= 5 && effectiveCourts === 1) {
    return { searchSeeds: 6, beamWidth: 48, restSetLimit: 48, packageLimit: 24, perStateLimit: 8, timeBudgetMs: 220 };
  }
  // ≤5 人/side, 2 courts：适度缩减 seed，增加单 seed 时间
  if (playersPerSquad <= 5) {
    return { searchSeeds: 4, beamWidth: 40, restSetLimit: 32, packageLimit: 20, perStateLimit: 6, timeBudgetMs: 350 };
  }
  // 6-7 人/side：中等规模，3 seed 平衡搜索宽度与深度
  if (playersPerSquad <= 7) {
    return { searchSeeds: 3, beamWidth: 32, restSetLimit: 24, packageLimit: 16, perStateLimit: 5, timeBudgetMs: 450 };
  }
  // 8+ 人/side, 4 courts：最大规模，最激进的截断
  if (effectiveCourts >= 4) {
    return { searchSeeds: 2, beamWidth: 16, restSetLimit: 12, packageLimit: 8, perStateLimit: 3, timeBudgetMs: 650 };
  }
  // 8+ 人/side, ≤3 courts
  return { searchSeeds: 2, beamWidth: 24, restSetLimit: 16, packageLimit: 12, perStateLimit: 4, timeBudgetMs: 650 };
}

function resolveSquadSchedule(idsA, idsB, totalMatches, courts, options = {}) {
  const sortedA = stableSortIds(idsA);
  const sortedB = stableSortIds(idsB);
  if (sortedA.length < 2 || sortedB.length < 2) return null;
  const target = Math.max(1, Number(totalMatches) || 1);

  const hardDeadlineMs = Number(options.hardDeadlineMs) || 2500;
  const softBudgetMs = Math.min(1700, hardDeadlineMs - 500);
  const startedAt = nowMs();
  const softDeadlineAtMs = startedAt + softBudgetMs;
  const hardDeadlineAtMs = startedAt + hardDeadlineMs;

  const seedStep = Math.max(1, Number(options.seedStep) || 7919);
  const baseSeed = normalizeSeed(options.seed || 1);

  const effectiveCourts = Math.max(1, Math.min(
    Number(courts) || 1,
    Math.floor(sortedA.length / 2),
    Math.floor(sortedB.length / 2)
  ));

  // 自适应运行时配置：根据 (playersPerSquad, effectiveCourts) 调整
  // 关键原则：searchSeeds × timeBudgetMs ≤ softBudgetMs，每个 seed 分到足够时间完成搜索
  const playersPerSquad = Math.max(sortedA.length, sortedB.length);
  const runtimeConfig = computeAdaptiveConfig(playersPerSquad, effectiveCourts);
  const searchSeeds = Math.max(1, Number(options.searchSeeds) || runtimeConfig.searchSeeds);

  let bestCompleted = null;
  let bestPartial = null;
  let softTimeoutTriggered = false;
  let guardedCompletionUsed = false;
  const earlyExitThreshold = Math.max(2, Math.ceil(searchSeeds / 2));

  for (let i = 0; i < searchSeeds; i += 1) {
    if (nowMs() >= softDeadlineAtMs) {
      softTimeoutTriggered = true;
      break;
    }
    const seed = normalizeSeed(baseSeed + (i * seedStep));
    const remaining = Math.max(25, softDeadlineAtMs - nowMs());
    const { state } = runSingleBeam(sortedA, sortedB, target, effectiveCourts, seed, {
      ...runtimeConfig,
      timeBudgetMs: Math.min(runtimeConfig.timeBudgetMs, remaining),
      deadlineAtMs: softDeadlineAtMs
    });
    if (!state) continue;
    if (state.matchCount >= target) {
      if (!bestCompleted || compareState(state, bestCompleted) < 0) {
        bestCompleted = state;
      }
    } else if (!bestPartial || compareState(state, bestPartial) < 0) {
      bestPartial = state;
    }
    // 提前退出：前半数 seed 都没有 complete 且 partial 进度 < 50%，留时间给 greedy completion
    if (!bestCompleted && i + 1 >= earlyExitThreshold && bestPartial
        && bestPartial.matchCount < target * 0.5) {
      softTimeoutTriggered = true;
      break;
    }
  }

  // 如果没有完整方案，尝试用 partial 贪心补齐（使用更大的参数以提高成功率）
  if (!bestCompleted && bestPartial && nowMs() < hardDeadlineAtMs) {
    const largeRosterGreedyRestLimit = playersPerSquad >= 8
      ? (effectiveCourts >= 4 ? 2 : 4)
      : 0;
    const guardContext = buildBeamContext(sortedA, sortedB, target, effectiveCourts, {
      beamWidth: 32,
      restSetLimit: 16,
      packageLimit: 16,
      perStateLimit: 1,
      greedyRestLimit: largeRosterGreedyRestLimit,
      deadlineAtMs: hardDeadlineAtMs
    });
    const completed = greedilyCompleteState(bestPartial, guardContext, baseSeed + 100003);
    if (completed && completed.matchCount >= target) {
      bestCompleted = completed;
      guardedCompletionUsed = true;
    }
  }

  if (!bestCompleted) return null;
  const searchElapsedMs = nowMs() - startedAt;
  return finalizeSchedule(bestCompleted, sortedA, sortedB, baseSeed, {
    executionProfile: softTimeoutTriggered || guardedCompletionUsed ? 'beam-guarded' : 'beam-quality',
    timeoutGuardTriggered: softTimeoutTriggered || guardedCompletionUsed,
    fallbackReason: guardedCompletionUsed
      ? 'guarded_greedy_completion'
      : (softTimeoutTriggered ? 'soft_deadline_guard' : ''),
    searchElapsedMs,
    effectiveCourts
  });
}

module.exports = {
  resolveSquadSchedule,
  // 导出内部函数便于测试
  _internal: {
    buildInitialState,
    buildRoundCandidates,
    applyRoundCandidate,
    buildBeamContext,
    compareObjective,
    buildFairnessScore,
    enumeratePairPartitions
  }
};
