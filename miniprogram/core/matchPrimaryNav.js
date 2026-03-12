function buildPageUrl(key, tournamentId) {
  const tid = encodeURIComponent(String(tournamentId || '').trim());
  const suffix = tid ? `?tournamentId=${tid}` : '';
  if (key === 'ranking') return `/pages/ranking/index${suffix}`;
  if (key === 'schedule') return `/pages/schedule/index${suffix}`;
  return `/pages/lobby/index${suffix}`;
}

function getPrimaryNavItems(currentKey, tournamentId) {
  const current = String(currentKey || '').trim() || 'match';
  return [
    { key: 'match', text: '比赛', url: buildPageUrl('match', tournamentId), active: current === 'match' },
    { key: 'ranking', text: '排名', url: buildPageUrl('ranking', tournamentId), active: current === 'ranking' },
    { key: 'schedule', text: '对阵', url: buildPageUrl('schedule', tournamentId), active: current === 'schedule' }
  ];
}

function navigateToPrimary(targetKey, tournamentId, currentKey = '') {
  const target = String(targetKey || '').trim();
  if (!target) return;
  if (target === String(currentKey || '').trim()) return;
  const url = buildPageUrl(target, tournamentId);
  wx.redirectTo({
    url,
    fail: () => wx.navigateTo({ url })
  });
}

module.exports = {
  getPrimaryNavItems,
  navigateToPrimary
};
