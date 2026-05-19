const flow = require('./uxFlow');

const BRAND_TITLE = '羽球轮转助手';
const TOURNAMENT_TITLE_NAME_LIMIT = 10;

function normalizeText(value) {
  return String(value || '').trim();
}

function truncateText(value, limit = TOURNAMENT_TITLE_NAME_LIMIT) {
  const chars = Array.from(normalizeText(value));
  if (!chars.length) return '';
  return chars.slice(0, Math.max(0, Number(limit) || 0)).join('');
}

function resolveTournamentTitleName(tournament, fallback = BRAND_TITLE) {
  const name = flow.getTournamentDisplayName(tournament, fallback);
  return truncateText(name, TOURNAMENT_TITLE_NAME_LIMIT) || normalizeText(fallback) || BRAND_TITLE;
}

function buildTournamentPageTitle(featureText, tournament, options = {}) {
  const feature = normalizeText(featureText) || BRAND_TITLE;
  const fallback = normalizeText(options.fallbackName) || BRAND_TITLE;
  const tournamentName = resolveTournamentTitleName(tournament, fallback);
  return `${feature}·${tournamentName}`;
}

function setTournamentPageTitle(ctx, featureText, tournament, options = {}) {
  if (!ctx || typeof ctx !== 'object') return '';
  const title = buildTournamentPageTitle(featureText, tournament, options);
  if (!title || ctx.__lastNavigationBarTitleText === title) return title;
  ctx.__lastNavigationBarTitleText = title;
  if (typeof wx !== 'undefined' && wx && typeof wx.setNavigationBarTitle === 'function') {
    wx.setNavigationBarTitle({ title });
  }
  return title;
}

module.exports = {
  BRAND_TITLE,
  TOURNAMENT_TITLE_NAME_LIMIT,
  truncateText,
  resolveTournamentTitleName,
  buildTournamentPageTitle,
  setTournamentPageTitle
};
