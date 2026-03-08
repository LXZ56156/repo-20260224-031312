function isAdmin(tournament, openid) {
  return !!(tournament && openid && String(tournament.creatorId || '') === String(openid || ''));
}

function isParticipant(tournament, openid) {
  if (!tournament || !openid) return false;
  const players = Array.isArray(tournament.players) ? tournament.players : [];
  return players.some((player) => String((player && player.id) || '') === String(openid || ''));
}

function canEditScore(tournament, openid) {
  return isAdmin(tournament, openid) || isParticipant(tournament, openid);
}

module.exports = {
  isAdmin,
  isParticipant,
  canEditScore
};
