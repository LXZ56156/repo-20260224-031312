const modeHelper = require('./lib/mode');
const playerUtils = require('./lib/player');
const rankingCore = require('./lib/rankingCore');
const scoreUtils = require('./lib/score');

function extractId(player) {
  return playerUtils.extractPlayerId(player);
}

function safePlayerName(player) {
  return playerUtils.safePlayerName(player);
}

function isTeamMode(mode) {
  return modeHelper.isTeamMode(mode);
}

function computeRankings(tournament) {
  return rankingCore.computeRankings(tournament);
}

function allMatchesFinished(rounds) {
  for (const round of (rounds || [])) {
    for (const match of (round.matches || [])) {
      const status = String(match && match.status || '').trim();
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
  const idx = matches.findIndex((match) => Number(match.matchIndex) === Number(matchIndex));
  if (idx < 0) throw new Error('比赛不存在');

  const match = matches[idx] || {};
  delete match.teamAScore;
  delete match.teamBScore;
  delete match.scoreA;
  delete match.scoreB;
  delete match.a;
  delete match.b;
  delete match.left;
  delete match.right;
  match.score = scoreUtils.normalizeScoreObject({ teamA: scoreA, teamB: scoreB });
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
  const mode = modeHelper.normalizeMode(tournament && tournament.mode);
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

function buildIdempotentRetryResult(match, scoreA, scoreB, requesterId, fallbackScorerName = '球友') {
  const status = String(match && match.status || '').trim();
  if (status !== 'finished') return null;

  const current = scoreUtils.extractScorePairAny(match);
  if (!Number.isFinite(current.a) || !Number.isFinite(current.b)) return null;
  if (Number(current.a) !== Number(scoreA) || Number(current.b) !== Number(scoreB)) return null;

  const scorerId = String(match && match.scorerId || '').trim();
  const requester = String(requesterId || '').trim();
  if (scorerId && scorerId !== requester) return null;

  return {
    ok: true,
    deduped: true,
    finished: true,
    scorerName: String(match && match.scorerName || '').trim() || String(fallbackScorerName || '').trim() || '球友'
  };
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
  isTeamMode,
  computeRankings,
  allMatchesFinished,
  applyScoreToRounds,
  buildIdempotentRetryResult,
  buildSubmitResult
};
