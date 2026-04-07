const flow = require('./uxFlow');
const fixedPair = require('./fixedPair');

function buildDraftStartReadiness(tournament) {
  const t = tournament && typeof tournament === 'object' ? tournament : {};
  const players = Array.isArray(t.players) ? t.players : [];
  const playersCount = players.length;
  const mode = flow.normalizeMode(t.mode || flow.MODE_MULTI_ROTATE);
  const aCount = players.filter((item) => String(item && item.squad || '').toUpperCase() === 'A').length;
  const bCount = players.filter((item) => String(item && item.squad || '').toUpperCase() === 'B').length;
  const pairTeamValidation = fixedPair.validateFixedPairTeams(t.pairTeams, players);
  const validPairTeamsCount = pairTeamValidation.validTeamsCount;
  const invalidPairTeamsCount = pairTeamValidation.invalidTeamsCount;

  let checkPlayersOk = playersCount >= 4;
  let playersChecklistHint = checkPlayersOk ? '人数已达标' : '至少 4 人';

  if (mode === flow.MODE_SQUAD_DOUBLES) {
    checkPlayersOk = playersCount >= 4 && aCount >= 2 && bCount >= 2;
    playersChecklistHint = checkPlayersOk
      ? `A队 ${aCount} / B队 ${bCount}`
      : `A队 ${aCount} / B队 ${bCount}（至少各2人）`;
  } else if (mode === flow.MODE_FIXED_PAIR_RR) {
    checkPlayersOk = playersCount >= 4 && validPairTeamsCount >= 2 && !pairTeamValidation.hasInvalid;
    playersChecklistHint = playersCount >= 4
      ? fixedPair.buildFixedPairReadinessHint(pairTeamValidation)
      : '至少 4 人';
  }

  const checkSettingsOk = !!t.settingsConfigured;

  return {
    mode,
    playersCount,
    aCount,
    bCount,
    validPairTeamsCount,
    invalidPairTeamsCount,
    checkPlayersOk,
    playersChecklistHint,
    checkSettingsOk,
    checkStartReady: checkPlayersOk && checkSettingsOk
  };
}

module.exports = {
  getValidPairTeams(pairTeams, players = []) {
    return fixedPair.validateFixedPairTeams(pairTeams, players).teams;
  },
  buildDraftStartReadiness
};
