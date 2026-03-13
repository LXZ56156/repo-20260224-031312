const {
  normalizeMode,
  MODE_FIXED_PAIR_RR
} = require('../mode');

const SESSION_MINUTE_OPTIONS = [60, 90, 120, 150, 180];
const SLOT_MINUTE_OPTIONS = [10, 12, 15, 18, 20, 25];
const DEFAULT_SESSION_MINUTES = 120;
const DEFAULT_SLOT_MINUTES = 15;
const DEFAULT_WARMUP_BUFFER = 10;
const DEFAULT_ESTIMATED_PLAYERS = 8;
const RECOMMEND_MODEL_VERSION = 'v2';

function parsePositiveInt(value, fallback = 0, maxValue = null) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  const nn = Math.floor(n);
  if (Number.isFinite(maxValue)) return Math.min(nn, maxValue);
  return nn;
}

function normalizeSessionMinutes(value, fallback = DEFAULT_SESSION_MINUTES) {
  const v = parsePositiveInt(value, fallback);
  if (SESSION_MINUTE_OPTIONS.includes(v)) return v;
  return DEFAULT_SESSION_MINUTES;
}

function normalizeSlotMinutes(value, fallback = DEFAULT_SLOT_MINUTES) {
  const v = parsePositiveInt(value, fallback);
  if (SLOT_MINUTE_OPTIONS.includes(v)) return v;
  return DEFAULT_SLOT_MINUTES;
}

function calcMaxMatchesByPlayers(playersCount) {
  const n = Number(playersCount) || 0;
  if (n < 4) return 0;
  const comb4 = (n * (n - 1) * (n - 2) * (n - 3)) / 24;
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

function calcMaxMatchesByMixedGender(maleCount, femaleCount, unknownCount, allowOpen = false) {
  const male = Math.max(0, Number(maleCount) || 0);
  const female = Math.max(0, Number(femaleCount) || 0);
  const unknown = Math.max(0, Number(unknownCount) || 0);
  const total = male + female + unknown;
  if (total < 4) return 0;

  const mxMatches = comb(male, 2) * comb(female, 2);
  const mmMatches = comb(male, 4);
  const ffMatches = comb(female, 4);
  const openMatches = allowOpen ? comb(total, 4) : 0;
  const totalMatches = mxMatches + mmMatches + ffMatches + openMatches;
  return Math.floor(totalMatches * 3);
}

function calcTimeBasedCapacity(courts, sessionMinutes, slotMinutes, warmupBuffer = DEFAULT_WARMUP_BUFFER) {
  const c = Math.max(1, parsePositiveInt(courts, 1, 10));
  const session = Math.max(30, parsePositiveInt(sessionMinutes, DEFAULT_SESSION_MINUTES));
  const slot = Math.max(8, parsePositiveInt(slotMinutes, DEFAULT_SLOT_MINUTES));
  const effectiveMinutes = Math.max(15, session - Math.max(0, Number(warmupBuffer) || 0));
  const cap = Math.floor((c * effectiveMinutes) / slot);
  return {
    effectiveMinutes,
    maxByTime: Math.max(1, cap)
  };
}

function pickTargetGamesPerPlayer(sessionMinutes) {
  const m = Math.max(30, parsePositiveInt(sessionMinutes, DEFAULT_SESSION_MINUTES));
  if (m <= 90) return 2.2;
  if (m <= 120) return 3.0;
  if (m <= 150) return 3.8;
  if (m <= 180) return 4.6;
  return 5.2;
}

function buildTierMatches(cap, balancedRaw) {
  const limit = Math.max(1, Number(cap) || 1);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(v)));

  let balanced = 1;
  let relax = 1;
  let intense = 1;

  if (limit >= 3) {
    balanced = clamp(balancedRaw, 1, limit - 1);
    relax = clamp(Math.floor(balanced * 0.82), 1, Math.max(1, balanced - 1));
    intense = clamp(Math.ceil(balanced * 1.18), Math.min(limit, balanced + 1), limit);
  } else {
    balanced = clamp(balancedRaw, 1, limit);
    relax = Math.max(1, Math.min(balanced, Math.floor(balanced * 0.82)));
    intense = Math.max(balanced, Math.min(limit, Math.ceil(balanced * 1.18)));
  }

  return [
    { key: 'relax', label: '保守', m: relax },
    { key: 'balanced', label: '均衡', m: balanced },
    { key: 'intense', label: '饱和', m: intense }
  ];
}

function buildMatchCountRecommendations(input) {
  const raw = input || {};
  const mode = normalizeMode(raw.mode);
  const allowOpenTeam = raw.allowOpenTeam === true;
  const playersCount = Math.max(0, Number(raw.playersCount) || 0);
  const maleCount = Math.max(0, Number(raw.maleCount) || 0);
  const femaleCount = Math.max(0, Number(raw.femaleCount) || 0);
  const unknownCount = Math.max(0, Number(raw.unknownCount) || 0);
  const courts = Math.max(1, parsePositiveInt(raw.courts, 2, 10));
  const sessionMinutes = normalizeSessionMinutes(raw.sessionMinutes, DEFAULT_SESSION_MINUTES);
  const slotMinutes = normalizeSlotMinutes(raw.slotMinutes, DEFAULT_SLOT_MINUTES);
  const warmupBuffer = Math.max(0, Number(raw.warmupBuffer) || DEFAULT_WARMUP_BUFFER);

  const { effectiveMinutes, maxByTime: maxByTimeRaw } = calcTimeBasedCapacity(courts, sessionMinutes, slotMinutes, warmupBuffer);
  const maxByTime = maxByTimeRaw;

  let maxByCombinatoricsRaw = calcMaxMatchesByPlayers(playersCount);
  if (mode === MODE_FIXED_PAIR_RR) {
    const teamCount = Math.floor(playersCount / 2);
    maxByCombinatoricsRaw = teamCount >= 2 ? comb(teamCount, 2) : 0;
  }
  const maxByCombinatorics = maxByCombinatoricsRaw > 0 ? maxByCombinatoricsRaw : Number.POSITIVE_INFINITY;
  const cap = Math.max(1, Math.min(maxByTime, maxByCombinatorics));
  const estimatedMode = playersCount < 4;
  const estimatedPlayers = estimatedMode ? Math.max(6, Math.min(10, courts * 4)) : playersCount;
  const targetGamesPerPlayer = pickTargetGamesPerPlayer(sessionMinutes);
  let balancedRaw = Math.round((estimatedPlayers * targetGamesPerPlayer) / 4);
  if (estimatedMode) balancedRaw = Math.floor(balancedRaw * 0.82);
  balancedRaw = Math.max(1, balancedRaw);
  const recommendedMatches = buildTierMatches(cap, balancedRaw);
  const suggestedMatches = Number((recommendedMatches[1] && recommendedMatches[1].m) || (recommendedMatches[0] && recommendedMatches[0].m) || 1);

  let capReason = 'time';
  if (mode === MODE_FIXED_PAIR_RR) {
    capReason = 'round_robin';
  } else if (estimatedMode) {
    capReason = 'estimated';
  } else if (maxByCombinatoricsRaw > 0 && maxByCombinatoricsRaw < maxByTime) {
    capReason = 'combinatorics';
  }

  let recommendationHint = '';
  if (capReason === 'round_robin') {
    recommendationHint = `最多可安排：${cap} 场（按已组队伍单循环计算）`;
  } else if (capReason === 'combinatorics') {
    recommendationHint = `受参赛信息限制，当前最多 ${maxByCombinatoricsRaw} 场。`;
  } else if (capReason === 'estimated') {
    recommendationHint = `按人数与时长自动安排场次（上限 ${maxByTime} 场），导入完整名单后会自动调整。`;
  } else {
    recommendationHint = `按人数与时长自动安排场次（上限 ${maxByTime} 场）。`;
  }

  let capacityHintShort = `最多可安排：${cap} 场（按场地与时长估算）`;
  if (capReason === 'combinatorics') {
    capacityHintShort = `最多可安排：${cap} 场（受参赛规模限制）`;
  } else if (capReason === 'round_robin') {
    capacityHintShort = `最多可安排：${cap} 场（按已组队伍单循环计算）`;
  }
  const rosterHint = estimatedMode ? '导入完整名单后会自动重算' : '';

  return {
    recommendedModelVersion: RECOMMEND_MODEL_VERSION,
    mode,
    allowOpenTeam,
    playersCount,
    maleCount,
    femaleCount,
    unknownCount,
    courts,
    sessionMinutes,
    slotMinutes,
    warmupBuffer,
    effectiveMinutes,
    estimatedPlayers,
    estimatedMode,
    targetGamesPerPlayer,
    maxByTime,
    maxByCombinatorics: maxByCombinatoricsRaw,
    balancedRaw,
    capReason,
    recommendedCap: cap,
    recommendedMatches,
    recommendationHint,
    suggestedMatches,
    capacityMax: cap,
    capacityReason: capReason,
    capacityHintShort,
    rosterHint
  };
}

module.exports = {
  SESSION_MINUTE_OPTIONS,
  SLOT_MINUTE_OPTIONS,
  DEFAULT_SESSION_MINUTES,
  DEFAULT_SLOT_MINUTES,
  DEFAULT_WARMUP_BUFFER,
  DEFAULT_ESTIMATED_PLAYERS,
  RECOMMEND_MODEL_VERSION,
  parsePositiveInt,
  normalizeSessionMinutes,
  normalizeSlotMinutes,
  calcMaxMatchesByPlayers,
  calcMaxMatchesByMixedGender,
  calcTimeBasedCapacity,
  buildMatchCountRecommendations
};
