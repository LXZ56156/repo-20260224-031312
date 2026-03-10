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
  const normalizedCode = String(code || '').trim().toUpperCase();
  const state = resolveFailureState(normalizedCode, extra.state);
  return common.failResult(normalizedCode || 'SUBMIT_FAILED', message || '提交失败', {
    ...extra,
    state
  });
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

  if (!tournamentId) return createCodeResult('TOURNAMENT_ID_REQUIRED', '缺少 tournamentId', { traceId });
  if (!Number.isFinite(roundIndex) || roundIndex < 0) return createCodeResult('ROUND_INDEX_INVALID', 'roundIndex 不合法', { traceId });
  if (!Number.isFinite(matchIndex) || matchIndex < 0) return createCodeResult('MATCH_INDEX_INVALID', 'matchIndex 不合法', { traceId });
  if (!scoreUtils.isValidFinishedScore({ teamA: a, teamB: b })) return createCodeResult('SCORE_INVALID', '比分不合法', { traceId });
  if (!scoreUtils.isScoreWithinBounds({ teamA: a, teamB: b }, scoreUtils.SCORE_ABSOLUTE_MAX)) {
    return createCodeResult('SCORE_OUT_OF_RANGE', `比分不能超过 ${scoreUtils.SCORE_ABSOLUTE_MAX} 分`, { traceId });
  }

  try {
    const docRes = await db.collection('tournaments').doc(tournamentId).get();
    const t = common.assertTournamentExists(docRes.data);
    if (!permission.canEditScore(t, OPENID)) return createCodeResult('PERMISSION_DENIED', '无权限录分', { traceId });
    if (t.status !== 'running' && t.status !== 'finished') return createCodeResult('PERMISSION_DENIED', '赛事未开赛', { traceId });

    const match = findMatch(t, roundIndex, matchIndex);
    if (!match) return createCodeResult('MATCH_NOT_FOUND', '比赛不存在', { traceId });
    const fallbackScorerName = resolvePlayerName(t, OPENID);
    const retryResult = buildIdempotentRetryResult(match, a, b, OPENID, fallbackScorerName);
    if (retryResult) {
      return common.withWriteResult({
        ...retryResult,
        ...(clientRequestId ? { clientRequestId } : {})
      }, {
        code: 'SCORE_SUBMIT_DEDUPED',
        message: '比分已提交',
        state: 'deduped',
        traceId
      });
    }
    if (String(match.status || '') === 'finished' || String(match.status || '') === 'canceled') {
      return createCodeResult('MATCH_FINISHED', '该场已结束', { traceId });
    }

    const lockId = buildLockId(tournamentId, roundIndex, matchIndex);
    const lockDoc = await readScoreLock(lockId);
    const nowTs = Date.now();
    if (!lockDoc) {
      return createCodeResult('LOCK_EXPIRED', '录分会话已过期，请重新开始录分', { traceId });
    }
    const expireAt = Number(lockDoc.expireAt) || 0;
    const ownerId = String(lockDoc.ownerId || '').trim();
    const ownerName = String(lockDoc.ownerName || '').trim();
    if (expireAt <= nowTs) {
      return createCodeResult('LOCK_EXPIRED', '录分会话已过期，请重新开始录分', { traceId, expireAt });
    }
    if (ownerId !== String(OPENID || '')) {
      return createCodeResult('LOCK_OCCUPIED', '当前有人正在录入比分', {
        traceId,
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
      data: common.assertNoReservedRootKeys({
        rounds: computed.rounds,
        rankings: computed.rankings,
        status: computed.nextStatus,
        updatedAt: db.serverDate(),
        version: _.inc(1)
      }, ['_id'], '比分提交写入数据')
    });

    if (!updRes || !updRes.stats || Number(updRes.stats.updated || 0) <= 0) {
      return createCodeResult('VERSION_CONFLICT', '写入冲突，请刷新赛事后重试', { traceId });
    }

    db.collection('score_locks').doc(lockId).remove().catch(() => {});
    return common.okResult('SCORE_SUBMITTED', '比分已提交', {
      traceId,
      state: computed.finished ? 'finished' : 'submitted',
      finished: computed.finished,
      scorerName,
      version: oldVersion + 1,
      ...(clientRequestId ? { clientRequestId } : {})
    });
  } catch (err) {
    if (common.isCollectionNotExists(err)) {
      throw new Error('数据库集合 tournaments 不存在：请在云开发控制台（数据库 -> 创建集合）创建 tournaments 后再试。');
    }
    if (String((err && err.message) || '').includes('赛事不存在')) {
      return createCodeResult('TOURNAMENT_NOT_FOUND', '赛事不存在', { traceId });
    }
    if (common.isConflictError(err)) {
      return createCodeResult('VERSION_CONFLICT', '写入冲突，请刷新赛事后重试', { traceId });
    }
    throw common.normalizeConflictError(err, '提交比分失败');
  }
};

function resolveFailureState(code, fallbackState = '') {
  const normalized = String(code || '').trim().toUpperCase();
  if (fallbackState) return String(fallbackState || '').trim();
  if (normalized === 'LOCK_OCCUPIED') return 'occupied';
  if (normalized === 'LOCK_EXPIRED') return 'expired';
  if (normalized === 'MATCH_FINISHED') return 'finished';
  if (normalized === 'PERMISSION_DENIED') return 'forbidden';
  if (normalized === 'MATCH_NOT_FOUND') return 'invalid';
  if (normalized === 'TOURNAMENT_ID_REQUIRED') return 'invalid';
  if (normalized === 'ROUND_INDEX_INVALID') return 'invalid';
  if (normalized === 'MATCH_INDEX_INVALID') return 'invalid';
  if (normalized === 'SCORE_INVALID') return 'invalid';
  if (normalized === 'TOURNAMENT_NOT_FOUND') return 'not_found';
  if (normalized === 'VERSION_CONFLICT') return 'conflict';
  if (normalized === 'SCORE_OUT_OF_RANGE') return 'invalid';
  return '';
}
