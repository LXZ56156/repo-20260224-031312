const playerUtils = require('./playerUtils');
const scoreUtils = require('./scoreUtils');

const VALID_UNITS_PER_LOSER = Object.freeze([0, 1, 2]);

function normalizeUnitsPerLoser(value) {
  let units = value;
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!/^[012]$/.test(normalized)) return null;
    units = Number(normalized);
  } else if (typeof value !== 'number') {
    return null;
  }
  if (!Number.isInteger(units)) return null;
  return VALID_UNITS_PER_LOSER.includes(units) ? units : null;
}

function normalizeWaterConfig(mode, rules) {
  const normalizedMode = String(mode || '').trim().toLowerCase();
  const sourceRules = rules && typeof rules === 'object' && !Array.isArray(rules) ? rules : {};
  const water = sourceRules.water && typeof sourceRules.water === 'object' && !Array.isArray(sourceRules.water)
    ? sourceRules.water
    : null;
  const defaultUnitsPerLoser = normalizeUnitsPerLoser(water && water.defaultUnitsPerLoser);
  const enabled = normalizedMode === 'multi_rotate'
    && !!water
    && water.enabled === true
    && defaultUnitsPerLoser !== null;
  return {
    enabled,
    defaultUnitsPerLoser: enabled ? defaultUnitsPerLoser : 1
  };
}

function normalizeTeam(team) {
  if (!Array.isArray(team) || team.length < 1) return null;
  const seen = new Set();
  const members = [];
  for (const player of team) {
    const id = playerUtils.extractPlayerId(player);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    members.push({ id, player });
  }
  return members;
}

function formatNetUnits(value) {
  const units = Number(value) || 0;
  if (units > 0) return `+${units}`;
  return String(units);
}

function deriveWaterLedger(tournament) {
  const source = tournament && typeof tournament === 'object' ? tournament : {};
  const config = normalizeWaterConfig(source.mode, source.rules);
  if (!config.enabled) {
    return {
      enabled: false,
      hasRecords: false,
      recordedMatchCount: 0,
      rows: []
    };
  }

  const stats = new Map();
  const ensureRow = (id, player) => {
    if (!id) return null;
    if (!stats.has(id)) {
      stats.set(id, {
        playerId: id,
        name: playerUtils.safePlayerName(player || { id }),
        wonUnits: 0,
        treatUnits: 0
      });
    }
    return stats.get(id);
  };

  for (const player of (Array.isArray(source.players) ? source.players : [])) {
    const id = playerUtils.extractPlayerId(player);
    if (id) ensureRow(id, player);
  }

  let recordedMatchCount = 0;
  for (const round of (Array.isArray(source.rounds) ? source.rounds : [])) {
    for (const match of (Array.isArray(round && round.matches) ? round.matches : [])) {
      if (!match || String(match.status || '').trim() !== 'finished') continue;
      if (!scoreUtils.isValidFinishedScore(match)) continue;
      if (!scoreUtils.isScoreWithinBounds(match, scoreUtils.SCORE_ABSOLUTE_MAX)) continue;

      const unitsPerLoser = normalizeUnitsPerLoser(match.water && match.water.unitsPerLoser);
      if (unitsPerLoser === null) continue;

      const teamA = normalizeTeam(match.teamA);
      const teamB = normalizeTeam(match.teamB);
      if (!teamA || !teamB || teamA.length !== teamB.length) continue;
      const teamAIds = new Set(teamA.map((member) => member.id));
      if (teamB.some((member) => teamAIds.has(member.id))) continue;

      const score = scoreUtils.extractScorePairAny(match);
      const winners = score.a > score.b ? teamA : teamB;
      const losers = score.a > score.b ? teamB : teamA;
      for (const member of winners) {
        const row = ensureRow(member.id, member.player);
        row.wonUnits += unitsPerLoser;
      }
      for (const member of losers) {
        const row = ensureRow(member.id, member.player);
        row.treatUnits += unitsPerLoser;
      }
      recordedMatchCount += 1;
    }
  }

  if (recordedMatchCount < 1) {
    return {
      enabled: true,
      hasRecords: false,
      recordedMatchCount: 0,
      rows: []
    };
  }

  const rows = Array.from(stats.values())
    .map((row) => {
      const netUnits = row.wonUnits - row.treatUnits;
      return {
        ...row,
        netUnits,
        netText: formatNetUnits(netUnits)
      };
    })
    .sort((left, right) => {
      if (right.netUnits !== left.netUnits) return right.netUnits - left.netUnits;
      if (right.wonUnits !== left.wonUnits) return right.wonUnits - left.wonUnits;
      const nameOrder = String(left.name || '').localeCompare(String(right.name || ''));
      if (nameOrder !== 0) return nameOrder;
      return String(left.playerId || '').localeCompare(String(right.playerId || ''));
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    enabled: true,
    hasRecords: true,
    recordedMatchCount,
    rows
  };
}

module.exports = {
  VALID_UNITS_PER_LOSER,
  normalizeUnitsPerLoser,
  normalizeWaterConfig,
  deriveWaterLedger
};
