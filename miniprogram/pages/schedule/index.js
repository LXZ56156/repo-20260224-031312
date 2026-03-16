const storage = require('../../core/storage');
const normalize = require('../../core/normalize');
const playerUtils = require('../../core/playerUtils');
const perm = require('../../permission/permission');
const nav = require('../../core/nav');
const pageTournamentSync = require('../../core/pageTournamentSync');
const matchPrimaryNav = require('../../core/matchPrimaryNav');
const shareMeta = require('../../core/shareMeta');
const flow = require('../../core/uxFlow');

function asName(p) {
  if (!p) return '未知';
  if (typeof p === 'string') return p;
  return playerUtils.safePlayerName(p) || '未知';
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
        focusBadgeText: '',
        isFirstPending: false,
        scoreText: finished ? (scoreText || '--') : '',
        scorerText: (finished && scorerName) ? `本场裁判：${scorerName}` : ''
      };
    });

    return {
      roundIndex: r.roundIndex || 0,
      isCurrentRound: false,
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

function summarizeRounds(roundsUi) {
  const rounds = Array.isArray(roundsUi) ? roundsUi : [];
  let totalMatches = 0;
  let finishedMatches = 0;
  let pendingMatches = 0;
  for (const round of rounds) {
    const matches = Array.isArray(round && round.matchesUi) ? round.matchesUi : [];
    totalMatches += matches.length;
    for (const match of matches) {
      const status = String((match && match.status) || '').trim();
      if (status === 'finished') finishedMatches += 1;
      else if (status !== 'canceled') pendingMatches += 1;
    }
  }
  return {
    totalRounds: rounds.length,
    totalMatches,
    finishedMatches,
    pendingMatches
  };
}

function markPendingFocus(roundsUi, firstPending) {
  if (!firstPending) return roundsUi;
  return (roundsUi || []).map((round) => {
    const isCurrentRound = Number(round && round.roundIndex) === Number(firstPending.roundIndex);
    return {
      ...round,
      isCurrentRound,
      matchesUi: (round && Array.isArray(round.matchesUi) ? round.matchesUi : []).map((match) => {
        const isFirstPending = Number(match && match.roundIndex) === Number(firstPending.roundIndex) &&
          Number(match && match.matchIndex) === Number(firstPending.matchIndex);
        return {
          ...match,
          isFirstPending,
          focusBadgeText: isFirstPending ? '优先录分' : ''
        };
      })
    };
  });
}

const scheduleSyncController = pageTournamentSync.createTournamentSyncMethods();

Page({
  data: {
    tournamentId: '',
    tournament: null,
    statusText: '',
    statusClass: 'tag-draft',
    modeLabel: '',
    roundsUi: [],
    heroSummaryText: '',
    heroRoundText: '',
    heroMatchText: '',
    heroPendingText: '',
    canEditScore: false,
    hasPending: false,
    firstPendingRoundIndex: -1,
    firstPendingMatchIndex: -1,
    nextActionKey: '',
    nextActionText: '',
    primaryNavCurrent: 'schedule',
    primaryNavItems: [],
    networkOffline: false,
    showStaleSyncHint: false,
    loadError: false,
    syncRefreshing: false,
    syncUsingCache: false,
    syncPollingFallback: false,
    syncCachedAt: 0,
    syncLastUpdatedAt: 0,
    syncStatusVisible: false,
    syncStatusTone: 'info',
    syncStatusText: '',
    syncStatusMeta: '',
    syncStatusActionText: '刷新'
  },

  ...scheduleSyncController,

  onLoad(options) {
    const tid = options.tournamentId;
    this.openid = (getApp().globalData.openid || storage.get('openid', ''));
    pageTournamentSync.initTournamentSync(this);
    this.setData({
      tournamentId: tid,
      primaryNavItems: matchPrimaryNav.getPrimaryNavItems('schedule', tid, { showAnalytics: false })
    });

    const app = getApp();
    const initialOffline = !!(app && app.globalData && app.globalData.networkOffline);
    this.setData(pageTournamentSync.composePageSyncPatch(this, { networkOffline: initialOffline }));
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.handleNetworkChange(offline);
      });
    }

    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
    pageTournamentSync.pauseTournamentSync(this);
  },

  onShow() {
    const currentId = String(this.data.tournamentId || '').trim();
    nav.consumeRefreshFlag(currentId);
    // 兜底刷新：从录入比分页返回时，确保状态与比分是最新的
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.hasActiveWatch(this.data.tournamentId)) this.startWatch(this.data.tournamentId);
  },

  onUnload() {
    pageTournamentSync.teardownTournamentSync(this);
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  applyTournament(t) {
    if (!t) return;
    t = normalize.normalizeTournament(t);

    const status = t.status || 'draft';
    const modeLabel = flow.getModeLabel(t.mode || flow.MODE_MULTI_ROTATE);
    let statusText = '草稿';
    let statusClass = 'tag-draft';
    if (status === 'running') { statusText = '进行中'; statusClass = 'tag-running'; }
    if (status === 'finished') { statusText = '已结束'; statusClass = 'tag-finished'; }

    const rawRoundsUi = decorateRounds(t);
    const firstPending = findFirstPending(rawRoundsUi);
    const roundsUi = markPendingFocus(rawRoundsUi, firstPending);
    const roundsSummary = summarizeRounds(roundsUi);
    const canEditScore = perm.canEditScore(t, this.openid);
    let nextActionKey = '';
    let nextActionText = '';
    if (status === 'running' && canEditScore && firstPending) {
      nextActionKey = 'batch';
      nextActionText = '继续录分';
    } else if (status === 'finished') {
      nextActionKey = 'analytics';
      nextActionText = '查看赛事复盘';
    }

    const heroSummaryText = status === 'draft'
      ? `${modeLabel} · 开赛后生成对阵`
      : `${modeLabel} · ${roundsSummary.totalRounds || 0} 轮`;
    const heroRoundText = roundsSummary.totalRounds ? `${roundsSummary.totalRounds} 轮` : '未排赛';
    const heroMatchText = roundsSummary.totalMatches
      ? `${roundsSummary.finishedMatches}/${roundsSummary.totalMatches} 场`
      : '暂无场次';
    const heroPendingText = status === 'draft'
      ? '待开赛'
      : (roundsSummary.pendingMatches ? `待录分 ${roundsSummary.pendingMatches}` : '已录完');

    this.setData({
      loadError: false,
      tournament: t,
      statusText,
      statusClass,
      modeLabel,
      roundsUi,
      heroSummaryText,
      heroRoundText,
      heroMatchText,
      heroPendingText,
      canEditScore,
      hasPending: !!firstPending,
      firstPendingRoundIndex: firstPending ? firstPending.roundIndex : -1,
      firstPendingMatchIndex: firstPending ? firstPending.matchIndex : -1,
      nextActionKey,
      nextActionText,
      primaryNavItems: matchPrimaryNav.getPrimaryNavItems('schedule', this.data.tournamentId, { showAnalytics: status === 'finished' })
    });
  },

  onHeroActionTap() {
    const key = String(this.data.nextActionKey || '').trim();
    if (key === 'batch') return this.goBatchScoring();
    if (key === 'analytics') {
      wx.navigateTo({
        url: nav.buildTournamentUrl('/pages/analytics/index', this.data.tournamentId)
      });
    }
  },

  openMatch(e) {
    const roundIndex = e.currentTarget.dataset.round;
    const matchIndex = e.currentTarget.dataset.match;
    const status = String((e.currentTarget.dataset.status || '')).trim();
    if (status === 'canceled') {
      wx.showToast({ title: '该场已取消', icon: 'none' });
      return;
    }
    const batch = Number(e.currentTarget.dataset.batch) === 1;
    wx.navigateTo({
      url: nav.buildTournamentUrl('/pages/match/index', this.data.tournamentId, {
        roundIndex,
        matchIndex,
        batch: batch ? 1 : ''
      })
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

  onPrimaryNavTap(e) {
    const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '').trim();
    matchPrimaryNav.navigateToPrimary(key, this.data.tournamentId, 'schedule');
  },

  onShareAppMessage() {
    const meta = shareMeta.buildShareMessage(this.data.tournament);
    return {
      title: meta.title,
      path: meta.path
    };
  }
});
