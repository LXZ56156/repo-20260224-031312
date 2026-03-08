const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');

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

function normalizeMode(mode) {
  const v = String(mode || '').trim().toLowerCase();
  if (v === 'multi_rotate' || v === 'squad_doubles' || v === 'fixed_pair_rr') return v;
  if (v === 'mixed_fallback' || v === 'doubles') return 'multi_rotate';
  return 'multi_rotate';
}

function normalizeSquadChoice(choice) {
  const v = String(choice || '').trim().toUpperCase();
  if (v === 'A' || v === 'B') return v;
  return '';
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const tournamentId = event.tournamentId;
  const rawNickname = event.nickname;
  const avatar = String(event.avatar || '').trim();
  let gender = normalizeGender(event.gender);
  const squadChoice = normalizeSquadChoice(event && event.squadChoice);

  if (!tournamentId) return { ok: false, message: '缺少赛事ID' };

  const docRes = await db.collection('tournaments').doc(tournamentId).get();
  let t;
  try {
    t = common.assertTournamentExists(docRes.data);
    common.assertDraft(t, '非草稿阶段不可加入/修改');
  } catch (err) {
    return { ok: false, message: err.message || '加入失败' };
  }

  const players = Array.isArray(t.players) ? t.players : [];
  const mode = normalizeMode(t.mode);
  const idx = players.findIndex(p => p && p.id === openid);

  if (gender === 'unknown') {
    try {
      const profileRes = await db.collection('user_profiles').where({ openid }).limit(1).get();
      const profile = Array.isArray(profileRes.data) && profileRes.data[0] ? profileRes.data[0] : null;
      if (profile) gender = normalizeGender(profile.gender);
    } catch (_) {
      // ignore profile read errors; join logic remains available
    }
  }

  // 生成/更新昵称（允许为空：使用原名或默认）
  let nickname = normalizeName(rawNickname);

  // 若是新加入且昵称为空，则给默认名
  if (idx < 0 && !nickname) nickname = `球员${players.length + 1}`;

  // 去重
  nickname = uniqueName(nickname, players, openid) || (idx >= 0 ? String(players[idx].name || '') : `球员${players.length + 1}`);

  if (idx >= 0) {
    // 已在列表：更新昵称/头像（允许只更新其中一个）
    const nextPlayers = players.slice();
    const cur = Object.assign({}, nextPlayers[idx]);
    cur.name = nickname || cur.name;
    if (avatar) cur.avatar = avatar;
    cur.gender = gender === 'unknown' ? normalizeGender(cur.gender) : gender;
    if (mode === 'squad_doubles') {
      const nextSquad = squadChoice || normalizeSquadChoice(cur.squad) || 'A';
      cur.squad = nextSquad;
    }
    nextPlayers[idx] = cur;
    const nextPlayerIds = Array.from(new Set(nextPlayers.map((item) => String(item && item.id || '').trim()).filter(Boolean)));

    const up = await db.collection('tournaments')
      .where({ _id: tournamentId, version: t.version })
      .update({
        data: {
          players: nextPlayers,
          playerIds: nextPlayerIds,
          version: _.inc(1),
          updatedAt: db.serverDate()
        }
      });

    try {
      common.assertOptimisticUpdate(up, '并发冲突，请重试');
    } catch (_) {
      return { ok: false, message: '并发冲突，请重试' };
    }
    return { ok: true, updated: true, player: cur };
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

  const res = await db.collection('tournaments')
    .where({ _id: tournamentId, version: t.version })
    .update({
      data: {
        players: nextPlayers,
        playerIds: nextPlayerIds,
        version: _.inc(1),
        updatedAt: db.serverDate()
      }
    });

  try {
    common.assertOptimisticUpdate(res, '并发冲突，请重试');
  } catch (_) {
    return { ok: false, message: '并发冲突，请重试' };
  }

  return { ok: true, added: true, player };
};
