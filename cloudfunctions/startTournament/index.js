const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { generateSchedule } = require('./rotation');

function isCollectionNotExists(err) {
  const msg = String(err && (err.message || err.errMsg || err));
  return msg.includes('DATABASE_COLLECTION_NOT_EXIST') || msg.includes('collection not exists') || msg.includes('ResourceNotFound') || msg.includes('-502005');
}

function safePlayerName(p) {
  const raw = p && (p.name || p.nickname || p.nickName || p.displayName);
  const name = String(raw || '').trim();
  if (name) {
    const m = name.match(/^成员([0-9a-zA-Z]{1,16})$/);
    return m ? m[1] : name;
  }
  const idRaw = String((p && (p.id || p.playerId || p._id)) || '').trim();
  const alnum = idRaw.replace(/[^0-9a-zA-Z]/g, '');
  const suffix = (alnum.slice(-4) || idRaw.slice(-4) || '').trim();
  return suffix || '匿名';
}

function idToPlayerMap(players) {
  const m = {};
  for (const p of (players || [])) {
    if (!p || !p.id) continue;
    m[p.id] = { id: p.id, name: safePlayerName(p), type: p.type || 'user' };
  }
  return m;
}

function buildInitialRankings(players) {
  return (players || []).map(p => ({
    playerId: p.id,
    name: safePlayerName(p),
    wins: 0,
    losses: 0,
    played: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDiff: 0
  }));
}

function calcMaxMatches(n) {
  const nn = Number(n) || 0;
  if (nn < 4) return 0;
  const comb4 = (nn * (nn - 1) * (nn - 2) * (nn - 3)) / 24;
  return Math.floor(comb4 * 3);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  if (!tournamentId) throw new Error('缺少 tournamentId');

  try {
    const docRes = await db.collection('tournaments').doc(tournamentId).get();
    const t = docRes.data;
    if (!t) throw new Error('赛事不存在');
    if (t.creatorId !== OPENID) throw new Error('无权限');
    if (t.status !== 'draft') throw new Error('赛事已开赛/已结束');
    if (t.settingsConfigured === false) throw new Error('请先在“赛事设置”中保存比赛参数');

    const players = Array.isArray(t.players) ? t.players : [];
    if (players.length < 4) throw new Error('参赛人数不足 4 人');
    const M = Number(t.totalMatches) || 1;
    const C = Math.max(1, Math.min(10, Number(t.courts) || 1));
    if (M < 1) throw new Error('M 必须 >= 1');
    if (C < 1) throw new Error('C 必须 >= 1');

    const maxMatches = calcMaxMatches(players.length);
    if (maxMatches > 0 && M > maxMatches) throw new Error(`总场次不能超过最大可选 ${maxMatches} 场`);

    const oldVersion = Number(t.version) || 1;
    const schedule = generateSchedule(players, M, C);
    const map = idToPlayerMap(players);

    const rounds = (schedule.rounds || []).map(r => ({
      roundIndex: r.roundIndex,
      matches: (r.matches || []).map(m => ({
        matchIndex: m.matchIndex,
        teamA: (m.teamA || []).map(id => map[id]).filter(Boolean),
        teamB: (m.teamB || []).map(id => map[id]).filter(Boolean),
        status: 'pending',
        // Avoid nested-object updates (DB SDK may dot-flatten), store flat fields.
        scoreA: null,
        scoreB: null,
        teamAScore: null,
        teamBScore: null
      })),
      restPlayers: (r.restPlayers || []).map(id => map[id]).filter(Boolean)
    }));

    const rankings = buildInitialRankings(players);

    const updRes = await db.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
      data: {
        status: 'running',
        rounds,
        rankings,
        scheduleSeed: schedule.seed,
        fairnessScore: schedule.fairnessScore,
        // Store diagnostic details as JSON strings to avoid dot-path conflicts when existing fields are null.
        fairnessJson: JSON.stringify(schedule.fairness || {}),
        playerStatsJson: JSON.stringify(schedule.playerStats || {}),
        // Clean legacy fields if they exist.
        fairness: _.remove(),
        playerStats: _.remove(),
        updatedAt: db.serverDate(),
        version: _.inc(1)
      }
    });

    if (!updRes || !updRes.stats || updRes.stats.updated === 0) {
      throw new Error('写入冲突，请刷新赛事后重试');
    }
    return { ok: true };
  } catch (err) {
    if (isCollectionNotExists(err)) {
      throw new Error('数据库集合 tournaments 不存在：请在云开发控制台（数据库 -> 创建集合）创建 tournaments 后再试。');
    }
    throw err;
  }
};
