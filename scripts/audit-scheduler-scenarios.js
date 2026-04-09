#!/usr/bin/env node

const scenarioCommon = require('./scheduler-scenario-common');

function toTableRows(rows) {
  return rows.length ? rows : [{ status: 'none' }];
}

function main() {
  const scenarios = scenarioCommon.buildAuditScenarios();
  const matrix = scenarioCommon.runScenarioMatrix(scenarios);
  const aggregateWarnings = scenarioCommon.buildAggregateWarnings(matrix.results);
  const warnings = matrix.warnings.concat(aggregateWarnings);

  console.log(`[scheduler-audit] scenarios=${scenarios.length} warnings=${warnings.length} failures=${matrix.failures.length}`);
  console.log('');
  console.log('[scheduler-audit] summary');
  console.table(matrix.summaryRows);
  console.log('');
  console.log('[scheduler-audit] warnings');
  console.table(toTableRows(warnings));
  console.log('');
  console.log('[scheduler-audit] failures');
  console.table(toTableRows(matrix.failures));

  if (matrix.failures.length) {
    process.exitCode = 1;
  }
}

main();
