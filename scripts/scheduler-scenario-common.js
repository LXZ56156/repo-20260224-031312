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

function theoreticalPlaySpread(playersCount, totalMatches) {
  return Math.ceil((4 * totalMatches) / playersCount) - Math.floor((4 * totalMatches) / playersCount);
}

function computeSquadStreakLimit(playersPerSquad, courts, totalRounds) {
  const activePerRound = Math.min(playersPerSquad, Math.max(1, Number(courts) || 1) * 2);
  const benchCount = Math.max(0, playersPerSquad - activePerRound);
  if (benchCount <= 0) return totalRounds;
  const guaranteedRests = Math.floor((benchCount * totalRounds) / playersPerSquad);
  return Math.ceil((totalRounds - guaranteedRests) / (guaranteedRests + 1)) + 1;
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
      id: 'rotation-10p-23m-2c-budget200',
      name: 'rotation 10p/23m/2c budget=200',
      mode: 'rotation',
      kind: 'rotation_budget_representative',
      playersCount: 10,
      femaleCount: 5,
      totalMatches: 23,
      targetMatches: 23,
      courts: 2,
      options: { seed: 42, searchSeeds: 1, runtimeBudgetMs: 200 },
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
      expectedMaxConsecutivePlay: 1
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
      maxConsecutivePlay: 2
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
      maxElapsedMs: SQUAD_HEAVY_BOUND_MS,
      expectedPlaySpread: 0,
      maxPlaySpreadOnAllowedFallback: 2,
      allowedExecutionProfiles: ['beam-guarded', 'greedy-fallback']
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
          playersCount,
          femaleCount: 0,
          totalMatches: matches,
          targetMatches: matches,
          courts,
          options: { seed: 7 },
          maxElapsedMs: TEMPLATE_FAST_BOUND_MS,
          expectTemplate: true,
          expectedTemplateKey: key,
          expectedPlaySpread: theoreticalPlaySpread(playersCount, matches)
        });
      }
      return scenarios;
    });
}

function buildRotationLongTailAuditScenarios() {
  return [
    {
      id: 'rotation-longtail-10p-23m-2c-budget200',
      name: 'rotation longtail 10p/23m/2c budget=200',
      mode: 'rotation',
      kind: 'rotation_longtail_audit',
      playersCount: 10,
      femaleCount: 5,
      totalMatches: 23,
      targetMatches: 23,
      courts: 2,
      options: { seed: 42, searchSeeds: 1, runtimeBudgetMs: 200 },
      maxElapsedMs: ROTATION_GUARDED_BOUND_MS
    },
    {
      id: 'rotation-longtail-11p-14m-2c-budget800',
      name: 'rotation longtail 11p/14m/2c budget=800',
      mode: 'rotation',
      kind: 'rotation_longtail_audit',
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
      for (const logicalRounds of [3, 6]) {
        const totalMatches = courts * logicalRounds;
        scenarios.push({
          id: `squad-equal-${playersPerSquad}v${playersPerSquad}-${totalMatches}m-${courts}c`,
          name: `squad equal ${playersPerSquad}v${playersPerSquad}/${totalMatches}m/${courts}c`,
          mode: 'squad',
          kind: 'squad_equal_audit',
          squadAPlayers: playersPerSquad,
          squadBPlayers: playersPerSquad,
          totalMatches,
          targetMatches: totalMatches,
          courts,
          logicalRounds,
          rules: { endCondition: { type: 'total_matches', target: totalMatches }, _seed: 1 },
          maxElapsedMs: computeSquadHardElapsedMs(playersPerSquad, courts, totalMatches)
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
    ...buildSquadUnevenAuditScenarios()
  ];
}

function runScenario(scenario) {
  const startedAt = performance.now();
  let out;
  let ids = [];
  if (scenario.mode === 'rotation') {
    const players = makeRotationPlayers(scenario.playersCount, scenario.femaleCount || 0);
    ids = players.map((player) => player.id);
    out = generateSchedule(players, scenario.totalMatches, scenario.courts, scenario.options || {});
  } else {
    const players = makeSquadPlayers(scenario.squadAPlayers, scenario.squadBPlayers);
    ids = players.map((player) => player.id);
    out = buildSquadSchedule(players, scenario.totalMatches, scenario.courts, scenario.rules || {});
  }

  const elapsedMs = Math.round(performance.now() - startedAt);
  const matches = collectMatches(out);
  const meta = out.schedulerMeta || {};
  const fairness = out.fairness || {};
  const playCounts = computePlayCounts(matches, ids);
  const logicalRounds = scenario.logicalRounds || Math.ceil((scenario.totalMatches || 0) / Math.max(1, scenario.courts || 1));

  return {
    scenario,
    out,
    elapsedMs,
    actualMatches: matches.length,
    computedPlaySpread: computeSpread(Object.values(playCounts)),
    computedMaxConsecutivePlay: computeMaxConsecutive(out.rounds || [], ids),
    computedUniqueExactMatchupCount: countUniqueExactMatchups(matches),
    fairnessScore: Number(out.fairnessScore) || 0,
    playSpread: Number(fairness.playSpread ?? meta.playSpread ?? computeSpread(Object.values(playCounts))),
    maxConsecutivePlay: Number(fairness.maxConsecutivePlay ?? meta.maxConsecutivePlay ?? 0),
    uniqueExactMatchupCount: Number(meta.uniqueExactMatchupCount ?? countUniqueExactMatchups(matches)),
    totalRounds: logicalRounds,
    engine: String(meta.engine || ''),
    executionProfile: String(meta.executionProfile || ''),
    timeoutGuardTriggered: meta.timeoutGuardTriggered === true,
    fallbackReason: String(meta.fallbackReason || ''),
    fairnessVersion: String(meta.fairnessVersion || ''),
    searchElapsedMs: Number(meta.searchElapsedMs),
    effectiveCourts: Number(meta.effectiveCourts) || scenario.courts,
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

  if (scenario.mode === 'squad') {
    const rounds = scenario.logicalRounds || Math.ceil(scenario.totalMatches / Math.max(1, scenario.courts));
    const aLimit = computeSquadStreakLimit(scenario.squadAPlayers, scenario.courts, rounds);
    const bLimit = computeSquadStreakLimit(scenario.squadBPlayers, scenario.courts, rounds);
    const structureLimit = Math.max(aLimit, bLimit);
    const hasBench = (scenario.squadAPlayers > scenario.courts * 2) || (scenario.squadBPlayers > scenario.courts * 2);
    if (hasBench && result.maxConsecutivePlay > structureLimit) {
      warnings.push({
        scenario: scenario.name,
        mode: scenario.mode,
        code: 'max_consecutive',
        message: `maxConsecutivePlay=${result.maxConsecutivePlay} structureLimit=${structureLimit}`
      });
    }
    if (scenario.kind === 'squad_equal_audit' && result.executionProfile === 'greedy-fallback') {
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
    theoreticalPlaySpread: theoreticalSpread,
    maxConsecutivePlay: result.maxConsecutivePlay,
    uniqueExactMatchupCount: result.uniqueExactMatchupCount
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
  computeSquadStreakLimit,
  buildRotationRepresentativeScenarios,
  buildRotationBudgetRepresentativeScenarios,
  buildSquadRepresentativeScenarios,
  buildRotationTemplateAuditScenarios,
  buildRotationLongTailAuditScenarios,
  buildSquadEqualAuditScenarios,
  buildSquadUnevenAuditScenarios,
  buildRepresentativeScenarios,
  buildAuditScenarios,
  runScenario,
  evaluateScenario,
  hasElapsedFailure,
  runScenarioMatrix,
  buildAggregateWarnings,
  toSummaryRow
};
