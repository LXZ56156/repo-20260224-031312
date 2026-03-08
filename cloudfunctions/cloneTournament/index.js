const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const common = require('./lib/common');

function normalizeName(name) {
  return String(name || '').replace(/[\r\n\t]+/g, ' ').trim();
}

function toPosInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function makeGuestId(i) {
  return `guest_${Date.now()}_${i}_${Math.floor(Math.random() * 1000000)}`;
}

function copyPlayers(sourcePlayers, openid) {
  const list = Array.isArray(sourcePlayers) ? sourcePlayers : [];
  return list.map((p, idx) => {
    const raw = p || {};
    const pid = String(raw.id || '').trim();
    const name = normalizeName(raw.name || raw.nickname || raw.nickName) || `球员${idx + 1}`;
    const avatar = String(raw.avatar || raw.avatarUrl || '').trim();
    const g = String(raw.gender || '').trim().toLowerCase();
    const gender = (g === 'male' || g === 'female') ? g : 'unknown';
    const isCreator = pid === openid || (idx === 0 && !pid);
    if (isCreator) {
      return { id: openid, name, type: 'user', avatar, gender, squad: '' };
    }
    return { id: makeGuestId(idx), name, type: 'guest', avatar, gender, squad: '' };
  });
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const sourceTournamentId = String((event && event.sourceTournamentId) || '').trim();
  const renamed = normalizeName(event && event.name);

  if (!sourceTournamentId) throw new Error('缺少 sourceTournamentId');

  try {
    const docRes = await db.collection('tournaments').doc(sourceTournamentId).get();
    const source = common.assertTournamentExists(docRes && docRes.data);
    common.assertCreator(source, OPENID, '仅创建者可复制自己的赛事');

    const totalMatches = toPosInt(source.totalMatches, 0);
    const courts = toPosInt(source.courts, 0);
    const settingsConfigured = Boolean(source.settingsConfigured) && totalMatches >= 1 && courts >= 1;
    const players = copyPlayers(source.players, OPENID);
    const playerIds = Array.from(new Set(players.map((item) => String(item && item.id || '').trim()).filter(Boolean)));

    const nextName = renamed || `${normalizeName(source.name) || '比赛'}（副本）`;
    const rules = source && source.rules && typeof source.rules === 'object'
      ? source.rules
      : { gamesPerMatch: 1, pointsPerGame: 21, endCondition: { type: 'total_matches', target: 1 }, unfinishedPolicy: 'admin_decide' };
    const modeRaw = String(source.mode || '').trim().toLowerCase();
    let mode = 'multi_rotate';
    if (modeRaw === 'multi_rotate' || modeRaw === 'squad_doubles' || modeRaw === 'fixed_pair_rr') mode = modeRaw;
    if (modeRaw === 'mixed_fallback' || modeRaw === 'doubles') mode = 'multi_rotate';
    const allowOpenTeam = source.allowOpenTeam === true;

    const addRes = await db.collection('tournaments').add({
      data: {
        name: nextName,
        status: 'draft',
        creatorId: OPENID,
        mode,
        allowOpenTeam,
        refereeId: '',
        settingsConfigured,
        totalMatches,
        courts,
        rules,
        players,
        playerIds,
        pairTeams: [],
        rounds: [],
        rankings: [],
        scheduleSeed: null,
        fairnessScore: 0,
        fairnessJson: '',
        playerStatsJson: '',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
        version: 1
      }
    });

    return { ok: true, tournamentId: addRes._id };
  } catch (err) {
    throw common.normalizeConflictError(err, '复制赛事失败');
  }
};
