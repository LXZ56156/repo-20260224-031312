const nav = require('./nav');

function buildPageUrl(key, tournamentId) {
  if (key === 'ranking') return nav.buildTournamentUrl('/pages/ranking/index', tournamentId);
  if (key === 'schedule') return nav.buildTournamentUrl('/pages/schedule/index', tournamentId);
  return nav.buildTournamentUrl('/pages/lobby/index', tournamentId);
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
  nav.redirectOrNavigate(url);
}

module.exports = {
  buildPageUrl,
  getPrimaryNavItems,
  navigateToPrimary
};
