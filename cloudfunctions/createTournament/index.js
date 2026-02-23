const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const common = require('./lib/common');

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
  const nn = Math.floor(n);
  if (nn < 1) return d;
  return Number.isFinite(maxV) ? Math.min(nn, maxV) : nn;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const name = String((event && event.name) || '').trim();
  const nickname = String((event && event.nickname) || '').trim();
  const avatar = String((event && (event.avatar || event.avatarUrl)) || '').trim();
  const presetKey = String((event && event.presetKey) || 'standard').trim().toLowerCase();
  const totalMatches = intOr(event && event.totalMatches, 0);
  const courts = intOr(event && event.courts, 0, 10);
  const settingsConfigured = totalMatches >= 1 && courts >= 1;
  if (!name) throw new Error('赛事名称不能为空');

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
        // 创建页可直接预配置参数；未配置时仍保持草稿态并可后续设置
        presetKey: ['relax', 'standard', 'intense', 'custom'].includes(presetKey) ? presetKey : 'standard',
        settingsConfigured,
        totalMatches: settingsConfigured ? totalMatches : 0,
        courts: settingsConfigured ? courts : 0,
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
    if (common.isCollectionNotExists(err)) {
      throw new Error('数据库集合 tournaments 不存在：请在云开发控制台（数据库 -> 创建集合）创建 tournaments 后再试。');
    }
    throw err;
  }
};
