function toId(player) {
  if (!player) return '';
  if (typeof player === 'string') return player;
  return String(player.id || player.playerId || player._id || '').trim();
}

function normalizeMode(mode) {
  const v = String(mode || '').trim().toLowerCase();
  if (v === 'multi_rotate' || v === 'squad_doubles' || v === 'fixed_pair_rr') return v;
  if (v === 'mixed_fallback' || v === 'doubles') return 'multi_rotate';
  return 'multi_rotate';
}

function toName(player) {
  if (!player) return '';
  if (typeof player === 'string') return String(player).trim();
  return String(player.name || player.nickname || player.nickName || '').trim();
}

function parseScore(match) {
  const a = Number(match && (match.teamAScore ?? match.scoreA ?? (match.score && match.score.teamA)));
  const b = Number(match && (match.teamBScore ?? match.scoreB ?? (match.score && match.score.teamB)));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
  return { a, b };
}

function sortRanking(list) {
  return (list || []).slice().sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function buildPlayerMap(players) {
  const map = {};
  for (const p of (players || [])) {
    const id = toId(p);
    if (!id) continue;
    map[id] = toName(p) || map[id] || '未知';
  }
  return map;
}

function buildTeamMap(tournament) {
  const t = tournament || {};
  const map = {};
  const mode = normalizeMode(t.mode);
  if (mode === 'squad_doubles') {
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

function buildEntityNameMap(tournament) {
  return {
    player: buildPlayerMap(Array.isArray(tournament && tournament.players) ? tournament.players : []),
    team: buildTeamMap(tournament || {})
  };
}

function extractEntityMeta(row, idx) {
  const entityType = String((row && row.entityType) || '').trim().toLowerCase() === 'team' ? 'team' : 'player';
  const id = String((row && (row.entityId || row.playerId || row.id)) || '').trim() || `legacy_${idx}`;
  return { entityType, id, rankKey: `${entityType}_${id}` };
}

function normalizeCurrentRankings(tournament) {
  const t = tournament || {};
  const nameMaps = buildEntityNameMap(t);
  const list = Array.isArray(t.rankings) ? t.rankings : [];
  return sortRanking(list.map((r, idx) => {
    const meta = extractEntityMeta(r, idx);
    const nameMap = meta.entityType === 'team' ? nameMaps.team : nameMaps.player;
    return {
      entityType: meta.entityType,
      entityId: meta.id,
      playerId: meta.id,
      rankKey: meta.rankKey,
      name: nameMap[meta.id] || r.name || '未知',
      wins: Number(r.wins) || 0,
      losses: Number(r.losses) || 0,
      played: Number(r.played) || 0,
      pointsFor: Number(r.pointsFor) || 0,
      pointsAgainst: Number(r.pointsAgainst) || 0,
      pointDiff: Number(r.pointDiff) || 0
    };
  }));
}

function computePlayerRankingsUntilRound(tournament, maxRoundExclusive) {
  const t = tournament || {};
  const players = Array.isArray(t.players) ? t.players : [];
  const rounds = Array.isArray(t.rounds) ? t.rounds : [];
  const nameMap = buildPlayerMap(players);
  const stats = {};
  for (const p of players) {
    const id = toId(p);
    if (!id) continue;
    stats[id] = {
      entityType: 'player',
      entityId: id,
      playerId: id,
      name: nameMap[id] || '未知',
      wins: 0,
      losses: 0,
      played: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0
    };
  }

  for (const round of rounds) {
    const roundIndex = Number(round && round.roundIndex);
    if (Number.isFinite(maxRoundExclusive) && roundIndex >= maxRoundExclusive) continue;
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    for (const match of matches) {
      if (!match || String(match.status || '') !== 'finished') continue;
      const score = parseScore(match);
      if (!score) continue;

      const teamA = (Array.isArray(match.teamA) ? match.teamA : []).map(toId).filter(Boolean);
      const teamB = (Array.isArray(match.teamB) ? match.teamB : []).map(toId).filter(Boolean);
      const aWin = score.a > score.b;
      const winners = aWin ? teamA : teamB;
      const losers = aWin ? teamB : teamA;
      const winScore = aWin ? score.a : score.b;
      const loseScore = aWin ? score.b : score.a;

      for (const pid of winners) {
        if (!stats[pid]) continue;
        stats[pid].wins += 1;
        stats[pid].played += 1;
        stats[pid].pointsFor += winScore;
        stats[pid].pointsAgainst += loseScore;
        stats[pid].pointDiff += (winScore - loseScore);
      }
      for (const pid of losers) {
        if (!stats[pid]) continue;
        stats[pid].losses += 1;
        stats[pid].played += 1;
        stats[pid].pointsFor += loseScore;
        stats[pid].pointsAgainst += winScore;
        stats[pid].pointDiff += (loseScore - winScore);
      }
    }
  }
  return sortRanking(Object.values(stats));
}

function findLatestFinishedRoundIndex(rounds) {
  const rs = Array.isArray(rounds) ? rounds : [];
  let last = -1;
  for (const round of rs) {
    const roundIndex = Number(round && round.roundIndex);
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    if (matches.some((m) => m && String(m.status || '') === 'finished')) {
      if (Number.isFinite(roundIndex) && roundIndex > last) last = roundIndex;
    }
  }
  return last;
}

function computeTeamRankingsUntilRound(tournament, maxRoundExclusive) {
  const t = tournament || {};
  const mode = normalizeMode(t.mode);
  const nameMap = buildTeamMap(t);
  const stats = {};
  for (const key of Object.keys(nameMap)) {
    stats[key] = {
      entityType: 'team',
      entityId: key,
      playerId: key,
      name: nameMap[key] || key,
      wins: 0,
      losses: 0,
      played: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0
    };
  }
  const rounds = Array.isArray(t.rounds) ? t.rounds : [];
  for (const round of rounds) {
    const roundIndex = Number(round && round.roundIndex);
    if (Number.isFinite(maxRoundExclusive) && roundIndex >= maxRoundExclusive) continue;
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    for (const match of matches) {
      if (!match || String(match.status || '') !== 'finished') continue;
      const score = parseScore(match);
      if (!score) continue;
      const unitAId = String(match.unitAId || (mode === 'squad_doubles' ? 'A' : '')).trim();
      const unitBId = String(match.unitBId || (mode === 'squad_doubles' ? 'B' : '')).trim();
      if (!unitAId || !unitBId) continue;
      if (!stats[unitAId]) {
        stats[unitAId] = {
          entityType: 'team',
          entityId: unitAId,
          playerId: unitAId,
          name: String(match.unitAName || unitAId),
          wins: 0,
          losses: 0,
          played: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDiff: 0
        };
      }
      if (!stats[unitBId]) {
        stats[unitBId] = {
          entityType: 'team',
          entityId: unitBId,
          playerId: unitBId,
          name: String(match.unitBName || unitBId),
          wins: 0,
          losses: 0,
          played: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDiff: 0
        };
      }
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

function computeRankingsUntilRound(tournament, maxRoundExclusive, current) {
  const rows = Array.isArray(current) ? current : [];
  const teamMode = rows.some((row) => String(row && row.entityType || '').toLowerCase() === 'team');
  if (teamMode) return computeTeamRankingsUntilRound(tournament, maxRoundExclusive);
  return computePlayerRankingsUntilRound(tournament, maxRoundExclusive);
}

function attachTrend(current, previous) {
  const prevRankMap = {};
  for (let i = 0; i < (previous || []).length; i += 1) {
    const row = previous[i];
    if (!row) continue;
    const key = String((row.rankKey || `${row.entityType || 'player'}_${row.entityId || row.playerId || ''}`)).trim();
    if (!key) continue;
    prevRankMap[key] = i + 1;
  }

  return (current || []).map((row, idx) => {
    const currentRank = idx + 1;
    const currentKey = String((row.rankKey || `${row.entityType || 'player'}_${row.entityId || row.playerId || ''}`)).trim();
    const prevRank = prevRankMap[currentKey];
    let trendType = 'flat';
    let trendText = '-';
    if (!Number.isFinite(prevRank)) {
      trendType = 'new';
      trendText = '新';
    } else {
      const diff = prevRank - currentRank;
      if (diff > 0) {
        trendType = 'up';
        trendText = `↑${diff}`;
      } else if (diff < 0) {
        trendType = 'down';
        trendText = `↓${Math.abs(diff)}`;
      }
    }
    return { ...row, trendType, trendText };
  });
}

function buildRankingWithTrend(tournament) {
  const t = tournament || {};
  const current = normalizeCurrentRankings(t);
  const rounds = Array.isArray(t.rounds) ? t.rounds : [];
  const latestFinishedRoundIndex = findLatestFinishedRoundIndex(rounds);
  if (latestFinishedRoundIndex <= 0) {
    return current.map((row) => ({ ...row, trendType: 'flat', trendText: '-' }));
  }
  const previous = computeRankingsUntilRound(t, latestFinishedRoundIndex, current);
  return attachTrend(current, previous);
}

module.exports = {
  buildRankingWithTrend
};
