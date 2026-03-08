const storage = require('../../core/storage');
const normalize = require('../../core/normalize');
const perm = require('../../permission/permission');
const tournamentSync = require('../../core/tournamentSync');
const nav = require('../../core/nav');

function asName(p) {
  if (!p) return '未知';
  if (typeof p === 'string') return p;
  return (p.name || p.nickname || p.id || '未知');
}

function pickScoreVal(v) {
  if (v === 0) return 0;
  if (v === '0') return 0;
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractScore(m) {
  const a = pickScoreVal(
    m.scoreA ?? m.teamAScore ?? m.teamA_score ?? (m.score && m.score.teamA) ?? (m.result && m.result.teamA) ?? m.teamA
  );
  const b = pickScoreVal(
    m.scoreB ?? m.teamBScore ?? m.teamB_score ?? (m.score && m.score.teamB) ?? (m.result && m.result.teamB) ?? m.teamB
  );
  return { a, b };
}

function decorateRounds(t) {
  const rounds = Array.isArray(t.rounds) ? t.rounds : [];
  const players = Array.isArray(t.players) ? t.players : [];
  const playerNameMap = {};
  for (const player of players) {
    const id = String((player && player.id) || '').trim();
    if (!id) continue;
    playerNameMap[id] = asName(player);
  }
  return rounds.map((r) => {
    const matches = Array.isArray(r.matches) ? r.matches : [];
    const rest = Array.isArray(r.restPlayers) ? r.restPlayers : [];

    const matchesUi = matches.map((m, idx) => {
      const teamA = Array.isArray(m.teamA) ? m.teamA : [];
      const teamB = Array.isArray(m.teamB) ? m.teamB : [];
      const leftMembers = teamA.map(asName).join(' / ');
      const rightMembers = teamB.map(asName).join(' / ');
      const unitAName = String((m && m.unitAName) || '').trim();
      const unitBName = String((m && m.unitBName) || '').trim();
      const isTeamMatch = !!(unitAName && unitBName);
      const left = isTeamMatch ? unitAName : (leftMembers || '待定');
      const right = isTeamMatch ? unitBName : (rightMembers || '待定');

      const status = m.status || 'pending';
      const finished = status === 'finished';
      const canceled = status === 'canceled';
      const score = extractScore(m);
      const scoreText = (score.a !== null && score.b !== null) ? `${score.a} - ${score.b}` : '';
      const scorerId = String((m && m.scorerId) || '').trim();
      const scorerName = String((m && m.scorerName) || '').trim() || playerNameMap[scorerId] || '';
      let statusText = '待录分';
      let statusClass = 'pill-pending';
      if (finished) {
        statusText = '已完赛';
        statusClass = 'pill-finished';
      } else if (canceled) {
        statusText = '已取消';
        statusClass = 'pill-canceled';
      }

      return {
        key: `${r.roundIndex || 0}-${m.matchIndex ?? idx}`,
        roundIndex: r.roundIndex || 0,
        matchIndex: (m.matchIndex ?? idx),
        status,
        title: `第 ${(m.matchIndex ?? idx) + 1} 场`,
        left,
        right,
        leftMeta: isTeamMatch ? (leftMembers ? `成员：${leftMembers}` : '') : '',
        rightMeta: isTeamMatch ? (rightMembers ? `成员：${rightMembers}` : '') : '',
        statusText,
        statusClass,
        scoreText: finished ? (scoreText || '--') : '',
        scorerText: (finished && scorerName) ? `本场裁判：${scorerName}` : ''
      };
    });

    return {
      roundIndex: r.roundIndex || 0,
      matchesUi,
      restText: rest.length ? `轮空：${rest.map(asName).join(' / ')}` : ''
    };
  });
}

function findFirstPending(roundsUi) {
  for (const r of (roundsUi || [])) {
    for (const m of (r.matchesUi || [])) {
      if (m && m.statusText === '待录分') {
        return { roundIndex: m.roundIndex, matchIndex: m.matchIndex };
      }
    }
  }
  return null;
}

Page({
  data: {
    tournamentId: '',
    tournament: null,
    statusText: '',
    statusClass: 'tag-draft',
    roundsUi: [],
    canEditScore: false,
    hasPending: false,
    firstPendingRoundIndex: -1,
    firstPendingMatchIndex: -1,
    nextActionKey: '',
    nextActionText: '',
    showStaleSyncHint: false,
    loadError: false
  },

  onLoad(options) {
    const tid = options.tournamentId;
    this.openid = (getApp().globalData.openid || storage.get('openid', ''));
    this.setData({ tournamentId: tid });

    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
    tournamentSync.closeWatcher(this);
  },

  onShow() {
    const currentId = String(this.data.tournamentId || '').trim();
    nav.consumeRefreshFlag(currentId);
    // 兜底刷新：从录入比分页返回时，确保状态与比分是最新的
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
  },

  onUnload() {
    tournamentSync.closeWatcher(this);
  },

  onRetry() {
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
  },

  startWatch(tid) {
    tournamentSync.startWatch(this, tid, (doc) => {
      this.setData({ showStaleSyncHint: false });
      this.applyTournament(doc);
    });
  },

  async fetchTournament(tid) {
    const result = await tournamentSync.fetchTournament(tid);
    if (result && result.ok && result.doc) {
      this.setData({ showStaleSyncHint: false });
      this.applyTournament(result.doc);
      return result.doc;
    }
    if (result && result.cachedDoc) {
      this.setData({ showStaleSyncHint: true, loadError: false });
      this.applyTournament(result.cachedDoc);
      return result.cachedDoc;
    }
    this.setData({ loadError: true, showStaleSyncHint: false });
    return null;
  },

  applyTournament(t) {
    if (!t) return;
    t = normalize.normalizeTournament(t);

    const status = t.status || 'draft';
    let statusText = '草稿';
    let statusClass = 'tag-draft';
    if (status === 'running') { statusText = '进行中'; statusClass = 'tag-running'; }
    if (status === 'finished') { statusText = '已结束'; statusClass = 'tag-finished'; }

    const roundsUi = decorateRounds(t);
    const firstPending = findFirstPending(roundsUi);
    const canEditScore = perm.canEditScore(t, this.openid);
    let nextActionKey = '';
    let nextActionText = '';
    if (status === 'running' && canEditScore && firstPending) {
      nextActionKey = 'batch';
      nextActionText = '继续录分';
    } else if (status === 'finished') {
      nextActionKey = 'analytics';
      nextActionText = '查看赛事复盘';
    } else if (status === 'running') {
      nextActionKey = 'ranking';
      nextActionText = '查看排名';
    }

    this.setData({
      loadError: false,
      tournament: t,
      statusText,
      statusClass,
      roundsUi,
      canEditScore,
      hasPending: !!firstPending,
      firstPendingRoundIndex: firstPending ? firstPending.roundIndex : -1,
      firstPendingMatchIndex: firstPending ? firstPending.matchIndex : -1,
      nextActionKey,
      nextActionText
    });
  },

  onHeroActionTap() {
    const key = String(this.data.nextActionKey || '').trim();
    if (key === 'batch') return this.goBatchScoring();
    if (key === 'analytics') return this.goAnalytics();
    if (key === 'ranking') return this.goRanking();
  },

  openMatch(e) {
    const roundIndex = e.currentTarget.dataset.round;
    const matchIndex = e.currentTarget.dataset.match;
    const status = String((e.currentTarget.dataset.status || '')).trim();
    if (status === 'canceled') {
      wx.showToast({ title: '该场已取消', icon: 'none' });
      return;
    }
    const batch = Number(e.currentTarget.dataset.batch) === 1 ? '&batch=1' : '';
    wx.navigateTo({
      url: `/pages/match/index?tournamentId=${this.data.tournamentId}&roundIndex=${roundIndex}&matchIndex=${matchIndex}${batch}`
    });
  },

  goBatchScoring() {
    if (!this.data.canEditScore) return;
    if (!this.data.hasPending) {
      wx.showToast({ title: '当前没有待录分比赛', icon: 'none' });
      return;
    }
    this.openMatch({
      currentTarget: {
        dataset: {
          round: this.data.firstPendingRoundIndex,
          match: this.data.firstPendingMatchIndex,
          batch: 1
        }
      }
    });
  },

  goAnalytics() {
    wx.navigateTo({ url: `/pages/analytics/index?tournamentId=${this.data.tournamentId}` });
  },

  goRanking() {
    wx.navigateTo({ url: `/pages/ranking/index?tournamentId=${this.data.tournamentId}` });
  },

  goLobby() {
    wx.navigateTo({ url: `/pages/lobby/index?tournamentId=${this.data.tournamentId}` });
  }
});
