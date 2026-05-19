const playerUtils = require('./player');

const FIXED_PAIR_MAX_CYCLES = 10;
const FIXED_PAIR_CYCLE_SHORTCUTS = [1, 2, 3, 5, 10];
const PAIR_TEAM_VALIDATION_CODES = {
  TEAM_SIZE_INVALID: 'TEAM_SIZE_INVALID',
  INVALID_PLAYER: 'INVALID_PLAYER',
  DUPLICATE_PLAYER: 'DUPLICATE_PLAYER'
};

function comb(n, k) {
  const nn = Math.floor(Number(n) || 0);
  const kk = Math.floor(Number(k) || 0);
  if (kk < 0 || nn < 0 || kk > nn) return 0;
  if (kk === 0 || kk === nn) return 1;
  const m = Math.min(kk, nn - kk);
  let numerator = 1;
  let denominator = 1;
  for (let i = 1; i <= m; i += 1) {
    numerator *= (nn - m + i);
    denominator *= i;
  }
  return Math.floor(numerator / denominator);
}

function normalizePairTeamPlayerIds(playerIds) {
  const ids = Array.isArray(playerIds) ? playerIds : [];
  const out = [];
  for (const item of ids) {
    const id = String(item || '').trim();
    if (!id || out.includes(id)) continue;
    out.push(id);
    if (out.length >= 2) break;
  }
  return out;
}

function buildValidPlayerIds(players) {
  const list = Array.isArray(players) ? players : [];
  const out = [];
  for (const player of list) {
    const id = playerUtils.extractPlayerId(player);
    if (!id || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

function buildPairTeamName(team, index) {
  return String(team && team.name || '').trim() || `第${index + 1}队`;
}

function validateFixedPairTeams(pairTeamsRaw, players) {
  const teams = Array.isArray(pairTeamsRaw) ? pairTeamsRaw : [];
  const validSet = new Set(buildValidPlayerIds(players));
  const usedSet = new Set();
  const out = [];
  const invalidTeams = [];

  for (let index = 0; index < teams.length; index += 1) {
    const team = teams[index] || {};
    const playerIds = normalizePairTeamPlayerIds(team.playerIds);
    let invalidCode = '';
    if (playerIds.length !== 2) {
      invalidCode = PAIR_TEAM_VALIDATION_CODES.TEAM_SIZE_INVALID;
    } else if (!validSet.has(playerIds[0]) || !validSet.has(playerIds[1])) {
      invalidCode = PAIR_TEAM_VALIDATION_CODES.INVALID_PLAYER;
    } else if (usedSet.has(playerIds[0]) || usedSet.has(playerIds[1])) {
      invalidCode = PAIR_TEAM_VALIDATION_CODES.DUPLICATE_PLAYER;
    }

    if (invalidCode) {
      invalidTeams.push({
        code: invalidCode,
        index,
        id: String(team.id || `pair_${index}`).trim() || `pair_${index}`,
        name: buildPairTeamName(team, index),
        playerIds
      });
      continue;
    }

    usedSet.add(playerIds[0]);
    usedSet.add(playerIds[1]);
    out.push({
      ...team,
      id: String(team.id || `pair_${index}`).trim() || `pair_${index}`,
      name: buildPairTeamName(team, out.length),
      playerIds
    });
  }

  return {
    teams: out,
    validTeamsCount: out.length,
    invalidTeams,
    invalidTeamsCount: invalidTeams.length,
    hasInvalid: invalidTeams.length > 0
  };
}

function calcFixedPairRoundRobinMatches(teamCount) {
  const count = Math.max(0, Math.floor(Number(teamCount) || 0));
  if (count < 2) return 0;
  return comb(count, 2);
}

function calcFixedPairMaxMatches(teamCount) {
  return calcFixedPairRoundRobinMatches(teamCount) * FIXED_PAIR_MAX_CYCLES;
}

function getFixedPairInvalidMessage(validation) {
  const first = validation && Array.isArray(validation.invalidTeams) ? validation.invalidTeams[0] : null;
  const code = String(first && first.code || '').trim().toUpperCase();
  if (code === PAIR_TEAM_VALIDATION_CODES.DUPLICATE_PLAYER) return '固搭队伍存在重复成员，请先调整';
  if (code === PAIR_TEAM_VALIDATION_CODES.INVALID_PLAYER) return '固搭队伍存在无效成员，请先调整';
  if (code === PAIR_TEAM_VALIDATION_CODES.TEAM_SIZE_INVALID) return '固搭队伍需每队 2 人，请先调整';
  return '固搭队伍数据无效，请先调整';
}

module.exports = {
  FIXED_PAIR_MAX_CYCLES,
  FIXED_PAIR_CYCLE_SHORTCUTS,
  PAIR_TEAM_VALIDATION_CODES,
  comb,
  normalizePairTeamPlayerIds,
  buildValidPlayerIds,
  validateFixedPairTeams,
  calcFixedPairRoundRobinMatches,
  calcFixedPairMaxMatches,
  getFixedPairInvalidMessage
};
