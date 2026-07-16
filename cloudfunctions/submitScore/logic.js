const modeHelper = require('./lib/mode');
const playerUtils = require('./lib/player');
const rankingCore = require('./lib/rankingCore');
const scoreUtils = require('./lib/score');

function extractId(player) {
  return playerUtils.extractPlayerId(player);
}

function safePlayerName(player) {
  return playerUtils.safePlayerName(player);
}

function isTeamMode(mode) {
  return modeHelper.isTeamMode(mode);
}

function computeRankings(tournament) {
  return rankingCore.computeRankings(tournament);
}

function allMatchesFinished(rounds) {
  for (const round of (rounds || [])) {
    for (const match of (round.matches || [])) {
      const status = String(match && match.status || '').trim();
      if (status !== 'finished' && status !== 'canceled') return false;
    }
  }
  return true;
}

function normalizeWaterUnits(value) {
  let units = value;
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!/^[012]$/.test(normalized)) return null;
    units = Number(normalized);
  } else if (typeof value !== 'number') {
    return null;
  }
  if (!Number.isInteger(units)) return null;
  return units === 0 || units === 1 || units === 2 ? units : null;
}

function normalizeWaterConfig(tournament) {
  const source = tournament && typeof tournament === 'object' ? tournament : {};
  const mode = String(source.mode || '').trim().toLowerCase();
  const rules = source.rules && typeof source.rules === 'object' && !Array.isArray(source.rules)
    ? source.rules
    : {};
  const water = rules.water && typeof rules.water === 'object' && !Array.isArray(rules.water)
    ? rules.water
    : null;
  const defaultUnitsPerLoser = normalizeWaterUnits(water && water.defaultUnitsPerLoser);
  if (mode !== 'multi_rotate' || !water || water.enabled !== true || defaultUnitsPerLoser === null) {
    return { enabled: false, defaultUnitsPerLoser: 1 };
  }
  return { enabled: true, defaultUnitsPerLoser };
}

function normalizeWaterSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const unitsPerLoser = normalizeWaterUnits(snapshot.unitsPerLoser);
  return unitsPerLoser === null ? null : { unitsPerLoser };
}

function resolveWaterSubmission(tournament, inputValue, inputProvided, currentMatch = null) {
  if (!inputProvided && String(currentMatch && currentMatch.status || '').trim() === 'finished') {
    return {
      ok: true,
      snapshot: normalizeWaterSnapshot(currentMatch && currentMatch.water) || undefined
    };
  }

  const config = normalizeWaterConfig(tournament);
  if (!config.enabled) {
    if (inputProvided) {
      return {
        ok: false,
        code: 'WATER_NOT_ENABLED',
        message: '当前赛事未开启打水记账'
      };
    }
    return { ok: true, snapshot: null };
  }

  const unitsPerLoser = inputProvided
    ? normalizeWaterUnits(inputValue)
    : config.defaultUnitsPerLoser;
  if (unitsPerLoser === null) {
    return {
      ok: false,
      code: 'WATER_UNITS_INVALID',
      message: '打水瓶数仅支持 0、1、2'
    };
  }
  return { ok: true, snapshot: { unitsPerLoser } };
}

function applyScoreToRounds(rounds, roundIndex, matchIndex, scoreA, scoreB, scorer = null, waterSnapshot = undefined) {
  const nextRounds = Array.isArray(rounds) ? JSON.parse(JSON.stringify(rounds)) : [];
  const targetRound = nextRounds[roundIndex];
  if (!targetRound) throw new Error('轮次不存在');

  const matches = Array.isArray(targetRound.matches) ? targetRound.matches : [];
  const idx = matches.findIndex((match) => Number(match.matchIndex) === Number(matchIndex));
  if (idx < 0) throw new Error('比赛不存在');

  const match = matches[idx] || {};
  delete match.teamAScore;
  delete match.teamBScore;
  delete match.scoreA;
  delete match.scoreB;
  delete match.a;
  delete match.b;
  delete match.left;
  delete match.right;
  match.score = scoreUtils.normalizeScoreObject({ teamA: scoreA, teamB: scoreB });
  if (scorer && scorer.id) {
    match.scorerId = String(scorer.id || '');
    match.scorerName = String(scorer.name || '').trim();
    match.scoredAt = scorer.scoredAt || new Date().toISOString();
  }
  if (waterSnapshot !== undefined) {
    const normalizedWater = normalizeWaterSnapshot(waterSnapshot);
    if (normalizedWater) match.water = normalizedWater;
    else delete match.water;
  }
  match.status = 'finished';
  matches[idx] = match;
  targetRound.matches = matches;
  nextRounds[roundIndex] = targetRound;
  return nextRounds;
}

function isSquadTargetWins(tournament) {
  const mode = modeHelper.normalizeMode(tournament && tournament.mode);
  if (mode !== 'squad_doubles') return false;
  const rules = tournament && tournament.rules && typeof tournament.rules === 'object' ? tournament.rules : {};
  const endCondition = rules && typeof rules.endCondition === 'object' ? rules.endCondition : {};
  return String(endCondition.type || '').trim().toLowerCase() === 'target_wins';
}

function reviveScorelessCanceledMatches(rounds) {
  const nextRounds = Array.isArray(rounds) ? JSON.parse(JSON.stringify(rounds)) : [];
  for (const round of nextRounds) {
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    for (const match of matches) {
      if (!match || String(match.status || '') !== 'canceled') continue;
      if (scoreUtils.isValidFinishedScore(match)) continue;
      match.status = 'pending';
    }
  }
  return nextRounds;
}

function applySquadTargetWinEndCondition(tournament, rounds, rankings) {
  if (!isSquadTargetWins(tournament)) return { rounds, finishedByRule: false };
  const rules = tournament && tournament.rules && typeof tournament.rules === 'object' ? tournament.rules : {};
  const endCondition = rules && typeof rules.endCondition === 'object' ? rules.endCondition : {};
  const target = Math.max(1, Number(endCondition.target) || 1);
  const teamRows = Array.isArray(rankings) ? rankings : [];
  const hasWinner = teamRows.some((row) => Number(row && row.wins || 0) >= target);
  if (!hasWinner) return { rounds, finishedByRule: false };

  const nextRounds = JSON.parse(JSON.stringify(rounds || []));
  for (const round of nextRounds) {
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    for (const match of matches) {
      if (String(match && match.status || '') === 'pending') {
        match.status = 'canceled';
      }
    }
  }
  return { rounds: nextRounds, finishedByRule: true };
}

function buildIdempotentRetryResult(
  match,
  scoreA,
  scoreB,
  requesterId,
  fallbackScorerName = '球友',
  expectedWaterSnapshot = undefined
) {
  const status = String(match && match.status || '').trim();
  if (status !== 'finished') return null;

  const current = scoreUtils.extractScorePairAny(match);
  if (!Number.isFinite(current.a) || !Number.isFinite(current.b)) return null;
  if (Number(current.a) !== Number(scoreA) || Number(current.b) !== Number(scoreB)) return null;
  if (expectedWaterSnapshot !== undefined) {
    const currentWater = normalizeWaterSnapshot(match && match.water);
    const expectedWater = normalizeWaterSnapshot(expectedWaterSnapshot);
    const currentUnits = currentWater ? currentWater.unitsPerLoser : null;
    const expectedUnits = expectedWater ? expectedWater.unitsPerLoser : null;
    if (currentUnits !== expectedUnits) return null;
  }

  return {
    ok: true,
    deduped: true,
    finished: true,
    scorerName: String(match && match.scorerName || '').trim() || String(fallbackScorerName || '').trim() || '球友'
  };
}

function buildSubmitResult(
  tournament,
  roundIndex,
  matchIndex,
  scoreA,
  scoreB,
  scorer = null,
  waterSnapshot = undefined
) {
  const sourceRounds = isSquadTargetWins(tournament)
    ? reviveScorelessCanceledMatches(tournament && tournament.rounds)
    : (tournament && tournament.rounds);
  let rounds = applyScoreToRounds(sourceRounds, roundIndex, matchIndex, scoreA, scoreB, scorer, waterSnapshot);
  let rankings = computeRankings({ ...(tournament || {}), rounds });
  const squadEnd = applySquadTargetWinEndCondition(tournament, rounds, rankings);
  if (squadEnd.finishedByRule) {
    rounds = squadEnd.rounds;
    rankings = computeRankings({ ...(tournament || {}), rounds });
  }
  const finished = allMatchesFinished(rounds);
  return {
    rounds,
    rankings,
    finished,
    nextStatus: finished ? 'finished' : 'running'
  };
}

module.exports = {
  extractId,
  safePlayerName,
  isTeamMode,
  computeRankings,
  allMatchesFinished,
  normalizeWaterUnits,
  normalizeWaterConfig,
  normalizeWaterSnapshot,
  resolveWaterSubmission,
  applyScoreToRounds,
  isSquadTargetWins,
  reviveScorelessCanceledMatches,
  buildIdempotentRetryResult,
  buildSubmitResult
};
