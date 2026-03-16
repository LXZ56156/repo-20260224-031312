const flow = require('../../core/uxFlow');

function pickLatestByStatus(items, status) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => String((item && item.status) || '') === status)
    .slice()
    .sort((a, b) => (Number((b && b.updatedAtTs) || 0) || 0) - (Number((a && a.updatedAtTs) || 0) || 0))[0] || null;
}

function buildMetaText(item, fallbackText) {
  if (!item || typeof item !== 'object') return String(fallbackText || '').trim();
  const playersCount = Number(item.playersCount) || 0;
  const segments = [];
  if (playersCount > 0) segments.push(`${playersCount} 人`);
  if (fallbackText) segments.push(String(fallbackText).trim());
  return segments.join(' · ');
}

function buildRawContext(rawDoc, openid) {
  if (!rawDoc || typeof rawDoc !== 'object') return null;
  const players = Array.isArray(rawDoc.players) ? rawDoc.players : [];
  const isAdmin = !!(openid && String(rawDoc.creatorId || '') === String(openid || ''));
  const myJoined = !!openid && players.some((p) => p && String(p.id || '') === String(openid));
  const canEditScore = isAdmin || myJoined;
  const hasPending = flow.hasPendingMatch(rawDoc.rounds);
  const checkPlayersOk = players.length >= 4;
  const checkSettingsOk = !!rawDoc.settingsConfigured;

  let pendingCount = 0;
  let totalCount = 0;
  let finishedCount = 0;
  let firstPendingRound = -1;
  let firstPendingMatch = -1;
  const rounds = Array.isArray(rawDoc.rounds) ? rawDoc.rounds : [];
  for (const r of rounds) {
    const matches = Array.isArray(r && r.matches) ? r.matches : [];
    for (const m of matches) {
      if (!m) continue;
      totalCount++;
      const s = String(m.status || '').trim();
      if (s === 'finished') {
        finishedCount++;
      } else if (s !== 'canceled') {
        pendingCount++;
        if (firstPendingRound < 0) {
          firstPendingRound = Number(r.roundIndex || 0);
          firstPendingMatch = Number(m.matchIndex || 0);
        }
      }
    }
  }

  return {
    isAdmin, myJoined, canEditScore, hasPending,
    checkPlayersOk, checkSettingsOk,
    pendingCount, totalCount, finishedCount,
    firstPendingRound, firstPendingMatch
  };
}

function buildHomeHeroCardState(items, rawDocsMap, openid) {
  const hasContext = !!(rawDocsMap && typeof rawDocsMap === 'object' && openid);

  const running = pickLatestByStatus(items, 'running');
  if (running) {
    const ctx = hasContext && rawDocsMap[running._id]
      ? buildRawContext(rawDocsMap[running._id], openid)
      : null;

    if (ctx && ctx.canEditScore && ctx.hasPending) {
      return {
        title: '继续你的比赛',
        label: '最近进行中',
        name: running.name || '未命名赛事',
        meta: buildMetaText(running, running.matchProgressText),
        detail: `待录 ${ctx.pendingCount} 场 · 已完成 ${ctx.finishedCount}/${ctx.totalCount}`,
        progress: ctx.totalCount > 0 ? Math.round((ctx.finishedCount / ctx.totalCount) * 100) : 0,
        actionText: `继续录分（${ctx.pendingCount} 场待录）`,
        actionTarget: 'batch',
        actionId: running._id || '',
        actionRound: ctx.firstPendingRound,
        actionMatch: ctx.firstPendingMatch,
        empty: false
      };
    }

    if (ctx && !ctx.hasPending) {
      return {
        title: '继续你的比赛',
        label: '最近进行中',
        name: running.name || '未命名赛事',
        meta: buildMetaText(running, running.matchProgressText),
        detail: `已完成 ${ctx.finishedCount}/${ctx.totalCount} 场`,
        progress: ctx.totalCount > 0 ? Math.round((ctx.finishedCount / ctx.totalCount) * 100) : 0,
        actionText: '查看排名',
        actionTarget: 'ranking',
        actionId: running._id || '',
        actionRound: -1,
        actionMatch: -1,
        empty: false
      };
    }

    return {
      title: '继续你的比赛',
      label: '最近进行中',
      name: running.name || '未命名赛事',
      meta: buildMetaText(running, running.matchProgressText),
      detail: '',
      progress: -1,
      actionText: '继续最近比赛',
      actionTarget: 'lobby',
      actionId: running._id || '',
      actionRound: -1,
      actionMatch: -1,
      empty: false
    };
  }

  const draft = pickLatestByStatus(items, 'draft');
  if (draft) {
    const ctx = hasContext && rawDocsMap[draft._id]
      ? buildRawContext(rawDocsMap[draft._id], openid)
      : null;

    if (ctx && ctx.isAdmin) {
      if (!ctx.checkSettingsOk) {
        return {
          title: '你的比赛',
          label: '最近草稿',
          name: draft.name || '未命名赛事',
          meta: buildMetaText(draft, draft.modeLabel),
          detail: '请先完成赛事参数配置',
          progress: -1,
          actionText: '去修改比赛参数',
          actionTarget: 'settings',
          actionId: draft._id || '',
          actionRound: -1,
          actionMatch: -1,
          empty: false
        };
      }
      if (!ctx.checkPlayersOk) {
        return {
          title: '你的比赛',
          label: '最近草稿',
          name: draft.name || '未命名赛事',
          meta: buildMetaText(draft, draft.modeLabel),
          detail: '参数已配置，等待名单就绪',
          progress: -1,
          actionText: '去导入名单',
          actionTarget: 'lobby',
          actionId: draft._id || '',
          actionRound: -1,
          actionMatch: -1,
          empty: false
        };
      }
      return {
        title: '你的比赛',
        label: '最近草稿',
        name: draft.name || '未命名赛事',
        meta: buildMetaText(draft, draft.modeLabel),
        detail: '所有准备已就绪，可以开赛',
        progress: -1,
        actionText: '开始比赛',
        actionTarget: 'start',
        actionId: draft._id || '',
        actionRound: -1,
        actionMatch: -1,
        empty: false
      };
    }

    return {
      title: '你的比赛',
      label: '最近草稿',
      name: draft.name || '未命名赛事',
      meta: buildMetaText(draft, draft.modeLabel),
      detail: '',
      progress: -1,
      actionText: '继续草稿比赛',
      actionTarget: 'lobby',
      actionId: draft._id || '',
      actionRound: -1,
      actionMatch: -1,
      empty: false
    };
  }

  const finished = pickLatestByStatus(items, 'finished');
  if (finished) {
    return {
      title: '你的比赛',
      label: '最近完赛',
      name: finished.name || '未命名赛事',
      meta: buildMetaText(finished, finished.matchProgressText),
      detail: '比赛已结束',
      progress: 100,
      actionText: '查看赛事复盘',
      actionTarget: 'analytics',
      actionId: finished._id || '',
      actionRound: -1,
      actionMatch: -1,
      empty: false
    };
  }

  return {
    title: '你的比赛',
    label: '当前还没有比赛',
    name: '',
    meta: '',
    detail: '',
    progress: -1,
    actionText: '发起比赛',
    actionTarget: 'create',
    actionId: '',
    actionRound: -1,
    actionMatch: -1,
    empty: true
  };
}

module.exports = {
  buildHomeHeroCardState
};
