const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const refereeId = String((event && event.refereeId) || '').trim();
  if (!tournamentId) throw new Error('缺少 tournamentId');

  return await db.runTransaction(async (transaction) => {
    const docRes = await transaction.collection('tournaments').doc(tournamentId).get();
    const t = docRes.data;
    if (!t) throw new Error('赛事不存在');
    if (t.creatorId !== OPENID) throw new Error('无权限');

    if (refereeId) {
      const players = Array.isArray(t.players) ? t.players : [];
      const exists = players.some((p) => String((p && p.id) || '') === refereeId);
      if (!exists) throw new Error('裁判必须是当前参赛成员');
    }

    const oldVersion = Number(t.version) || 1;
    const updRes = await transaction.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
      data: {
        refereeId,
        updatedAt: db.serverDate(),
        version: _.inc(1)
      }
    });
    if (!updRes || !updRes.stats || updRes.stats.updated === 0) {
      throw new Error('写入冲突，请重试');
    }
    return { ok: true };
  });
};
