const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function isCollectionNotExists(err) {
  const msg = String(err && (err.message || err.errMsg || err));
  return msg.includes('DATABASE_COLLECTION_NOT_EXIST') || msg.includes('collection not exists') || msg.includes('ResourceNotFound') || msg.includes('-502005');
}

function isAdmin(t, openid) {
  return t && openid && t.creatorId === openid;
}

function isReferee(t, openid) {
  return t && openid && (t.refereeId || '') === openid;
}

function canEditScore(t, openid) {
  return isAdmin(t, openid) || isReferee(t, openid);
}

function extractId(p) {
  if (!p) return '';
  if (typeof p === 'string') return p;
  return String(p.id || '');
}


function safePlayerName(p) {
  const raw = p && (p.name || p.nickname || p.nickName || p.displayName);
  const name = String(raw || '').trim();
  if (name) {
    const m = name.match(/^鎴愬憳([0-9a-zA-Z]{1,16})$/);
    return m ? m[1] : name;
  }
  const idRaw = String(extractId(p) || '').trim();
  const alnum = idRaw.replace(/[^0-9a-zA-Z]/g, '');
  const suffix = (alnum.slice(-4) || idRaw.slice(-4) || '').trim();
  return suffix || '鍖垮悕';
}
function computeRankings(t) {
  const players = Array.isArray(t.players) ? t.players : [];
  const stats = {};
  for (const p of players) {
    const pid = extractId(p);
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

  const extractScorePairAny = (obj) => {
    if (!obj) return { a: NaN, b: NaN };
    // 娉ㄦ剰锛歮atch 鏈韩涔熸湁 teamA/teamB锛堟暟缁勶級锛屼笉鑳芥妸瀹冨綋姣斿垎瀛楁銆?    const aLegacy = (obj.teamAScore ?? obj.teamAScore1 ?? obj.teamAScore2 ?? obj.scoreA ?? obj.a ?? obj.left);
    const bLegacy = (obj.teamBScore ?? obj.teamBScore1 ?? obj.teamBScore2 ?? obj.scoreB ?? obj.b ?? obj.right);
    // 鑻ユ槸鏍囧噯 score 瀵硅薄锛坱eamA/teamB 涓烘暟瀛?鏁板瓧瀛楃涓诧級锛屼篃鏀寔銆?    const aStd = (Array.isArray(obj.teamA) || typeof obj.teamA === 'object') ? undefined : obj.teamA;
    const bStd = (Array.isArray(obj.teamB) || typeof obj.teamB === 'object') ? undefined : obj.teamB;
    const aRaw = (aLegacy ?? aStd);
    const bRaw = (bLegacy ?? bStd);
    return { a: Number(aRaw), b: Number(bRaw) };
  };

  for (const r of (t.rounds || [])) {
    for (const m of (r.matches || [])) {
      if (m.status !== 'finished') continue;
      const sp = extractScorePairAny(m.score || m);
      const a = sp.a;
      const b = sp.b;
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (a === b) continue; // 涓嶈鍏ュ钩灞€锛堢悊璁轰笂涓嶅簲鍑虹幇锛?
      const teamA = (m.teamA || []).map(extractId);
      const teamB = (m.teamB || []).map(extractId);

      const winA = a > b;
      const winTeam = winA ? teamA : teamB;
      const loseTeam = winA ? teamB : teamA;
      const winScore = winA ? a : b;
      const loseScore = winA ? b : a;

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

function allMatchesFinished(rounds) {
  for (const r of (rounds || [])) {
    for (const m of (r.matches || [])) {
      if (m.status !== 'finished') return false;
    }
  }
  return true;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const roundIndex = Number(event && event.roundIndex);
  const matchIndex = Number(event && event.matchIndex);

  const scoreA = (event && (event.scoreA ?? event.teamAScore ?? event.teamA ?? event.a));
  const scoreB = (event && (event.scoreB ?? event.teamBScore ?? event.teamB ?? event.b));

  const a = Number(scoreA);
  const b = Number(scoreB);

  if (!tournamentId) throw new Error('缂哄皯 tournamentId');
  if (!Number.isFinite(roundIndex) || roundIndex < 0) throw new Error('roundIndex 涓嶅悎娉?');
  if (!Number.isFinite(matchIndex) || matchIndex < 0) throw new Error('matchIndex 涓嶅悎娉?');
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) throw new Error('姣斿垎涓嶅悎娉?');
  if (!Number.isInteger(a) || !Number.isInteger(b)) throw new Error('姣斿垎蹇呴』涓烘暣鏁?');
  if (a === b) throw new Error('姣斿垎涓嶅彲鐩稿悓');

  try {
    const docRes = await db.collection('tournaments').doc(tournamentId).get();
    const t = docRes.data;
    if (!t) throw new Error('璧涗簨涓嶅瓨鍦?');
    if (!canEditScore(t, OPENID)) throw new Error('鏃犳潈闄愬綍鍒?');
    if (t.status !== 'running' && t.status !== 'finished') throw new Error('璧涗簨鏈紑璧?');

    const oldVersion = Number(t.version) || 1;
    const rounds = Array.isArray(t.rounds) ? JSON.parse(JSON.stringify(t.rounds)) : [];
    const r = rounds[roundIndex];
    if (!r) throw new Error('杞涓嶅瓨鍦?');

    const matches = Array.isArray(r.matches) ? r.matches : [];
    const idx = matches.findIndex(mm => Number(mm.matchIndex) === matchIndex);
    if (idx < 0) throw new Error('姣旇禌涓嶅瓨鍦?');

    const m = matches[idx];

    // IMPORTANT:
    // CloudBase DB update may dot-flatten nested objects; if an existing intermediate field is null
    // (e.g. match.score === null), writing match.score.teamA will fail silently or throw.
    // Therefore we ONLY store flat score fields.
    delete m.score;
    m.teamAScore = a;
    m.teamBScore = b;
    m.scoreA = a;
    m.scoreB = b;
    m.status = 'finished';
    matches[idx] = m;
    r.matches = matches;
    rounds[roundIndex] = r;

    const rankings = computeRankings({ ...t, rounds });
    const finished = allMatchesFinished(rounds);

    const updRes = await db.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
      data: {
        rounds,
        rankings,
        status: finished ? 'finished' : 'running',
        updatedAt: db.serverDate(),
        version: _.inc(1)
      }
    });

    if (!updRes || !updRes.stats || updRes.stats.updated === 0) {
      throw new Error('鍐欏叆鍐茬獊锛岃鍒锋柊璧涗簨鍚庨噸璇?');
    }
    return { ok: true, finished };
  } catch (err) {
    if (isCollectionNotExists(err)) {
      throw new Error('鏁版嵁搴撻泦鍚?tournaments 涓嶅瓨鍦細璇峰湪浜戝紑鍙戞帶鍒跺彴锛堟暟鎹簱 -> 鍒涘缓闆嗗悎锛夊垱寤?tournaments 鍚庡啀璇曘€?');
    }
    throw err;
  }
};


