const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const common = require('./lib/common');
const permission = require('./lib/permission');
const logic = require('./logic');

function safePlayerName(player) {
  const raw = player && (player.name || player.nickName || player.nickname || player.displayName);
  const name = String(raw || '').trim();
  if (name) return name;
  const idRaw = String((player && (player.id || player._id)) || '').trim();
  const suffix = idRaw.replace(/[^0-9a-zA-Z]/g, '').slice(-4);
  return suffix || '球友';
}

function findMatch(tournament, roundIndex, matchIndex) {
  const rounds = Array.isArray(tournament && tournament.rounds) ? tournament.rounds : [];
  const round = rounds.find((item) => Number(item && item.roundIndex) === Number(roundIndex));
  if (!round) return null;
  const matches = Array.isArray(round.matches) ? round.matches : [];
  return matches.find((item) => Number(item && item.matchIndex) === Number(matchIndex)) || null;
}

function resolveOwnerName(tournament, ownerId, fallback = '') {
  const players = Array.isArray(tournament && tournament.players) ? tournament.players : [];
  const player = players.find((item) => String((item && item.id) || '') === String(ownerId || ''));
  if (player) return safePlayerName(player);
  const fallbackName = String(fallback || '').trim();
  return fallbackName || '其他成员';
}

async function ensureScoreLocksCollection() {
  try {
    if (typeof db.createCollection === 'function') {
      await db.createCollection('score_locks');
    }
  } catch (_) {
    // ignore
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const traceId = String((event && event.__traceId) || '').trim();
  const action = logic.normalizeAction(event && event.action);
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const roundIndex = Number(event && event.roundIndex);
  const matchIndex = Number(event && event.matchIndex);
  const force = event && event.force === true;

  if (!action) return common.failResult('ACTION_REQUIRED', '缺少 action', { traceId, state: 'invalid' });
  if (!tournamentId) return common.failResult('TOURNAMENT_ID_REQUIRED', '缺少 tournamentId', { traceId, state: 'invalid' });
  if (!Number.isFinite(roundIndex) || roundIndex < 0) return common.failResult('ROUND_INDEX_INVALID', 'roundIndex 不合法', { traceId, state: 'invalid' });
  if (!Number.isFinite(matchIndex) || matchIndex < 0) return common.failResult('MATCH_INDEX_INVALID', 'matchIndex 不合法', { traceId, state: 'invalid' });

  await ensureScoreLocksCollection();
  const lockId = logic.buildLockId(tournamentId, roundIndex, matchIndex);

  try {
    return await db.runTransaction(async (transaction) => {
      const tRes = await transaction.collection('tournaments').doc(tournamentId).get();
      const tournament = common.assertTournamentExists(tRes.data);
      const admin = permission.isAdmin(tournament, OPENID);
      if (!permission.canEditScore(tournament, OPENID)) {
        return {
          ok: false,
          state: 'forbidden',
          ownerId: '',
          ownerName: '',
          expireAt: 0,
          remainingMs: 0
        };
      }
      const status = String(tournament.status || '').trim();
      if (status !== 'running' && status !== 'finished') {
        return {
          ok: false,
          state: 'forbidden',
          ownerId: '',
          ownerName: '',
          expireAt: 0,
          remainingMs: 0
        };
      }

      const match = findMatch(tournament, roundIndex, matchIndex);
      if (!match) throw new Error('比赛不存在');
      if (String(match.status || '') === 'finished' || String(match.status || '') === 'canceled') {
        return {
          ok: false,
          state: 'finished',
          ownerId: '',
          ownerName: '',
          expireAt: 0,
          remainingMs: 0
        };
      }

      let lockDoc = null;
      try {
        const lockRes = await transaction.collection('score_locks').doc(lockId).get();
        lockDoc = lockRes && lockRes.data ? lockRes.data : null;
      } catch (err) {
        if (!common.isDocNotExists(err)) throw err;
      }

      const nowTs = Date.now();
      const resolved = logic.resolveLockAction({
        action,
        nowTs,
        lockDoc,
        admin,
        force,
        canUseLock: permission.canEditScore(tournament, OPENID),
        tournamentStatus: status,
        matchExists: true,
        matchStatus: String(match.status || ''),
        openid: OPENID,
        ownerName: resolveOwnerName(tournament, OPENID),
        resolveOwnerName: (ownerId, fallback) => resolveOwnerName(tournament, ownerId, fallback)
      });

      if (resolved.nextLockDoc) {
        const data = common.assertNoReservedRootKeys({
          tournamentId,
          roundIndex,
          matchIndex,
          ...resolved.nextLockDoc,
          updatedAt: db.serverDate()
        }, ['_id'], '录分锁写入数据');
        await transaction.collection('score_locks').doc(lockId).set({
          data
        });
      }
      if (resolved.removeLock) {
        await transaction.collection('score_locks').doc(lockId).remove();
      }
      return common.withWriteResult(resolved.response, {
        ...describeScoreLockState(resolved.response),
        traceId
      });
    });
  } catch (err) {
    if (common.isCollectionNotExists(err)) {
      throw new Error('数据库集合不存在，请在云开发控制台创建 tournaments 与 score_locks。');
    }
    throw common.normalizeConflictError(err, '录分锁操作失败');
  }
};

function describeScoreLockState(result = {}) {
  const state = String(result.state || '').trim().toLowerCase();
  if (state === 'idle') {
    return { code: 'LOCK_IDLE', message: '当前可开始录分', state: 'idle' };
  }
  if (state === 'acquired') {
    return { code: 'LOCK_ACQUIRED', message: '已进入录分状态', state: 'acquired' };
  }
  if (state === 'occupied') {
    return { code: 'LOCK_OCCUPIED', message: '当前有人正在录入比分', state: 'occupied' };
  }
  if (state === 'forbidden') {
    return { code: 'LOCK_FORBIDDEN', message: '仅管理员或参赛成员可录分', state: 'forbidden' };
  }
  if (state === 'finished') {
    return { code: 'MATCH_FINISHED', message: '该场已结束', state: 'finished' };
  }
  if (state === 'expired') {
    return { code: 'LOCK_EXPIRED', message: '录分会话已过期，请重新开始录分', state: 'expired' };
  }
  if (state === 'released') {
    return { code: 'LOCK_RELEASED', message: '已结束录分会话', state: 'released' };
  }
  return {
    code: result && result.ok === false ? 'LOCK_FAILED' : 'LOCK_OK',
    message: result && result.ok === false ? '录分锁操作失败' : '录分锁状态已同步',
    state
  };
}
