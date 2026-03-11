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

module.exports = { isAdmin, isParticipant, canEditScore };
