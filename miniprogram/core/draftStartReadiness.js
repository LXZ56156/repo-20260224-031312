const flow = require('./uxFlow');

function getValidPairTeams(pairTeams) {
  const teams = Array.isArray(pairTeams) ? pairTeams : [];
  return teams.filter((item) => {
    const playerIds = Array.isArray(item && item.playerIds)
      ? item.playerIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    return playerIds.length === 2;
  });
}

function buildDraftStartReadiness(tournament) {
  const t = tournament && typeof tournament === 'object' ? tournament : {};
  const players = Array.isArray(t.players) ? t.players : [];
  const playersCount = players.length;
  const mode = flow.normalizeMode(t.mode || flow.MODE_MULTI_ROTATE);
  const aCount = players.filter((item) => String(item && item.squad || '').toUpperCase() === 'A').length;
  const bCount = players.filter((item) => String(item && item.squad || '').toUpperCase() === 'B').length;
  const validPairTeams = getValidPairTeams(t.pairTeams);
  const validPairTeamsCount = validPairTeams.length;

  let checkPlayersOk = playersCount >= 4;
  let playersChecklistHint = checkPlayersOk ? '人数已达标' : '至少 4 人';

  if (mode === flow.MODE_SQUAD_DOUBLES) {
    checkPlayersOk = playersCount >= 4 && aCount >= 2 && bCount >= 2;
    playersChecklistHint = checkPlayersOk
      ? `A队 ${aCount} / B队 ${bCount}`
      : `A队 ${aCount} / B队 ${bCount}（至少各2人）`;
  } else if (mode === flow.MODE_FIXED_PAIR_RR) {
    checkPlayersOk = playersCount >= 4 && validPairTeamsCount >= 2;
    playersChecklistHint = checkPlayersOk
      ? `已组 ${validPairTeamsCount} 支队伍`
      : `需至少2支队伍（当前${validPairTeamsCount}）`;
  }

  const checkSettingsOk = !!t.settingsConfigured;

  return {
    mode,
    playersCount,
    aCount,
    bCount,
    validPairTeamsCount,
    checkPlayersOk,
    playersChecklistHint,
    checkSettingsOk,
    checkStartReady: checkPlayersOk && checkSettingsOk
  };
}

module.exports = {
  getValidPairTeams,
  buildDraftStartReadiness
};
