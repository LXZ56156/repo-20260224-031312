#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const scenarioCommon = require('./scheduler-scenario-common');
const {
  buildRecommendationAuditRows,
  buildRecommendationAuditIssues
} = require('./rotation-match-options-common');
const matchOptions = require('../miniprogram/core/ux/multiRotateMatchOptions');
const templateLibrary = require('../cloudfunctions/startTournament/rotation.templates');
const fixedPair = require('../miniprogram/core/fixedPair');

const OUTPUT_PATH = path.resolve(__dirname, '../docs/scheduler-full-audit.md');
const COVERAGE_APPENDIX_KEYS = ['6p-1c', '7p-1c', '8p-2c'];
const COVERAGE_EXPLANATIONS = {
  '6p-1c': '最早 coverage 里程碑已经落在 8 场，后续两档继续沿长赛事带上移，避免回落到过短赛程。',
  '7p-1c': '要纳入最早 coverage=11，同时保持高质量前缀，三档会整体偏长。',
  '8p-2c': 'coverage=14 落在 8 和 16 之间，规则会用 14 替换中档，得到 8/14/16。'
};

function formatNumber(value) {
  return Number.isFinite(value) ? String(value) : '';
}

function escapeTableCell(value) {
  return String(value == null ? '' : value)
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>');
}

function renderMarkdownTable(columns, rows) {
  const header = `| ${columns.map((column) => escapeTableCell(column.label)).join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => escapeTableCell(row[column.key])).join(' | ')} |`);
  return [header, separator].concat(body).join('\n');
}

function renderIssueSection(title, rows) {
  if (!rows.length) {
    return `### ${title}\n\nnone`;
  }
  return [
    `### ${title}`,
    '',
    renderMarkdownTable(
      [
        { key: 'scenario', label: 'scenario' },
        { key: 'code', label: 'code' },
        { key: 'message', label: 'message' }
      ],
      rows
    )
  ].join('\n');
}

function formatRatio(numerator, denominator) {
  if (!denominator) return '0/0 (0%)';
  const pct = Math.round((numerator / denominator) * 100);
  return `${numerator}/${denominator} (${pct}%)`;
}

function averageElapsed(results) {
  if (!results.length) return 0;
  const total = results.reduce((sum, result) => sum + (Number(result.elapsedMs) || 0), 0);
  return Math.round(total / results.length);
}

function maxElapsed(results) {
  if (!results.length) return 0;
  return Math.max(...results.map((result) => Number(result.elapsedMs) || 0));
}

function mapScenarioMode(mode) {
  if (mode === 'rotation') return 'multi_rotate';
  if (mode === 'squad') return 'squad_doubles';
  return String(mode || '');
}

function summarizeResultGroup(label, results, warnings, failures) {
  const guardedCount = results.filter((result) => String(result.executionProfile || '').includes('guarded')).length;
  const greedyCount = results.filter((result) => result.executionProfile === 'greedy-fallback').length;
  return {
    group: label,
    scenarios: results.length,
    warnings: warnings.length,
    failures: failures.length,
    avgElapsedMs: averageElapsed(results),
    maxElapsedMs: maxElapsed(results),
    guardedRatio: formatRatio(guardedCount, results.length),
    greedyFallbackRatio: formatRatio(greedyCount, results.length)
  };
}

function buildModeSummaryRows(audit) {
  return [
    { key: 'multi_rotate', label: 'multi_rotate' },
    { key: 'squad_doubles', label: 'squad_doubles' }
  ].map((mode) => {
    const results = audit.results.filter((result) => mapScenarioMode(result.scenario.mode) === mode.key);
    const warnings = audit.warnings.filter((item) => mapScenarioMode(item.mode) === mode.key);
    const failures = audit.failures.filter((item) => mapScenarioMode(item.mode) === mode.key);
    return {
      mode: mode.label,
      scenarios: results.length,
      warnings: warnings.length,
      failures: failures.length,
      avgElapsedMs: averageElapsed(results),
      maxElapsedMs: maxElapsed(results),
      guardedRatio: formatRatio(
        results.filter((result) => String(result.executionProfile || '').includes('guarded')).length,
        results.length
      ),
      greedyFallbackRatio: formatRatio(
        results.filter((result) => result.executionProfile === 'greedy-fallback').length,
        results.length
      )
    };
  });
}

function buildRepresentativeRows(results) {
  return results.map((result) => ({
    scenario: result.scenario.name,
    status: result.failures.length ? 'fail' : (result.warnings.length ? 'warn' : 'pass'),
    elapsedMs: result.elapsedMs,
    maxElapsedMs: result.scenario.maxElapsedMs,
    executionProfile: result.executionProfile,
    timeoutGuardTriggered: result.timeoutGuardTriggered,
    fallbackReason: result.fallbackReason || '',
    playSpread: result.playSpread,
    maxConsecutivePlay: result.maxConsecutivePlay,
    uniqueExactMatchupCount: result.uniqueExactMatchupCount
  }));
}

function buildRepresentativeTable(results) {
  return renderMarkdownTable(
    [
      { key: 'scenario', label: 'scenario' },
      { key: 'status', label: 'status' },
      { key: 'elapsedMs', label: 'elapsedMs' },
      { key: 'maxElapsedMs', label: 'maxElapsedMs' },
      { key: 'executionProfile', label: 'executionProfile' },
      { key: 'timeoutGuardTriggered', label: 'timeoutGuardTriggered' },
      { key: 'fallbackReason', label: 'fallbackReason' },
      { key: 'playSpread', label: 'playSpread' },
      { key: 'maxConsecutivePlay', label: 'maxConsecutivePlay' },
      { key: 'uniqueExactMatchupCount', label: 'uniqueExactMatchupCount' }
    ],
    buildRepresentativeRows(results)
  );
}

function getGitMetadata() {
  try {
    const commit = String(execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8'
    }) || '').trim();
    const dirty = String(execFileSync('git', ['status', '--short'], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8'
    }) || '').trim().length > 0;
    return { commit: commit || 'unknown', dirty };
  } catch (_) {
    return { commit: 'unknown', dirty: false };
  }
}

function findCoverageMatch(templateCase) {
  const prefixMetrics = templateCase && templateCase.prefixMetrics ? templateCase.prefixMetrics : {};
  const matches = Object.keys(prefixMetrics)
    .map((key) => Number(key))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  for (const matchCount of matches) {
    const metrics = prefixMetrics[String(matchCount)];
    if (metrics && metrics.allPartnerPairsCovered) return matchCount;
  }
  return '';
}

function sortCaseEntries(entries) {
  return entries.slice().sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const leftPlayers = Number(leftValue && leftValue.players) || 0;
    const rightPlayers = Number(rightValue && rightValue.players) || 0;
    if (leftPlayers !== rightPlayers) return leftPlayers - rightPlayers;
    const leftCourts = Number(leftValue && leftValue.effectiveCourts) || 0;
    const rightCourts = Number(rightValue && rightValue.effectiveCourts) || 0;
    if (leftCourts !== rightCourts) return leftCourts - rightCourts;
    return String(leftKey).localeCompare(String(rightKey), 'en', { numeric: true });
  });
}

function buildMultiRotateRecommendationRows() {
  const cases = matchOptions && matchOptions.cases ? matchOptions.cases : {};
  const templateCases = templateLibrary && templateLibrary.cases ? templateLibrary.cases : {};
  return sortCaseEntries(Object.entries(cases)).map(([key, caseData]) => ({
    key,
    players: Number(caseData.players) || 0,
    effectiveCourts: Number(caseData.effectiveCourts) || 0,
    horizonMatches: Number(caseData.horizonMatches) || 0,
    presetMatches: Array.isArray(caseData.presetMatches) ? caseData.presetMatches.join(' / ') : '',
    balancedMatch: Number(caseData.balancedMatch) || 0,
    coverageMatch: formatNumber(findCoverageMatch(templateCases[key]))
  }));
}

function buildCoverageAppendixRows(recommendationRows) {
  const rowMap = Object.fromEntries(recommendationRows.map((row) => [row.key, row]));
  return COVERAGE_APPENDIX_KEYS
    .map((key) => rowMap[key])
    .filter(Boolean)
    .map((row) => ({
      case: row.key,
      presetMatches: row.presetMatches,
      balancedMatch: row.balancedMatch,
      coverageMatch: row.coverageMatch || '',
      note: COVERAGE_EXPLANATIONS[row.key] || ''
    }));
}

function buildRecommendationRationalitySection(report) {
  const rows = Array.isArray(report.recommendationAuditRows) ? report.recommendationAuditRows : [];
  const issues = Array.isArray(report.recommendationAuditIssues) ? report.recommendationAuditIssues : [];
  const summaryRow = {
    caseCount: rows.length,
    issueCount: issues.length,
    largeRosterShortfall: issues.filter((item) => item.code === 'large_roster_shortfall').length,
    monotonicityIssues: issues.filter((item) => String(item.code || '').startsWith('non_monotonic_')).length,
    collapsedPresetIssues: issues.filter((item) => item.code === 'collapsed_large_courts').length
  };

  return [
    '## multi_rotate 推荐合理性',
    '',
    renderMarkdownTable(
      [
        { key: 'caseCount', label: 'caseCount' },
        { key: 'issueCount', label: 'issueCount' },
        { key: 'largeRosterShortfall', label: 'largeRosterShortfall' },
        { key: 'monotonicityIssues', label: 'monotonicityIssues' },
        { key: 'collapsedPresetIssues', label: 'collapsedPresetIssues' }
      ],
      [summaryRow]
    ),
    '',
    renderIssueSection('异常项', issues.map((issue) => ({
      scenario: issue.key,
      code: issue.code,
      message: issue.message
    })))
  ].join('\n');
}

function formatMetadataBlock(metadata) {
  return [
    '- 生成时间: `' + metadata.generatedAt + '`',
    '- 当前 commit: `' + metadata.commit + '`',
    '- 工作区脏状态: `' + (metadata.dirty ? 'dirty' : 'clean') + '`',
    '- 矩阵场景数: `' + metadata.auditScenarioCount + '`',
    '- 代表性场景数: `' + metadata.representativeScenarioCount + '`',
    '- warnings: `' + metadata.warningCount + '`',
    '- failures: `' + metadata.failureCount + '`'
  ].join('\n');
}

function buildRotationSection(audit, representative) {
  const templateResults = audit.results.filter((result) => result.scenario.kind === 'rotation_template_audit');
  const longtailResults = audit.results.filter((result) => result.scenario.kind === 'rotation_longtail_audit');
  const warnings = audit.warnings.filter((item) => item.mode === 'rotation');
  const failures = audit.failures.filter((item) => item.mode === 'rotation');
  const representativeResults = representative.results.filter((result) => result.scenario.mode === 'rotation');

  return [
    '## multi_rotate 审计',
    '',
    renderMarkdownTable(
      [
        { key: 'group', label: 'group' },
        { key: 'scenarios', label: 'scenarios' },
        { key: 'warnings', label: 'warnings' },
        { key: 'failures', label: 'failures' },
        { key: 'avgElapsedMs', label: 'avgElapsedMs' },
        { key: 'maxElapsedMs', label: 'maxElapsedMs' },
        { key: 'guardedRatio', label: 'guardedRatio' },
        { key: 'greedyFallbackRatio', label: 'greedyFallbackRatio' }
      ],
      [
        summarizeResultGroup(
          'template matrix',
          templateResults,
          warnings.filter((item) => String(item.scenario || '').startsWith('rotation template')),
          failures.filter((item) => String(item.scenario || '').startsWith('rotation template'))
        ),
        summarizeResultGroup(
          'longtail matrix',
          longtailResults,
          warnings.filter((item) => String(item.scenario || '').startsWith('rotation longtail')),
          failures.filter((item) => String(item.scenario || '').startsWith('rotation longtail'))
        )
      ]
    ),
    '',
    '### 代表性场景',
    '',
    buildRepresentativeTable(representativeResults),
    '',
    renderIssueSection('失败项', failures),
    '',
    renderIssueSection('警告项', warnings)
  ].join('\n');
}

function buildSquadSection(audit, representative) {
  const equalResults = audit.results.filter((result) => result.scenario.kind === 'squad_equal_audit');
  const unevenResults = audit.results.filter((result) => result.scenario.kind === 'squad_uneven_audit');
  const warnings = audit.warnings.filter((item) => item.mode === 'squad');
  const failures = audit.failures.filter((item) => item.mode === 'squad');
  const representativeResults = representative.results.filter((result) => result.scenario.mode === 'squad');

  return [
    '## squad_doubles 审计',
    '',
    renderMarkdownTable(
      [
        { key: 'group', label: 'group' },
        { key: 'scenarios', label: 'scenarios' },
        { key: 'warnings', label: 'warnings' },
        { key: 'failures', label: 'failures' },
        { key: 'avgElapsedMs', label: 'avgElapsedMs' },
        { key: 'maxElapsedMs', label: 'maxElapsedMs' },
        { key: 'guardedRatio', label: 'guardedRatio' },
        { key: 'greedyFallbackRatio', label: 'greedyFallbackRatio' }
      ],
      [
        summarizeResultGroup(
          'equal matrix',
          equalResults,
          warnings.filter((item) => String(item.scenario || '').startsWith('squad equal') || item.scenario === 'squad equal matrix'),
          failures.filter((item) => String(item.scenario || '').startsWith('squad equal'))
        ),
        summarizeResultGroup(
          'uneven matrix',
          unevenResults,
          warnings.filter((item) => String(item.scenario || '').startsWith('squad uneven')),
          failures.filter((item) => String(item.scenario || '').startsWith('squad uneven'))
        )
      ]
    ),
    '',
    '### 代表性场景',
    '',
    buildRepresentativeTable(representativeResults),
    '',
    renderIssueSection('失败项', failures),
    '',
    renderIssueSection('警告项', warnings)
  ].join('\n');
}

function buildFixedPairSection() {
  const rows = fixedPair.FIXED_PAIR_CYCLE_SHORTCUTS.map((cycle) => ({
    shortcut: `${cycle}轮`,
    totalMatches: `C(teamCount,2) * ${cycle}`,
    note: cycle === fixedPair.FIXED_PAIR_MAX_CYCLES
      ? `共享上限 ${fixedPair.FIXED_PAIR_MAX_CYCLES} 轮`
      : '快捷切换轮次'
  }));
  return [
    '## fixed_pair_rr 摘要',
    '',
    '- 当前快捷轮次固定为 `1/2/3/5/10`。',
    '- 总场次换算公式为 `C(teamCount,2) * cycle`，且共享上限为 `10` 轮。',
    '- 当合法队伍少于 `2` 支时，不展示快捷轮次，也不生成对应推荐总场次。',
    '',
    renderMarkdownTable(
      [
        { key: 'shortcut', label: 'shortcut' },
        { key: 'totalMatches', label: 'totalMatches' },
        { key: 'note', label: 'note' }
      ],
      rows
    )
  ].join('\n');
}

function renderSchedulerFullAuditMarkdown(report) {
  const recommendationRows = Array.isArray(report.recommendationRows) ? report.recommendationRows : [];
  const coverageRows = Array.isArray(report.coverageRows) ? report.coverageRows : [];
  return [
    '# 排阵算法全量审计与推荐场数报告',
    '',
    formatMetadataBlock(report.metadata),
    '',
    '## 执行摘要',
    '',
    renderMarkdownTable(
      [
        { key: 'mode', label: 'mode' },
        { key: 'scenarios', label: 'scenarios' },
        { key: 'warnings', label: 'warnings' },
        { key: 'failures', label: 'failures' },
        { key: 'avgElapsedMs', label: 'avgElapsedMs' },
        { key: 'maxElapsedMs', label: 'maxElapsedMs' },
        { key: 'guardedRatio', label: 'guardedRatio' },
        { key: 'greedyFallbackRatio', label: 'greedyFallbackRatio' }
      ],
      report.modeSummaryRows
    ),
    '',
    buildRotationSection(report.audit, report.representative),
    '',
    buildRecommendationRationalitySection(report),
    '',
    buildSquadSection(report.audit, report.representative),
    '',
    buildFixedPairSection(),
    '',
    '## 附录 A：multi_rotate 当前推荐场数',
    '',
    renderMarkdownTable(
      [
        { key: 'key', label: 'case' },
        { key: 'players', label: 'players' },
        { key: 'effectiveCourts', label: 'effectiveCourts' },
        { key: 'horizonMatches', label: 'horizonMatches' },
        { key: 'presetMatches', label: 'presetMatches' },
        { key: 'balancedMatch', label: 'balancedMatch' },
        { key: 'coverageMatch', label: 'coverageMatch' }
      ],
      recommendationRows
    ),
    '',
    '## 附录 B：coverage 长带说明',
    '',
    coverageRows.length
      ? renderMarkdownTable(
        [
          { key: 'case', label: 'case' },
          { key: 'presetMatches', label: 'presetMatches' },
          { key: 'balancedMatch', label: 'balancedMatch' },
          { key: 'coverageMatch', label: 'coverageMatch' },
          { key: 'note', label: 'note' }
        ],
        coverageRows
      )
      : 'none'
  ].join('\n');
}

function buildReportData() {
  const auditScenarios = scenarioCommon.buildAuditScenarios();
  const auditMatrix = scenarioCommon.runScenarioMatrix(auditScenarios);
  const auditWarnings = auditMatrix.warnings.concat(scenarioCommon.buildAggregateWarnings(auditMatrix.results));

  const representativeScenarios = scenarioCommon.buildRepresentativeScenarios();
  const representativeMatrix = scenarioCommon.runScenarioMatrix(representativeScenarios);
  const representativeWarnings = representativeMatrix.warnings.concat(
    scenarioCommon.buildAggregateWarnings(representativeMatrix.results)
  );

  const metadata = {
    generatedAt: new Date().toISOString(),
    ...getGitMetadata(),
    auditScenarioCount: auditScenarios.length,
    representativeScenarioCount: representativeScenarios.length,
    warningCount: auditWarnings.length,
    failureCount: auditMatrix.failures.length
  };

  const recommendationAuditRows = buildRecommendationAuditRows(matchOptions && matchOptions.cases);
  const recommendationAuditIssues = buildRecommendationAuditIssues(recommendationAuditRows);

  return {
    metadata,
    audit: {
      ...auditMatrix,
      warnings: auditWarnings
    },
    representative: {
      ...representativeMatrix,
      warnings: representativeWarnings
    },
    modeSummaryRows: buildModeSummaryRows({
      results: auditMatrix.results,
      warnings: auditWarnings,
      failures: auditMatrix.failures
    }),
    recommendationAuditRows,
    recommendationAuditIssues,
    recommendationRows: buildMultiRotateRecommendationRows(),
    coverageRows: buildCoverageAppendixRows(buildMultiRotateRecommendationRows())
  };
}

function writeReportFile(outputPath, markdown) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown, 'utf8');
}

function main() {
  const report = buildReportData();
  const markdown = renderSchedulerFullAuditMarkdown(report);
  writeReportFile(OUTPUT_PATH, markdown);
  console.log(
    `[scheduler-full-audit] wrote ${path.relative(path.resolve(__dirname, '..'), OUTPUT_PATH)} `
    + `scenarios=${report.metadata.auditScenarioCount} warnings=${report.metadata.warningCount} failures=${report.metadata.failureCount}`
  );
  if (report.audit.failures.length) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  OUTPUT_PATH,
  findCoverageMatch,
  buildMultiRotateRecommendationRows,
  buildCoverageAppendixRows,
  buildRecommendationRationalitySection,
  renderSchedulerFullAuditMarkdown,
  buildReportData,
  writeReportFile
};
