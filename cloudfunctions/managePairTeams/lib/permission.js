const playerUtils = require('./player');

function isAdmin(tournament, openid) {
  return !!(tournament && openid && String(tournament.creatorId || '') === String(openid || ''));
}

function isParticipant(tournament, openid) {
  return playerUtils.isParticipantInTournament(tournament, openid);
}

function canEditScore(tournament, openid) {
  // Tournament-level referee assignment is currently reserved and does not gate
  // score entry yet. Keep permission on the existing admin/participant contract.
  return isAdmin(tournament, openid) || isParticipant(tournament, openid);
}

module.exports = {
  isAdmin,
  isParticipant,
  canEditScore
};
