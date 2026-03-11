const perm = require('../../permission/permission');
const { normalizeTournament, safePlayerName } = require('../../core/normalize');

const SCORE_MAX = 60;

function buildScoreOptions() {
  return Array.from({ length: SCORE_MAX + 1 }, (_, i) => i);
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
    lockBusy: false,
    submitBusy: false,
    matchStatusText: '待录分',
    pointsPerGame: 21
  };
}

function buildTournamentViewState(tournament, options = {}) {
  if (!tournament) return null;
  const nt = normalizeTournament(tournament);
  const roundIndex = Number(options.roundIndex) || 0;
  const matchIndex = Number(options.matchIndex) || 0;
  const lockState = normalizeLockState(options.lockState);
  const openid = String(options.openid || '').trim();
  const draft = options.draft || null;
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
        tournamentName: nt.name,
        match: null,
        userCanScore,
        isAdmin,
        canEdit: false,
        pair1Text,
        pair2Text
      }
    };
  }

  const matchStatus = String(match.status || '').trim();
  const finished = matchStatus === 'finished' || matchStatus === 'canceled';
  const matchStatusText = matchStatus === 'canceled' ? '已取消' : (matchStatus === 'finished' ? '已完赛' : '待录分');

  let lockTransition = '';
  if (finished && lockState !== 'finished') lockTransition = 'finished';
  else if (!userCanScore && lockState !== 'forbidden') lockTransition = 'forbidden';
  else if (userCanScore && lockState === 'forbidden') lockTransition = 'idle';

  const canEdit = userCanScore && !finished && lockState === 'locked_by_me';
  const scorePair = extractScorePair(match && (match.score || match));
  const hasServerScore = scorePair.a !== null && scorePair.b !== null;

  let scoreA = currentScoreA;
  let scoreB = currentScoreB;

  if (finished) {
    if (hasServerScore) {
      scoreA = clampScore(scorePair.a);
      scoreB = clampScore(scorePair.b);
    }
  } else if (canEdit) {
    if (draft) {
      scoreA = clampScore(draft.scoreA);
      scoreB = clampScore(draft.scoreB);
    } else if (hasServerScore) {
      scoreA = clampScore(scorePair.a);
      scoreB = clampScore(scorePair.b);
    }
  } else if (hasServerScore) {
    scoreA = clampScore(scorePair.a);
    scoreB = clampScore(scorePair.b);
  }

  const displayScoreA = (canEdit || finished || hasServerScore) ? String(scoreA) : '-';
  const displayScoreB = (canEdit || finished || hasServerScore) ? String(scoreB) : '-';

  return {
    tournament: nt,
    lockTransition,
    shouldClearDraft: finished,
    shouldSyncLock: !finished && userCanScore,
    lockSyncKey: buildMatchKey(options.tournamentId, roundIndex, matchIndex),
    data: {
      loadError: false,
      tournamentName: nt.name,
      match,
      matchStatusText,
      pointsPerGame: Math.max(1, Number(nt.rules && nt.rules.pointsPerGame) || 21),
      userCanScore,
      isAdmin,
      canEdit,
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
  clampScore,
  extractScorePair,
  formatRemaining,
  normalizeLockState,
  buildLockHint,
  buildClientRequestId,
  buildMatchKey,
  buildTournamentViewState
};
