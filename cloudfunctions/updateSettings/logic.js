const modeHelper = require('./lib/mode');
const fixedPair = require('./lib/fixed-pair');
const scheduleContract = require('./lib/schedule');

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
  return scheduleContract.normalizeEndConditionType(type);
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

function calcMaxMatchesMixed(maleCount, femaleCount, unknownCount) {
  const male = Math.max(0, Number(maleCount) || 0);
  const female = Math.max(0, Number(femaleCount) || 0);
  const unknown = Math.max(0, Number(unknownCount) || 0);
  const total = male + female + unknown;
  if (total < 4) return 0;
  const mx = fixedPair.comb(male, 2) * fixedPair.comb(female, 2);
  const mm = fixedPair.comb(male, 4);
  const ff = fixedPair.comb(female, 4);
  return Math.floor((mx + mm + ff) * 3);
}

function countSquadPlayers(players) {
  const result = { aCount: 0, bCount: 0 };
  (Array.isArray(players) ? players : []).forEach((player) => {
    const squad = String(player && player.squad || '').trim().toUpperCase();
    if (squad === 'A') result.aCount += 1;
    if (squad === 'B') result.bCount += 1;
  });
  return result;
}

function resolveSquadEffectiveCourts(players, courts) {
  const requested = Math.max(1, Math.min(10, Number(courts) || 1));
  const { aCount, bCount } = countSquadPlayers(players);
  if (aCount < 2 || bCount < 2) return requested;
  return Math.max(1, Math.min(requested, Math.floor(aCount / 2), Math.floor(bCount / 2)));
}

function deriveEffectiveScheduledMatches(totalMatches, endCondition, context = {}) {
  const normalizedType = normalizeEndConditionType(endCondition && endCondition.type);
  const target = parseTargetInt(endCondition && endCondition.target, totalMatches);
  if (normalizedType === 'total_rounds' && context.mode === 'squad_doubles') {
    const effectiveCourts = resolveSquadEffectiveCourts(context.players, context.courts);
    return Math.max(1, target * effectiveCourts);
  }
  return scheduleContract.deriveScheduledMatches(totalMatches, {
    type: normalizedType,
    target
  });
}

function validateSettings(players, totalMatches, courts, mode = 'multi_rotate', pairTeams = [], options = {}) {
  const list = Array.isArray(players) ? players : [];
  scheduleContract.assertValidRosterPlayers(list);
  const normalizedMode = modeHelper.normalizeMode(mode);
  const rotationPreset = normalizedMode === 'multi_rotate'
    ? modeHelper.resolveRotationPreset(options && options.presetKey)
    : null;
  let maxMatches = calcMaxMatches(list.length);
  if (normalizedMode === 'fixed_pair_rr') {
    const validation = fixedPair.validateFixedPairTeams(pairTeams, list);
    maxMatches = fixedPair.calcFixedPairMaxMatches(validation.validTeamsCount);
  }
  const resolvedTotalMatches = Math.max(
    1,
    Math.floor(Number(options && options.resolvedTotalMatches) || Number(totalMatches) || 1)
  );
  const normalizedEndConditionType = normalizeEndConditionType(options && options.endConditionType);
  const normalizedEndConditionTarget = parseTargetInt(
    options && options.endConditionTarget,
    resolvedTotalMatches
  );
  const resolvedCourts = Math.max(
    1,
    Math.min(10, Math.floor(Number(options && options.resolvedCourts) || Number(courts) || 1))
  );
  if (rotationPreset && !rotationPreset.allowedCourts.includes(resolvedCourts)) {
    throw new Error(`${rotationPreset.label}只能使用 ${rotationPreset.allowedCourts.join(' 或 ')} 场地`);
  }
  const scheduledMatches = deriveEffectiveScheduledMatches(resolvedTotalMatches, {
    type: normalizedEndConditionType,
    target: normalizedEndConditionTarget
  }, {
    mode: normalizedMode,
    players: list,
    courts: resolvedCourts
  });

  if (totalMatches !== null || normalizedEndConditionType !== 'total_matches') {
    // 允许在人数不足 4 时先做预配置；开赛前由 startTournament 做最终校验。
    if (maxMatches > 0 && scheduledMatches > maxMatches) {
      if (scheduledMatches !== resolvedTotalMatches) {
        throw new Error(`结束条件会产生 ${scheduledMatches} 场，不能超过最大可选 ${maxMatches} 场`);
      }
      throw new Error(`总场次不能超过最大可选 ${maxMatches} 场`);
    }
  }

  const patch = {};
  if (totalMatches !== null) patch.totalMatches = totalMatches;
  if (courts !== null) patch.courts = courts;
  if (totalMatches !== null && courts !== null) patch.settingsConfigured = true;

  return { maxMatches, scheduledMatches, patch };
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
  deriveEffectiveScheduledMatches,
  countGender,
  validateSettings
};
