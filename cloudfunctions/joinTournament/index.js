const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const common = require('./lib/common');
const modeHelper = require('./lib/mode');

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

function fail(traceId, code, message, extra = {}) {
  return common.failResult(code || 'JOIN_FAILED', message || '加入失败', {
    traceId,
    ...extra
  });
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  const tournamentId = event.tournamentId;
  console.info('[joinTournament]', traceId || '-', String(tournamentId || '').trim() || '-', openid || '-');
  const rawNickname = event.nickname;
  let avatar = normalizeAvatar(event.avatar);
  let gender = normalizeGender(event.gender);
  const squadChoice = normalizeSquadChoice(event && event.squadChoice);

  if (!tournamentId) return fail(traceId, 'TOURNAMENT_ID_REQUIRED', '缺少赛事ID', {
    state: 'invalid',
    clientRequestId
  });

  // 在事务外预读 profile，减少事务内锁范围
  let profileData = null;
  try {
    const profileRes = await db.collection('user_profiles').where({ openid }).limit(1).get();
    profileData = Array.isArray(profileRes.data) && profileRes.data[0] ? profileRes.data[0] : null;
  } catch (_) {
    // ignore profile read errors; join logic remains available
  }

  try {
    return await db.runTransaction(async (transaction) => {
      let t;
      try {
        const docRes = await transaction.collection('tournaments').doc(tournamentId).get();
        t = docRes.data;
      } catch (getErr) {
        if (common.isDocNotExists(getErr)) {
          return fail(traceId, 'TOURNAMENT_NOT_FOUND', '赛事不存在', {
            state: 'not_found',
            clientRequestId
          });
        }
        throw getErr;
      }
      if (!t) return fail(traceId, 'TOURNAMENT_NOT_FOUND', '赛事不存在', {
        state: 'not_found',
        clientRequestId
      });
      if (String(t.status || '') !== 'draft') {
        return fail(traceId, 'JOIN_DRAFT_ONLY', '非草稿阶段不可加入/修改', {
          state: 'forbidden',
          clientRequestId
        });
      }

      const players = Array.isArray(t.players) ? t.players : [];
      const mode = modeHelper.normalizeMode(t.mode);
      const idx = players.findIndex(p => p && p.id === openid);
      const currentPlayer = idx >= 0 ? (players[idx] || {}) : null;

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
        return fail(traceId, 'PROFILE_MINIMUM_REQUIRED', `请先完善${missingFields.join('、')}后再加入比赛`, {
          state: 'invalid',
          clientRequestId
        });
      }

      // 去重
      nickname = uniqueName(nickname, players, openid) || (idx >= 0 ? String(players[idx].name || '') : '');
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
          return common.okResult('JOIN_DEDUPED', '参赛信息已同步', {
            traceId,
            state: 'deduped',
            deduped: true,
            clientRequestId,
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

        return common.okResult('JOIN_UPDATED', '已更新参赛信息', {
          traceId,
          state: 'updated',
          updated: true,
          clientRequestId,
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

      return common.okResult('JOINED', '已加入比赛', {
        traceId,
        state: 'joined',
        added: true,
        clientRequestId,
        version: nextVersion,
        player
      });
    });
  } catch (err) {
    if (common.isCollectionNotExists(err)) {
      throw new Error('数据库集合 tournaments 不存在：请在云开发控制台创建 tournaments 后再试。');
    }
    if (common.isDocNotExists(err)) {
      return fail(traceId, 'TOURNAMENT_NOT_FOUND', '赛事不存在', {
        state: 'not_found',
        clientRequestId
      });
    }
    if (common.isConflictError(err)) {
      return fail(traceId, 'VERSION_CONFLICT', '并发冲突，请重试', {
        state: 'conflict',
        clientRequestId
      });
    }
    throw common.normalizeConflictError(err, '加入比赛失败');
  }
};
