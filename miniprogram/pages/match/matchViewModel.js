const perm = require('../../permission/permission');
const { normalizeTournament, safePlayerName } = require('../../core/normalize');
const modeHelper = require('../../core/mode');

const SCORE_MAX = 60;
const DEFAULT_POINTS_PER_GAME = 21;
const QUICK_SCORE_PRESETS = Object.freeze({
  11: Object.freeze([
    Object.freeze({ label: '11:9', a: 11, b: 9 }),
    Object.freeze({ label: '11:7', a: 11, b: 7 }),
    Object.freeze({ label: '11:4', a: 11, b: 4 }),
    Object.freeze({ label: '9:11', a: 9, b: 11 })
  ]),
  15: Object.freeze([
    Object.freeze({ label: '15:13', a: 15, b: 13 }),
    Object.freeze({ label: '15:11', a: 15, b: 11 }),
    Object.freeze({ label: '15:8', a: 15, b: 8 }),
    Object.freeze({ label: '13:15', a: 13, b: 15 })
  ]),
  21: Object.freeze([
    Object.freeze({ label: '21:19', a: 21, b: 19 }),
    Object.freeze({ label: '21:17', a: 21, b: 17 }),
    Object.freeze({ label: '21:15', a: 21, b: 15 }),
    Object.freeze({ label: '21:10', a: 21, b: 10 }),
    Object.freeze({ label: '19:21', a: 19, b: 21 })
  ])
});

function buildScoreOptions() {
  return Array.from({ length: SCORE_MAX + 1 }, (_, i) => i);
}

function normalizePointsPerGame(value) {
  const points = Number(value);
  if (Object.prototype.hasOwnProperty.call(QUICK_SCORE_PRESETS, points)) return points;
  return DEFAULT_POINTS_PER_GAME;
}

function buildQuickScoreOptions(pointsPerGame) {
  const normalizedPoints = normalizePointsPerGame(pointsPerGame);
  return QUICK_SCORE_PRESETS[normalizedPoints].map((item) => ({ ...item }));
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const v = Math.floor(n);
  if (v < 0) return 0;
  if (v > SCORE_MAX) return SCORE_MAX;
  return v;
}

function extractScorePair(obj) {
  if (!obj) return { a: null, b: null };
  const pick = (value) => {
    if (value === 0 || value === '0') return 0;
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : null;
  };
  const aVal = (obj.teamAScore ?? obj.scoreA ?? obj.a ?? obj.left ?? obj.teamA);
  const bVal = (obj.teamBScore ?? obj.scoreB ?? obj.b ?? obj.right ?? obj.teamB);
  return { a: pick(aVal), b: pick(bVal) };
}

function formatRemaining(remainingMs) {
  const ms = Number(remainingMs) || 0;
  if (ms <= 0) return '0秒';
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return `${seconds}秒`;
}

function normalizeLockState(state) {
  const s = String(state || '').trim();
  if (s === 'locked_by_me') return s;
  if (s === 'locked_by_other') return s;
  if (s === 'submitting') return s;
  if (s === 'finished') return s;
  if (s === 'forbidden') return s;
  return 'idle';
}

function buildLockHint(state, ownerName, remainingMs) {
  const s = normalizeLockState(state);
  const name = String(ownerName || '').trim();
  if (s === 'locked_by_me') return '你正在录入比分';
  if (s === 'locked_by_other') {
    const display = name || '其他成员';
    return `${display} 正在录入比分（剩余${formatRemaining(remainingMs)}）`;
  }
  if (s === 'submitting') return '正在提交比分...';
  if (s === 'finished') return '该场已录完';
  if (s === 'forbidden') return '仅管理员或参赛成员可录分';
  return '点击“开始录分”即可进入录分';
}

function buildClientRequestId() {
  return `submit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildMatchKey(tournamentId, roundIndex, matchIndex) {
  return `${String(tournamentId || '').trim()}_${Number(roundIndex)}_${Number(matchIndex)}`;
}

function buildInitialData() {
  return {
    tournamentId: '',
    tournamentName: '',
    roundIndex: 0,
    matchIndex: 0,
    match: null,
    scoreA: 0,
    scoreB: 0,
    scoreAIndex: 0,
    scoreBIndex: 0,
    scoreOptions: buildScoreOptions(),
    canUndo: false,
    displayScoreA: '-',
    displayScoreB: '-',
    quickScoreOptions: buildQuickScoreOptions(DEFAULT_POINTS_PER_GAME),
    canEdit: false,
    userCanScore: false,
    isAdmin: false,
    pair1Text: '',
    pair2Text: '',
    batchMode: false,
    networkOffline: false,
    showStaleSyncHint: false,
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
    canRetryAction: false,
    lastFailedActionText: '',
    loadError: false,
    lockState: 'idle',
    lockOwnerId: '',
    lockOwnerName: '',
    lockExpireAt: 0,
    lockRemainingMs: 0,
    lockHintText: buildLockHint('idle', '', 0),
    lockActionText: '开始录分',
    canUseScoreLock: false,
    lockBusy: false,
    submitBusy: false,
    matchStatusText: '待录分',
    pointsPerGame: DEFAULT_POINTS_PER_GAME
  };
}

function buildTournamentViewState(tournament, options = {}) {
  if (!tournament) return null;
  let nt = normalizeTournament(tournament);
  const tournamentName = modeHelper.getTournamentDisplayName(nt, '未命名赛事');
  if (tournamentName !== String(nt.name || '').trim()) {
    nt = { ...nt, name: tournamentName };
  }
  const roundIndex = Number(options.roundIndex) || 0;
  const matchIndex = Number(options.matchIndex) || 0;
  const lockState = normalizeLockState(options.lockState);
  const openid = String(options.openid || '').trim();
  const draft = options.draft || null;
  const hasDraft = !!(draft && typeof draft === 'object');
  const currentScoreA = clampScore(options.currentScoreA);
  const currentScoreB = clampScore(options.currentScoreB);
  const undoSize = Math.max(0, Number(options.undoSize) || 0);

  const round = (nt.rounds || [])[roundIndex];
  const rawMatch = round && (round.matches || []).find((item) => Number(item.matchIndex) === matchIndex);
  const userCanScore = perm.canEditScore(nt, openid);
  const isAdmin = perm.isAdmin(nt, openid);

  let match = rawMatch || null;
  let pair1Text = '';
  let pair2Text = '';

  if (match) {
    const teamA = (match.teamA || []).map((player) => ({ ...player, name: safePlayerName(player) }));
    const teamB = (match.teamB || []).map((player) => ({ ...player, name: safePlayerName(player) }));
    match = { ...match, teamA, teamB };
    const aNames = teamA.map((player) => player.name).filter(Boolean);
    const bNames = teamB.map((player) => player.name).filter(Boolean);
    pair1Text = aNames.length ? aNames.join(' / ') : '待定';
    pair2Text = bNames.length ? bNames.join(' / ') : '待定';
  }

  if (!match) {
    return {
      tournament: nt,
      lockTransition: (!userCanScore && lockState !== 'forbidden') ? 'forbidden' : '',
      shouldClearDraft: false,
      shouldSyncLock: false,
      lockSyncKey: '',
      data: {
        loadError: false,
        tournamentName,
        match: null,
        userCanScore,
        isAdmin,
        canEdit: false,
        lockActionText: '开始录分',
        canUseScoreLock: false,
        pair1Text,
        pair2Text
      }
    };
  }

  const pointsPerGame = normalizePointsPerGame(nt.rules && nt.rules.pointsPerGame);
  const matchStatus = String(match.status || '').trim();
  const finished = matchStatus === 'finished';
  const canceled = matchStatus === 'canceled';
  const matchStatusText = matchStatus === 'canceled' ? '已取消' : (matchStatus === 'finished' ? '已完赛' : '待录分');
  const canUseScoreLock = !canceled;
  const lockActionText = finished ? '修改比分' : '开始录分';

  let lockTransition = '';
  if (canceled && lockState !== 'finished') lockTransition = 'finished';
  else if (!userCanScore && lockState !== 'forbidden') lockTransition = 'forbidden';
  else if (userCanScore && (lockState === 'forbidden' || lockState === 'finished')) lockTransition = 'idle';

  const canEdit = userCanScore && !canceled && lockState === 'locked_by_me';
  const scorePair = extractScorePair(match && (match.score || match));
  const hasServerScore = scorePair.a !== null && scorePair.b !== null;

  let scoreA = currentScoreA;
  let scoreB = currentScoreB;

  if (canceled) {
    if (hasServerScore) {
      scoreA = clampScore(scorePair.a);
      scoreB = clampScore(scorePair.b);
    }
  } else if (canEdit) {
    if (hasDraft) {
      scoreA = clampScore(draft.scoreA);
      scoreB = clampScore(draft.scoreB);
    } else if (hasServerScore) {
      scoreA = clampScore(scorePair.a);
      scoreB = clampScore(scorePair.b);
    }
  } else if (finished) {
    if (hasServerScore) {
      scoreA = clampScore(scorePair.a);
      scoreB = clampScore(scorePair.b);
    }
  } else if (userCanScore && hasDraft) {
    scoreA = clampScore(draft.scoreA);
    scoreB = clampScore(draft.scoreB);
  } else if (hasServerScore) {
    scoreA = clampScore(scorePair.a);
    scoreB = clampScore(scorePair.b);
  }

  const showDraftPreview = !finished && !canceled && !canEdit && userCanScore && hasDraft;
  const displayScoreA = (canEdit || finished || canceled || hasServerScore || showDraftPreview) ? String(scoreA) : '-';
  const displayScoreB = (canEdit || finished || canceled || hasServerScore || showDraftPreview) ? String(scoreB) : '-';

  return {
    tournament: nt,
    lockTransition,
    shouldClearDraft: canceled,
    shouldSyncLock: canUseScoreLock && userCanScore,
    lockSyncKey: buildMatchKey(options.tournamentId, roundIndex, matchIndex),
    data: {
      loadError: false,
      tournamentName,
      match,
      matchStatusText,
      pointsPerGame,
      quickScoreOptions: buildQuickScoreOptions(pointsPerGame),
      userCanScore,
      isAdmin,
      canEdit,
      lockActionText,
      canUseScoreLock,
      scoreA,
      scoreB,
      scoreAIndex: scoreA,
      scoreBIndex: scoreB,
      displayScoreA,
      displayScoreB,
      pair1Text,
      pair2Text,
      canUndo: canEdit ? undoSize > 0 : false
    }
  };
}

module.exports = {
  SCORE_MAX,
  buildInitialData,
  buildQuickScoreOptions,
  clampScore,
  extractScorePair,
  formatRemaining,
  normalizeLockState,
  buildLockHint,
  buildClientRequestId,
  buildMatchKey,
  buildTournamentViewState
};
