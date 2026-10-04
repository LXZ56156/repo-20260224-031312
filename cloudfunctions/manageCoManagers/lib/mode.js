const playerUtils = require('./player');

const MODE_MULTI_ROTATE = 'multi_rotate';
const MODE_SQUAD_DOUBLES = 'squad_doubles';
const MODE_FIXED_PAIR_RR = 'fixed_pair_rr';
const MODE_DOUBLES = 'doubles';
const PRESET_CUSTOM = 'custom';

const ROTATION_PRESETS = {
  rotation_6: {
    key: 'rotation_6',
    label: '6人转',
    playerLimit: 6,
    defaultTotalMatches: 9,
    defaultCourts: 1,
    allowedCourts: [1]
  },
  rotation_7: {
    key: 'rotation_7',
    label: '7人转',
    playerLimit: 7,
    defaultTotalMatches: 14,
    defaultCourts: 1,
    allowedCourts: [1]
  },
  rotation_8: {
    key: 'rotation_8',
    label: '8人转',
    playerLimit: 8,
    defaultTotalMatches: 14,
    defaultCourts: 1,
    allowedCourts: [1, 2]
  }
};

function normalizeMode(mode) {
  const v = String(mode || '').trim().toLowerCase();
  if (v === MODE_MULTI_ROTATE || v === MODE_SQUAD_DOUBLES || v === MODE_FIXED_PAIR_RR) return v;
  if (v === MODE_DOUBLES) return MODE_MULTI_ROTATE;
  return MODE_MULTI_ROTATE;
}

function isTeamMode(mode) {
  const value = normalizeMode(mode);
  return value === MODE_SQUAD_DOUBLES || value === MODE_FIXED_PAIR_RR;
}

function normalizePresetKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ROTATION_PRESETS, key)) return key;
  return PRESET_CUSTOM;
}

function cloneRotationPreset(preset) {
  if (!preset) return null;
  return {
    ...preset,
    allowedCourts: preset.allowedCourts.slice()
  };
}

function resolveRotationPreset(value) {
  const key = normalizePresetKey(value);
  return cloneRotationPreset(ROTATION_PRESETS[key] || null);
}

function getModeDisplayLabel(mode, presetKey) {
  const value = normalizeMode(mode);
  const preset = value === MODE_MULTI_ROTATE ? resolveRotationPreset(presetKey) : null;
  if (preset) return preset.label;
  if (value === MODE_SQUAD_DOUBLES) return '小队转';
  if (value === MODE_FIXED_PAIR_RR) return '固搭循环赛';
  return '多人转';
}

function getModeLabel(mode, presetKey) {
  return getModeDisplayLabel(mode, presetKey);
}

function getSynchronizedTournamentName(name, mode, presetKey) {
  const value = normalizeMode(mode);
  const preset = value === MODE_MULTI_ROTATE ? resolveRotationPreset(presetKey) : null;
  if (preset) return preset.label;
  return String(name || '').trim();
}

function getTournamentDisplayName(tournament, fallback = '羽毛球比赛') {
  const t = tournament && typeof tournament === 'object' ? tournament : {};
  const name = getSynchronizedTournamentName(
    t.name,
    t.mode || MODE_MULTI_ROTATE,
    t.presetKey
  );
  return name || String(fallback || '').trim();
}

function canEditTournamentName(mode, presetKey) {
  const value = normalizeMode(mode);
  return !(value === MODE_MULTI_ROTATE && resolveRotationPreset(presetKey));
}

function getRotationPlayerLimit(tournament) {
  const preset = resolveRotationPreset(tournament && tournament.presetKey);
  return preset ? preset.playerLimit : 0;
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
  PRESET_CUSTOM,
  normalizeMode,
  normalizePresetKey,
  resolveRotationPreset,
  isTeamMode,
  getModeDisplayLabel,
  getModeLabel,
  getSynchronizedTournamentName,
  getTournamentDisplayName,
  canEditTournamentName,
  getRotationPlayerLimit,
  safePlayerName,
  buildInitialRankings
};
