const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const playerId = String((event && event.playerId) || '').trim();
  if (!tournamentId) throw new Error('缺少 tournamentId');
  if (!playerId) throw new Error('缺少 playerId');

  return await db.runTransaction(async (transaction) => {
    const docRes = await transaction.collection('tournaments').doc(tournamentId).get();
    const t = docRes.data;
    if (!t) throw new Error('赛事不存在');
    if (t.creatorId !== OPENID) throw new Error('无权限');
    if (t.status !== 'draft') throw new Error('非草稿阶段不可移除');
    const oldVersion = Number(t.version) || 1;
    if (playerId === t.creatorId) throw new Error('不能移除创建者');

    const players = Array.isArray(t.players) ? t.players.filter(p => p.id !== playerId) : [];
    const refereeId = (t.refereeId === playerId) ? '' : (t.refereeId || '');

    const updRes = await transaction.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
      data: {
        players,
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
