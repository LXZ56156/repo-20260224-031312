const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');
const { buildSubmitResult } = require('./logic');

function isAdmin(t, openid) {
  return t && openid && t.creatorId === openid;
}

function isReferee(t, openid) {
  return t && openid && (t.refereeId || '') === openid;
}

function canEditScore(t, openid) {
  return isAdmin(t, openid) || isReferee(t, openid);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const roundIndex = Number(event && event.roundIndex);
  const matchIndex = Number(event && event.matchIndex);

  const scoreA = (event && (event.scoreA ?? event.teamAScore ?? event.teamA ?? event.a));
  const scoreB = (event && (event.scoreB ?? event.teamBScore ?? event.teamB ?? event.b));

  const a = Number(scoreA);
  const b = Number(scoreB);

  if (!tournamentId) throw new Error('缺少 tournamentId');
  if (!Number.isFinite(roundIndex) || roundIndex < 0) throw new Error('roundIndex 不合法');
  if (!Number.isFinite(matchIndex) || matchIndex < 0) throw new Error('matchIndex 不合法');
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) throw new Error('比分不合法');
  if (!Number.isInteger(a) || !Number.isInteger(b)) throw new Error('比分必须为整数');
  if (a === b) throw new Error('比分不可相同');

  try {
    const docRes = await db.collection('tournaments').doc(tournamentId).get();
    const t = common.assertTournamentExists(docRes.data);
    if (!canEditScore(t, OPENID)) throw new Error('无权限录分');
    if (t.status !== 'running' && t.status !== 'finished') throw new Error('赛事未开赛');

    const oldVersion = Number(t.version) || 1;
    const computed = buildSubmitResult(t, roundIndex, matchIndex, a, b);

    const updRes = await db.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
      data: {
        rounds: computed.rounds,
        rankings: computed.rankings,
        status: computed.nextStatus,
        updatedAt: db.serverDate(),
        version: _.inc(1)
      }
    });

    common.assertOptimisticUpdate(updRes, '写入冲突，请刷新赛事后重试');
    return { ok: true, finished: computed.finished };
  } catch (err) {
    if (common.isCollectionNotExists(err)) {
      throw new Error('数据库集合 tournaments 不存在：请在云开发控制台（数据库 -> 创建集合）创建 tournaments 后再试。');
    }
    throw common.normalizeConflictError(err, '提交比分失败');
  }
};
