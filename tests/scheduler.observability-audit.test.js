const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { generateSchedule, computeEffectiveCourts } = require('../cloudfunctions/startTournament/rotation');
const templateLibrary = require('../cloudfunctions/startTournament/rotation.templates');
const scenarioCommon = require('../scripts/scheduler-scenario-common');
const observability = require('../scripts/audit-scheduler-observability');

function makePlayers(count) {
  return scenarioCommon.makeRotationPlayers(count);
}

test('template coverage matrix is enumerated from the live registry and conserves every prefix', () => {
  const rows = observability.buildTemplateCoverageMatrix(templateLibrary);
  const cases = templateLibrary.cases || {};
  const expectedPrefixCount = Object.values(cases)
    .reduce((sum, entry) => sum + (Number(entry.horizonMatches) || 0), 0);

  assert.equal(rows.length, Object.keys(cases).length);
  assert.equal(rows.reduce((sum, row) => sum + row.supportedMatchCount, 0), expectedPrefixCount);
  assert.equal(rows.every((row) => row.missingMatchCounts.length === 0), true);
  assert.equal(rows.every((row) => row.invalidVariantMatchCounts.length === 0), true);

  const elevenPlayer = rows.find((row) => row.templateKey === '11p-2c');
  assert.ok(elevenPlayer);
  assert.equal(elevenPlayer.playersCount, 11);
  assert.equal(elevenPlayer.effectiveCourts, 2);
  assert.deepEqual(elevenPlayer.supportedMatchCounts, Array.from({ length: 12 }, (_, index) => index + 1));
});

test('schedule integrity audit catches malformed members, unknown ids and same-round collisions', () => {
  const valid = generateSchedule(makePlayers(8), 8, 2, { seed: 7 });
  const validAudit = observability.inspectScheduleIntegrity(valid, makePlayers(8).map((player) => player.id));
  assert.equal(validAudit.valid, true);
  assert.equal(validAudit.errorCount, 0);

  const invalid = {
    rounds: [
      {
        matches: [
          { teamA: ['p1', 'p1'], teamB: ['p2', 'missing'] },
          { teamA: ['p2'], teamB: ['p3', 'p4'] }
        ]
      }
    ]
  };
  const invalidAudit = observability.inspectScheduleIntegrity(invalid, ['p1', 'p2', 'p3', 'p4']);
  assert.equal(invalidAudit.valid, false);
  assert.ok(invalidAudit.duplicateMemberMatchCount >= 1);
  assert.ok(invalidAudit.unknownMemberCount >= 1);
  assert.ok(invalidAudit.malformedMatchCount >= 1);
  assert.ok(invalidAudit.roundCollisionCount >= 1);
});

test('scenario observation separates mathematical equal-play possibility from achieved fairness', () => {
  const equalScenario = scenarioCommon
    .buildRotationTemplateAuditScenarios()
    .find((scenario) => scenario.caseKey === '5p-1c' && scenario.totalMatches === 5);
  const equalRecord = observability.buildScenarioObservation(scenarioCommon.runScenario(equalScenario));

  assert.equal(equalRecord.playersCount, 5);
  assert.equal(equalRecord.requestedCourts, 1);
  assert.equal(equalRecord.effectiveCourts, 1);
  assert.equal(equalRecord.engineVersion, 'rotation-v3');
  assert.equal(equalRecord.pathClass, 'template');
  assert.equal(equalRecord.equalPlayMathematicallyPossible, true);
  assert.equal(equalRecord.equalPlayAchieved, true);
  assert.deepEqual(Object.values(equalRecord.playCounts), [4, 4, 4, 4, 4]);
  assert.equal(equalRecord.integrity.valid, true);

  const unevenScenario = scenarioCommon
    .buildRotationTemplateAuditScenarios()
    .find((scenario) => scenario.caseKey === '6p-1c' && scenario.totalMatches === 8);
  const unevenRecord = observability.buildScenarioObservation(scenarioCommon.runScenario(unevenScenario));
  assert.equal(unevenRecord.equalPlayMathematicallyPossible, false);
  assert.equal(unevenRecord.equalPlayAchieved, false);
  assert.equal(unevenRecord.playSpread, 1);
});

test('court normalization probes cover every player/requested-court pair without hand-maintained cases', () => {
  const scenarios = observability.buildCourtNormalizationScenarios(templateLibrary);
  assert.equal(scenarios.length, 21 * 4);

  scenarios.forEach((scenario) => {
    assert.equal(
      scenario.expectedEffectiveCourts,
      computeEffectiveCourts(scenario.playersCount, scenario.courts),
      scenario.id
    );
    assert.equal(scenario.expectedTemplateKey, `${scenario.playersCount}p-${scenario.expectedEffectiveCourts}c`);
  });
});

test('out-of-template probes include high-court and roster-band misses explicitly', () => {
  const scenarios = observability.buildOutOfTemplateScenarios();
  const rowMap = Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario]));

  assert.equal(rowMap['rotation-outside-template-20p-5c'].expectedEffectiveCourts, 5);
  assert.equal(rowMap['rotation-outside-template-24p-6c'].expectedEffectiveCourts, 6);
  assert.equal(rowMap['rotation-outside-template-24p-6c-legacy-window'].options.runtimeBudgetMs, 800);
  assert.equal(rowMap['rotation-outside-template-25p-4c'].playersCount, 25);
  assert.equal(rowMap['rotation-outside-template-20p-5c'].options.runtimeBudgetMs, 600);
  assert.equal(rowMap['rotation-outside-template-24p-6c'].options.runtimeBudgetMs, 600);
  assert.equal(rowMap['rotation-outside-template-25p-4c'].options.runtimeBudgetMs, 600);
});

test('scenario observation records requested and effective runtime budgets separately', () => {
  const scenario = scenarioCommon.buildRotationLongTailAuditScenarios()[0];
  const record = observability.buildScenarioObservation(scenarioCommon.runScenario(scenario));

  assert.equal(scenario.options.runtimeBudgetMs, 200);
  assert.equal(record.requestedRuntimeBudgetMs, 200);
  assert.equal(record.effectiveRuntimeBudgetMs, 600);
});

test('duration summaries use repeated real-clock samples and nearest-rank P95', () => {
  const summary = observability.summarizeDurations([10, 2, 8, 4, 6]);
  assert.deepEqual(summary, {
    samples: 5,
    minMs: 2,
    medianMs: 6,
    p95Ms: 10,
    maxMs: 10
  });
});

test('timing log parser inventories each phase and exposes missing diagnostic fields', () => {
  const source = `
    console.info('[startTournament:timing]', JSON.stringify({
      phase: 'schedule', scheduleMs, engine: meta.engine, templateKey,
      requestedCourts, effectiveCourts, playersCount, totalMatches
    }));
    console.info('[startTournament:timing]', JSON.stringify({
      phase: 'done', scheduleMs, materializeMs, writeMs, totalMs,
      engine: meta.engine, templateKey, requestedCourts, effectiveCourts,
      playersCount, totalMatches
    }));
  `;
  const audit = observability.buildTimingFieldAudit(source);

  assert.deepEqual(audit.phases.schedule.sort(), [
    'effectiveCourts', 'engine', 'phase', 'playersCount', 'requestedCourts',
    'scheduleMs', 'templateKey', 'totalMatches'
  ]);
  assert.ok(audit.phases.done.includes('writeMs'));
  assert.ok(audit.missingDoneFields.includes('engineVersion'));
  assert.ok(audit.missingDoneFields.includes('fallbackReason'));
  assert.ok(audit.missingDoneFields.includes('searchElapsedMs'));
});

test('real startTournament timing source keeps all three phases and exposes current schema gaps', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../cloudfunctions/startTournament/index.js'),
    'utf8'
  );
  const audit = observability.buildTimingFieldAudit(source);

  assert.deepEqual(Object.keys(audit.phases).sort(), ['done', 'materialize', 'schedule']);
  assert.ok(audit.phases.done.includes('totalMs'));
  assert.ok(audit.phases.done.includes('writeMs'));
  assert.ok(audit.missingDoneFields.includes('engineVersion'));
  assert.ok(audit.missingDoneFields.includes('fallbackReason'));
  assert.ok(audit.missingDoneFields.includes('searchElapsedMs'));
  assert.ok(audit.missingDoneFields.includes('mode'));
  assert.ok(audit.missingDoneFields.includes('scheduledMatches'));
});

test('scheduler meta audit distinguishes schema presence from populated values by mode', () => {
  const rows = observability.buildSchedulerMetaModeAudit();
  const rowMap = Object.fromEntries(rows.map((row) => [row.mode, row]));

  assert.equal(rowMap.multi_rotate.fields.engine.populated, true);
  assert.equal(rowMap.multi_rotate.fields.templateKey.populated, true);
  assert.equal(rowMap.squad_doubles.fields.engine.populated, false);
  assert.equal(rowMap.squad_doubles.fields.templateKey.populated, false);
  assert.equal(rowMap.fixed_pair_rr.fields.engineVersion.populated, true);
  assert.equal(rowMap.fixed_pair_rr.fields.effectiveCourts.populated, false);
});

test('execution path summary conserves template, beam, legacy and error classifications', () => {
  const rows = [
    { pathClass: 'template' },
    { pathClass: 'beam' },
    { pathClass: 'beam' },
    { pathClass: 'legacy' },
    { pathClass: 'error' }
  ];
  const summary = observability.summarizePathCounts(rows);

  assert.equal(summary.total, rows.length);
  assert.equal(summary.conserved, true);
  assert.deepEqual(summary.counts, { beam: 2, error: 1, legacy: 1, template: 1 });
});

test('path stability summary preserves mixed legacy and error outcomes for the same input', () => {
  const summary = observability.summarizePathStabilityRuns([
    { pathClass: 'legacy', executionProfile: 'legacy-guarded', fallbackReason: 'beam_unavailable' },
    { pathClass: 'error', executionProfile: 'error', fallbackReason: 'timeout' },
    { pathClass: 'legacy', executionProfile: 'legacy-guarded', fallbackReason: 'beam_unavailable' }
  ]);

  assert.equal(summary.runs, 3);
  assert.equal(summary.stablePath, false);
  assert.deepEqual(summary.pathCounts, { error: 1, legacy: 2 });
  assert.deepEqual(summary.observedPathClasses, ['error', 'legacy']);
  assert.equal(summary.successfulRuns, 2);
  assert.equal(summary.errorRuns, 1);
});
