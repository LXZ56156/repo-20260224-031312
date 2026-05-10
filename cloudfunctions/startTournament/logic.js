const modeHelper = require('./lib/mode');
const fixedPair = require('./lib/fixed-pair');
const scheduleContract = require('./lib/schedule');

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
  const normalizedType = scheduleContract.normalizeEndConditionType(endCondition && endCondition.type);
  const target = Math.max(1, Number(endCondition && endCondition.target) || totalMatches);
  if (normalizedType === 'total_rounds' && context.mode === 'squad_doubles') {
    const effectiveCourts = resolveSquadEffectiveCourts(context.players, context.courts);
    return Math.max(1, Math.floor(target) * effectiveCourts);
  }
  return scheduleContract.deriveScheduledMatches(totalMatches, {
    type: normalizedType,
    target
  });
}

function buildPairTeamsInvalidError(validation) {
  return new Error(`START_PAIR_TEAMS_INVALID:${fixedPair.getFixedPairInvalidMessage(validation)}`);
}

function validateBeforeGenerate(tournament) {
  const t = tournament || {};
  const players = scheduleContract.normalizeRosterPlayers(Array.isArray(t.players) ? t.players : []);
  if (players.length < 4) throw new Error('参赛人数不足 4 人');
  scheduleContract.assertValidRosterPlayers(players);

  const mode = modeHelper.normalizeMode(t.mode);

  const rules = t && t.rules && typeof t.rules === 'object' ? t.rules : {};
  const endCondition = rules && typeof rules.endCondition === 'object' ? rules.endCondition : {};
  const totalMatches = Math.max(1, Number(t.totalMatches) || 1);
  const courts = Math.max(1, Math.min(10, Number(t.courts) || 1));
  if (totalMatches < 1) throw new Error('M 必须 >= 1');
  if (courts < 1) throw new Error('C 必须 >= 1');
  const rotationPreset = mode === 'multi_rotate' ? modeHelper.resolveRotationPreset(t.presetKey) : null;
  if (rotationPreset) {
    if (players.length !== rotationPreset.playerLimit) {
      throw new Error(`${rotationPreset.label}需要正好 ${rotationPreset.playerLimit} 人参赛，当前 ${players.length} 人`);
    }
    if (!rotationPreset.allowedCourts.includes(courts)) {
      throw new Error(`${rotationPreset.label}只能使用 ${rotationPreset.allowedCourts.join(' 或 ')} 场地`);
    }
  }

  const { maleCount, femaleCount, unknownCount } = countGender(players);
  let maxMatches = calcMaxMatches(players.length);
  let pairTeams = Array.isArray(t.pairTeams) ? t.pairTeams : [];
  if (mode === 'fixed_pair_rr') {
    const validation = fixedPair.validateFixedPairTeams(pairTeams, players);
    if (validation.hasInvalid) throw buildPairTeamsInvalidError(validation);
    if (validation.validTeamsCount < 2) throw new Error('固搭循环赛至少需要 2 支合法队伍');
    maxMatches = fixedPair.calcFixedPairMaxMatches(validation.validTeamsCount);
    pairTeams = validation.teams;
  }
  if (mode === 'squad_doubles') {
    const { aCount, bCount } = countSquadPlayers(players);
    if (aCount < 2 || bCount < 2) throw new Error('小队转需要 A/B 队至少各 2 人');
    maxMatches = calcMaxMatches(players.length);
  }
  const normalizedEndConditionType = scheduleContract.normalizeEndConditionType(endCondition.type);
  const normalizedEndConditionTarget = Math.max(1, Number(endCondition.target) || totalMatches);
  const scheduledMatches = deriveEffectiveScheduledMatches(totalMatches, {
    type: normalizedEndConditionType,
    target: normalizedEndConditionTarget
  }, {
    mode,
    players,
    courts
  });
  if (maxMatches > 0 && scheduledMatches > maxMatches) {
    if (scheduledMatches !== totalMatches) {
      throw new Error(`结束条件会产生 ${scheduledMatches} 场，不能超过最大可选 ${maxMatches} 场`);
    }
    throw new Error(`总场次不能超过最大可选 ${maxMatches} 场`);
  }
  return {
    players,
    totalMatches,
    scheduledMatches,
    courts,
    maxMatches,
    mode,
    maleCount,
    femaleCount,
    unknownCount,
    pairTeams,
    rules: {
      pointsPerGame: Number(rules.pointsPerGame) || 21,
      endCondition: {
        type: normalizedEndConditionType,
        target: normalizedEndConditionTarget
      },
      unfinishedPolicy: String(rules.unfinishedPolicy || 'admin_decide')
    }
  };
}

module.exports = {
  calcMaxMatches,
  calcMaxMatchesMixed,
  normalizeMode: modeHelper.normalizeMode,
  normalizeGender,
  countGender,
  buildPairTeamsInvalidError,
  deriveEffectiveScheduledMatches,
  validateBeforeGenerate
};
