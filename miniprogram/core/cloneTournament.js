const cloud = require('./cloud');
const storage = require('./storage');

async function cloneTournament(sourceTournamentId) {
  const res = await cloud.call('cloneTournament', { sourceTournamentId });
  const nextId = String((res && res.tournamentId) || '').trim();
  if (!nextId) throw new Error('复制失败');
  storage.addRecentTournamentId(nextId);
  return nextId;
}

module.exports = {
  cloneTournament
};
