const LOCK_TTL_MS = 45 * 1000;

function normalizeAction(action) {
  const value = String(action || '').trim().toLowerCase();
  if (value === 'acquire' || value === 'heartbeat' || value === 'release' || value === 'status') return value;
  return '';
}

function buildLockId(tournamentId, roundIndex, matchIndex) {
  return `${String(tournamentId || '').trim()}_${Number(roundIndex)}_${Number(matchIndex)}`;
}

function buildResponse({ ok, state, ownerId = '', ownerName = '', expireAt = 0, remainingMs = 0 }) {
  return { ok, state, ownerId, ownerName, expireAt, remainingMs };
}

function buildWritableLockDoc(ownerId, ownerName, expireAt) {
  return {
    ownerId: String(ownerId || '').trim(),
    ownerName: String(ownerName || '').trim(),
    expireAt: Number(expireAt) || 0
  };
}

function resolveLockAction(input = {}) {
  const action = normalizeAction(input.action);
  const nowTs = Number(input.nowTs) || Date.now();
  const lockDoc = input.lockDoc || null;
  const admin = input.admin === true;
  const force = input.force === true;
  const canUseLock = input.canUseLock === true;
  const tournamentStatus = String(input.tournamentStatus || '').trim();
  const matchStatus = String(input.matchStatus || '').trim();
  const openid = String(input.openid || '').trim();
  const resolveOwnerName = typeof input.resolveOwnerName === 'function'
    ? input.resolveOwnerName
    : (ownerId, fallback) => String(fallback || ownerId || '其他成员');

  if (!action) throw new Error('缺少 action');
  if (!canUseLock || (tournamentStatus !== 'running' && tournamentStatus !== 'finished')) {
    return { response: buildResponse({ ok: false, state: 'forbidden' }) };
  }
  if (!input.matchExists) throw new Error('比赛不存在');
  if (matchStatus === 'finished' || matchStatus === 'canceled') {
    return { response: buildResponse({ ok: false, state: 'finished' }) };
  }

  const expireAt = Number(lockDoc && lockDoc.expireAt) || 0;
  const expired = !lockDoc || expireAt <= nowTs;
  const sameOwner = !!(lockDoc && String(lockDoc.ownerId || '').trim() === openid);
  const lockOwnerId = String(lockDoc && lockDoc.ownerId || '').trim();
  const lockOwnerName = resolveOwnerName(lockOwnerId, lockDoc && lockDoc.ownerName);

  if (action === 'status') {
    if (!lockDoc || expired) {
      return { response: buildResponse({ ok: true, state: 'idle' }) };
    }
    if (sameOwner) {
      return {
        response: buildResponse({
          ok: true,
          state: 'acquired',
          ownerId: openid,
          ownerName: resolveOwnerName(openid, lockDoc.ownerName),
          expireAt,
          remainingMs: Math.max(0, expireAt - nowTs)
        })
      };
    }
    return {
      response: buildResponse({
        ok: false,
        state: 'occupied',
        ownerId: lockOwnerId,
        ownerName: lockOwnerName,
        expireAt,
        remainingMs: Math.max(0, expireAt - nowTs)
      })
    };
  }

  if (action === 'acquire') {
    if (lockDoc && !expired && !sameOwner && !(force && admin)) {
      return {
        response: buildResponse({
          ok: false,
          state: 'occupied',
          ownerId: lockOwnerId,
          ownerName: lockOwnerName,
          expireAt,
          remainingMs: Math.max(0, expireAt - nowTs)
        })
      };
    }

    const nextExpireAt = nowTs + LOCK_TTL_MS;
    const ownerName = resolveOwnerName(openid, input.ownerName);
    return {
      response: buildResponse({
        ok: true,
        state: 'acquired',
        ownerId: openid,
        ownerName,
        expireAt: nextExpireAt,
        remainingMs: LOCK_TTL_MS
      }),
      nextLockDoc: buildWritableLockDoc(openid, ownerName, nextExpireAt)
    };
  }

  if (action === 'heartbeat') {
    if (!lockDoc || expired) {
      return {
        response: buildResponse({
          ok: false,
          state: 'expired',
          ownerId: lockOwnerId,
          ownerName: lockOwnerName,
          expireAt,
          remainingMs: 0
        })
      };
    }
    if (!sameOwner && !(force && admin)) {
      return {
        response: buildResponse({
          ok: false,
          state: 'occupied',
          ownerId: lockOwnerId,
          ownerName: lockOwnerName,
          expireAt,
          remainingMs: Math.max(0, expireAt - nowTs)
        })
      };
    }

    const ownerId = sameOwner ? lockOwnerId : openid;
    const ownerName = resolveOwnerName(ownerId, lockDoc && lockDoc.ownerName);
    const nextExpireAt = nowTs + LOCK_TTL_MS;
    return {
      response: buildResponse({
        ok: true,
        state: 'acquired',
        ownerId,
        ownerName,
        expireAt: nextExpireAt,
        remainingMs: LOCK_TTL_MS
      }),
      nextLockDoc: buildWritableLockDoc(ownerId, ownerName, nextExpireAt)
    };
  }

  if (action === 'release') {
    if (!lockDoc || expired) {
      return { response: buildResponse({ ok: true, state: 'released' }), removeLock: true };
    }
    if (!sameOwner && !(force && admin)) {
      return {
        response: buildResponse({
          ok: false,
          state: 'occupied',
          ownerId: lockOwnerId,
          ownerName: lockOwnerName,
          expireAt,
          remainingMs: Math.max(0, expireAt - nowTs)
        })
      };
    }
    return { response: buildResponse({ ok: true, state: 'released' }), removeLock: true };
  }

  throw new Error('不支持的 action');
}

module.exports = {
  LOCK_TTL_MS,
  normalizeAction,
  buildLockId,
  buildWritableLockDoc,
  resolveLockAction
};
