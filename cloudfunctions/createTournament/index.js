const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const common = require('./lib/common');
const modeHelper = require('./lib/mode');

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

function normalizeGender(gender) {
  const v = String(gender || '').trim().toLowerCase();
  if (v === 'male' || v === 'female') return v;
  return 'unknown';
}

function normalizePoints(points) {
  const p = Number(points);
  if (p === 11 || p === 15 || p === 21) return p;
  return 21;
}

function normalizeEndConditionType(type) {
  const v = String(type || '').trim().toLowerCase();
  if (v === 'total_matches' || v === 'total_rounds' || v === 'target_wins') return v;
  return 'total_matches';
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  const name = String((event && event.name) || '').trim();
  const nickname = String((event && event.nickname) || '').trim();
  const avatar = String((event && (event.avatar || event.avatarUrl)) || '').trim();
  const presetKey = String((event && event.presetKey) || 'standard').trim().toLowerCase();
  const mode = modeHelper.normalizeMode(event && event.mode);
  const creatorGender = normalizeGender(event && event.creatorGender);
  const allowOpenTeam = event && Object.prototype.hasOwnProperty.call(event, 'allowOpenTeam')
    ? event.allowOpenTeam === true
    : false;
  const totalMatches = intOr(event && event.totalMatches, 0);
  const courts = intOr(event && event.courts, 0, 10);
  const pointsPerGame = normalizePoints(event && event.pointsPerGame);
  const endConditionType = normalizeEndConditionType(event && event.endConditionType);
  const endConditionTarget = intOr(event && event.endConditionTarget, Math.max(1, totalMatches || 1));
  const settingsConfigured = totalMatches >= 1 && courts >= 1;
  if (!name) throw new Error('赛事名称不能为空');

  await ensureTournamentsCollection();

  if (clientRequestId) {
    const existing = await db.collection('tournaments').where({
      creatorId: OPENID,
      clientRequestId
    }).limit(1).get();
    const existingDoc = Array.isArray(existing && existing.data) ? existing.data[0] : null;
    if (existingDoc && existingDoc._id) {
      return common.okResult('TOURNAMENT_CREATED', '已创建比赛', {
        traceId,
        state: 'deduped',
        deduped: true,
        ...(clientRequestId ? { clientRequestId } : {}),
        tournamentId: existingDoc._id
      });
    }
  }

  const rules = {
    gamesPerMatch: 1,
    pointsPerGame,
    endCondition: {
      type: mode === 'squad_doubles' ? endConditionType : 'total_matches',
      target: mode === 'squad_doubles' ? endConditionTarget : Math.max(1, totalMatches || 1)
    },
    unfinishedPolicy: 'admin_decide'
  };
  // Product requirement: do not expose openid fragments as the default displayed name.
  // If user does not provide a nickname, default to a friendly sequential name.
  const creatorPlayer = {
    id: OPENID,
    name: nickname || '球员1',
    type: 'user',
    avatar: avatar || '',
    gender: creatorGender,
    squad: ''
  };

  try {
    const data = {
      name,
      status: 'draft',
      creatorId: OPENID,
      mode,
      allowOpenTeam,
      refereeId: '',
      // 创建页可直接预配置参数；未配置时仍保持草稿态并可后续设置
      presetKey: ['relax', 'standard', 'intense', 'custom'].includes(presetKey) ? presetKey : 'standard',
      settingsConfigured,
      totalMatches: settingsConfigured ? totalMatches : 0,
      courts: settingsConfigured ? courts : 0,
      rules,
      players: [creatorPlayer],
      playerIds: [OPENID],
      pairTeams: [],
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
    };
    if (clientRequestId) data.clientRequestId = clientRequestId;
    common.assertNoReservedRootKeys(data, ['_id'], '赛事创建数据');
    const res = await db.collection('tournaments').add({
      data
    });
    return common.okResult('TOURNAMENT_CREATED', '已创建比赛', {
      state: 'created',
      traceId,
      ...(clientRequestId ? { clientRequestId } : {}),
      tournamentId: res._id
    });
  } catch (err) {
    if (common.isCollectionNotExists(err)) {
      throw new Error('数据库集合 tournaments 不存在：请在云开发控制台（数据库 -> 创建集合）创建 tournaments 后再试。');
    }
    throw err;
  }
};
