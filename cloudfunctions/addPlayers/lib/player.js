function extractPlayerId(player) {
  if (!player) return '';
  if (typeof player === 'string') return String(player).trim();
  return String(player.id || player.playerId || player._id || '').trim();
}

function safePlayerName(player) {
  const raw = player && (player.name || player.nickName || player.nickname || player.displayName);
  const name = String(raw || '').trim();
  if (name) {
    const matched = name.match(/^成员([0-9a-zA-Z]{1,16})$/);
    return matched ? matched[1] : name;
  }
  const idRaw = extractPlayerId(player);
  const alnum = idRaw.replace(/[^0-9a-zA-Z]/g, '');
  const suffix = (alnum.slice(-4) || idRaw.slice(-4) || '').trim();
  return suffix || '匿名';
}

function isParticipantInTournament(tournament, openid) {
  const oid = String(openid || '').trim();
  if (!oid || !tournament || typeof tournament !== 'object') return false;
  const playerIds = Array.isArray(tournament.playerIds)
    ? tournament.playerIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (playerIds.includes(oid)) return true;
  const players = Array.isArray(tournament.players) ? tournament.players : [];
  return players.some((player) => extractPlayerId(player) === oid);
}

module.exports = {
  extractPlayerId,
  safePlayerName,
  isParticipantInTournament
};
