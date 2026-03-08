const modeHelper = require('./lib/mode');

function buildResetTournamentPatch(tournament) {
  const current = tournament && typeof tournament === 'object' ? tournament : {};
  const players = Array.isArray(current.players) ? current.players : [];
  const pairTeams = Array.isArray(current.pairTeams) ? current.pairTeams : [];

  return {
    status: 'draft',
    rounds: [],
    rankings: modeHelper.buildInitialRankings(current.mode, players, pairTeams),
    scheduleSeed: null,
    fairnessScore: 0,
    fairnessJson: '',
    playerStatsJson: '',
    schedulerMetaJson: ''
  };
}

function buildResetTournamentRemovals(removeToken) {
  return {
    fairness: removeToken,
    playerStats: removeToken,
    schedulerMeta: removeToken
  };
}

async function cleanupScoreLocksBestEffort(cleanupFn, tournamentId, logger = console) {
  try {
    await cleanupFn();
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('[resetTournament] cleanupScoreLocks failed', tournamentId, err);
    }
  }
}

module.exports = {
  buildResetTournamentPatch,
  buildResetTournamentRemovals,
  cleanupScoreLocksBestEffort
};
