const playerUtils = require('../core/playerUtils');

function isAdmin(tournament, openid) {
  return !!(tournament && openid && String(tournament.creatorId || '') === String(openid || ''));
}

function isParticipant(tournament, openid) {
  return playerUtils.isParticipantInTournament(tournament, openid);
}

function canEditScore(tournament, openid) {
  // `setReferee` is currently a reserved backend capability, not a frontend-exposed
  // scoring role. Score entry stays on the existing admin/participant matrix.
  return isAdmin(tournament, openid) || isParticipant(tournament, openid);
}

/**
 * 校验赛事状态是否在允许列表中，不满足则抛出错误。
 * @param {object} tournament 赛事对象
 * @param {string[]} allowedStatuses 允许的状态列表（如 ['draft', 'running']）
 */
function requireTournamentStatus(tournament, allowedStatuses) {
  if (!tournament || typeof tournament !== 'object') {
    throw new Error('赛事不存在');
  }
  const status = String(tournament.status || '').trim().toLowerCase();
  const allowed = (Array.isArray(allowedStatuses) ? allowedStatuses : [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(status)) {
    throw new Error(`当前赛事状态（${status || '未知'}）不允许此操作，需为：${allowed.join(' / ')}`);
  }
}

module.exports = { isAdmin, isParticipant, canEditScore, requireTournamentStatus };
