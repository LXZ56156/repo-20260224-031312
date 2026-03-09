const watchUtil = require('../sync/watch');
const storage = require('./storage');

function classifyFetchError(err) {
  const message = String((err && (err.message || err.errMsg)) || err || '').trim();
  const low = message.toLowerCase();
  if (!message) return { errorType: 'unknown', errorMessage: '同步失败' };
  if (low.includes('timeout') || message.includes('超时')) {
    return { errorType: 'timeout', errorMessage: message };
  }
  if (low.includes('network') || low.includes('connect') || low.includes('socket') || message.includes('网络')) {
    return { errorType: 'network', errorMessage: message };
  }
  if (
    low.includes('not found') ||
    low.includes('resource not found') ||
    low.includes('does not exist') ||
    low.includes('document does not exist')
  ) {
    return { errorType: 'not_found', errorMessage: message };
  }
  return { errorType: 'unknown', errorMessage: message };
}

function persistTournamentDoc(doc) {
  if (!doc || typeof doc !== 'object') return;
  const tournamentId = String((doc._id || doc.id) || '').trim();
  if (!tournamentId) return;
  storage.setLocalTournamentCache(tournamentId, doc);
  storage.upsertLocalCompletedTournamentSnapshot(doc);
}

function shouldAllowCachedFallback(errorType) {
  return errorType === 'network' || errorType === 'timeout' || errorType === 'unknown';
}

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
    persistTournamentDoc(doc);
    if (typeof onDoc === 'function') onDoc(doc);
  });
}

async function fetchTournament(tournamentId, onDoc) {
  const tid = String(tournamentId || '').trim();
  if (!tid) {
    return {
      ok: false,
      errorType: 'param',
      errorMessage: '缺少 tournamentId',
      cachedDoc: null
    };
  }
  try {
    const db = wx.cloud.database();
    const res = await db.collection('tournaments').doc(tid).get();
    const doc = res && res.data;
    if (doc) persistTournamentDoc(doc);
    if (doc && typeof onDoc === 'function') onDoc(doc);
    if (doc) {
      return { ok: true, doc, source: 'remote' };
    }
    return {
      ok: false,
      errorType: 'not_found',
      errorMessage: '未找到赛事',
      cachedDoc: null
    };
  } catch (e) {
    console.error('fetchTournament failed', e);
    const parsed = classifyFetchError(e);
    const cachedDoc = shouldAllowCachedFallback(parsed.errorType)
      ? storage.getLocalTournamentCache(tid)
      : null;
    return {
      ok: false,
      errorType: parsed.errorType,
      errorMessage: parsed.errorMessage,
      cachedDoc
    };
  }
}

module.exports = {
  closeWatcher,
  startWatch,
  fetchTournament,
  classifyFetchError,
  shouldAllowCachedFallback,
  persistTournamentDoc
};
