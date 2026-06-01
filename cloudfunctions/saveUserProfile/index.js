const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const common = require('./lib/common');
const _ = db.command;
const AVATAR_SYNC_PAGE_SIZE = 100;
const AVATAR_SYNC_QUERY_CAP = 1000;

function normalizeGender(gender) {
  const v = String(gender || '').trim().toLowerCase();
  if (v === 'male' || v === 'female') return v;
  return 'unknown';
}

function normalizeAvatar(avatar) {
  const value = String(avatar || '').trim();
  if (!value) return '';
  if (/^(?:wxfile:\/\/|file:\/\/|blob:|https?:\/\/tmp(?:\/|$)|\/?tmp\/)/i.test(value)) return '';
  if (value.startsWith('cloud://') || /^https?:\/\//i.test(value)) return value;
  return '';
}

async function ensureCollection(name) {
  await common.ensureCollection(db, name);
}

function isUserPlayerRef(player, openid) {
  if (!player || typeof player !== 'object') return false;
  const id = String((player.id || player.playerId || player._id) || '').trim();
  if (id !== String(openid || '').trim()) return false;
  const type = String(player.type || '').trim().toLowerCase();
  return type !== 'guest';
}

function syncAvatarInPlayerRef(player, openid, avatar) {
  if (!player || typeof player !== 'object') return player;
  if (!isUserPlayerRef(player, openid)) return player;
  const current = String((player.avatar || player.avatarUrl) || '').trim();
  if (current === avatar) return player;
  return { ...player, avatar };
}

function syncAvatarInTournament(tournament, openid, avatar) {
  if (!tournament || typeof tournament !== 'object') return { changed: false, data: null };
  const status = String(tournament.status || '').trim().toLowerCase();
  if (status !== 'draft' && status !== 'running') return { changed: false, data: null };

  let changed = false;
  const players = (Array.isArray(tournament.players) ? tournament.players : []).map((player) => {
    const next = syncAvatarInPlayerRef(player, openid, avatar);
    if (next !== player) changed = true;
    return next;
  });

  const rounds = (Array.isArray(tournament.rounds) ? tournament.rounds : []).map((round) => {
    let roundChanged = false;
    const matches = (Array.isArray(round && round.matches) ? round.matches : []).map((match) => {
      let matchChanged = false;
      const teamA = (Array.isArray(match && match.teamA) ? match.teamA : []).map((player) => {
        const next = syncAvatarInPlayerRef(player, openid, avatar);
        if (next !== player) matchChanged = true;
        return next;
      });
      const teamB = (Array.isArray(match && match.teamB) ? match.teamB : []).map((player) => {
        const next = syncAvatarInPlayerRef(player, openid, avatar);
        if (next !== player) matchChanged = true;
        return next;
      });
      if (!matchChanged) return match;
      roundChanged = true;
      changed = true;
      return { ...match, teamA, teamB };
    });
    const restPlayers = (Array.isArray(round && round.restPlayers) ? round.restPlayers : []).map((player) => {
      const next = syncAvatarInPlayerRef(player, openid, avatar);
      if (next !== player) {
        roundChanged = true;
        changed = true;
      }
      return next;
    });
    if (!roundChanged) return round;
    return { ...round, matches, restPlayers };
  });

  if (!changed) return { changed: false, data: null };
  return {
    changed: true,
    data: common.assertNoReservedRootKeys({
      players,
      rounds,
      updatedAt: db.serverDate(),
      version: _.inc(1)
    }, ['_id'], '资料头像同步赛事数据')
  };
}

async function getAvatarSyncTournamentPage(where, skip, limit) {
  let query = db.collection('tournaments').where(where);
  if (query && typeof query.skip === 'function') query = query.skip(skip);
  if (query && typeof query.limit === 'function') query = query.limit(limit);
  const res = await query.get();
  return Array.isArray(res && res.data) ? res.data : [];
}

async function listAvatarSyncTournaments(openid) {
  const userId = String(openid || '').trim();
  if (!userId || !db || !_) return { list: [], truncated: false };
  const playerIdsQuery = typeof _.all === 'function' ? _.all([userId]) : userId;
  const where = {
    status: _.in(['draft', 'running']),
    playerIds: playerIdsQuery
  };

  let list = [];
  let skip = 0;
  let truncated = false;
  try {
    while (list.length < AVATAR_SYNC_QUERY_CAP) {
      const remaining = AVATAR_SYNC_QUERY_CAP - list.length;
      const pageSize = Math.min(AVATAR_SYNC_PAGE_SIZE, remaining);
      const page = await getAvatarSyncTournamentPage(where, skip, pageSize);
      list.push(...page);
      if (page.length < pageSize) break;
      skip += page.length;
      if (list.length >= AVATAR_SYNC_QUERY_CAP) {
        const probe = await getAvatarSyncTournamentPage(where, skip, 1);
        truncated = probe.length > 0;
        break;
      }
    }
  } catch (_) {
    return { list: [], truncated: false };
  }
  return { list, truncated };
}

async function syncAvatarToTournaments(openid, avatar) {
  const userId = String(openid || '').trim();
  const avatarValue = String(avatar || '').trim();
  if (!userId || !avatarValue || !db || !_) return { synced: 0, truncated: false };
  const queryResult = await listAvatarSyncTournaments(userId);
  const list = queryResult.list;

  let synced = 0;
  const tournaments = db.collection('tournaments');
  for (const tournament of list) {
    let current = tournament;
    const tournamentId = String(tournament && tournament._id || '').trim();
    if (!tournamentId) continue;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const next = syncAvatarInTournament(current, userId, avatarValue);
      if (!next.changed || !next.data) break;
      const currentVersion = Number(current && current.version);
      const query = Number.isFinite(currentVersion)
        ? { _id: tournamentId, version: currentVersion }
        : { _id: tournamentId };
      const updateRes = await tournaments.where(query).update({ data: next.data });
      const updated = Number((updateRes && updateRes.stats && updateRes.stats.updated) || updateRes && updateRes.updated || 0);
      if (updated > 0) {
        synced += 1;
        break;
      }
      if (attempt >= 1) break;
      try {
        const refetch = await tournaments.doc(tournamentId).get();
        current = refetch && refetch.data ? refetch.data : null;
      } catch (_) {
        current = null;
      }
      if (!current) break;
    }
  }
  return { synced, truncated: queryResult.truncated };
}

async function findProfile(reader, openid) {
  const res = await reader.collection('user_profiles').where({ openid }).limit(1).get();
  return Array.isArray(res && res.data) && res.data[0] ? res.data[0] : null;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  const nickname = String(event && event.nickname || '').trim();
  const rawAvatar = String(event && event.avatar || '').trim();
  const avatar = normalizeAvatar(rawAvatar);
  const gender = normalizeGender(event && event.gender);
  if (!nickname) {
    return common.failResult('PROFILE_NICKNAME_REQUIRED', '昵称不能为空', {
      traceId,
      state: 'invalid',
      ...(clientRequestId ? { clientRequestId } : {})
    });
  }
  if (gender === 'unknown') {
    return common.failResult('PROFILE_GENDER_REQUIRED', '性别不能为空', {
      traceId,
      state: 'invalid',
      ...(clientRequestId ? { clientRequestId } : {})
    });
  }
  if (rawAvatar && !avatar) {
    return common.failResult('PROFILE_AVATAR_INVALID', '头像地址无效，请重新上传', {
      traceId,
      state: 'invalid',
      ...(clientRequestId ? { clientRequestId } : {})
    });
  }

  await ensureCollection('user_profiles');
  if (clientRequestId) {
    await common.ensureCollection(db, common.CLIENT_REQUEST_LOG_COLLECTION);
  }
  const now = db.serverDate();
  const requestLogOptions = {
    scope: 'save_user_profile',
    subjectKey: `profile:${OPENID}`,
    operatorOpenId: OPENID,
    clientRequestId
  };

  const buildProfileSavedResult = async (meta = {}) => {
    const avatarToSync = String(meta.avatarToSync || '').trim();
    const syncResult = await syncAvatarToTournaments(OPENID, avatarToSync);
    const syncedTournamentCount = Number(syncResult && syncResult.synced) || 0;
    const syncTruncated = !!(syncResult && syncResult.truncated);
    return common.okResult('PROFILE_SAVED', '已保存资料', {
      traceId,
      state: meta.deduped ? 'deduped' : 'updated',
      ...(meta.deduped ? { deduped: true } : {}),
      ...(clientRequestId ? { clientRequestId } : {}),
      profileId: meta.profileId,
      syncedTournamentCount,
      syncTruncated
    });
  };

  try {
    const txResult = await common.runTransactionCompat(db, async (transaction) => {
      const doc = await findProfile(transaction, OPENID);
      if (clientRequestId) {
        const requestLog = await common.getClientRequestLog(transaction, requestLogOptions);
        if (common.isSuccessfulClientRequestLog(requestLog)) {
          return {
            deduped: true,
            profileId: String(requestLog.resourceId || (doc && doc._id) || '').trim(),
            avatarToSync: String((doc && doc.avatar) || avatar || '').trim()
          };
        }
      }

      const col = transaction.collection('user_profiles');
      if (!doc) {
        const addData = {
          openid: OPENID,
          nickname,
          avatar,
          gender,
          createdAt: now,
          updatedAt: now
        };
        if (clientRequestId) addData.lastClientRequestId = clientRequestId;
        const addRes = await col.add({
          data: common.assertNoReservedRootKeys(addData, ['_id'], '用户资料新增数据')
        });
        const profileId = String(addRes && addRes._id || '').trim();
        if (clientRequestId) {
          await common.upsertClientRequestLog(transaction, db, {
            ...requestLogOptions,
            status: 'succeeded',
            resourceType: 'user_profile',
            resourceId: profileId,
            responseCode: 'PROFILE_SAVED',
            responseState: 'updated'
          });
        }
        return { deduped: false, profileId, avatarToSync: avatar };
      }

      const updateData = {
        nickname,
        avatar,
        gender,
        updatedAt: now
      };
      if (clientRequestId) updateData.lastClientRequestId = clientRequestId;
      await col.doc(doc._id).update({
        data: common.assertNoReservedRootKeys(updateData, ['_id'], '用户资料更新数据')
      });
      const profileId = String(doc._id || '').trim();
      if (clientRequestId) {
        await common.upsertClientRequestLog(transaction, db, {
          ...requestLogOptions,
          status: 'succeeded',
          resourceType: 'user_profile',
          resourceId: profileId,
          responseCode: 'PROFILE_SAVED',
          responseState: 'updated'
        });
      }
      return { deduped: false, profileId, avatarToSync: avatar };
    });
    return buildProfileSavedResult(txResult);
  } catch (err) {
    if (clientRequestId) {
      const requestLog = await common.getClientRequestLog(db, requestLogOptions);
      if (common.isSuccessfulClientRequestLog(requestLog)) {
        const profileId = String(requestLog.resourceId || '').trim();
        let doc = null;
        try {
          doc = await findProfile(db, OPENID);
        } catch (_) {
          doc = null;
        }
        return buildProfileSavedResult({
          deduped: true,
          profileId: profileId || String((doc && doc._id) || '').trim(),
          avatarToSync: String((doc && doc.avatar) || avatar || '').trim()
        });
      }
    }
    throw err;
  }
};
