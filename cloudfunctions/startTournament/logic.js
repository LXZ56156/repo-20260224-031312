function calcMaxMatches(n) {
  const nn = Number(n) || 0;
  if (nn < 4) return 0;
  const comb4 = (nn * (nn - 1) * (nn - 2) * (nn - 3)) / 24;
  return Math.floor(comb4 * 3);
}

function comb(n, k) {
  const nn = Math.floor(Number(n) || 0);
  const kk = Math.floor(Number(k) || 0);
  if (kk < 0 || nn < 0 || kk > nn) return 0;
  if (kk === 0 || kk === nn) return 1;
  const m = Math.min(kk, nn - kk);
  let numerator = 1;
  let denominator = 1;
  for (let i = 1; i <= m; i += 1) {
    numerator *= (nn - m + i);
    denominator *= i;
  }
  return Math.floor(numerator / denominator);
}

function normalizeMode(mode) {
  const v = String(mode || '').trim().toLowerCase();
  if (v === 'multi_rotate' || v === 'squad_doubles' || v === 'fixed_pair_rr') return v;
  if (v === 'mixed_fallback' || v === 'doubles') return 'multi_rotate';
  return 'multi_rotate';
}

function normalizeGender(gender) {
  const v = String(gender || '').trim().toLowerCase();
  if (v === 'male' || v === 'female') return v;
  return 'unknown';
}

function countGender(players) {
  let maleCount = 0;
  let femaleCount = 0;
  let unknownCount = 0;
  for (const player of (players || [])) {
    const g = normalizeGender(player && player.gender);
    if (g === 'male') maleCount += 1;
    else if (g === 'female') femaleCount += 1;
    else unknownCount += 1;
  }
  return { maleCount, femaleCount, unknownCount };
}

function calcMaxMatchesMixed(maleCount, femaleCount, unknownCount, allowOpenTeam = false) {
  const male = Math.max(0, Number(maleCount) || 0);
  const female = Math.max(0, Number(femaleCount) || 0);
  const unknown = Math.max(0, Number(unknownCount) || 0);
  const total = male + female + unknown;
  if (total < 4) return 0;
  const mx = comb(male, 2) * comb(female, 2);
  const mm = comb(male, 4);
  const ff = comb(female, 4);
  const open = allowOpenTeam ? comb(total, 4) : 0;
  return Math.floor((mx + mm + ff + open) * 3);
}

function validateBeforeGenerate(tournament) {
  const t = tournament || {};
  const players = Array.isArray(t.players) ? t.players : [];
  if (players.length < 4) throw new Error('参赛人数不足 4 人');

  const mode = normalizeMode(t.mode);
  const allowOpenTeam = false;

  const rules = t && t.rules && typeof t.rules === 'object' ? t.rules : {};
  const endCondition = rules && typeof rules.endCondition === 'object' ? rules.endCondition : {};
  const totalMatches = Math.max(1, Number(t.totalMatches) || 1);
  const courts = Math.max(1, Math.min(10, Number(t.courts) || 1));
  if (totalMatches < 1) throw new Error('M 必须 >= 1');
  if (courts < 1) throw new Error('C 必须 >= 1');

  const { maleCount, femaleCount, unknownCount } = countGender(players);
  let maxMatches = calcMaxMatches(players.length);
  if (mode === 'fixed_pair_rr') {
    const pairTeams = Array.isArray(t.pairTeams) ? t.pairTeams.filter((item) => Array.isArray(item && item.playerIds) && item.playerIds.length === 2) : [];
    if (pairTeams.length < 2) throw new Error('固搭循环赛至少需要 2 支队伍');
    maxMatches = comb(pairTeams.length, 2);
  }
  if (mode === 'squad_doubles') {
    const aCount = players.filter((item) => String(item && item.squad || '').toUpperCase() === 'A').length;
    const bCount = players.filter((item) => String(item && item.squad || '').toUpperCase() === 'B').length;
    if (aCount < 2 || bCount < 2) throw new Error('小队转需要 A/B 队至少各 2 人');
    maxMatches = calcMaxMatches(players.length);
  }
  if (maxMatches > 0 && totalMatches > maxMatches) {
    throw new Error(`总场次不能超过最大可选 ${maxMatches} 场`);
  }
  return {
    players,
    totalMatches,
    courts,
    maxMatches,
    mode,
    allowOpenTeam,
    maleCount,
    femaleCount,
    unknownCount,
    pairTeams: Array.isArray(t.pairTeams) ? t.pairTeams : [],
    rules: {
      pointsPerGame: Number(rules.pointsPerGame) || 21,
      endCondition: {
        type: String(endCondition.type || 'total_matches').trim().toLowerCase() || 'total_matches',
        target: Math.max(1, Number(endCondition.target) || totalMatches)
      },
      unfinishedPolicy: String(rules.unfinishedPolicy || 'admin_decide')
    }
  };
}

module.exports = {
  calcMaxMatches,
  calcMaxMatchesMixed,
  normalizeMode,
  normalizeGender,
  countGender,
  validateBeforeGenerate
};
