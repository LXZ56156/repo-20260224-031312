const cloud = require('../../core/cloud');
const storage = require('../../core/storage');
const normalize = require('../../core/normalize');
const tournamentSync = require('../../core/tournamentSync');
const nav = require('../../core/nav');
const adGuard = require('../../core/adGuard');

function pickScoreVal(v) {
  if (v === 0 || v === '0') return 0;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractScore(match) {
  const m = match || {};
  return {
    a: pickScoreVal(m.scoreA ?? m.teamAScore ?? (m.score && m.score.teamA) ?? m.a ?? m.left),
    b: pickScoreVal(m.scoreB ?? m.teamBScore ?? (m.score && m.score.teamB) ?? m.b ?? m.right)
  };
}

function extractId(player) {
  if (!player) return '';
  if (typeof player === 'string') return player;
  return String(player.id || player.playerId || player._id || '');
}

function asName(player, map) {
  const id = extractId(player);
  const name = String(player && (player.name || player.nickname || player.nickName) || '').trim();
  if (name) return name;
  if (id && map[id]) return map[id];
  return '未知';
}

function formatRate(num, den) {
  if (!den) return '0%';
  const n = Math.round((num * 1000) / den) / 10;
  return `${n}%`;
}

function sortRanking(a, b) {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
  if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
  return String(a.name || '').localeCompare(String(b.name || ''));
}

function computeAnalytics(tournament) {
  const t = normalize.normalizeTournament(tournament || {});
  const players = Array.isArray(t.players) ? t.players : [];
  const rounds = Array.isArray(t.rounds) ? t.rounds : [];

  const nameMap = {};
  for (const p of players) {
    const id = extractId(p);
    if (!id) continue;
    nameMap[id] = String(p.name || '').trim() || nameMap[id] || '未知';
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
        .map((p) => ({ id: extractId(p), name: asName(p, nameMap) }))
        .filter((p) => p.id || p.name);
      const teamB = (Array.isArray(match.teamB) ? match.teamB : [])
        .map((p) => ({ id: extractId(p), name: asName(p, nameMap) }))
        .filter((p) => p.id || p.name);

      if (teamA.length >= 2) {
        const sorted = teamA.slice(0, 2).sort((x, y) => String(x.id || x.name).localeCompare(String(y.id || y.name)));
        const pairKey = sorted.map((p) => p.id || p.name).join('|');
        const pairLabel = sorted.map((p) => p.name).join(' / ');
        incCounter(pairCounter, pairKey, pairLabel);
      }

      if (teamB.length >= 2) {
        const sorted = teamB.slice(0, 2).sort((x, y) => String(x.id || x.name).localeCompare(String(y.id || y.name)));
        const pairKey = sorted.map((p) => p.id || p.name).join('|');
        const pairLabel = sorted.map((p) => p.name).join(' / ');
        incCounter(pairCounter, pairKey, pairLabel);
      }

      if (teamA.length >= 2 && teamB.length >= 2) {
        const left = teamA.slice(0, 2).map((p) => p.name).join(' / ');
        const right = teamB.slice(0, 2).map((p) => p.name).join(' / ');
        const duel = [left, right].sort((a, b) => a.localeCompare(b));
        const duelKey = duel.join(' || ');
        const duelLabel = `${duel[0]} vs ${duel[1]}`;
        incCounter(duelCounter, duelKey, duelLabel);
      }
    }
  }

  const rawRankings = Array.isArray(t.rankings) ? t.rankings : [];
  const rankingMap = {};
  for (const r of rawRankings) {
    const id = String(r.playerId || r.id || '').trim();
    if (!id) continue;
    rankingMap[id] = {
      playerId: id,
      name: nameMap[id] || String(r.name || '').trim() || '未知',
      wins: Number(r.wins) || 0,
      losses: Number(r.losses) || 0,
      played: Number(r.played) || 0,
      pointsFor: Number(r.pointsFor) || 0,
      pointsAgainst: Number(r.pointsAgainst) || 0,
      pointDiff: Number(r.pointDiff) || 0
    };
  }

  for (const p of players) {
    const id = extractId(p);
    if (!id || rankingMap[id]) continue;
    rankingMap[id] = {
      playerId: id,
      name: nameMap[id] || '未知',
      wins: 0,
      losses: 0,
      played: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0
    };
  }

  const playerStats = Object.values(rankingMap)
    .map((r) => ({
      ...r,
      winRate: formatRate(r.wins, r.played)
    }))
    .sort(sortRanking);

  const top3 = playerStats.slice(0, 3).map((r, idx) => ({
    ...r,
    rankLabel: `TOP ${idx + 1}`
  }));

  const pairHot = Object.values(pairCounter)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const duelHot = Object.values(duelCounter)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

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
    playerStats,
    pairHot,
    duelHot
  };
}

function buildBattleReport(analytics) {
  const a = analytics || {};
  const t = a.tournament || {};
  const s = a.summary || {};
  const top = Array.isArray(a.top3) ? a.top3 : [];
  const pairHot = Array.isArray(a.pairHot) ? a.pairHot : [];
  const duelHot = Array.isArray(a.duelHot) ? a.duelHot : [];

  const lines = [];
  lines.push(`已完赛 ${s.finishedMatches || 0}/${s.totalMatches || 0}（完赛率 ${s.completionRate || '0%'}）`);
  lines.push(`总得分 ${s.totalPoints || 0}，平均分差 ${s.avgDiff || '0.0'}`);
  if (top[0]) lines.push(`当前榜首：${top[0].name}（胜${top[0].wins} 负${top[0].losses}）`);
  if (pairHot[0]) lines.push(`高频搭档：${pairHot[0].label}（${pairHot[0].count}次）`);
  if (duelHot[0]) lines.push(`高频对阵：${duelHot[0].label}（${duelHot[0].count}次）`);

  const headline = top[0]
    ? `榜首 ${top[0].name}，当前完赛率 ${s.completionRate || '0%'}`
    : `当前完赛率 ${s.completionRate || '0%'}，已完赛 ${s.finishedMatches || 0} 场`;
  const briefText = [lines[0], lines[1], lines[2]].filter(Boolean).join('\n');
  const shareText = `${t.name || '羽毛球比赛'}战报\n${lines.join('\n')}`;
  return { lines, shareText, headline, briefText };
}

Page({
  data: {
    tournamentId: '',
    tournament: null,
    summary: null,
    top3: [],
    playerStats: [],
    pairHot: [],
    duelHot: [],
    reportLines: [],
    reportShareText: '',
    reportHeadline: '',
    reportBriefText: '',
    showAnalyticsAdSlot: false,
    networkOffline: false,
    canRetryAction: false,
    lastFailedActionText: '',
    loadError: false
  },

  onLoad(options) {
    const tid = String((options && options.tournamentId) || '').trim();
    this.setData({ tournamentId: tid });

    const app = getApp();
    this.setData({ networkOffline: !!(app && app.globalData && app.globalData.networkOffline) });
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.setData({ networkOffline: !!offline });
      });
    }

    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onShow() {
    const currentId = String(this.data.tournamentId || '').trim();
    nav.consumeRefreshFlag(currentId);
    this.refreshAnalyticsAdSlot();
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
  },

  onHide() {
    tournamentSync.closeWatcher(this);
  },

  onUnload() {
    tournamentSync.closeWatcher(this);
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  onRetry() {
    this.refreshAnalyticsAdSlot();
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
  },

  refreshAnalyticsAdSlot() {
    const showAnalyticsAdSlot = adGuard.shouldExposePageSlot('analytics');
    this.setData({ showAnalyticsAdSlot });
    if (showAnalyticsAdSlot) adGuard.markPageExposed('analytics');
  },

  startWatch(tid) {
    tournamentSync.startWatch(this, tid, (doc) => {
      this.applyTournament(doc);
    });
  },

  async fetchTournament(tid) {
    const doc = await tournamentSync.fetchTournament(tid, (next) => {
      this.applyTournament(next);
    });
    if (!doc) this.setData({ loadError: true });
  },

  applyTournament(tournament) {
    if (!tournament) return;
    const analytics = computeAnalytics(tournament);
    const report = buildBattleReport(analytics);
    this.setData({
      loadError: false,
      tournament: analytics.tournament,
      summary: analytics.summary,
      top3: analytics.top3,
      playerStats: analytics.playerStats,
      pairHot: analytics.pairHot,
      duelHot: analytics.duelHot,
      reportLines: report.lines,
      reportShareText: report.shareText,
      reportHeadline: report.headline,
      reportBriefText: report.briefText
    });
    this.clearLastFailedAction();
  },

  copyBattleReport() {
    const text = String(this.data.reportShareText || '').trim();
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '战报已复制', icon: 'success' })
    });
  },

  copyBriefReport() {
    const text = String(this.data.reportBriefText || '').trim();
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '摘要已复制', icon: 'success' })
    });
  },

  setLastFailedAction(text, fn) {
    this._lastFailedAction = typeof fn === 'function' ? fn : null;
    this.setData({
      canRetryAction: !!this._lastFailedAction,
      lastFailedActionText: String(text || '').trim() || '上次操作失败，可重试'
    });
  },

  clearLastFailedAction() {
    this._lastFailedAction = null;
    this.setData({ canRetryAction: false, lastFailedActionText: '' });
  },

  retryLastAction() {
    if (typeof this._lastFailedAction === 'function') this._lastFailedAction();
  },

  async cloneCurrentTournament() {
    const sourceTournamentId = String(this.data.tournamentId || '').trim();
    if (!sourceTournamentId) return;
    wx.showLoading({ title: '复制中...' });
    try {
      const res = await cloud.call('cloneTournament', { sourceTournamentId });
      const nextId = String((res && res.tournamentId) || '').trim();
      if (!nextId) throw new Error('复制失败');
      wx.hideLoading();
      this.clearLastFailedAction();
      storage.addRecentTournamentId(nextId);
      wx.showToast({ title: '已生成副本', icon: 'success' });
      wx.navigateTo({ url: `/pages/lobby/index?tournamentId=${nextId}` });
    } catch (e) {
      wx.hideLoading();
      this.setLastFailedAction('再办一场', () => this.cloneCurrentTournament());
      wx.showToast({ title: cloud.getUnifiedErrorMessage(e, '复制失败'), icon: 'none' });
    }
  }
});
