const normalize = require('../../core/normalize');
const modeHelper = require('../../core/mode');
const playerUtils = require('../../core/playerUtils');
const rankingCore = require('../../core/ranking');

function pickScoreVal(value) {
  if (value === 0 || value === '0') return 0;
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function extractScore(match) {
  const item = match || {};
  return {
    a: pickScoreVal(item.scoreA ?? item.teamAScore ?? (item.score && item.score.teamA) ?? item.a ?? item.left),
    b: pickScoreVal(item.scoreB ?? item.teamBScore ?? (item.score && item.score.teamB) ?? item.b ?? item.right)
  };
}

function extractId(player) {
  if (!player) return '';
  if (typeof player === 'string') return player;
  return String(player.id || player.playerId || player._id || '');
}

function asName(player, map) {
  const id = extractId(player);
  const name = playerUtils.safePlayerName(player);
  if (name) return name;
  if (id && map[id]) return map[id];
  return '未知';
}

function formatRate(num, den) {
  if (!den) return '0%';
  const value = Math.round((num * 1000) / den) / 10;
  return `${value}%`;
}

function sortRanking(a, b) {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
  if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
  return String(a.name || '').localeCompare(String(b.name || ''));
}

function toRankingKey(row) {
  const entityType = String((row && row.entityType) || 'player').trim() || 'player';
  const entityId = String((row && (row.entityId || row.playerId || row.id)) || '').trim();
  return `${entityType}_${entityId}`;
}

function buildRankingRows(tournament) {
  const currentRows = rankingCore.normalizeCurrentRankings(tournament);
  const seedRows = modeHelper.buildInitialRankings(
    tournament && tournament.mode,
    tournament && tournament.players,
    tournament && tournament.pairTeams
  );
  const merged = {};

  for (const row of currentRows) {
    const key = toRankingKey(row);
    if (!key) continue;
    merged[key] = {
      ...row,
      wins: Number(row.wins) || 0,
      losses: Number(row.losses) || 0,
      played: Number(row.played) || 0,
      pointsFor: Number(row.pointsFor) || 0,
      pointsAgainst: Number(row.pointsAgainst) || 0,
      pointDiff: Number(row.pointDiff) || 0
    };
  }

  for (const row of seedRows) {
    const key = toRankingKey(row);
    if (!key || merged[key]) continue;
    merged[key] = {
      ...row,
      wins: 0,
      losses: 0,
      played: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0
    };
  }

  return Object.values(merged)
    .map((row) => ({
      ...row,
      winRate: formatRate(Number(row.wins) || 0, Number(row.played) || 0)
    }))
    .sort(sortRanking);
}

function computeAnalytics(tournament) {
  const t = normalize.normalizeTournament(tournament || {});
  const players = Array.isArray(t.players) ? t.players : [];
  const rounds = Array.isArray(t.rounds) ? t.rounds : [];
  const isTeamMode = modeHelper.isTeamMode(t.mode);

  const nameMap = {};
  for (const player of players) {
    const id = extractId(player);
    if (!id) continue;
    nameMap[id] = playerUtils.safePlayerName(player) || nameMap[id] || '未知';
  }

  let totalMatches = 0;
  let finishedMatches = 0;
  let totalPoints = 0;
  let diffSum = 0;

  const pairCounter = {};
  const duelCounter = {};

  const incCounter = (counter, key, label) => {
    if (!key) return;
    if (!counter[key]) counter[key] = { key, label, count: 0 };
    counter[key].count += 1;
  };

  for (const round of rounds) {
    const matches = Array.isArray(round.matches) ? round.matches : [];
    for (const match of matches) {
      totalMatches += 1;
      if (!match || match.status !== 'finished') continue;

      const score = extractScore(match);
      if (score.a === null || score.b === null) continue;
      finishedMatches += 1;
      totalPoints += score.a + score.b;
      diffSum += Math.abs(score.a - score.b);

      const teamA = (Array.isArray(match.teamA) ? match.teamA : [])
        .map((player) => ({ id: extractId(player), name: asName(player, nameMap) }))
        .filter((player) => player.id || player.name);
      const teamB = (Array.isArray(match.teamB) ? match.teamB : [])
        .map((player) => ({ id: extractId(player), name: asName(player, nameMap) }))
        .filter((player) => player.id || player.name);

      if (teamA.length >= 2) {
        const sorted = teamA.slice(0, 2).sort((x, y) => String(x.id || x.name).localeCompare(String(y.id || y.name)));
        incCounter(pairCounter, sorted.map((player) => player.id || player.name).join('|'), sorted.map((player) => player.name).join(' / '));
      }

      if (teamB.length >= 2) {
        const sorted = teamB.slice(0, 2).sort((x, y) => String(x.id || x.name).localeCompare(String(y.id || y.name)));
        incCounter(pairCounter, sorted.map((player) => player.id || player.name).join('|'), sorted.map((player) => player.name).join(' / '));
      }

      if (teamA.length >= 2 && teamB.length >= 2) {
        const duel = [
          teamA.slice(0, 2).map((player) => player.name).join(' / '),
          teamB.slice(0, 2).map((player) => player.name).join(' / ')
        ].sort((left, right) => left.localeCompare(right));
        incCounter(duelCounter, duel.join(' || '), `${duel[0]} vs ${duel[1]}`);
      }
    }
  }

  const rankingRows = buildRankingRows(t);
  const top3 = rankingRows.slice(0, 3).map((row, idx) => ({
    ...row,
    rankLabel: `TOP ${idx + 1}`
  }));

  const pairHot = Object.values(pairCounter).sort((a, b) => b.count - a.count).slice(0, 5);
  const duelHot = Object.values(duelCounter).sort((a, b) => b.count - a.count).slice(0, 5);

  return {
    tournament: t,
    summary: {
      totalMatches,
      finishedMatches,
      completionRate: totalMatches > 0 ? `${Math.round((finishedMatches * 100) / totalMatches)}%` : '0%',
      totalPoints,
      avgDiff: finishedMatches > 0 ? (Math.round((diffSum * 10) / finishedMatches) / 10).toFixed(1) : '0.0'
    },
    top3,
    playerStats: rankingRows,
    pairHot,
    duelHot,
    rankingTitle: isTeamMode ? '队伍数据' : '球员数据',
    rankingUnit: isTeamMode ? '队' : '人'
  };
}

function buildBattleReport(analytics) {
  const data = analytics || {};
  const tournament = data.tournament || {};
  const summary = data.summary || {};
  const top = Array.isArray(data.top3) ? data.top3 : [];
  const pairHot = Array.isArray(data.pairHot) ? data.pairHot : [];
  const duelHot = Array.isArray(data.duelHot) ? data.duelHot : [];

  const lines = [];
  lines.push(`已完赛 ${summary.finishedMatches || 0}/${summary.totalMatches || 0}（完赛率 ${summary.completionRate || '0%'}）`);
  lines.push(`总得分 ${summary.totalPoints || 0}，平均分差 ${summary.avgDiff || '0.0'}`);
  if (top[0]) lines.push(`当前榜首：${top[0].name}（胜${top[0].wins} 负${top[0].losses}）`);
  if (pairHot[0]) lines.push(`高频搭档：${pairHot[0].label}（${pairHot[0].count}次）`);
  if (duelHot[0]) lines.push(`高频对阵：${duelHot[0].label}（${duelHot[0].count}次）`);

  const headline = top[0]
    ? `榜首 ${top[0].name}，当前完赛率 ${summary.completionRate || '0%'}`
    : `当前完赛率 ${summary.completionRate || '0%'}，已完赛 ${summary.finishedMatches || 0} 场`;
  const briefText = [lines[0], lines[1], lines[2]].filter(Boolean).join('\n');
  const shareText = `${tournament.name || '羽毛球比赛'}战报\n${lines.join('\n')}`;
  return { lines, shareText, headline, briefText };
}

module.exports = {
  computeAnalytics,
  buildBattleReport
};
