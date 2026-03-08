const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');
const logic = require('./logic');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  if (!tournamentId) throw new Error('缺少 tournamentId');

  try {
    const docRes = await db.collection('tournaments').doc(tournamentId).get();
    const t = common.assertTournamentExists(docRes.data);
    common.assertCreator(t, OPENID);

    const oldVersion = Number(t.version) || 1;
    const updRes = await db.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
      data: {
        ...logic.buildResetTournamentPatch(t),
        ...logic.buildResetTournamentRemovals(_.remove()),
        updatedAt: db.serverDate(),
        version: _.inc(1)
      }
    });
    common.assertOptimisticUpdate(updRes, '写入冲突，请刷新赛事后重试');
    await logic.cleanupScoreLocksBestEffort(() => common.cleanupScoreLocks(db, tournamentId), tournamentId, console);
    return { ok: true };
  } catch (err) {
    if (common.isCollectionNotExists(err)) {
      throw new Error('数据库集合 tournaments 不存在：请在云开发控制台（数据库 -> 创建集合）创建 tournaments 后再试。');
    }
    throw common.normalizeConflictError(err, '重置失败');
  }
};
