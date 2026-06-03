const playerUtils = require('./player');

function normalizeEndConditionType(type) {
  const value = String(type || '').trim().toLowerCase();
  if (value === 'total_matches' || value === 'total_rounds' || value === 'target_wins') return value;
  return 'total_matches';
}

function deriveScheduledMatches(totalMatches, endCondition = {}) {
  const configuredMatches = Math.max(1, Math.floor(Number(totalMatches) || 1));
  const normalizedType = normalizeEndConditionType(endCondition && endCondition.type);
  const target = Math.max(1, Math.floor(Number(endCondition && endCondition.target) || configuredMatches));
  if (normalizedType === 'target_wins') {
    return Math.max(configuredMatches, target * 2 - 1);
  }
  return configuredMatches;
}

function validateRosterPlayers(players = []) {
  const duplicateIds = [];
  const seen = new Set();
  let missingIdCount = 0;

  for (const player of (Array.isArray(players) ? players : [])) {
    const id = playerUtils.extractPlayerId(player);
    if (!id) {
      missingIdCount += 1;
      continue;
    }
    if (seen.has(id)) {
      if (!duplicateIds.includes(id)) duplicateIds.push(id);
      continue;
    }
    seen.add(id);
  }

  return {
    hasInvalid: missingIdCount > 0 || duplicateIds.length > 0,
    missingIdCount,
    duplicateIds
  };
}

function normalizeRosterPlayers(players = []) {
  return playerUtils.normalizeRosterPlayers(players);
}

function getRosterValidationMessage(validation, label = '参赛名单') {
  const result = validation && typeof validation === 'object' ? validation : {};
  const prefix = String(label || '参赛名单').trim() || '参赛名单';
  if (Number(result.missingIdCount) > 0) {
    return `${prefix}中有成员缺少唯一标识，请刷新名单后重试`;
  }
  if (Array.isArray(result.duplicateIds) && result.duplicateIds.length > 0) {
    return `${prefix}中有重复成员，请去重后再继续`;
  }
  return '';
}

function assertValidRosterPlayers(players = [], label = '参赛名单') {
  const validation = validateRosterPlayers(players);
  if (validation.hasInvalid) {
    throw new Error(getRosterValidationMessage(validation, label));
  }
  return validation;
}

module.exports = {
  normalizeEndConditionType,
  deriveScheduledMatches,
  normalizeRosterPlayers,
  validateRosterPlayers,
  getRosterValidationMessage,
  assertValidRosterPlayers
};
