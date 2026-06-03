const playerUtils = require('./playerUtils');
const scoreUtils = require('./scoreUtils');

function asNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function getEntityId(row) {
  return String((row && (row.entityId || row.playerId || row.id)) || '').trim();
}

function isTeamRow(row) {
  return String((row && row.entityType) || '').trim().toLowerCase() === 'team';
}

function extractSquadId(players) {
  const squads = (Array.isArray(players) ? players : [])
    .map((player) => String((player && player.squad) || '').trim().toUpperCase())
    .filter(Boolean);
  return squads.length && squads.every((squad) => squad === squads[0]) ? squads[0] : '';
}

function getMatchOutcome(match, row) {
  if (!match || String(match.status || '') !== 'finished' || !scoreUtils.isValidFinishedScore(match)) return null;
  const score = scoreUtils.extractScorePairAny(match);
  const entityId = getEntityId(row);
  if (!entityId) return null;

  if (isTeamRow(row)) {
    const teamAId = String(match.unitAId || extractSquadId(match.teamA) || '').trim();
    const teamBId = String(match.unitBId || extractSquadId(match.teamB) || '').trim();
    if (entityId === teamAId) return score.a > score.b;
    if (entityId === teamBId) return score.b > score.a;
    return null;
  }

  const teamAIds = (Array.isArray(match.teamA) ? match.teamA : []).map(playerUtils.extractPlayerId);
  const teamBIds = (Array.isArray(match.teamB) ? match.teamB : []).map(playerUtils.extractPlayerId);
  if (teamAIds.includes(entityId)) return score.a > score.b;
  if (teamBIds.includes(entityId)) return score.b > score.a;
  return null;
}

function calculateMaxWinStreak(tournament, row) {
  let current = 0;
  let maximum = 0;
  const rounds = Array.isArray(tournament && tournament.rounds) ? tournament.rounds : [];

  for (const round of rounds) {
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    for (const match of matches) {
      const outcome = getMatchOutcome(match, row);
      if (outcome === null) continue;
      current = outcome ? current + 1 : 0;
      if (current > maximum) maximum = current;
    }
  }

  return Math.max(maximum, Math.floor(asNonNegativeNumber(row && row.maxWinStreak)));
}

function calculateAvgScore(row) {
  const explicit = row && row.avgScore;
  if (explicit !== '' && explicit !== null && explicit !== undefined) {
    return asNonNegativeNumber(explicit);
  }
  const played = Math.floor(asNonNegativeNumber(row && row.played));
  if (!played) return 0;
  return asNonNegativeNumber(row && row.pointsFor) / played;
}

function calculateWinRate(row) {
  const played = Math.floor(asNonNegativeNumber(row && row.played));
  if (!played) return '0%';
  const wins = Math.floor(asNonNegativeNumber(row && row.wins));
  return `${Math.round((wins * 1000) / played) / 10}%`;
}

function buildShareCardStats(tournament, row) {
  return {
    totalMatches: Math.floor(asNonNegativeNumber(row && row.played)),
    maxWinStreak: calculateMaxWinStreak(tournament, row),
    avgScore: calculateAvgScore(row),
    winRate: calculateWinRate(row)
  };
}

module.exports = {
  buildShareCardStats,
  calculateAvgScore,
  calculateMaxWinStreak,
  calculateWinRate,
  _private: {
    getMatchOutcome
  }
};
