const modeHelper = require('./mode');
const playerUtils = require('./playerUtils');
const scoreUtils = require('./scoreUtils');

const safePlayerName = playerUtils.safePlayerName;

function normalizePlayer(p) {
  if (!p) return p;
  if (typeof p === 'string') {
    const idRaw = String(p || '').trim();
    const alnum = idRaw.replace(/[^0-9a-zA-Z]/g, '');
    const suffix = (alnum.slice(-4) || idRaw.slice(-4) || '').trim();
    return { id: idRaw, name: suffix || '匿名', gender: 'unknown' };
  }
  const genderRaw = String(p.gender || '').trim().toLowerCase();
  const gender = (genderRaw === 'male' || genderRaw === 'female') ? genderRaw : 'unknown';
  return { ...p, id: String(p.id || p.playerId || ''), name: safePlayerName(p), gender };
}

function normalizeTournament(t) {
  if (!t) return t;
  const players = Array.isArray(t.players) ? t.players.map(normalizePlayer) : [];
  const playerMap = {};
  for (const p of players) playerMap[p.id] = p;

  const normalizePlayerRef = (x) => {
    if (!x) return x;
    if (typeof x === 'string') return playerMap[x] ? playerMap[x] : normalizePlayer(x);
    const id = String(x.id || x.playerId || '');
    const base = playerMap[id] || {};
    return { ...x, ...base, id, name: safePlayerName({ ...base, ...x, id }) };
  };

  const rounds = Array.isArray(t.rounds) ? t.rounds.map(r => ({
    ...r,
    matches: Array.isArray(r.matches) ? r.matches.map(m => ({
      ...(() => {
        // 先复制 match，再做比分迁移（match.score 可能为空，但 match 顶层有 legacy 字段）
        const mm = { ...m };
        const normalizedScore = scoreUtils.normalizeScoreObject(mm);
        if (normalizedScore) mm.score = normalizedScore;
        return mm;
      })(),
      teamA: Array.isArray(m.teamA) ? m.teamA.map(normalizePlayerRef) : [],
      teamB: Array.isArray(m.teamB) ? m.teamB.map(normalizePlayerRef) : []
    })) : [],
    restPlayers: Array.isArray(r.restPlayers) ? r.restPlayers.map(normalizePlayerRef) : []
  })) : [];

  const rankings = Array.isArray(t.rankings) ? t.rankings.map(r => {
    const p = playerMap[String(r.playerId || r.id || '')];
    const name = (p && p.name) ? p.name : safePlayerName(r);
    return { ...r, name };
  }) : [];

  const mode = modeHelper.normalizeMode(t.mode);
  return { ...t, mode, players, rounds, rankings };
}

module.exports = {
  safePlayerName,
  normalizeTournament,
  normalizePlayer
};
