#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const scenarioCommon = require('./scheduler-scenario-common');
const { generateSchedule, computeEffectiveCourts } = require('../cloudfunctions/startTournament/rotation');
const { buildSquadSchedule, buildFixedPairSchedule } = require('../cloudfunctions/startTournament/scheduleModes');
const templateLibrary = require('../cloudfunctions/startTournament/rotation.templates');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, 'docs/tasks/parallel-development/evidence');
const DEFAULT_JSON_NAME = '02-scheduler-observability-audit.json';
const DEFAULT_MARKDOWN_NAME = '02-scheduler-observability-audit.md';
const DEFAULT_FULL_OUTPUT_PATH = path.join(
  REPO_ROOT,
  'tmp/scheduler-observability/02-scheduler-observability-audit.full.json'
);
const DEFAULT_BENCHMARK_REPEATS = 20;
const DEFAULT_BENCHMARK_WARMUPS = 2;
const P01_EVIDENCE_FILES = {
  pareto180: /^01-tournament-combination-pareto-\d{4}-\d{2}-\d{2}\.json$/,
  pareto180Csv: /^01-tournament-combination-pareto-\d{4}-\d{2}-\d{2}\.csv$/,
  productSummary: /^01-product-data-summary-\d{4}-\d{2}-\d{2}\.json$/,
  sourceManifest: /^01-source-manifest-\d{4}-\d{2}-\d{2}\.json$/
};
const P01_PRE_CLOSURE_REFERENCE = {
  commit: '42367b042e316fffca28eb878f2d055b9c514bd1',
  pareto180RelativePath: 'docs/tasks/parallel-development/evidence/01-tournament-combination-pareto-2026-07-16.json',
  pareto180Sha256: '331ae2e2e6b65e6242fd042d90d405f7d3251436a0b7ae85af1e686fbc07466d'
};
const EXPECTED_AUDIT_DIRTY_PATHS = new Set([
  'scripts/audit-scheduler-observability.js',
  'tests/scheduler.observability-audit.test.js',
  'docs/tasks/parallel-development/02-scheduler-observability.md',
  'docs/tasks/parallel-development/evidence/02-scheduler-observability-audit.json',
  'docs/tasks/parallel-development/evidence/02-scheduler-observability-audit.md'
]);
const PRODUCTION_SCHEDULER_PATHS = new Set([
  'cloudfunctions/startTournament/index.js',
  'cloudfunctions/startTournament/rotation.js',
  'cloudfunctions/startTournament/rotationDoublesEngine.js',
  'cloudfunctions/startTournament/rotation.templates.js',
  'cloudfunctions/startTournament/scheduleModes.js'
]);

const DONE_TIMING_FIELDS = [
  'scheduleMs',
  'materializeMs',
  'writeMs',
  'totalMs',
  'engine',
  'engineVersion',
  'executionProfile',
  'templateKey',
  'fallbackReason',
  'searchElapsedMs',
  'requestedCourts',
  'effectiveCourts',
  'playersCount',
  'totalMatches',
  'mode',
  'scheduledMatches'
];

function range(start, end) {
  if (end < start) return [];
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function sortTemplateEntries(entries) {
  return entries.slice().sort(([left], [right]) => left.localeCompare(right, 'en', { numeric: true }));
}

function countVariantMatches(variant) {
  return (variant && Array.isArray(variant.rounds) ? variant.rounds : [])
    .reduce((sum, round) => sum + (round && Array.isArray(round.matches) ? round.matches.length : 0), 0);
}

function buildTemplateCoverageMatrix(library = templateLibrary) {
  const cases = library && library.cases && typeof library.cases === 'object' ? library.cases : {};
  return sortTemplateEntries(Object.entries(cases)).map(([templateKey, caseData]) => {
    const horizonMatches = Math.max(0, Number(caseData && caseData.horizonMatches) || 0);
    const variants = caseData && Array.isArray(caseData.variants) ? caseData.variants : [];
    const variantCapacities = Object.fromEntries(variants.map((variant) => [
      String(variant && variant.id ? variant.id : ''),
      countVariantMatches(variant)
    ]));
    const variantIds = Object.keys(variantCapacities).filter(Boolean).sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
    const variantIdSet = new Set(variantIds);
    const bestPrefixByMatchCount = caseData && caseData.bestPrefixByMatchCount
      ? caseData.bestPrefixByMatchCount
      : {};
    const prefixMetrics = caseData && caseData.prefixMetrics ? caseData.prefixMetrics : {};
    const supportedMatchCounts = [];
    const missingMatchCounts = [];
    const invalidVariantMatchCounts = [];
    const insufficientVariantMatchCounts = [];

    for (let matches = 1; matches <= horizonMatches; matches += 1) {
      const key = String(matches);
      const variantId = String(bestPrefixByMatchCount[key] || '');
      const hasMetrics = Object.prototype.hasOwnProperty.call(prefixMetrics, key);
      if (!variantId || !hasMetrics) missingMatchCounts.push(matches);
      if (variantId && !variantIdSet.has(variantId)) invalidVariantMatchCounts.push(matches);
      if (variantIdSet.has(variantId) && Number(variantCapacities[variantId]) < matches) {
        insufficientVariantMatchCounts.push(matches);
      }
      if (
        variantId
        && hasMetrics
        && variantIdSet.has(variantId)
        && Number(variantCapacities[variantId]) >= matches
      ) {
        supportedMatchCounts.push(matches);
      }
    }

    return {
      templateKey,
      templateLibraryVersion: String(library && library.version ? library.version : ''),
      playersCount: Number(caseData && caseData.players) || 0,
      effectiveCourts: Number(caseData && caseData.courts) || 0,
      horizonMatches,
      variantCount: variantIds.length,
      variantIds,
      variantCapacities,
      supportedMatchCount: supportedMatchCounts.length,
      supportedMatchCounts,
      missingMatchCounts,
      invalidVariantMatchCounts,
      insufficientVariantMatchCounts
    };
  });
}

function normalizeRepoPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function describeCommittedInput(relativePath, content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return {
    basename: path.basename(relativePath),
    relativePath: normalizeRepoPath(relativePath),
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    bytes: buffer.length,
    tracked: true
  };
}

function readRepositoryMetadata(targetPath) {
  function runGit(args) {
    return execFileSync('git', ['-C', targetPath, ...args], { encoding: 'utf8' }).trim();
  }
  const repositoryRoot = runGit(['rev-parse', '--show-toplevel']);
  const status = execFileSync(
    'git',
    ['-C', targetPath, 'status', '--short', '--untracked-files=all'],
    { encoding: 'utf8' }
  ).trim();
  return {
    repositoryRoot,
    commit: runGit(['rev-parse', 'HEAD']),
    branch: runGit(['branch', '--show-current']),
    clean: !status
  };
}

function resolveSingleEvidencePath(paths, pattern, label) {
  const matches = (Array.isArray(paths) ? paths : [])
    .filter((filePath) => pattern.test(path.basename(filePath)))
    .sort((left, right) => left.localeCompare(right, 'en'));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one committed ${label} in P01 evidence directory, found ${matches.length}`);
  }
  return matches[0];
}

function parseParetoCsv(csvText) {
  const lines = String(csvText || '').trim().split(/\r?\n/);
  const expectedHeader = [
    'mode', 'playersCount', 'courts', 'totalMatches', 'presetKey', 'templateKey', 'engine',
    'classifiable', 'count', 'effectiveCompletedCount', 'effectiveCompletionRate',
    'firstScoreToCompletionSamples', 'medianFirstScoreToCompletionHours', 'share',
    'cumulativeCount', 'cumulativeCoverage'
  ];
  const header = lines.shift().split(',');
  if (header.length !== expectedHeader.length || header.some((field, index) => field !== expectedHeader[index])) {
    throw new Error('P01 180d Pareto CSV header is invalid');
  }
  return lines.filter(Boolean).map((line, index) => {
    const values = line.split(',');
    if (values.length !== header.length) {
      throw new Error(`P01 180d Pareto CSV row ${index + 1} has ${values.length} fields; expected ${header.length}`);
    }
    return Object.fromEntries(header.map((field, fieldIndex) => [field, values[fieldIndex]]));
  });
}

function assertP01EvidenceShape(evidence) {
  if (!evidence || !evidence.git || !/^[0-9a-f]{40}$/.test(String(evidence.git.commit || ''))) {
    throw new Error('P01 evidence must be anchored to a full 40-character Git commit');
  }
  if (!evidence.git.clean) throw new Error('P01 evidence worktree must be clean');
  const requiredSourceKeys = ['pareto180', 'pareto180Csv', 'productSummary', 'sourceManifest'];
  requiredSourceKeys.forEach((key) => {
    const source = evidence.sources && evidence.sources[key];
    if (!source || !source.tracked || !/^docs\/tasks\/parallel-development\/evidence\//.test(source.relativePath)) {
      throw new Error(`P01 ${key} must be a tracked committed evidence file`);
    }
    if (!/^[0-9a-f]{64}$/.test(String(source.sha256 || '')) || Number(source.bytes) <= 0) {
      throw new Error(`P01 ${key} must include a valid content hash and byte count`);
    }
  });

  const manifest = evidence.sourceManifest || {};
  const summary = evidence.productSummary || {};
  const manifestPrivacy = manifest.privacy || {};
  const summaryPrivacy = summary.privacy || {};
  const manifestProfileFieldFlags = ['containsProfileFields', 'containsRawProfileFields']
    .filter((key) => Object.prototype.hasOwnProperty.call(manifestPrivacy, key));
  const manifestProfileFieldsSafe = manifestProfileFieldFlags.length > 0
    && manifestProfileFieldFlags.every((key) => manifestPrivacy[key] === false);
  const aggregatePortraitSafe = manifestPrivacy.containsKAnonymizedAggregatePortrait !== true
    || (
      manifestPrivacy.portraitGeographyOmitted === true
      && Number.isInteger(manifestPrivacy.portraitKThreshold)
      && manifestPrivacy.portraitKThreshold >= 5
    );
  if (
    manifestPrivacy.rawFilesTracked !== false
    || manifestPrivacy.containsActorIdentifiers !== false
    || !manifestProfileFieldsSafe
    || !aggregatePortraitSafe
    || manifestPrivacy.containsSecrets !== false
    || summaryPrivacy.containsActorIdentifiers !== false
    || summaryPrivacy.containsProfileFields !== false
    || summaryPrivacy.containsSecrets !== false
  ) {
    throw new Error('P01 evidence privacy contract is missing or unsafe');
  }

  const pareto = evidence.pareto180 || {};
  const rows = Array.isArray(pareto.rows) ? pareto.rows : [];
  if (pareto.population !== 'started_tournaments' || !rows.length || Number(pareto.total) <= 0) {
    throw new Error('P01 180d Pareto schema is incomplete');
  }
  rows.forEach((row, index) => {
    if (
      !String(row && row.mode || '')
      || !Number.isInteger(row && row.playersCount) || row.playersCount < 1
      || !Number.isInteger(row && row.courts) || row.courts < 1
      || !Number.isInteger(row && row.totalMatches) || row.totalMatches < 1
      || !Number.isInteger(row && row.count) || row.count < 1
      || typeof row.classifiable !== 'boolean'
    ) {
      throw new Error(`P01 180d Pareto row ${index + 1} is invalid`);
    }
  });
  const totalEvents = rows.reduce((sum, row) => sum + Number(row.count), 0);
  if (totalEvents !== Number(pareto.total)) {
    throw new Error(`P01 Pareto event conservation failed: rows=${totalEvents}, total=${pareto.total}`);
  }
  const classifiableEvents = rows
    .filter((row) => row.classifiable === true)
    .reduce((sum, row) => sum + Number(row.count), 0);
  if (classifiableEvents !== Number(pareto.classifiableCount)) {
    throw new Error('P01 Pareto classifiable event conservation failed');
  }
  const csvRows = parseParetoCsv(evidence.pareto180Csv);
  if (csvRows.length !== rows.length) {
    throw new Error(`P01 Pareto JSON/CSV row conservation failed: json=${rows.length}, csv=${csvRows.length}`);
  }
  let csvCumulativeCount = 0;
  csvRows.forEach((csvRow, index) => {
    const jsonRow = rows[index];
    csvCumulativeCount += Number(csvRow.count);
    const exactFields = ['mode', 'presetKey', 'templateKey', 'engine'];
    const integerFields = ['playersCount', 'courts', 'totalMatches', 'count'];
    if (
      exactFields.some((field) => String(jsonRow[field]) !== csvRow[field])
      || integerFields.some((field) => Number(jsonRow[field]) !== Number(csvRow[field]))
      || String(jsonRow.classifiable) !== csvRow.classifiable
      || Number(csvRow.cumulativeCount) !== csvCumulativeCount
      || Math.abs(Number(csvRow.share) - (Number(jsonRow.count) / Number(pareto.total))) > 1e-12
      || Math.abs(Number(csvRow.cumulativeCoverage) - (csvCumulativeCount / Number(pareto.total))) > 1e-12
    ) {
      throw new Error(`P01 Pareto JSON/CSV row ${index + 1} does not match or conserve cumulative totals`);
    }
  });
  if (csvCumulativeCount !== Number(pareto.total)) {
    throw new Error('P01 Pareto CSV event conservation failed');
  }
  ['0.8', '0.9', '0.95'].forEach((thresholdKey) => {
    const threshold = pareto.thresholds && pareto.thresholds[thresholdKey];
    const rowCount = Number(threshold && threshold.rowCount);
    if (!Number.isInteger(rowCount) || rowCount < 1 || rowCount > rows.length) {
      throw new Error(`P01 Pareto threshold ${thresholdKey} rowCount is invalid`);
    }
    const coveredCount = rows.slice(0, rowCount).reduce((sum, row) => sum + Number(row.count), 0);
    const expectedCoverage = coveredCount / Number(pareto.total);
    if (
      coveredCount !== Number(threshold.coveredCount)
      || Math.abs(expectedCoverage - Number(threshold.coverage)) > 1e-12
    ) {
      throw new Error(`P01 Pareto threshold ${thresholdKey} conservation failed`);
    }
  });
  const expected180Hash = String(
    manifest.localAggregateArtifacts
      && manifest.localAggregateArtifacts['180d']
      && manifest.localAggregateArtifacts['180d'].paretoJsonSha256
      || ''
  );
  if (!expected180Hash || evidence.sources.pareto180.sha256 !== expected180Hash) {
    throw new Error('P01 180d Pareto hash does not match the committed source manifest');
  }
  const expected180CsvHash = String(
    manifest.localAggregateArtifacts
      && manifest.localAggregateArtifacts['180d']
      && manifest.localAggregateArtifacts['180d'].paretoCsvSha256
      || ''
  );
  if (!expected180CsvHash || evidence.sources.pareto180Csv.sha256 !== expected180CsvHash) {
    throw new Error('P01 180d Pareto CSV hash does not match the committed source manifest');
  }
  const expected90Hash = String(
    manifest.localAggregateArtifacts
      && manifest.localAggregateArtifacts['90d']
      && manifest.localAggregateArtifacts['90d'].paretoJsonSha256
      || ''
  );
  if (!/^[0-9a-f]{64}$/.test(expected90Hash)) {
    throw new Error('P01 90d Pareto manifest hash anchor is missing or invalid');
  }
  if (
    !summary.metrics
    || !summary.metrics.window90
    || !summary.metrics.window90.pareto
    || !summary.derivedFindings
    || !summary.derivedFindings.topExactCombination90d
    || !Array.isArray(summary.derivedFindings.topModePlayersCourts90d)
  ) {
    throw new Error('P01 90d published summary evidence is incomplete');
  }
  return {
    committedInputs: true,
    privacySafe: true,
    totalEventsConserved: true,
    classifiableEventsConserved: true,
    jsonCsvRowsAndEventsConserved: true,
    paretoThresholdsConserved: true,
    pareto180ManifestHashMatched: true,
    pareto180CsvManifestHashMatched: true,
    pareto90ManifestHashAnchorValid: true
  };
}

function loadP01Evidence(evidenceDir, options = {}) {
  if (!evidenceDir) return null;
  const directory = path.resolve(evidenceDir);
  const expectedCommit = String(options.expectedCommit || '').trim();
  if (options.requireExpectedCommit && !/^[0-9a-f]{40}$/.test(expectedCommit)) {
    throw new Error('A full --p01-expected-commit SHA is required');
  }
  const repositoryBefore = readRepositoryMetadata(directory);
  if (expectedCommit && repositoryBefore.commit !== expectedCommit) {
    throw new Error(`P01 evidence commit mismatch: expected ${expectedCommit}, actual ${repositoryBefore.commit}`);
  }
  if (!repositoryBefore.clean) throw new Error('P01 evidence worktree is not clean');
  const evidenceDirectory = normalizeRepoPath(path.relative(repositoryBefore.repositoryRoot, directory));
  if (evidenceDirectory.startsWith('../') || evidenceDirectory === '..') {
    throw new Error('P01 evidence directory must be inside its Git repository');
  }
  const committedPaths = execFileSync(
    'git',
    ['-C', repositoryBefore.repositoryRoot, 'ls-tree', '-r', '--name-only', expectedCommit || repositoryBefore.commit, '--', evidenceDirectory],
    { encoding: 'utf8' }
  ).split(/\r?\n/).map(normalizeRepoPath).filter(Boolean);
  const files = Object.fromEntries(Object.entries(P01_EVIDENCE_FILES).map(([key, pattern]) => [
    key,
    resolveSingleEvidencePath(committedPaths, pattern, key)
  ]));
  const commit = expectedCommit || repositoryBefore.commit;
  const contents = Object.fromEntries(Object.entries(files).map(([key, relativePath]) => [
    key,
    execFileSync('git', ['-C', repositoryBefore.repositoryRoot, 'show', `${commit}:${relativePath}`])
  ]));
  const repositoryAfter = readRepositoryMetadata(directory);
  if (repositoryAfter.commit !== commit || !repositoryAfter.clean) {
    throw new Error('P01 evidence repository changed while committed evidence was being read');
  }
  const evidence = {
    pareto180: JSON.parse(contents.pareto180.toString('utf8')),
    pareto180Csv: contents.pareto180Csv.toString('utf8'),
    productSummary: JSON.parse(contents.productSummary.toString('utf8')),
    sourceManifest: JSON.parse(contents.sourceManifest.toString('utf8')),
    git: {
      commit,
      branch: repositoryAfter.branch,
      clean: repositoryAfter.clean,
      readMode: 'git_commit_blob'
    },
    sources: Object.fromEntries(Object.entries(files).map(([key, relativePath]) => [
      key,
      describeCommittedInput(relativePath, contents[key])
    ]))
  };
  evidence.validation = assertP01EvidenceShape(evidence);
  return evidence;
}

function mapCurrentCombination(row, templateMatrix = buildTemplateCoverageMatrix(templateLibrary)) {
  const mode = String(row && row.mode || 'unknown');
  const playersCount = Number(row && row.playersCount) || 0;
  const requestedCourts = Number(row && row.courts) || 0;
  const totalMatches = Number(row && row.totalMatches) || 0;
  const base = {
    mode,
    playersCount,
    requestedCourts,
    totalMatches,
    effectiveCourts: null,
    currentTemplateKey: null,
    currentTemplateKeyPresent: false,
    currentTemplateHorizonMatches: null,
    currentPrefixSupported: false,
    currentPrefixKind: 'not_applicable',
    currentPathContract: 'unclassified',
    equalPlayMathematicallyPossible: null,
    futureTemplateDisposition: 'unclassifiable_not_template_signal'
  };

  if (mode === 'fixed_pair_rr') {
    return {
      ...base,
      currentPathContract: 'fixed_pair_rr_mode_specific',
      futureTemplateDisposition: 'not_rotation_template_scope'
    };
  }
  if (mode === 'squad_doubles') {
    return {
      ...base,
      currentPathContract: 'squad_doubles_mode_specific',
      futureTemplateDisposition: 'not_rotation_template_scope'
    };
  }
  if (mode !== 'multi_rotate') return base;
  if (playersCount < 4 || requestedCourts < 1 || totalMatches < 1) {
    return {
      ...base,
      currentPathContract: 'invalid_rotation_input',
      futureTemplateDisposition: 'invalid_combination_not_template_candidate'
    };
  }

  const effectiveCourts = computeEffectiveCourts(playersCount, requestedCourts);
  const currentTemplateKey = `${playersCount}p-${effectiveCourts}c`;
  const template = templateMatrix.find((entry) => entry.templateKey === currentTemplateKey) || null;
  const currentPrefixSupported = Boolean(
    template && template.supportedMatchCounts.includes(totalMatches)
  );
  const currentTemplateKeyPresent = Boolean(template);
  const equalPlayMathematicallyPossible = (4 * totalMatches) % playersCount === 0;
  let currentPathContract = 'dynamic_guarded_no_template_key';
  let currentPrefixKind = 'missing_template_key';
  let futureTemplateDisposition = 'new_template_key_candidate';
  if (currentPrefixSupported) {
    currentPathContract = 'template';
    currentPrefixKind = totalMatches === template.horizonMatches ? 'full_horizon' : 'proper_prefix';
    futureTemplateDisposition = 'already_covered';
  } else if (currentTemplateKeyPresent) {
    currentPathContract = 'dynamic_guarded_beyond_template_horizon';
    currentPrefixKind = 'beyond_horizon';
    futureTemplateDisposition = 'extend_existing_template_prefix_candidate';
  }

  return {
    ...base,
    effectiveCourts,
    currentTemplateKey,
    currentTemplateKeyPresent,
    currentTemplateHorizonMatches: template ? template.horizonMatches : null,
    currentPrefixSupported,
    currentPrefixKind,
    currentPathContract,
    equalPlayMathematicallyPossible,
    futureTemplateDisposition
  };
}

function aggregateParetoRows(rows) {
  const groups = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const mode = String(row && row.mode || 'unknown');
    const playersCount = Number(row && row.playersCount) || 0;
    const courts = Number(row && row.courts) || 0;
    const totalMatches = Number(row && row.totalMatches) || 0;
    const key = [mode, playersCount, courts, totalMatches].join('|');
    const current = groups.get(key) || {
      mode,
      playersCount,
      courts,
      totalMatches,
      count: 0,
      sourceExactRows: 0,
      firstSourceRank: index + 1,
      historicalPresetKeys: new Set(),
      historicalTemplateKeys: new Set(),
      historicalEngines: new Set()
    };
    current.count += Number(row.count) || 0;
    current.sourceExactRows += 1;
    if (row.presetKey) current.historicalPresetKeys.add(String(row.presetKey));
    if (row.templateKey) current.historicalTemplateKeys.add(String(row.templateKey));
    if (row.engine) current.historicalEngines.add(String(row.engine));
    groups.set(key, current);
  });
  return [...groups.values()].map((row) => ({
    ...row,
    historicalPresetKeys: [...row.historicalPresetKeys].sort(),
    historicalTemplateKeys: [...row.historicalTemplateKeys].sort(),
    historicalEngines: [...row.historicalEngines].sort()
  })).sort((left, right) => (
    right.count - left.count
    || left.firstSourceRank - right.firstSourceRank
    || left.mode.localeCompare(right.mode, 'en')
    || left.playersCount - right.playersCount
    || left.courts - right.courts
    || left.totalMatches - right.totalMatches
  ));
}

function mappingCategory(row) {
  if (row.currentPathContract === 'template') return 'template';
  if (row.currentPathContract.startsWith('dynamic_guarded')) return 'dynamic';
  if (row.currentPathContract.endsWith('_mode_specific')) return 'modeSpecific';
  if (row.currentPathContract === 'unclassified') return 'unclassified';
  return 'invalid';
}

function summarizeCoverageMappings(rows, expectations = {}) {
  const categories = ['template', 'dynamic', 'modeSpecific', 'unclassified', 'invalid'];
  const rowCounts = Object.fromEntries(categories.map((key) => [key, 0]));
  const eventCounts = Object.fromEntries(categories.map((key) => [key, 0]));
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const category = mappingCategory(row);
    rowCounts[category] += 1;
    eventCounts[category] += Number(row.count) || 0;
  });
  const totalRows = Object.values(rowCounts).reduce((sum, value) => sum + value, 0);
  const totalEvents = Object.values(eventCounts).reduce((sum, value) => sum + value, 0);
  const sourceExactRows = (Array.isArray(rows) ? rows : [])
    .reduce((sum, row) => sum + (Number(row.sourceExactRows) || 0), 0);
  const expectedSourceExactRows = Number.isFinite(Number(expectations.sourceExactRows))
    ? Number(expectations.sourceExactRows)
    : sourceExactRows;
  const expectedEvents = Number.isFinite(Number(expectations.events))
    ? Number(expectations.events)
    : totalEvents;
  const decisionRowsConserved = totalRows === (Array.isArray(rows) ? rows.length : 0);
  const sourceRowsConserved = sourceExactRows === expectedSourceExactRows;
  const eventsConserved = totalEvents === expectedEvents;
  return {
    totalRows,
    totalEvents,
    sourceExactRows,
    expectedSourceExactRows,
    expectedEvents,
    rowCounts,
    eventCounts,
    decisionRowsConserved,
    sourceRowsConserved,
    eventsConserved,
    conserved: decisionRowsConserved && sourceRowsConserved && eventsConserved,
    multiRotateEvents: eventCounts.template + eventCounts.dynamic,
    currentTemplateCoveredMultiRotateRate: eventCounts.template + eventCounts.dynamic > 0
      ? eventCounts.template / (eventCounts.template + eventCounts.dynamic)
      : null,
    futureTemplateCandidateRows: (Array.isArray(rows) ? rows : [])
      .filter((row) => row.futureTemplateDisposition.endsWith('_candidate')).length,
    missingCurrentTemplateKeyRows: (Array.isArray(rows) ? rows : [])
      .filter((row) => row.futureTemplateDisposition === 'new_template_key_candidate').length
  };
}

function mapAggregatedParetoRows(rows, templateMatrix) {
  return aggregateParetoRows(rows).map((row) => ({
    ...row,
    ...mapCurrentCombination(row, templateMatrix)
  }));
}

function buildP01CoverageMapping(evidence, templateMatrix = buildTemplateCoverageMatrix(templateLibrary)) {
  if (!evidence) {
    return {
      status: 'missing_p01_evidence',
      source: null,
      windows: {},
      conclusion: '未提供 P01 脱敏 evidence 目录，无法完成真实组合覆盖映射。'
    };
  }
  const inputValidation = evidence.validation || assertP01EvidenceShape(evidence);
  const pareto180 = evidence.pareto180 || {};
  const summary = evidence.productSummary || {};
  const manifest = evidence.sourceManifest || {};
  const rows180 = Array.isArray(pareto180.rows) ? pareto180.rows : [];
  const threshold180 = pareto180.thresholds && pareto180.thresholds['0.8']
    ? pareto180.thresholds['0.8']
    : { rowCount: 0, coveredCount: 0, coverage: 0 };
  const pareto80Rows = rows180.slice(0, Number(threshold180.rowCount) || 0);
  const pareto80Mappings = mapAggregatedParetoRows(pareto80Rows, templateMatrix);
  const stableSourceRows = rows180.filter((row) => Number(row.count) >= 2);
  const stableMappings = mapAggregatedParetoRows(stableSourceRows, templateMatrix);
  const stableEventCount = stableSourceRows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const stableSummary = summarizeCoverageMappings(stableMappings, {
    sourceExactRows: stableSourceRows.length,
    events: stableEventCount
  });
  const pareto80Summary = summarizeCoverageMappings(pareto80Mappings, {
    sourceExactRows: Number(threshold180.rowCount),
    events: Number(threshold180.coveredCount)
  });
  const futureTemplateCandidates = stableMappings.filter((row) => (
    row.futureTemplateDisposition === 'extend_existing_template_prefix_candidate'
    || row.futureTemplateDisposition === 'new_template_key_candidate'
  ));
  const window90Summary = summary.metrics && summary.metrics.window90 ? summary.metrics.window90 : {};
  const topExact90 = summary.derivedFindings && summary.derivedFindings.topExactCombination90d
    ? summary.derivedFindings.topExactCombination90d
    : null;
  const topFamilies90 = summary.derivedFindings && Array.isArray(summary.derivedFindings.topModePlayersCourts90d)
    ? summary.derivedFindings.topModePlayersCourts90d
    : [];
  const mappedTopExact90 = topExact90 ? {
    mode: String(topExact90.mode || ''),
    playersCount: Number(topExact90.playersCount) || 0,
    courts: Number(topExact90.courts) || 0,
    totalMatches: Number(topExact90.totalMatches) || 0,
    presetKey: String(topExact90.presetKey || ''),
    historicalTemplateKey: String(topExact90.templateKey || ''),
    historicalEngine: String(topExact90.engine || ''),
    count: Number(topExact90.count) || 0,
    shareOfStarted: Number(topExact90.shareOfStarted) || 0,
    ...mapCurrentCombination(topExact90, templateMatrix)
  } : null;
  const mappedTopFamilies90 = topFamilies90.map((family) => {
    const effectiveCourts = family.mode === 'multi_rotate'
      ? computeEffectiveCourts(Number(family.playersCount) || 0, Number(family.courts) || 0)
      : null;
    const currentTemplateKey = effectiveCourts
      ? `${Number(family.playersCount)}p-${effectiveCourts}c`
      : null;
    const template = templateMatrix.find((row) => row.templateKey === currentTemplateKey) || null;
    return {
      mode: String(family.mode || ''),
      playersCount: Number(family.playersCount) || 0,
      courts: Number(family.courts) || 0,
      count: Number(family.count) || 0,
      shareOfStarted: Number(family.shareOfStarted) || 0,
      effectiveCourts,
      currentTemplateKey,
      currentTemplateKeyPresent: Boolean(template),
      currentTemplateHorizonMatches: template ? template.horizonMatches : null,
      prefixCoverage: 'not_assessable_without_exact_total_matches',
      futureTemplateDisposition: template
        ? 'no_new_key_indicated_exact_prefix_evidence_required'
        : 'key_gap_possible_exact_rows_required'
    };
  });
  const source90Hash = String(
    manifest.localAggregateArtifacts
      && manifest.localAggregateArtifacts['90d']
      && manifest.localAggregateArtifacts['90d'].paretoJsonSha256
      || ''
  );
  const source180Hash = String(
    manifest.localAggregateArtifacts
      && manifest.localAggregateArtifacts['180d']
      && manifest.localAggregateArtifacts['180d'].paretoJsonSha256
      || ''
  );
  const source180CsvHash = String(
    manifest.localAggregateArtifacts
      && manifest.localAggregateArtifacts['180d']
      && manifest.localAggregateArtifacts['180d'].paretoCsvSha256
      || ''
  );
  const multiRotateEvents = stableSummary.multiRotateEvents;
  const coveredEvents = stableSummary.eventCounts.template;
  const dynamicEvents = stableSummary.eventCounts.dynamic;

  return {
    status: 'complete_with_90d_summary_only',
    source: {
      git: evidence.git || null,
      evidenceDirectory: 'docs/tasks/parallel-development/evidence',
      files: evidence.sources || {},
      validation: inputValidation,
      hashes: {
        pareto90UntrackedAggregateHashFromManifest: source90Hash,
        pareto180TrackedEvidenceHash: source180Hash,
        pareto180TrackedCsvHash: source180CsvHash
      },
      closureComparison: {
        preClosureReferenceCommit: P01_PRE_CLOSURE_REFERENCE.commit,
        pareto180RelativePathBeforeClosure: P01_PRE_CLOSURE_REFERENCE.pareto180RelativePath,
        pareto180Sha256BeforeClosure: P01_PRE_CLOSURE_REFERENCE.pareto180Sha256,
        pareto180RelativePathAtClosure: evidence.sources && evidence.sources.pareto180
          ? evidence.sources.pareto180.relativePath
          : null,
        pareto180Sha256AtClosure: evidence.sources && evidence.sources.pareto180
          ? evidence.sources.pareto180.sha256
          : null,
        pathDrifted: Boolean(
          evidence.sources
          && evidence.sources.pareto180
          && evidence.sources.pareto180.relativePath !== P01_PRE_CLOSURE_REFERENCE.pareto180RelativePath
        ),
        contentHashDrifted: Boolean(
          evidence.sources
          && evidence.sources.pareto180
          && evidence.sources.pareto180.sha256 !== P01_PRE_CLOSURE_REFERENCE.pareto180Sha256
        )
      },
      provenance: 'P01 客户端可见聚合快照；历史 templateKey/engine 只作对照标签。',
      privacy: manifest.privacy || summary.privacy || {},
      evidenceLimit: '180d 精确 Pareto 行已 tracked；90d 精确行未复制进公开 evidence 目录。'
    },
    methodology: {
      decisionDimensions: ['mode', 'playersCount', 'courts', 'totalMatches'],
      currentResolver: 'computeEffectiveCourts + live rotation.templates registry + supported prefix',
      stableHighFrequencyCriterion: 'count >= 2',
      stableCriterionReason: 'The published 180d P80 boundary contains count=1 ties; count>=2 avoids arbitrary tied-tail selection.',
      equalPlayNecessaryCondition: 'mode=multi_rotate and (4 * totalMatches) % playersCount == 0',
      historicalFieldsNotUsedForCurrentRouting: ['presetKey', 'templateKey', 'engine']
    },
    windows: {
      '90d': {
        detailAvailability: 'published_summary_only',
        startedPopulation: Number(window90Summary.pareto && window90Summary.pareto.startedPopulation) || 0,
        paretoThresholds: window90Summary.pareto && window90Summary.pareto.thresholds
          ? window90Summary.pareto.thresholds
          : {},
        topExact: mappedTopExact90,
        topFamilies: mappedTopFamilies90,
        conclusion: '已发布的 90d Top 精确组合可核对当前前缀；Top family 只有人数/场地聚合，不能据此断言其所有 totalMatches 前缀均已覆盖。'
      },
      '180d': {
        detailAvailability: 'tracked_exact_pareto_rows',
        startedPopulation: Number(pareto180.total) || 0,
        classifiableCount: Number(pareto180.classifiableCount) || 0,
        classifiableRate: Number(pareto180.classifiableRate) || 0,
        pareto80: {
          threshold: threshold180,
          sourceExactRows: pareto80Rows.length,
          decisionCombinations: pareto80Mappings.length,
          summary: pareto80Summary
        },
        stableHighFrequency: {
          sourceExactRows: stableSourceRows.length,
          decisionCombinations: stableMappings.length,
          eventCount: stableEventCount,
          summary: stableSummary,
          combinations: stableMappings,
          futureTemplateCandidates
        }
      }
    },
    conclusion: multiRotateEvents > 0
      ? `180d 稳定高频 multi_rotate 共 ${multiRotateEvents} 场：${coveredEvents} 场命中当前模板前缀，${dynamicEvents} 场超过现有 horizon；当前缺失模板键 ${stableSummary.missingCurrentTemplateKeyRows} 个。未来候选仅是数据支持的审计清单，不代表批准刷新模板。`
      : '180d 稳定高频集合没有可映射的 multi_rotate 赛事。'
  };
}

function inspectScheduleIntegrity(schedule, rosterIds, options = {}) {
  const ids = Array.isArray(rosterIds) ? rosterIds.map((id) => String(id)) : [];
  const rosterSet = new Set(ids);
  const rosterDuplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
    .filter((id, index, list) => list.indexOf(id) === index);
  const errors = [];
  let matchCount = 0;
  let malformedMatchCount = 0;
  let duplicateMemberMatchCount = 0;
  let unknownMemberCount = 0;
  let roundCollisionCount = 0;
  let courtCapacityExceededCount = 0;
  const effectiveCourts = Math.max(0, Number(options.effectiveCourts) || 0);
  const rounds = schedule && Array.isArray(schedule.rounds) ? schedule.rounds : [];

  if (rosterDuplicateIds.length) {
    errors.push({ code: 'duplicate_roster_ids', ids: rosterDuplicateIds });
  }

  rounds.forEach((round, roundIndex) => {
    const matches = round && Array.isArray(round.matches) ? round.matches : [];
    const activeInRound = new Set();
    if (effectiveCourts && matches.length > effectiveCourts) {
      courtCapacityExceededCount += 1;
      errors.push({
        code: 'court_capacity_exceeded',
        roundIndex,
        matches: matches.length,
        effectiveCourts
      });
    }

    matches.forEach((match, matchOffset) => {
      matchCount += 1;
      const teamA = match && Array.isArray(match.teamA) ? match.teamA.map(String) : [];
      const teamB = match && Array.isArray(match.teamB) ? match.teamB.map(String) : [];
      const members = teamA.concat(teamB);
      const uniqueMembers = new Set(members);
      if (teamA.length !== 2 || teamB.length !== 2 || members.length !== 4) {
        malformedMatchCount += 1;
        errors.push({
          code: 'malformed_match_members',
          roundIndex,
          matchOffset,
          teamASize: teamA.length,
          teamBSize: teamB.length
        });
      }
      if (uniqueMembers.size !== members.length) {
        duplicateMemberMatchCount += 1;
        errors.push({ code: 'duplicate_member_in_match', roundIndex, matchOffset });
      }
      const unknownMembers = members.filter((id) => !rosterSet.has(id));
      if (unknownMembers.length) {
        unknownMemberCount += unknownMembers.length;
        errors.push({ code: 'unknown_member', roundIndex, matchOffset, ids: unknownMembers });
      }
      const collisions = [...uniqueMembers].filter((id) => activeInRound.has(id));
      if (collisions.length) {
        roundCollisionCount += 1;
        errors.push({ code: 'same_round_collision', roundIndex, matchOffset, ids: collisions });
      }
      uniqueMembers.forEach((id) => activeInRound.add(id));
    });
  });

  return {
    valid: errors.length === 0,
    errorCount: errors.length,
    matchCount,
    rosterDuplicateIds,
    malformedMatchCount,
    duplicateMemberMatchCount,
    unknownMemberCount,
    roundCollisionCount,
    courtCapacityExceededCount,
    errors
  };
}

function classifyExecutionPath(value = {}) {
  const errorText = String(value.errorMessage || '');
  const engine = String(value.engine || '').toLowerCase();
  const profile = String(value.executionProfile || '').toLowerCase();
  const combined = `${engine} ${profile}`;
  if (errorText || profile === 'error') return 'error';
  if (combined.includes('template')) return 'template';
  if (combined.includes('legacy')) return 'legacy';
  if (combined.includes('beam')) return 'beam';
  if (combined.includes('coverage')) return 'coverage';
  if (combined.includes('fixed-pair')) return 'fixed_pair';
  if (combined.includes('greedy')) return 'greedy';
  return 'other';
}

function buildScenarioRosterIds(scenario) {
  if (!scenario || scenario.mode === 'rotation') {
    return scenarioCommon.makeRotationPlayers(Number(scenario && scenario.playersCount) || 0)
      .map((player) => player.id);
  }
  return scenarioCommon.makeSquadPlayers(
    Number(scenario.squadAPlayers) || 0,
    Number(scenario.squadBPlayers) || 0
  ).map((player) => player.id);
}

function buildRestCounts(ids, playCounts, totalRounds) {
  const rounds = Math.max(0, Number(totalRounds) || 0);
  return Object.fromEntries(ids.map((id) => [id, Math.max(0, rounds - (Number(playCounts[id]) || 0))]));
}

function scheduleDigest(schedule) {
  const rounds = schedule && Array.isArray(schedule.rounds) ? schedule.rounds : [];
  const normalized = rounds.map((round) => (round && Array.isArray(round.matches) ? round.matches : []).map((match) => ({
    teamA: match && Array.isArray(match.teamA) ? match.teamA.map(String) : [],
    teamB: match && Array.isArray(match.teamB) ? match.teamB.map(String) : []
  })));
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function buildScenarioObservation(result) {
  const scenario = result && result.scenario ? result.scenario : {};
  const out = result && result.out ? result.out : { rounds: [], schedulerMeta: {} };
  const meta = out.schedulerMeta && typeof out.schedulerMeta === 'object' ? out.schedulerMeta : {};
  const ids = buildScenarioRosterIds(scenario);
  const matches = scenarioCommon.collectMatches(out);
  const playCounts = scenarioCommon.computePlayCounts(matches, ids);
  const playCountValues = Object.values(playCounts);
  const computedPlaySpread = scenarioCommon.computeSpread(playCountValues);
  const totalRounds = Math.max(0, Number(result && result.totalRounds) || (out.rounds || []).length);
  const restCounts = buildRestCounts(ids, playCounts, totalRounds);
  const playersCount = ids.length;
  const totalMatches = Math.max(0, Number(scenario.totalMatches) || 0);
  const actualMatches = matches.length;
  const isRotation = !scenario.mode || scenario.mode === 'rotation';
  const requestedCourts = Math.max(1, Number(scenario.courts) || 1);
  const effectiveCourts = Math.max(1, Number(result && result.effectiveCourts) || Number(meta.effectiveCourts) || requestedCourts);
  const configuredRuntimeBudget = Number(scenario.options && scenario.options.runtimeBudgetMs);
  const requestedRuntimeBudgetMs = Number.isFinite(configuredRuntimeBudget)
    ? configuredRuntimeBudget
    : null;
  const effectiveRuntimeBudgetMs = isRotation
    ? Math.max(600, requestedRuntimeBudgetMs === null ? 2500 : requestedRuntimeBudgetMs)
    : null;
  const playCountTotal = playCountValues.reduce((sum, count) => sum + (Number(count) || 0), 0);
  const expectedPlayerAppearances = actualMatches * 4;
  const appearanceConserved = playCountTotal === expectedPlayerAppearances;
  const equalPlayMathematicallyPossible = isRotation && playersCount > 0
    ? ((4 * totalMatches) % playersCount === 0)
    : null;
  const equalPlayAchieved = isRotation ? (computedPlaySpread === 0 && appearanceConserved) : null;
  const engine = String(result && result.engine ? result.engine : meta.engine || '');
  const executionProfile = String(result && result.executionProfile ? result.executionProfile : meta.executionProfile || '');
  const errorMessage = String(result && result.errorMessage ? result.errorMessage : '');
  const integrity = inspectScheduleIntegrity(out, ids, { effectiveCourts });
  const theoreticalPlaySpread = isRotation && playersCount > 0
    ? scenarioCommon.theoreticalPlaySpread(playersCount, totalMatches)
    : null;

  return {
    scenarioId: String(scenario.id || ''),
    scenarioName: String(scenario.name || ''),
    mode: isRotation ? 'multi_rotate' : 'squad_doubles',
    kind: String(scenario.kind || ''),
    caseKey: String(scenario.caseKey || ''),
    playersCount,
    requestedCourts,
    effectiveCourts,
    requestedRuntimeBudgetMs,
    effectiveRuntimeBudgetMs,
    totalMatches,
    actualMatches,
    totalRounds,
    engine,
    engineVersion: String(meta.engineVersion || ''),
    executionProfile,
    pathClass: classifyExecutionPath({ engine, executionProfile, errorMessage }),
    templateKey: String(result && result.templateKey ? result.templateKey : meta.templateKey || ''),
    templateVariantId: String(meta.templateVariantId || ''),
    templateHorizon: Number(meta.templateHorizon) || 0,
    fallbackReason: String(result && result.fallbackReason ? result.fallbackReason : meta.fallbackReason || ''),
    timeoutGuardTriggered: Boolean(result && result.timeoutGuardTriggered),
    seed: Number(out.seed) || 0,
    searchElapsedMs: Number(result && result.searchElapsedMs),
    localAlgorithmMs: Number(result && result.elapsedMs) || 0,
    fairnessScore: Number(result && result.fairnessScore) || 0,
    theoreticalPlaySpread,
    playSpread: computedPlaySpread,
    playSpreadExcess: Number.isFinite(theoreticalPlaySpread)
      ? Math.max(0, computedPlaySpread - theoreticalPlaySpread)
      : null,
    equalPlayMathematicallyPossible,
    equalPlayAchieved,
    playCounts,
    playCountTotal,
    expectedPlayerAppearances,
    appearanceConserved,
    restCounts,
    restCountSpread: scenarioCommon.computeSpread(Object.values(restCounts)),
    maxRestStreak: Number(result && result.maxRestStreak) || 0,
    maxConsecutivePlay: Number(result && result.computedMaxConsecutivePlay) || Number(result && result.maxConsecutivePlay) || 0,
    uniqueExactMatchupCount: Number(result && result.computedUniqueExactMatchupCount) || Number(result && result.uniqueExactMatchupCount) || 0,
    exactRepeatCount: Number(result && result.exactRepeatCount) || 0,
    exactRepeatBaseline: Number(result && result.exactRepeatBaseline) || 0,
    exactRepeatExcess: Number(result && result.exactRepeatExcess) || 0,
    uniquePartnerPairs: Number(result && result.uniquePartnerPairs) || 0,
    uniqueOpponentPairs: Number(result && result.uniqueOpponentPairs) || 0,
    partnerRepeats: Number(result && result.partnerRepeats) || 0,
    opponentRepeats: Number(result && result.opponentRepeats) || 0,
    partnerRepeatBaseline: Number(result && result.partnerRepeatBaseline) || 0,
    opponentRepeatBaseline: Number(result && result.opponentRepeatBaseline) || 0,
    partnerRepeatExcess: Number(result && result.partnerRepeatExcess) || 0,
    opponentRepeatExcess: Number(result && result.opponentRepeatExcess) || 0,
    partnerCoveragePct: Number(result && result.partnerCoveragePct) || 0,
    opponentCoveragePct: Number(result && result.opponentCoveragePct) || 0,
    scheduleDigest: scheduleDigest(out),
    integrity,
    warnings: Array.isArray(result && result.warnings) ? result.warnings : [],
    failures: Array.isArray(result && result.failures) ? result.failures : [],
    errorMessage
  };
}

function buildCourtNormalizationScenarios(library = templateLibrary) {
  const cases = library && library.cases ? library.cases : {};
  return range(4, 24).flatMap((playersCount) => range(1, 4).map((requestedCourts) => {
    const expectedEffectiveCourts = computeEffectiveCourts(playersCount, requestedCourts);
    const expectedTemplateKey = `${playersCount}p-${expectedEffectiveCourts}c`;
    const templateCase = cases[expectedTemplateKey] || {};
    const totalMatches = Math.max(1, Math.min(12, Number(templateCase.horizonMatches) || 1));
    return {
      id: `rotation-court-normalization-${playersCount}p-${requestedCourts}requested-${expectedEffectiveCourts}effective`,
      name: `rotation court normalization ${playersCount}p/${totalMatches}m/${requestedCourts}c requested`,
      mode: 'rotation',
      kind: 'rotation_court_normalization',
      caseKey: expectedTemplateKey,
      playersCount,
      femaleCount: 0,
      totalMatches,
      targetMatches: totalMatches,
      courts: requestedCourts,
      options: { seed: 7 },
      maxElapsedMs: scenarioCommon.TEMPLATE_FAST_BOUND_MS,
      expectTemplate: true,
      expectedTemplateKey,
      expectedEffectiveCourts,
      expectedPlaySpread: scenarioCommon.theoreticalPlaySpread(playersCount, totalMatches)
    };
  }));
}

function buildOutOfTemplateScenarios() {
  return [
    {
      id: 'rotation-outside-template-20p-5c',
      name: 'rotation outside template band 20p/12m/5c',
      playersCount: 20,
      totalMatches: 12,
      courts: 5,
      expectedEffectiveCourts: 5,
      runtimeBudgetMs: 600
    },
    {
      id: 'rotation-outside-template-24p-6c',
      name: 'rotation outside template band 24p/12m/6c',
      playersCount: 24,
      totalMatches: 12,
      courts: 6,
      expectedEffectiveCourts: 6,
      runtimeBudgetMs: 600
    },
    {
      id: 'rotation-outside-template-24p-6c-legacy-window',
      name: 'rotation outside template band 24p/12m/6c legacy window',
      playersCount: 24,
      totalMatches: 12,
      courts: 6,
      expectedEffectiveCourts: 6,
      runtimeBudgetMs: 800
    },
    {
      id: 'rotation-outside-template-25p-4c',
      name: 'rotation outside roster template band 25p/12m/4c',
      playersCount: 25,
      totalMatches: 12,
      courts: 4,
      expectedEffectiveCourts: 4,
      runtimeBudgetMs: 600
    }
  ].map((entry) => ({
    ...entry,
    mode: 'rotation',
    kind: 'rotation_out_of_template',
    caseKey: `${entry.playersCount}p-${entry.expectedEffectiveCourts}c`,
    femaleCount: 0,
    targetMatches: entry.totalMatches,
    options: { seed: 7, searchSeeds: 1, runtimeBudgetMs: entry.runtimeBudgetMs },
    maxElapsedMs: scenarioCommon.ROTATION_LONGTAIL_BOUND_MS
  }));
}

function runObservedScenario(scenario) {
  try {
    const result = scenarioCommon.runScenario(scenario);
    const evaluation = scenarioCommon.evaluateScenario(result);
    return buildScenarioObservation({
      ...result,
      warnings: evaluation.warnings,
      failures: evaluation.failures
    });
  } catch (error) {
    const playersCount = Number(scenario && scenario.playersCount) || 0;
    const configuredRuntimeBudget = Number(scenario && scenario.options && scenario.options.runtimeBudgetMs);
    const requestedRuntimeBudgetMs = Number.isFinite(configuredRuntimeBudget)
      ? configuredRuntimeBudget
      : null;
    return {
      scenarioId: String(scenario && scenario.id ? scenario.id : ''),
      scenarioName: String(scenario && scenario.name ? scenario.name : ''),
      mode: 'multi_rotate',
      kind: String(scenario && scenario.kind ? scenario.kind : ''),
      caseKey: String(scenario && scenario.caseKey ? scenario.caseKey : ''),
      playersCount,
      requestedCourts: Math.max(1, Number(scenario && scenario.courts) || 1),
      effectiveCourts: playersCount >= 4
        ? computeEffectiveCourts(playersCount, Number(scenario && scenario.courts) || 1)
        : 0,
      requestedRuntimeBudgetMs,
      effectiveRuntimeBudgetMs: Math.max(600, requestedRuntimeBudgetMs === null ? 2500 : requestedRuntimeBudgetMs),
      totalMatches: Number(scenario && scenario.totalMatches) || 0,
      actualMatches: 0,
      engine: '',
      engineVersion: '',
      executionProfile: 'error',
      pathClass: 'error',
      templateKey: '',
      fallbackReason: error && error.message ? String(error.message) : 'unknown error',
      errorMessage: error && error.message ? String(error.message) : 'unknown error',
      integrity: { valid: false, errorCount: 1, errors: [{ code: 'runtime_error' }] },
      warnings: [],
      failures: [{ code: 'runtime_error', message: error && error.message ? String(error.message) : 'unknown error' }]
    };
  }
}

function buildInvalidInputProbeRecords() {
  const duplicatePlayers = scenarioCommon.makeRotationPlayers(4);
  duplicatePlayers[3] = { ...duplicatePlayers[3], id: duplicatePlayers[2].id };
  const probes = [
    {
      id: 'invalid-less-than-four-players',
      label: '3 players cannot form a doubles match',
      errorClass: 'insufficient_roster',
      players: scenarioCommon.makeRotationPlayers(3),
      totalMatches: 1,
      courts: 1
    },
    {
      id: 'invalid-duplicate-player-id',
      label: 'duplicate roster ids are rejected',
      errorClass: 'duplicate_roster',
      players: duplicatePlayers,
      totalMatches: 1,
      courts: 1
    }
  ];

  return probes.map((probe) => {
    try {
      const out = generateSchedule(probe.players, probe.totalMatches, probe.courts, { seed: 7 });
      return {
        scenarioId: probe.id,
        scenarioName: probe.label,
        kind: 'invalid_input_probe',
        playersCount: probe.players.length,
        requestedCourts: probe.courts,
        totalMatches: probe.totalMatches,
        pathClass: classifyExecutionPath(out.schedulerMeta || {}),
        outcome: 'unexpected_schedule',
        errorClass: probe.errorClass,
        errorMessage: ''
      };
    } catch (error) {
      return {
        scenarioId: probe.id,
        scenarioName: probe.label,
        mode: 'multi_rotate',
        kind: 'invalid_input_probe',
        playersCount: probe.players.length,
        requestedCourts: probe.courts,
        effectiveCourts: probe.players.length >= 4
          ? computeEffectiveCourts(probe.players.length, probe.courts)
          : 0,
        totalMatches: probe.totalMatches,
        actualMatches: 0,
        engine: '',
        engineVersion: '',
        executionProfile: 'error',
        pathClass: 'error',
        templateKey: '',
        fallbackReason: error && error.message ? String(error.message) : 'unknown error',
        outcome: 'no_legal_result',
        errorClass: probe.errorClass,
        errorMessage: error && error.message ? String(error.message) : 'unknown error'
      };
    }
  });
}

function summarizePathCounts(rows) {
  const counts = {};
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = String(row && row.pathClass ? row.pathClass : 'other');
    counts[key] = (counts[key] || 0) + 1;
  });
  const sortedCounts = Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, 'en')));
  const total = Array.isArray(rows) ? rows.length : 0;
  const classified = Object.values(sortedCounts).reduce((sum, count) => sum + count, 0);
  return {
    total,
    classified,
    conserved: total === classified,
    counts: sortedCounts
  };
}

function summarizePathStabilityRuns(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const pathCounts = summarizePathCounts(list).counts;
  const profileCounts = {};
  const fallbackReasonCounts = {};
  list.forEach((row) => {
    const profile = String(row && row.executionProfile ? row.executionProfile : '<empty>');
    const reason = String(row && row.fallbackReason ? row.fallbackReason : '<empty>');
    profileCounts[profile] = (profileCounts[profile] || 0) + 1;
    fallbackReasonCounts[reason] = (fallbackReasonCounts[reason] || 0) + 1;
  });
  const observedPathClasses = Object.keys(pathCounts).sort((left, right) => left.localeCompare(right, 'en'));
  return {
    runs: list.length,
    stablePath: observedPathClasses.length <= 1,
    observedPathClasses,
    pathCounts,
    profileCounts: Object.fromEntries(Object.entries(profileCounts).sort(([left], [right]) => left.localeCompare(right, 'en'))),
    fallbackReasonCounts: Object.fromEntries(Object.entries(fallbackReasonCounts).sort(([left], [right]) => left.localeCompare(right, 'en'))),
    successfulRuns: list.filter((row) => row.pathClass !== 'error').length,
    errorRuns: list.filter((row) => row.pathClass === 'error').length
  };
}

function runPathStabilityAudit(scenarios, repeats = 5) {
  const normalizedRepeats = Math.max(2, Math.floor(Number(repeats) || 5));
  return (Array.isArray(scenarios) ? scenarios : []).map((scenario) => {
    const results = range(1, normalizedRepeats).map(() => runObservedScenario(scenario));
    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      playersCount: scenario.playersCount,
      requestedCourts: scenario.courts,
      expectedEffectiveCourts: scenario.expectedEffectiveCourts,
      requestedRuntimeBudgetMs: scenario.options && scenario.options.runtimeBudgetMs,
      summary: summarizePathStabilityRuns(results),
      results
    };
  });
}

function roundMs(value) {
  return Number((Number(value) || 0).toFixed(3));
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return 0;
  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * ratio) - 1));
  return sortedValues[index];
}

function summarizeDurations(values) {
  const sorted = (Array.isArray(values) ? values : [])
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!sorted.length) {
    return { samples: 0, minMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0 };
  }
  return {
    samples: sorted.length,
    minMs: roundMs(sorted[0]),
    medianMs: roundMs(percentile(sorted, 0.5)),
    p95Ms: roundMs(percentile(sorted, 0.95)),
    maxMs: roundMs(sorted[sorted.length - 1])
  };
}

function extractTimingPhaseFields(source) {
  const text = String(source || '');
  const phases = {};
  const logPattern = /console\.info\(\s*['"]\[startTournament:timing\]['"]\s*,\s*JSON\.stringify\(\s*\{([\s\S]*?)\}\s*\)\s*\)/g;
  let match = logPattern.exec(text);
  while (match) {
    const body = match[1];
    const phaseMatch = body.match(/\bphase\s*:\s*['"]([^'"]+)['"]/);
    if (phaseMatch) {
      const fields = new Set();
      const propertyPattern = /(?:^|,|\n)\s*([A-Za-z_$][\w$]*)\s*(?=:|,|\n|$)/g;
      let propertyMatch = propertyPattern.exec(body);
      while (propertyMatch) {
        fields.add(propertyMatch[1]);
        propertyMatch = propertyPattern.exec(body);
      }
      phases[phaseMatch[1]] = [...fields].sort((left, right) => left.localeCompare(right, 'en'));
    }
    match = logPattern.exec(text);
  }
  return phases;
}

function buildTimingFieldAudit(source) {
  const phases = extractTimingPhaseFields(source);
  const doneFields = new Set(phases.done || []);
  const fieldRows = DONE_TIMING_FIELDS.map((field) => ({
    field,
    presentInPhases: Object.entries(phases)
      .filter(([, fields]) => fields.includes(field))
      .map(([phase]) => phase)
      .sort((left, right) => left.localeCompare(right, 'en')),
    presentInDone: doneFields.has(field)
  }));
  return {
    phases,
    requiredDoneFields: DONE_TIMING_FIELDS.slice(),
    missingDoneFields: DONE_TIMING_FIELDS.filter((field) => !doneFields.has(field)),
    fields: fieldRows
  };
}

function isPopulatedMetaValue(value) {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

function describeSchedulerMeta(mode, output) {
  const meta = output && output.schedulerMeta && typeof output.schedulerMeta === 'object'
    ? output.schedulerMeta
    : {};
  const fields = [
    'engineVersion',
    'engine',
    'executionProfile',
    'templateKey',
    'fallbackReason',
    'searchElapsedMs',
    'effectiveCourts'
  ];
  return {
    mode,
    fields: Object.fromEntries(fields.map((field) => [field, {
      present: Object.prototype.hasOwnProperty.call(meta, field),
      populated: isPopulatedMetaValue(meta[field]),
      value: meta[field] ?? null
    }]))
  };
}

function buildSchedulerMetaModeAudit() {
  const rotationOutput = generateSchedule(scenarioCommon.makeRotationPlayers(8), 8, 2, { seed: 7 });
  const squadOutput = buildSquadSchedule(
    scenarioCommon.makeSquadPlayers(4, 4),
    12,
    1,
    { endCondition: { type: 'total_matches', target: 12 }, _seed: 1 }
  );
  const fixedPlayers = [];
  const pairTeams = [];
  for (let index = 0; index < 4; index += 1) {
    const firstId = `F${index * 2 + 1}`;
    const secondId = `F${index * 2 + 2}`;
    fixedPlayers.push({ id: firstId, name: firstId }, { id: secondId, name: secondId });
    pairTeams.push({
      id: `fixed-team-${index + 1}`,
      name: `Fixed Team ${index + 1}`,
      playerIds: [firstId, secondId]
    });
  }
  const fixedOutput = buildFixedPairSchedule(fixedPlayers, 2, pairTeams, { totalMatches: 6 });

  return [
    describeSchedulerMeta('multi_rotate', rotationOutput),
    describeSchedulerMeta('squad_doubles', squadOutput),
    describeSchedulerMeta('fixed_pair_rr', fixedOutput)
  ];
}

function buildBenchmarkScenarios() {
  const templateScenarios = [
    { playersCount: 6, totalMatches: 12, courts: 1 },
    { playersCount: 16, totalMatches: 12, courts: 4 },
    { playersCount: 24, totalMatches: 12, courts: 2 }
  ].map((entry) => ({
    id: `benchmark-template-${entry.playersCount}p-${entry.totalMatches}m-${entry.courts}c`,
    name: `template ${entry.playersCount}p/${entry.totalMatches}m/${entry.courts}c`,
    mode: 'rotation',
    kind: 'benchmark_template',
    caseKey: `${entry.playersCount}p-${entry.courts}c`,
    playersCount: entry.playersCount,
    femaleCount: 0,
    totalMatches: entry.totalMatches,
    targetMatches: entry.totalMatches,
    courts: entry.courts,
    options: { seed: 7 },
    maxElapsedMs: scenarioCommon.TEMPLATE_FAST_BOUND_MS,
    expectTemplate: true,
    expectedTemplateKey: `${entry.playersCount}p-${entry.courts}c`,
    expectedPlaySpread: scenarioCommon.theoreticalPlaySpread(entry.playersCount, entry.totalMatches)
  }));
  return templateScenarios.concat(scenarioCommon.buildRotationLongTailAuditScenarios().map((scenario) => ({
    ...scenario,
    id: `benchmark-${scenario.id}`,
    name: scenario.name.replace(/^rotation longtail /, 'beam '),
    kind: 'benchmark_dynamic'
  })));
}

function qualityDigest(record) {
  return crypto.createHash('sha256').update(JSON.stringify({
    actualMatches: record.actualMatches,
    playCounts: record.playCounts,
    playSpread: record.playSpread,
    maxConsecutivePlay: record.maxConsecutivePlay,
    partnerRepeats: record.partnerRepeats,
    opponentRepeats: record.opponentRepeats,
    restCounts: record.restCounts,
    engine: record.engine,
    executionProfile: record.executionProfile,
    templateKey: record.templateKey,
    fallbackReason: record.fallbackReason
  })).digest('hex');
}

function benchmarkScenario(scenario, repeats, warmups) {
  const normalizedRepeats = Math.max(2, Math.floor(Number(repeats) || DEFAULT_BENCHMARK_REPEATS));
  const normalizedWarmups = Math.max(0, Math.floor(Number(warmups) || 0));
  for (let index = 0; index < normalizedWarmups; index += 1) {
    scenarioCommon.runScenario(scenario);
  }

  const sampleMs = [];
  const records = [];
  for (let index = 0; index < normalizedRepeats; index += 1) {
    const startedAt = performance.now();
    const result = scenarioCommon.runScenario(scenario);
    const duration = performance.now() - startedAt;
    sampleMs.push(roundMs(duration));
    records.push(buildScenarioObservation(result));
  }
  const pathClasses = [...new Set(records.map((record) => record.pathClass))];
  const qualityDigests = [...new Set(records.map(qualityDigest))];
  const scheduleDigests = [...new Set(records.map((record) => record.scheduleDigest))];
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    kind: scenario.kind,
    playersCount: Number(scenario.playersCount) || 0,
    requestedCourts: Number(scenario.courts) || 0,
    totalMatches: Number(scenario.totalMatches) || 0,
    requestedRuntimeBudgetMs: records[0] ? records[0].requestedRuntimeBudgetMs : null,
    effectiveRuntimeBudgetMs: records[0] ? records[0].effectiveRuntimeBudgetMs : null,
    warmups: normalizedWarmups,
    repeats: normalizedRepeats,
    timer: 'node:perf_hooks.performance.now',
    pathClass: pathClasses.length === 1 ? pathClasses[0] : 'mixed',
    engine: records[0] ? records[0].engine : '',
    executionProfile: records[0] ? records[0].executionProfile : '',
    templateKey: records[0] ? records[0].templateKey : '',
    fallbackReason: records[0] ? records[0].fallbackReason : '',
    sampleMs,
    duration: summarizeDurations(sampleMs),
    deterministicQuality: qualityDigests.length === 1,
    deterministicSchedule: scheduleDigests.length === 1,
    qualityDigestCount: qualityDigests.length,
    scheduleDigestCount: scheduleDigests.length,
    integrityFailures: records.filter((record) => !record.integrity.valid).length
  };
}

function summarizeBenchmarkGroups(rows) {
  const grouped = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = String(row.pathClass || 'other');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(...(row.sampleMs || []));
  });
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([pathClass, samples]) => ({ pathClass, ...summarizeDurations(samples) }));
}

function buildTemplateDeterminismRows(matrix) {
  return (Array.isArray(matrix) ? matrix : []).map((entry) => {
    const totalMatches = entry.horizonMatches;
    const buildScenario = (seed) => ({
      id: `determinism-${entry.templateKey}-${seed}`,
      name: `determinism ${entry.templateKey}@${totalMatches} seed=${seed}`,
      mode: 'rotation',
      kind: 'template_determinism',
      caseKey: entry.templateKey,
      playersCount: entry.playersCount,
      femaleCount: 0,
      totalMatches,
      targetMatches: totalMatches,
      courts: entry.effectiveCourts,
      options: { seed },
      maxElapsedMs: scenarioCommon.TEMPLATE_FAST_BOUND_MS,
      expectTemplate: true,
      expectedTemplateKey: entry.templateKey,
      expectedPlaySpread: scenarioCommon.theoreticalPlaySpread(entry.playersCount, totalMatches)
    });
    const first = buildScenarioObservation(scenarioCommon.runScenario(buildScenario(7)));
    const second = buildScenarioObservation(scenarioCommon.runScenario(buildScenario(7)));
    const alternate = buildScenarioObservation(scenarioCommon.runScenario(buildScenario(17)));
    return {
      templateKey: entry.templateKey,
      totalMatches,
      sameSeedReproducible: first.scheduleDigest === second.scheduleDigest,
      sameSeedQualityStable: qualityDigest(first) === qualityDigest(second),
      crossSeedRouteStable: first.pathClass === alternate.pathClass && alternate.pathClass === 'template',
      crossSeedTemplateKeyStable: first.templateKey === alternate.templateKey && alternate.templateKey === entry.templateKey,
      crossSeedScheduleSame: first.scheduleDigest === alternate.scheduleDigest,
      seed7VariantId: first.templateVariantId,
      seed17VariantId: alternate.templateVariantId,
      integrityValid: first.integrity.valid && second.integrity.valid && alternate.integrity.valid
    };
  });
}

function classifySourceTreeState(dirtyPaths) {
  const normalized = [...new Set((Array.isArray(dirtyPaths) ? dirtyPaths : [])
    .map(normalizeRepoPath)
    .filter(Boolean))].sort((left, right) => left.localeCompare(right, 'en'));
  const expectedAuditDirtyPaths = normalized.filter((filePath) => EXPECTED_AUDIT_DIRTY_PATHS.has(filePath));
  const productionSchedulerDirtyPaths = normalized.filter((filePath) => (
    filePath.startsWith('cloudfunctions/startTournament/')
    || PRODUCTION_SCHEDULER_PATHS.has(filePath)
  ));
  const unexpectedDirtyPaths = normalized.filter((filePath) => (
    !EXPECTED_AUDIT_DIRTY_PATHS.has(filePath)
    && !filePath.startsWith('cloudfunctions/startTournament/')
    && !PRODUCTION_SCHEDULER_PATHS.has(filePath)
  ));
  let state = 'clean';
  if (normalized.length && !productionSchedulerDirtyPaths.length && !unexpectedDirtyPaths.length) {
    state = 'dirty_expected_audit_only';
  } else if (normalized.length) {
    state = 'dirty_unexpected';
  }
  const productionSchedulerSourceClean = productionSchedulerDirtyPaths.length === 0;
  const explanation = state === 'clean'
    ? '审计启动时 Git worktree 干净。'
    : state === 'dirty_expected_audit_only'
      ? '审计启动时只有 allowlist 内的 P02 脚本、测试、任务卡或生成证据有改动；production scheduler 源码相对 HEAD 干净。'
      : '审计启动时发现 production scheduler 或非预期脏路径。';
  return {
    state,
    dirtyPaths: normalized,
    expectedAuditDirtyPaths,
    productionSchedulerDirtyPaths,
    unexpectedDirtyPaths,
    productionSchedulerSourceClean,
    explanation
  };
}

function parseGitStatusPorcelainZ(output) {
  const tokens = String(output || '').split('\0');
  const paths = [];
  let index = 0;
  while (index < tokens.length) {
    const entry = tokens[index];
    index += 1;
    if (!entry) continue;
    const status = entry.slice(0, 2);
    const filePath = entry.slice(3);
    if (filePath) paths.push(filePath);
    if (/[RC]/.test(status) && tokens[index]) {
      paths.push(tokens[index]);
      index += 1;
    }
  }
  return paths;
}

function getGitMetadata() {
  function runGit(args) {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  }
  const status = execFileSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  const dirtyPaths = parseGitStatusPorcelainZ(status);
  return {
    head: runGit(['rev-parse', '--short', 'HEAD']),
    branch: runGit(['branch', '--show-current']),
    sourceTreeAtAuditStart: classifySourceTreeState(dirtyPaths),
    auditScriptSha256: sha256File(__filename)
  };
}

function isGitIgnored(filePath) {
  try {
    execFileSync('git', ['check-ignore', '--no-index', '--quiet', path.resolve(filePath)], {
      cwd: REPO_ROOT,
      stdio: 'ignore'
    });
    return true;
  } catch (error) {
    if (Number(error && error.status) === 1) return false;
    throw error;
  }
}

function getRuntimeEnvironment(repeats, warmups) {
  const cpus = os.cpus();
  return {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    osRelease: os.release(),
    cpuModel: cpus[0] ? String(cpus[0].model || '').replace(/\s+/g, ' ').trim() : '',
    logicalCpuCount: cpus.length,
    timer: 'node:perf_hooks.performance.now',
    benchmarkRepeats: repeats,
    benchmarkWarmups: warmups
  };
}

function buildProductionSchedulerSourceHashes() {
  const root = path.join(REPO_ROOT, 'cloudfunctions/startTournament');
  const files = [];
  function visit(directory) {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      if (entry.name === 'node_modules') return;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile() && /\.(?:js|json)$/.test(entry.name)) files.push(absolutePath);
    });
  }
  visit(root);
  return Object.fromEntries(files
    .map((absolutePath) => normalizeRepoPath(path.relative(REPO_ROOT, absolutePath)))
    .sort((left, right) => left.localeCompare(right, 'en'))
    .map((relativePath) => [relativePath, sha256File(path.join(REPO_ROOT, relativePath))]));
}

function buildFairnessSummary(records) {
  const rows = Array.isArray(records) ? records : [];
  const possible = rows.filter((row) => row.equalPlayMathematicallyPossible === true);
  const impossible = rows.filter((row) => row.equalPlayMathematicallyPossible === false);
  return {
    scenarios: rows.length,
    integrityFailureScenarios: rows.filter((row) => !row.integrity.valid).length,
    appearanceConservationFailures: rows.filter((row) => !row.appearanceConserved).length,
    equalPlayMathematicallyPossible: possible.length,
    equalPlayPossibleButNotAchieved: possible.filter((row) => !row.equalPlayAchieved).length,
    equalPlayMathematicallyImpossible: impossible.length,
    impossibleButClaimedEqual: impossible.filter((row) => row.equalPlayAchieved).length,
    playSpreadExcessScenarios: rows.filter((row) => Number(row.playSpreadExcess) > 0).length,
    maxPlaySpread: Math.max(0, ...rows.map((row) => Number(row.playSpread) || 0)),
    maxConsecutivePlay: Math.max(0, ...rows.map((row) => Number(row.maxConsecutivePlay) || 0)),
    maxRestCountSpread: Math.max(0, ...rows.map((row) => Number(row.restCountSpread) || 0)),
    maxPartnerRepeats: Math.max(0, ...rows.map((row) => Number(row.partnerRepeats) || 0)),
    maxOpponentRepeats: Math.max(0, ...rows.map((row) => Number(row.opponentRepeats) || 0))
  };
}

function buildAuditData(options = {}) {
  const repeats = Math.max(2, Math.floor(Number(options.repeats) || DEFAULT_BENCHMARK_REPEATS));
  const warmups = Math.max(0, Math.floor(Number(options.warmups) || DEFAULT_BENCHMARK_WARMUPS));
  const templateMatrix = buildTemplateCoverageMatrix(templateLibrary);
  const templateScenarios = scenarioCommon.buildRotationTemplateAuditScenarios();
  const templateResults = templateScenarios.map(runObservedScenario);
  const courtNormalizationScenarios = buildCourtNormalizationScenarios(templateLibrary);
  const courtNormalizationResults = courtNormalizationScenarios.map(runObservedScenario);
  const dynamicResults = scenarioCommon.buildRotationLongTailAuditScenarios().map(runObservedScenario);
  const outOfTemplateScenarios = buildOutOfTemplateScenarios();
  const outOfTemplatePathStability = runPathStabilityAudit(outOfTemplateScenarios, 5);
  const outOfTemplateResults = outOfTemplatePathStability.map((row) => row.results[0]);
  const invalidInputResults = buildInvalidInputProbeRecords();
  const pathRows = templateResults
    .concat(courtNormalizationResults)
    .concat(dynamicResults)
    .concat(outOfTemplateResults)
    .concat(invalidInputResults);
  const determinismRows = buildTemplateDeterminismRows(templateMatrix);
  const benchmarkRows = buildBenchmarkScenarios().map((scenario) => benchmarkScenario(scenario, repeats, warmups));
  const timingSource = fs.readFileSync(path.join(REPO_ROOT, 'cloudfunctions/startTournament/index.js'), 'utf8');
  const timingFieldAudit = buildTimingFieldAudit(timingSource);
  const templateRegistryIssueCount = templateMatrix.reduce((sum, row) => sum
    + row.missingMatchCounts.length
    + row.invalidVariantMatchCounts.length
    + row.insufficientVariantMatchCounts.length, 0);
  const templateAuditFailureCount = templateResults.filter((row) => (
    row.pathClass !== 'template'
    || row.templateKey !== row.caseKey
    || row.actualMatches !== row.totalMatches
    || !row.integrity.valid
    || !row.appearanceConserved
  )).length;
  const courtNormalizationFailureCount = courtNormalizationResults.filter((row, index) => {
    const scenario = courtNormalizationScenarios[index];
    return row.effectiveCourts !== scenario.expectedEffectiveCourts
      || row.templateKey !== scenario.expectedTemplateKey
      || row.pathClass !== 'template'
      || !row.integrity.valid;
  }).length;
  const legacyObservedValidScenarios = outOfTemplatePathStability
    .filter((row) => Number(row.summary.pathCounts.legacy) > 0).length;
  const legacyObservedValidRuns = outOfTemplatePathStability
    .reduce((sum, row) => sum + (Number(row.summary.pathCounts.legacy) || 0), 0);
  const performanceSummary = {
    scenarios: benchmarkRows.length,
    deterministicScheduleFailures: benchmarkRows.filter((row) => !row.deterministicSchedule).length,
    deterministicQualityFailures: benchmarkRows.filter((row) => !row.deterministicQuality).length,
    integrityFailures: benchmarkRows.reduce((sum, row) => sum + row.integrityFailures, 0)
  };
  const git = options.sourceGitMetadata || getGitMetadata();
  const p01CoverageMapping = buildP01CoverageMapping(options.p01Evidence || null, templateMatrix);

  return {
    schemaVersion: 'scheduler-observability-full-v2',
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedFromHead: git.head,
      branch: git.branch,
      sourceTreeAtAuditStart: git.sourceTreeAtAuditStart,
      auditScriptSha256: git.auditScriptSha256,
      productionSchedulerSourceSha256: buildProductionSchedulerSourceHashes(),
      templateLibraryVersion: String(templateLibrary.version || ''),
      runtime: getRuntimeEnvironment(repeats, warmups)
    },
    boundaries: {
      productionSchedulerFilesModified: !git.sourceTreeAtAuditStart.productionSchedulerSourceClean,
      templatesAddedOrRefreshed: false,
      realTournamentDataRead: false,
      realCloudDataWritten: false,
      cloudFunctionDeployed: false,
      miniProgramPreviewOrUpload: false,
      remoteGitOperation: false
    },
    templateCoverage: {
      summary: {
        templateKeys: templateMatrix.length,
        templateVariants: templateMatrix.reduce((sum, row) => sum + row.variantCount, 0),
        supportedMatchPrefixes: templateMatrix.reduce((sum, row) => sum + row.supportedMatchCount, 0),
        registryIssueCount: templateRegistryIssueCount,
        auditedPrefixScenarios: templateResults.length,
        auditFailureCount: templateAuditFailureCount
      },
      matrix: templateMatrix,
      scenarioResults: templateResults
    },
    pathAudit: {
      summary: summarizePathCounts(pathRows),
      courtNormalization: {
        scenarios: courtNormalizationResults.length,
        failures: courtNormalizationFailureCount,
        results: courtNormalizationResults
      },
      dynamicFallbackResults: dynamicResults,
      outOfTemplateResults,
      outOfTemplatePathStability,
      invalidInputResults,
      legacyPath: {
        observedValidScenarios: legacyObservedValidScenarios,
        observedValidRuns: legacyObservedValidRuns,
        implementationPresent: true,
        conclusion: legacyObservedValidScenarios > 0
          ? `当前有效审计中有 ${legacyObservedValidScenarios} 个场景、${legacyObservedValidRuns} 次运行实际命中 legacy；它是 beam 无可用结果时的保护路径。`
          : '当前有效审计场景未命中 legacy；它仍是 beam 无可用结果时的保护路径，不能据此宣称已移除。'
      }
    },
    fairnessAudit: {
      summary: buildFairnessSummary(templateResults),
      note: '绝对等场仅在 4 × totalMatches % playersCount == 0 时才被视为数学上可能；公平性、重复、连场、轮空与性能分别记录。'
    },
    determinismAudit: {
      summary: {
        templateKeys: determinismRows.length,
        sameSeedScheduleFailures: determinismRows.filter((row) => !row.sameSeedReproducible).length,
        sameSeedQualityFailures: determinismRows.filter((row) => !row.sameSeedQualityStable).length,
        crossSeedRouteFailures: determinismRows.filter((row) => !row.crossSeedRouteStable || !row.crossSeedTemplateKeyStable).length,
        crossSeedScheduleDifferences: determinismRows.filter((row) => !row.crossSeedScheduleSame).length,
        integrityFailures: determinismRows.filter((row) => !row.integrityValid).length
      },
      rows: determinismRows
    },
    performance: {
      scope: {
        localAlgorithm: 'measured',
        materialize: 'not_measured_no_cloud_transaction',
        write: 'not_measured_no_real_cloud_write',
        endToEnd: 'not_measured_no_cloud_invocation',
        note: '本地 benchmark 只测排阵算法；materialize/write/total 只核对生产 timing 字段，未伪装成本地端到端数据。'
      },
      environment: getRuntimeEnvironment(repeats, warmups),
      summary: performanceSummary,
      benchmarks: benchmarkRows,
      groups: summarizeBenchmarkGroups(benchmarkRows)
    },
    timingFieldAudit,
    schedulerMetaModeAudit: buildSchedulerMetaModeAudit(),
    timingSemantics: {
      scheduleMs: '排阵生成加完整性校验；不含此前的 policy/profile 计算。',
      materializeMs: 'round/player 对象物化；idToPlayerMap 在计时开始前。',
      writeMs: '赛事更新及可选 client request log；不含 transaction callback 返回后的工作。',
      totalMs: '截至 transaction callback 内写入完成；不含后置分享消息更新，因此不是严格云函数端到端。',
      failureSampling: '去重提前返回、排阵异常与写入异常没有统一 done timing，生产分布存在成功样本偏差。'
    },
    p01CoverageMapping,
    recommendations: [
      'P01 当前只公开 180d 精确 Pareto；90d 逐行明细未进入公开 evidence，后续不得从 family 聚合反推所有 totalMatches 前缀。',
      '未来模板候选只限当前 live registry 未覆盖的 multi_rotate 前缀；fixed_pair_rr、squad_doubles 与 unknown 不计为 rotation template 缺口。',
      '若要在生产日志计算 engine/version/fallback 分布，另行审批后最小补充 engineVersion、fallbackReason、searchElapsedMs；本任务不修改生产文件。',
      '将超过模板 horizon 的 dynamic 场景作为 beam/guarded 回归基线，不再用实际命中模板的场景冒充 fallback。',
      '动态路径受真实时钟 deadline 影响；性能采样中若同 seed 的排阵或质量 digest 不一致，只作为负载敏感风险，不据此改写确定性公平性结论。',
      `legacy 是有效安全路径，本轮有 ${legacyObservedValidScenarios} 个场景、${legacyObservedValidRuns} 次运行命中；后续若修改 fallback 政策，需单独审批和回归。`
    ]
  };
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function markdownTable(columns, rows) {
  const header = `| ${columns.map((column) => escapeCell(column.label)).join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = (rows.length ? rows : [{ empty: 'none' }]).map((row) => (
    `| ${columns.map((column) => escapeCell(row[column.key] ?? '')).join(' | ')} |`
  ));
  return [header, separator, ...body].join('\n');
}

function compactPathRecord(row) {
  return {
    scenarioId: row.scenarioId,
    scenarioName: row.scenarioName,
    mode: row.mode,
    playersCount: row.playersCount,
    requestedCourts: row.requestedCourts,
    effectiveCourts: row.effectiveCourts,
    totalMatches: row.totalMatches,
    actualMatches: row.actualMatches,
    pathClass: row.pathClass,
    engine: row.engine,
    engineVersion: row.engineVersion,
    executionProfile: row.executionProfile,
    templateKey: row.templateKey,
    fallbackReason: row.fallbackReason,
    requestedRuntimeBudgetMs: row.requestedRuntimeBudgetMs,
    effectiveRuntimeBudgetMs: row.effectiveRuntimeBudgetMs,
    playSpread: row.playSpread,
    maxConsecutivePlay: row.maxConsecutivePlay,
    restCountSpread: row.restCountSpread,
    partnerRepeats: row.partnerRepeats,
    opponentRepeats: row.opponentRepeats,
    equalPlayMathematicallyPossible: row.equalPlayMathematicallyPossible,
    equalPlayAchieved: row.equalPlayAchieved,
    appearanceConserved: row.appearanceConserved,
    integrityValid: Boolean(row.integrity && row.integrity.valid)
  };
}

function compactP01Combination(row) {
  return {
    mode: row.mode,
    playersCount: row.playersCount,
    requestedCourts: row.requestedCourts,
    effectiveCourts: row.effectiveCourts,
    totalMatches: row.totalMatches,
    count: row.count,
    sourceExactRows: row.sourceExactRows,
    currentTemplateKey: row.currentTemplateKey,
    currentTemplateKeyPresent: row.currentTemplateKeyPresent,
    currentTemplateHorizonMatches: row.currentTemplateHorizonMatches,
    currentPrefixSupported: row.currentPrefixSupported,
    currentPrefixKind: row.currentPrefixKind,
    currentPathContract: row.currentPathContract,
    equalPlayMathematicallyPossible: row.equalPlayMathematicallyPossible,
    futureTemplateDisposition: row.futureTemplateDisposition
  };
}

function compactP01CoverageMapping(mapping) {
  if (!mapping || !mapping.windows || !mapping.windows['180d']) return mapping;
  const window180 = mapping.windows['180d'];
  const stable = window180.stableHighFrequency || {};
  return {
    status: mapping.status,
    source: mapping.source,
    methodology: mapping.methodology,
    windows: {
      '90d': mapping.windows['90d'],
      '180d': {
        detailAvailability: window180.detailAvailability,
        startedPopulation: window180.startedPopulation,
        classifiableCount: window180.classifiableCount,
        classifiableRate: window180.classifiableRate,
        pareto80: window180.pareto80,
        stableHighFrequency: {
          sourceExactRows: stable.sourceExactRows,
          decisionCombinations: stable.decisionCombinations,
          eventCount: stable.eventCount,
          summary: stable.summary,
          combinations: (stable.combinations || []).map(compactP01Combination),
          futureTemplateCandidates: (stable.futureTemplateCandidates || []).map(compactP01Combination)
        }
      }
    },
    conclusion: mapping.conclusion
  };
}

function buildStableInvariantDigest(report) {
  const compactP01 = compactP01CoverageMapping(report.p01CoverageMapping);
  const payload = {
    auditScriptSha256: report.metadata.auditScriptSha256,
    templateLibraryVersion: report.metadata.templateLibraryVersion,
    productionSchedulerSourceSha256: report.metadata.productionSchedulerSourceSha256,
    boundaries: report.boundaries,
    templateCoverage: {
      summary: report.templateCoverage.summary,
      matrix: report.templateCoverage.matrix.map((row) => ({
        templateKey: row.templateKey,
        playersCount: row.playersCount,
        effectiveCourts: row.effectiveCourts,
        horizonMatches: row.horizonMatches,
        variantCount: row.variantCount,
        supportedMatchCount: row.supportedMatchCount,
        issueCount: row.missingMatchCounts.length
          + row.invalidVariantMatchCounts.length
          + row.insufficientVariantMatchCounts.length
      }))
    },
    fairnessAudit: report.fairnessAudit,
    determinismAudit: report.determinismAudit.summary,
    timingFieldAudit: report.timingFieldAudit,
    schedulerMetaModeAudit: report.schedulerMetaModeAudit,
    p01CoverageMapping: compactP01
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function buildCompactAuditSummary(report, fullArtifact) {
  const compactMatrix = report.templateCoverage.matrix.map((row) => ({
    templateKey: row.templateKey,
    templateLibraryVersion: row.templateLibraryVersion,
    playersCount: row.playersCount,
    effectiveCourts: row.effectiveCourts,
    horizonMatches: row.horizonMatches,
    variantCount: row.variantCount,
    supportedMatchCount: row.supportedMatchCount,
    supportedPrefixMin: row.supportedMatchCounts.length ? Math.min(...row.supportedMatchCounts) : null,
    supportedPrefixMax: row.supportedMatchCounts.length ? Math.max(...row.supportedMatchCounts) : null,
    issueCount: row.missingMatchCounts.length
      + row.invalidVariantMatchCounts.length
      + row.insufficientVariantMatchCounts.length
  }));
  const compactBenchmarks = report.performance.benchmarks.map((row) => {
    const compact = { ...row };
    delete compact.sampleMs;
    return compact;
  });
  const compactGroups = report.performance.groups.map((row) => {
    const compact = { ...row };
    delete compact.sampleMs;
    return compact;
  });
  return {
    schemaVersion: 'scheduler-observability-summary-v2',
    metadata: report.metadata,
    boundaries: report.boundaries,
    fullArtifact,
    templateCoverage: {
      summary: report.templateCoverage.summary,
      matrix: compactMatrix
    },
    pathAudit: {
      summary: report.pathAudit.summary,
      courtNormalization: {
        scenarios: report.pathAudit.courtNormalization.scenarios,
        failures: report.pathAudit.courtNormalization.failures
      },
      dynamicFallbackResults: report.pathAudit.dynamicFallbackResults.map(compactPathRecord),
      outOfTemplateResults: report.pathAudit.outOfTemplateResults.map(compactPathRecord),
      outOfTemplatePathStability: report.pathAudit.outOfTemplatePathStability.map((row) => ({
        scenarioId: row.scenarioId,
        scenarioName: row.scenarioName,
        requestedRuntimeBudgetMs: row.requestedRuntimeBudgetMs,
        summary: row.summary
      })),
      invalidInputResults: report.pathAudit.invalidInputResults.map((row) => ({
        scenarioId: row.scenarioId,
        scenarioName: row.scenarioName,
        errorClass: row.errorClass,
        outcome: row.outcome,
        errorMessage: row.errorMessage
      })),
      legacyPath: report.pathAudit.legacyPath
    },
    fairnessAudit: report.fairnessAudit,
    determinismAudit: {
      summary: report.determinismAudit.summary
    },
    performance: {
      scope: report.performance.scope,
      environment: report.performance.environment,
      summary: report.performance.summary,
      benchmarks: compactBenchmarks,
      groups: compactGroups
    },
    timingFieldAudit: report.timingFieldAudit,
    schedulerMetaModeAudit: report.schedulerMetaModeAudit,
    timingSemantics: report.timingSemantics,
    p01CoverageMapping: compactP01CoverageMapping(report.p01CoverageMapping),
    recommendations: report.recommendations
  };
}

function renderMarkdown(report, fullArtifact = null) {
  const templateSummary = report.templateCoverage.summary;
  const fairness = report.fairnessAudit.summary;
  const determinism = report.determinismAudit.summary;
  const pathSummary = report.pathAudit.summary;
  const timingRows = report.timingFieldAudit.fields.map((row) => ({
    field: row.field,
    phases: row.presentInPhases.join(', ') || 'none',
    done: row.presentInDone ? 'yes' : 'no'
  }));
  const modeMetaRows = report.schedulerMetaModeAudit.flatMap((modeRow) => Object.entries(modeRow.fields).map(([field, details]) => ({
    mode: modeRow.mode,
    field,
    present: details.present ? 'yes' : 'no',
    populated: details.populated ? 'yes' : 'no',
    value: details.value === null ? '' : details.value
  })));
  const dynamicRows = report.pathAudit.dynamicFallbackResults.concat(report.pathAudit.outOfTemplateResults).map((row) => ({
    scenario: row.scenarioName,
    path: row.pathClass,
    profile: row.executionProfile,
    fallback: row.fallbackReason || 'none',
    matches: `${row.actualMatches}/${row.totalMatches}`,
    playSpread: row.playSpread,
    budget: `${row.requestedRuntimeBudgetMs ?? 'default'} / ${row.effectiveRuntimeBudgetMs ?? 'n/a'}`,
    integrity: row.integrity.valid ? 'pass' : 'fail'
  }));
  const benchmarkRows = report.performance.benchmarks.map((row) => ({
    scenario: row.scenarioName,
    path: row.pathClass,
    repeats: row.repeats,
    median: row.duration.medianMs,
    p95: row.duration.p95Ms,
    min: row.duration.minMs,
    max: row.duration.maxMs,
    budget: `${row.requestedRuntimeBudgetMs ?? 'default'} / ${row.effectiveRuntimeBudgetMs ?? 'n/a'}`,
    deterministic: row.deterministicSchedule ? 'yes' : 'no'
  }));
  const matrixRows = report.templateCoverage.matrix.map((row) => ({
    key: row.templateKey,
    players: row.playersCount,
    courts: row.effectiveCourts,
    horizon: row.horizonMatches,
    variants: row.variantCount,
    prefixes: row.supportedMatchCount,
    issues: row.missingMatchCounts.length
      + row.invalidVariantMatchCounts.length
      + row.insufficientVariantMatchCounts.length
  }));
  const invalidRows = report.pathAudit.invalidInputResults.map((row) => ({
    scenario: row.scenarioName,
    class: row.errorClass,
    outcome: row.outcome,
    reason: row.errorMessage
  }));
  const pathStabilityRows = report.pathAudit.outOfTemplatePathStability.map((row) => ({
    scenario: row.scenarioName,
    runs: row.summary.runs,
    budget: row.requestedRuntimeBudgetMs,
    paths: JSON.stringify(row.summary.pathCounts),
    profiles: JSON.stringify(row.summary.profileCounts),
    reasons: JSON.stringify(row.summary.fallbackReasonCounts),
    stable: row.summary.stablePath ? 'yes' : 'no'
  }));
  const sourceTree = report.metadata.sourceTreeAtAuditStart || {};
  const p01 = report.p01CoverageMapping || { windows: {} };
  const window90 = p01.windows && p01.windows['90d'] ? p01.windows['90d'] : {};
  const window180 = p01.windows && p01.windows['180d'] ? p01.windows['180d'] : {};
  const pareto80180 = window180.pareto80 || {};
  const pareto80180Summary = pareto80180.summary || { eventCounts: {} };
  const stable180 = window180.stableHighFrequency || {};
  const stable180Summary = stable180.summary || {
    eventCounts: {},
    multiRotateEvents: 0,
    currentTemplateCoveredMultiRotateRate: null,
    missingCurrentTemplateKeyRows: 0
  };
  const p01FamilyRows = (window90.topFamilies || []).map((row) => ({
    combination: `${row.mode}/${row.playersCount}p/${row.courts}c`,
    count: row.count,
    currentKey: row.currentTemplateKey || 'n/a',
    keyPresent: row.currentTemplateKeyPresent ? 'yes' : 'no',
    horizon: row.currentTemplateHorizonMatches ?? 'n/a',
    prefix: row.prefixCoverage
  }));
  const p01CombinationRows = (stable180.combinations || []).map((row) => ({
    combination: `${row.mode}/${row.playersCount}p/${row.requestedCourts}c/${row.totalMatches}m`,
    count: row.count,
    currentKey: row.currentTemplateKey || 'n/a',
    horizon: row.currentTemplateHorizonMatches ?? 'n/a',
    prefix: row.currentPrefixKind,
    path: row.currentPathContract,
    equal: row.equalPlayMathematicallyPossible === null
      ? 'n/a'
      : row.equalPlayMathematicallyPossible ? 'yes' : 'no',
    disposition: row.futureTemplateDisposition
  }));

  return [
    '# 工作线 02：排阵观测与模板覆盖审计证据',
    '',
    `- 生成时间：\`${report.metadata.generatedAt}\``,
    `- 分支 / 基线：\`${report.metadata.branch}@${report.metadata.generatedFromHead}\``,
    `- 模板库：\`${report.metadata.templateLibraryVersion}\``,
    `- 运行环境：\`${report.metadata.runtime.nodeVersion} / ${report.metadata.runtime.platform} ${report.metadata.runtime.architecture}\``,
    `- 源码状态：\`${sourceTree.state || 'unknown'}\`；production scheduler clean=${sourceTree.productionSchedulerSourceClean === true ? 'yes' : 'no'}`,
    `- 状态解释：${sourceTree.explanation || 'none'}`,
    '',
    '## 结论',
    '',
    `当前树实时枚举到 ${templateSummary.templateKeys} 个模板键、${templateSummary.templateVariants} 个模板 variant、${templateSummary.supportedMatchPrefixes} 个连续场数前缀；注册表问题 ${templateSummary.registryIssueCount}，模板路径审计失败 ${templateSummary.auditFailureCount}。本轮没有新增或刷新模板，也没有改变任何生产排阵行为。`,
    '',
    `路径分类共 ${pathSummary.total} 条，分类守恒：${pathSummary.conserved ? '是' : '否'}；计数为 \`${JSON.stringify(pathSummary.counts)}\`。动态与带外场景受 deadline 影响，可落入 beam、legacy 或 error；legacy 实现存在，本轮有效场景命中数为 ${report.pathAudit.legacyPath.observedValidScenarios}。`,
    '',
    '## 证据存储与复跑',
    '',
    fullArtifact
      ? `tracked JSON 是紧凑机器摘要；逐前缀、逐人场次、逐次路径与性能样本位于 ignored 本地产物 \`${fullArtifact.relativePath}\`。`
      : '逐场景全量产物信息未提供。',
    fullArtifact
      ? `全量产物本次运行字节 SHA-256=\`${fullArtifact.sha256}\`，${fullArtifact.bytes} bytes / ${fullArtifact.lineCount} lines，git ignored=${fullArtifact.ignoredByGit ? 'yes' : 'no'}。`
      : '',
    fullArtifact ? `稳定审计不变量 SHA-256=\`${fullArtifact.stableInvariantSha256}\`。字节哈希包含 generatedAt、墙钟样本和 deadline 敏感结果，复跑允许变化；相同源码与 P01 输入的不变量哈希必须稳定。` : '',
    fullArtifact ? `复跑：\`${fullArtifact.rerunCommand}\`` : '',
    '',
    '## 模板覆盖矩阵',
    '',
    markdownTable([
      { key: 'key', label: 'templateKey' },
      { key: 'players', label: 'players' },
      { key: 'courts', label: 'effectiveCourts' },
      { key: 'horizon', label: 'horizonMatches' },
      { key: 'variants', label: 'variants' },
      { key: 'prefixes', label: 'supported prefixes' },
      { key: 'issues', label: 'issues' }
    ], matrixRows),
    '',
    `场地降级矩阵覆盖 ${report.pathAudit.courtNormalization.scenarios} 个 \`playersCount × requestedCourts\` 组合，失败 ${report.pathAudit.courtNormalization.failures}。完整逐前缀与逐人数据见上方 ignored 全量产物，并由 tracked SHA-256 锚定。`,
    '',
    '## fallback 与无合法结果',
    '',
    markdownTable([
      { key: 'scenario', label: 'scenario' },
      { key: 'path', label: 'path' },
      { key: 'profile', label: 'executionProfile' },
      { key: 'fallback', label: 'fallbackReason' },
      { key: 'matches', label: 'matches' },
      { key: 'playSpread', label: 'playSpread' },
      { key: 'budget', label: 'runtime budget requested / effective ms' },
      { key: 'integrity', label: 'integrity' }
    ], dynamicRows),
    '',
    '带外路径重复采样（保留同输入出现不同 deadline 结果的事实）：',
    '',
    markdownTable([
      { key: 'scenario', label: 'scenario' },
      { key: 'runs', label: 'runs' },
      { key: 'budget', label: 'requested budget ms' },
      { key: 'paths', label: 'path counts' },
      { key: 'profiles', label: 'profile counts' },
      { key: 'reasons', label: 'fallback reason counts' },
      { key: 'stable', label: 'stable path' }
    ], pathStabilityRows),
    '',
    markdownTable([
      { key: 'scenario', label: 'invalid input' },
      { key: 'class', label: 'error class' },
      { key: 'outcome', label: 'outcome' },
      { key: 'reason', label: 'reason' }
    ], invalidRows),
    '',
    '## 完整性与公平性',
    '',
    `- 模板前缀场景：${fairness.scenarios}；完整性错误场景：${fairness.integrityFailureScenarios}；\`Σplays = 4 × matches\` 失败：${fairness.appearanceConservationFailures}。`,
    `- 数学上可绝对等场：${fairness.equalPlayMathematicallyPossible}；可等场但未达成：${fairness.equalPlayPossibleButNotAchieved}。`,
    `- 数学上不可绝对等场：${fairness.equalPlayMathematicallyImpossible}；错误宣称等场：${fairness.impossibleButClaimedEqual}。`,
    `- 最大 playSpread / 连场 / 轮空差：${fairness.maxPlaySpread} / ${fairness.maxConsecutivePlay} / ${fairness.maxRestCountSpread}。搭档与对手重复独立记录，不以 fairnessScore 替代。`,
    '',
    `同 seed 排阵复现失败 ${determinism.sameSeedScheduleFailures}/${determinism.templateKeys}；同 seed 质量失败 ${determinism.sameSeedQualityFailures}/${determinism.templateKeys}；跨 seed 模板路由失败 ${determinism.crossSeedRouteFailures}/${determinism.templateKeys}；跨 seed 排阵内容不同 ${determinism.crossSeedScheduleDifferences}/${determinism.templateKeys}。`,
    '',
    '## 本地性能基线',
    '',
    `计时器 \`${report.performance.environment.timer}\`，每个场景 warmup=${report.performance.environment.benchmarkWarmups}、repeats=${report.performance.environment.benchmarkRepeats}。公平性结论来自确定性审计，不用墙钟快慢替代。`,
    '',
    markdownTable([
      { key: 'scenario', label: 'scenario' },
      { key: 'path', label: 'path' },
      { key: 'repeats', label: 'N' },
      { key: 'median', label: 'median ms' },
      { key: 'p95', label: 'P95 ms' },
      { key: 'min', label: 'min ms' },
      { key: 'max', label: 'max ms' },
      { key: 'budget', label: 'runtime budget requested / effective ms' },
      { key: 'deterministic', label: 'same schedule' }
    ], benchmarkRows),
    '',
    `真实性能采样中，同 seed 排阵 digest 变化 ${report.performance.summary.deterministicScheduleFailures}/${report.performance.summary.scenarios}，质量 digest 变化 ${report.performance.summary.deterministicQualityFailures}/${report.performance.summary.scenarios}。这反映动态 deadline 的负载敏感性；模板公平性结论来自独立确定性审计，不由墙钟样本改写。`,
    '',
    '本地只测算法。`materializeMs`、`writeMs`、`totalMs` 未通过假数据冒充云端端到端耗时；本轮仅核对这些字段在生产 timing 日志中的可用性，未调用云函数、未写真实云数据。',
    '',
    '## timing / meta 字段',
    '',
    markdownTable([
      { key: 'field', label: 'field' },
      { key: 'phases', label: 'present phases' },
      { key: 'done', label: 'present in done' }
    ], timingRows),
    '',
    '字段键存在不代表各 mode 有可聚合值：',
    '',
    markdownTable([
      { key: 'mode', label: 'mode' },
      { key: 'field', label: 'schedulerMeta field' },
      { key: 'present', label: 'present' },
      { key: 'populated', label: 'populated' },
      { key: 'value', label: 'sample value' }
    ], modeMetaRows),
    '',
    `最小观测缺口：\`${report.timingFieldAudit.missingDoneFields.join(', ') || 'none'}\`。其中 schedulerMeta 已有的诊断字段若要进入生产 timing 聚合，应由集成对话另行批准；本任务未修改生产文件。`,
    '',
    `计时语义：schedule=${report.timingSemantics.scheduleMs} materialize=${report.timingSemantics.materializeMs} write=${report.timingSemantics.writeMs} total=${report.timingSemantics.totalMs} ${report.timingSemantics.failureSampling}`,
    '',
    '## P01 → P02 高频组合映射',
    '',
    p01.conclusion || 'P01 映射不可用。',
    '',
    p01.source && p01.source.git
      ? `P01 closure：\`${p01.source.git.branch}@${p01.source.git.commit}\`，source clean=${p01.source.git.clean ? 'yes' : 'no'}。`
      : 'P01 closure commit 未记录。',
    p01.source && p01.source.closureComparison
      ? `相对 pre-closure \`${p01.source.closureComparison.preClosureReferenceCommit}\`：Pareto path drift=${p01.source.closureComparison.pathDrifted ? 'yes' : 'no'}，content hash drift=${p01.source.closureComparison.contentHashDrifted ? 'yes' : 'no'}。`
      : '',
    p01.source && p01.source.evidenceLimit ? `证据粒度：${p01.source.evidenceLimit}` : '',
    p01.source && p01.source.hashes
      ? `输入哈希：180d JSON=\`${p01.source.hashes.pareto180TrackedEvidenceHash}\`；180d CSV=\`${p01.source.hashes.pareto180TrackedCsvHash}\`；90d manifest anchor=\`${p01.source.hashes.pareto90UntrackedAggregateHashFromManifest}\`。`
      : '',
    '',
    window90.topExact
      ? `90d 已发布 Top 精确组合 \`${window90.topExact.mode}/${window90.topExact.playersCount}p/${window90.topExact.requestedCourts}c/${window90.topExact.totalMatches}m\`（${window90.topExact.count} 场）映射到 \`${window90.topExact.currentTemplateKey}\` / \`${window90.topExact.currentPrefixKind}\` / \`${window90.topExact.currentPathContract}\`。`
      : '90d Top 精确组合不可用。',
    '',
    '90d 已发布 Top family（缺 totalMatches，故只能确认 key，不能确认所有 prefix）：',
    '',
    markdownTable([
      { key: 'combination', label: 'family' },
      { key: 'count', label: 'events' },
      { key: 'currentKey', label: 'current key' },
      { key: 'keyPresent', label: 'key present' },
      { key: 'horizon', label: 'horizon' },
      { key: 'prefix', label: 'prefix evidence' }
    ], p01FamilyRows),
    '',
    `180d 官方 P80：${pareto80180.sourceExactRows || 0} 个精确行、${pareto80180.decisionCombinations || 0} 个四维决策组合、${pareto80180.threshold ? pareto80180.threshold.coveredCount : 0} 场；template=${pareto80180Summary.eventCounts.template || 0}、dynamic=${pareto80180Summary.eventCounts.dynamic || 0}、mode-specific=${pareto80180Summary.eventCounts.modeSpecific || 0}、unclassified=${pareto80180Summary.eventCounts.unclassified || 0}。`,
    '',
    `180d 稳定高频口径为 \`count >= 2\`：${stable180.sourceExactRows || 0} 个源精确行、${stable180.decisionCombinations || 0} 个四维决策组合、${stable180.eventCount || 0} 场。路径事件守恒为 template=${stable180Summary.eventCounts.template || 0}、dynamic=${stable180Summary.eventCounts.dynamic || 0}、mode-specific=${stable180Summary.eventCounts.modeSpecific || 0}、unclassified=${stable180Summary.eventCounts.unclassified || 0}、invalid=${stable180Summary.eventCounts.invalid || 0}。`,
    `其中 multi_rotate 当前模板前缀覆盖率=${stable180Summary.currentTemplateCoveredMultiRotateRate === null ? 'n/a' : `${(stable180Summary.currentTemplateCoveredMultiRotateRate * 100).toFixed(1)}%`}；缺失当前模板键组合=${stable180Summary.missingCurrentTemplateKeyRows || 0}。动态组合只是未来 horizon/key 候选，不是本轮实施或批准。`,
    '',
    markdownTable([
      { key: 'combination', label: '180d stable combination' },
      { key: 'count', label: 'events' },
      { key: 'currentKey', label: 'current key' },
      { key: 'horizon', label: 'horizon' },
      { key: 'prefix', label: 'prefix' },
      { key: 'path', label: 'current path contract' },
      { key: 'equal', label: 'equal-play possible' },
      { key: 'disposition', label: 'future disposition' }
    ], p01CombinationRows),
    '',
    '## 边界确认',
    '',
    '- 未修改 `cloudfunctions/startTournament/**`、模板库、算法、fallback、seed、阈值、赛事规则或任何 UI。',
    '- 未读取真实赛事数据，未写真实云数据，未 preview/upload、发布或部署云函数。',
    '- 未 push、未创建 PR；本证据只属于工作线 02 独立分支。',
    ''
  ].join('\n');
}

function countContentLines(content) {
  const text = String(content || '');
  if (!text) return 0;
  const lines = text.split(/\r?\n/);
  return lines.length - (lines[lines.length - 1] === '' ? 1 : 0);
}

function writeEvidence(report, options = {}) {
  const normalizedOptions = typeof options === 'string' ? { outputDir: options } : options;
  const directory = path.resolve(normalizedOptions.outputDir || DEFAULT_OUTPUT_DIR);
  const fullOutputPath = path.resolve(normalizedOptions.fullOutputPath || DEFAULT_FULL_OUTPUT_PATH);
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(path.dirname(fullOutputPath), { recursive: true });
  const jsonPath = path.join(directory, DEFAULT_JSON_NAME);
  const markdownPath = path.join(directory, DEFAULT_MARKDOWN_NAME);
  if (fullOutputPath === jsonPath || fullOutputPath === markdownPath) {
    throw new Error('Full audit artifact must not overwrite tracked summary evidence');
  }
  if (!isGitIgnored(fullOutputPath)) {
    throw new Error(`Full audit artifact path must be ignored by git: ${fullOutputPath}`);
  }
  const fullContent = `${JSON.stringify(report, null, 2)}\n`;
  fs.writeFileSync(fullOutputPath, fullContent, 'utf8');
  const fullArtifact = {
    relativePath: normalizeRepoPath(path.relative(REPO_ROOT, fullOutputPath)),
    sha256: sha256File(fullOutputPath),
    sha256Kind: 'run_instance_bytes',
    bytes: fs.statSync(fullOutputPath).size,
    lineCount: countContentLines(fs.readFileSync(fullOutputPath, 'utf8')),
    ignoredByGit: isGitIgnored(fullOutputPath),
    contentSchemaVersion: report.schemaVersion,
    stableInvariantSha256: buildStableInvariantDigest(report),
    stableInvariantSemantics: 'Excludes generatedAt, runtime environment, wall-clock samples, and deadline-sensitive dynamic path outcomes; includes audited source hashes, template/fairness/determinism/timing invariants, and P01 mapping.',
    rerunHashExpectation: 'sha256 is specific to this run and may change; stableInvariantSha256 must remain stable for identical audited sources and P01 evidence.',
    rerunCommand: 'node scripts/audit-scheduler-observability.js --p01-evidence-dir="<P01_EVIDENCE_DIR>" --p01-expected-commit="<P01_FINAL_COMMIT>"'
  };
  const compactSummary = buildCompactAuditSummary(report, fullArtifact);
  fs.writeFileSync(jsonPath, `${JSON.stringify(compactSummary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderMarkdown(report, fullArtifact), 'utf8');
  return {
    jsonPath,
    markdownPath,
    fullOutputPath,
    fullArtifact,
    compactSummary
  };
}

function parseArgs(argv) {
  const options = {
    repeats: DEFAULT_BENCHMARK_REPEATS,
    warmups: DEFAULT_BENCHMARK_WARMUPS,
    outputDir: DEFAULT_OUTPUT_DIR,
    fullOutputPath: DEFAULT_FULL_OUTPUT_PATH,
    p01EvidenceDir: process.env.P01_EVIDENCE_DIR || '',
    p01ExpectedCommit: process.env.P01_EXPECTED_COMMIT || ''
  };
  (Array.isArray(argv) ? argv : []).forEach((arg) => {
    if (arg.startsWith('--repeats=')) options.repeats = Number(arg.slice('--repeats='.length));
    if (arg.startsWith('--warmups=')) options.warmups = Number(arg.slice('--warmups='.length));
    if (arg.startsWith('--output-dir=')) options.outputDir = path.resolve(arg.slice('--output-dir='.length));
    if (arg.startsWith('--full-output=')) options.fullOutputPath = path.resolve(arg.slice('--full-output='.length));
    if (arg.startsWith('--p01-evidence-dir=')) options.p01EvidenceDir = path.resolve(arg.slice('--p01-evidence-dir='.length));
    if (arg.startsWith('--p01-expected-commit=')) options.p01ExpectedCommit = arg.slice('--p01-expected-commit='.length);
  });
  return options;
}

function hasBlockingAuditFailure(report) {
  const metadata = report && report.metadata ? report.metadata : {};
  const sourceAtStart = metadata.sourceTreeAtAuditStart || {
    productionSchedulerSourceClean: false,
    unexpectedDirtyPaths: ['missing_source_snapshot']
  };
  const sourceBeforeWrite = metadata.sourceTreeBeforeWrite || sourceAtStart;
  const p01 = report && report.p01CoverageMapping ? report.p01CoverageMapping : {};
  const p01Source = p01.source || {};
  const window180 = p01.windows && p01.windows['180d'] ? p01.windows['180d'] : {};
  return report.templateCoverage.summary.registryIssueCount > 0
    || report.templateCoverage.summary.auditFailureCount > 0
    || report.pathAudit.courtNormalization.failures > 0
    || !report.pathAudit.summary.conserved
    || report.fairnessAudit.summary.integrityFailureScenarios > 0
    || report.fairnessAudit.summary.appearanceConservationFailures > 0
    || report.fairnessAudit.summary.equalPlayPossibleButNotAchieved > 0
    || report.fairnessAudit.summary.impossibleButClaimedEqual > 0
    || report.determinismAudit.summary.sameSeedScheduleFailures > 0
    || report.determinismAudit.summary.sameSeedQualityFailures > 0
    || report.determinismAudit.summary.crossSeedRouteFailures > 0
    || report.determinismAudit.summary.integrityFailures > 0
    || report.performance.benchmarks.some((row) => row.integrityFailures > 0)
    || !sourceAtStart.productionSchedulerSourceClean
    || sourceAtStart.unexpectedDirtyPaths.length > 0
    || !sourceBeforeWrite.productionSchedulerSourceClean
    || sourceBeforeWrite.unexpectedDirtyPaths.length > 0
    || metadata.auditScriptSha256 !== metadata.auditScriptSha256BeforeWrite
    || p01.status !== 'complete_with_90d_summary_only'
    || !p01Source.git
    || !p01Source.git.clean
    || !p01Source.validation
    || !p01Source.validation.committedInputs
    || !p01Source.validation.privacySafe
    || !window180.pareto80
    || !window180.pareto80.summary.conserved
    || !window180.stableHighFrequency
    || !window180.stableHighFrequency.summary.conserved;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  options.sourceGitMetadata = getGitMetadata();
  options.p01Evidence = loadP01Evidence(options.p01EvidenceDir, {
    expectedCommit: options.p01ExpectedCommit,
    requireExpectedCommit: true
  });
  const report = buildAuditData(options);
  const sourceBeforeWrite = getGitMetadata();
  report.metadata.sourceTreeBeforeWrite = sourceBeforeWrite.sourceTreeAtAuditStart;
  report.metadata.auditScriptSha256BeforeWrite = sourceBeforeWrite.auditScriptSha256;
  report.boundaries.productionSchedulerFilesModified = (
    report.boundaries.productionSchedulerFilesModified
    || !sourceBeforeWrite.sourceTreeAtAuditStart.productionSchedulerSourceClean
  );
  if (hasBlockingAuditFailure(report)) {
    console.error('[scheduler-observability] blocking audit failure; evidence was not written');
    process.exitCode = 1;
    return;
  }
  const outputs = writeEvidence(report, options);
  console.log(`[scheduler-observability] templates=${report.templateCoverage.summary.templateKeys} variants=${report.templateCoverage.summary.templateVariants} prefixes=${report.templateCoverage.summary.supportedMatchPrefixes}`);
  console.log(`[scheduler-observability] paths=${JSON.stringify(report.pathAudit.summary.counts)} conserved=${report.pathAudit.summary.conserved}`);
  console.log(`[scheduler-observability] summary=${outputs.jsonPath}`);
  console.log(`[scheduler-observability] markdown=${outputs.markdownPath}`);
  console.log(`[scheduler-observability] full=${outputs.fullOutputPath}`);
  console.log(`[scheduler-observability] full-sha256=${outputs.fullArtifact.sha256}`);
}

if (require.main === module) main();

module.exports = {
  DONE_TIMING_FIELDS,
  DEFAULT_FULL_OUTPUT_PATH,
  buildTemplateCoverageMatrix,
  loadP01Evidence,
  mapCurrentCombination,
  buildP01CoverageMapping,
  inspectScheduleIntegrity,
  classifyExecutionPath,
  buildScenarioObservation,
  buildCourtNormalizationScenarios,
  buildOutOfTemplateScenarios,
  buildInvalidInputProbeRecords,
  summarizePathCounts,
  summarizePathStabilityRuns,
  runPathStabilityAudit,
  summarizeDurations,
  extractTimingPhaseFields,
  buildTimingFieldAudit,
  buildSchedulerMetaModeAudit,
  buildBenchmarkScenarios,
  benchmarkScenario,
  summarizeBenchmarkGroups,
  buildTemplateDeterminismRows,
  buildFairnessSummary,
  classifySourceTreeState,
  parseGitStatusPorcelainZ,
  isGitIgnored,
  buildAuditData,
  buildStableInvariantDigest,
  buildCompactAuditSummary,
  renderMarkdown,
  writeEvidence,
  hasBlockingAuditFailure
};
