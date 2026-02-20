function pairKey(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function variance(values) {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  return values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function seededRng(seed) {
  let x = seed || 123456789;
  return () => {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // Convert to [0,1)
    return ((x >>> 0) / 4294967296);
  };
}

function pickK(arr, k, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a.slice(0, k);
}

function scoreGroup(players4, state, weights) {
  // players4: array of player ids length 4
  const playCounts = players4.map(id => state.playCount[id]);
  const v = variance(playCounts);

  // consecutive penalties
  let consecPlay = 0;
  let consecRest = 0;
  players4.forEach(id => {
    consecPlay += (state.playStreak[id] >= 1 ? 1 : 0);
  });
  // rest streak applies for non-picked; here we estimate by choosing low-rest
  // We'll penalize selecting someone with playStreak already >=1 (back-to-back)

  // Evaluate all team splits
  const splits = [
    [[players4[0], players4[1]], [players4[2], players4[3]]],
    [[players4[0], players4[2]], [players4[1], players4[3]]],
    [[players4[0], players4[3]], [players4[1], players4[2]]]
  ];

  let best = null;
  for (const [teamA, teamB] of splits) {
    let partnerRep = 0;
    let opponentRep = 0;

    // partner repeats
    partnerRep += state.partnerCount[pairKey(teamA[0], teamA[1])] || 0;
    partnerRep += state.partnerCount[pairKey(teamB[0], teamB[1])] || 0;

    // opponents: every cross pair
    for (const a of teamA) {
      for (const b of teamB) {
        opponentRep += state.opponentCount[pairKey(a, b)] || 0;
      }
    }

    // consecutive play penalty: if someone played last round, penalize
    let consec = 0;
    for (const id of players4) {
      if (state.playStreak[id] >= 1) consec += 1;
    }

    const cost =
      weights.alpha * v +
      weights.beta * partnerRep +
      weights.gamma * opponentRep +
      weights.delta * consec;

    if (!best || cost < best.cost) {
      best = { cost, teamA, teamB, v, partnerRep, opponentRep, consec };
    }
  }

  return best;
}

function computeStats(rounds, playerIds) {
  const playCount = Object.fromEntries(playerIds.map(id => [id, 0]));
  const partnerCount = {};
  const opponentCount = {};

  for (const r of rounds) {
    for (const m of r.matches) {
      const a = m.teamA;
      const b = m.teamB;
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

  const partnerRepeats = Object.values(partnerCount).reduce((s, c) => s + Math.max(0, c - 1), 0);
  const opponentRepeats = Object.values(opponentCount).reduce((s, c) => s + Math.max(0, c - 1), 0);

  return { playCount, partnerCount, opponentCount, partnerRepeats, opponentRepeats };
}

function generateSchedule(players, totalMatches, courts = 1, options = {}) {
  if (!Array.isArray(players) || players.length < 4) {
    throw new Error('参赛人数必须不少于4人');
  }
  const M = Math.max(1, Number(totalMatches || 1));
  const C = Math.max(1, Number(courts || 1));

  const ids = players.map(p => p.id);
  const weights = {
    alpha: options.alpha ?? 2.0,
    beta: options.beta ?? 3.0,
    gamma: options.gamma ?? 1.5,
    delta: options.delta ?? 2.0,
    epsilon: options.epsilon ?? 1.0
  };

  const seed = options.seed ?? (Date.now() % 2147483647);
  const rng = seededRng(seed);

  const state = {
    playCount: Object.fromEntries(ids.map(id => [id, 0])),
    playStreak: Object.fromEntries(ids.map(id => [id, 0])),
    restStreak: Object.fromEntries(ids.map(id => [id, 0])),
    partnerCount: {},
    opponentCount: {}
  };

  const rounds = [];
  let matchIndex = 0;
  let roundIndex = 0;

  while (matchIndex < M) {
    const matchesThisRound = [];
    const used = new Set();

    // Prepare eligible list sorted by playCount asc, restStreak desc
    const sorted = ids.slice().sort((a, b) => {
      const pa = state.playCount[a], pb = state.playCount[b];
      if (pa !== pb) return pa - pb;
      const ra = state.restStreak[a], rb = state.restStreak[b];
      return rb - ra;
    });

    while (matchesThisRound.length < C && matchIndex < M) {
      const eligible = sorted.filter(id => !used.has(id));
      if (eligible.length < 4) break;

      // Candidate search: sample a few groups, pick best
      const trials = clamp(10 + eligible.length, 12, 40);
      let best = null;
      for (let t = 0; t < trials; t++) {
        const group = pickK(eligible, 4, rng);
        const scored = scoreGroup(group, state, weights);
        if (!best || scored.cost < best.cost) {
          best = { ...scored, group };
        }
      }

      if (!best) break;

      // Commit match
      const teamA = best.teamA;
      const teamB = best.teamB;
      matchesThisRound.push({
        matchIndex,
        teamA: teamA.slice(),
        teamB: teamB.slice(),
        status: 'pending',
        score: null
      });

      // Update state
      for (const id of [...teamA, ...teamB]) {
        used.add(id);
        state.playCount[id] += 1;
      }
      // partner/opponent counts
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

    // If round has no matches (can happen if C too large and eligible <4), fallback: new round anyway
    const restPlayers = ids.filter(id => !matchesThisRound.some(m => m.teamA.includes(id) || m.teamB.includes(id)));

    // Update streaks
    for (const id of ids) {
      const played = matchesThisRound.some(m => m.teamA.includes(id) || m.teamB.includes(id));
      if (played) {
        state.playStreak[id] = state.playStreak[id] + 1;
        state.restStreak[id] = 0;
      } else {
        state.restStreak[id] = state.restStreak[id] + 1;
        state.playStreak[id] = 0;
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
  const v = variance(Object.values(stats.playCount));
  const F = weights.alpha * v + weights.beta * stats.partnerRepeats + weights.gamma * stats.opponentRepeats;
  const fairnessScore = Math.round(100000 / (1 + F));

  return {
    rounds,
    playerStats: {
      playCount: stats.playCount,
      partnerRepeats: stats.partnerRepeats,
      opponentRepeats: stats.opponentRepeats
    },
    fairness: {
      alpha: weights.alpha,
      beta: weights.beta,
      gamma: weights.gamma,
      variance: v,
      partnerRepeats: stats.partnerRepeats,
      opponentRepeats: stats.opponentRepeats
    },
    fairnessScore,
    seed
  };
}

module.exports = { generateSchedule };
