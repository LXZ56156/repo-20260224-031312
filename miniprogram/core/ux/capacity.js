const {
  normalizeMode,
  MODE_FIXED_PAIR_RR
} = require('../mode');
const fixedPair = require('../fixedPair');

const RECOMMEND_MODEL_VERSION = 'v3';

function parsePositiveInt(value, fallback = 0, maxValue = null) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  const nn = Math.floor(n);
  if (Number.isFinite(maxValue)) return Math.min(nn, maxValue);
  return nn;
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

function calcMaxMatchesByMixedGender(maleCount, femaleCount, unknownCount) {
  const male = Math.max(0, Number(maleCount) || 0);
  const female = Math.max(0, Number(femaleCount) || 0);
  const unknown = Math.max(0, Number(unknownCount) || 0);
  const total = male + female + unknown;
  if (total < 4) return 0;

  const mxMatches = comb(male, 2) * comb(female, 2);
  const mmMatches = comb(male, 4);
  const ffMatches = comb(female, 4);
  const totalMatches = mxMatches + mmMatches + ffMatches;
  return Math.floor(totalMatches * 3);
}

function pickTargetGamesPerPlayer(courts) {
  const c = Math.max(1, parsePositiveInt(courts, 1, 10));
  if (c === 1) return 2.5;
  if (c === 2) return 3.0;
  return 3.5;
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
  const playersCount = Math.max(0, Number(raw.playersCount) || 0);
  const maleCount = Math.max(0, Number(raw.maleCount) || 0);
  const femaleCount = Math.max(0, Number(raw.femaleCount) || 0);
  const unknownCount = Math.max(0, Number(raw.unknownCount) || 0);
  const courts = Math.max(1, parsePositiveInt(raw.courts, 2, 10));
  const pairTeamValidation = fixedPair.validateFixedPairTeams(raw.pairTeams, raw.players);
  const fixedPairTeamsCount = pairTeamValidation.validTeamsCount;

  let maxByCombinatoricsRaw = calcMaxMatchesByPlayers(playersCount);
  if (mode === MODE_FIXED_PAIR_RR) {
    maxByCombinatoricsRaw = fixedPair.calcFixedPairMaxMatches(fixedPairTeamsCount);
  }

  const estimatedMode = playersCount < 4;
  const estimatedPlayers = estimatedMode
    ? Math.max(6, Math.min(10, courts * 4))
    : playersCount;
  const targetGamesPerPlayer = pickTargetGamesPerPlayer(courts);
  const balancedRaw = Math.max(1, Math.round((estimatedPlayers * targetGamesPerPlayer) / 4));
  const cap = maxByCombinatoricsRaw > 0 ? maxByCombinatoricsRaw : balancedRaw;
  const recommendedMatches = buildTierMatches(cap, balancedRaw);
  const suggestedMatches = Number((recommendedMatches[1] && recommendedMatches[1].m) || (recommendedMatches[0] && recommendedMatches[0].m) || 1);

  let capReason = 'roster';
  if (mode === MODE_FIXED_PAIR_RR) {
    capReason = fixedPairTeamsCount >= 2 ? 'round_robin' : 'pair_teams';
  } else if (estimatedMode) {
    capReason = 'estimated';
  }

  let recommendationHint = '';
  if (capReason === 'round_robin') {
    recommendationHint = `最多可安排：${cap} 场（按已组合法队伍最多 ${fixedPair.FIXED_PAIR_MAX_CYCLES} 轮计算）`;
  } else if (capReason === 'pair_teams') {
    recommendationHint = '至少需 2 支合法队伍后才能计算固搭最大场次。';
  } else if (capReason === 'estimated') {
    recommendationHint = `建议先按 ${suggestedMatches} 场配置，满 4 人后会自动重算。`;
  } else {
    recommendationHint = `建议按当前人数和场地配置 ${suggestedMatches} 场。`;
  }

  let capacityHintShort = `建议配置 ${suggestedMatches} 场`;
  if (capReason === 'round_robin') {
    capacityHintShort = `最多可安排：${cap} 场（按已组合法队伍最多 ${fixedPair.FIXED_PAIR_MAX_CYCLES} 轮计算）`;
  } else if (capReason === 'pair_teams') {
    capacityHintShort = '至少 2 支合法队伍后再配置';
  } else if (capReason === 'estimated') {
    capacityHintShort = `建议先配置 ${suggestedMatches} 场`;
  }
  const rosterHint = estimatedMode ? '满 4 人后会自动重算' : '';

  return {
    recommendedModelVersion: RECOMMEND_MODEL_VERSION,
    mode,
    playersCount,
    maleCount,
    femaleCount,
    unknownCount,
    courts,
    estimatedPlayers,
    estimatedMode,
    targetGamesPerPlayer,
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
  RECOMMEND_MODEL_VERSION,
  parsePositiveInt,
  calcMaxMatchesByPlayers,
  calcMaxMatchesByMixedGender,
  buildMatchCountRecommendations
};
