const normalize = require('./normalize');
const nav = require('./nav');
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

function countRoundProgress(rounds) {
  const list = Array.isArray(rounds) ? rounds : [];
  let totalMatches = 0;
  let finishedMatches = 0;
  let totalRounds = 0;
  let completedRounds = 0;
  let currentRoundNumber = 0;
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
    if (!currentRoundNumber && roundFinished < matches.length) {
      const roundIndex = Number(round && round.roundIndex);
      currentRoundNumber = Number.isFinite(roundIndex) ? roundIndex + 1 : totalRounds;
    }
  }
  return {
    totalMatches,
    finishedMatches,
    totalRounds,
    completedRounds,
    currentRoundNumber
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
    summaryText: `${Number(row && row.wins) || 0} 胜 · 净胜 ${Number(row && row.pointDiff) || 0}`,
    entityType: String(row && row.entityType || '').trim() || 'player'
  }));
}

function getPlayerAvatar(player) {
  const p = player && typeof player === 'object' ? player : {};
  return String(p.avatarDisplay || p.avatarUrl || p.avatar || p.photo || '').trim();
}

function getPlayerInitial(player) {
  const name = playerUtils.safePlayerName(player || {});
  return String(name || '球').trim().slice(0, 1) || '球';
}

function buildParticipantPreviewList(players, limit = 8) {
  const list = Array.isArray(players) ? players : [];
  return list.slice(0, limit).map((player, index) => {
    const name = playerUtils.safePlayerName(player || {});
    const avatarUrl = getPlayerAvatar(player);
    return {
      id: playerUtils.extractPlayerId(player) || `participant_${index}`,
      name,
      avatarUrl,
      initial: getPlayerInitial(player),
      showAvatar: !!avatarUrl
    };
  });
}

function buildParticipantOverflowText(playersCount, previewCount) {
  const overflow = Math.max(0, Number(playersCount || 0) - Number(previewCount || 0));
  return overflow > 0 ? `+${overflow} 人` : '';
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
  const tournamentName = flow.getTournamentDisplayName(t, '羽毛球比赛');
  const lifecycle = normalizeLifecycleStatus(t && t.status);
  const players = t && Array.isArray(t.players) ? t.players : [];
  const playersCount = players.length || (t && Array.isArray(t.playerIds) ? t.playerIds.length : 0);
  const playerLimit = flow.getRotationPlayerLimit(t);
  const joinAllowed = lifecycle === 'draft' && (playerLimit <= 0 || playersCount < playerLimit);
  let title = `${tournamentName} · 羽球轮转助手`;
  if (joinAllowed) title = `${tournamentName}，加入羽毛球比赛`;
  else if (lifecycle === 'running') title = `${tournamentName} 赛程对阵已生成`;
  else if (lifecycle === 'finished') title = `${tournamentName} 赛事排名已出炉`;
  return {
    title,
    intent: 'view',
    panelTitle: '转发比赛',
    badgeText: '比赛',
    buttonText: '转发',
    path: nav.buildTournamentUrl('/pages/share-entry/index', String(t && t._id || '').trim())
  };
}

function buildPrimaryAction({ lifecycle, joined, joinAllowed }) {
  if (lifecycle === 'finished') {
    return { key: 'ranking', text: '查看最终排名' };
  }
  if (lifecycle === 'running') {
    return { key: 'schedule', text: '查看赛程' };
  }
  if (joined) return { key: 'enter', text: '进入比赛' };
  if (joinAllowed) return { key: 'join', text: '加入比赛' };
  if (lifecycle === 'draft') return { key: 'view', text: '查看比赛' };
  return { key: 'view', text: '查看比赛' };
}

function buildStatusText(lifecycle) {
  if (lifecycle === 'draft') return '报名中';
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
  if (lifecycle === 'draft' || lifecycle === 'running' || lifecycle === 'finished') return 'join-closed';
  return 'invalid-match';
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
    tournamentName: '比赛信息不可用',
    modeLabel: '未识别',
    playersCountText: '—',
    progressText: '暂无比赛信息',
    roundsText: '—',
    lifecycle: 'unavailable',
    status: 'unavailable',
    participantPreviewList: [],
    participantOverflowText: '',
    rankingPreview: [],
    rankingsPreview: [],
    rankingTitle: '比赛摘要',
    showRankingPreview: false,
    showParticipantPreview: false,
    identityStatusText: '',
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
    tournamentName: '比赛信息同步失败',
    modeLabel: '未识别',
    playersCountText: '—',
    progressText: '暂无比赛信息',
    roundsText: '—',
    lifecycle: 'unavailable',
    status: 'unavailable',
    participantPreviewList: [],
    participantOverflowText: '',
    rankingPreview: [],
    rankingsPreview: [],
    rankingTitle: '比赛摘要',
    showRankingPreview: false,
    showParticipantPreview: false,
    identityStatusText: '',
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
  const viewModeLabelMap = {
    'join-preview': '未加入',
    'joined-entry': '已加入',
    'join-closed': '未加入',
    'invalid-match': '链接异常'
  };
  const progress = countRoundProgress(normalizedTournament.rounds);
  const mode = flow.normalizeMode(normalizedTournament.mode || flow.MODE_MULTI_ROTATE);
  const tournamentName = flow.getTournamentDisplayName(normalizedTournament, '羽毛球比赛');
  const players = Array.isArray(normalizedTournament.players) ? normalizedTournament.players : [];
  const playersCount = players.length || (Array.isArray(normalizedTournament.playerIds) ? normalizedTournament.playerIds.length : 0);
  const playerLimit = flow.getRotationPlayerLimit(normalizedTournament);
  const joinAllowed = lifecycle === 'draft' && (playerLimit <= 0 || playersCount < playerLimit);
  const previewMode = buildPreviewMode({ lifecycle, joined, joinAllowed });
  const modeLabel = flow.getModeDisplayLabel(mode, normalizedTournament.presetKey);
  const participantPreviewList = buildParticipantPreviewList(players, 8);
  const rankingPreview = lifecycle === 'draft' ? [] : buildRankingPreview(normalizedTournament);
  const progressText = progress.totalMatches
    ? (lifecycle === 'running' && progress.totalRounds > 0
      ? `第 ${progress.currentRoundNumber || Math.min(progress.completedRounds + 1, progress.totalRounds)} 轮 / 共 ${progress.totalRounds} 轮`
      : `已完成 ${progress.finishedMatches}/${progress.totalMatches} 场`)
    : (lifecycle === 'draft' ? '比赛尚未开始' : '暂无已完成场次');
  const currentRoundText = resolveCurrentRoundText(normalizedTournament.rounds, lifecycle);
  return {
    viewMode: previewMode,
    viewModeLabel: viewModeLabelMap[previewMode] || '查看比赛',
    headline: lifecycle === 'draft'
      ? (joined ? '已加入这场比赛' : '先看比赛信息')
      : (lifecycle === 'running' ? '比赛正在进行' : '比赛已结束'),
    subtitle: joined ? '已在名单中，可直接查看后续信息。' : '是否加入由你手动确认，不会自动加入。',
    lifecycle,
    status: lifecycle,
    statusText: buildStatusText(lifecycle),
    statusClass: buildStatusClass(lifecycle),
    primaryAction: buildPrimaryAction({ lifecycle, joined, joinAllowed }),
    secondaryAction: null,
    joinAllowed,
    joined,
    tournamentName,
    mode,
    modeLabel,
    playersCount,
    playerLimit,
    playersCountText: playerLimit > 0 ? `已报名 ${playersCount}/${playerLimit} 人` : `${playersCount} 人`,
    participantPreviewList,
    participantOverflowText: buildParticipantOverflowText(playersCount, participantPreviewList.length),
    progressText,
    currentRoundText,
    roundsText: progress.totalRounds ? `${progress.completedRounds}/${progress.totalRounds} 轮已完成` : '暂无轮次',
    rankingPreview,
    rankingsPreview: rankingPreview,
    rankingTitle: lifecycle === 'finished' ? '最终排名前 3' : '实时排名前 3',
    showRankingPreview: lifecycle === 'running' || lifecycle === 'finished',
    showParticipantPreview: lifecycle === 'draft',
    identityStatusText: '',
    tournament: normalizedTournament
  };
}

module.exports = {
  normalizeLifecycleStatus,
  countRoundProgress,
  resolveCurrentRoundText,
  buildRankingPreview,
  buildInvalidShareEntryState,
  buildRetryableShareEntryState,
  buildShareEntryViewModel,
  buildShareMessage
};
