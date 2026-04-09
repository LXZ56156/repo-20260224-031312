#!/usr/bin/env node

const scenarioCommon = require('./scheduler-scenario-common');

function toTableRows(rows) {
  return rows.length ? rows : [{ status: 'none' }];
}

function compactResult(result) {
  return {
    scenario: result.scenario,
    elapsedMs: result.elapsedMs,
    actualMatches: result.actualMatches,
    fairnessScore: result.fairnessScore,
    playSpread: result.playSpread,
    maxConsecutivePlay: result.maxConsecutivePlay,
    uniqueExactMatchupCount: result.uniqueExactMatchupCount,
    engine: result.engine,
    executionProfile: result.executionProfile,
    timeoutGuardTriggered: result.timeoutGuardTriggered,
    fallbackReason: result.fallbackReason,
    fairnessVersion: result.fairnessVersion,
    searchElapsedMs: result.searchElapsedMs,
    effectiveCourts: result.effectiveCourts,
    templateKey: result.templateKey
  };
}

function hasElapsedFailure(evaluation) {
  return evaluation.failures.some((entry) => entry.code === 'elapsed_ms');
}

function main() {
  const scenarios = scenarioCommon.buildAuditScenarios();
  const results = [];
  const summaryRows = [];
  const warnings = [];
  const failures = [];

  for (const scenario of scenarios) {
    let result = scenarioCommon.runScenario(scenario);
    let evaluation = scenarioCommon.evaluateScenario(result);

    if (hasElapsedFailure(evaluation)) {
      const firstElapsedMs = result.elapsedMs;
      const retryResult = scenarioCommon.runScenario(scenario);
      const retryEvaluation = scenarioCommon.evaluateScenario(retryResult);
      if (!hasElapsedFailure(retryEvaluation)) {
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

    results.push(compactResult(result));
    summaryRows.push(scenarioCommon.toSummaryRow(result));
    warnings.push(...evaluation.warnings);
    failures.push(...evaluation.failures);
  }

  warnings.push(...scenarioCommon.buildAggregateWarnings(results));

  console.log(`[scheduler-audit] scenarios=${scenarios.length} warnings=${warnings.length} failures=${failures.length}`);
  console.log('');
  console.log('[scheduler-audit] summary');
  console.table(summaryRows);
  console.log('');
  console.log('[scheduler-audit] warnings');
  console.table(toTableRows(warnings));
  console.log('');
  console.log('[scheduler-audit] failures');
  console.table(toTableRows(failures));

  if (failures.length) {
    process.exitCode = 1;
  }
}

main();
