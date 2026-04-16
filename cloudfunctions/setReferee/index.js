const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const traceId = String((event && event.__traceId) || '').trim();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const refereeId = String((event && event.refereeId) || '').trim();
  if (!tournamentId) {
    return common.failResult('TOURNAMENT_ID_REQUIRED', '缺少 tournamentId', {
      traceId,
      state: 'invalid'
    });
  }
  // Reserved boundary:
  // this cloud function remains available for future tournament-level assignments,
  // but current frontend score entry is still gated by admin/participant only.

  try {
    return await db.runTransaction(async (transaction) => {
      let t = null;
      try {
        const docRes = await transaction.collection('tournaments').doc(tournamentId).get();
        t = docRes && docRes.data ? docRes.data : null;
      } catch (err) {
        if (common.isDocNotExists(err)) {
          return common.failResult('TOURNAMENT_NOT_FOUND', '赛事不存在', {
            traceId,
            state: 'not_found'
          });
        }
        throw err;
      }
      if (!t) {
        return common.failResult('TOURNAMENT_NOT_FOUND', '赛事不存在', {
          traceId,
          state: 'not_found'
        });
      }
      if (String(t.creatorId || '') !== String(OPENID || '')) {
        return common.failResult('PERMISSION_DENIED', '仅管理员可设置裁判', {
          traceId,
          state: 'forbidden'
        });
      }

      if (refereeId) {
        const players = Array.isArray(t.players) ? t.players : [];
        const exists = players.some((p) => String((p && p.id) || '') === refereeId);
        if (!exists) {
          return common.failResult('REFEREE_INVALID', '裁判必须是当前参赛成员', {
            traceId,
            state: 'invalid'
          });
        }
      }

      const oldVersion = Number(t.version) || 1;
      const updRes = await transaction.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
        data: common.assertNoReservedRootKeys({
          refereeId,
          updatedAt: db.serverDate(),
          version: _.inc(1)
        }, ['_id'], '裁判设置写入数据')
      });
      if (!updRes || !updRes.stats || Number(updRes.stats.updated || 0) <= 0) {
        return common.failResult('VERSION_CONFLICT', '写入冲突，请重试', {
          traceId,
          state: 'conflict'
        });
      }
      return common.okResult('REFEREE_UPDATED', '已更新裁判', {
        traceId,
        state: 'updated'
      });
    });
  } catch (err) {
    if (common.isDocNotExists(err) || String((err && err.message) || '').includes('赛事不存在')) {
      return common.failResult('TOURNAMENT_NOT_FOUND', '赛事不存在', {
        traceId,
        state: 'not_found'
      });
    }
    if (common.isConflictError(err)) {
      return common.failResult('VERSION_CONFLICT', '写入冲突，请重试', {
        traceId,
        state: 'conflict'
      });
    }
    throw common.normalizeConflictError(err, '设置失败');
  }
};
