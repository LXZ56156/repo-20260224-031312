const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');

function extractScorePairAny(obj) {
  if (!obj) return { a: NaN, b: NaN };
  const isPlain = (v) => (typeof v === 'number' || typeof v === 'string');
  const aRaw = (obj.teamAScore ?? obj.scoreA ?? obj.a ?? obj.left ?? (isPlain(obj.teamA) ? obj.teamA : undefined));
  const bRaw = (obj.teamBScore ?? obj.scoreB ?? obj.b ?? obj.right ?? (isPlain(obj.teamB) ? obj.teamB : undefined));
  const a = Number(aRaw);
  const b = Number(bRaw);
  return { a, b };
}

function extractId(p) {
  if (!p) return '';
  if (typeof p === 'string') return p;
  return String(p.id || '');
}

function safePlayerName(p) {
  const raw = p && (p.name || p.nickname || p.nickName || p.displayName);
  const name = String(raw || '').trim();
  if (name) return name;

  const idRaw = String(extractId(p) || '').trim();
  const alnum = idRaw.replace(/[^0-9a-zA-Z]/g, '');
  const suffix = (alnum.slice(-4) || idRaw.slice(-4) || '').trim();
  return suffix || '匿名';
}

function computeRankings(t) {
  const players = Array.isArray(t.players) ? t.players : [];
  const stats = {};

  for (const p of players) {
    const pid = extractId(p);
    if (!pid) continue;
    stats[pid] = {
      playerId: pid,
      name: safePlayerName(p),
      wins: 0,
      losses: 0,
      played: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0
    };
  }

  for (const r of (t.rounds || [])) {
    for (const m of (r.matches || [])) {
      if (m.status !== 'finished') continue;
      const sp = extractScorePairAny(m.score || m);
      const a = sp.a;
      const b = sp.b;
      if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;

      const teamA = (m.teamA || []).map(extractId).filter(Boolean);
      const teamB = (m.teamB || []).map(extractId).filter(Boolean);
      const aWin = a > b;
      const winTeam = aWin ? teamA : teamB;
      const loseTeam = aWin ? teamB : teamA;
      const winScore = aWin ? a : b;
      const loseScore = aWin ? b : a;

      for (const pid of winTeam) {
        if (!stats[pid]) continue;
        stats[pid].wins += 1;
        stats[pid].played += 1;
        stats[pid].pointsFor += winScore;
        stats[pid].pointsAgainst += loseScore;
        stats[pid].pointDiff += (winScore - loseScore);
      }
      for (const pid of loseTeam) {
        if (!stats[pid]) continue;
        stats[pid].losses += 1;
        stats[pid].played += 1;
        stats[pid].pointsFor += loseScore;
        stats[pid].pointsAgainst += winScore;
        stats[pid].pointDiff += (loseScore - winScore);
      }
    }
  }

  const list = Object.values(stats);
  list.sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    if (y.pointDiff !== x.pointDiff) return y.pointDiff - x.pointDiff;
    if (y.pointsFor !== x.pointsFor) return y.pointsFor - x.pointsFor;
    return String(x.name || '').localeCompare(String(y.name || ''));
  });
  return list;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { tournamentId } = event || {};
  if (!tournamentId) throw new Error('missing tournamentId');

  try {
    const docRes = await db.collection('tournaments').doc(tournamentId).get();
    const t = common.assertTournamentExists(docRes.data);
    common.assertCreator(t, OPENID, 'no permission');

    const oldVersion = Number(t.version) || 1;
    const rankings = computeRankings(t);
    const updRes = await db.collection('tournaments')
      .where({ _id: tournamentId, version: oldVersion })
      .update({
        data: {
          rankings,
          updatedAt: db.serverDate(),
          version: _.inc(1)
        }
      });

    common.assertOptimisticUpdate(updRes, '写入冲突：请刷新后重试');
    return { ok: true, rankingsCount: rankings.length };
  } catch (err) {
    throw common.normalizeConflictError(err, '重算排名失败');
  }
};
