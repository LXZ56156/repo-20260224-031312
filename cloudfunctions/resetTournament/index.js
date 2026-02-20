const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function isCollectionNotExists(err) {
  const msg = String(err && (err.message || err.errMsg || err));
  return msg.includes('DATABASE_COLLECTION_NOT_EXIST') || msg.includes('collection not exists') || msg.includes('ResourceNotFound') || msg.includes('-502005');
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  if (!tournamentId) throw new Error('缺少 tournamentId');

  try {
    const docRes = await db.collection('tournaments').doc(tournamentId).get();
    const t = docRes.data;
    if (!t) throw new Error('赛事不存在');
    if (t.creatorId !== OPENID) throw new Error('无权限');

    const players = Array.isArray(t.players) ? t.players : [];
    const baseRankings = players.map(p => ({
      playerId: p.id,
      name: p.name,
      wins: 0,
      losses: 0,
      played: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0
    }));

    const oldVersion = Number(t.version) || 1;
    const updRes = await db.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
      data: {
        status: 'draft',
        rounds: [],
        rankings: baseRankings,
        scheduleSeed: null,
        fairnessScore: 0,
        fairnessJson: '',
        playerStatsJson: '',
        fairness: _.remove(),
        playerStats: _.remove(),
        updatedAt: db.serverDate(),
        version: _.inc(1)
      }
    });
    if (!updRes || !updRes.stats || updRes.stats.updated === 0) {
      throw new Error('写入冲突，请刷新赛事后重试');
    }
    return { ok: true };
  } catch (err) {
    if (isCollectionNotExists(err)) {
      throw new Error('数据库集合 tournaments 不存在：请在云开发控制台（数据库 -> 创建集合）创建 tournaments 后再试。');
    }
    throw err;
  }
};
