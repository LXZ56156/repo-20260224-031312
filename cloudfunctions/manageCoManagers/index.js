const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const common = require('./lib/common');
const permission = require('./lib/permission');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String(event && event.tournamentId || '').trim();
  const playerId = String(event && event.playerId || '').trim();
  const action = String(event && event.action || '').trim();
  const clientRequestId = String(event && event.clientRequestId || '').trim();
  const traceId = String(event && event.__traceId || '').trim();
  const fail = (code, message, state = 'invalid') => common.failResult(code, message, { state, traceId });
  if (!tournamentId || !playerId || !clientRequestId || !['grant', 'revoke'].includes(action)) {
    return fail('CO_MANAGER_REQUEST_INVALID', '请选择成员并重新操作');
  }
  const request = { scope: 'manage_co_managers', subjectKey: tournamentId, operatorOpenId: OPENID, clientRequestId };
  await common.ensureCollection(db, common.CLIENT_REQUEST_LOG_COLLECTION);
  try {
    return await db.runTransaction(async (transaction) => {
      const doc = await transaction.collection('tournaments').doc(tournamentId).get();
      const t = common.assertTournamentExists(doc && doc.data);
      if (!permission.isAdmin(t, OPENID)) return fail('PERMISSION_DENIED', '仅主办者可授予或撤销协管', 'forbidden');
      const log = await common.getClientRequestLog(transaction, request);
      const resourceType = `co_manager_${action}`;
      if (common.isSuccessfulClientRequestLog(log)) {
        if (log.resourceId !== playerId || log.resourceType !== resourceType) return fail('CLIENT_REQUEST_MISMATCH', '请求已处理，请重新操作');
        return common.okResult('CO_MANAGERS_DEDUPED', '协管操作已处理', {
          state: 'deduped', traceId, deduped: true, clientRequestId, coManagers: permission.getCoManagerIds(t), version: Number(t.version) || 1
        });
      }
      if (!['draft', 'running'].includes(t.status)) return fail('CO_MANAGERS_STATUS_INVALID', '仅开赛前或进行中的比赛可调整协管');
      if (playerId === String(t.creatorId || '')) return fail('CO_MANAGER_OWNER_INVALID', '主办者无需设为协管');
      if (action === 'grant' && !permission.getBoundPlayerIds(t).includes(playerId)) {
        return fail('CO_MANAGER_NOT_BOUND', '仅实际加入并绑定身份的成员可设为协管');
      }
      const current = permission.getCoManagerIds(t);
      const coManagers = action === 'grant' ? Array.from(new Set(current.concat(playerId))) : current.filter((id) => id !== playerId);
      const changed = JSON.stringify(coManagers) !== JSON.stringify(Array.isArray(t.coManagers) ? t.coManagers : []);
      if (changed) {
        const updated = await transaction.collection('tournaments').doc(tournamentId).update({
          data: common.assertNoReservedRootKeys({ coManagers, version: db.command.inc(1), updatedAt: db.serverDate() }, ['_id'], '协管调整数据')
        });
        common.assertOptimisticUpdate(updated);
      }
      await common.upsertClientRequestLog(transaction, db, { ...request, status: 'succeeded', resourceType,
        resourceId: playerId, responseCode: action === 'grant' ? 'CO_MANAGER_GRANTED' : 'CO_MANAGER_REVOKED', responseState: changed ? 'updated' : 'deduped' });
      return common.okResult(action === 'grant' ? 'CO_MANAGER_GRANTED' : 'CO_MANAGER_REVOKED', action === 'grant' ? '已设为协管' : '已撤销协管', {
        state: changed ? 'updated' : 'deduped', traceId, ...(changed ? {} : { deduped: true }), clientRequestId, coManagers,
        version: (Number(t.version) || 1) + (changed ? 1 : 0)
      });
    });
  } catch (err) {
    if (common.isDocNotExists(err) || String(err && err.message || '').includes('赛事不存在')) return fail('TOURNAMENT_NOT_FOUND', '赛事不存在', 'not_found');
    if (common.isConflictError(err)) return fail('VERSION_CONFLICT', '数据已更新，请刷新后重试', 'conflict');
    throw common.normalizeConflictError(err, '协管操作失败');
  }
};
