const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const common = require('./lib/common');
const _ = db.command;

function normalizeGender(gender) {
  const v = String(gender || '').trim().toLowerCase();
  if (v === 'male' || v === 'female') return v;
  return 'unknown';
}

async function ensureCollection(name) {
  try {
    if (typeof db.createCollection === 'function') {
      await db.createCollection(name);
    }
  } catch (_) {
    // ignore
  }
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

async function syncAvatarToTournaments(openid, avatar) {
  const userId = String(openid || '').trim();
  const avatarValue = String(avatar || '').trim();
  if (!userId || !avatarValue || !db || !_) return 0;
  const playerIdsQuery = typeof _.all === 'function' ? _.all([userId]) : userId;

  let list = [];
  try {
    const res = await db.collection('tournaments').where({
      status: _.in(['draft', 'running']),
      playerIds: playerIdsQuery
    }).get();
    list = Array.isArray(res && res.data) ? res.data : [];
  } catch (_) {
    return 0;
  }

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
  return synced;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  const nickname = String(event && event.nickname || '').trim();
  const avatar = String(event && event.avatar || '').trim();
  const gender = normalizeGender(event && event.gender);
  if (!nickname) throw new Error('昵称不能为空');
  if (gender === 'unknown') throw new Error('性别不能为空');

  await ensureCollection('user_profiles');
  const col = db.collection('user_profiles');
  const now = db.serverDate();
  const findRes = await col.where({ openid: OPENID }).limit(1).get();
  const doc = Array.isArray(findRes.data) && findRes.data[0] ? findRes.data[0] : null;
  if (doc && clientRequestId && String(doc.lastClientRequestId || '').trim() === clientRequestId) {
    const syncedTournamentCount = await syncAvatarToTournaments(OPENID, String(doc.avatar || avatar || '').trim());
    return common.okResult('PROFILE_SAVED', '已保存资料', {
      traceId,
      state: 'deduped',
      deduped: true,
      ...(clientRequestId ? { clientRequestId } : {}),
      profileId: doc._id,
      syncedTournamentCount
    });
  }
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
    const syncedTournamentCount = await syncAvatarToTournaments(OPENID, avatar);
    return common.okResult('PROFILE_SAVED', '已保存资料', {
      traceId,
      state: 'updated',
      ...(clientRequestId ? { clientRequestId } : {}),
      profileId: addRes._id,
      syncedTournamentCount
    });
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
  const syncedTournamentCount = await syncAvatarToTournaments(OPENID, avatar);
  return common.okResult('PROFILE_SAVED', '已保存资料', {
    traceId,
    state: 'updated',
    ...(clientRequestId ? { clientRequestId } : {}),
    profileId: doc._id,
    syncedTournamentCount
  });
};
