function isScalarScoreValue(value) {
  return typeof value === 'number' || typeof value === 'string';
}

function toScoreNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.floor(num);
}

function extractScorePairAny(input) {
  const source = input && typeof input === 'object' ? input : {};
  const score = source.score && typeof source.score === 'object' ? source.score : null;
  const directA = score ? score.teamA : undefined;
  const directB = score ? score.teamB : undefined;
  const legacyA = source.teamAScore ?? source.teamAScore1 ?? source.teamAScore2 ?? source.scoreA ?? source.a ?? source.left;
  const legacyB = source.teamBScore ?? source.teamBScore1 ?? source.teamBScore2 ?? source.scoreB ?? source.b ?? source.right;
  const fallbackA = isScalarScoreValue(source.teamA) ? source.teamA : undefined;
  const fallbackB = isScalarScoreValue(source.teamB) ? source.teamB : undefined;
  return {
    a: toScoreNumber(directA ?? legacyA ?? fallbackA),
    b: toScoreNumber(directB ?? legacyB ?? fallbackB)
  };
}

function normalizeScoreObject(input) {
  const pair = extractScorePairAny(input);
  if (!Number.isFinite(pair.a) || !Number.isFinite(pair.b)) return null;
  return {
    teamA: pair.a,
    teamB: pair.b
  };
}

function isValidFinishedScore(input) {
  const pair = extractScorePairAny(input);
  if (!Number.isFinite(pair.a) || !Number.isFinite(pair.b)) return false;
  if (pair.a < 0 || pair.b < 0) return false;
  if (!Number.isInteger(pair.a) || !Number.isInteger(pair.b)) return false;
  return pair.a !== pair.b;
}

module.exports = {
  extractScorePairAny,
  normalizeScoreObject,
  isValidFinishedScore
};
