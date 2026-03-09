function parseTournamentId(options = {}) {
  let tid = String(options.tournamentId || '').trim();
  if (!tid && options.scene) {
    const scene = decodeURIComponent(options.scene);
    const matched = /tournamentId=([^&]+)/.exec(scene) || /tid=([^&]+)/.exec(scene);
    if (matched) tid = matched[1];
  }
  return tid;
}

function normalizeIntent(intent = 'view') {
  const value = String(intent || '').trim().toLowerCase();
  if (value === 'join' || value === 'watch' || value === 'result' || value === 'view') return value;
  return 'view';
}

function buildReturnUrl(tournamentId, intent = 'view') {
  return `/pages/share-entry/index?tournamentId=${encodeURIComponent(String(tournamentId || '').trim())}&intent=${encodeURIComponent(normalizeIntent(intent))}`;
}

function buildLobbyUrl(tournamentId) {
  return `/pages/lobby/index?tournamentId=${encodeURIComponent(String(tournamentId || '').trim())}&fromShare=1`;
}

function buildScheduleUrl(tournamentId) {
  return `/pages/schedule/index?tournamentId=${encodeURIComponent(String(tournamentId || '').trim())}`;
}

function buildRankingUrl(tournamentId) {
  return `/pages/ranking/index?tournamentId=${encodeURIComponent(String(tournamentId || '').trim())}`;
}

function buildAnalyticsUrl(tournamentId) {
  return `/pages/analytics/index?tournamentId=${encodeURIComponent(String(tournamentId || '').trim())}`;
}

module.exports = {
  parseTournamentId,
  normalizeIntent,
  buildReturnUrl,
  buildLobbyUrl,
  buildScheduleUrl,
  buildRankingUrl,
  buildAnalyticsUrl
};
