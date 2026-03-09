const scoreUtils = require('./scoreUtils');

function extractId(player) {
  if (!player) return '';
  if (typeof player === 'string') return String(player).trim();
  return String(player.id || player.playerId || '').trim();
}

function parseScore(match) {
  if (!scoreUtils.isValidFinishedScore(match)) return null;
  return scoreUtils.extractScorePairAny(match);
}

function resolveMySide(match, openid) {
  const oid = String(openid || '').trim();
  if (!oid) return '';
  const teamA = Array.isArray(match && match.teamA) ? match.teamA : [];
  const teamB = Array.isArray(match && match.teamB) ? match.teamB : [];
  const inA = teamA.some((player) => extractId(player) === oid);
  const inB = teamB.some((player) => extractId(player) === oid);
  if (inA && !inB) return 'A';
  if (inB && !inA) return 'B';
  return '';
}

function isParticipant(tournament, openid) {
  const oid = String(openid || '').trim();
  if (!oid || !tournament) return false;
  const playerIds = Array.isArray(tournament.playerIds) ? tournament.playerIds.map((id) => String(id || '').trim()) : [];
  if (playerIds.includes(oid)) return true;
  const players = Array.isArray(tournament.players) ? tournament.players : [];
  return players.some((item) => extractId(item) === oid);
}

function toTimestamp(value) {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function buildLocalPerformancePayload(tournaments, openid) {
  const payload = {
    tournamentsCompleted: 0,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    pointDiff: 0,
    last10Wins: 0,
    last10Losses: 0
  };
  const oid = String(openid || '').trim();
  if (!oid) return payload;

  let pointsFor = 0;
  let pointsAgainst = 0;
  const recentEntries = [];

  for (const tournament of (Array.isArray(tournaments) ? tournaments : [])) {
    if (!tournament || String(tournament.status || '') !== 'finished') continue;
    if (!isParticipant(tournament, oid)) continue;
    payload.tournamentsCompleted += 1;

    const rounds = Array.isArray(tournament.rounds) ? tournament.rounds : [];
    const tournamentTs = toTimestamp(tournament.updatedAt) || toTimestamp(tournament.createdAt);
    for (const round of rounds) {
      const matches = Array.isArray(round && round.matches) ? round.matches : [];
      for (const match of matches) {
        if (!match || String(match.status || '') !== 'finished') continue;
        const score = parseScore(match);
        if (!score) continue;
        const side = resolveMySide(match, oid);
        if (!side) continue;

        const myScore = side === 'A' ? score.a : score.b;
        const oppScore = side === 'A' ? score.b : score.a;
        const win = myScore > oppScore;

        payload.matchesPlayed += 1;
        if (win) payload.wins += 1;
        else payload.losses += 1;
        pointsFor += myScore;
        pointsAgainst += oppScore;
        recentEntries.push({
          win,
          ts: toTimestamp(match.scoredAt) || tournamentTs || 0
        });
      }
    }
  }

  payload.pointDiff = pointsFor - pointsAgainst;
  payload.winRate = payload.matchesPlayed ? (payload.wins / payload.matchesPlayed) : 0;

  recentEntries.sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
  const top10 = recentEntries.slice(0, 10);
  payload.last10Wins = top10.filter((item) => item.win).length;
  payload.last10Losses = top10.length - payload.last10Wins;
  return payload;
}

module.exports = {
  buildLocalPerformancePayload
};
