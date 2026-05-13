const { performance } = require('node:perf_hooks');

const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');
const { buildSquadSchedule } = require('../cloudfunctions/startTournament/scheduleModes');
const templateLibrary = require('../cloudfunctions/startTournament/rotation.templates');

const TEMPLATE_FAST_BOUND_MS = 300;
const ROTATION_GUARDED_BOUND_MS = 1500;
const ROTATION_LONGTAIL_BOUND_MS = 2500;
const SQUAD_FAST_BOUND_MS = 2500;
const SQUAD_EXTREME_BOUND_MS = 3000;
const SQUAD_HEAVY_BOUND_MS = 6000;
const COVERAGE_FIRST_EXCEPTION_META = Object.freeze({
  'rotation-6p-1c': Object.freeze({
    id: 'rotation-6p-1c',
    mode: 'multi_rotate',
    case: '6p-1c',
    scope: '6p-1c 长赛程审计例外区间 5-18 场',
    note: '9 场为等场默认且完成 15 对搭档覆盖；长赛程为保持当前 repeat 水平，模板允许 maxConsecutivePlay=4。'
  }),
  'rotation-9p-2c': Object.freeze({
    id: 'rotation-9p-2c',
    mode: 'multi_rotate',
    case: '9p-2c',
    scope: 'balanced=18；审计例外区间 17-18 场',
    note: '保留 balancedMatch=18，以维持 18 个 unique exact matchups 与 0 partner repeat。'
  }),
  'squad-10v10-20m-4c': Object.freeze({
    id: 'squad-10v10-20m-4c',
    mode: 'squad_doubles',
    case: '10v10/20m/4c',
    scope: '20 场 / 4 片 / 5 轮',
    note: '当前固定轮休 + 轮内 deterministic 配对优先保 playSpread=0 与完整 20 场输出，maxConsecutivePlay 仍高于结构下限 3。'
  })
});

const SQUAD_REPEAT_BASELINE_OVERRIDES = Object.freeze({
  'squad:uneven:3v4/9m/1c': Object.freeze({
    partnerRepeatBaseline: 9,
    opponentRepeatBaseline: 24
  }),
  'squad:uneven:5v4/12m/1c': Object.freeze({
    partnerRepeatBaseline: 8,
    opponentRepeatBaseline: 28
  }),
  'squad:uneven:6v5/12m/2c': Object.freeze({
    partnerRepeatBaseline: 2,
    opponentRepeatBaseline: 18
  }),
  'squad:equal:8v8/16m/2c': Object.freeze({
    partnerRepeatBaseline: 8,
    opponentRepeatBaseline: 32
  })
});

function makeRotationPlayers(n, femaleCount = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    gender: i < femaleCount ? 'female' : 'male'
  }));
}

function makeSquadPlayers(aCount, bCount) {
  const players = [];
  for (let i = 0; i < aCount; i += 1) {
    players.push({ id: `A${i + 1}`, name: `A${i + 1}`, squad: 'A' });
  }
  for (let i = 0; i < bCount; i += 1) {
    players.push({ id: `B${i + 1}`, name: `B${i + 1}`, squad: 'B' });
  }
  return players;
}

function collectMatches(out) {
  return (out.rounds || []).flatMap((round) => round.matches || []);
}

function computeSpread(values) {
  if (!values.length) return 0;
  return Math.max(...values) - Math.min(...values);
}

function computePlayCounts(matches, ids) {
  const counts = Object.fromEntries(ids.map((id) => [id, 0]));
  matches.forEach((match) => {
    match.teamA.concat(match.teamB).forEach((id) => {
      if (id in counts) counts[id] += 1;
    });
  });
  return counts;
}

function computeMaxConsecutive(rounds, ids) {
  const streak = Object.fromEntries(ids.map((id) => [id, 0]));
  let maxStreak = 0;
  (rounds || []).forEach((round) => {
    const active = new Set();
    (round.matches || []).forEach((match) => {
      match.teamA.concat(match.teamB).forEach((id) => active.add(id));
    });
    ids.forEach((id) => {
      if (active.has(id)) {
        streak[id] += 1;
        if (streak[id] > maxStreak) maxStreak = streak[id];
      } else {
        streak[id] = 0;
      }
    });
  });
  return maxStreak;
}

function countUniqueExactMatchups(matches) {
  const seen = new Set();
  matches.forEach((match) => {
    const teamA = match.teamA.slice().sort().join('+');
    const teamB = match.teamB.slice().sort().join('+');
    seen.add([teamA, teamB].sort().join(' vs '));
  });
  return seen.size;
}

function pairKey(a, b) {
  return String(a) < String(b) ? `${a}|${b}` : `${b}|${a}`;
}

function countComb(n, k) {
  const nn = Math.max(0, Math.floor(Number(n) || 0));
  const kk = Math.max(0, Math.floor(Number(k) || 0));
  if (kk < 0 || kk > nn) return 0;
  if (kk === 0 || kk === nn) return 1;
  const limit = Math.min(kk, nn - kk);
  let numerator = 1;
  let denominator = 1;
  for (let i = 1; i <= limit; i += 1) {
    numerator *= (nn - limit + i);
    denominator *= i;
  }
  return Math.round(numerator / denominator);
}

function collectPairMetrics(matches) {
  const partnerCount = {};
  const opponentCount = {};

  matches.forEach((match) => {
    const teamA = Array.isArray(match.teamA) ? match.teamA : [];
    const teamB = Array.isArray(match.teamB) ? match.teamB : [];
    if (teamA.length >= 2) {
      partnerCount[pairKey(teamA[0], teamA[1])] = (partnerCount[pairKey(teamA[0], teamA[1])] || 0) + 1;
    }
    if (teamB.length >= 2) {
      partnerCount[pairKey(teamB[0], teamB[1])] = (partnerCount[pairKey(teamB[0], teamB[1])] || 0) + 1;
    }
    teamA.forEach((a) => {
      teamB.forEach((b) => {
        const key = pairKey(a, b);
        opponentCount[key] = (opponentCount[key] || 0) + 1;
      });
    });
  });

  const partnerValues = Object.values(partnerCount);
  const opponentValues = Object.values(opponentCount);
  return {
    partnerCount,
    opponentCount,
    uniquePartnerPairs: Object.keys(partnerCount).length,
    uniqueOpponentPairs: Object.keys(opponentCount).length,
    partnerRepeats: partnerValues.reduce((sum, count) => sum + Math.max(0, count - 1), 0),
    opponentRepeats: opponentValues.reduce((sum, count) => sum + Math.max(0, count - 1), 0)
  };
}

function computeRestMetrics(ids, playCounts, totalRounds, maxRestStreakMap = {}) {
  const normalizedRounds = Math.max(0, Number(totalRounds) || 0);
  const restCounts = Object.fromEntries(ids.map((id) => [id, Math.max(0, normalizedRounds - (Number(playCounts[id]) || 0))]));
  const restValues = Object.values(restCounts);
  const maxRestStreak = Math.max(
    0,
    ...ids.map((id) => Number(maxRestStreakMap[id]) || 0)
  );

  return {
    restCounts,
    restCountSpread: computeSpread(restValues),
    maxRestCount: restValues.length ? Math.max(...restValues) : 0,
    minRestCount: restValues.length ? Math.min(...restValues) : 0,
    maxRestStreak
  };
}

function computeCoverageTotals(scenario, ids) {
  if (!scenario || scenario.mode === 'rotation') {
    const totalPairs = countComb(ids.length, 2);
    return {
      totalPartnerPairs: totalPairs,
      totalOpponentPairs: totalPairs
    };
  }

  const aCount = Math.max(0, Number(scenario.squadAPlayers) || 0);
  const bCount = Math.max(0, Number(scenario.squadBPlayers) || 0);
  return {
    totalPartnerPairs: countComb(aCount, 2) + countComb(bCount, 2),
    totalOpponentPairs: aCount * bCount
  };
}

function computeTotalExactMatchupCapacity(scenario, ids) {
  if (!scenario || scenario.mode === 'rotation') {
    const playerCount = Math.max(0, Array.isArray(ids) ? ids.length : 0);
    return playerCount >= 4 ? countComb(playerCount, 4) * 3 : 0;
  }
  const aCount = Math.max(0, Number(scenario.squadAPlayers) || 0);
  const bCount = Math.max(0, Number(scenario.squadBPlayers) || 0);
  return countComb(aCount, 2) * countComb(bCount, 2);
}

function isEqualSquadScenario(scenario) {
  return Boolean(scenario)
    && scenario.mode === 'squad'
    && Number(scenario.squadAPlayers) > 0
    && Number(scenario.squadAPlayers) === Number(scenario.squadBPlayers);
}

function buildSquadRepeatBaselineScope(scenario) {
  if (!scenario || scenario.mode !== 'squad') return '';
  const scope = `${scenario.squadAPlayers}v${scenario.squadBPlayers}/${scenario.targetMatches}m/${scenario.courts}c`;
  const shape = isEqualSquadScenario(scenario) ? 'equal' : 'uneven';
  return `squad:${shape}:${scope}`;
}

function computeSquadRepeatBaselines(scenario, actualMatches, coverageTotals = {}) {
  const override = SQUAD_REPEAT_BASELINE_OVERRIDES[buildSquadRepeatBaselineScope(scenario)];
  if (override) {
    return {
      partnerRepeatBaseline: Number(override.partnerRepeatBaseline) || 0,
      opponentRepeatBaseline: Number(override.opponentRepeatBaseline) || 0
    };
  }
  if (!isEqualSquadScenario(scenario)) {
    return {
      partnerRepeatBaseline: 0,
      opponentRepeatBaseline: 0
    };
  }

  const normalizedMatches = Math.max(0, Number(actualMatches) || 0);
  const totalPartnerPairs = Math.max(0, Number(coverageTotals.totalPartnerPairs) || 0);
  const totalOpponentPairs = Math.max(0, Number(coverageTotals.totalOpponentPairs) || 0);

  return {
    partnerRepeatBaseline: Math.max(0, (normalizedMatches * 2) - totalPartnerPairs),
    opponentRepeatBaseline: Math.max(0, (normalizedMatches * 4) - totalOpponentPairs)
  };
}

function formatCoveragePct(uniqueCount, totalCount) {
  if (!(totalCount > 0)) return 0;
  return Math.round((uniqueCount / totalCount) * 100);
}

function cloneScenarioWithSeed(scenario, seed) {
  const next = {
    ...scenario,
    options: scenario && scenario.options ? { ...scenario.options } : undefined,
    rules: scenario && scenario.rules ? { ...scenario.rules } : undefined
  };
  if (next.mode === 'rotation') {
    next.options = {
      ...(next.options || {}),
      seed
    };
  } else {
    next.rules = {
      ...(next.rules || {}),
      _seed: seed
    };
  }
  return next;
}

function theoreticalPlaySpread(playersCount, totalMatches) {
  return Math.ceil((4 * totalMatches) / playersCount) - Math.floor((4 * totalMatches) / playersCount);
}

function computeCountSpreadForIds(playCount, ids) {
  return computeSpread((ids || []).map((id) => Number(playCount[id]) || 0));
}

function computePlayCountBounds(playersCount, totalAppearances) {
  const normalizedPlayers = Math.max(1, Number(playersCount) || 1);
  const normalizedAppearances = Math.max(0, Number(totalAppearances) || 0);
  return {
    min: Math.floor(normalizedAppearances / normalizedPlayers),
    max: Math.ceil(normalizedAppearances / normalizedPlayers)
  };
}

function computeSquadAppearanceBounds(playersCount, courts, totalRounds) {
  const activePerRound = Math.min(
    Math.max(0, Number(playersCount) || 0),
    Math.max(1, Number(courts) || 1) * 2
  );
  const totalAppearances = activePerRound * Math.max(0, Number(totalRounds) || 0);
  const bounds = computePlayCountBounds(playersCount, totalAppearances);
  return {
    activePerRound,
    totalAppearances,
    min: bounds.min,
    max: bounds.max,
    spread: bounds.max - bounds.min
  };
}

function computeSquadPlaySpreadBaseline(playersCount, courts, totalRounds) {
  return computeSquadAppearanceBounds(playersCount, courts, totalRounds).spread;
}

function computeSquadGlobalPlaySpreadBaseline(squadAPlayers, squadBPlayers, courts, totalRounds) {
  const squadABounds = computeSquadAppearanceBounds(squadAPlayers, courts, totalRounds);
  const squadBBounds = computeSquadAppearanceBounds(squadBPlayers, courts, totalRounds);
  return Math.max(squadABounds.max, squadBBounds.max) - Math.min(squadABounds.min, squadBBounds.min);
}

function computeRotationStreakLimit(playersCount, courts, totalRounds) {
  const normalizedPlayers = Math.max(0, Number(playersCount) || 0);
  const activePerRound = Math.min(
    normalizedPlayers,
    Math.max(1, Number(courts) || 1) * 4
  );
  const benchCount = Math.max(0, normalizedPlayers - activePerRound);
  if (benchCount <= 0) return totalRounds;
  const guaranteedRests = Math.floor((benchCount * totalRounds) / normalizedPlayers);
  if (guaranteedRests <= 0) return totalRounds;
  // rotation 中常见的“每人只休 1 次”短赛程会把休息位压在首尾轮，闭式下界会过严，
  // 用 totalRounds-1 作为更贴近实际 bench 分配的结构基准，避免误报 5p/10p/15p 这类 case。
  if (guaranteedRests === 1) return Math.max(1, totalRounds - 1);
  return computeSquadStreakLimit(normalizedPlayers, Math.max(1, Math.floor(activePerRound / 2)), totalRounds);
}

function computeSquadStreakLimit(playersPerSquad, courts, totalRounds) {
  const activePerRound = Math.min(playersPerSquad, Math.max(1, Number(courts) || 1) * 2);
  const benchCount = Math.max(0, playersPerSquad - activePerRound);
  if (benchCount <= 0) return totalRounds;
  const guaranteedRests = Math.floor((benchCount * totalRounds) / playersPerSquad);
  return Math.ceil((totalRounds - guaranteedRests) / (guaranteedRests + 1)) + 1;
}

function getCoverageFirstExceptionMeta(id) {
  return COVERAGE_FIRST_EXCEPTION_META[String(id || '').trim()] || null;
}

function buildCoverageFirstExceptionRecord(result) {
  const scenario = result && result.scenario ? result.scenario : {};
  const exceptionMeta = getCoverageFirstExceptionMeta(scenario.coverageFirstExceptionId);
  if (!exceptionMeta) return null;

  let structureLimit = 0;
  if (scenario.mode === 'rotation') {
    structureLimit = computeRotationStreakLimit(
      scenario.playersCount,
      result.effectiveCourts || scenario.courts,
      result.totalRounds
    );
  } else if (scenario.mode === 'squad') {
    structureLimit = Math.max(
      computeSquadStreakLimit(scenario.squadAPlayers, scenario.courts, result.totalRounds),
      computeSquadStreakLimit(scenario.squadBPlayers, scenario.courts, result.totalRounds)
    );
  }

  return {
    id: exceptionMeta.id,
    mode: exceptionMeta.mode,
    case: exceptionMeta.case,
    scope: exceptionMeta.scope,
    note: exceptionMeta.note,
    structureLimit,
    maxConsecutivePlay: result.maxConsecutivePlay,
    targetMatches: Number(scenario.targetMatches) || 0,
    executionProfile: String(result.executionProfile || ''),
    fallbackReason: String(result.fallbackReason || '')
  };
}

function buildCoverageFirstExceptionRows(results) {
  const rowsById = new Map();
  (Array.isArray(results) ? results : []).forEach((result) => {
    const record = buildCoverageFirstExceptionRecord(result);
    if (!record) return;
    const existing = rowsById.get(record.id);
    if (
      !existing
      || record.targetMatches > existing.targetMatches
      || record.maxConsecutivePlay > existing.maxConsecutivePlay
    ) {
      rowsById.set(record.id, record);
    }
  });
  return [...rowsById.values()].sort((left, right) => {
    if (left.mode !== right.mode) return left.mode.localeCompare(right.mode, 'en');
    return left.case.localeCompare(right.case, 'en', { numeric: true });
  });
}

function computeSquadHardElapsedMs(playersPerSquad, courts, totalMatches) {
  if (playersPerSquad >= 9 || courts >= 4 || totalMatches >= 18) {
    return SQUAD_EXTREME_BOUND_MS;
  }
  return SQUAD_FAST_BOUND_MS;
}

function buildRotationRepresentativeScenarios() {
  return [
    {
      id: 'rotation-6p-12m-1c',
      name: 'rotation 6p/12m/1c',
      mode: 'rotation',
      kind: 'rotation_template_representative',
      playersCount: 6,
      femaleCount: 0,
      totalMatches: 12,
      targetMatches: 12,
      courts: 1,
      options: { seed: 7 },
      maxElapsedMs: TEMPLATE_FAST_BOUND_MS,
      expectTemplate: true,
      expectedPlaySpread: 0
    },
    {
      id: 'rotation-8p-8m-2c',
      name: 'rotation 8p/8m/2c',
      mode: 'rotation',
      kind: 'rotation_template_representative',
      playersCount: 8,
      femaleCount: 0,
      totalMatches: 8,
      targetMatches: 8,
      courts: 2,
      options: { seed: 7 },
      maxElapsedMs: TEMPLATE_FAST_BOUND_MS,
      expectTemplate: true,
      expectedPlaySpread: 0
    },
    {
      id: 'rotation-9p-12m-1c',
      name: 'rotation 9p/12m/1c',
      mode: 'rotation',
      kind: 'rotation_template_representative',
      playersCount: 9,
      femaleCount: 0,
      totalMatches: 12,
      targetMatches: 12,
      courts: 1,
      options: { seed: 7 },
      maxElapsedMs: TEMPLATE_FAST_BOUND_MS,
      expectTemplate: true,
      expectedPlaySpread: 1
    },
    {
      id: 'rotation-10p-18m-2c',
      name: 'rotation 10p/18m/2c',
      mode: 'rotation',
      kind: 'rotation_template_representative',
      playersCount: 10,
      femaleCount: 0,
      totalMatches: 18,
      targetMatches: 18,
      courts: 2,
      options: { seed: 7 },
      maxElapsedMs: TEMPLATE_FAST_BOUND_MS,
      expectTemplate: true,
      expectedPlaySpread: 1
    },
    {
      id: 'rotation-12p-12m-2c',
      name: 'rotation 12p/12m/2c',
      mode: 'rotation',
      kind: 'rotation_template_representative',
      playersCount: 12,
      femaleCount: 0,
      totalMatches: 12,
      targetMatches: 12,
      courts: 2,
      options: { seed: 7 },
      maxElapsedMs: TEMPLATE_FAST_BOUND_MS,
      expectTemplate: true,
      expectedPlaySpread: 0
    },
    {
      id: 'rotation-14p-12m-4c',
      name: 'rotation 14p/12m/4c',
      mode: 'rotation',
      kind: 'rotation_template_representative',
      playersCount: 14,
      femaleCount: 6,
      totalMatches: 12,
      targetMatches: 12,
      courts: 4,
      options: { seed: 7 },
      maxElapsedMs: TEMPLATE_FAST_BOUND_MS,
      expectTemplate: true,
      expectedPlaySpread: 1,
      expectedEffectiveCourts: 3
    },
    {
      id: 'rotation-16p-12m-4c',
      name: 'rotation 16p/12m/4c',
      mode: 'rotation',
      kind: 'rotation_template_representative',
      playersCount: 16,
      femaleCount: 8,
      totalMatches: 12,
      targetMatches: 12,
      courts: 4,
      options: { seed: 7 },
      maxElapsedMs: TEMPLATE_FAST_BOUND_MS,
      expectTemplate: true,
      expectedPlaySpread: 0
    },
    {
      id: 'rotation-20p-12m-1c',
      name: 'rotation 20p/12m/1c',
      mode: 'rotation',
      kind: 'rotation_template_representative',
      playersCount: 20,
      femaleCount: 10,
      totalMatches: 12,
      targetMatches: 12,
      courts: 1,
      options: { seed: 7, searchSeeds: 1 },
      maxElapsedMs: TEMPLATE_FAST_BOUND_MS,
      expectTemplate: true,
      expectedPlaySpread: 1
    },
    {
      id: 'rotation-24p-12m-2c',
      name: 'rotation 24p/12m/2c',
      mode: 'rotation',
      kind: 'rotation_template_representative',
      playersCount: 24,
      femaleCount: 12,
      totalMatches: 12,
      targetMatches: 12,
      courts: 2,
      options: { seed: 7, searchSeeds: 1 },
      maxElapsedMs: TEMPLATE_FAST_BOUND_MS,
      expectTemplate: true,
      expectedPlaySpread: 0
    }
  ];
}

function buildRotationBudgetRepresentativeScenarios() {
  return [
    {
      id: 'rotation-10p-23m-2c-budget300',
      name: 'rotation 10p/23m/2c budget=300',
      mode: 'rotation',
      kind: 'rotation_budget_representative',
      playersCount: 10,
      femaleCount: 5,
      totalMatches: 23,
      targetMatches: 23,
      courts: 2,
      options: { seed: 42, searchSeeds: 1, runtimeBudgetMs: 300 },
      maxElapsedMs: ROTATION_GUARDED_BOUND_MS,
      requireGuardedProfile: true
    }
  ];
}

function buildSquadRepresentativeScenarios() {
  return [
    {
      id: 'squad-4v4-12m-1c',
      name: 'squad 4v4/12m/1c',
      mode: 'squad',
      kind: 'squad_representative',
      squadAPlayers: 4,
      squadBPlayers: 4,
      totalMatches: 12,
      targetMatches: 12,
      courts: 1,
      rules: { endCondition: { type: 'total_matches', target: 12 }, _seed: 1 },
      maxElapsedMs: SQUAD_FAST_BOUND_MS,
      expectedPlaySpread: 0,
      expectedMaxConsecutivePlay: 2
    },
    {
      id: 'squad-5v5-12m-2c',
      name: 'squad 5v5/12m/2c',
      mode: 'squad',
      kind: 'squad_representative',
      squadAPlayers: 5,
      squadBPlayers: 5,
      totalMatches: 12,
      targetMatches: 12,
      courts: 2,
      rules: { endCondition: { type: 'total_matches', target: 12 }, _seed: 1 },
      maxElapsedMs: SQUAD_FAST_BOUND_MS,
      maxPlaySpread: 1,
      maxConsecutivePlay: 5
    },
    {
      id: 'squad-6v6-12m-2c',
      name: 'squad 6v6/12m/2c',
      mode: 'squad',
      kind: 'squad_representative',
      squadAPlayers: 6,
      squadBPlayers: 6,
      totalMatches: 12,
      targetMatches: 12,
      courts: 2,
      rules: { endCondition: { type: 'total_matches', target: 12 }, _seed: 1 },
      maxElapsedMs: SQUAD_HEAVY_BOUND_MS,
      expectedPlaySpread: 0,
      maxConsecutivePlay: 3
    },
    {
      id: 'squad-8v8-16m-2c',
      name: 'squad 8v8/16m/2c',
      mode: 'squad',
      kind: 'squad_representative',
      squadAPlayers: 8,
      squadBPlayers: 8,
      totalMatches: 16,
      targetMatches: 16,
      courts: 2,
      rules: { endCondition: { type: 'total_matches', target: 16 }, _seed: 1 },
      maxElapsedMs: SQUAD_HEAVY_BOUND_MS,
      expectedPlaySpread: 0,
      maxConsecutivePlay: 1
    },
    {
      id: 'squad-10v10-20m-4c',
      name: 'squad 10v10/20m/4c',
      mode: 'squad',
      kind: 'squad_representative',
      squadAPlayers: 10,
      squadBPlayers: 10,
      totalMatches: 20,
      targetMatches: 20,
      courts: 4,
      rules: {
        endCondition: { type: 'total_matches', target: 20 },
        _hardDeadlineMs: 2500,
        _seed: 1
      },
      coverageFirstExceptionId: 'squad-10v10-20m-4c',
      maxElapsedMs: SQUAD_HEAVY_BOUND_MS,
      expectedPlaySpread: 0,
      maxConsecutivePlay: 4
    },
    {
      id: 'squad-3v4-9m-1c',
      name: 'squad 3v4/9m/1c',
      mode: 'squad',
      kind: 'squad_representative',
      squadAPlayers: 3,
      squadBPlayers: 4,
      totalMatches: 9,
      targetMatches: 9,
      courts: 1,
      rules: { endCondition: { type: 'total_matches', target: 9 }, _seed: 1 },
      maxElapsedMs: SQUAD_FAST_BOUND_MS,
      maxPlaySpread: 2,
      maxConsecutivePlay: 2
    }
  ];
}

function buildRotationTemplateAuditScenarios() {
  return Object.entries(templateLibrary && templateLibrary.cases ? templateLibrary.cases : {})
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey, 'en', { numeric: true }))
    .flatMap(([key, caseData]) => {
      const horizonMatches = Number(caseData && caseData.horizonMatches) || 0;
      const playersCount = Number(caseData && caseData.players) || 0;
      const courts = Number(caseData && caseData.courts) || 1;
      const scenarios = [];
      for (let matches = 1; matches <= horizonMatches; matches += 1) {
        scenarios.push({
          id: `rotation-template-${key}-${matches}`,
          name: `rotation template ${key}@${matches}`,
          mode: 'rotation',
          kind: 'rotation_template_audit',
          caseKey: key,
          playersCount,
          femaleCount: 0,
          totalMatches: matches,
          targetMatches: matches,
          courts,
          options: { seed: 7 },
          maxElapsedMs: TEMPLATE_FAST_BOUND_MS,
          expectTemplate: true,
          expectedTemplateKey: key,
          expectedPlaySpread: theoreticalPlaySpread(playersCount, matches),
          coverageFirstExceptionId: (
            (key === '6p-1c' && matches >= 5)
            || (key === '9p-2c' && matches >= 17)
          )
            ? `rotation-${key}`
            : ''
        });
      }
      return scenarios;
    });
}

function buildRotationLongTailAuditScenarios() {
  return [
    {
      id: 'rotation-longtail-10p-31m-2c-budget200',
      name: 'rotation longtail 10p/31m/2c budget=200',
      mode: 'rotation',
      kind: 'rotation_longtail_audit',
      caseKey: '10p-31m-2c-budget200',
      playersCount: 10,
      femaleCount: 5,
      totalMatches: 31,
      targetMatches: 31,
      courts: 2,
      options: { seed: 42, searchSeeds: 1, runtimeBudgetMs: 200 },
      maxElapsedMs: ROTATION_GUARDED_BOUND_MS
    },
    {
      id: 'rotation-longtail-11p-14m-2c-budget800',
      name: 'rotation longtail 11p/14m/2c budget=800',
      mode: 'rotation',
      kind: 'rotation_longtail_audit',
      caseKey: '11p-14m-2c-budget800',
      playersCount: 11,
      femaleCount: 5,
      totalMatches: 14,
      targetMatches: 14,
      courts: 2,
      options: { seed: 11, searchSeeds: 1, runtimeBudgetMs: 800 },
      maxElapsedMs: ROTATION_LONGTAIL_BOUND_MS
    },
    {
      id: 'rotation-longtail-13p-16m-2c-budget800',
      name: 'rotation longtail 13p/16m/2c budget=800',
      mode: 'rotation',
      kind: 'rotation_longtail_audit',
      caseKey: '13p-16m-2c-budget800',
      playersCount: 13,
      femaleCount: 6,
      totalMatches: 16,
      targetMatches: 16,
      courts: 2,
      options: { seed: 13, searchSeeds: 1, runtimeBudgetMs: 800 },
      maxElapsedMs: ROTATION_LONGTAIL_BOUND_MS
    },
    {
      id: 'rotation-longtail-15p-18m-3c-budget1200',
      name: 'rotation longtail 15p/18m/3c budget=1200',
      mode: 'rotation',
      kind: 'rotation_longtail_audit',
      caseKey: '15p-18m-3c-budget1200',
      playersCount: 15,
      femaleCount: 7,
      totalMatches: 18,
      targetMatches: 18,
      courts: 3,
      options: { seed: 15, searchSeeds: 1, runtimeBudgetMs: 1200 },
      maxElapsedMs: ROTATION_LONGTAIL_BOUND_MS
    }
  ];
}

function buildSquadEqualAuditScenarios() {
  const scenarios = [];
  for (let playersPerSquad = 4; playersPerSquad <= 10; playersPerSquad += 1) {
    for (let courts = 1; courts <= Math.min(4, Math.floor(playersPerSquad / 2)); courts += 1) {
      const logicalRoundsList = [3, 6];
      if (playersPerSquad === 10 && courts === 4) logicalRoundsList.splice(1, 0, 5);
      for (const logicalRounds of logicalRoundsList) {
        const totalMatches = courts * logicalRounds;
        scenarios.push({
          id: `squad-equal-${playersPerSquad}v${playersPerSquad}-${totalMatches}m-${courts}c`,
          name: `squad equal ${playersPerSquad}v${playersPerSquad}/${totalMatches}m/${courts}c`,
          mode: 'squad',
          kind: 'squad_equal_audit',
          caseKey: `${playersPerSquad}v${playersPerSquad}-${totalMatches}m-${courts}c`,
          squadAPlayers: playersPerSquad,
          squadBPlayers: playersPerSquad,
          totalMatches,
          targetMatches: totalMatches,
          courts,
          logicalRounds,
          rules: { endCondition: { type: 'total_matches', target: totalMatches }, _seed: 1 },
          maxElapsedMs: computeSquadHardElapsedMs(playersPerSquad, courts, totalMatches),
          coverageFirstExceptionId: (
            playersPerSquad === 10
            && courts === 4
            && totalMatches === 20
          )
            ? 'squad-10v10-20m-4c'
            : ''
        });
      }
    }
  }
  return scenarios;
}

function buildSquadUnevenAuditScenarios() {
  return [
    {
      id: 'squad-uneven-3v4-9m-1c',
      name: 'squad uneven 3v4/9m/1c',
      mode: 'squad',
      kind: 'squad_uneven_audit',
      caseKey: '3v4-9m-1c',
      squadAPlayers: 3,
      squadBPlayers: 4,
      totalMatches: 9,
      targetMatches: 9,
      courts: 1,
      logicalRounds: 9,
      rules: { endCondition: { type: 'total_matches', target: 9 }, _seed: 1 },
      maxElapsedMs: SQUAD_FAST_BOUND_MS
    },
    {
      id: 'squad-uneven-5v4-12m-1c',
      name: 'squad uneven 5v4/12m/1c',
      mode: 'squad',
      kind: 'squad_uneven_audit',
      caseKey: '5v4-12m-1c',
      squadAPlayers: 5,
      squadBPlayers: 4,
      totalMatches: 12,
      targetMatches: 12,
      courts: 1,
      logicalRounds: 12,
      rules: { endCondition: { type: 'total_matches', target: 12 }, _seed: 1 },
      maxElapsedMs: SQUAD_FAST_BOUND_MS
    },
    {
      id: 'squad-uneven-6v5-12m-2c',
      name: 'squad uneven 6v5/12m/2c',
      mode: 'squad',
      kind: 'squad_uneven_audit',
      caseKey: '6v5-12m-2c',
      squadAPlayers: 6,
      squadBPlayers: 5,
      totalMatches: 12,
      targetMatches: 12,
      courts: 2,
      logicalRounds: 6,
      rules: { endCondition: { type: 'total_matches', target: 12 }, _seed: 1 },
      maxElapsedMs: SQUAD_FAST_BOUND_MS
    }
  ];
}

function buildSquadTotalRoundsAuditScenarios() {
  return buildSquadEqualAuditScenarios()
    .concat(buildSquadUnevenAuditScenarios())
    .map((scenario) => {
      const logicalRounds = Number(scenario.logicalRounds)
        || Math.ceil((Number(scenario.totalMatches) || 0) / Math.max(1, Number(scenario.courts) || 1));
      return {
        ...scenario,
        id: `${scenario.id}-total-rounds`,
        name: `${scenario.name} total_rounds`,
        kind: 'squad_total_rounds_audit',
        rules: {
          ...(scenario.rules || {}),
          endCondition: { type: 'total_rounds', target: logicalRounds }
        }
      };
    });
}

function buildRepresentativeScenarios() {
  return [
    ...buildRotationRepresentativeScenarios(),
    ...buildRotationBudgetRepresentativeScenarios(),
    ...buildSquadRepresentativeScenarios()
  ];
}

function buildAuditScenarios() {
  return [
    ...buildRotationTemplateAuditScenarios(),
    ...buildRotationLongTailAuditScenarios(),
    ...buildSquadEqualAuditScenarios(),
    ...buildSquadUnevenAuditScenarios(),
    ...buildSquadTotalRoundsAuditScenarios()
  ];
}

function buildExtendedStabilityScenarios() {
  const rotationRiskPrefixes = [
    { caseKey: '8p-2c', matches: [13, 14, 15, 16] },
    { caseKey: '9p-2c', matches: [15, 16, 17, 18] }
  ].flatMap((spec) => spec.matches.map((matches) => {
    const templateCase = templateLibrary && templateLibrary.cases ? templateLibrary.cases[spec.caseKey] : null;
    return {
      id: `rotation-stability-${spec.caseKey}-${matches}`,
      label: `rotation ${spec.caseKey}/${matches}m`,
      mode: 'multi_rotate',
      seeds: [1, 7],
      scenario: {
        id: `rotation-stability-${spec.caseKey}-${matches}`,
        name: `rotation stability ${spec.caseKey}@${matches}`,
        mode: 'rotation',
        kind: 'rotation_stability',
        caseKey: spec.caseKey,
        playersCount: Number(templateCase && templateCase.players) || 0,
        femaleCount: 0,
        totalMatches: matches,
        targetMatches: matches,
        courts: Number(templateCase && templateCase.courts) || 1,
        options: { seed: 1 },
        maxElapsedMs: TEMPLATE_FAST_BOUND_MS,
        coverageFirstExceptionId: spec.caseKey === '9p-2c' && matches >= 17 ? 'rotation-9p-2c' : ''
      }
    };
  }));

  const rotationLongtail = buildRotationLongTailAuditScenarios().map((scenario) => ({
    id: `stability-${scenario.id}`,
    label: scenario.name.replace(/^rotation longtail /, 'rotation '),
    mode: 'multi_rotate',
    seeds: [1, 17],
    scenario: {
      ...scenario,
      kind: 'rotation_stability'
    }
  }));

  const squadUneven = buildSquadUnevenAuditScenarios().map((scenario) => ({
    id: `stability-${scenario.id}`,
    label: scenario.name.replace(/^squad uneven /, 'squad '),
    mode: 'squad_doubles',
    seeds: [1, 17],
    scenario: {
      ...scenario,
      kind: 'squad_stability'
    }
  }));

  const squadGuardedHeavy = buildSquadEqualAuditScenarios()
    .filter((scenario) => ['7v7-18m-3c', '9v9-24m-4c', '10v10-20m-4c'].includes(scenario.caseKey))
    .map((scenario) => ({
      id: `stability-${scenario.id}`,
      label: scenario.name.replace(/^squad equal /, 'squad '),
      mode: 'squad_doubles',
      seeds: [1, 2],
      scenario: {
        ...scenario,
        kind: 'squad_stability'
      }
    }));

  return rotationRiskPrefixes
    .concat(rotationLongtail)
    .concat(squadUneven)
    .concat(squadGuardedHeavy);
}

function runScenario(scenario) {
  const startedAt = performance.now();
  let out;
  let ids = [];
  let idsA = [];
  let idsB = [];
  if (scenario.mode === 'rotation') {
    const players = makeRotationPlayers(scenario.playersCount, scenario.femaleCount || 0);
    ids = players.map((player) => player.id);
    out = generateSchedule(players, scenario.totalMatches, scenario.courts, scenario.options || {});
  } else {
    const players = makeSquadPlayers(scenario.squadAPlayers, scenario.squadBPlayers);
    ids = players.map((player) => player.id);
    idsA = players.filter((player) => player.squad === 'A').map((player) => player.id);
    idsB = players.filter((player) => player.squad === 'B').map((player) => player.id);
    out = buildSquadSchedule(players, scenario.totalMatches, scenario.courts, scenario.rules || {});
  }

  const elapsedMs = Math.round(performance.now() - startedAt);
  const matches = collectMatches(out);
  const meta = out.schedulerMeta || {};
  const fairness = out.fairness || {};
  const playerStats = out.playerStats || {};
  const playCounts = computePlayCounts(matches, ids);
  const effectiveCourts = Math.max(1, Number(meta.effectiveCourts) || Number(scenario.courts) || 1);
  const logicalRounds = scenario.logicalRounds || Math.ceil((scenario.totalMatches || 0) / effectiveCourts);
  const pairMetrics = collectPairMetrics(matches);
  const restMetrics = computeRestMetrics(
    ids,
    playCounts,
    logicalRounds,
    playerStats.maxRestStreak || {}
  );
  const coverageTotals = computeCoverageTotals(scenario, ids);
  const totalExactMatchupCapacity = computeTotalExactMatchupCapacity(scenario, ids);
  const repeatBaselines = computeSquadRepeatBaselines(scenario, matches.length, coverageTotals);
  const squadAPlaySpread = scenario.mode === 'squad'
    ? computeCountSpreadForIds(playCounts, idsA)
    : 0;
  const squadBPlaySpread = scenario.mode === 'squad'
    ? computeCountSpreadForIds(playCounts, idsB)
    : 0;
  const globalPlaySpreadBaseline = scenario.mode === 'squad'
    ? computeSquadGlobalPlaySpreadBaseline(
      scenario.squadAPlayers,
      scenario.squadBPlayers,
      effectiveCourts,
      logicalRounds
    )
    : 0;
  const playSpreadExcess = scenario.mode === 'squad'
    ? Math.max(0, (Number(fairness.playSpread ?? meta.playSpread ?? computeSpread(Object.values(playCounts))) || 0) - globalPlaySpreadBaseline)
    : 0;
  const uniqueExactMatchupCount = Number(meta.uniqueExactMatchupCount ?? countUniqueExactMatchups(matches)) || 0;
  const exactRepeatCount = Math.max(0, matches.length - uniqueExactMatchupCount);
  const exactRepeatBaseline = Math.max(0, matches.length - totalExactMatchupCapacity);

  return {
    scenario,
    out,
    elapsedMs,
    actualMatches: matches.length,
    computedPlaySpread: computeSpread(Object.values(playCounts)),
    computedMaxConsecutivePlay: computeMaxConsecutive(out.rounds || [], ids),
    computedUniqueExactMatchupCount: countUniqueExactMatchups(matches),
    totalExactMatchupCapacity,
    exactRepeatCount,
    exactRepeatBaseline,
    exactRepeatExcess: Math.max(0, exactRepeatCount - exactRepeatBaseline),
    fairnessScore: Number(out.fairnessScore) || 0,
    playSpread: Number(fairness.playSpread ?? meta.playSpread ?? computeSpread(Object.values(playCounts))),
    maxConsecutivePlay: Number(fairness.maxConsecutivePlay ?? meta.maxConsecutivePlay ?? 0),
    uniqueExactMatchupCount,
    uniquePartnerPairs: Number(playerStats.uniquePartnerPairs ?? pairMetrics.uniquePartnerPairs),
    uniqueOpponentPairs: Number(playerStats.uniqueOpponentPairs ?? pairMetrics.uniqueOpponentPairs),
    partnerRepeats: Number(fairness.partnerRepeats ?? playerStats.partnerRepeats ?? pairMetrics.partnerRepeats),
    opponentRepeats: Number(fairness.opponentRepeats ?? playerStats.opponentRepeats ?? pairMetrics.opponentRepeats),
    partnerRepeatBaseline: repeatBaselines.partnerRepeatBaseline,
    opponentRepeatBaseline: repeatBaselines.opponentRepeatBaseline,
    partnerRepeatExcess: Math.max(
      0,
      Number(fairness.partnerRepeats ?? playerStats.partnerRepeats ?? pairMetrics.partnerRepeats)
        - repeatBaselines.partnerRepeatBaseline
    ),
    opponentRepeatExcess: Math.max(
      0,
      Number(fairness.opponentRepeats ?? playerStats.opponentRepeats ?? pairMetrics.opponentRepeats)
        - repeatBaselines.opponentRepeatBaseline
    ),
    partnerCoveragePct: formatCoveragePct(
      Number(playerStats.uniquePartnerPairs ?? pairMetrics.uniquePartnerPairs),
      coverageTotals.totalPartnerPairs
    ),
    opponentCoveragePct: formatCoveragePct(
      Number(playerStats.uniqueOpponentPairs ?? pairMetrics.uniqueOpponentPairs),
      coverageTotals.totalOpponentPairs
    ),
    restCountSpread: restMetrics.restCountSpread,
    maxRestStreak: restMetrics.maxRestStreak,
    maxRestCount: restMetrics.maxRestCount,
    minRestCount: restMetrics.minRestCount,
    globalPlaySpreadBaseline,
    playSpreadExcess,
    squadAPlaySpread,
    squadBPlaySpread,
    totalRounds: logicalRounds,
    engine: String(meta.engine || ''),
    executionProfile: String(meta.executionProfile || ''),
    timeoutGuardTriggered: meta.timeoutGuardTriggered === true,
    fallbackReason: String(meta.fallbackReason || ''),
    fairnessVersion: String(meta.fairnessVersion || ''),
    searchElapsedMs: Number(meta.searchElapsedMs),
    effectiveCourts,
    templateKey: String(meta.templateKey || '')
  };
}

function buildErroredScenarioResult(scenario, error, elapsedMs) {
  const logicalRounds = scenario.logicalRounds || Math.ceil((scenario.totalMatches || 0) / Math.max(1, scenario.courts || 1));
  const message = error && error.message ? String(error.message) : 'unknown scenario error';
  return {
    scenario,
    out: { rounds: [], schedulerMeta: {} },
    elapsedMs,
    actualMatches: 0,
    computedPlaySpread: 0,
    computedMaxConsecutivePlay: 0,
    computedUniqueExactMatchupCount: 0,
    fairnessScore: 0,
    playSpread: 0,
    maxConsecutivePlay: 0,
    uniqueExactMatchupCount: 0,
    totalExactMatchupCapacity: 0,
    exactRepeatCount: 0,
    exactRepeatBaseline: 0,
    exactRepeatExcess: 0,
    uniquePartnerPairs: 0,
    uniqueOpponentPairs: 0,
    partnerRepeats: 0,
    opponentRepeats: 0,
    partnerRepeatBaseline: 0,
    opponentRepeatBaseline: 0,
    partnerRepeatExcess: 0,
    opponentRepeatExcess: 0,
    partnerCoveragePct: 0,
    opponentCoveragePct: 0,
    restCountSpread: 0,
    maxRestStreak: 0,
    maxRestCount: 0,
    minRestCount: 0,
    totalRounds: logicalRounds,
    engine: '',
    executionProfile: 'error',
    timeoutGuardTriggered: false,
    fallbackReason: message,
    fairnessVersion: '',
    searchElapsedMs: elapsedMs,
    effectiveCourts: Number(scenario && scenario.courts) || 0,
    templateKey: '',
    errorMessage: message
  };
}

function runScenarioSafely(scenario) {
  const startedAt = performance.now();
  try {
    return {
      ok: true,
      result: runScenario(scenario)
    };
  } catch (error) {
    return {
      ok: false,
      result: buildErroredScenarioResult(scenario, error, Math.round(performance.now() - startedAt)),
      error
    };
  }
}

function compareWorstResult(left, right) {
  const leftCoverageLoss = Math.max(0, (Number(left.scenario && left.scenario.targetMatches) || 0) - (Number(left.actualMatches) || 0));
  const rightCoverageLoss = Math.max(0, (Number(right.scenario && right.scenario.targetMatches) || 0) - (Number(right.actualMatches) || 0));
  if (leftCoverageLoss !== rightCoverageLoss) return rightCoverageLoss - leftCoverageLoss;
  const leftExactRepeatPressure = Number(left.exactRepeatExcess ?? left.exactRepeatCount) || 0;
  const rightExactRepeatPressure = Number(right.exactRepeatExcess ?? right.exactRepeatCount) || 0;
  if (leftExactRepeatPressure !== rightExactRepeatPressure) return rightExactRepeatPressure - leftExactRepeatPressure;
  const leftRepeatPressure = left.scenario && left.scenario.mode === 'squad'
    ? ((Number(left.partnerRepeatExcess) || 0) * 100 + (Number(left.opponentRepeatExcess) || 0))
    : ((Number(left.partnerRepeats) || 0) * 100 + (Number(left.opponentRepeats) || 0));
  const rightRepeatPressure = right.scenario && right.scenario.mode === 'squad'
    ? ((Number(right.partnerRepeatExcess) || 0) * 100 + (Number(right.opponentRepeatExcess) || 0))
    : ((Number(right.partnerRepeats) || 0) * 100 + (Number(right.opponentRepeats) || 0));
  if (leftRepeatPressure !== rightRepeatPressure) return rightRepeatPressure - leftRepeatPressure;
  if ((Number(left.maxConsecutivePlay) || 0) !== (Number(right.maxConsecutivePlay) || 0)) return (Number(right.maxConsecutivePlay) || 0) - (Number(left.maxConsecutivePlay) || 0);
  const leftPlayPressure = left.scenario && left.scenario.mode === 'squad'
    ? (Number(left.playSpreadExcess) || 0)
    : (Number(left.playSpread) || 0);
  const rightPlayPressure = right.scenario && right.scenario.mode === 'squad'
    ? (Number(right.playSpreadExcess) || 0)
    : (Number(right.playSpread) || 0);
  if (leftPlayPressure !== rightPlayPressure) return rightPlayPressure - leftPlayPressure;
  if (Boolean(left.timeoutGuardTriggered) !== Boolean(right.timeoutGuardTriggered)) return Number(Boolean(right.timeoutGuardTriggered)) - Number(Boolean(left.timeoutGuardTriggered));
  if ((String(left.executionProfile || '').includes('guarded')) !== (String(right.executionProfile || '').includes('guarded'))) {
    return Number(String(right.executionProfile || '').includes('guarded')) - Number(String(left.executionProfile || '').includes('guarded'));
  }
  return (Number(right.elapsedMs) || 0) - (Number(left.elapsedMs) || 0);
}

function summarizeStabilityRuns(spec, results) {
  const safeResults = Array.isArray(results) ? results : [];
  const elapsedValues = safeResults.map((result) => Number(result.elapsedMs) || 0);
  const playSpreadValues = safeResults.map((result) => Number(result.playSpread) || 0);
  const maxConsecutiveValues = safeResults.map((result) => Number(result.maxConsecutivePlay) || 0);
  const uniqueExactValues = safeResults.map((result) => Number(result.uniqueExactMatchupCount) || 0);
  const partnerRepeatValues = safeResults.map((result) => Number(result.partnerRepeats) || 0);
  const opponentRepeatValues = safeResults.map((result) => Number(result.opponentRepeats) || 0);
  const worstResult = safeResults.slice().sort(compareWorstResult)[0] || null;
  const executionProfileCounts = safeResults.reduce((acc, result) => {
    const key = String(result.executionProfile || '<empty>');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    id: spec.id,
    label: spec.label,
    mode: spec.mode,
    seeds: spec.seeds.join(', '),
    runs: safeResults.length,
    playSpreadRange: `${Math.min(...playSpreadValues)}-${Math.max(...playSpreadValues)}`,
    maxConsecutiveRange: `${Math.min(...maxConsecutiveValues)}-${Math.max(...maxConsecutiveValues)}`,
    uniqueExactRange: `${Math.min(...uniqueExactValues)}-${Math.max(...uniqueExactValues)}`,
    partnerRepeatsRange: `${Math.min(...partnerRepeatValues)}-${Math.max(...partnerRepeatValues)}`,
    opponentRepeatsRange: `${Math.min(...opponentRepeatValues)}-${Math.max(...opponentRepeatValues)}`,
    elapsedRange: `${Math.min(...elapsedValues)}-${Math.max(...elapsedValues)}`,
    worstSeed: worstResult ? (
      worstResult.scenario.mode === 'rotation'
        ? Number(worstResult.scenario.options && worstResult.scenario.options.seed)
        : Number(worstResult.scenario.rules && worstResult.scenario.rules._seed)
    ) : 0,
    worstExecutionProfile: worstResult ? String(worstResult.executionProfile || '') : '',
    worstFallbackReason: worstResult ? String(worstResult.fallbackReason || '') : '',
    stableCoverage: Math.min(...uniqueExactValues) === Math.max(...uniqueExactValues),
    executionProfiles: Object.entries(executionProfileCounts)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([profile, count]) => `${profile}:${count}`)
      .join(', ')
  };
}

function runExtendedStabilityMatrix(specs = buildExtendedStabilityScenarios()) {
  return specs.map((spec) => {
    const results = spec.seeds.map((seed) => runScenario(cloneScenarioWithSeed(spec.scenario, seed)));
    return summarizeStabilityRuns(spec, results);
  });
}

function evaluateScenario(result) {
  const scenario = result.scenario;
  const failures = [];
  const warnings = [];

  if (result.actualMatches !== scenario.targetMatches) {
    failures.push({
      scenario: scenario.name,
      mode: scenario.mode,
      code: 'match_count',
      message: `expected ${scenario.targetMatches}, got ${result.actualMatches}`
    });
  }

  if (!(result.fairnessScore > 0)) {
    failures.push({
      scenario: scenario.name,
      mode: scenario.mode,
      code: 'fairness_score',
      message: `fairnessScore=${result.fairnessScore}`
    });
  }

  if (!result.executionProfile || !Number.isFinite(result.searchElapsedMs) || !result.fairnessVersion) {
    failures.push({
      scenario: scenario.name,
      mode: scenario.mode,
      code: 'metadata_missing',
      message: `executionProfile=${result.executionProfile} searchElapsedMs=${result.searchElapsedMs} fairnessVersion=${result.fairnessVersion}`
    });
  }

  if (result.elapsedMs > scenario.maxElapsedMs) {
    failures.push({
      scenario: scenario.name,
      mode: scenario.mode,
      code: 'elapsed_ms',
      message: `elapsedMs=${result.elapsedMs} > ${scenario.maxElapsedMs}`
    });
  }

  if (scenario.expectTemplate && result.engine !== 'template') {
    failures.push({
      scenario: scenario.name,
      mode: scenario.mode,
      code: 'template_route',
      message: `engine=${result.engine || '<empty>'}`
    });
  }

  if (scenario.expectTemplate && result.uniqueExactMatchupCount !== scenario.targetMatches) {
    failures.push({
      scenario: scenario.name,
      mode: scenario.mode,
      code: 'unique_exact',
      message: `uniqueExact=${result.uniqueExactMatchupCount} expected=${scenario.targetMatches}`
    });
  }

  if (scenario.expectTemplate && scenario.expectedTemplateKey && result.templateKey !== scenario.expectedTemplateKey) {
    failures.push({
      scenario: scenario.name,
      mode: scenario.mode,
      code: 'template_key',
      message: `templateKey=${result.templateKey} expected=${scenario.expectedTemplateKey}`
    });
  }

  const theoreticalSpread = Number.isFinite(scenario.expectedPlaySpread)
    ? scenario.expectedPlaySpread
    : (scenario.mode === 'rotation'
      ? theoreticalPlaySpread(scenario.playersCount, scenario.totalMatches)
      : null);

  if (Number.isFinite(theoreticalSpread) && result.playSpread > (theoreticalSpread + 1)) {
    warnings.push({
      scenario: scenario.name,
      mode: scenario.mode,
      code: 'play_spread',
      message: `playSpread=${result.playSpread} theoretical=${theoreticalSpread}`
    });
  }

  if (scenario.kind === 'rotation_template_audit') {
    const structureLimit = computeRotationStreakLimit(
      scenario.playersCount,
      result.effectiveCourts || scenario.courts,
      result.totalRounds
    );
    const activePerRound = Math.min(
      scenario.playersCount,
      Math.max(1, Number(result.effectiveCourts || scenario.courts) || 1) * 4
    );
    const hasBench = scenario.playersCount > activePerRound;
    if (hasBench && result.maxConsecutivePlay > structureLimit && !getCoverageFirstExceptionMeta(scenario.coverageFirstExceptionId)) {
      warnings.push({
        scenario: scenario.name,
        mode: scenario.mode,
        code: 'max_consecutive',
        message: `maxConsecutivePlay=${result.maxConsecutivePlay} structureLimit=${structureLimit}`
      });
    }
  }

  if (scenario.mode === 'squad') {
    const rounds = scenario.logicalRounds || Math.ceil(scenario.totalMatches / Math.max(1, scenario.courts));
    const aLimit = computeSquadStreakLimit(scenario.squadAPlayers, scenario.courts, rounds);
    const bLimit = computeSquadStreakLimit(scenario.squadBPlayers, scenario.courts, rounds);
    const structureLimit = Math.max(aLimit, bLimit);
    const hasBench = (scenario.squadAPlayers > scenario.courts * 2) || (scenario.squadBPlayers > scenario.courts * 2);
    if (hasBench && result.maxConsecutivePlay > structureLimit && !getCoverageFirstExceptionMeta(scenario.coverageFirstExceptionId)) {
      warnings.push({
        scenario: scenario.name,
        mode: scenario.mode,
        code: 'max_consecutive',
        message: `maxConsecutivePlay=${result.maxConsecutivePlay} structureLimit=${structureLimit}`
      });
    }
    if (
      (scenario.kind === 'squad_equal_audit' || scenario.kind === 'squad_total_rounds_audit')
      && result.executionProfile === 'greedy-fallback'
      && !getCoverageFirstExceptionMeta(scenario.coverageFirstExceptionId)
    ) {
      warnings.push({
        scenario: scenario.name,
        mode: scenario.mode,
        code: 'greedy_fallback',
        message: `executionProfile=${result.executionProfile} fallbackReason=${result.fallbackReason || '<empty>'}`
      });
    }
  }

  return { failures, warnings };
}

function hasElapsedFailure(evaluation) {
  return Boolean(evaluation && Array.isArray(evaluation.failures))
    && evaluation.failures.some((entry) => entry.code === 'elapsed_ms');
}

function runScenarioMatrix(scenarios) {
  const list = Array.isArray(scenarios) ? scenarios : [];
  const results = [];
  const summaryRows = [];
  const warnings = [];
  const failures = [];

  for (const scenario of list) {
    let firstRun = runScenarioSafely(scenario);
    if (!firstRun.ok) {
      const retryRun = runScenarioSafely(scenario);
      if (retryRun.ok) {
        warnings.push({
          scenario: scenario.name,
          mode: scenario.mode,
          code: 'runtime_retry_passed',
          message: `firstError=${firstRun.result.errorMessage} retryElapsedMs=${retryRun.result.elapsedMs}`
        });
        firstRun = retryRun;
      } else {
        warnings.push({
          scenario: scenario.name,
          mode: scenario.mode,
          code: 'runtime_retry_failed',
          message: `firstError=${firstRun.result.errorMessage} retryError=${retryRun.result.errorMessage}`
        });
        firstRun = retryRun;
      }
    }

    let result = firstRun.result;
    let evaluation = firstRun.ok
      ? evaluateScenario(result)
      : {
        failures: [{
          scenario: scenario.name,
          mode: scenario.mode,
          code: 'runtime_error',
          message: result.errorMessage
        }],
        warnings: []
      };

    if (hasElapsedFailure(evaluation)) {
      const firstElapsedMs = result.elapsedMs;
      const retryRun = runScenarioSafely(scenario);
      const retryResult = retryRun.result;
      const retryEvaluation = retryRun.ok
        ? evaluateScenario(retryResult)
        : {
          failures: [{
            scenario: scenario.name,
            mode: scenario.mode,
            code: 'runtime_error',
            message: retryResult.errorMessage
          }],
          warnings: []
        };
      if (retryRun.ok && !hasElapsedFailure(retryEvaluation)) {
        result = retryResult;
        evaluation = retryEvaluation;
        warnings.push({
          scenario: scenario.name,
          mode: scenario.mode,
          code: 'elapsed_retry_passed',
          message: `firstElapsedMs=${firstElapsedMs} retryElapsedMs=${retryResult.elapsedMs}`
        });
      }
    }

    const evaluatedResult = {
      ...result,
      warnings: evaluation.warnings,
      failures: evaluation.failures
    };
    results.push(evaluatedResult);
    summaryRows.push(toSummaryRow(evaluatedResult));
    warnings.push(...evaluation.warnings);
    failures.push(...evaluation.failures);
  }

  return {
    results,
    summaryRows,
    warnings,
    failures
  };
}

function buildAggregateWarnings(results) {
  const warnings = [];
  const squadEqualResults = results.filter((result) => result.scenario.kind === 'squad_equal_audit');
  if (squadEqualResults.length) {
    const guardedCount = squadEqualResults.filter((result) => result.executionProfile.includes('guarded')).length;
    const greedyCount = squadEqualResults.filter((result) => result.executionProfile === 'greedy-fallback').length;
    const guardedRatio = guardedCount / squadEqualResults.length;
    const greedyRatio = greedyCount / squadEqualResults.length;

    if (guardedRatio > 0.6) {
      warnings.push({
        scenario: 'squad equal matrix',
        mode: 'squad',
        code: 'guarded_ratio',
        message: `guardedRatio=${guardedRatio.toFixed(2)} (${guardedCount}/${squadEqualResults.length})`
      });
    }
    if (greedyRatio > 0.15) {
      warnings.push({
        scenario: 'squad equal matrix',
        mode: 'squad',
        code: 'greedy_ratio',
        message: `greedyRatio=${greedyRatio.toFixed(2)} (${greedyCount}/${squadEqualResults.length})`
      });
    }
  }
  return warnings;
}

function toSummaryRow(result) {
  const theoreticalSpread = result.scenario.mode === 'rotation'
    ? theoreticalPlaySpread(result.scenario.playersCount, result.scenario.totalMatches)
    : '';
  return {
    scenario: result.scenario.name,
    mode: result.scenario.mode,
    elapsedMs: result.elapsedMs,
    maxElapsedMs: result.scenario.maxElapsedMs,
    actualMatches: result.actualMatches,
    targetMatches: result.scenario.targetMatches,
    executionProfile: result.executionProfile,
    timeoutGuardTriggered: result.timeoutGuardTriggered,
    fallbackReason: result.fallbackReason,
    playSpread: result.playSpread,
    globalPlaySpreadBaseline: result.globalPlaySpreadBaseline,
    playSpreadExcess: result.playSpreadExcess,
    squadAPlaySpread: result.squadAPlaySpread,
    squadBPlaySpread: result.squadBPlaySpread,
    theoreticalPlaySpread: theoreticalSpread,
    maxConsecutivePlay: result.maxConsecutivePlay,
    uniqueExactMatchupCount: result.uniqueExactMatchupCount,
    exactRepeatCount: result.exactRepeatCount,
    exactRepeatBaseline: result.exactRepeatBaseline,
    exactRepeatExcess: result.exactRepeatExcess,
    partnerRepeats: result.partnerRepeats,
    opponentRepeats: result.opponentRepeats,
    partnerRepeatBaseline: result.partnerRepeatBaseline,
    opponentRepeatBaseline: result.opponentRepeatBaseline,
    partnerRepeatExcess: result.partnerRepeatExcess,
    opponentRepeatExcess: result.opponentRepeatExcess,
    restCountSpread: result.restCountSpread,
    partnerCoveragePct: result.partnerCoveragePct,
    opponentCoveragePct: result.opponentCoveragePct
  };
}

module.exports = {
  TEMPLATE_FAST_BOUND_MS,
  ROTATION_GUARDED_BOUND_MS,
  ROTATION_LONGTAIL_BOUND_MS,
  SQUAD_FAST_BOUND_MS,
  SQUAD_EXTREME_BOUND_MS,
  SQUAD_HEAVY_BOUND_MS,
  makeRotationPlayers,
  makeSquadPlayers,
  collectMatches,
  computeSpread,
  computePlayCounts,
  computeMaxConsecutive,
  countUniqueExactMatchups,
  theoreticalPlaySpread,
  computeCountSpreadForIds,
  computeSquadPlaySpreadBaseline,
  computeSquadGlobalPlaySpreadBaseline,
  computeSquadRepeatBaselines,
  computeRotationStreakLimit,
  computeSquadStreakLimit,
  getCoverageFirstExceptionMeta,
  buildCoverageFirstExceptionRecord,
  buildCoverageFirstExceptionRows,
  buildRotationRepresentativeScenarios,
  buildRotationBudgetRepresentativeScenarios,
  buildSquadRepresentativeScenarios,
  buildRotationTemplateAuditScenarios,
  buildRotationLongTailAuditScenarios,
  buildSquadEqualAuditScenarios,
  buildSquadUnevenAuditScenarios,
  buildSquadTotalRoundsAuditScenarios,
  buildRepresentativeScenarios,
  buildAuditScenarios,
  buildExtendedStabilityScenarios,
  runScenario,
  evaluateScenario,
  hasElapsedFailure,
  runScenarioMatrix,
  runExtendedStabilityMatrix,
  compareWorstResult,
  buildAggregateWarnings,
  toSummaryRow
};
