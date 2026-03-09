const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');
const permission = require('./lib/permission');
const playerUtils = require('./lib/player');
const scoreUtils = require('./lib/score');
const { buildSubmitResult, buildIdempotentRetryResult } = require('./logic');

function safePlayerName(player) {
  return playerUtils.safePlayerName(player);
}

function resolvePlayerName(tournament, openid) {
  const players = Array.isArray(tournament && tournament.players) ? tournament.players : [];
  const player = players.find((item) => String((item && item.id) || '') === String(openid || ''));
  if (player) return safePlayerName(player);
  return '球友';
}

function findMatch(tournament, roundIndex, matchIndex) {
  const rounds = Array.isArray(tournament && tournament.rounds) ? tournament.rounds : [];
  const round = rounds.find((item) => Number(item && item.roundIndex) === Number(roundIndex));
  if (!round) return null;
  const matches = Array.isArray(round.matches) ? round.matches : [];
  return matches.find((item) => Number(item && item.matchIndex) === Number(matchIndex)) || null;
}

function buildLockId(tournamentId, roundIndex, matchIndex) {
  return `${String(tournamentId || '').trim()}_${Number(roundIndex)}_${Number(matchIndex)}`;
}

function createCodeResult(code, message, extra = {}) {
  return {
    ok: false,
    code: String(code || '').trim(),
    message: String(message || '').trim(),
    ...extra
  };
}

async function readScoreLock(lockId) {
  try {
    const res = await db.collection('score_locks').doc(lockId).get();
    return res && res.data ? res.data : null;
  } catch (err) {
    if (common.isCollectionNotExists(err)) return null;
    if (common.isDocNotExists(err)) return null;
    throw err;
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const traceId = String((event && event.__traceId) || '').trim();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const roundIndex = Number(event && event.roundIndex);
  const matchIndex = Number(event && event.matchIndex);
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  console.info('[submitScore]', traceId || '-', tournamentId || '-', roundIndex, matchIndex, OPENID || '-');

  const scorePair = scoreUtils.extractScorePairAny(event);
  const a = scorePair.a;
  const b = scorePair.b;

  if (!tournamentId) throw new Error('缺少 tournamentId');
  if (!Number.isFinite(roundIndex) || roundIndex < 0) throw new Error('roundIndex 不合法');
  if (!Number.isFinite(matchIndex) || matchIndex < 0) throw new Error('matchIndex 不合法');
  if (!scoreUtils.isValidFinishedScore({ teamA: a, teamB: b })) throw new Error('比分不合法');

  try {
    const docRes = await db.collection('tournaments').doc(tournamentId).get();
    const t = common.assertTournamentExists(docRes.data);
    if (!permission.canEditScore(t, OPENID)) return createCodeResult('PERMISSION_DENIED', '无权限录分');
    if (t.status !== 'running' && t.status !== 'finished') return createCodeResult('PERMISSION_DENIED', '赛事未开赛');

    const match = findMatch(t, roundIndex, matchIndex);
    if (!match) return createCodeResult('PERMISSION_DENIED', '比赛不存在');
    const fallbackScorerName = resolvePlayerName(t, OPENID);
    const retryResult = buildIdempotentRetryResult(match, a, b, OPENID, fallbackScorerName);
    if (retryResult) {
      if (clientRequestId) retryResult.clientRequestId = clientRequestId;
      return retryResult;
    }
    if (String(match.status || '') === 'finished' || String(match.status || '') === 'canceled') {
      return createCodeResult('MATCH_FINISHED', '该场已结束');
    }

    const lockId = buildLockId(tournamentId, roundIndex, matchIndex);
    const lockDoc = await readScoreLock(lockId);
    const nowTs = Date.now();
    if (!lockDoc) {
      return createCodeResult('LOCK_EXPIRED', '录分会话已过期，请重新开始录分');
    }
    const expireAt = Number(lockDoc.expireAt) || 0;
    const ownerId = String(lockDoc.ownerId || '').trim();
    const ownerName = String(lockDoc.ownerName || '').trim();
    if (expireAt <= nowTs) {
      return createCodeResult('LOCK_EXPIRED', '录分会话已过期，请重新开始录分');
    }
    if (ownerId !== String(OPENID || '')) {
      return createCodeResult('LOCK_OCCUPIED', '当前有人正在录入比分', {
        ownerId,
        ownerName: ownerName || resolvePlayerName(t, ownerId),
        remainingMs: Math.max(0, expireAt - nowTs),
        expireAt
      });
    }

    const oldVersion = Number(t.version) || 1;
    const scorerName = ownerName || fallbackScorerName;
    const computed = buildSubmitResult(t, roundIndex, matchIndex, a, b, {
      id: OPENID,
      name: scorerName,
      scoredAt: new Date().toISOString()
    });

    const updRes = await db.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
      data: {
        rounds: computed.rounds,
        rankings: computed.rankings,
        status: computed.nextStatus,
        updatedAt: db.serverDate(),
        version: _.inc(1)
      }
    });

    if (!updRes || !updRes.stats || Number(updRes.stats.updated || 0) <= 0) {
      return createCodeResult('VERSION_CONFLICT', '写入冲突，请刷新赛事后重试');
    }

    db.collection('score_locks').doc(lockId).remove().catch(() => {});
    return { ok: true, finished: computed.finished, scorerName, ...(clientRequestId ? { clientRequestId } : {}) };
  } catch (err) {
    if (common.isCollectionNotExists(err)) {
      throw new Error('数据库集合 tournaments 不存在：请在云开发控制台（数据库 -> 创建集合）创建 tournaments 后再试。');
    }
    if (common.isConflictError(err)) {
      return createCodeResult('VERSION_CONFLICT', '写入冲突，请刷新赛事后重试');
    }
    throw common.normalizeConflictError(err, '提交比分失败');
  }
};
