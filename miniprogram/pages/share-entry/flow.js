const nav = require('../../core/nav');
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
  return nav.buildUrl('/pages/share-entry/index', {
    tournamentId: String(tournamentId || '').trim(),
    intent: normalizeIntent(intent)
  });
}

function buildLobbyUrl(tournamentId, entry = '') {
  const normalizedEntry = String(entry || '').trim().toLowerCase();
  return nav.buildTournamentUrl('/pages/lobby/index', tournamentId, {
    fromShare: 1,
    ...(normalizedEntry ? { entry: normalizedEntry } : {})
  });
}

function buildScheduleUrl(tournamentId) {
  return nav.buildTournamentUrl('/pages/schedule/index', tournamentId);
}

function buildRankingUrl(tournamentId) {
  return nav.buildTournamentUrl('/pages/ranking/index', tournamentId);
}

function buildAnalyticsUrl(tournamentId) {
  return nav.buildTournamentUrl('/pages/analytics/index', tournamentId);
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
