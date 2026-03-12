const modeHelper = require('./lib/mode');

function parsePosInt(v, maxV) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const nn = Math.max(1, Math.floor(n));
  return Number.isFinite(maxV) ? Math.min(nn, maxV) : nn;
}

function parseTargetInt(v, fallback = 1) {
  if (v === undefined || v === null || v === '') return Math.max(1, Math.floor(Number(fallback) || 1));
  const n = Number(v);
  if (!Number.isFinite(n)) return Math.max(1, Math.floor(Number(fallback) || 1));
  return Math.max(1, Math.floor(n));
}

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

function normalizeGender(gender) {
  const v = String(gender || '').trim().toLowerCase();
  if (v === 'male' || v === 'female') return v;
  return 'unknown';
}

function normalizeTournamentName(name) {
  return String(name || '').trim();
}

function normalizePoints(points) {
  const value = Number(points);
  if (value === 11 || value === 15 || value === 21) return value;
  return 21;
}

function normalizeEndConditionType(type) {
  const value = String(type || '').trim().toLowerCase();
  if (value === 'total_matches' || value === 'total_rounds' || value === 'target_wins') return value;
  return 'total_matches';
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

function validateSettings(players, totalMatches, courts, mode = 'multi_rotate', allowOpenTeam = false, pairTeams = []) {
  const list = Array.isArray(players) ? players : [];
  const normalizedMode = modeHelper.normalizeMode(mode);
  let maxMatches = calcMaxMatches(list.length);
  if (normalizedMode === 'fixed_pair_rr') {
    const teams = Array.isArray(pairTeams) ? pairTeams : [];
    const teamCount = teams.length > 0 ? teams.length : Math.floor(list.length / 2);
    maxMatches = teamCount >= 2 ? comb(teamCount, 2) : 0;
  }

  if (totalMatches !== null) {
    // 允许在人数不足 4 时先做预配置；开赛前由 startTournament 做最终校验。
    if (maxMatches > 0 && totalMatches > maxMatches) {
      throw new Error(`总场次不能超过最大可选 ${maxMatches} 场`);
    }
  }

  const patch = {};
  if (totalMatches !== null) patch.totalMatches = totalMatches;
  if (courts !== null) patch.courts = courts;
  if (totalMatches !== null && courts !== null) patch.settingsConfigured = true;

  return { maxMatches, patch };
}

module.exports = {
  parsePosInt,
  parseTargetInt,
  calcMaxMatches,
  calcMaxMatchesMixed,
  normalizeMode: modeHelper.normalizeMode,
  normalizeGender,
  normalizeTournamentName,
  normalizePoints,
  normalizeEndConditionType,
  countGender,
  validateSettings
};
