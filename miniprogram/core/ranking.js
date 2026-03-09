const rankingCore = require('./rankingCore');

function findLatestFinishedRoundIndex(rounds) {
  const list = Array.isArray(rounds) ? rounds : [];
  let last = -1;
  for (const round of list) {
    const roundIndex = Number(round && round.roundIndex);
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    if (matches.some((match) => match && String(match.status || '') === 'finished')) {
      if (Number.isFinite(roundIndex) && roundIndex > last) last = roundIndex;
    }
  }
  return last;
}

function attachTrend(current, previous) {
  const previousRankMap = {};
  for (let i = 0; i < (previous || []).length; i += 1) {
    const row = previous[i];
    if (!row) continue;
    const key = String((row.rankKey || `${row.entityType || 'player'}_${row.entityId || row.playerId || ''}`)).trim();
    if (!key) continue;
    previousRankMap[key] = i + 1;
  }

  return (current || []).map((row, idx) => {
    const currentRank = idx + 1;
    const currentKey = String((row.rankKey || `${row.entityType || 'player'}_${row.entityId || row.playerId || ''}`)).trim();
    const previousRank = previousRankMap[currentKey];
    let trendType = 'flat';
    let trendText = '-';
    if (!Number.isFinite(previousRank)) {
      trendType = 'new';
      trendText = '新';
    } else {
      const diff = previousRank - currentRank;
      if (diff > 0) {
        trendType = 'up';
        trendText = `↑${diff}`;
      } else if (diff < 0) {
        trendType = 'down';
        trendText = `↓${Math.abs(diff)}`;
      }
    }
    return { ...row, trendType, trendText };
  });
}

function buildRankingWithTrend(tournament) {
  const current = rankingCore.normalizeCurrentRankings(tournament || {});
  const latestFinishedRoundIndex = findLatestFinishedRoundIndex(tournament && tournament.rounds);
  if (latestFinishedRoundIndex <= 0) {
    return current.map((row) => ({ ...row, trendType: 'flat', trendText: '-' }));
  }
  const previous = rankingCore.computeRankings(tournament || {}, {
    maxRoundExclusive: latestFinishedRoundIndex,
    currentRankings: current
  });
  return attachTrend(current, previous);
}

module.exports = {
  buildRankingWithTrend,
  normalizeCurrentRankings: rankingCore.normalizeCurrentRankings,
  computeRankings: rankingCore.computeRankings
};
