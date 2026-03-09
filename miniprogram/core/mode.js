const playerUtils = require('./playerUtils');

const MODE_MULTI_ROTATE = 'multi_rotate';
const MODE_SQUAD_DOUBLES = 'squad_doubles';
const MODE_FIXED_PAIR_RR = 'fixed_pair_rr';
const MODE_DOUBLES = 'doubles';
const MODE_MIXED_FALLBACK = 'mixed_fallback';

function normalizeMode(mode) {
  const v = String(mode || '').trim().toLowerCase();
  if (v === MODE_MULTI_ROTATE || v === MODE_SQUAD_DOUBLES || v === MODE_FIXED_PAIR_RR) return v;
  if (v === MODE_MIXED_FALLBACK || v === MODE_DOUBLES) return MODE_MULTI_ROTATE;
  return MODE_MULTI_ROTATE;
}

function isTeamMode(mode) {
  const value = normalizeMode(mode);
  return value === MODE_SQUAD_DOUBLES || value === MODE_FIXED_PAIR_RR;
}

function getModeLabel(mode) {
  const value = normalizeMode(mode);
  if (value === MODE_SQUAD_DOUBLES) return '小队转';
  if (value === MODE_FIXED_PAIR_RR) return '固搭循环赛';
  return '多人转';
}

function safePlayerName(player) {
  return playerUtils.safePlayerName(player);
}

function buildInitialRankings(mode, players, pairTeams = []) {
  const value = normalizeMode(mode);
  if (value === MODE_SQUAD_DOUBLES) {
    return [
      { id: 'A', name: 'A队' },
      { id: 'B', name: 'B队' }
    ].map((team) => ({
      entityType: 'team',
      entityId: team.id,
      playerId: team.id,
      name: team.name,
      wins: 0,
      losses: 0,
      played: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0
    }));
  }
  if (value === MODE_FIXED_PAIR_RR) {
    const teams = Array.isArray(pairTeams) ? pairTeams : [];
    return teams.map((team, idx) => ({
      entityType: 'team',
      entityId: String(team && team.id || `pair_${idx}`),
      playerId: String(team && team.id || `pair_${idx}`),
      name: String(team && team.name || `第${idx + 1}队`),
      wins: 0,
      losses: 0,
      played: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0
    }));
  }
  return (Array.isArray(players) ? players : []).map((player) => {
    const id = String((player && (player.id || player.playerId || player._id)) || '').trim();
    return {
      entityType: 'player',
      entityId: id,
      playerId: id,
      name: safePlayerName(player),
      wins: 0,
      losses: 0,
      played: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0
    };
  });
}

module.exports = {
  MODE_MULTI_ROTATE,
  MODE_SQUAD_DOUBLES,
  MODE_FIXED_PAIR_RR,
  MODE_DOUBLES,
  MODE_MIXED_FALLBACK,
  normalizeMode,
  isTeamMode,
  getModeLabel,
  safePlayerName,
  buildInitialRankings
};
