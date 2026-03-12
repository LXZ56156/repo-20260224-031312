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
  const rankedRows = rankingRows.map((row, idx) => ({
    ...row,
    rank: idx + 1
  }));
  const top3 = rankedRows.slice(0, 3).map((row, idx) => ({
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
    playerStats: rankedRows,
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

function formatCompactMatches(finished, total) {
  return `${Number(finished) || 0}/${Number(total) || 0}`;
}

function getStatusLabel(status) {
  const value = String(status || '').trim();
  if (value === 'running') return '进行中';
  if (value === 'finished') return '已结束';
  return '准备中';
}

function buildAnalyticsPageModel(analytics, report) {
  const data = analytics || {};
  const tournament = data.tournament || {};
  const summary = data.summary || {};
  const top3 = Array.isArray(data.top3) ? data.top3 : [];
  const playerStats = Array.isArray(data.playerStats) ? data.playerStats : [];
  const pairHot = Array.isArray(data.pairHot) ? data.pairHot : [];
  const duelHot = Array.isArray(data.duelHot) ? data.duelHot : [];
  const topLeader = top3[0] || null;

  const modeLabel = modeHelper.getModeLabel(tournament.mode);
  const statusLabel = getStatusLabel(tournament.status);
  const finishedMatches = Number(summary.finishedMatches) || 0;
  const totalMatches = Number(summary.totalMatches) || 0;
  const completionRate = String(summary.completionRate || '0%');
  const totalPoints = Number(summary.totalPoints) || 0;
  const avgDiff = String(summary.avgDiff || '0.0');

  let heroHeadline = '等待首场完赛';
  if (topLeader) {
    heroHeadline = `榜首 ${topLeader.name}`;
  } else if (finishedMatches > 0) {
    heroHeadline = `已完成 ${finishedMatches} 场比赛`;
  }

  const heroStats = [
    { label: '完赛', value: formatCompactMatches(finishedMatches, totalMatches) },
    { label: '总分', value: String(totalPoints) },
    { label: '分差', value: avgDiff }
  ];

  const summaryStats = [
    { label: '完赛率', value: completionRate },
    { label: '总场次', value: String(totalMatches) },
    { label: '平均分差', value: avgDiff }
  ];

  const focusFacts = [];
  if (topLeader) focusFacts.push(`榜首 ${topLeader.name}，战绩 ${topLeader.wins} 胜 ${topLeader.losses} 负`);
  focusFacts.push(`已完赛 ${formatCompactMatches(finishedMatches, totalMatches)}，完赛率 ${completionRate}`);
  focusFacts.push(`总得分 ${totalPoints}，平均分差 ${avgDiff}`);
  if (pairHot[0]) focusFacts.push(`高频搭档 ${pairHot[0].label} · ${pairHot[0].count} 次`);
  if (duelHot[0]) focusFacts.push(`高频对阵 ${duelHot[0].label} · ${duelHot[0].count} 次`);

  return {
    modeLabel,
    statusLabel,
    heroHeadline,
    heroStats,
    summaryStats,
    focusFacts: focusFacts.slice(0, 4),
    reportHeadline: String((report && report.headline) || '').trim(),
    topSectionTitle: top3.length >= 3 ? 'TOP 3' : '领先榜',
    top3,
    fullRankings: playerStats
  };
}

module.exports = {
  computeAnalytics,
  buildBattleReport,
  buildAnalyticsPageModel
};
