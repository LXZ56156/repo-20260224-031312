const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const common = require('./lib/common');
const logic = require('./logic');
const shareActivity = require('./lib/share-activity');

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

function buildDeleteRequestLogOptions(tournamentId, operatorOpenId, clientRequestId) {
  return {
    scope: 'delete_tournament',
    subjectKey: `tournament:${String(tournamentId || '').trim()}`,
    operatorOpenId,
    clientRequestId
  };
}

async function findCommonDeleteRequestLog(reader, tournamentId, operatorOpenId, clientRequestId) {
  const options = buildDeleteRequestLogOptions(tournamentId, operatorOpenId, clientRequestId);
  return common.getClientRequestLog(reader, options);
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

async function recordDeleteRequest(writer, payload = {}) {
  const clientRequestId = String(payload.clientRequestId || '').trim();
  if (!clientRequestId) return;

  await common.upsertClientRequestLog(writer, db, {
    ...buildDeleteRequestLogOptions(payload.tournamentId, payload.operatorOpenId, clientRequestId),
    status: 'succeeded',
    resourceType: 'tournament',
    resourceId: String(payload.tournamentId || '').trim(),
    responseCode: 'TOURNAMENT_DELETED',
    responseState: 'deleted'
  });
}

async function cleanupScoreLocksBestEffort(tournamentId) {
  await logic.cleanupScoreLocksBestEffort(() => common.cleanupScoreLocks(db, tournamentId), tournamentId, console);
}

async function buildDedupedDeleteResult(tournamentId, operatorOpenId, traceId, clientRequestId) {
  const commonLog = await findCommonDeleteRequestLog(db, tournamentId, operatorOpenId, clientRequestId);
  if (common.isSuccessfulClientRequestLog(commonLog)) {
    await cleanupScoreLocksBestEffort(tournamentId);
    return buildDeleteResult(traceId, clientRequestId, {
      state: 'deduped',
      deduped: true,
      alreadyDeleted: true
    });
  }

  const requestLog = await findDeleteRequestLog(tournamentId, operatorOpenId, clientRequestId);
  if (!requestLog || String(requestLog.status || '').trim() !== 'deleted') return null;

  try {
    await recordDeleteRequest(db, {
      tournamentId,
      operatorOpenId,
      clientRequestId,
      traceId
    });
  } catch (err) {
    console.warn('[deleteTournament] failed to migrate legacy request log', err);
  }

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
  console.info('[deleteTournament]', traceId || '-', tournamentId || '-');
  if (!tournamentId) throw new Error('缺少 tournamentId');
  if (clientRequestId) {
    await common.ensureCollection(db, common.CLIENT_REQUEST_LOG_COLLECTION);
  }

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
      common.assertDraft(t, '仅草稿阶段可删除赛事');
      if (clientRequestId) {
        const requestLog = await findCommonDeleteRequestLog(transaction, tournamentId, OPENID, clientRequestId);
        if (common.isSuccessfulClientRequestLog(requestLog)) {
          return buildDeleteResult(traceId, clientRequestId, {
            state: 'deduped',
            deduped: true,
            alreadyDeleted: true
          });
        }
      }

      await transaction.collection('tournaments').doc(tournamentId).remove();
      await recordDeleteRequest(transaction, {
        tournamentId,
        operatorOpenId: OPENID,
        clientRequestId,
        traceId
      });
      return buildDeleteResult(traceId, clientRequestId, { state: 'deleted', deduped: false });
    });
    await shareActivity.updateFinishedMessageBestEffort(cloud, tournament, console, {
      source: 'deleteTournament',
      traceId
    });
    await cleanupScoreLocksBestEffort(tournamentId);
    return result;
  } catch (err) {
    const message = common.errMsg(err);
    if (clientRequestId && (common.isDocNotExists(err) || message.includes('赛事不存在'))) {
      const dedupedRetry = await buildDedupedDeleteResult(tournamentId, OPENID, traceId, clientRequestId);
      if (dedupedRetry) return dedupedRetry;
    }
    if (message.includes('仅草稿阶段可删除赛事')) {
      return common.failResult('DELETE_DRAFT_ONLY', message, {
        traceId,
        state: 'forbidden',
        ...(clientRequestId ? { clientRequestId } : {})
      });
    }
    throw err;
  }
};
