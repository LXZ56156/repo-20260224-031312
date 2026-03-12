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

function buildHomeHeroCardState(items) {
  const running = pickLatestByStatus(items, 'running');
  if (running) {
    return {
      title: '继续你的比赛',
      label: '最近进行中',
      name: running.name || '未命名赛事',
      meta: buildMetaText(running, running.matchProgressText),
      actionText: '继续最近比赛',
      actionTarget: 'lobby',
      actionId: running._id || '',
      empty: false
    };
  }

  const draft = pickLatestByStatus(items, 'draft');
  if (draft) {
    return {
      title: '你的比赛',
      label: '最近草稿',
      name: draft.name || '未命名赛事',
      meta: buildMetaText(draft, draft.modeLabel),
      actionText: '继续草稿比赛',
      actionTarget: 'lobby',
      actionId: draft._id || '',
      empty: false
    };
  }

  const finished = pickLatestByStatus(items, 'finished');
  if (finished) {
    return {
      title: '你的比赛',
      label: '最近结果',
      name: finished.name || '未命名赛事',
      meta: buildMetaText(finished, finished.matchProgressText),
      actionText: '查看最近结果',
      actionTarget: 'ranking',
      actionId: finished._id || '',
      empty: false
    };
  }

  return {
    title: '你的比赛',
    label: '当前还没有比赛',
    name: '',
    meta: '',
    actionText: '发起比赛',
    actionTarget: 'create',
    actionId: '',
    empty: true
  };
}

module.exports = {
  buildHomeHeroCardState
};
