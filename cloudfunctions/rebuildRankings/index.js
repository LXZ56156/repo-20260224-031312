const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');
const modeHelper = require('./lib/mode');
const scoreUtils = require('./lib/score');

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

function buildTeamTemplate(tournament) {
  const mode = modeHelper.normalizeMode(tournament && tournament.mode);
  if (mode === 'squad_doubles') {
    return [
      { entityId: 'A', name: 'A队' },
      { entityId: 'B', name: 'B队' }
    ];
  }
  const list = Array.isArray(tournament && tournament.pairTeams) ? tournament.pairTeams : [];
  return list.map((team, idx) => ({
    entityId: String(team && team.id || `pair_${idx}`),
    name: String(team && team.name || `第${idx + 1}队`)
  }));
}

function computeRankings(t) {
  const mode = modeHelper.normalizeMode(t && t.mode);
  if (modeHelper.isTeamMode(mode)) {
    const stats = {};
    const template = buildTeamTemplate(t);
    for (const team of template) {
      stats[team.entityId] = {
        entityType: 'team',
        entityId: team.entityId,
        playerId: team.entityId,
        name: team.name,
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
        const sp = scoreUtils.extractScorePairAny(m);
        const a = sp.a;
        const b = sp.b;
        if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;
        const unitAId = String(m.unitAId || (mode === 'squad_doubles' ? 'A' : '')).trim();
        const unitBId = String(m.unitBId || (mode === 'squad_doubles' ? 'B' : '')).trim();
        if (!unitAId || !unitBId) continue;
        if (!stats[unitAId]) {
          stats[unitAId] = {
            entityType: 'team',
            entityId: unitAId,
            playerId: unitAId,
            name: String(m.unitAName || unitAId),
            wins: 0,
            losses: 0,
            played: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            pointDiff: 0
          };
        }
        if (!stats[unitBId]) {
          stats[unitBId] = {
            entityType: 'team',
            entityId: unitBId,
            playerId: unitBId,
            name: String(m.unitBName || unitBId),
            wins: 0,
            losses: 0,
            played: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            pointDiff: 0
          };
        }
        const aWin = a > b;
        const winId = aWin ? unitAId : unitBId;
        const loseId = aWin ? unitBId : unitAId;
        const winScore = aWin ? a : b;
        const loseScore = aWin ? b : a;
        stats[winId].wins += 1;
        stats[winId].played += 1;
        stats[winId].pointsFor += winScore;
        stats[winId].pointsAgainst += loseScore;
        stats[winId].pointDiff += (winScore - loseScore);
        stats[loseId].losses += 1;
        stats[loseId].played += 1;
        stats[loseId].pointsFor += loseScore;
        stats[loseId].pointsAgainst += winScore;
        stats[loseId].pointDiff += (loseScore - winScore);
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

  const players = Array.isArray(t.players) ? t.players : [];
  const stats = {};

  for (const p of players) {
    const pid = extractId(p);
    if (!pid) continue;
    stats[pid] = {
      entityType: 'player',
      entityId: pid,
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
      const sp = scoreUtils.extractScorePairAny(m);
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
