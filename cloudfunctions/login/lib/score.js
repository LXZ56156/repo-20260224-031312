const SCORE_ABSOLUTE_MAX = 60;

function isScalarScoreValue(value) {
  return typeof value === 'number' || typeof value === 'string';
}

function toScoreNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.floor(num);
}

function extractScoreValues(input) {
  const source = input && typeof input === 'object' ? input : {};
  const score = source.score && typeof source.score === 'object' ? source.score : null;
  const directA = score ? score.teamA : undefined;
  const directB = score ? score.teamB : undefined;
  const legacyA = source.teamAScore ?? source.teamAScore1 ?? source.teamAScore2 ?? source.scoreA ?? source.a ?? source.left;
  const legacyB = source.teamBScore ?? source.teamBScore1 ?? source.teamBScore2 ?? source.scoreB ?? source.b ?? source.right;
  const fallbackA = isScalarScoreValue(source.teamA) ? source.teamA : undefined;
  const fallbackB = isScalarScoreValue(source.teamB) ? source.teamB : undefined;
  return {
    a: directA ?? legacyA ?? fallbackA,
    b: directB ?? legacyB ?? fallbackB
  };
}

function extractScorePairAny(input) {
  const pair = extractScoreValues(input);
  return { a: toScoreNumber(pair.a), b: toScoreNumber(pair.b) };
}

function normalizeScoreObject(input) {
  const pair = extractScorePairAny(input);
  if (!Number.isFinite(pair.a) || !Number.isFinite(pair.b)) return null;
  return {
    teamA: pair.a,
    teamB: pair.b
  };
}

function isValidFinishedScore(input, tournament = null) {
  const pair = extractScorePairAny(input);
  if (!Number.isFinite(pair.a) || !Number.isFinite(pair.b)) return false;
  if (pair.a < 0 || pair.b < 0) return false;
  if (!Number.isInteger(pair.a) || !Number.isInteger(pair.b)) return false;
  if (pair.a === pair.b) return false;
  if (!tournament || tournament.mode !== 'singles_round_robin') return true;
  const raw = extractScoreValues(input);
  const integerScore = (value) => typeof value === 'number' ? Number.isInteger(value)
    : typeof value === 'string' && /^\d+$/.test(value) && Number.isInteger(Number(value));
  if (!integerScore(raw.a) || !integerScore(raw.b)) return false;
  const target = Number(tournament.rules && tournament.rules.pointsPerGame) || 21;
  const high = Math.max(pair.a, pair.b);
  const low = Math.min(pair.a, pair.b);
  if (target === 11 || target === 15) return high === target && low < target;
  if (target !== 21 || high > 30) return false;
  if (high === 21) return low <= 19;
  if (high < 30) return high >= 22 && high - low === 2;
  return low === 28 || low === 29;
}

function getFinishedScoreHint(tournament) {
  const target = Number(tournament && tournament.rules && tournament.rules.pointsPerGame) || 21;
  return target === 21 ? '21 分单局：20 平后领先 2 分，30 分封顶，不接受平局'
    : `${target} 分单局：先到 ${target} 分即胜，不接受平局`;
}

function isScoreWithinBounds(input, maxScore = SCORE_ABSOLUTE_MAX) {
  const pair = extractScorePairAny(input);
  if (!Number.isFinite(pair.a) || !Number.isFinite(pair.b)) return false;
  const limit = Math.max(1, Math.floor(Number(maxScore) || SCORE_ABSOLUTE_MAX));
  return pair.a <= limit && pair.b <= limit;
}

module.exports = {
  SCORE_ABSOLUTE_MAX,
  extractScorePairAny,
  normalizeScoreObject,
  isValidFinishedScore,
  getFinishedScoreHint,
  isScoreWithinBounds
};
