const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const refereeId = String((event && event.refereeId) || '').trim();
  if (!tournamentId) throw new Error('缺少 tournamentId');
  // Reserved boundary:
  // this cloud function remains available for future tournament-level assignments,
  // but current frontend score entry is still gated by admin/participant only.

  try {
    return await db.runTransaction(async (transaction) => {
      const docRes = await transaction.collection('tournaments').doc(tournamentId).get();
      const t = common.assertTournamentExists(docRes.data);
      common.assertCreator(t, OPENID);

      if (refereeId) {
        const players = Array.isArray(t.players) ? t.players : [];
        const exists = players.some((p) => String((p && p.id) || '') === refereeId);
        if (!exists) throw new Error('裁判必须是当前参赛成员');
      }

      const oldVersion = Number(t.version) || 1;
      const updRes = await transaction.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
        data: common.assertNoReservedRootKeys({
          refereeId,
          updatedAt: db.serverDate(),
          version: _.inc(1)
        }, ['_id'], '裁判设置写入数据')
      });
      common.assertOptimisticUpdate(updRes, '写入冲突，请重试');
      return common.okResult('REFEREE_UPDATED', '已更新裁判', {
        state: 'updated'
      });
    });
  } catch (err) {
    throw common.normalizeConflictError(err, '设置失败');
  }
};
