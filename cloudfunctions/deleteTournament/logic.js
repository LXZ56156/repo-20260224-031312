async function cleanupScoreLocksBestEffort(cleanupFn, tournamentId, logger = console) {
  try {
    await cleanupFn();
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('[deleteTournament] cleanupScoreLocks failed', tournamentId, err);
    }
  }
}

module.exports = {
  cleanupScoreLocksBestEffort
};
