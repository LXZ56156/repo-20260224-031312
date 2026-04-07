const fixedPair = require('./lib/fixed-pair');

function pairKey(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function normalizeEndConditionType(type) {
  const v = String(type || '').trim().toLowerCase();
  if (v === 'total_matches' || v === 'total_rounds' || v === 'target_wins') return v;
  return 'total_matches';
}

function sortForRotation(ids, playCount, playStreak, usedSet, opponentCount, rivals) {
  const used = usedSet || new Set();
  const rivalList = Array.isArray(rivals) ? rivals : [];
  const opponentExposure = (id) => {
    if (!rivalList.length || !opponentCount) return 0;
    let total = 0;
    for (const rival of rivalList) {
      total += Number(opponentCount[pairKey(id, rival)] || 0);
    }
    return total;
  };
  return ids
    .filter((id) => !used.has(id))
    .sort((a, b) => {
      const pa = Number(playCount[a] || 0);
      const pb = Number(playCount[b] || 0);
      if (pa !== pb) return pa - pb;
      const oa = opponentExposure(a);
      const ob = opponentExposure(b);
      if (oa !== ob) return oa - ob;
      const sa = Number((playStreak && playStreak[a]) || 0);
      const sb = Number((playStreak && playStreak[b]) || 0);
      if (sa !== sb) return sa - sb;
      return String(a).localeCompare(String(b));
    });
}

function pickPair(
  ownIds,
  playCount,
  partnerCount,
  opponentCount,
  playStreak,
  usedSet = null,
  opponentIds = null
) {
  const sorted = sortForRotation(ownIds, playCount, playStreak, usedSet, opponentCount, opponentIds);
  if (sorted.length < 2) return null;
  const first = sorted[0];
  let second = sorted[1];
  let bestCost = Number.MAX_SAFE_INTEGER;
  const rivals = Array.isArray(opponentIds) ? opponentIds : [];
  for (let i = 1; i < sorted.length; i += 1) {
    const candidate = sorted[i];
    const pk = pairKey(first, candidate);
    const partnerRepeat = Number((partnerCount && partnerCount[pk]) || 0);
    const loadGap = Math.abs(
      Number(playCount[first] || 0) - Number(playCount[candidate] || 0)
    );
    const firstStreak = Number((playStreak && playStreak[first]) || 0);
    const candStreak = Number((playStreak && playStreak[candidate]) || 0);
    const streakPenalty = Math.max(0, firstStreak - 1) + Math.max(0, candStreak - 1);
    let opponentRepeat = 0;
    if (rivals.length && opponentCount) {
      for (const rival of rivals) {
        opponentRepeat += Number(opponentCount[pairKey(first, rival)] || 0);
        opponentRepeat += Number(opponentCount[pairKey(candidate, rival)] || 0);
      }
    }
    const cost = partnerRepeat * 10 + opponentRepeat * 6 + loadGap * 2 + streakPenalty * 5;
    if (cost < bestCost) {
      bestCost = cost;
      second = candidate;
    }
  }
  return [first, second];
}

// squad_doubles 贪心 fallback（v2 实现），用于：
// 1. beam search 超时或失败时
// 2. total_rounds 结束条件（beam 仅处理 target matches）
// 3. 测试强制降级路径
function runSquadGreedyFallback(idsA, idsB, targetMatches, courts, endConditionType, targetRounds) {
  const allIds = idsA.concat(idsB);
  const playCount = {};
  const partnerCount = {};
  const opponentCount = {};
  const playStreak = {};
  for (const id of allIds) {
    playCount[id] = 0;
    playStreak[id] = 0;
  }
  const rounds = [];
  let matchIndex = 0;
  let roundIndex = 0;
  let maxConsecutivePlay = 0;

  while (
    (endConditionType === 'total_rounds' ? roundIndex < targetRounds : matchIndex < targetMatches)
  ) {
    const usedA = new Set();
    const usedB = new Set();
    const matches = [];
    const roundCapacity = Math.max(1, Math.min(
      Number(courts) || 1,
      Math.floor(idsA.length / 2),
      Math.floor(idsB.length / 2)
    ));
    for (
      let slot = 0;
      slot < roundCapacity && (endConditionType === 'total_rounds' ? true : matchIndex < targetMatches);
      slot += 1
    ) {
      const pairA = pickPair(idsA, playCount, partnerCount, opponentCount, playStreak, usedA, null);
      if (!pairA) break;
      const pairB = pickPair(idsB, playCount, partnerCount, opponentCount, playStreak, usedB, pairA);
      if (!pairB) break;
      const pkA = pairKey(pairA[0], pairA[1]);
      const pkB = pairKey(pairB[0], pairB[1]);
      partnerCount[pkA] = (partnerCount[pkA] || 0) + 1;
      partnerCount[pkB] = (partnerCount[pkB] || 0) + 1;
      pairA.forEach((a) => {
        pairB.forEach((b) => {
          const ok = pairKey(a, b);
          opponentCount[ok] = (opponentCount[ok] || 0) + 1;
        });
      });
      for (const id of pairA.concat(pairB)) {
        playCount[id] = (playCount[id] || 0) + 1;
      }
      pairA.forEach((id) => usedA.add(id));
      pairB.forEach((id) => usedB.add(id));
      matches.push({
        matchIndex,
        matchType: 'SQUAD',
        unitAId: 'A',
        unitBId: 'B',
        unitAName: 'A队',
        unitBName: 'B队',
        teamA: pairA.slice(),
        teamB: pairB.slice(),
        status: 'pending',
        logicalRound: roundIndex
      });
      matchIndex += 1;
    }
    if (!matches.length) break;

    const active = new Set();
    matches.forEach((m) => m.teamA.concat(m.teamB).forEach((id) => active.add(id)));
    for (const id of allIds) {
      if (active.has(id)) {
        playStreak[id] = (playStreak[id] || 0) + 1;
        if (playStreak[id] > maxConsecutivePlay) maxConsecutivePlay = playStreak[id];
      } else {
        playStreak[id] = 0;
      }
    }
    const restPlayers = allIds.filter((id) => !active.has(id));
    rounds.push({ roundIndex, matches, restPlayers });
    roundIndex += 1;
  }

  const playValues = Object.values(playCount);
  const playSpread = playValues.length
    ? Math.max(...playValues) - Math.min(...playValues)
    : 0;
  const partnerRepeats = Object.values(partnerCount)
    .reduce((sum, c) => sum + Math.max(0, Number(c) - 1), 0);
  const opponentRepeats = Object.values(opponentCount)
    .reduce((sum, c) => sum + Math.max(0, Number(c) - 1), 0);
  const penalty =
      playSpread * 5000
    + maxConsecutivePlay * 2000
    + partnerRepeats * 120
    + opponentRepeats * 60;
  const fairnessScore = Math.max(1, Math.round(100000 / (1 + penalty)));

  return {
    rounds,
    fairnessScore,
    fairness: {
      engine: 'squad-v2-greedy',
      playSpread,
      maxConsecutivePlay,
      partnerRepeats,
      opponentRepeats
    },
    playerStats: { playCount },
    seed: 0,
    engineVersion: 'squad-v2-greedy'
  };
}

function buildSquadSchedule(players, totalMatches, courts, rules = {}) {
  const idsA = [];
  const idsB = [];
  for (const player of (players || [])) {
    const id = String(player && player.id || '').trim();
    if (!id) continue;
    const squad = String(player && player.squad || '').trim().toUpperCase();
    if (squad === 'A') idsA.push(id);
    if (squad === 'B') idsB.push(id);
  }
  if (idsA.length < 2 || idsB.length < 2) {
    throw new Error('小队转需要 A/B 队至少各 2 人');
  }

  const endConditionType = normalizeEndConditionType(rules.endCondition && rules.endCondition.type);
  const endConditionTarget = Math.max(1, Number(rules.endCondition && rules.endCondition.target) || totalMatches);
  const targetRounds = endConditionType === 'total_rounds' ? Math.max(1, endConditionTarget) : 0;
  let targetMatches = Math.max(1, Number(totalMatches) || 1);
  if (endConditionType === 'target_wins') {
    // Best-of style lower bound: reaching N wins needs at most (2N-1) matches.
    targetMatches = Math.max(targetMatches, endConditionTarget * 2 - 1);
  }

  // Beam search 仅处理 target matches 场景，total_rounds 直接走贪心
  const forceFallback = rules._debugForceFallback === true;
  const canUseBeam = !forceFallback && endConditionType !== 'total_rounds';

  if (canUseBeam) {
    try {
      const squadEngine = require('./squadDoublesEngine');
      const beamResult = squadEngine.resolveSquadSchedule(idsA, idsB, targetMatches, courts, {
        hardDeadlineMs: Number(rules._hardDeadlineMs) || 2500
      });
      if (beamResult && Array.isArray(beamResult.rounds)) {
        // 标准化 matches 字段：补 matchType/unitAId/unitBId/logicalRound
        const normalizedRounds = beamResult.rounds.map((round, rIdx) => ({
          roundIndex: rIdx,
          matches: (round.matches || []).map((m, mIdx) => ({
            matchIndex: (round.matches || []).slice(0, mIdx)
              .reduce((sum, _, i) => sum + 1, 0)
              + (beamResult.rounds.slice(0, rIdx)
                .reduce((sum, r) => sum + ((r.matches || []).length), 0)),
            matchType: 'SQUAD',
            unitAId: 'A',
            unitBId: 'B',
            unitAName: 'A队',
            unitBName: 'B队',
            teamA: m.teamA.slice(),
            teamB: m.teamB.slice(),
            status: 'pending',
            logicalRound: rIdx
          })),
          restPlayers: round.restPlayers || []
        }));
        return {
          rounds: normalizedRounds,
          fairnessScore: beamResult.fairnessScore,
          fairness: beamResult.fairness,
          playerStats: beamResult.playerStats,
          seed: beamResult.seed || 0,
          schedulerMeta: {
            engineVersion: 'squad-v3-beam',
            mode: 'squad_doubles',
            endConditionType,
            endConditionTarget
          }
        };
      }
    } catch (err) {
      // beam 失败 → 静默降级到贪心
      // 生产环境下云函数日志仍可捕获 err
    }
  }

  // Greedy fallback 路径
  const greedy = runSquadGreedyFallback(idsA, idsB, targetMatches, courts, endConditionType, targetRounds);
  return {
    rounds: greedy.rounds,
    fairnessScore: greedy.fairnessScore,
    fairness: greedy.fairness,
    playerStats: greedy.playerStats,
    seed: greedy.seed,
    schedulerMeta: {
      engineVersion: greedy.engineVersion,
      mode: 'squad_doubles',
      endConditionType,
      endConditionTarget
    }
  };
}

// cycleIndex > 0 时对非固定位选手做旋转偏移，使重复循环的对阵顺序不同
function buildRoundRobinPairs(teamIds, cycleIndex) {
  const ci = Math.max(0, Number(cycleIndex) || 0);
  const teams = teamIds.slice();
  const bye = '__BYE__';
  if (teams.length % 2 === 1) teams.push(bye);
  const n = teams.length;
  if (ci > 0) {
    // 保持 teams[0]（固定锚点），对后续选手做旋转以产生不同的对阵顺序
    const fixed = teams[0];
    const rest = teams.slice(1);
    const shift = ci % rest.length;
    teams.splice(0, teams.length, fixed, ...rest.slice(shift), ...rest.slice(0, shift));
  }
  const rounds = [];
  for (let r = 0; r < n - 1; r += 1) {
    const pairs = [];
    for (let i = 0; i < n / 2; i += 1) {
      const a = teams[i];
      const b = teams[n - 1 - i];
      if (a !== bye && b !== bye) {
        pairs.push([a, b]);
      }
    }
    rounds.push(pairs);
    const fixed = teams[0];
    const rest = teams.slice(1);
    rest.unshift(rest.pop());
    teams.splice(0, teams.length, fixed, ...rest);
  }
  return rounds;
}

function buildFixedPairSchedule(players, courts, pairTeamsRaw = [], rules = {}) {
  const playerMap = {};
  for (const player of (players || [])) {
    const id = String(player && player.id || '').trim();
      if (!id) continue;
    playerMap[id] = player;
  }
  const pairValidation = fixedPair.validateFixedPairTeams(pairTeamsRaw, players);
  if (pairValidation.hasInvalid) {
    throw new Error(`START_PAIR_TEAMS_INVALID:${fixedPair.getFixedPairInvalidMessage(pairValidation)}`);
  }
  const pairTeams = pairValidation.teams;
  if (pairTeams.length < 2) {
    throw new Error('固搭循环赛至少需要 2 支合法队伍');
  }

  const n = pairTeams.length;
  const combN2 = fixedPair.calcFixedPairRoundRobinMatches(n);
  const targetMatches = Math.max(1, Number((rules && rules.totalMatches)) || combN2);
  const teamMap = Object.fromEntries(pairTeams.map((team) => [team.id, team]));
  const maxCourts = Math.max(1, Number(courts) || 1);

  // 生成足够多的循环轮次覆盖 targetMatches
  const allLogicalRounds = [];
  let cycleIdx = 0;
  while (allLogicalRounds.reduce((s, r) => s + r.length, 0) < targetMatches && cycleIdx < 200) {
    const cycleRounds = buildRoundRobinPairs(pairTeams.map((team) => team.id), cycleIdx);
    allLogicalRounds.push(...cycleRounds);
    cycleIdx += 1;
  }

  const rounds = [];
  let roundIndex = 0;
  let matchIndex = 0;

  for (let li = 0; li < allLogicalRounds.length && matchIndex < targetMatches; li += 1) {
    const logicalRound = li;
    const pendingPairs = allLogicalRounds[li].slice();
    while (pendingPairs.length && matchIndex < targetMatches) {
      const take = Math.min(pendingPairs.length, maxCourts, targetMatches - matchIndex);
      const pairs = pendingPairs.splice(0, take);
      const matches = pairs.map((pair) => {
        const teamA = teamMap[pair[0]];
        const teamB = teamMap[pair[1]];
        return {
          matchIndex: matchIndex++,
          matchType: 'FIXED_PAIR',
          logicalRound,
          unitAId: teamA.id,
          unitBId: teamB.id,
          unitAName: teamA.name,
          unitBName: teamB.name,
          teamA: teamA.playerIds.slice(),
          teamB: teamB.playerIds.slice(),
          status: 'pending'
        };
      });
      rounds.push({
        roundIndex: roundIndex++,
        matches,
        restPlayers: []
      });
    }
  }

  // 计算真实 fairness 指标
  const teamPlayCounts = Object.fromEntries(pairTeams.map((team) => [team.id, 0]));
  const pairCounts = {};
  rounds.forEach((r) => r.matches.forEach((m) => {
    const key = [m.unitAId, m.unitBId].sort().join('|');
    teamPlayCounts[m.unitAId] = (teamPlayCounts[m.unitAId] || 0) + 1;
    teamPlayCounts[m.unitBId] = (teamPlayCounts[m.unitBId] || 0) + 1;
    pairCounts[key] = (pairCounts[key] || 0) + 1;
  }));
  const playValues = Object.values(teamPlayCounts);
  const playSpread = playValues.length
    ? Math.max(...playValues) - Math.min(...playValues)
    : 0;
  const allPairCounts = [];
  for (let i = 0; i < pairTeams.length; i += 1) {
    for (let j = i + 1; j < pairTeams.length; j += 1) {
      const key = [pairTeams[i].id, pairTeams[j].id].sort().join('|');
      allPairCounts.push(Number(pairCounts[key] || 0));
    }
  }
  const matchupRepeatSpread = allPairCounts.length
    ? Math.max(...allPairCounts) - Math.min(...allPairCounts)
    : 0;
  const uniquePairs = Object.keys(pairCounts).length;
  const usedLogicalRounds = new Set();
  rounds.forEach((round) => {
    (round.matches || []).forEach((match) => usedLogicalRounds.add(Number(match.logicalRound) || 0));
  });
  const logicalRounds = usedLogicalRounds.size;
  const fairnessScore = Math.max(1, Math.round(1000000 / (1 + playSpread * 100 + matchupRepeatSpread * 50)));

  return {
    rounds,
    fairnessScore,
    fairness: {
      engine: 'fixed-pair-v1',
      playSpread,
      matchupRepeatSpread,
      totalMatches: matchIndex,
      uniquePairs
    },
    playerStats: {},
    seed: 0,
    schedulerMeta: {
      engineVersion: 'fixed-pair-v1',
      mode: 'fixed_pair_rr',
      logicalRounds,
      materializedRounds: rounds.length,
      cycles: cycleIdx
    }
  };
}

module.exports = {
  buildSquadSchedule,
  buildFixedPairSchedule
};
