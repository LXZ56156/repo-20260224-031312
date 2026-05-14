const storage = require('../../core/storage');
const normalize = require('../../core/normalize');
const playerUtils = require('../../core/playerUtils');
const perm = require('../../permission/permission');
const nav = require('../../core/nav');
const pageTournamentSync = require('../../core/pageTournamentSync');
const matchPrimaryNav = require('../../core/matchPrimaryNav');
const shareMeta = require('../../core/shareMeta');
const flow = require('../../core/uxFlow');
const scheduleContract = require('../../core/scheduleContract');
const avatarDisplay = require('../../core/avatarDisplay');
const pageTimers = require('../../core/pageTimers');
const uiPreferences = require('../../core/uiPreferences');

const PLAYER_FILTER_OPTIONS = [
  { value: 'contains', label: '含有' },
  { value: 'not_contains', label: '不含' }
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: '全部对阵' },
  { value: 'pending', label: '待完成' },
  { value: 'current', label: '比赛中' },
  { value: 'finished', label: '已结束' }
];

const CURRENT_ROUND_SELECTOR = '.round-card-current';
const CURRENT_ROUND_FOCUS_TIMER = 'currentRoundFocus';

function asName(p) {
  if (!p) return '未知';
  if (typeof p === 'string') return p;
  return playerUtils.safePlayerName(p) || '未知';
}

function buildFallbackPlayer(name) {
  return { id: '', name: String(name || '').trim() || '待定' };
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

function buildTeamUi(players, fallbackName, avatarCache = {}) {
  const list = Array.isArray(players) ? players : [];
  const roster = list.length ? list : (fallbackName ? [buildFallbackPlayer(fallbackName)] : []);
  const names = roster.map(asName).filter(Boolean);
  const actualPlayerIds = list.map((player) => playerUtils.extractPlayerId(player)).filter(Boolean);
  return {
    avatarItems: roster.slice(0, 2).map((player) => avatarDisplay.buildAvatarDisplay(player, avatarCache)),
    primaryName: names[0] || String(fallbackName || '').trim() || '待定',
    secondaryName: names.length > 1 ? `/ ${names.slice(1).join(' / ')}` : '',
    text: names.length ? names.join(' / ') : (String(fallbackName || '').trim() || '待定'),
    playerIds: actualPlayerIds
  };
}

function buildScoreUi(score, finished) {
  if (!finished || score.a === null || score.b === null) {
    return {
      showScore: false,
      leftScoreText: '',
      rightScoreText: '',
      leftScoreClass: '',
      rightScoreClass: ''
    };
  }
  return {
    showScore: true,
    leftScoreText: String(score.a),
    rightScoreText: String(score.b),
    leftScoreClass: score.a > score.b ? 'score-win' : '',
    rightScoreClass: score.b > score.a ? 'score-win' : ''
  };
}

function decorateRounds(t, options = {}) {
  const rounds = Array.isArray(t.rounds) ? t.rounds : [];
  const players = Array.isArray(t.players) ? t.players : [];
  const playerNameMap = {};
  for (const player of players) {
    const id = String((player && player.id) || '').trim();
    if (!id) continue;
    playerNameMap[id] = asName(player);
  }
  const avatarCache = options.avatarCache || {};

  return rounds.map((round) => {
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    const rest = Array.isArray(round && round.restPlayers) ? round.restPlayers : [];

    const matchesUi = matches.map((match, idx) => {
      const teamA = Array.isArray(match && match.teamA) ? match.teamA : [];
      const teamB = Array.isArray(match && match.teamB) ? match.teamB : [];
      const unitAName = String((match && match.unitAName) || '').trim();
      const unitBName = String((match && match.unitBName) || '').trim();
      const leftTeam = buildTeamUi(teamA, unitAName, avatarCache);
      const rightTeam = buildTeamUi(teamB, unitBName, avatarCache);

      const status = String((match && match.status) || 'pending').trim() || 'pending';
      const finished = status === 'finished';
      const canceled = status === 'canceled';
      const score = extractScore(match);
      const scorerId = String((match && match.scorerId) || '').trim();
      const scorerName = String((match && match.scorerName) || '').trim() || playerNameMap[scorerId] || '';
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
        key: `${round.roundIndex || 0}-${match.matchIndex ?? idx}`,
        roundIndex: round.roundIndex || 0,
        matchIndex: (match.matchIndex ?? idx),
        status,
        title: `第 ${(match.matchIndex ?? idx) + 1} 场`,
        leftTeam,
        rightTeam,
        left: leftTeam.text,
        right: rightTeam.text,
        statusText,
        statusClass,
        focusBadgeText: '',
        isFirstPending: false,
        filterStage: 'pending',
        scorerText: (finished && scorerName) ? `本场裁判：${scorerName}` : '',
        playerIds: Array.from(new Set([].concat(leftTeam.playerIds, rightTeam.playerIds))),
        ...buildScoreUi(score, finished)
      };
    });

    return {
      roundIndex: round.roundIndex || 0,
      isCurrentRound: false,
      matchesUi,
      restText: rest.length ? `轮空：${rest.map(asName).join(' / ')}` : ''
    };
  });
}

function findFirstPending(roundsUi) {
  for (const r of (roundsUi || [])) {
    for (const m of (r.matchesUi || [])) {
      const status = String((m && m.status) || '').trim();
      if (m && status !== 'finished' && status !== 'canceled') {
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

function formatRoundOrdinal(roundNumber) {
  const round = Number(roundNumber) || 0;
  return round > 0 ? `第${round}轮` : '';
}

function buildHeroSummaryText(status, modeLabel, roundsSummary, firstPending) {
  if (status === 'draft') return `${modeLabel} · 尚未开始`;
  if (status === 'finished') {
    return roundsSummary.totalRounds
      ? `${modeLabel} · 共 ${roundsSummary.totalRounds} 轮`
      : `${modeLabel} · 已完成`;
  }
  const pendingRoundText = firstPending ? formatRoundOrdinal(Number(firstPending.roundIndex) + 1) : '';
  if (pendingRoundText) return `${modeLabel} · ${pendingRoundText}`;
  if (roundsSummary.totalRounds) return `${modeLabel} · ${formatRoundOrdinal(roundsSummary.totalRounds)}`;
  return `${modeLabel} · 进行中`;
}

function buildHeroPendingText(status, roundsSummary) {
  if (status === 'draft') return '开赛后将显示轮次与进度';
  if (!roundsSummary.totalMatches) return '暂无场次';
  if (status === 'finished') return `全部 ${roundsSummary.totalMatches} 场已录完`;
  if (roundsSummary.pendingMatches > 0) return `仍有 ${roundsSummary.pendingMatches} 场待录分`;
  return '当前轮次已全部录分';
}

function buildHeroProgressPercent(status, roundsSummary) {
  if (status === 'draft' || !roundsSummary.totalMatches) return -1;
  const ratio = roundsSummary.finishedMatches / roundsSummary.totalMatches;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

function markPendingFocus(roundsUi, firstPending) {
  return (roundsUi || []).map((round) => {
    const isCurrentRound = !!firstPending && Number(round && round.roundIndex) === Number(firstPending.roundIndex);
    return {
      ...round,
      isCurrentRound,
      matchesUi: (round && Array.isArray(round.matchesUi) ? round.matchesUi : []).map((match) => {
        const status = String((match && match.status) || '').trim();
        const isTerminal = status === 'finished' || status === 'canceled';
        const isFirstPending = !!firstPending &&
          Number(match && match.roundIndex) === Number(firstPending.roundIndex) &&
          Number(match && match.matchIndex) === Number(firstPending.matchIndex);
        return {
          ...match,
          isFirstPending,
          focusBadgeText: isFirstPending ? '优先录分' : '',
          filterStage: isTerminal ? 'finished' : (isCurrentRound ? 'current' : 'pending')
        };
      })
    };
  });
}

function getPlayerFilterLabel(mode) {
  const value = String(mode || 'contains').trim();
  const option = PLAYER_FILTER_OPTIONS.find((item) => item.value === value);
  return option ? option.label : PLAYER_FILTER_OPTIONS[0].label;
}

function getStatusFilterLabel(value) {
  const key = String(value || 'all').trim();
  const option = STATUS_FILTER_OPTIONS.find((item) => item.value === key);
  return option ? option.label : STATUS_FILTER_OPTIONS[0].label;
}

function buildSelectedPlayersUi(players, selectedPlayerIds, avatarCache = {}) {
  const ids = Array.isArray(selectedPlayerIds) ? selectedPlayerIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (!ids.length) return [];
  const playerMap = {};
  (Array.isArray(players) ? players : []).forEach((player) => {
    const id = playerUtils.extractPlayerId(player);
    if (!id) return;
    playerMap[id] = player;
  });
  return ids.map((id) => avatarDisplay.buildAvatarDisplay(playerMap[id] || { id, name: id }, avatarCache));
}

function matchPassesPlayerFilter(match, selectedPlayerIds, avatarFilterMode) {
  const selectedIds = Array.isArray(selectedPlayerIds) ? selectedPlayerIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (!selectedIds.length) return true;
  const playerIds = new Set(Array.isArray(match && match.playerIds) ? match.playerIds.map((id) => String(id || '').trim()).filter(Boolean) : []);
  if (String(avatarFilterMode || 'contains').trim() === 'not_contains') {
    return selectedIds.every((id) => !playerIds.has(id));
  }
  return selectedIds.every((id) => playerIds.has(id));
}

function matchPassesStatusFilter(match, statusFilter) {
  const value = String(statusFilter || 'all').trim();
  if (value === 'all') return true;
  return String((match && match.filterStage) || '').trim() === value;
}

function filterRoundsUi(roundsUi, selectedPlayerIds, avatarFilterMode, statusFilter) {
  return (roundsUi || []).map((round) => {
    const matchesUi = (Array.isArray(round && round.matchesUi) ? round.matchesUi : []).filter((match) => {
      return matchPassesPlayerFilter(match, selectedPlayerIds, avatarFilterMode) && matchPassesStatusFilter(match, statusFilter);
    });
    return {
      ...round,
      matchesUi
    };
  }).filter((round) => Array.isArray(round.matchesUi) && round.matchesUi.length);
}

function toggleSelectedPlayerId(currentIds, playerId) {
  const targetId = String(playerId || '').trim();
  const ids = Array.isArray(currentIds) ? currentIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (!targetId) return ids;
  if (ids.includes(targetId)) return ids.filter((id) => id !== targetId);
  return ids.concat(targetId);
}

const scheduleSyncController = pageTournamentSync.createTournamentSyncMethods();

Page({
  data: {
    tournamentId: '',
    tournament: null,
    statusText: '',
    statusClass: 'hero-status-draft',
    modeLabel: '',
    roundsUi: [],
    heroSummaryText: '',
    heroMatchText: '',
    heroPendingText: '',
    heroProgressPercent: -1,
    heroActionBusy: false,
    canEditScore: false,
    hasPending: false,
    firstPendingRoundIndex: -1,
    firstPendingMatchIndex: -1,
    nextActionKey: '',
    nextActionText: '',
    primaryNavCurrent: 'schedule',
    primaryNavItems: [],
    selectedPlayerIds: [],
    selectedPlayersUi: [],
    avatarFilterMode: 'contains',
    avatarFilterLabel: getPlayerFilterLabel('contains'),
    statusFilter: 'all',
    statusFilterLabel: getStatusFilterLabel('all'),
    showPlayerFilterSheet: false,
    playerFilterDraftMode: 'contains',
    showStatusFilterSheet: false,
    statusFilterDraftValue: 'all',
    playerFilterOptions: PLAYER_FILTER_OPTIONS,
    statusFilterOptions: STATUS_FILTER_OPTIONS,
    showFilterBar: false,
    filterEmptyText: '',
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
    syncStatusActionText: '刷新',
    motionLevel: 'standard',
    listDensity: 'comfortable',
    uiMotionClass: 'motion-standard',
    uiDensityClass: 'density-comfortable',
    uiPreferenceClass: 'motion-standard density-comfortable'
  },

  ...scheduleSyncController,

  onLoad(options) {
    const tid = options.tournamentId;
    this.openid = (getApp().globalData.openid || storage.get('openid', ''));
    this.ensureAvatarRuntime();
    pageTournamentSync.initTournamentSync(this);
    this.setData({
      tournamentId: tid,
      primaryNavItems: matchPrimaryNav.getPrimaryNavItems('schedule', tid),
      ...uiPreferences.readUiPreferencePatch()
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
    pageTimers.clearNamedTimer(this, CURRENT_ROUND_FOCUS_TIMER);
    if (this.data.showPlayerFilterSheet || this.data.showStatusFilterSheet) {
      this.setData({
        showPlayerFilterSheet: false,
        showStatusFilterSheet: false,
        playerFilterDraftMode: this.data.avatarFilterMode,
        statusFilterDraftValue: this.data.statusFilter
      });
    }
  },

  onShow() {
    this.refreshUiPreferences();
    const currentId = String(this.data.tournamentId || '').trim();
    if (this.data.heroActionBusy) this.setData({ heroActionBusy: false });
    nav.consumeRefreshFlag(currentId);
    // 兜底刷新：从录入比分页返回时，确保状态与比分是最新的
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.hasActiveWatch(this.data.tournamentId)) this.startWatch(this.data.tournamentId);
  },

  refreshUiPreferences() {
    this.setData(uiPreferences.readUiPreferencePatch());
  },

  onUnload() {
    pageTournamentSync.teardownTournamentSync(this);
    pageTimers.clearNamedTimer(this, CURRENT_ROUND_FOCUS_TIMER);
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
    this._avatarResolveGen = Number(this._avatarResolveGen || 0) + 1;
  },

  applyTournament(t) {
    if (!t) return;
    this.ensureAvatarRuntime();
    t = normalize.normalizeTournament(t);
    const tournamentName = flow.getTournamentDisplayName(t, '未命名赛事');
    if (tournamentName !== String(t.name || '').trim()) {
      t = { ...t, name: tournamentName };
    }

    const status = t.status || 'draft';
    const modeLabel = flow.getModeDisplayLabel(t.mode || flow.MODE_MULTI_ROTATE, t.presetKey);
    let statusText = '尚未开始';
    let statusClass = 'hero-status-draft';
    if (status === 'running') { statusText = '进行中'; statusClass = 'hero-status-running'; }
    if (status === 'finished') { statusText = '已完成'; statusClass = 'hero-status-finished'; }

    const rawRoundsUi = decorateRounds(t, { avatarCache: this.avatarCache || {} });
    const firstPending = findFirstPending(rawRoundsUi);
    const focusedRoundsUi = markPendingFocus(rawRoundsUi, firstPending);
    const roundsSummary = summarizeRounds(focusedRoundsUi);
    const canEditScore = perm.canEditScore(t, this.openid);
    const displayTotalMatches = scheduleContract.resolveDisplayTotalMatches(t, roundsSummary.totalMatches);
    const heroSummary = {
      ...roundsSummary,
      totalMatches: displayTotalMatches
    };
    let nextActionKey = '';
    let nextActionText = '';
    if (status === 'running' && canEditScore && firstPending) {
      nextActionKey = 'batch';
      nextActionText = '继续录分';
    }

    const heroSummaryText = buildHeroSummaryText(status, modeLabel, heroSummary, firstPending);
    const heroMatchText = heroSummary.totalMatches
      ? `${heroSummary.finishedMatches} / ${heroSummary.totalMatches} 场`
      : '暂无场次';
    const heroPendingText = buildHeroPendingText(status, heroSummary);
    const heroProgressPercent = buildHeroProgressPercent(status, heroSummary);
    const selectedPlayerIds = Array.isArray(this.data.selectedPlayerIds) ? this.data.selectedPlayerIds : [];
    const avatarFilterMode = String(this.data.avatarFilterMode || 'contains').trim() || 'contains';
    const statusFilter = String(this.data.statusFilter || 'all').trim() || 'all';
    const roundsUi = filterRoundsUi(focusedRoundsUi, selectedPlayerIds, avatarFilterMode, statusFilter);
    const selectedPlayersUi = buildSelectedPlayersUi(t.players, selectedPlayerIds, this.avatarCache || {});
    const showFilterBar = roundsSummary.totalMatches > 0;
    const hasActiveFilter = selectedPlayerIds.length > 0 || statusFilter !== 'all';
    const filterEmptyText = showFilterBar && hasActiveFilter && !roundsUi.length ? '暂无符合条件的对阵' : '';

    this.setData({
      loadError: false,
      tournament: t,
      statusText,
      statusClass,
      modeLabel,
      roundsUi,
      heroSummaryText,
      heroMatchText,
      heroPendingText,
      heroProgressPercent,
      canEditScore,
      hasPending: !!firstPending,
      firstPendingRoundIndex: firstPending ? firstPending.roundIndex : -1,
      firstPendingMatchIndex: firstPending ? firstPending.matchIndex : -1,
      nextActionKey,
      nextActionText,
      selectedPlayersUi,
      avatarFilterLabel: getPlayerFilterLabel(avatarFilterMode),
      statusFilterLabel: getStatusFilterLabel(statusFilter),
      showFilterBar,
      filterEmptyText,
      primaryNavItems: matchPrimaryNav.getPrimaryNavItems('schedule', this.data.tournamentId)
    });
    this.scheduleCurrentRoundFocus(firstPending, roundsUi);
    this.refreshAvatarDisplays();
  },

  scheduleCurrentRoundFocus(firstPending, visibleRoundsUi) {
    const roundIndex = firstPending ? Number(firstPending.roundIndex) : -1;
    if (!Number.isFinite(roundIndex) || roundIndex < 0) {
      this._lastAutoFocusedRoundIndex = -1;
      pageTimers.clearNamedTimer(this, CURRENT_ROUND_FOCUS_TIMER);
      return;
    }
    const hasVisibleCurrentRound = (Array.isArray(visibleRoundsUi) ? visibleRoundsUi : []).some((round) => {
      return !!(round && round.isCurrentRound) && Number(round.roundIndex) === roundIndex;
    });
    if (!hasVisibleCurrentRound) return;
    if (Number(this._lastAutoFocusedRoundIndex) === roundIndex) return;
    if (typeof wx === 'undefined' || typeof wx.pageScrollTo !== 'function') return;
    this._lastAutoFocusedRoundIndex = roundIndex;
    pageTimers.setNamedTimer(this, CURRENT_ROUND_FOCUS_TIMER, () => {
      const currentRound = Number(this.data.firstPendingRoundIndex);
      const stillVisible = (Array.isArray(this.data.roundsUi) ? this.data.roundsUi : []).some((round) => {
        return !!(round && round.isCurrentRound) && Number(round.roundIndex) === roundIndex;
      });
      if (currentRound !== roundIndex || !stillVisible) return;
      wx.pageScrollTo({
        selector: CURRENT_ROUND_SELECTOR,
        duration: 220
      });
    }, 90);
  },

  ensureAvatarRuntime() {
    if (!this.avatarCache || typeof this.avatarCache !== 'object') this.avatarCache = {};
    if (!Number.isFinite(this._avatarResolveGen)) this._avatarResolveGen = 0;
  },

  async refreshAvatarDisplays() {
    this.ensureAvatarRuntime();
    const sourceTournament = this._latestTournament || this.data.tournament;
    const pending = avatarDisplay.collectCloudAvatarFileIds({
      roundsUi: this.data.roundsUi,
      selectedPlayersUi: this.data.selectedPlayersUi
    }, this.avatarCache);
    if (!pending.length) return;
    const generation = Number(this._avatarResolveGen || 0) + 1;
    this._avatarResolveGen = generation;
    const result = await avatarDisplay.resolveCloudAvatarFileIds(pending, this.avatarCache);
    if (!result.updated || this._avatarResolveGen !== generation) return;
    if (sourceTournament) this.applyTournament(sourceTournament);
  },

  onAvatarImageError(e) {
    this.ensureAvatarRuntime();
    const raw = String(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.avatarRaw || '').trim();
    if (avatarDisplay.isCloudAvatar(raw)) {
      avatarDisplay.markAvatarUrlFailed(this.avatarCache, raw);
      this.reapplyTournament();
    }
  },

  reapplyTournament() {
    const tournament = this._latestTournament || this.data.tournament;
    if (tournament) this.applyTournament(tournament);
  },

  onHeroActionTap() {
    if (this.data.heroActionBusy) return false;
    const key = String(this.data.nextActionKey || '').trim();
    if (!key) return false;
    this.setData({ heroActionBusy: true });
    if (key === 'batch') {
      const handled = this.goBatchScoring();
      if (!handled) this.setData({ heroActionBusy: false });
      return handled;
    }
    if (key === 'analytics') {
      nav.redirectOrNavigate(nav.buildTournamentUrl('/pages/analytics/index', this.data.tournamentId));
      return true;
    }
    this.setData({ heroActionBusy: false });
    return false;
  },

  openMatch(e) {
    const roundIndex = e.currentTarget.dataset.round;
    const matchIndex = e.currentTarget.dataset.match;
    const status = String((e.currentTarget.dataset.status || '')).trim();
    if (status === 'canceled') {
      wx.showToast({ title: '该场已取消', icon: 'none' });
      return false;
    }
    const batch = Number(e.currentTarget.dataset.batch) === 1;
    wx.navigateTo({
      url: nav.buildTournamentUrl('/pages/match/index', this.data.tournamentId, {
        roundIndex,
        matchIndex,
        batch: batch ? 1 : ''
      }),
      fail: () => {
        if (this.data.heroActionBusy) this.setData({ heroActionBusy: false });
      }
    });
    return true;
  },

  onMatchPlayerAvatarTap(e) {
    const playerId = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.playerId) || '').trim();
    if (!playerId) return false;
    this.setData({
      selectedPlayerIds: toggleSelectedPlayerId(this.data.selectedPlayerIds, playerId)
    });
    this.reapplyTournament();
    return false;
  },

  onSelectedPlayerTap(e) {
    return this.onMatchPlayerAvatarTap(e);
  },

  onClearSelectedPlayers() {
    if (!Array.isArray(this.data.selectedPlayerIds) || !this.data.selectedPlayerIds.length) return false;
    this.setData({ selectedPlayerIds: [] });
    this.reapplyTournament();
    return false;
  },

  openPlayerFilterSheet() {
    this.setData({
      showPlayerFilterSheet: true,
      playerFilterDraftMode: this.data.avatarFilterMode || 'contains'
    });
  },

  closePlayerFilterSheet() {
    this.setData({
      showPlayerFilterSheet: false,
      playerFilterDraftMode: this.data.avatarFilterMode || 'contains'
    });
  },

  onPickPlayerFilterMode(e) {
    const value = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.value) || '').trim();
    if (!value) return;
    this.setData({ playerFilterDraftMode: value });
  },

  confirmPlayerFilterSheet() {
    const nextMode = String(this.data.playerFilterDraftMode || 'contains').trim() || 'contains';
    this.setData({
      showPlayerFilterSheet: false,
      avatarFilterMode: nextMode,
      avatarFilterLabel: getPlayerFilterLabel(nextMode)
    });
    this.reapplyTournament();
  },

  openStatusFilterSheet() {
    this.setData({
      showStatusFilterSheet: true,
      statusFilterDraftValue: this.data.statusFilter || 'all'
    });
  },

  closeStatusFilterSheet() {
    this.setData({
      showStatusFilterSheet: false,
      statusFilterDraftValue: this.data.statusFilter || 'all'
    });
  },

  onPickStatusFilter(e) {
    const value = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.value) || '').trim();
    if (!value) return;
    this.setData({ statusFilterDraftValue: value });
  },

  confirmStatusFilterSheet() {
    const nextValue = String(this.data.statusFilterDraftValue || 'all').trim() || 'all';
    this.setData({
      showStatusFilterSheet: false,
      statusFilter: nextValue,
      statusFilterLabel: getStatusFilterLabel(nextValue)
    });
    this.reapplyTournament();
  },

  goBatchScoring() {
    if (!this.data.canEditScore) return false;
    if (!this.data.hasPending) {
      wx.showToast({ title: '当前没有待录分比赛', icon: 'none' });
      return false;
    }
    return this.openMatch({
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
