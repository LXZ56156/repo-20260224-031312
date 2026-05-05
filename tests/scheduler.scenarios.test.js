const test = require('node:test');
const assert = require('node:assert/strict');

const scenarioCommon = require('../scripts/scheduler-scenario-common');

function assertCommonScenario(result) {
  const meta = result.out.schedulerMeta || {};
  assert.equal(result.actualMatches, result.scenario.targetMatches, `${result.scenario.name} matches`);
  assert.ok(result.fairnessScore > 0, `${result.scenario.name} fairnessScore=${result.fairnessScore}`);
  assert.ok(typeof meta.executionProfile === 'string' && meta.executionProfile.length > 0, `${result.scenario.name} executionProfile`);
  assert.equal(typeof meta.fallbackReason, 'string', `${result.scenario.name} fallbackReason`);
  assert.equal(typeof meta.searchElapsedMs, 'number', `${result.scenario.name} searchElapsedMs`);
  assert.equal(meta.fairnessVersion, 'v2', `${result.scenario.name} fairnessVersion`);
  assert.equal(result.playSpread, result.computedPlaySpread, `${result.scenario.name} playSpread`);
  assert.equal(result.maxConsecutivePlay, result.computedMaxConsecutivePlay, `${result.scenario.name} maxConsecutivePlay`);
  if (result.executionProfile.includes('guarded')) {
    assert.equal(result.timeoutGuardTriggered, true, `${result.scenario.name} timeoutGuardTriggered`);
  }
}

for (const scenario of scenarioCommon.buildRotationRepresentativeScenarios()) {
  test(`${scenario.name} 保持模板质量与时间约束`, () => {
    const result = scenarioCommon.runScenario(scenario);
    const meta = result.out.schedulerMeta || {};

    assertCommonScenario(result);
    assert.equal(meta.engine, 'template', `${scenario.name} engine`);
    assert.equal(result.uniqueExactMatchupCount, scenario.targetMatches, `${scenario.name} uniqueExact`);
    assert.equal(result.playSpread, scenario.expectedPlaySpread, `${scenario.name} playSpread`);
    assert.ok(result.elapsedMs < scenario.maxElapsedMs, `${scenario.name} elapsed=${result.elapsedMs}`);

    if (Number.isFinite(scenario.expectedEffectiveCourts)) {
      assert.equal(result.effectiveCourts, scenario.expectedEffectiveCourts, `${scenario.name} effectiveCourts`);
    }
  });
}

for (const scenario of scenarioCommon.buildRotationBudgetRepresentativeScenarios()) {
  test(`${scenario.name} 在 guarded 预算内完成`, () => {
    const result = scenarioCommon.runScenario(scenario);
    const meta = result.out.schedulerMeta || {};

    assertCommonScenario(result);
    if (meta.engine === 'template') {
      assert.equal(result.executionProfile, 'template', `${scenario.name} executionProfile=${result.executionProfile}`);
      assert.equal(result.timeoutGuardTriggered, false, `${scenario.name} timeoutGuardTriggered`);
    } else {
      assert.ok(['beam-guarded', 'legacy-guarded'].includes(result.executionProfile), `${scenario.name} executionProfile=${result.executionProfile}`);
      assert.equal(result.timeoutGuardTriggered, true, `${scenario.name} timeoutGuardTriggered`);
    }
    assert.ok(result.elapsedMs < scenario.maxElapsedMs, `${scenario.name} elapsed=${result.elapsedMs}`);
  });
}

for (const scenario of scenarioCommon.buildSquadRepresentativeScenarios()) {
  test(`${scenario.name} 满足常见场景验收口径`, () => {
    const result = scenarioCommon.runScenario(scenario);

    assertCommonScenario(result);
    assert.ok(result.elapsedMs < scenario.maxElapsedMs, `${scenario.name} elapsed=${result.elapsedMs}`);

    if (Array.isArray(scenario.allowedExecutionProfiles) && scenario.allowedExecutionProfiles.length) {
      assert.ok(
        scenario.allowedExecutionProfiles.includes(result.executionProfile),
        `${scenario.name} executionProfile=${result.executionProfile}`
      );
      assert.ok(result.fallbackReason.length > 0, `${scenario.name} fallbackReason=${result.fallbackReason}`);
    }

    if (Number.isFinite(scenario.expectedPlaySpread)) {
      const allowFallbackSpread = Number.isFinite(scenario.maxPlaySpreadOnAllowedFallback)
        && result.executionProfile === 'greedy-fallback';
      if (allowFallbackSpread) {
        assert.ok(
          result.playSpread <= scenario.maxPlaySpreadOnAllowedFallback,
          `${scenario.name} playSpread=${result.playSpread}`
        );
      } else {
        assert.equal(result.playSpread, scenario.expectedPlaySpread, `${scenario.name} playSpread`);
      }
    }
    if (Number.isFinite(scenario.maxPlaySpread)) {
      assert.ok(result.playSpread <= scenario.maxPlaySpread, `${scenario.name} playSpread=${result.playSpread}`);
    }
    if (Number.isFinite(scenario.expectedMaxConsecutivePlay)) {
      assert.equal(
        result.maxConsecutivePlay,
        scenario.expectedMaxConsecutivePlay,
        `${scenario.name} maxConsecutivePlay=${result.maxConsecutivePlay}`
      );
    }
    if (Number.isFinite(scenario.maxConsecutivePlay)) {
      assert.ok(
        result.maxConsecutivePlay <= scenario.maxConsecutivePlay,
        `${scenario.name} maxConsecutivePlay=${result.maxConsecutivePlay}`
      );
    }
  });
}

test('rotation 14p/12m/4c uses effectiveCourts to derive totalRounds', () => {
  const scenario = scenarioCommon
    .buildRotationRepresentativeScenarios()
    .find((item) => item.id === 'rotation-14p-12m-4c');

  assert.ok(scenario, 'rotation-14p-12m-4c scenario should exist');

  const result = scenarioCommon.runScenario(scenario);
  assert.equal(result.effectiveCourts, 3);
  assert.equal(result.totalRounds, Math.ceil(result.scenario.targetMatches / result.effectiveCourts));
});

test('scheduler audit matrix includes squad total_rounds quality cases', () => {
  const scenarios = scenarioCommon.buildAuditScenarios();
  const scenario = scenarios.find((item) => item.name === 'squad equal 6v6/6m/2c total_rounds');

  assert.ok(scenario, 'squad total_rounds scenario should exist');
  assert.equal(scenario.kind, 'squad_total_rounds_audit');

  const result = scenarioCommon.runScenario(scenario);
  assert.equal(result.actualMatches, scenario.targetMatches);
  assert.equal(result.executionProfile, 'beam-quality');
  assert.equal(result.playSpreadExcess, 0);
});
