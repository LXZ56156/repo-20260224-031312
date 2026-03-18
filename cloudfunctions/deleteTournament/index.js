const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const common = require('./lib/common');
const logic = require('./logic');

const DELETE_REQUEST_LOG_COLLECTION = 'delete_tournament_requests';

async function ensureCollection(name) {
  try {
    if (typeof db.createCollection === 'function') {
      await db.createCollection(name);
    }
  } catch (_) {
    // ignore
  }
}

async function findDeleteRequestLog(tournamentId, operatorOpenId, clientRequestId) {
  const tid = String(tournamentId || '').trim();
  const openid = String(operatorOpenId || '').trim();
  const requestId = String(clientRequestId || '').trim();
  if (!tid || !openid || !requestId) return null;

  await ensureCollection(DELETE_REQUEST_LOG_COLLECTION);
  const res = await db.collection(DELETE_REQUEST_LOG_COLLECTION).where({
    tournamentId: tid,
    operatorOpenId: openid,
    clientRequestId: requestId
  }).limit(1).get();
  return Array.isArray(res && res.data) && res.data[0] ? res.data[0] : null;
}

function buildDeleteResult(traceId, clientRequestId, extra = {}) {
  const result = {
    traceId,
    state: String(extra.state || 'deleted').trim() || 'deleted',
    deduped: extra.deduped === true
  };
  if (clientRequestId) result.clientRequestId = clientRequestId;
  if (extra.alreadyDeleted === true) result.alreadyDeleted = true;
  return common.okResult('TOURNAMENT_DELETED', '已删除赛事', result);
}

async function recordDeleteRequest(transaction, payload = {}) {
  const clientRequestId = String(payload.clientRequestId || '').trim();
  if (!clientRequestId) return;

  await transaction.collection(DELETE_REQUEST_LOG_COLLECTION).add({
    data: common.assertNoReservedRootKeys({
      tournamentId: String(payload.tournamentId || '').trim(),
      operatorOpenId: String(payload.operatorOpenId || '').trim(),
      clientRequestId,
      status: 'deleted',
      traceId: String(payload.traceId || '').trim(),
      createdAt: db.serverDate()
    }, ['_id'], '删除赛事请求日志')
  });
}

async function cleanupScoreLocksBestEffort(tournamentId) {
  await logic.cleanupScoreLocksBestEffort(() => common.cleanupScoreLocks(db, tournamentId), tournamentId, console);
}

async function buildDedupedDeleteResult(tournamentId, operatorOpenId, traceId, clientRequestId) {
  const requestLog = await findDeleteRequestLog(tournamentId, operatorOpenId, clientRequestId);
  if (!requestLog || String(requestLog.status || '').trim() !== 'deleted') return null;

  await cleanupScoreLocksBestEffort(tournamentId);
  return buildDeleteResult(traceId, clientRequestId, {
    state: 'deduped',
    deduped: true,
    alreadyDeleted: true
  });
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  console.info('[deleteTournament]', traceId || '-', tournamentId || '-', OPENID || '-');
  if (!tournamentId) throw new Error('缺少 tournamentId');

  const existingDeduped = await buildDedupedDeleteResult(tournamentId, OPENID, traceId, clientRequestId);
  if (existingDeduped) return existingDeduped;

  try {
    const docRes = await db.collection('tournaments').doc(tournamentId).get();
    const tournament = common.assertTournamentExists(docRes.data);
    common.assertCreator(tournament, OPENID);
    const result = await db.runTransaction(async (transaction) => {
      const latestRes = await transaction.collection('tournaments').doc(tournamentId).get();
      const t = common.assertTournamentExists(latestRes.data);
      common.assertCreator(t, OPENID);

      await transaction.collection('tournaments').doc(tournamentId).remove();
      await recordDeleteRequest(transaction, {
        tournamentId,
        operatorOpenId: OPENID,
        clientRequestId,
        traceId
      });
      return buildDeleteResult(traceId, clientRequestId, { state: 'deleted', deduped: false });
    });
    await cleanupScoreLocksBestEffort(tournamentId);
    return result;
  } catch (err) {
    const message = common.errMsg(err);
    if (clientRequestId && (common.isDocNotExists(err) || message.includes('赛事不存在'))) {
      const dedupedRetry = await buildDedupedDeleteResult(tournamentId, OPENID, traceId, clientRequestId);
      if (dedupedRetry) return dedupedRetry;
    }
    throw err;
  }
};
