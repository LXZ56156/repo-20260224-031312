const modeHelper = require('./mode');
const playerUtils = require('./playerUtils');
const scoreUtils = require('./scoreUtils');

function sortRanking(list) {
  return (Array.isArray(list) ? list : []).slice().sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function buildPlayerNameMap(players) {
  const map = {};
  for (const player of (Array.isArray(players) ? players : [])) {
    const id = playerUtils.extractPlayerId(player);
    if (!id) continue;
    map[id] = playerUtils.safePlayerName(player);
  }
  return map;
}

function buildTeamNameMap(tournament) {
  const t = tournament || {};
  const map = {};
  const mode = modeHelper.normalizeMode(t.mode);
  if (mode === modeHelper.MODE_SQUAD_DOUBLES) {
    map.A = 'A队';
    map.B = 'B队';
  }
  const pairTeams = Array.isArray(t.pairTeams) ? t.pairTeams : [];
  for (let i = 0; i < pairTeams.length; i += 1) {
    const team = pairTeams[i] || {};
    const id = String(team.id || '').trim();
    if (!id) continue;
    map[id] = String(team.name || '').trim() || `第${i + 1}队`;
  }
  return map;
}

function makeRankingRow(entityType, entityId, name) {
  return {
    entityType,
    entityId,
    playerId: entityId,
    name,
    wins: 0,
    losses: 0,
    played: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDiff: 0
  };
}

function normalizeCurrentRankings(tournament) {
  const t = tournament || {};
  const playerNames = buildPlayerNameMap(t.players);
  const teamNames = buildTeamNameMap(t);
  return sortRanking((Array.isArray(t.rankings) ? t.rankings : []).map((row, idx) => {
    const entityType = String((row && row.entityType) || '').trim().toLowerCase() === 'team' ? 'team' : 'player';
    const entityId = String((row && (row.entityId || row.playerId || row.id)) || '').trim() || `legacy_${idx}`;
    const nameMap = entityType === 'team' ? teamNames : playerNames;
    return {
      entityType,
      entityId,
      playerId: entityId,
      rankKey: `${entityType}_${entityId}`,
      name: nameMap[entityId] || String((row && row.name) || '').trim() || '未知',
      wins: Number(row && row.wins) || 0,
      losses: Number(row && row.losses) || 0,
      played: Number(row && row.played) || 0,
      pointsFor: Number(row && row.pointsFor) || 0,
      pointsAgainst: Number(row && row.pointsAgainst) || 0,
      pointDiff: Number(row && row.pointDiff) || 0
    };
  }));
}

function computePlayerRankingsUntilRound(tournament, maxRoundExclusive) {
  const t = tournament || {};
  const stats = {};
  const playerNames = buildPlayerNameMap(t.players);

  for (const player of (Array.isArray(t.players) ? t.players : [])) {
    const id = playerUtils.extractPlayerId(player);
    if (!id) continue;
    stats[id] = makeRankingRow('player', id, playerNames[id] || '未知');
  }

  for (const round of (Array.isArray(t.rounds) ? t.rounds : [])) {
    const roundIndex = Number(round && round.roundIndex);
    if (Number.isFinite(maxRoundExclusive) && roundIndex >= maxRoundExclusive) continue;
    for (const match of (Array.isArray(round && round.matches) ? round.matches : [])) {
      if (!match || String(match.status || '') !== 'finished' || !scoreUtils.isValidFinishedScore(match)) continue;
      const score = scoreUtils.extractScorePairAny(match);
      const teamA = (Array.isArray(match.teamA) ? match.teamA : []).map(playerUtils.extractPlayerId).filter(Boolean);
      const teamB = (Array.isArray(match.teamB) ? match.teamB : []).map(playerUtils.extractPlayerId).filter(Boolean);
      const aWin = score.a > score.b;
      const winners = aWin ? teamA : teamB;
      const losers = aWin ? teamB : teamA;
      const winScore = aWin ? score.a : score.b;
      const loseScore = aWin ? score.b : score.a;

      for (const playerId of winners) {
        if (!stats[playerId]) continue;
        stats[playerId].wins += 1;
        stats[playerId].played += 1;
        stats[playerId].pointsFor += winScore;
        stats[playerId].pointsAgainst += loseScore;
        stats[playerId].pointDiff += (winScore - loseScore);
      }
      for (const playerId of losers) {
        if (!stats[playerId]) continue;
        stats[playerId].losses += 1;
        stats[playerId].played += 1;
        stats[playerId].pointsFor += loseScore;
        stats[playerId].pointsAgainst += winScore;
        stats[playerId].pointDiff += (loseScore - winScore);
      }
    }
  }

  return sortRanking(Object.values(stats));
}

function computeTeamRankingsUntilRound(tournament, maxRoundExclusive) {
  const t = tournament || {};
  const stats = {};
  const mode = modeHelper.normalizeMode(t.mode);
  const teamNames = buildTeamNameMap(t);

  for (const [entityId, name] of Object.entries(teamNames)) {
    stats[entityId] = makeRankingRow('team', entityId, name || entityId);
  }

  for (const round of (Array.isArray(t.rounds) ? t.rounds : [])) {
    const roundIndex = Number(round && round.roundIndex);
    if (Number.isFinite(maxRoundExclusive) && roundIndex >= maxRoundExclusive) continue;
    for (const match of (Array.isArray(round && round.matches) ? round.matches : [])) {
      if (!match || String(match.status || '') !== 'finished' || !scoreUtils.isValidFinishedScore(match)) continue;
      const score = scoreUtils.extractScorePairAny(match);
      const unitAId = String(match.unitAId || (mode === modeHelper.MODE_SQUAD_DOUBLES ? 'A' : '')).trim();
      const unitBId = String(match.unitBId || (mode === modeHelper.MODE_SQUAD_DOUBLES ? 'B' : '')).trim();
      if (!unitAId || !unitBId) continue;
      if (!stats[unitAId]) stats[unitAId] = makeRankingRow('team', unitAId, String(match.unitAName || unitAId));
      if (!stats[unitBId]) stats[unitBId] = makeRankingRow('team', unitBId, String(match.unitBName || unitBId));

      const aWin = score.a > score.b;
      const winId = aWin ? unitAId : unitBId;
      const loseId = aWin ? unitBId : unitAId;
      const winScore = aWin ? score.a : score.b;
      const loseScore = aWin ? score.b : score.a;

      stats[winId].wins += 1;
      stats[winId].played += 1;
      stats[winId].pointsFor += winScore;
      stats[winId].pointsAgainst += loseScore;
      stats[winId].pointDiff += (winScore - loseScore);

      stats[loseId].losses += 1;
      stats[loseId].played += 1;
      stats[loseId].pointsFor += loseScore;
      stats[loseId].pointsAgainst += winScore;
      stats[loseId].pointDiff += (loseScore - winScore);
    }
  }

  return sortRanking(Object.values(stats));
}

function computeRankings(tournament, options = {}) {
  const t = tournament || {};
  const current = Array.isArray(options.currentRankings) ? options.currentRankings : [];
  const teamMode = options.teamMode === true
    || (options.teamMode !== false && (modeHelper.isTeamMode(t.mode) || current.some((row) => String((row && row.entityType) || '').trim().toLowerCase() === 'team')));
  const maxRoundExclusive = Number(options.maxRoundExclusive);
  if (teamMode) return computeTeamRankingsUntilRound(t, maxRoundExclusive);
  return computePlayerRankingsUntilRound(t, maxRoundExclusive);
}

module.exports = {
  sortRanking,
  normalizeCurrentRankings,
  computePlayerRankingsUntilRound,
  computeTeamRankingsUntilRound,
  computeRankings
};
