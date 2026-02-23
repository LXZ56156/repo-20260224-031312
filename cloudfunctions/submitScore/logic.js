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

function computeRankings(t) {
  const players = Array.isArray(t.players) ? t.players : [];
  const stats = {};
  for (const p of players) {
    const pid = extractId(p);
    stats[pid] = {
      playerId: pid,
      name: safePlayerName(p),
      wins: 0,
      losses: 0,
      played: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0
    };
  }

  for (const r of (t.rounds || [])) {
    for (const m of (r.matches || [])) {
      if (m.status !== 'finished') continue;
      const sp = extractScorePairAny(m.score || m);
      const a = sp.a;
      const b = sp.b;
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (a === b) continue;
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

  const list = Object.values(stats);
  list.sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    if (y.pointDiff !== x.pointDiff) return y.pointDiff - x.pointDiff;
    if (y.pointsFor !== x.pointsFor) return y.pointsFor - x.pointsFor;
    return String(x.name || '').localeCompare(String(y.name || ''));
  });
  return list;
}

function allMatchesFinished(rounds) {
  for (const r of (rounds || [])) {
    for (const m of (r.matches || [])) {
      if (m.status !== 'finished') return false;
    }
  }
  return true;
}

function applyScoreToRounds(rounds, roundIndex, matchIndex, scoreA, scoreB) {
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
  match.status = 'finished';
  matches[idx] = match;
  targetRound.matches = matches;
  nextRounds[roundIndex] = targetRound;
  return nextRounds;
}

function buildSubmitResult(tournament, roundIndex, matchIndex, scoreA, scoreB) {
  const rounds = applyScoreToRounds(tournament && tournament.rounds, roundIndex, matchIndex, scoreA, scoreB);
  const rankings = computeRankings({ ...(tournament || {}), rounds });
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
