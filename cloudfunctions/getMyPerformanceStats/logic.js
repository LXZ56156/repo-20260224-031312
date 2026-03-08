function toTimestamp(value) {
  if (!value) return 0;
  if (value instanceof Date) {
    const ts = value.getTime();
    return Number.isFinite(ts) ? ts : 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : 0;
  }
  if (typeof value === 'object') {
    if (value.$date) return toTimestamp(value.$date);
    if (value.seconds) return Number(value.seconds) * 1000;
    if (value._seconds) return Number(value._seconds) * 1000;
  }
  return 0;
}

function parseScore(match) {
  const raw = match || {};
  const a = Number(raw.teamAScore ?? raw.scoreA ?? (raw.score && raw.score.teamA));
  const b = Number(raw.teamBScore ?? raw.scoreB ?? (raw.score && raw.score.teamB));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
  return { a, b };
}

function extractId(player) {
  if (!player) return '';
  if (typeof player === 'string') return String(player).trim();
  return String(player.id || player.playerId || '').trim();
}

function buildParticipantSet(tournament) {
  const set = new Set();
  const playerIds = Array.isArray(tournament && tournament.playerIds) ? tournament.playerIds : [];
  for (const id of playerIds) {
    const v = String(id || '').trim();
    if (v) set.add(v);
  }
  if (set.size > 0) return set;
  const players = Array.isArray(tournament && tournament.players) ? tournament.players : [];
  for (const player of players) {
    const id = extractId(player);
    if (id) set.add(id);
  }
  return set;
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

function resolveTournamentTimeMs(tournament) {
  return (
    toTimestamp(tournament && tournament.finishedAt) ||
    toTimestamp(tournament && tournament.updatedAt) ||
    toTimestamp(tournament && tournament.createdAt) ||
    0
  );
}

function inWindow(timestampMs, windowType, nowMs) {
  if (windowType !== 'last_30_days') return true;
  const ts = Number(timestampMs) || 0;
  if (!ts) return false;
  return ts >= (Number(nowMs) - 30 * 24 * 60 * 60 * 1000);
}

function normalizeWindow(windowType) {
  return String(windowType || '').trim().toLowerCase() === 'last_30_days' ? 'last_30_days' : 'all';
}

function computeMyPerformanceStats(tournaments, openid, windowType = 'all', nowMs = Date.now()) {
  const oid = String(openid || '').trim();
  const resolvedWindow = normalizeWindow(windowType);
  const base = {
    ok: true,
    scope: resolvedWindow === 'last_30_days' ? 'last_30_days_completed_participated' : 'all_completed_participated',
    tournamentsCompleted: 0,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDiff: 0,
    last10: { wins: 0, losses: 0 }
  };
  if (!oid) return base;

  const recentEntries = [];
  const list = Array.isArray(tournaments) ? tournaments : [];
  for (const tournament of list) {
    if (!tournament || String(tournament.status || '') !== 'finished') continue;
    const participantSet = buildParticipantSet(tournament);
    if (!participantSet.has(oid)) continue;

    const tournamentTimeMs = resolveTournamentTimeMs(tournament);
    if (!inWindow(tournamentTimeMs, resolvedWindow, nowMs)) continue;

    base.tournamentsCompleted += 1;
    const rounds = Array.isArray(tournament.rounds) ? tournament.rounds : [];
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

        base.matchesPlayed += 1;
        if (win) base.wins += 1;
        else base.losses += 1;
        base.pointsFor += myScore;
        base.pointsAgainst += oppScore;
        recentEntries.push({
          win,
          ts: toTimestamp(match.scoredAt) || tournamentTimeMs || 0
        });
      }
    }
  }

  base.pointDiff = base.pointsFor - base.pointsAgainst;
  base.winRate = base.matchesPlayed ? Number((base.wins / base.matchesPlayed).toFixed(4)) : 0;

  recentEntries.sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
  const top10 = recentEntries.slice(0, 10);
  const last10Wins = top10.filter((item) => item.win).length;
  base.last10 = {
    wins: last10Wins,
    losses: top10.length - last10Wins
  };

  return base;
}

module.exports = {
  computeMyPerformanceStats,
  normalizeWindow,
  parseScore,
  resolveMySide,
  buildParticipantSet
};
