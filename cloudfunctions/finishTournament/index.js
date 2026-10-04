const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const common = require('./lib/common');
const permission = require('./lib/permission');
const shareActivity = require('./lib/share-activity');
const { buildManualFinish } = require('./logic');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String(event && event.tournamentId || '').trim();
  const clientRequestId = String(event && event.clientRequestId || '').trim();
  const traceId = String(event && event.__traceId || '').trim();
  const fail = (code, message, state) => common.failResult(code, message, { state, traceId });
  if (!tournamentId) return fail('TOURNAMENT_ID_REQUIRED', '请选择比赛', 'invalid');
  if (!clientRequestId) return fail('CLIENT_REQUEST_ID_REQUIRED', '请重新发起提前结束', 'invalid');
  const request = { scope: 'finish_tournament', subjectKey: tournamentId, operatorOpenId: OPENID, clientRequestId };
  await common.ensureCollection(db, common.CLIENT_REQUEST_LOG_COLLECTION);
  let shareFinishTournament = null;
  try {
    const result = await db.runTransaction(async (transaction) => {
      // Callback replay must not carry an aborted callback's share side effect.
      shareFinishTournament = null;
      const doc = await transaction.collection('tournaments').doc(tournamentId).get();
      const tournament = common.assertTournamentExists(doc && doc.data);
      if (!permission.isAdmin(tournament, OPENID)) return fail('PERMISSION_DENIED', '仅主办者可提前结束比赛', 'forbidden');
      const log = await common.getClientRequestLog(transaction, request);
      const meta = tournament.finishMeta;
      if (common.isSuccessfulClientRequestLog(log)) {
        if (tournament.status === 'finished' && meta && meta.type === 'manual' &&
          meta.operatorId === OPENID && meta.clientRequestId === clientRequestId) {
          return common.okResult('TOURNAMENT_FINISH_DEDUPED', '比赛已提前结束', {
            state: 'deduped', traceId, deduped: true, finished: true, clientRequestId,
            version: meta.version, completedMatches: meta.completedMatches, canceledMatches: meta.canceledMatches
          });
        }
        return fail('FINISH_REQUEST_EXPIRED', '该结束请求已处理，请刷新比赛', 'invalid');
      }
      if (tournament.status !== 'running') return fail('FINISH_RUNNING_ONLY', '仅进行中的比赛可提前结束', 'invalid');
      const computed = buildManualFinish(tournament);
      if (!computed.completedMatches) return fail('FINISH_SCORE_REQUIRED', '至少完成一场后才可提前结束', 'invalid');
      // This query deliberately uses db, not the transaction document API.
      // It follows the tournament snapshot on every callback replay. Every
      // successful acquire/takeover/heartbeat writes that same tournament, so
      // a lock created or extended after the query forces our write to replay.
      // Query all tournament locks, including corrections of completed matches.
      const locks = await db.collection('score_locks').where({
        tournamentId, expireAt: db.command.gt(Date.now())
      }).limit(1).get();
      if (!locks || !Array.isArray(locks.data)) throw new Error('录分状态读取失败，请重试');
      if (locks.data.length) return fail('LOCK_OCCUPIED', '有人正在录分，请等录分结束后再试', 'occupied');
      const version = (Number(tournament.version) || 1) + 1;
      const updatedAt = db.serverDate();
      const data = {
        rounds: computed.rounds, rankings: computed.rankings, status: 'finished',
        finishMeta: { type: 'manual', operatorId: OPENID, finishedAt: updatedAt, clientRequestId,
          completedMatches: computed.completedMatches, canceledMatches: computed.canceledMatches, version },
        updatedAt, version: db.command.inc(1)
      };
      if (shareActivity.getActivity(tournament, { allowedStates: [0, 1] })) {
        Object.assign(data, shareActivity.buildStatePatch(2, updatedAt));
        shareFinishTournament = tournament;
      }
      // scoreLock writes this same tournament on successful acquire/heartbeat.
      // A new lock after our snapshot therefore conflicts and replays this check.
      const updated = await transaction.collection('tournaments').doc(tournamentId).update({
        data: common.assertNoReservedRootKeys(data, ['_id'], '赛事提前结束数据')
      });
      common.assertOptimisticUpdate(updated);
      await common.upsertClientRequestLog(transaction, db, { ...request, status: 'succeeded', resourceType: 'tournament',
        resourceId: tournamentId, responseCode: 'TOURNAMENT_FINISHED_MANUALLY', responseState: 'finished' });
      return common.okResult('TOURNAMENT_FINISHED_MANUALLY', '比赛已提前结束', {
        state: 'finished', traceId, finished: true, clientRequestId, version,
        completedMatches: computed.completedMatches, canceledMatches: computed.canceledMatches
      });
    });
    if (result.code === 'TOURNAMENT_FINISHED_MANUALLY' && shareFinishTournament) {
      await shareActivity.updateFinishedMessageBestEffort(cloud, shareFinishTournament, console, {
        db, source: 'finishTournament', tournamentId, traceId
      });
    }
    return result;
  } catch (err) {
    if (common.isDocNotExists(err) || String(err && err.message || '').includes('赛事不存在')) {
      return fail('TOURNAMENT_NOT_FOUND', '赛事不存在', 'not_found');
    }
    if (common.isConflictError(err)) return fail('VERSION_CONFLICT', '数据已更新，请刷新后重试', 'conflict');
    throw common.normalizeConflictError(err, '提前结束失败');
  }
};
