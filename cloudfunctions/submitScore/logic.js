function extractId(p) {
  if (!p) return '';
  if (typeof p === 'string') return p;
  return String(p.id || '');
}

function safePlayerName(p) {
  const raw = p && (p.name || p.nickname || p.nickName || p.displayName);
  const name = String(raw || '').trim();
  if (name) {
    const m = name.match(/^成员([0-9a-zA-Z]{1,16})$/);
    return m ? m[1] : name;
  }
  const idRaw = String(extractId(p) || '').trim();
  const alnum = idRaw.replace(/[^0-9a-zA-Z]/g, '');
  const suffix = (alnum.slice(-4) || idRaw.slice(-4) || '').trim();
  return suffix || '匿名';
}

function normalizeMode(mode) {
  const v = String(mode || '').trim().toLowerCase();
  if (v === 'multi_rotate' || v === 'squad_doubles' || v === 'fixed_pair_rr') return v;
  if (v === 'mixed_fallback' || v === 'doubles') return 'multi_rotate';
  return 'multi_rotate';
}

function isTeamMode(mode) {
  const m = normalizeMode(mode);
  return m === 'squad_doubles' || m === 'fixed_pair_rr';
}

function extractScorePairAny(obj) {
  if (!obj) return { a: NaN, b: NaN };
  const aLegacy = (obj.teamAScore ?? obj.teamAScore1 ?? obj.teamAScore2 ?? obj.scoreA ?? obj.a ?? obj.left);
  const bLegacy = (obj.teamBScore ?? obj.teamBScore1 ?? obj.teamBScore2 ?? obj.scoreB ?? obj.b ?? obj.right);
  const aStd = (Array.isArray(obj.teamA) || typeof obj.teamA === 'object') ? undefined : obj.teamA;
  const bStd = (Array.isArray(obj.teamB) || typeof obj.teamB === 'object') ? undefined : obj.teamB;
  const aRaw = (aLegacy ?? aStd);
  const bRaw = (bLegacy ?? bStd);
  return { a: Number(aRaw), b: Number(bRaw) };
}

function sortRanking(list) {
  const arr = Array.isArray(list) ? list.slice() : [];
  arr.sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    if (y.pointDiff !== x.pointDiff) return y.pointDiff - x.pointDiff;
    if (y.pointsFor !== x.pointsFor) return y.pointsFor - x.pointsFor;
    return String(x.name || '').localeCompare(String(y.name || ''));
  });
  return arr;
}

function buildPlayerRankingTemplate(players) {
  return (players || []).map((p) => {
    const id = extractId(p);
    return {
      entityType: 'player',
      entityId: id,
      playerId: id,
      name: safePlayerName(p),
      wins: 0,
      losses: 0,
      played: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0
    };
  });
}

function buildTeamRankingTemplate(tournament) {
  const mode = normalizeMode(tournament && tournament.mode);
  if (mode === 'squad_doubles') {
    return [
      {
        entityType: 'team',
        entityId: 'A',
        playerId: 'A',
        name: 'A队',
        wins: 0,
        losses: 0,
        played: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0
      },
      {
        entityType: 'team',
        entityId: 'B',
        playerId: 'B',
        name: 'B队',
        wins: 0,
        losses: 0,
        played: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0
      }
    ];
  }
  const pairTeams = Array.isArray(tournament && tournament.pairTeams) ? tournament.pairTeams : [];
  return pairTeams.map((team, idx) => ({
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

function resolveMatchUnits(match, mode) {
  const m = match || {};
  const unitAId = String(m.unitAId || '').trim();
  const unitBId = String(m.unitBId || '').trim();
  if (unitAId && unitBId) {
    return { unitAId, unitBId };
  }
  if (mode === 'squad_doubles') {
    return { unitAId: 'A', unitBId: 'B' };
  }
  return { unitAId: '', unitBId: '' };
}

function computePlayerRankings(t) {
  const players = Array.isArray(t.players) ? t.players : [];
  const stats = {};
  for (const row of buildPlayerRankingTemplate(players)) {
    stats[row.playerId] = row;
  }

  for (const r of (t.rounds || [])) {
    for (const m of (r.matches || [])) {
      if (String(m.status || '') !== 'finished') continue;
      const sp = extractScorePairAny(m.score || m);
      const a = sp.a;
      const b = sp.b;
      if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;
      const teamA = (m.teamA || []).map(extractId);
      const teamB = (m.teamB || []).map(extractId);

      const winA = a > b;
      const winTeam = winA ? teamA : teamB;
      const loseTeam = winA ? teamB : teamA;
      const winScore = winA ? a : b;
      const loseScore = winA ? b : a;

      for (const pid of winTeam) {
        if (!stats[pid]) continue;
        stats[pid].wins += 1;
        stats[pid].played += 1;
        stats[pid].pointsFor += winScore;
        stats[pid].pointsAgainst += loseScore;
        stats[pid].pointDiff += (winScore - loseScore);
      }
      for (const pid of loseTeam) {
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

function computeTeamRankings(t) {
  const mode = normalizeMode(t && t.mode);
  const stats = {};
  const template = buildTeamRankingTemplate(t);
  for (const row of template) stats[row.entityId] = row;

  for (const r of (t.rounds || [])) {
    for (const m of (r.matches || [])) {
      if (String(m.status || '') !== 'finished') continue;
      const sp = extractScorePairAny(m.score || m);
      const a = sp.a;
      const b = sp.b;
      if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;

      const units = resolveMatchUnits(m, mode);
      if (!units.unitAId || !units.unitBId) continue;
      if (!stats[units.unitAId]) {
        stats[units.unitAId] = {
          entityType: 'team',
          entityId: units.unitAId,
          playerId: units.unitAId,
          name: String(m.unitAName || units.unitAId),
          wins: 0,
          losses: 0,
          played: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDiff: 0
        };
      }
      if (!stats[units.unitBId]) {
        stats[units.unitBId] = {
          entityType: 'team',
          entityId: units.unitBId,
          playerId: units.unitBId,
          name: String(m.unitBName || units.unitBId),
          wins: 0,
          losses: 0,
          played: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDiff: 0
        };
      }

      const winA = a > b;
      const winId = winA ? units.unitAId : units.unitBId;
      const loseId = winA ? units.unitBId : units.unitAId;
      const winScore = winA ? a : b;
      const loseScore = winA ? b : a;

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

function computeRankings(t) {
  const mode = normalizeMode(t && t.mode);
  return isTeamMode(mode) ? computeTeamRankings(t) : computePlayerRankings(t);
}

function allMatchesFinished(rounds) {
  for (const r of (rounds || [])) {
    for (const m of (r.matches || [])) {
      const status = String(m && m.status || '').trim();
      if (status !== 'finished' && status !== 'canceled') return false;
    }
  }
  return true;
}

function applyScoreToRounds(rounds, roundIndex, matchIndex, scoreA, scoreB, scorer = null) {
  const nextRounds = Array.isArray(rounds) ? JSON.parse(JSON.stringify(rounds)) : [];
  const targetRound = nextRounds[roundIndex];
  if (!targetRound) throw new Error('轮次不存在');

  const matches = Array.isArray(targetRound.matches) ? targetRound.matches : [];
  const idx = matches.findIndex((mm) => Number(mm.matchIndex) === Number(matchIndex));
  if (idx < 0) throw new Error('比赛不存在');

  const match = matches[idx] || {};
  delete match.score;
  match.teamAScore = scoreA;
  match.teamBScore = scoreB;
  match.scoreA = scoreA;
  match.scoreB = scoreB;
  if (scorer && scorer.id) {
    match.scorerId = String(scorer.id || '');
    match.scorerName = String(scorer.name || '').trim();
    match.scoredAt = scorer.scoredAt || new Date().toISOString();
  }
  match.status = 'finished';
  matches[idx] = match;
  targetRound.matches = matches;
  nextRounds[roundIndex] = targetRound;
  return nextRounds;
}

function applySquadTargetWinEndCondition(tournament, rounds, rankings) {
  const mode = normalizeMode(tournament && tournament.mode);
  if (mode !== 'squad_doubles') return { rounds, finishedByRule: false };
  const rules = tournament && tournament.rules && typeof tournament.rules === 'object' ? tournament.rules : {};
  const endCondition = rules && typeof rules.endCondition === 'object' ? rules.endCondition : {};
  const type = String(endCondition.type || '').trim().toLowerCase();
  if (type !== 'target_wins') return { rounds, finishedByRule: false };
  const target = Math.max(1, Number(endCondition.target) || 1);
  const teamRows = Array.isArray(rankings) ? rankings : [];
  const hasWinner = teamRows.some((row) => Number(row && row.wins || 0) >= target);
  if (!hasWinner) return { rounds, finishedByRule: false };

  const nextRounds = JSON.parse(JSON.stringify(rounds || []));
  for (const round of nextRounds) {
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    for (const match of matches) {
      if (String(match && match.status || '') === 'pending') {
        match.status = 'canceled';
      }
    }
  }
  return { rounds: nextRounds, finishedByRule: true };
}

function buildSubmitResult(tournament, roundIndex, matchIndex, scoreA, scoreB, scorer = null) {
  let rounds = applyScoreToRounds(tournament && tournament.rounds, roundIndex, matchIndex, scoreA, scoreB, scorer);
  let rankings = computeRankings({ ...(tournament || {}), rounds });
  const squadEnd = applySquadTargetWinEndCondition(tournament, rounds, rankings);
  if (squadEnd.finishedByRule) {
    rounds = squadEnd.rounds;
    rankings = computeRankings({ ...(tournament || {}), rounds });
  }
  const finished = allMatchesFinished(rounds);
  return {
    rounds,
    rankings,
    finished,
    nextStatus: finished ? 'finished' : 'running'
  };
}

module.exports = {
  extractId,
  safePlayerName,
  computeRankings,
  allMatchesFinished,
  applyScoreToRounds,
  buildSubmitResult
};

