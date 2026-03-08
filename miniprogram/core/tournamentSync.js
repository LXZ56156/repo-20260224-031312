const watchUtil = require('../sync/watch');
const storage = require('./storage');

function closeWatcher(ctx) {
  if (!ctx) return;
  if (ctx.watcher && ctx.watcher.close) {
    ctx.watcher.close();
  }
  ctx.watcher = null;
}

function startWatch(ctx, tournamentId, onDoc) {
  if (!ctx || !tournamentId) return;
  closeWatcher(ctx);
  ctx.watcher = watchUtil.watchTournament(tournamentId, (doc) => {
    storage.upsertLocalCompletedTournamentSnapshot(doc);
    if (typeof onDoc === 'function') onDoc(doc);
  });
}

async function fetchTournament(tournamentId, onDoc) {
  if (!tournamentId) return null;
  try {
    const db = wx.cloud.database();
    const res = await db.collection('tournaments').doc(tournamentId).get();
    const doc = res && res.data;
    if (doc) storage.upsertLocalCompletedTournamentSnapshot(doc);
    if (doc && typeof onDoc === 'function') onDoc(doc);
    return doc || null;
  } catch (e) {
    console.error('fetchTournament failed', e);
    return null;
  }
}

module.exports = {
  closeWatcher,
  startWatch,
  fetchTournament
};
