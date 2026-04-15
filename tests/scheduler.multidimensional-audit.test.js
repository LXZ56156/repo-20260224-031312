const test = require('node:test');
const assert = require('node:assert/strict');

const scenarioCommon = require('../scripts/scheduler-scenario-common');

function findScenario(name) {
  return scenarioCommon.buildAuditScenarios().find((scenario) => scenario.name === name)
    || scenarioCommon.buildRepresentativeScenarios().find((scenario) => scenario.name === name);
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function computePartnerRepeatsFromPairs(roundPairs) {
  const counts = {};
  (roundPairs || []).forEach((pairs) => {
    (pairs || []).forEach((pair) => {
      const key = pairKey(pair[0], pair[1]);
      counts[key] = (counts[key] || 0) + 1;
    });
  });
  return Object.values(counts).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

function computePairCapacityLowerBound(totalPairUsages, uniquePairCapacity) {
  return Math.max(0, totalPairUsages - uniquePairCapacity);
}

test('scheduler scenario result exposes multidimensional coverage and fairness metrics', () => {
  const scenario = findScenario('rotation template 6p-1c@8');
  const result = scenarioCommon.runScenario(scenario);

  assert.equal(result.actualMatches, 8);
  assert.equal(typeof result.partnerRepeats, 'number');
  assert.equal(typeof result.opponentRepeats, 'number');
  assert.equal(typeof result.uniquePartnerPairs, 'number');
  assert.equal(typeof result.uniqueOpponentPairs, 'number');
  assert.equal(typeof result.partnerCoveragePct, 'number');
  assert.equal(typeof result.opponentCoveragePct, 'number');
  assert.equal(typeof result.restCountSpread, 'number');
  assert.equal(typeof result.maxRestStreak, 'number');
  assert.ok(result.partnerCoveragePct > 0);
  assert.ok(result.opponentCoveragePct > 0);
});

test('scheduler scenario result exposes structural play-spread baselines for uneven squad cases', () => {
  const scenario = findScenario('squad uneven 3v4/9m/1c');
  const result = scenarioCommon.runScenario(scenario);

  assert.equal(result.playSpread, 2);
  assert.equal(result.globalPlaySpreadBaseline, 2);
  assert.equal(result.playSpreadExcess, 0);
  assert.equal(result.squadAPlaySpread, 0);
  assert.equal(result.squadBPlaySpread, 1);
});

test('scheduler scenario result exposes repeat baselines and excess for equal squad hotspots', () => {
  const cases = [
    {
      name: 'squad equal 4v4/12m/2c',
      partnerRepeatBaseline: 12,
      opponentRepeatBaseline: 32,
      partnerRepeatExcess: 0,
      opponentRepeatExcess: 0
    },
    {
      name: 'squad equal 6v6/18m/3c',
      partnerRepeatBaseline: 6,
      opponentRepeatBaseline: 36
    },
    {
      name: 'squad equal 7v7/18m/3c',
      partnerRepeatBaseline: 0,
      opponentRepeatBaseline: 23
    },
    {
      name: 'squad 8v8/16m/2c',
      partnerRepeatBaseline: 8,
      opponentRepeatBaseline: 32,
      partnerRepeatExcess: 0,
      opponentRepeatExcess: 0
    }
  ];

  cases.forEach((entry) => {
    const result = scenarioCommon.runScenario(findScenario(entry.name));
    assert.equal(result.partnerRepeatBaseline, entry.partnerRepeatBaseline, `${entry.name} partner baseline`);
    assert.equal(result.opponentRepeatBaseline, entry.opponentRepeatBaseline, `${entry.name} opponent baseline`);
    if (typeof entry.partnerRepeatExcess === 'number') {
      assert.equal(result.partnerRepeatExcess, entry.partnerRepeatExcess, `${entry.name} partner excess`);
    }
    if (typeof entry.opponentRepeatExcess === 'number') {
      assert.equal(result.opponentRepeatExcess, entry.opponentRepeatExcess, `${entry.name} opponent excess`);
    }
  });
});

test('scheduler scenario result exposes exact tracked uneven repeat baselines', () => {
  const threePlayerWitness = [
    [['P1', 'P2']],
    [['P1', 'P3']],
    [['P2', 'P3']],
    [['P1', 'P2']],
    [['P1', 'P3']],
    [['P2', 'P3']],
    [['P1', 'P2']],
    [['P1', 'P3']],
    [['P2', 'P3']]
  ];
  const fourPlayerNineRoundWitness = [
    [['P1', 'P2']],
    [['P1', 'P3']],
    [['P1', 'P4']],
    [['P2', 'P3']],
    [['P2', 'P4']],
    [['P3', 'P4']],
    [['P1', 'P2']],
    [['P1', 'P3']],
    [['P2', 'P4']]
  ];
  const fivePlayerTwelveRoundWitness = [
    [['P1', 'P2']],
    [['P1', 'P3']],
    [['P1', 'P4']],
    [['P1', 'P5']],
    [['P2', 'P3']],
    [['P2', 'P4']],
    [['P2', 'P5']],
    [['P3', 'P4']],
    [['P3', 'P5']],
    [['P4', 'P5']],
    [['P1', 'P2']],
    [['P3', 'P4']]
  ];
  const fivePlayerTwoCourtWitness = [
    [['P1', 'P2'], ['P3', 'P4']],
    [['P1', 'P3'], ['P2', 'P5']],
    [['P1', 'P4'], ['P3', 'P5']],
    [['P1', 'P5'], ['P2', 'P4']],
    [['P2', 'P3'], ['P4', 'P5']],
    [['P1', 'P2'], ['P3', 'P4']]
  ];

  assert.equal(computePartnerRepeatsFromPairs(threePlayerWitness), computePairCapacityLowerBound(9, 3));
  assert.equal(computePartnerRepeatsFromPairs(fourPlayerNineRoundWitness), computePairCapacityLowerBound(9, 6));
  assert.equal(computePartnerRepeatsFromPairs(fivePlayerTwelveRoundWitness), computePairCapacityLowerBound(12, 10));
  assert.equal(computePartnerRepeatsFromPairs(fivePlayerTwoCourtWitness), computePairCapacityLowerBound(12, 10));

  const exactPartnerBaselines = {
    'squad uneven 3v4/9m/1c': (
      computePairCapacityLowerBound(9, 3)
      + computePairCapacityLowerBound(9, 6)
    ),
    'squad uneven 5v4/12m/1c': (
      computePairCapacityLowerBound(12, 10)
      + computePairCapacityLowerBound(12, 6)
    ),
    'squad uneven 6v5/12m/2c': (
      0
      + computePairCapacityLowerBound(12, 10)
    )
  };

  const expected = {
    'squad uneven 3v4/9m/1c': { partnerRepeatBaseline: 9, opponentRepeatBaseline: 24 },
    'squad uneven 5v4/12m/1c': { partnerRepeatBaseline: 8, opponentRepeatBaseline: 28 },
    'squad uneven 6v5/12m/2c': { partnerRepeatBaseline: 2, opponentRepeatBaseline: 18 }
  };

  Object.entries(expected).forEach(([name, baselines]) => {
    assert.equal(exactPartnerBaselines[name], baselines.partnerRepeatBaseline, `${name} exact partner baseline`);
    const result = scenarioCommon.runScenario(findScenario(name));
    assert.equal(result.partnerRepeatBaseline, baselines.partnerRepeatBaseline, `${name} partner baseline`);
    assert.equal(result.opponentRepeatBaseline, baselines.opponentRepeatBaseline, `${name} opponent baseline`);
  });
});

test('scheduler scenario result exposes exact repeat metrics for 4v4 single-court cases', () => {
  const scenarios = [
    { name: 'squad equal 4v4/3m/1c', actualMatches: 3 },
    { name: 'squad equal 4v4/6m/1c', actualMatches: 6 }
  ];

  scenarios.forEach((entry) => {
    const result = scenarioCommon.runScenario(findScenario(entry.name));
    assert.equal(result.actualMatches, entry.actualMatches, `${entry.name} actualMatches`);
    assert.equal(result.uniqueExactMatchupCount, entry.actualMatches, `${entry.name} uniqueExact`);
    assert.equal(result.exactRepeatCount, 0, `${entry.name} exactRepeatCount`);
    assert.equal(result.exactRepeatBaseline, 0, `${entry.name} exactRepeatBaseline`);
    assert.equal(result.exactRepeatExcess, 0, `${entry.name} exactRepeatExcess`);
  });
});

test('scheduler stability matrix summarizes multi-seed ranges and worst seed', () => {
  const rows = scenarioCommon.runExtendedStabilityMatrix([
    {
      id: 'rotation-small',
      label: 'rotation 4p/3m/1c',
      mode: 'multi_rotate',
      seeds: [1, 2],
      scenario: {
        id: 'rotation-small',
        name: 'rotation stability 4p/3m/1c',
        mode: 'rotation',
        kind: 'rotation_stability',
        caseKey: '4p-1c',
        playersCount: 4,
        femaleCount: 0,
        totalMatches: 3,
        targetMatches: 3,
        courts: 1,
        options: { seed: 1 },
        maxElapsedMs: scenarioCommon.TEMPLATE_FAST_BOUND_MS
      }
    }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].mode, 'multi_rotate');
  assert.equal(rows[0].seeds, '1, 2');
  assert.equal(rows[0].stableCoverage, true);
  assert.match(rows[0].executionProfiles, /template:/);
  assert.ok(rows[0].worstSeed > 0);
});

test('scheduler exposes configured extended stability scenarios for both modes', () => {
  const rows = scenarioCommon.buildExtendedStabilityScenarios();
  const modeSet = new Set(rows.map((row) => row.mode));

  assert.ok(rows.length >= 10);
  assert.deepEqual([...modeSet].sort(), ['multi_rotate', 'squad_doubles']);
  assert.ok(rows.some((row) => row.label === 'rotation 10p/23m/2c budget=200'));
  assert.ok(rows.some((row) => row.label === 'rotation 8p-2c/13m'));
  assert.ok(rows.some((row) => row.label === 'rotation 9p-2c/18m'));
  assert.ok(rows.some((row) => row.label === 'squad 3v4/9m/1c'));
  assert.ok(rows.some((row) => row.label === 'squad 7v7/18m/3c'));
  assert.ok(rows.some((row) => row.label === 'squad 10v10/20m/4c'));
});
