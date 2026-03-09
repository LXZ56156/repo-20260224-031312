function pairKey(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

const POLICY_VERSION = 'v3';
const DEFAULT_SEED_STEP = 7919;
const COMMON_TEMPLATE_MATCH_COUNTS = new Set([12, 16, 18, 22]);
const MODE_DOUBLES = 'doubles';
const MODE_MIXED_FALLBACK = 'mixed_fallback';
const TEAM_TYPES = ['MX', 'MM', 'FF', 'OPEN'];

function variance(values) {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  return values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function clampInt(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.floor(n), lo, hi);
}

function normalizeSeed(seed) {
  const n = Number(seed);
  if (!Number.isFinite(n)) return 123456789;
  const mod = 2147483647;
  const value = Math.floor(Math.abs(n)) % mod;
  return value === 0 ? 1 : value;
}

function seededRng(seed) {
  let x = normalizeSeed(seed);
  return () => {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 4294967296);
  };
}

function pickK(arr, k, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a.slice(0, k);
}

function countComb4(n) {
  if (n < 4) return 0;
  return Math.floor((n * (n - 1) * (n - 2) * (n - 3)) / 24);
}

function enumerateComb4(ids) {
  const out = [];
  for (let i = 0; i < ids.length - 3; i++) {
    for (let j = i + 1; j < ids.length - 2; j++) {
      for (let k = j + 1; k < ids.length - 1; k++) {
        for (let m = k + 1; m < ids.length; m++) {
          out.push([ids[i], ids[j], ids[k], ids[m]]);
        }
      }
    }
  }
  return out;
}

function groupKey(players4) {
  return players4.slice().sort().join('|');
}

function incrementalSquareCost(count) {
  const c = Number(count) || 0;
  return 2 * c + 1;
}

function squareCost(count) {
  const c = Number(count) || 0;
  return c * c;
}

// Scheduler mode resolution accepts legacy/internal aliases that should not leak
// into the global business-mode normalizeMode semantics.
function resolveSchedulerMode(mode) {
  const v = String(mode || '').trim().toLowerCase();
  if (v === 'multi_rotate') return MODE_DOUBLES;
  if (v === MODE_MIXED_FALLBACK || v === MODE_DOUBLES) return v;
  return MODE_DOUBLES;
}

function normalizeGender(gender) {
  const v = String(gender || '').trim().toLowerCase();
  if (v === 'male' || v === 'female') return v;
  return 'unknown';
}

function buildGenderMap(players = []) {
  const out = {};
  for (const player of players) {
    const id = String(player && player.id || '');
    if (!id) continue;
    out[id] = normalizeGender(player && player.gender);
  }
  return out;
}

function classifyTeamType(team, genderById) {
  const g1 = normalizeGender(genderById && genderById[team[0]]);
  const g2 = normalizeGender(genderById && genderById[team[1]]);
  if (g1 === 'male' && g2 === 'male') return 'MM';
  if (g1 === 'female' && g2 === 'female') return 'FF';
  if ((g1 === 'male' && g2 === 'female') || (g1 === 'female' && g2 === 'male')) return 'MX';
  return 'OPEN';
}

function countGenderInIds(ids, genderById) {
  let maleCount = 0;
  let femaleCount = 0;
  let unknownCount = 0;
  for (const id of ids) {
    const g = normalizeGender(genderById && genderById[id]);
    if (g === 'male') maleCount += 1;
    else if (g === 'female') femaleCount += 1;
    else unknownCount += 1;
  }
  return { maleCount, femaleCount, unknownCount };
}

function canFormTypeInEligible(type, eligibleIds, genderById, allowOpen) {
  const g = countGenderInIds(eligibleIds, genderById);
  if (type === 'MX') return g.maleCount >= 2 && g.femaleCount >= 2;
  if (type === 'MM') return g.maleCount >= 4;
  if (type === 'FF') return g.femaleCount >= 4;
  if (type === 'OPEN') return allowOpen && (g.unknownCount > 0) && (eligibleIds.length >= 4);
  return false;
}

function buildTypeTargets(players, allowOpen, typeWeights = null) {
  const ids = (players || []).map((p) => p.id);
  const genderById = buildGenderMap(players);
  const g = countGenderInIds(ids, genderById);
  const weights = {
    MX: 1.3,
    MM: 0.9,
    FF: 0.9,
    OPEN: 0.35,
    ...(typeWeights || {})
  };
  const base = {
    MX: Math.max(0, Math.floor(g.maleCount / 2) * Math.floor(g.femaleCount / 2)) * weights.MX,
    MM: Math.max(0, Math.floor(g.maleCount / 4)) * weights.MM,
    FF: Math.max(0, Math.floor(g.femaleCount / 4)) * weights.FF,
    OPEN: allowOpen ? Math.max(0, Math.floor((g.maleCount + g.femaleCount + g.unknownCount) / 4)) * weights.OPEN : 0
  };
  const sum = Object.values(base).reduce((acc, item) => acc + item, 0);
  if (sum <= 0) {
    return { MX: 0, MM: 0.5, FF: 0.5, OPEN: 0 };
  }
  return {
    MX: base.MX / sum,
    MM: base.MM / sum,
    FF: base.FF / sum,
    OPEN: base.OPEN / sum
  };
}

function computeTypeBalanceGap(matchType, matchTypeCount, typeTargets) {
  const current = Object.assign({ MX: 0, MM: 0, FF: 0, OPEN: 0 }, matchTypeCount || {});
  if (!TEAM_TYPES.includes(matchType)) return 0;
  current[matchType] += 1;
  const total = TEAM_TYPES.reduce((sum, key) => sum + (Number(current[key]) || 0), 0);
  if (total <= 0) return 0;
  let gap = 0;
  for (const key of TEAM_TYPES) {
    const share = (Number(current[key]) || 0) / total;
    gap += Math.abs(share - (Number(typeTargets && typeTargets[key]) || 0));
  }
  return gap;
}

function selectSchedulerPolicy(playersCount, courts, totalMatches) {
  const n = Math.max(0, Number(playersCount) || 0);
  const c = Math.max(1, Number(courts) || 1);
  const m = Math.max(1, Number(totalMatches) || 1);

  let selectedSearchSeeds = 16;
  if (c >= 2 && n >= 10) selectedSearchSeeds = 12;
  const selectedEpsilon = c === 1 ? 1.8 : 1.6;

  return {
    policyVersion: POLICY_VERSION,
    searchSeedsPolicy: 'if courts===1 -> 16; if courts>=2 and players<=9 -> 16; if courts>=2 and players>=10 -> 12',
    epsilonPolicy: 'if courts===1 -> 1.8; if courts>=2 -> 1.6',
    selectedSearchSeeds,
    selectedEpsilon,
    playersCount: n,
    courts: c,
    totalMatches: m
  };
}

function computeRestDebt(players4, eligibleIds, state) {
  const picked = new Set(players4);
  let debt = 0;
  for (const id of eligibleIds) {
    if (picked.has(id)) continue;
    const rs = Number(state.restStreak[id]) || 0;
    if (rs > 1) {
      const over = rs - 1;
      debt += over * over;
    }
  }
  return debt;
}

function scoreGroup(players4, state, weights, eligibleIds, options = {}) {
  const mode = resolveSchedulerMode(options.mode);
  const allowOpen = options.allowOpen === true;
  const genderById = options.genderById || {};
  const typeTargets = options.typeTargets || { MX: 0, MM: 0.5, FF: 0.5, OPEN: 0 };
  const playCounts = players4.map((id) => state.playCount[id]);
  const v = variance(playCounts);
  const restDebt = computeRestDebt(players4, eligibleIds, state);

  const splits = [
    [[players4[0], players4[1]], [players4[2], players4[3]]],
    [[players4[0], players4[2]], [players4[1], players4[3]]],
    [[players4[0], players4[3]], [players4[1], players4[2]]]
  ];

  let best = null;
  const mxAvailable = mode === MODE_MIXED_FALLBACK && canFormTypeInEligible('MX', eligibleIds, genderById, allowOpen);
  for (const [teamA, teamB] of splits) {
    const typeA = classifyTeamType(teamA, genderById);
    const typeB = classifyTeamType(teamB, genderById);
    if (mode === MODE_MIXED_FALLBACK) {
      if (typeA !== typeB) continue;
      if (typeA === 'OPEN' && !allowOpen) continue;
    }
    const matchType = (mode === MODE_MIXED_FALLBACK) ? typeA : '';
    let partnerRep = 0; // raw repeat count (diagnostics)
    let opponentRep = 0; // raw repeat count (diagnostics)
    let partnerPenalty = 0; // non-linear incremental penalty
    let opponentPenalty = 0; // non-linear incremental penalty

    const p1 = state.partnerCount[pairKey(teamA[0], teamA[1])] || 0;
    const p2 = state.partnerCount[pairKey(teamB[0], teamB[1])] || 0;
    partnerRep += p1 + p2;
    partnerPenalty += incrementalSquareCost(p1);
    partnerPenalty += incrementalSquareCost(p2);

    for (const a of teamA) {
      for (const b of teamB) {
        const current = state.opponentCount[pairKey(a, b)] || 0;
        opponentRep += current;
        opponentPenalty += incrementalSquareCost(current);
      }
    }

    let consecPlay = 0;
    for (const id of players4) {
      if ((state.playStreak[id] || 0) >= 1) consecPlay += 1;
    }

    const typeBalanceGap = mode === MODE_MIXED_FALLBACK
      ? computeTypeBalanceGap(matchType, state.matchTypeCount, typeTargets)
      : 0;
    const fallbackPenalty = mode === MODE_MIXED_FALLBACK && matchType !== 'MX' && mxAvailable ? 1 : 0;
    const openPenalty = mode === MODE_MIXED_FALLBACK && matchType === 'OPEN' ? 1 : 0;

    const cost =
      weights.alpha * v +
      weights.beta * partnerPenalty +
      weights.gamma * opponentPenalty +
      weights.delta * consecPlay +
      weights.epsilon * restDebt +
      weights.theta * typeBalanceGap +
      weights.zeta * fallbackPenalty +
      weights.omega * openPenalty;

    if (
      !best ||
      cost < best.cost ||
      (cost === best.cost && partnerPenalty < best.partnerPenalty) ||
      (cost === best.cost && partnerPenalty === best.partnerPenalty && opponentPenalty < best.opponentPenalty)
    ) {
      best = {
        cost,
        teamA,
        teamB,
        v,
        partnerRep,
        opponentRep,
        partnerPenalty,
        opponentPenalty,
        consecPlay,
        restDebt,
        matchType,
        typeBalanceGap,
        fallbackPenalty,
        openPenalty
      };
    }
  }

  return best;
}

function computeStats(rounds, playerIds) {
  const playCount = Object.fromEntries(playerIds.map((id) => [id, 0]));
  const partnerCount = {};
  const opponentCount = {};
  const matchTypeCount = { MX: 0, MM: 0, FF: 0, OPEN: 0 };

  for (const r of rounds) {
    for (const m of r.matches) {
      const a = m.teamA;
      const b = m.teamB;
      const mt = String(m.matchType || '').trim().toUpperCase();
      if (Object.prototype.hasOwnProperty.call(matchTypeCount, mt)) {
        matchTypeCount[mt] += 1;
      }
      for (const id of [...a, ...b]) playCount[id] += 1;

      const pk1 = pairKey(a[0], a[1]);
      const pk2 = pairKey(b[0], b[1]);
      partnerCount[pk1] = (partnerCount[pk1] || 0) + 1;
      partnerCount[pk2] = (partnerCount[pk2] || 0) + 1;

      for (const x of a) {
        for (const y of b) {
          const ok = pairKey(x, y);
          opponentCount[ok] = (opponentCount[ok] || 0) + 1;
        }
      }
    }
  }

  const partnerValues = Object.values(partnerCount);
  const opponentValues = Object.values(opponentCount);
  const partnerRepeats = partnerValues.reduce((s, c) => s + Math.max(0, c - 1), 0);
  const opponentRepeats = opponentValues.reduce((s, c) => s + Math.max(0, c - 1), 0);
  const partnerPenalty = partnerValues.reduce((s, c) => s + squareCost(c), 0);
  const opponentPenalty = opponentValues.reduce((s, c) => s + squareCost(c), 0);

  return {
    playCount,
    partnerCount,
    opponentCount,
    matchTypeCount,
    partnerRepeats,
    opponentRepeats,
    partnerPenalty,
    opponentPenalty,
    maxPairRepeat: partnerValues.length ? Math.max(...partnerValues) : 0,
    maxOpponentRepeat: opponentValues.length ? Math.max(...opponentValues) : 0
  };
}

function sortEligibleIds(ids, state, used) {
  return ids
    .filter((id) => !used.has(id))
    .sort((a, b) => {
      const pa = state.playCount[a] || 0;
      const pb = state.playCount[b] || 0;
      if (pa !== pb) return pa - pb;
      const ra = state.restStreak[a] || 0;
      const rb = state.restStreak[b] || 0;
      if (ra !== rb) return rb - ra;
      const sa = state.playStreak[a] || 0;
      const sb = state.playStreak[b] || 0;
      if (sa !== sb) return sa - sb;
      return String(a).localeCompare(String(b));
    });
}

function isWarmStartScenario(playersCount, courts, totalMatches) {
  const n = Math.max(0, Number(playersCount) || 0);
  const c = Math.max(1, Number(courts) || 1);
  const m = Math.max(1, Number(totalMatches) || 1);
  return n >= 8 && n <= 14 && c >= 1 && c <= 2 && COMMON_TEMPLATE_MATCH_COUNTS.has(m);
}

function buildWarmStartGroups(ids, eligible, roundIndex, slotIndex, courts, totalMatches) {
  if (!isWarmStartScenario(ids.length, courts, totalMatches)) return [];
  const eligibleSet = new Set(eligible);
  const n = ids.length;
  if (n < 4) return [];
  const ordered = ids.slice().sort((a, b) => String(a).localeCompare(String(b)));
  const groups = [];
  const addGroup = (group) => {
    if (!Array.isArray(group) || group.length !== 4) return;
    const uniq = new Set(group);
    if (uniq.size !== 4) return;
    if (group.some((id) => !eligibleSet.has(id))) return;
    groups.push(group.slice());
  };

  const start = (roundIndex * 3 + slotIndex * 5) % n;
  addGroup([
    ordered[start % n],
    ordered[(start + 1) % n],
    ordered[(start + 2) % n],
    ordered[(start + 3) % n]
  ]);

  const spreadStart = (roundIndex * 5 + slotIndex * 7 + 1) % n;
  addGroup([
    ordered[spreadStart % n],
    ordered[(spreadStart + 2) % n],
    ordered[(spreadStart + 4) % n],
    ordered[(spreadStart + 6) % n]
  ]);

  return groups;
}

function buildCandidateGroupsMixed(eligible, rng, genderById, allowOpen, warmStartGroups = []) {
  const out = [];
  const seen = new Set();
  const pushGroup = (group) => {
    if (!Array.isArray(group) || group.length !== 4) return;
    const uniq = new Set(group);
    if (uniq.size !== 4) return;
    const key = groupKey(group);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(group.slice());
  };

  for (const g of warmStartGroups) pushGroup(g);

  const male = [];
  const female = [];
  const unknown = [];
  for (const id of eligible) {
    const g = normalizeGender(genderById && genderById[id]);
    if (g === 'male') male.push(id);
    else if (g === 'female') female.push(id);
    else unknown.push(id);
  }

  const mxTrials = clamp(12 + eligible.length, 12, 64);
  for (let i = 0; i < mxTrials; i += 1) {
    if (male.length < 2 || female.length < 2) break;
    const group = pickK(male, 2, rng).concat(pickK(female, 2, rng));
    pushGroup(group);
  }

  const mmTrials = clamp(8 + male.length, 8, 36);
  for (let i = 0; i < mmTrials; i += 1) {
    if (male.length < 4) break;
    pushGroup(pickK(male, 4, rng));
  }

  const ffTrials = clamp(8 + female.length, 8, 36);
  for (let i = 0; i < ffTrials; i += 1) {
    if (female.length < 4) break;
    pushGroup(pickK(female, 4, rng));
  }

  if (allowOpen && unknown.length > 0) {
    const openTrials = clamp(8 + unknown.length, 8, 30);
    for (let i = 0; i < openTrials; i += 1) {
      if (eligible.length < 4) break;
      // OPEN must include at least one unknown player.
      const hasUnknown = pickK(unknown, 1, rng);
      const restPool = eligible.filter((id) => !hasUnknown.includes(id));
      if (restPool.length < 3) continue;
      pushGroup(hasUnknown.concat(pickK(restPool, 3, rng)));
    }
  }

  const randomTrials = clamp(10 + eligible.length, 10, 42);
  for (let i = 0; i < randomTrials; i += 1) {
    if (eligible.length < 4) break;
    pushGroup(pickK(eligible, 4, rng));
  }

  if (out.length === 0 && eligible.length >= 4) {
    pushGroup(eligible.slice(0, 4));
  }
  return out;
}

function buildCandidateGroups(eligible, rng, warmStartGroups = [], options = {}) {
  const mode = resolveSchedulerMode(options.mode);
  if (mode === MODE_MIXED_FALLBACK) {
    return buildCandidateGroupsMixed(
      eligible,
      rng,
      options.genderById || {},
      options.allowOpen === true,
      warmStartGroups
    );
  }

  const out = [];
  const seen = new Set();
  const pushGroup = (group) => {
    if (!Array.isArray(group) || group.length !== 4) return;
    const key = groupKey(group);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(group.slice());
  };

  for (const g of warmStartGroups) pushGroup(g);

  const priorityWindow = eligible.slice(0, Math.min(10, eligible.length));
  let priorityPool = priorityWindow;
  if (priorityWindow.length > 8) {
    priorityPool = pickK(priorityWindow, 8, rng);
  }
  const combCount = countComb4(priorityPool.length);
  if (combCount > 0 && combCount <= 70) {
    const all = enumerateComb4(priorityPool);
    for (const g of all) pushGroup(g);
  } else {
    const priorityTrials = clamp(8 + priorityPool.length, 12, 30);
    for (let i = 0; i < priorityTrials; i++) {
      pushGroup(pickK(priorityPool, 4, rng));
    }
  }

  const randomTrials = clamp(12 + eligible.length, 12, 50);
  for (let i = 0; i < randomTrials; i++) {
    pushGroup(pickK(eligible, 4, rng));
  }

  if (out.length === 0 && eligible.length >= 4) {
    pushGroup(eligible.slice(0, 4));
  }
  return out;
}

function buildObjective(stats, playCountVariance, restDebtTotal, typeBalanceGapTotal, fallbackCount, openMatchCount, weights) {
  const F =
    weights.alpha * playCountVariance +
    weights.beta * stats.partnerPenalty +
    weights.gamma * stats.opponentPenalty +
    weights.epsilon * restDebtTotal +
    weights.theta * typeBalanceGapTotal +
    weights.zeta * fallbackCount +
    weights.omega * openMatchCount;
  return {
    F,
    maxPairRepeat: stats.maxPairRepeat,
    maxOpponentRepeat: stats.maxOpponentRepeat,
    playCountVariance,
    restDebtTotal,
    typeBalanceGapTotal,
    fallbackCount,
    openMatchCount
  };
}

function compareObjective(a, b) {
  if (a.F !== b.F) return a.F - b.F;
  if (a.maxPairRepeat !== b.maxPairRepeat) return a.maxPairRepeat - b.maxPairRepeat;
  if (a.maxOpponentRepeat !== b.maxOpponentRepeat) return a.maxOpponentRepeat - b.maxOpponentRepeat;
  if (a.playCountVariance !== b.playCountVariance) return a.playCountVariance - b.playCountVariance;
  if ((a.fallbackCount || 0) !== (b.fallbackCount || 0)) return (a.fallbackCount || 0) - (b.fallbackCount || 0);
  if ((a.openMatchCount || 0) !== (b.openMatchCount || 0)) return (a.openMatchCount || 0) - (b.openMatchCount || 0);
  return 0;
}

function generateScheduleOnce(ids, totalMatches, courts, weights, seed, options = {}) {
  const mode = resolveSchedulerMode(options.mode);
  const allowOpen = options.allowOpen === true;
  const genderById = options.genderById || {};
  const typeTargets = options.typeTargets || { MX: 0, MM: 0.5, FF: 0.5, OPEN: 0 };
  const rng = seededRng(seed);
  const state = {
    playCount: Object.fromEntries(ids.map((id) => [id, 0])),
    playStreak: Object.fromEntries(ids.map((id) => [id, 0])),
    restStreak: Object.fromEntries(ids.map((id) => [id, 0])),
    maxRestStreak: Object.fromEntries(ids.map((id) => [id, 0])),
    partnerCount: {},
    opponentCount: {},
    matchTypeCount: { MX: 0, MM: 0, FF: 0, OPEN: 0 }
  };

  const rounds = [];
  let matchIndex = 0;
  let roundIndex = 0;
  let restDebtTotal = 0;
  let typeBalanceGapTotal = 0;
  let fallbackCount = 0;
  let openMatchCount = 0;

  while (matchIndex < totalMatches) {
    const matchesThisRound = [];
    const used = new Set();

    while (matchesThisRound.length < courts && matchIndex < totalMatches) {
      const eligible = sortEligibleIds(ids, state, used);
      if (eligible.length < 4) break;

      const warmStartGroups = buildWarmStartGroups(
        ids,
        eligible,
        roundIndex,
        matchesThisRound.length,
        courts,
        totalMatches
      );
      const groups = buildCandidateGroups(eligible, rng, warmStartGroups, {
        mode,
        allowOpen,
        genderById
      });
      let best = null;
      for (const group of groups) {
        const scored = scoreGroup(group, state, weights, eligible, {
          mode,
          allowOpen,
          genderById,
          typeTargets
        });
        if (!scored) continue;
        if (
          !best ||
          scored.cost < best.cost ||
          (scored.cost === best.cost && scored.partnerPenalty < best.partnerPenalty) ||
          (scored.cost === best.cost && scored.partnerPenalty === best.partnerPenalty && scored.opponentPenalty < best.opponentPenalty)
        ) {
          best = { ...scored, group };
        }
      }
      if (!best) break;

      const teamA = best.teamA.slice();
      const teamB = best.teamB.slice();
      matchesThisRound.push({
        matchIndex,
        matchType: best.matchType || '',
        teamA,
        teamB,
        status: 'pending',
        score: null
      });
      restDebtTotal += best.restDebt || 0;
      typeBalanceGapTotal += best.typeBalanceGap || 0;
      fallbackCount += best.fallbackPenalty || 0;
      if (best.matchType && state.matchTypeCount[best.matchType] !== undefined) {
        state.matchTypeCount[best.matchType] += 1;
        if (best.matchType === 'OPEN') openMatchCount += 1;
      }

      for (const id of [...teamA, ...teamB]) {
        used.add(id);
        state.playCount[id] += 1;
      }
      const pk1 = pairKey(teamA[0], teamA[1]);
      const pk2 = pairKey(teamB[0], teamB[1]);
      state.partnerCount[pk1] = (state.partnerCount[pk1] || 0) + 1;
      state.partnerCount[pk2] = (state.partnerCount[pk2] || 0) + 1;
      for (const a of teamA) {
        for (const b of teamB) {
          const ok = pairKey(a, b);
          state.opponentCount[ok] = (state.opponentCount[ok] || 0) + 1;
        }
      }

      matchIndex += 1;
    }

    if (matchesThisRound.length === 0) break;

    const roundPlayed = new Set();
    for (const m of matchesThisRound) {
      for (const id of [...m.teamA, ...m.teamB]) roundPlayed.add(id);
    }
    const restPlayers = ids.filter((id) => !roundPlayed.has(id));

    for (const id of ids) {
      const played = roundPlayed.has(id);
      if (played) {
        state.playStreak[id] = (state.playStreak[id] || 0) + 1;
        state.restStreak[id] = 0;
      } else {
        state.restStreak[id] = (state.restStreak[id] || 0) + 1;
        state.playStreak[id] = 0;
      }
      if (state.restStreak[id] > (state.maxRestStreak[id] || 0)) {
        state.maxRestStreak[id] = state.restStreak[id];
      }
    }

    rounds.push({
      roundIndex,
      matches: matchesThisRound,
      restPlayers
    });
    roundIndex += 1;
  }

  const stats = computeStats(rounds, ids);
  const playCountVariance = variance(Object.values(stats.playCount));
  const objective = buildObjective(
    stats,
    playCountVariance,
    restDebtTotal,
    typeBalanceGapTotal,
    fallbackCount,
    openMatchCount,
    weights
  );
  const fairnessScore = Math.round(100000 / (1 + objective.F));

  return {
    rounds,
    playerStats: {
      playCount: stats.playCount,
      partnerRepeats: stats.partnerRepeats,
      opponentRepeats: stats.opponentRepeats,
      maxRestStreak: state.maxRestStreak,
      matchTypeCount: stats.matchTypeCount
    },
    fairness: {
      mode,
      alpha: weights.alpha,
      beta: weights.beta,
      gamma: weights.gamma,
      delta: weights.delta,
      epsilon: weights.epsilon,
      theta: weights.theta,
      zeta: weights.zeta,
      omega: weights.omega,
      variance: playCountVariance,
      partnerRepeats: stats.partnerRepeats,
      opponentRepeats: stats.opponentRepeats,
      restDebtTotal,
      typeBalanceGapTotal,
      fallbackCount,
      openMatchCount
    },
    objective,
    fairnessScore,
    seed
  };
}

function generateSchedule(players, totalMatches, courts = 1, options = {}) {
  if (!Array.isArray(players) || players.length < 4) {
    throw new Error('参赛人数必须不少于4人');
  }
  const M = Math.max(1, Number(totalMatches || 1));
  const C = Math.max(1, Number(courts || 1));
  const ids = players.map((p) => p.id);
  const mode = resolveSchedulerMode(options.mode);
  const allowOpen = options.allowOpen === true;
  const genderById = buildGenderMap(players);
  const typeTargets = buildTypeTargets(players, allowOpen, options.typeWeights);
  const policy = options.policy || selectSchedulerPolicy(ids.length, C, M);
  const selectedEpsilon = Number(options.epsilon ?? policy.selectedEpsilon ?? 1.6);
  const selectedSearchSeeds = clampInt(options.searchSeeds ?? policy.selectedSearchSeeds ?? 16, 1, 64, 16);
  const selectedSeedStep = clampInt(options.seedStep ?? DEFAULT_SEED_STEP, 1, 2147483646, DEFAULT_SEED_STEP);

  const weights = {
    alpha: Number(options.alpha ?? 2.0),
    beta: Number(options.beta ?? 3.0),
    gamma: Number(options.gamma ?? 1.5),
    delta: Number(options.delta ?? 2.0),
    epsilon: selectedEpsilon,
    theta: Number(options.theta ?? 2.0),
    zeta: Number(options.zeta ?? 3.0),
    omega: Number(options.omega ?? 5.0)
  };

  const baseSeed = normalizeSeed(options.seed ?? (Date.now() % 2147483647));

  const triedSeeds = [];
  let best = null;
  for (let i = 0; i < selectedSearchSeeds; i++) {
    const seed = normalizeSeed(baseSeed + i * selectedSeedStep);
    triedSeeds.push(seed);
    const out = generateScheduleOnce(ids, M, C, weights, seed, {
      mode,
      allowOpen,
      genderById,
      typeTargets
    });
    if (!best) {
      best = out;
      continue;
    }
    const cmp = compareObjective(out.objective, best.objective);
    if (cmp < 0 || (cmp === 0 && out.seed < best.seed)) {
      best = out;
    }
  }

  return {
    rounds: best.rounds,
    playerStats: best.playerStats,
    fairness: best.fairness,
    fairnessScore: best.fairnessScore,
    seed: best.seed,
    schedulerMeta: {
      engineVersion: 'rotation-v2',
      baseSeed,
      triedSeeds,
      selectedSeed: best.seed,
      searchSeeds: selectedSearchSeeds,
      seedStep: selectedSeedStep,
      selectedSearchSeeds,
      selectedEpsilon,
      mode,
      allowOpen,
      typeTargets,
      policy: {
        ...policy,
        policyVersion: policy.policyVersion || POLICY_VERSION,
        selectedSearchSeeds,
        selectedEpsilon
      },
      matchTypeCounts: (best.playerStats && best.playerStats.matchTypeCount) || {},
      fallbackCount: Number(best.fairness && best.fairness.fallbackCount) || 0,
      openMatchCount: Number(best.fairness && best.fairness.openMatchCount) || 0,
      genderCoverage: countGenderInIds(ids, genderById),
      objective: best.objective
    }
  };
}

module.exports = {
  generateSchedule,
  selectSchedulerPolicy
};
