function normalizeName(name, fallback = '') {
  const value = String(name || '').replace(/[\r\n\t]+/g, ' ').trim();
  return value || fallback;
}

function makeGuestId(index) {
  return `guest_${Date.now()}_${index}_${Math.floor(Math.random() * 1000000)}`;
}

function normalizeSquad(value) {
  const squad = String(value || '').trim().toUpperCase();
  return squad === 'A' || squad === 'B' ? squad : '';
}

function copyPlayers(sourcePlayers, openid, createGuestId = makeGuestId, options = {}) {
  const list = Array.isArray(sourcePlayers) ? sourcePlayers : [];
  const preserveSquad = options && options.preserveSquad === true;
  const playerIdMap = {};
  const players = list.map((player, idx) => {
    const item = player || {};
    const sourceId = String(item.id || '').trim();
    const name = normalizeName(item.name || item.nickName || item.nickname, `球员${idx + 1}`);
    const avatar = String(item.avatar || item.avatarUrl || '').trim();
    const genderRaw = String(item.gender || '').trim().toLowerCase();
    const gender = (genderRaw === 'male' || genderRaw === 'female') ? genderRaw : 'unknown';
    const squad = preserveSquad ? normalizeSquad(item.squad) : '';
    const isCreator = sourceId === openid || (idx === 0 && !sourceId);

    if (isCreator) {
      if (sourceId) playerIdMap[sourceId] = openid;
      return { id: openid, name, type: 'user', avatar, gender, squad };
    }

    const nextId = createGuestId(idx);
    if (sourceId) playerIdMap[sourceId] = nextId;
    return { id: nextId, name, type: 'guest', avatar, gender, squad };
  });

  return { players, playerIdMap };
}

function copyPairTeams(sourcePairTeams, playerIdMap) {
  const teams = Array.isArray(sourcePairTeams) ? sourcePairTeams : [];
  const idMap = playerIdMap && typeof playerIdMap === 'object' ? playerIdMap : {};
  return teams.map((team, idx) => {
    const playerIds = Array.isArray(team && team.playerIds)
      ? team.playerIds
        .slice(0, 2)
        .map((playerId) => idMap[String(playerId || '').trim()])
        .filter(Boolean)
      : [];
    if (playerIds.length !== 2) return null;
    return {
      id: String(team && team.id || `pair_${idx}`).trim() || `pair_${idx}`,
      name: normalizeName(team && team.name, `第${idx + 1}队`) || `第${idx + 1}队`,
      playerIds,
      locked: team && team.locked === false ? false : true
    };
  }).filter(Boolean);
}

module.exports = {
  normalizeName,
  normalizeSquad,
  makeGuestId,
  copyPlayers,
  copyPairTeams
};
