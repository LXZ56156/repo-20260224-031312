const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function ensureTournamentsCollection() {
  try {
    if (typeof db.createCollection === 'function') {
      await db.createCollection('tournaments');
    }
  } catch (_) {}
}

function intOr(v, d, maxV) {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  const nn = Math.max(1, Math.floor(n));
  return Number.isFinite(maxV) ? Math.min(nn, maxV) : nn;
}

function isCollectionNotExists(err) {
  const msg = String(err && (err.message || err.errMsg || err));
  return msg.includes('DATABASE_COLLECTION_NOT_EXIST') || msg.includes('collection not exists') || msg.includes('ResourceNotFound') || msg.includes('-502005');
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const name = String((event && event.name) || '').trim();
  const nickname = String((event && event.nickname) || '').trim();
  const avatar = String((event && (event.avatar || event.avatarUrl)) || '').trim();
  if (!name) throw new Error('赛事名称不能为空');
  // 创建阶段不设置比赛参数（由“赛事设置”页统一配置）

  await ensureTournamentsCollection();

  const rules = { gamesPerMatch: 1, pointsPerGame: 21 };
  // Product requirement: do not expose openid fragments as the default displayed name.
  // If user does not provide a nickname, default to a friendly sequential name.
  const creatorPlayer = {
    id: OPENID,
    name: nickname || '球员1',
    type: 'user',
    avatar: avatar || ''
  };

  try {
    const res = await db.collection('tournaments').add({
      data: {
        name,
        status: 'draft',
        creatorId: OPENID,
        refereeId: '',
        // 参数由赛事设置页配置；未配置前不展示默认数字
        settingsConfigured: false,
        totalMatches: 0,
        courts: 0,
        rules,
        players: [creatorPlayer],
        rounds: [],
        rankings: [],
        scheduleSeed: null,
        fairnessScore: 0,
        // Avoid nested-object updates causing DB dot-path conflicts.
        fairnessJson: '',
        playerStatsJson: '',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
        version: 1
      }
    });
    return { tournamentId: res._id };
  } catch (err) {
    if (isCollectionNotExists(err)) {
      throw new Error('数据库集合 tournaments 不存在：请在云开发控制台（数据库 -> 创建集合）创建 tournaments 后再试。');
    }
    throw err;
  }
};
