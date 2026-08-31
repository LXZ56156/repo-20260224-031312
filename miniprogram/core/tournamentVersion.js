const syncStatus = require('./syncStatus');

function pickTournamentVersion(doc) {
  const value = Number(doc && doc.version);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function pickTournamentUpdateTimestamp(doc) {
  const value = doc && typeof doc === 'object' ? doc : {};
  return (
    syncStatus.toTs(value.updatedAtTs) ||
    syncStatus.toTs(value.updatedAt) ||
    syncStatus.toTs(value.modifiedAt)
  );
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

function shouldApplyTournamentDoc(currentDoc, nextDoc) {
  const freshness = compareTournamentFreshness(currentDoc, nextDoc);
  if (freshness !== 0) return freshness > 0;

  const currentVersion = pickTournamentVersion(currentDoc);
  const nextVersion = pickTournamentVersion(nextDoc);
  if (currentVersion && nextVersion) return false;

  const currentTs = pickTournamentUpdateTimestamp(currentDoc);
  const nextTs = pickTournamentUpdateTimestamp(nextDoc);
  return !(currentTs && nextTs);
}

module.exports = {
  pickTournamentVersion,
  compareTournamentFreshness,
  shouldAcceptTournamentDoc,
  shouldApplyTournamentDoc
};
