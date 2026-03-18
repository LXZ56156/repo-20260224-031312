const cloud = require('./cloud');
const clientRequest = require('./clientRequest');
const storage = require('./storage');

async function cloneTournament(sourceTournamentId, options = {}) {
  const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'clone');
  const res = cloud.assertWriteResult(await cloud.call('cloneTournament', {
    sourceTournamentId,
    clientRequestId
  }), '复制失败');
  const nextId = String((res && res.tournamentId) || '').trim();
  if (!nextId) throw new Error('复制失败');
  storage.addRecentTournamentId(nextId);
  return nextId;
}

module.exports = {
  cloneTournament
};
