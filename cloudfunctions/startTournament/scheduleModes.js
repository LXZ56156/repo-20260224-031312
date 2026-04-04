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
    rounds.push({
      roundIndex,
      matches,
      restPlayers
    });
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
      engine: 'squad-v2',
      playSpread,
      maxConsecutivePlay,
      partnerRepeats,
      opponentRepeats
    },
    playerStats: { playCount },
    seed: 0,
    schedulerMeta: {
      engineVersion: 'squad-v2',
      mode: 'squad_doubles',
      endConditionType,
      endConditionTarget
    }
  };
}

function buildRoundRobinPairs(teamIds) {
  const teams = teamIds.slice();
  const bye = '__BYE__';
  if (teams.length % 2 === 1) teams.push(bye);
  const n = teams.length;
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

function buildFixedPairSchedule(players, courts, pairTeamsRaw = []) {
  const playerMap = {};
  for (const player of (players || [])) {
    const id = String(player && player.id || '').trim();
    if (!id) continue;
    playerMap[id] = player;
  }
  const pairTeams = (Array.isArray(pairTeamsRaw) ? pairTeamsRaw : [])
    .map((team, idx) => ({
      id: String(team && team.id || `pair_${idx}`).trim(),
      name: String(team && team.name || `第${idx + 1}队`).trim(),
      playerIds: Array.isArray(team && team.playerIds) ? team.playerIds.slice(0, 2).map((id) => String(id || '').trim()) : []
    }))
    .filter((team) => team.playerIds.length === 2 && team.playerIds.every((id) => !!playerMap[id]));
  if (pairTeams.length < 2) {
    throw new Error('固搭循环赛至少需要 2 支队伍');
  }

  const roundsPair = buildRoundRobinPairs(pairTeams.map((team) => team.id));
  const teamMap = Object.fromEntries(pairTeams.map((team) => [team.id, team]));
  const rounds = [];
  let roundIndex = 0;
  let matchIndex = 0;
  const maxCourts = Math.max(1, Number(courts) || 1);
  for (let logicalRound = 0; logicalRound < roundsPair.length; logicalRound += 1) {
    const pendingPairs = roundsPair[logicalRound].slice();
    while (pendingPairs.length) {
      const pairs = pendingPairs.splice(0, maxCourts);
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

  return {
    rounds,
    fairnessScore: 0,
    fairness: { engine: 'fixed-pair-v1' },
    playerStats: {},
    seed: 0,
    schedulerMeta: {
      engineVersion: 'fixed-pair-v1',
      mode: 'fixed_pair_rr',
      logicalRounds: roundsPair.length
    }
  };
}

module.exports = {
  buildSquadSchedule,
  buildFixedPairSchedule
};
