const { get, set, del } = require('./base');

const SCORE_DRAFT_PREFIX = 'score_draft_';

function buildScoreDraftKey(tournamentId, roundIndex, matchIndex) {
  const tid = String(tournamentId || '').trim();
  const round = Number(roundIndex);
  const match = Number(matchIndex);
  return `${SCORE_DRAFT_PREFIX}${tid}_${Number.isFinite(round) ? round : 0}_${Number.isFinite(match) ? match : 0}`;
}

function getScoreDraft(tournamentId, roundIndex, matchIndex) {
  return get(buildScoreDraftKey(tournamentId, roundIndex, matchIndex), null);
}

function setScoreDraft(tournamentId, roundIndex, matchIndex, draft) {
  set(buildScoreDraftKey(tournamentId, roundIndex, matchIndex), draft || null);
}

function removeScoreDraft(tournamentId, roundIndex, matchIndex) {
  del(buildScoreDraftKey(tournamentId, roundIndex, matchIndex));
}

module.exports = {
  buildScoreDraftKey,
  getScoreDraft,
  setScoreDraft,
  removeScoreDraft
};
