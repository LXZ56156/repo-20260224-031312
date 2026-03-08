const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const common = require('./lib/common');

const LOCK_TTL_MS = 45 * 1000;

function normalizeAction(action) {
  const v = String(action || '').trim().toLowerCase();
  if (v === 'acquire' || v === 'heartbeat' || v === 'release' || v === 'status') return v;
  return '';
}

function safePlayerName(player) {
  const raw = player && (player.name || player.nickname || player.nickName || player.displayName);
  const name = String(raw || '').trim();
  if (name) return name;
  const idRaw = String((player && (player.id || player._id)) || '').trim();
  const suffix = idRaw.replace(/[^0-9a-zA-Z]/g, '').slice(-4);
  return suffix || '球友';
}

function isAdmin(tournament, openid) {
  return tournament && openid && String(tournament.creatorId || '') === String(openid || '');
}

function isParticipant(tournament, openid) {
  if (!tournament || !openid) return false;
  const players = Array.isArray(tournament.players) ? tournament.players : [];
  return players.some((player) => String((player && player.id) || '') === String(openid || ''));
}

function canUseLock(tournament, openid) {
  return isAdmin(tournament, openid) || isParticipant(tournament, openid);
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

function buildLockId(tournamentId, roundIndex, matchIndex) {
  return `${String(tournamentId || '').trim()}_${Number(roundIndex)}_${Number(matchIndex)}`;
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

function buildOccupiedResult(lockDoc, nowTs, tournament) {
  const expireAt = Number(lockDoc && lockDoc.expireAt) || 0;
  const ownerId = String((lockDoc && lockDoc.ownerId) || '').trim();
  return {
    ok: false,
    state: 'occupied',
    ownerId,
    ownerName: resolveOwnerName(tournament, ownerId, lockDoc && lockDoc.ownerName),
    expireAt,
    remainingMs: Math.max(0, expireAt - nowTs)
  };
}

function buildExpiredResult(lockDoc, tournament) {
  const ownerId = String((lockDoc && lockDoc.ownerId) || '').trim();
  return {
    ok: false,
    state: 'expired',
    ownerId,
    ownerName: resolveOwnerName(tournament, ownerId, lockDoc && lockDoc.ownerName),
    expireAt: Number(lockDoc && lockDoc.expireAt) || 0,
    remainingMs: 0
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = normalizeAction(event && event.action);
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const roundIndex = Number(event && event.roundIndex);
  const matchIndex = Number(event && event.matchIndex);
  const force = event && event.force === true;

  if (!action) throw new Error('缺少 action');
  if (!tournamentId) throw new Error('缺少 tournamentId');
  if (!Number.isFinite(roundIndex) || roundIndex < 0) throw new Error('roundIndex 不合法');
  if (!Number.isFinite(matchIndex) || matchIndex < 0) throw new Error('matchIndex 不合法');

  await ensureScoreLocksCollection();
  const lockId = buildLockId(tournamentId, roundIndex, matchIndex);

  try {
    return await db.runTransaction(async (transaction) => {
      const tRes = await transaction.collection('tournaments').doc(tournamentId).get();
      const tournament = common.assertTournamentExists(tRes.data);
      const admin = isAdmin(tournament, OPENID);
      if (!canUseLock(tournament, OPENID)) {
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
      const expireAt = Number(lockDoc && lockDoc.expireAt) || 0;
      const expired = !lockDoc || expireAt <= nowTs;
      const sameOwner = !!(lockDoc && String(lockDoc.ownerId || '') === String(OPENID || ''));

      if (action === 'status') {
        if (!lockDoc || expired) {
          return { ok: true, state: 'idle', ownerId: '', ownerName: '', expireAt: 0, remainingMs: 0 };
        }
        if (sameOwner) {
          return {
            ok: true,
            state: 'acquired',
            ownerId: String(OPENID || ''),
            ownerName: resolveOwnerName(tournament, OPENID, lockDoc.ownerName),
            expireAt,
            remainingMs: Math.max(0, expireAt - nowTs)
          };
        }
        return buildOccupiedResult(lockDoc, nowTs, tournament);
      }

      if (action === 'acquire') {
        if (lockDoc && !expired && !sameOwner && !(force && admin)) {
          return buildOccupiedResult(lockDoc, nowTs, tournament);
        }

        const ownerId = String(OPENID || '');
        const ownerName = resolveOwnerName(tournament, ownerId);
        const nextExpireAt = nowTs + LOCK_TTL_MS;
        await transaction.collection('score_locks').doc(lockId).set({
          data: {
            _id: lockId,
            tournamentId,
            roundIndex,
            matchIndex,
            ownerId,
            ownerName,
            expireAt: nextExpireAt,
            updatedAt: db.serverDate()
          }
        });
        return {
          ok: true,
          state: 'acquired',
          ownerId,
          ownerName,
          expireAt: nextExpireAt,
          remainingMs: LOCK_TTL_MS
        };
      }

      if (action === 'heartbeat') {
        if (!lockDoc || expired) {
          return buildExpiredResult(lockDoc, tournament);
        }
        if (!sameOwner && !(force && admin)) {
          return buildOccupiedResult(lockDoc, nowTs, tournament);
        }
        const ownerId = sameOwner ? String(lockDoc.ownerId || '') : String(OPENID || '');
        const ownerName = resolveOwnerName(tournament, ownerId, lockDoc.ownerName);
        const nextExpireAt = nowTs + LOCK_TTL_MS;
        await transaction.collection('score_locks').doc(lockId).set({
          data: {
            ...lockDoc,
            _id: lockId,
            tournamentId,
            roundIndex,
            matchIndex,
            ownerId,
            ownerName,
            expireAt: nextExpireAt,
            updatedAt: db.serverDate()
          }
        });
        return {
          ok: true,
          state: 'acquired',
          ownerId,
          ownerName,
          expireAt: nextExpireAt,
          remainingMs: LOCK_TTL_MS
        };
      }

      if (action === 'release') {
        if (!lockDoc || expired) {
          return { ok: true, state: 'released', ownerId: '', ownerName: '', expireAt: 0, remainingMs: 0 };
        }
        if (!sameOwner && !(force && admin)) {
          return buildOccupiedResult(lockDoc, nowTs, tournament);
        }
        await transaction.collection('score_locks').doc(lockId).remove();
        return { ok: true, state: 'released', ownerId: '', ownerName: '', expireAt: 0, remainingMs: 0 };
      }

      throw new Error('不支持的 action');
    });
  } catch (err) {
    if (common.isCollectionNotExists(err)) {
      throw new Error('数据库集合不存在，请在云开发控制台创建 tournaments 与 score_locks。');
    }
    throw common.normalizeConflictError(err, '录分锁操作失败');
  }
};
