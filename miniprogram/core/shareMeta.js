const normalize = require('./normalize');
const flow = require('./uxFlow');
const ranking = require('./ranking');
const playerUtils = require('./playerUtils');

function normalizeLifecycleStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'draft') return 'draft';
  if (value === 'running') return 'running';
  if (value === 'finished') return 'finished';
  return 'unavailable';
}

function formatDateTime(value) {
  try {
    const input = String(value || '').trim();
    if (!input) return '未设置';
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return '未设置';
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  } catch (_) {
    return '未设置';
  }
}

function pickFirstText(source, keys = []) {
  const base = source && typeof source === 'object' ? source : {};
  for (const key of keys) {
    const value = String(base[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function resolveOrganizerName(tournament) {
  const t = tournament && typeof tournament === 'object' ? tournament : {};
  const players = Array.isArray(t.players) ? t.players : [];
  const creatorId = String(t.creatorId || '').trim();
  const creator = players.find((player) => playerUtils.extractPlayerId(player) === creatorId);
  return playerUtils.safePlayerName(creator || {}) || '赛事组织者';
}

function countRoundProgress(rounds) {
  const list = Array.isArray(rounds) ? rounds : [];
  let totalMatches = 0;
  let finishedMatches = 0;
  let totalRounds = 0;
  let completedRounds = 0;
  for (const round of list) {
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    if (!matches.length) continue;
    totalRounds += 1;
    let roundFinished = 0;
    for (const match of matches) {
      totalMatches += 1;
      const status = String(match && match.status || '').trim();
      if (status === 'finished' || status === 'canceled') {
        finishedMatches += 1;
        roundFinished += 1;
      }
    }
    if (roundFinished === matches.length) completedRounds += 1;
  }
  return {
    totalMatches,
    finishedMatches,
    totalRounds,
    completedRounds
  };
}

function buildRankingPreview(tournament, limit = 3) {
  const rows = ranking.normalizeCurrentRankings(tournament || {});
  return rows.slice(0, limit).map((row, idx) => ({
    rank: idx + 1,
    name: String(row && row.name || '').trim() || '未命名',
    wins: Number(row && row.wins) || 0,
    losses: Number(row && row.losses) || 0,
    played: Number(row && row.played) || 0,
    pointDiff: Number(row && row.pointDiff) || 0,
    entityType: String(row && row.entityType || '').trim() || 'player'
  }));
}

function resolveCurrentRoundText(rounds, lifecycle = 'draft') {
  const list = Array.isArray(rounds) ? rounds : [];
  if (!list.length) {
    return lifecycle === 'draft' ? '尚未开赛' : '暂无轮次信息';
  }
  for (const round of list) {
    const roundIndex = Number(round && round.roundIndex);
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    if (matches.some((match) => {
      const status = String(match && match.status || '').trim();
      return status !== 'finished' && status !== 'canceled';
    })) {
      return `当前第 ${Number.isFinite(roundIndex) ? roundIndex + 1 : 1} 轮`;
    }
  }
  return `共 ${list.length} 轮`;
}

function buildShareMessage(tournament) {
  const t = tournament && typeof tournament === 'object' ? normalize.normalizeTournament(tournament) : null;
  const tournamentName = String(t && t.name || '').trim() || '羽毛球比赛';
  return {
    title: `${tournamentName} · 查看比赛`,
    intent: 'view',
    panelTitle: '转发比赛',
    badgeText: '比赛',
    buttonText: '转发',
    path: `/pages/share-entry/index?tournamentId=${encodeURIComponent(String(t && t._id || '').trim())}`
  };
}

function buildPrimaryAction({ lifecycle, joined, joinAllowed }) {
  if (joined) return { key: 'enter', text: '进入比赛' };
  if (joinAllowed) return { key: 'join', text: '加入比赛' };
  if (lifecycle === 'draft') return { key: 'retry', text: '重新加载' };
  return { key: 'view', text: '查看比赛' };
}

function buildStatusText(lifecycle) {
  if (lifecycle === 'draft') return '未开始';
  if (lifecycle === 'running') return '进行中';
  if (lifecycle === 'finished') return '已结束';
  return '不可用';
}

function buildStatusClass(lifecycle) {
  if (lifecycle === 'draft') return 'tag-draft';
  if (lifecycle === 'running') return 'tag-running';
  if (lifecycle === 'finished') return 'tag-finished';
  return 'tag-muted';
}

function buildPreviewMode({ lifecycle, joined, joinAllowed }) {
  if (joined) return 'joined-entry';
  if (joinAllowed) return 'join-preview';
  if (lifecycle === 'running' || lifecycle === 'finished') return 'join-closed';
  return 'invalid-match';
}

function buildAvailabilityText({ lifecycle, joined, joinAllowed }) {
  if (joined) return '你已在名单中，可直接进入比赛。';
  if (joinAllowed) return '确认后才会加入比赛名单。';
  if (lifecycle === 'running' || lifecycle === 'finished') return '当前不可加入，可先查看比赛信息。';
  return '当前无法打开这场比赛，请稍后重试。';
}

function buildInvalidShareEntryState(reason = '未找到赛事') {
  return {
    viewMode: 'invalid-match',
    viewModeLabel: '链接异常',
    headline: reason,
    subtitle: '链接可能已失效、比赛已删除，或当前参数不完整。',
    statusText: '不可用',
    statusClass: 'tag-muted',
    primaryAction: { key: 'retry', text: '重新加载' },
    secondaryAction: { key: 'home', text: '返回首页' },
    joinAllowed: false,
    joined: false,
    availabilityText: '当前无法打开这场比赛，请确认链接是否有效。',
    tournamentName: '比赛信息不可用',
    organizerName: '赛事组织者',
    modeLabel: '未识别',
    playersCountText: '—',
    venueText: '未设置',
    timeText: '未设置',
    progressText: '暂无比赛信息',
    roundsText: '—',
    rankingsPreview: [],
    rankingTitle: '比赛摘要',
    showRankingPreview: false,
    showProgressSummary: false,
    tournament: null
  };
}

function buildRetryableShareEntryState(reason = '同步失败，请稍后重试') {
  return {
    viewMode: 'retryable-error',
    viewModeLabel: '同步失败',
    headline: reason,
    subtitle: '比赛信息暂时同步失败，你可以重新加载或稍后再试。',
    statusText: '暂不可用',
    statusClass: 'tag-muted',
    primaryAction: { key: 'retry', text: '重新加载' },
    secondaryAction: { key: 'home', text: '返回首页' },
    joinAllowed: false,
    joined: false,
    availabilityText: '当前无法同步比赛信息，请确认网络后重试。',
    tournamentName: '比赛信息同步失败',
    organizerName: '赛事组织者',
    modeLabel: '未识别',
    playersCountText: '—',
    venueText: '未设置',
    timeText: '未设置',
    progressText: '暂无比赛信息',
    roundsText: '—',
    rankingsPreview: [],
    rankingTitle: '比赛摘要',
    showRankingPreview: false,
    showProgressSummary: false,
    tournament: null
  };
}

function buildShareEntryViewModel({ tournament, openid = '' }) {
  if (!tournament || typeof tournament !== 'object') {
    return buildInvalidShareEntryState();
  }
  const normalizedTournament = normalize.normalizeTournament(tournament);
  const lifecycle = normalizeLifecycleStatus(normalizedTournament.status);
  if (lifecycle === 'unavailable') {
    return buildInvalidShareEntryState('比赛当前不可用');
  }

  const joined = playerUtils.isParticipantInTournament(normalizedTournament, openid);
  const joinAllowed = lifecycle === 'draft';
  const previewMode = buildPreviewMode({ lifecycle, joined, joinAllowed });
  const viewModeLabelMap = {
    'join-preview': '未加入',
    'joined-entry': '已加入',
    'join-closed': '未加入',
    'invalid-match': '链接异常'
  };
  const progress = countRoundProgress(normalizedTournament.rounds);
  const rankingsPreview = lifecycle === 'draft' ? [] : buildRankingPreview(normalizedTournament);
  const organizerName = resolveOrganizerName(normalizedTournament);
  const mode = flow.normalizeMode(normalizedTournament.mode || flow.MODE_MULTI_ROTATE);
  const players = Array.isArray(normalizedTournament.players) ? normalizedTournament.players : [];
  const playersCount = players.length || (Array.isArray(normalizedTournament.playerIds) ? normalizedTournament.playerIds.length : 0);

  const venueText = pickFirstText(normalizedTournament, ['venue', 'location', 'place', 'address', 'site']) || '未设置';
  const timeText = pickFirstText(normalizedTournament, ['scheduledAt', 'startAt', 'startsAt', 'time']) || '';
  const progressText = progress.totalMatches
    ? `已完成 ${progress.finishedMatches}/${progress.totalMatches} 场`
    : (lifecycle === 'draft' ? '比赛尚未开始' : '暂无已完成场次');
  const currentRoundText = resolveCurrentRoundText(normalizedTournament.rounds, lifecycle);

  return {
    viewMode: previewMode,
    viewModeLabel: viewModeLabelMap[previewMode] || '查看比赛',
    headline: joined ? '已加入这场比赛' : '先看比赛信息',
    subtitle: joined ? '可以直接进入比赛页面。' : '是否加入由你手动确认，不会自动加入。',
    statusText: buildStatusText(lifecycle),
    statusClass: buildStatusClass(lifecycle),
    primaryAction: buildPrimaryAction({ lifecycle, joined, joinAllowed }),
    secondaryAction: null,
    joinAllowed,
    joined,
    availabilityText: buildAvailabilityText({ lifecycle, joined, joinAllowed }),
    tournamentName: String(normalizedTournament.name || '').trim() || '羽毛球比赛',
    organizerName,
    mode,
    modeLabel: flow.getModeLabel(mode),
    playersCount,
    playersCountText: `${playersCount} 人`,
    venueText,
    timeText: timeText ? formatDateTime(timeText) : '未设置',
    progressText,
    currentRoundText,
    roundsText: progress.totalRounds ? `${progress.completedRounds}/${progress.totalRounds} 轮已完成` : '暂无轮次',
    rankingsPreview,
    rankingTitle: '比赛摘要',
    showRankingPreview: false,
    showProgressSummary: false,
    tournament: normalizedTournament
  };
}

module.exports = {
  normalizeLifecycleStatus,
  resolveOrganizerName,
  countRoundProgress,
  resolveCurrentRoundText,
  buildRankingPreview,
  buildInvalidShareEntryState,
  buildRetryableShareEntryState,
  buildShareEntryViewModel,
  buildShareMessage,
  formatDateTime
};
