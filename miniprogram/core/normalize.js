function safePlayerName(p) {
  const raw = p && (p.name || p.nickname || p.nickName || p.displayName);
  const name = String(raw || '').trim();
  if (name) {
    // Backward兼容: old versions used "成员XXXX". For UI, strip the prefix.
    const m = name.match(/^成员([0-9a-zA-Z]{1,16})$/);
    return m ? m[1] : name;
  }

  const idRaw = String((p && (p.id || p.playerId || p._id)) || '').trim();
  // Prefer a short, stable suffix. Only keep alphanumeric to avoid "????" rendering.
  const alnum = idRaw.replace(/[^0-9a-zA-Z]/g, '');
  const suffix = (alnum.slice(-4) || idRaw.slice(-4) || '').trim();
  // Product requirement: do NOT prefix with "成员"; show only the name/suffix.
  return suffix || '匿名';
}

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

  // Backward兼容：历史版本可能把比分写在 match 顶层字段（teamAScore/scoreA/a/left 等），而不是写进 match.score。
  // 为了让页面与排名统一，只要能解析到两边比分，就迁移成标准结构：match.score = { teamA, teamB }。
  const extractScorePairAny = (obj) => {
    if (!obj) return { a: null, b: null };
    // 注意：match 本身也有 teamA/teamB（数组），不能把它当比分字段。
    // 先读取明确的 score 字段，再在最后尝试读取 scoreObj.teamA/teamB（仅当其不是数组）。
    const aRaw = (obj.teamAScore ?? obj.teamAScore1 ?? obj.teamAScore2 ?? obj.scoreA ?? obj.a ?? obj.left);
    const bRaw = (obj.teamBScore ?? obj.teamBScore1 ?? obj.teamBScore2 ?? obj.scoreB ?? obj.b ?? obj.right);
    const a = Number(aRaw);
    const b = Number(bRaw);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { a: null, b: null };
    return { a, b };
  };

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
        if (!mm.score) {
          const sp = extractScorePairAny(mm);
          if (sp.a !== null && sp.b !== null) {
            mm.score = { teamA: sp.a, teamB: sp.b };
          }
        }
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

  const modeRaw = String(t.mode || '').trim().toLowerCase();
  let mode = 'multi_rotate';
  if (modeRaw === 'squad_doubles' || modeRaw === 'fixed_pair_rr' || modeRaw === 'multi_rotate') mode = modeRaw;
  if (modeRaw === 'mixed_fallback' || modeRaw === 'doubles') mode = 'multi_rotate';
  return { ...t, mode, players, rounds, rankings };
}

module.exports = {
  safePlayerName,
  normalizeTournament,
  normalizePlayer
};
