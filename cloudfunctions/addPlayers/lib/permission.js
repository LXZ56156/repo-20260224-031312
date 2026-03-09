const playerUtils = require('./player');

function isAdmin(tournament, openid) {
  return !!(tournament && openid && String(tournament.creatorId || '') === String(openid || ''));
}

function isParticipant(tournament, openid) {
  return playerUtils.isParticipantInTournament(tournament, openid);
}

function canEditScore(tournament, openid) {
  return isAdmin(tournament, openid) || isParticipant(tournament, openid);
}

module.exports = {
  isAdmin,
  isParticipant,
  canEditScore
};
