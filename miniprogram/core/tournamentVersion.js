const syncStatus = require('./syncStatus');

function pickTournamentVersion(doc) {
  const value = Number(doc && doc.version);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function compareTournamentFreshness(currentDoc, nextDoc) {
  const current = currentDoc && typeof currentDoc === 'object' ? currentDoc : null;
  const next = nextDoc && typeof nextDoc === 'object' ? nextDoc : null;
  if (!next) return -1;
  if (!current) return 1;

  const currentId = String((current._id || current.id) || '').trim();
  const nextId = String((next._id || next.id) || '').trim();
  if (currentId && nextId && currentId !== nextId) return 1;

  const currentVersion = pickTournamentVersion(current);
  const nextVersion = pickTournamentVersion(next);
  if (currentVersion && nextVersion && currentVersion !== nextVersion) {
    return nextVersion > currentVersion ? 1 : -1;
  }

  const currentTs = syncStatus.pickTournamentTimestamp(current);
  const nextTs = syncStatus.pickTournamentTimestamp(next);
  if (currentTs && nextTs && currentTs !== nextTs) {
    return nextTs > currentTs ? 1 : -1;
  }

  return 0;
}

function shouldAcceptTournamentDoc(currentDoc, nextDoc) {
  return compareTournamentFreshness(currentDoc, nextDoc) >= 0;
}

module.exports = {
  pickTournamentVersion,
  compareTournamentFreshness,
  shouldAcceptTournamentDoc
};
