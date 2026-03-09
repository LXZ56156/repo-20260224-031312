const tournamentEntry = require('../../core/tournamentEntry');

function parseTournamentId(options = {}) {
  return tournamentEntry.parseTournamentIdFromOptions(options);
}

function normalizeIntent(intent = 'view') {
  const value = String(intent || '').trim().toLowerCase();
  if (value === 'join' || value === 'watch' || value === 'result' || value === 'view') return value;
  return 'view';
}

function buildReturnUrl(tournamentId, intent = 'view') {
  return `/pages/share-entry/index?tournamentId=${encodeURIComponent(String(tournamentId || '').trim())}&intent=${encodeURIComponent(normalizeIntent(intent))}`;
}

function buildLobbyUrl(tournamentId, entry = '') {
  const tid = encodeURIComponent(String(tournamentId || '').trim());
  const normalizedEntry = String(entry || '').trim().toLowerCase();
  const entryQuery = normalizedEntry ? `&entry=${encodeURIComponent(normalizedEntry)}` : '';
  return `/pages/lobby/index?tournamentId=${tid}&fromShare=1${entryQuery}`;
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
