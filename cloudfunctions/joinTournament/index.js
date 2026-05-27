const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const common = require('./lib/common');
const modeHelper = require('./lib/mode');
const shareActivity = require('./lib/share-activity');

function normalizeName(name) {
  let s = String(name || '').replace(/[\r\n\t]+/g, ' ').trim();
  // 去除多余空格
  s = s.replace(/\s{2,}/g, ' ');
  // 过滤常见占位昵称
  if (s === '微信用户') return '';
  // 限长
  if (s.length > 20) s = s.slice(0, 20);
  return s;
}

function uniqueName(base, players, selfId) {
  const exists = (n) => players.some(p => p && p.id !== selfId && String(p.name) === String(n));
  if (!base) return '';
  if (!exists(base)) return base;
  for (let i = 2; i <= 99; i++) {
    const cand = `${base}${i}`;
    if (!exists(cand)) return cand;
  }
  return `${base}${Date.now() % 1000}`;
}

function normalizeGender(gender) {
  const v = String(gender || '').trim().toLowerCase();
  if (v === 'male' || v === 'female') return v;
  return 'unknown';
}

function normalizeSquadChoice(choice) {
  const v = String(choice || '').trim().toUpperCase();
  if (v === 'A' || v === 'B') return v;
  return '';
}

function normalizeAvatar(avatar) {
  return String(avatar || '').trim();
}

function normalizeAction(action) {
  const value = String(action || '').trim().toLowerCase();
  if (value === 'profile_update') return 'profile_update';
  return 'join';
}

function isGuestPlayer(player) {
  if (!player || typeof player !== 'object') return false;
  const type = String(player.type || '').trim().toLowerCase();
  if (type === 'guest') return true;
  const id = String(player.id || '').trim().toLowerCase();
  return id.startsWith('guest_');
}

function resolveProfileNickName(profile) {
  return normalizeName(
    (profile && (profile.nickName || profile.nickname || profile.name || profile.displayName)) || ''
  );
}

function listMissingProfileFields(profile) {
  const missing = [];
  if (!String(profile && profile.nickname || '').trim()) missing.push('昵称');
  if (!String(profile && profile.avatar || '').trim()) missing.push('头像');
  if (normalizeGender(profile && profile.gender) === 'unknown') missing.push('性别');
  return missing;
}

function rewritePlayerReference(value, oldId, nextPlayer) {
  if (typeof value === 'string') {
    return value === oldId ? nextPlayer.id : value;
  }
  if (!value || typeof value !== 'object') return value;
  const currentId = String((value.id || value.playerId || value._id) || '').trim();
  if (currentId !== oldId) return value;
  const rewritten = { ...value, id: nextPlayer.id };
  if (Object.prototype.hasOwnProperty.call(rewritten, 'playerId')) rewritten.playerId = nextPlayer.id;
  rewritten.name = nextPlayer.name;
  rewritten.avatar = nextPlayer.avatar;
  rewritten.gender = nextPlayer.gender;
  rewritten.type = 'user';
  if (Object.prototype.hasOwnProperty.call(rewritten, 'squad') || nextPlayer.squad) {
    rewritten.squad = nextPlayer.squad || '';
  }
  return rewritten;
}

function replaceIdList(ids, oldId, nextId) {
  return Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => (String(id || '').trim() === oldId ? nextId : String(id || '').trim())).filter(Boolean)));
}

function buildPairTeamName(team, players) {
  if (!team || typeof team !== 'object') return '';
  const playerMap = Object.fromEntries((Array.isArray(players) ? players : []).map((player) => [String(player && player.id || '').trim(), player]));
  const ids = Array.isArray(team.playerIds) ? team.playerIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  const names = ids.map((id) => modeHelper.safePlayerName(playerMap[id] || { id })).filter(Boolean);
  return names.length ? names.join(' / ') : String(team.name || '').trim();
}

function rewriteClaimedGuestTournament(tournament, oldId, nextPlayer) {
  const players = (Array.isArray(tournament && tournament.players) ? tournament.players : []).map((player) => {
    if (!player || typeof player !== 'object') return player;
    if (String(player.id || '').trim() !== oldId) return player;
    return {
      ...player,
      id: nextPlayer.id,
      name: nextPlayer.name,
      avatar: nextPlayer.avatar,
      gender: nextPlayer.gender,
      type: 'user',
      squad: nextPlayer.squad || ''
    };
  });

  const playerIds = replaceIdList(tournament && tournament.playerIds, oldId, nextPlayer.id);
  const pairTeams = (Array.isArray(tournament && tournament.pairTeams) ? tournament.pairTeams : []).map((team) => {
    if (!team || typeof team !== 'object') return team;
    const nextPlayerIds = replaceIdList(team.playerIds, oldId, nextPlayer.id);
    const nextTeam = { ...team, playerIds: nextPlayerIds };
    const nextName = buildPairTeamName(nextTeam, players);
    if (nextName) nextTeam.name = nextName;
    return nextTeam;
  });
  const rounds = (Array.isArray(tournament && tournament.rounds) ? tournament.rounds : []).map((round) => ({
    ...round,
    matches: (Array.isArray(round && round.matches) ? round.matches : []).map((match) => ({
      ...match,
      teamA: (Array.isArray(match && match.teamA) ? match.teamA : []).map((player) => rewritePlayerReference(player, oldId, nextPlayer)),
      teamB: (Array.isArray(match && match.teamB) ? match.teamB : []).map((player) => rewritePlayerReference(player, oldId, nextPlayer))
    })),
    restPlayers: (Array.isArray(round && round.restPlayers) ? round.restPlayers : []).map((player) => rewritePlayerReference(player, oldId, nextPlayer))
  }));
  const rankings = modeHelper.buildInitialRankings(tournament && tournament.mode, players, pairTeams);

  return { players, playerIds, pairTeams, rounds, rankings };
}

function buildResultExtra(traceId, clientRequestId, extra = {}) {
  const output = {
    traceId,
    ...((extra && typeof extra === 'object' && !Array.isArray(extra)) ? extra : {})
  };
  const requestId = String(clientRequestId || output.clientRequestId || '').trim();
  if (requestId) {
    output.clientRequestId = requestId;
  } else if (Object.prototype.hasOwnProperty.call(output, 'clientRequestId')) {
    delete output.clientRequestId;
  }
  return output;
}

function ok(traceId, clientRequestId, code, message, extra = {}) {
  return common.okResult(code || 'OK', message || '操作成功', buildResultExtra(traceId, clientRequestId, extra));
}

function fail(traceId, clientRequestId, code, message, extra = {}) {
  return common.failResult(code || 'JOIN_FAILED', message || '加入失败', {
    ...buildResultExtra(traceId, clientRequestId, extra)
  });
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  const action = normalizeAction(event && event.action);
  const tournamentId = event.tournamentId;
  console.info('[joinTournament]', traceId || '-', String(tournamentId || '').trim() || '-', openid || '-');
  const rawNickname = event.nickname;
  let avatar = normalizeAvatar(event.avatar);
  let gender = normalizeGender(event.gender);
  const squadChoice = normalizeSquadChoice(event && event.squadChoice);

  if (!tournamentId) return fail(traceId, clientRequestId, 'TOURNAMENT_ID_REQUIRED', '缺少赛事ID', {
    state: 'invalid'
  });

  // 在事务外预读 profile，减少事务内锁范围
  let profileData = null;
  try {
    const profileRes = await db.collection('user_profiles').where({ openid }).limit(1).get();
    profileData = Array.isArray(profileRes.data) && profileRes.data[0] ? profileRes.data[0] : null;
  } catch (_) {
    // ignore profile read errors; join logic remains available
  }

  let shareUpdateTournament = null;
  try {
    const result = await db.runTransaction(async (transaction) => {
      let t;
      try {
        const docRes = await transaction.collection('tournaments').doc(tournamentId).get();
        t = docRes.data;
      } catch (getErr) {
        if (common.isDocNotExists(getErr)) {
          return fail(traceId, clientRequestId, 'TOURNAMENT_NOT_FOUND', '赛事不存在', {
            state: 'not_found'
          });
        }
        throw getErr;
      }
      if (!t) return fail(traceId, clientRequestId, 'TOURNAMENT_NOT_FOUND', '赛事不存在', {
        state: 'not_found'
      });
      if (String(t.status || '') !== 'draft') {
        return fail(traceId, clientRequestId, 'JOIN_DRAFT_ONLY', '非草稿阶段不可加入/修改', {
          state: 'forbidden'
        });
      }

      const players = Array.isArray(t.players) ? t.players : [];
      const mode = modeHelper.normalizeMode(t.mode);
      const idx = players.findIndex(p => p && p.id === openid);
      const currentPlayer = idx >= 0 ? (players[idx] || {}) : null;
      if (action === 'profile_update' && idx < 0) {
        return fail(traceId, clientRequestId, 'PLAYER_NOT_JOINED', '请先加入比赛后再更新参赛信息', {
          state: 'not_joined'
        });
      }
      const matchedGuests = idx >= 0 || action === 'profile_update'
        ? []
        : players.filter((player) => isGuestPlayer(player) && normalizeName(player && player.name) === normalizeName(rawNickname || resolveProfileNickName(profileData)));
      const claimableGuest = matchedGuests.length === 1 ? matchedGuests[0] : null;
      const claimedGuestId = claimableGuest ? String(claimableGuest.id || '').trim() : '';

      let nickname = normalizeName(rawNickname) || normalizeName(currentPlayer && currentPlayer.name);
      if (!avatar && currentPlayer) avatar = normalizeAvatar(currentPlayer.avatar || currentPlayer.avatarUrl);
      if (gender === 'unknown' && currentPlayer) gender = normalizeGender(currentPlayer.gender);

      if ((!nickname || !avatar || gender === 'unknown') && profileData) {
        if (!nickname) nickname = resolveProfileNickName(profileData);
        if (!avatar) avatar = normalizeAvatar(profileData.avatar || profileData.avatarUrl);
        if (gender === 'unknown') gender = normalizeGender(profileData.gender);
      }

      const missingFields = listMissingProfileFields({ nickname, avatar, gender });
      if (missingFields.length) {
        return fail(traceId, clientRequestId, 'PROFILE_MINIMUM_REQUIRED', `请先完善${missingFields.join('、')}后再加入比赛`, {
          state: 'invalid'
        });
      }

      const playerLimit = modeHelper.getRotationPlayerLimit(t);
      if (idx < 0 && !claimedGuestId && playerLimit > 0 && players.length >= playerLimit) {
        return fail(traceId, clientRequestId, 'PLAYER_LIMIT_REACHED', `该赛制最多 ${playerLimit} 人参赛`, {
          state: 'invalid',
          playerLimit,
          playersCount: players.length
        });
      }

      // 去重
      nickname = uniqueName(nickname, players, claimedGuestId || openid) || (idx >= 0 ? String(players[idx].name || '') : '');
      const nextVersion = (Number(t.version) || 1) + 1;

      if (idx >= 0) {
        // 已在列表：更新昵称/头像（允许只更新其中一个）
        const nextPlayers = players.slice();
        const cur = Object.assign({}, nextPlayers[idx]);
        const nextName = nickname || cur.name;
        const nextAvatar = avatar || normalizeAvatar(cur.avatar || cur.avatarUrl);
        const nextGender = gender === 'unknown' ? normalizeGender(cur.gender) : gender;
        const nextSquad = mode === 'squad_doubles'
          ? (squadChoice || normalizeSquadChoice(cur.squad) || 'A')
          : '';
        if (
          String(cur.name || '') === String(nextName || '') &&
          normalizeAvatar(cur.avatar || cur.avatarUrl) === nextAvatar &&
          normalizeGender(cur.gender) === nextGender &&
          (mode !== 'squad_doubles' || normalizeSquadChoice(cur.squad) === nextSquad)
        ) {
          shareUpdateTournament = t;
          return ok(traceId, clientRequestId, 'JOIN_DEDUPED', '参赛信息已同步', {
            state: 'deduped',
            deduped: true,
            version: Number(t.version) || 1,
            player: {
              ...cur,
              name: nextName,
              avatar: nextAvatar,
              gender: nextGender,
              squad: nextSquad
            }
          });
        }
        cur.name = nextName;
        if (nextAvatar) cur.avatar = nextAvatar;
        cur.gender = nextGender;
        if (mode === 'squad_doubles') {
          cur.squad = nextSquad;
        }
        nextPlayers[idx] = cur;
        const nextPlayerIds = Array.from(new Set(nextPlayers.map((item) => String(item && item.id || '').trim()).filter(Boolean)));

        await transaction.collection('tournaments').doc(tournamentId).update({
          data: common.assertNoReservedRootKeys({
            players: nextPlayers,
            playerIds: nextPlayerIds,
            version: nextVersion,
            updatedAt: db.serverDate()
          }, ['_id'], '赛事加入更新数据')
        });

        shareUpdateTournament = {
          ...t,
          players: nextPlayers,
          playerIds: nextPlayerIds
        };
        return ok(traceId, clientRequestId, 'JOIN_UPDATED', '已更新参赛信息', {
          state: 'updated',
          updated: true,
          version: nextVersion,
          player: cur
        });
      }

      const player = {
        id: openid,
        name: nickname,
        avatar: avatar || '',
        gender,
        squad: mode === 'squad_doubles' ? (squadChoice || 'A') : ''
      };

      if (claimableGuest && claimedGuestId) {
        const rewritten = rewriteClaimedGuestTournament(t, claimedGuestId, { ...player, type: 'user' });
        await transaction.collection('tournaments').doc(tournamentId).update({
          data: common.assertNoReservedRootKeys({
            players: rewritten.players,
            playerIds: rewritten.playerIds,
            pairTeams: rewritten.pairTeams,
            rounds: rewritten.rounds,
            rankings: rewritten.rankings,
            version: nextVersion,
            updatedAt: db.serverDate()
          }, ['_id'], '赛事认领 guest 写入数据')
        });

        shareUpdateTournament = {
          ...t,
          players: rewritten.players,
          playerIds: rewritten.playerIds,
          pairTeams: rewritten.pairTeams,
          rounds: rewritten.rounds,
          rankings: rewritten.rankings
        };
        return ok(traceId, clientRequestId, 'JOINED', '已加入比赛', {
          state: 'joined',
          added: true,
          claimed: true,
          claimedGuestId,
          version: nextVersion,
          player
        });
      }

      const nextPlayers = players.concat(player);
      const nextPlayerIds = Array.from(new Set(nextPlayers.map((item) => String(item && item.id || '').trim()).filter(Boolean)));

      await transaction.collection('tournaments').doc(tournamentId).update({
        data: common.assertNoReservedRootKeys({
          players: nextPlayers,
          playerIds: nextPlayerIds,
          version: nextVersion,
          updatedAt: db.serverDate()
        }, ['_id'], '赛事加入写入数据')
      });

      shareUpdateTournament = {
        ...t,
        players: nextPlayers,
        playerIds: nextPlayerIds
      };
      return ok(traceId, clientRequestId, 'JOINED', '已加入比赛', {
        state: 'joined',
        added: true,
        version: nextVersion,
        player
      });
    });
    if (result && result.ok && shareUpdateTournament) {
      await shareActivity.updateDraftMessageBestEffort(cloud, shareUpdateTournament, modeHelper, console, {
        db,
        source: 'joinTournament',
        tournamentId,
        traceId
      });
    }
    return result;
  } catch (err) {
    if (common.isCollectionNotExists(err)) {
      throw new Error('数据库集合 tournaments 不存在：请在云开发控制台创建 tournaments 后再试。');
    }
    if (common.isDocNotExists(err)) {
      return fail(traceId, clientRequestId, 'TOURNAMENT_NOT_FOUND', '赛事不存在', {
        state: 'not_found'
      });
    }
    if (common.isConflictError(err)) {
      return fail(traceId, clientRequestId, 'VERSION_CONFLICT', '并发冲突，请重试', {
        state: 'conflict'
      });
    }
    throw common.normalizeConflictError(err, '加入比赛失败');
  }
};
