const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { generateSchedule, computeEffectiveCourts } = require('../cloudfunctions/startTournament/rotation');
const templateLibrary = require('../cloudfunctions/startTournament/rotation.templates');
const scenarioCommon = require('../scripts/scheduler-scenario-common');
const observability = require('../scripts/audit-scheduler-observability');

const P01_FINAL_COMMIT = '611207f88031146a484c50fdb8d85aa958a06719';
const P01_PARETO_JSON_SHA256 = '331ae2e2e6b65e6242fd042d90d405f7d3251436a0b7ae85af1e686fbc07466d';
const P01_PARETO_CSV_SHA256 = '4a8744f84e34b4287e988e12b57d25951dbf2309a2cbdfb41564dad74c6c6db7';
const P01_90D_MANIFEST_SHA256 = 'b46509d7791bc466a978c2cf8da22543cdf0dc467661544c9bc87a93fee039f5';

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

test('current registry mapping distinguishes covered prefixes from future prefix and key candidates', () => {
  const matrix = observability.buildTemplateCoverageMatrix(templateLibrary);
  const covered = observability.mapCurrentCombination({
    mode: 'multi_rotate',
    playersCount: 6,
    courts: 1,
    totalMatches: 9
  }, matrix);
  assert.equal(covered.currentTemplateKey, '6p-1c');
  assert.equal(covered.currentTemplateKeyPresent, true);
  assert.equal(covered.currentPrefixSupported, true);
  assert.equal(covered.currentPathContract, 'template');
  assert.equal(covered.equalPlayMathematicallyPossible, true);
  assert.equal(covered.futureTemplateDisposition, 'already_covered');

  const beyondHorizon = observability.mapCurrentCombination({
    mode: 'multi_rotate',
    playersCount: 13,
    courts: 2,
    totalMatches: 30
  }, matrix);
  assert.equal(beyondHorizon.currentTemplateKey, '13p-2c');
  assert.equal(beyondHorizon.currentTemplateKeyPresent, true);
  assert.equal(beyondHorizon.currentPrefixSupported, false);
  assert.equal(beyondHorizon.currentTemplateHorizonMatches, 12);
  assert.equal(beyondHorizon.currentPathContract, 'dynamic_guarded_beyond_template_horizon');
  assert.equal(beyondHorizon.equalPlayMathematicallyPossible, false);
  assert.equal(beyondHorizon.futureTemplateDisposition, 'extend_existing_template_prefix_candidate');

  const missingKey = observability.mapCurrentCombination({
    mode: 'multi_rotate',
    playersCount: 25,
    courts: 5,
    totalMatches: 25
  }, matrix);
  assert.equal(missingKey.currentTemplateKey, '25p-5c');
  assert.equal(missingKey.currentTemplateKeyPresent, false);
  assert.equal(missingKey.currentPathContract, 'dynamic_guarded_no_template_key');
  assert.equal(missingKey.futureTemplateDisposition, 'new_template_key_candidate');

  const fixedPair = observability.mapCurrentCombination({
    mode: 'fixed_pair_rr',
    playersCount: 8,
    courts: 2,
    totalMatches: 6
  }, matrix);
  assert.equal(fixedPair.currentPathContract, 'fixed_pair_rr_mode_specific');
  assert.equal(fixedPair.equalPlayMathematicallyPossible, null);
  assert.equal(fixedPair.futureTemplateDisposition, 'not_rotation_template_scope');
});

test('P01 mapping keeps 90-day summary limitations and maps stable 180-day high-frequency combinations', () => {
  const matrix = observability.buildTemplateCoverageMatrix(templateLibrary);
  const evidence = {
    pareto180: {
      population: 'started_tournaments',
      total: 10,
      classifiableCount: 8,
      classifiableRate: 0.8,
      rows: [
        { mode: 'multi_rotate', playersCount: 6, courts: 1, totalMatches: 9, presetKey: 'rotation_6', templateKey: '6p-1c', engine: 'template', classifiable: true, count: 5 },
        { mode: 'multi_rotate', playersCount: 13, courts: 2, totalMatches: 30, presetKey: 'custom', templateKey: 'missing', engine: 'beam', classifiable: true, count: 2 },
        { mode: 'fixed_pair_rr', playersCount: 8, courts: 2, totalMatches: 6, presetKey: 'custom', templateKey: 'missing', engine: 'fixed-pair-v1', classifiable: true, count: 1 },
        { mode: 'unknown', playersCount: 4, courts: 1, totalMatches: 3, presetKey: 'missing', templateKey: 'missing', engine: 'missing', classifiable: false, count: 2 }
      ],
      thresholds: {
        '0.8': { rowCount: 3, coveredCount: 8, coverage: 0.8 },
        '0.9': { rowCount: 4, coveredCount: 10, coverage: 1 },
        '0.95': { rowCount: 4, coveredCount: 10, coverage: 1 }
      }
    },
    pareto180Csv: [
      'mode,playersCount,courts,totalMatches,presetKey,templateKey,engine,classifiable,count,effectiveCompletedCount,effectiveCompletionRate,firstScoreToCompletionSamples,medianFirstScoreToCompletionHours,share,cumulativeCount,cumulativeCoverage',
      'multi_rotate,6,1,9,rotation_6,6p-1c,template,true,5,0,0,0,0,0.5,5,0.5',
      'multi_rotate,13,2,30,custom,missing,beam,true,2,0,0,0,0,0.2,7,0.7',
      'fixed_pair_rr,8,2,6,custom,missing,fixed-pair-v1,true,1,0,0,0,0,0.1,8,0.8',
      'unknown,4,1,3,missing,missing,missing,false,2,0,0,0,0,0.2,10,1'
    ].join('\n'),
    productSummary: {
      metrics: {
        window90: {
          pareto: {
            startedPopulation: 8,
            classifiableRate: 1,
            distinctExactCombinations: 4,
            thresholds: { '0.8': { rowCount: 3, coveredCount: 7, coverage: 0.875 } }
          }
        },
        window180: { pareto: { startedPopulation: 10 } }
      },
      derivedFindings: {
        topExactCombination90d: {
          mode: 'multi_rotate', playersCount: 6, courts: 1, totalMatches: 9,
          presetKey: 'rotation_6', templateKey: '6p-1c', engine: 'template', count: 5
        },
        topModePlayersCourts90d: [
          { mode: 'multi_rotate', playersCount: 6, courts: 1, count: 6 }
        ]
      },
      privacy: { containsActorIdentifiers: false, containsProfileFields: false, containsSecrets: false }
    },
    sourceManifest: {
      localAggregateArtifacts: {
        '90d': { paretoJsonSha256: '9'.repeat(64) },
        '180d': { paretoJsonSha256: '8'.repeat(64), paretoCsvSha256: '5'.repeat(64) }
      },
      privacy: {
        rawFilesTracked: false,
        containsActorIdentifiers: false,
        containsRawProfileFields: false,
        containsKAnonymizedAggregatePortrait: true,
        portraitGeographyOmitted: true,
        portraitKThreshold: 5,
        containsSecrets: false
      }
    },
    git: { commit: 'a'.repeat(40), branch: 'codex/roadmap-data-baseline', clean: true, readMode: 'git_commit_blob' },
    sources: {
      pareto180: { basename: 'pareto.json', relativePath: 'docs/tasks/parallel-development/evidence/pareto.json', sha256: '8'.repeat(64), bytes: 100, tracked: true },
      pareto180Csv: { basename: 'pareto.csv', relativePath: 'docs/tasks/parallel-development/evidence/pareto.csv', sha256: '5'.repeat(64), bytes: 100, tracked: true },
      productSummary: { basename: 'summary.json', relativePath: 'docs/tasks/parallel-development/evidence/summary.json', sha256: '7'.repeat(64), bytes: 50, tracked: true },
      sourceManifest: { basename: 'manifest.json', relativePath: 'docs/tasks/parallel-development/evidence/manifest.json', sha256: '6'.repeat(64), bytes: 50, tracked: true }
    }
  };

  const mapping = observability.buildP01CoverageMapping(evidence, matrix);
  assert.equal(mapping.status, 'complete_with_90d_summary_only');
  assert.equal(mapping.source.git.commit, 'a'.repeat(40));
  assert.equal(mapping.source.git.clean, true);
  assert.equal(mapping.windows['90d'].detailAvailability, 'published_summary_only');
  assert.equal(mapping.windows['90d'].topExact.currentPrefixSupported, true);
  assert.equal(mapping.windows['90d'].topFamilies[0].prefixCoverage, 'not_assessable_without_exact_total_matches');
  assert.equal(mapping.windows['180d'].stableHighFrequency.sourceExactRows, 3);
  assert.equal(mapping.windows['180d'].stableHighFrequency.eventCount, 9);
  assert.equal(mapping.windows['180d'].stableHighFrequency.summary.eventCounts.template, 5);
  assert.equal(mapping.windows['180d'].stableHighFrequency.summary.eventCounts.dynamic, 2);
  assert.equal(mapping.windows['180d'].stableHighFrequency.summary.eventCounts.unclassified, 2);
  assert.equal(mapping.windows['180d'].stableHighFrequency.futureTemplateCandidates.length, 1);
  assert.equal(
    mapping.windows['180d'].stableHighFrequency.futureTemplateCandidates[0].futureTemplateDisposition,
    'extend_existing_template_prefix_candidate'
  );
});

test('source tree state classifies expected audit edits separately from production scheduler changes', () => {
  const clean = observability.classifySourceTreeState([]);
  assert.equal(clean.state, 'clean');
  assert.equal(clean.productionSchedulerSourceClean, true);

  const auditOnly = observability.classifySourceTreeState([
    'scripts/audit-scheduler-observability.js',
    'docs/tasks/parallel-development/evidence/02-scheduler-observability-audit.json'
  ]);
  assert.equal(auditOnly.state, 'dirty_expected_audit_only');
  assert.equal(auditOnly.productionSchedulerSourceClean, true);
  assert.deepEqual(auditOnly.unexpectedDirtyPaths, []);

  const productionDirty = observability.classifySourceTreeState([
    'cloudfunctions/startTournament/rotation.templates.js',
    'cloudfunctions/startTournament/schedulerShared.js'
  ]);
  assert.equal(productionDirty.state, 'dirty_unexpected');
  assert.equal(productionDirty.productionSchedulerSourceClean, false);
  assert.deepEqual(productionDirty.productionSchedulerDirtyPaths, [
    'cloudfunctions/startTournament/rotation.templates.js',
    'cloudfunctions/startTournament/schedulerShared.js'
  ]);
});

test('porcelain-z parser retains both sides of a production-source rename', () => {
  const paths = observability.parseGitStatusPorcelainZ(
    'R  scripts/audit-scheduler-observability.js\0cloudfunctions/startTournament/utils.js\0 M tests/scheduler.observability-audit.test.js\0'
  );
  assert.deepEqual(paths, [
    'scripts/audit-scheduler-observability.js',
    'cloudfunctions/startTournament/utils.js',
    'tests/scheduler.observability-audit.test.js'
  ]);
  const state = observability.classifySourceTreeState(paths);
  assert.equal(state.productionSchedulerSourceClean, false);
  assert.deepEqual(state.productionSchedulerDirtyPaths, [
    'cloudfunctions/startTournament/utils.js'
  ]);
});

test('compact summary retains audit invariants and points to hashed ignored full detail without embedding heavy rows', () => {
  const full = {
    schemaVersion: 'scheduler-observability-full-v2',
    metadata: { generatedAt: '2026-07-16T00:00:00.000Z' },
    boundaries: { productionSchedulerFilesModified: false },
    templateCoverage: {
      summary: { templateKeys: 1, supportedMatchPrefixes: 2 },
      matrix: [{
        templateKey: '4p-1c', playersCount: 4, effectiveCourts: 1,
        horizonMatches: 2, variantCount: 1, supportedMatchCount: 2,
        supportedMatchCounts: [1, 2], missingMatchCounts: [],
        invalidVariantMatchCounts: [], insufficientVariantMatchCounts: []
      }],
      scenarioResults: [{ huge: true }]
    },
    pathAudit: {
      summary: { total: 2, conserved: true, counts: { template: 2 } },
      courtNormalization: { scenarios: 1, failures: 0, results: [{ huge: true }] },
      dynamicFallbackResults: [{ scenarioName: 'dynamic', pathClass: 'beam', integrity: { valid: true } }],
      outOfTemplateResults: [],
      outOfTemplatePathStability: [{ scenarioName: 'dynamic', summary: { runs: 2 }, results: [{ huge: true }] }],
      invalidInputResults: [],
      legacyPath: { observedValidScenarios: 0 }
    },
    fairnessAudit: { summary: { scenarios: 2 }, note: 'note' },
    determinismAudit: { summary: { templateKeys: 1 }, rows: [{ huge: true }] },
    performance: {
      scope: {}, environment: {}, summary: { scenarios: 1 },
      benchmarks: [{ scenarioName: 'bench', pathClass: 'template', duration: { medianMs: 1 }, sampleMs: [1, 2] }],
      groups: [{ pathClass: 'template', sampleMs: [1, 2], duration: { medianMs: 1 } }]
    },
    timingFieldAudit: { missingDoneFields: [] },
    schedulerMetaModeAudit: [],
    timingSemantics: {},
    p01CoverageMapping: { status: 'complete' },
    recommendations: []
  };
  const artifact = {
    relativePath: 'tmp/scheduler-observability/full.json',
    sha256: 'abc', bytes: 123, lineCount: 10, ignoredByGit: true,
    contentSchemaVersion: full.schemaVersion,
    rerunCommand: 'node scripts/audit-scheduler-observability.js --p01-evidence-dir="<P01_EVIDENCE_DIR>"'
  };
  const compact = observability.buildCompactAuditSummary(full, artifact);

  assert.equal(compact.schemaVersion, 'scheduler-observability-summary-v2');
  assert.deepEqual(compact.templateCoverage.summary, full.templateCoverage.summary);
  assert.deepEqual(compact.fairnessAudit.summary, full.fairnessAudit.summary);
  assert.deepEqual(compact.fullArtifact, artifact);
  assert.equal(Object.hasOwn(compact.templateCoverage, 'scenarioResults'), false);
  assert.equal(Object.hasOwn(compact.pathAudit.courtNormalization, 'results'), false);
  assert.equal(Object.hasOwn(compact.determinismAudit, 'rows'), false);
  assert.equal(Object.hasOwn(compact.performance.benchmarks[0], 'sampleMs'), false);
  assert.equal(Object.hasOwn(compact.performance.groups[0], 'sampleMs'), false);
});

test('default detailed artifact path is ignored by git', () => {
  assert.equal(observability.isGitIgnored(observability.DEFAULT_FULL_OUTPUT_PATH), true);
});

test('tracked compact evidence preserves the committed P01 mapping and future-candidate boundary', () => {
  const evidencePath = path.join(
    __dirname,
    '../docs/tasks/parallel-development/evidence/02-scheduler-observability-audit.json'
  );
  const evidenceText = fs.readFileSync(evidencePath, 'utf8');
  const evidence = JSON.parse(evidenceText);
  const mapping = evidence.p01CoverageMapping;
  const stable = mapping.windows['180d'].stableHighFrequency;
  const candidates = stable.futureTemplateCandidates.map((row) => (
    `${row.currentTemplateKey}@${row.totalMatches}m`
  )).sort();
  const auditScriptPath = path.join(__dirname, '../scripts/audit-scheduler-observability.js');
  const auditScriptSha256 = crypto.createHash('sha256').update(fs.readFileSync(auditScriptPath)).digest('hex');

  assert.equal(evidence.schemaVersion, 'scheduler-observability-summary-v2');
  assert.ok(Buffer.byteLength(evidenceText) < 200000);
  assert.ok(evidenceText.split(/\r?\n/).length < 5000);
  assert.equal(evidence.fullArtifact.ignoredByGit, true);
  assert.match(evidence.fullArtifact.sha256, /^[0-9a-f]{64}$/);
  assert.match(evidence.fullArtifact.stableInvariantSha256, /^[0-9a-f]{64}$/);
  assert.equal(Object.hasOwn(evidence.templateCoverage, 'scenarioResults'), false);
  assert.equal(evidence.metadata.sourceTreeAtAuditStart.state, 'dirty_expected_audit_only');
  assert.equal(evidence.metadata.sourceTreeAtAuditStart.productionSchedulerSourceClean, true);
  assert.deepEqual(evidence.metadata.sourceTreeAtAuditStart.unexpectedDirtyPaths, []);
  assert.equal(evidence.metadata.sourceTreeBeforeWrite.state, 'dirty_expected_audit_only');
  assert.equal(evidence.metadata.sourceTreeBeforeWrite.productionSchedulerSourceClean, true);
  assert.deepEqual(evidence.metadata.sourceTreeBeforeWrite.unexpectedDirtyPaths, []);
  assert.equal(evidence.metadata.auditScriptSha256, auditScriptSha256);
  assert.equal(evidence.metadata.auditScriptSha256BeforeWrite, auditScriptSha256);
  assert.equal(mapping.status, 'complete_with_90d_summary_only');
  assert.equal(mapping.source.git.commit, P01_FINAL_COMMIT);
  assert.equal(mapping.source.git.readMode, 'git_commit_blob');
  assert.equal(mapping.source.git.clean, true);
  assert.equal(mapping.source.hashes.pareto180TrackedEvidenceHash, P01_PARETO_JSON_SHA256);
  assert.equal(mapping.source.hashes.pareto180TrackedCsvHash, P01_PARETO_CSV_SHA256);
  assert.equal(mapping.source.hashes.pareto90UntrackedAggregateHashFromManifest, P01_90D_MANIFEST_SHA256);
  assert.equal(mapping.source.files.pareto180.sha256, P01_PARETO_JSON_SHA256);
  assert.equal(mapping.source.files.pareto180Csv.sha256, P01_PARETO_CSV_SHA256);
  assert.equal(mapping.source.files.pareto180.tracked, true);
  assert.equal(mapping.source.files.pareto180Csv.tracked, true);
  assert.match(mapping.source.files.sourceManifest.sha256, /^[0-9a-f]{64}$/);
  assert.equal(mapping.source.files.sourceManifest.tracked, true);
  assert.equal(mapping.source.closureComparison.pathDrifted, false);
  assert.equal(mapping.source.closureComparison.contentHashDrifted, false);
  assert.equal(Object.values(mapping.source.validation).every(Boolean), true);
  assert.equal(mapping.windows['90d'].topExact.currentPrefixSupported, true);
  assert.equal(mapping.windows['90d'].topFamilies.every((row) => row.currentTemplateKeyPresent), true);
  assert.equal(stable.sourceExactRows, 70);
  assert.equal(stable.eventCount, 435);
  assert.deepEqual(stable.summary.eventCounts, {
    template: 406,
    dynamic: 18,
    modeSpecific: 0,
    unclassified: 11,
    invalid: 0
  });
  assert.equal(stable.summary.missingCurrentTemplateKeyRows, 0);
  assert.deepEqual(candidates, [
    '12p-1c@24m',
    '12p-2c@24m',
    '12p-2c@30m',
    '12p-3c@18m',
    '13p-2c@30m',
    '14p-1c@28m',
    '18p-3c@45m'
  ]);
  assert.equal(stable.futureTemplateCandidates.every((row) => (
    row.currentTemplateKeyPresent
    && !row.currentPrefixSupported
    && row.futureTemplateDisposition === 'extend_existing_template_prefix_candidate'
  )), true);
});

test('reproduced ignored full artifact matches the tracked hash and invariant summaries', {
  skip: !fs.existsSync(observability.DEFAULT_FULL_OUTPUT_PATH)
}, () => {
  const compact = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../docs/tasks/parallel-development/evidence/02-scheduler-observability-audit.json'),
    'utf8'
  ));
  const fullBuffer = fs.readFileSync(observability.DEFAULT_FULL_OUTPUT_PATH);
  const fullText = fullBuffer.toString('utf8');
  const full = JSON.parse(fullText);
  const lineCount = fullText.split(/\r?\n/).length - (fullText.endsWith('\n') ? 1 : 0);

  assert.equal(crypto.createHash('sha256').update(fullBuffer).digest('hex'), compact.fullArtifact.sha256);
  assert.equal(fullBuffer.length, compact.fullArtifact.bytes);
  assert.equal(lineCount, compact.fullArtifact.lineCount);
  assert.equal(full.schemaVersion, compact.fullArtifact.contentSchemaVersion);
  assert.deepEqual(full.templateCoverage.summary, compact.templateCoverage.summary);
  assert.deepEqual(full.pathAudit.summary, compact.pathAudit.summary);
  assert.deepEqual(full.fairnessAudit.summary, compact.fairnessAudit.summary);
  assert.deepEqual(full.determinismAudit.summary, compact.determinismAudit.summary);

  const invariantDigest = observability.buildStableInvariantDigest(full);
  const runOnlyVariant = JSON.parse(JSON.stringify(full));
  runOnlyVariant.metadata.generatedAt = '2099-01-01T00:00:00.000Z';
  runOnlyVariant.performance.benchmarks.forEach((row) => { row.sampleMs = [999]; });
  runOnlyVariant.pathAudit.summary = { total: 999, conserved: true, counts: { error: 999 } };
  assert.equal(observability.buildStableInvariantDigest(runOnlyVariant), invariantDigest);

  const mappingVariant = JSON.parse(JSON.stringify(full));
  mappingVariant.p01CoverageMapping.status = 'changed-input';
  assert.notEqual(observability.buildStableInvariantDigest(mappingVariant), invariantDigest);
});
