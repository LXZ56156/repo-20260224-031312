const score = require('./lib/score');
const rankingCore = require('./lib/rankingCore');

function isCompletedMatch(match) {
  return !!(match && match.status === 'finished' && score.isValidFinishedScore(match));
}

function buildManualFinish(tournament) {
  const rounds = JSON.parse(JSON.stringify(Array.isArray(tournament.rounds) ? tournament.rounds : []));
  let completedMatches = 0;
  let canceledMatches = 0;
  for (const round of rounds) {
    for (const match of (Array.isArray(round.matches) ? round.matches : [])) {
      if (!match) continue;
      if (isCompletedMatch(match)) { completedMatches += 1; continue; }
      match.status = 'canceled';
      match.cancelReason = 'manual_finish';
      // Cancellation is not a zero score or a loss, including legacy score fields.
      ['score', 'teamAScore', 'teamBScore', 'teamAScore1', 'teamAScore2', 'teamBScore1', 'teamBScore2',
        'scoreA', 'scoreB', 'a', 'b', 'left', 'right'].forEach((key) => { delete match[key]; });
      canceledMatches += 1;
    }
  }
  return { rounds, rankings: rankingCore.computeRankings({ ...tournament, rounds }), completedMatches, canceledMatches };
}

module.exports = { isCompletedMatch, buildManualFinish };
