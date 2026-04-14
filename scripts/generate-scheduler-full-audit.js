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
const ROTATION_PREFIX_TRACKED_KEYS = ['6p-1c', '9p-2c', '17p-1c', '24p-2c'];
const WORST_CASE_LIMIT = 5;
const OBSERVATION_LIMIT = 5;
const EQUAL_REPEAT_BASELINE_SCOPES = new Set([
  '4v4/12m/2c',
  '6v6/18m/3c',
  '7v7/18m/3c'
]);
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
    greedyFallbackRatio: formatRatio(greedyCount, results.length),
    maxPlaySpread: results.length ? Math.max(...results.map((result) => Number(result.playSpread) || 0)) : 0,
    maxConsecutivePlay: results.length ? Math.max(...results.map((result) => Number(result.maxConsecutivePlay) || 0)) : 0,
    maxPartnerRepeats: results.length ? Math.max(...results.map((result) => Number(result.partnerRepeats) || 0)) : 0,
    maxOpponentRepeats: results.length ? Math.max(...results.map((result) => Number(result.opponentRepeats) || 0)) : 0,
    maxRestCountSpread: results.length ? Math.max(...results.map((result) => Number(result.restCountSpread) || 0)) : 0,
    minPartnerCoveragePct: results.length ? Math.min(...results.map((result) => Number(result.partnerCoveragePct) || 0)) : 0,
    minOpponentCoveragePct: results.length ? Math.min(...results.map((result) => Number(result.opponentCoveragePct) || 0)) : 0
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
    uniqueExactMatchupCount: result.uniqueExactMatchupCount,
    exactRepeatCount: result.exactRepeatCount || 0,
    partnerRepeats: result.partnerRepeats,
    opponentRepeats: result.opponentRepeats,
    restCountSpread: result.restCountSpread
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
      { key: 'uniqueExactMatchupCount', label: 'uniqueExactMatchupCount' },
      { key: 'exactRepeatCount', label: 'exactRepeatCount' },
      { key: 'partnerRepeats', label: 'partnerRepeats' },
      { key: 'opponentRepeats', label: 'opponentRepeats' },
      { key: 'restCountSpread', label: 'restCountSpread' }
    ],
    buildRepresentativeRows(results)
  );
}

function renderNamedTable(title, columns, rows) {
  return [
    `### ${title}`,
    '',
    rows.length ? renderMarkdownTable(columns, rows) : 'none'
  ].join('\n');
}

function buildWorstCaseRows(results, limit = WORST_CASE_LIMIT) {
  return results
    .slice()
    .sort(scenarioCommon.compareWorstResult)
    .slice(0, limit)
    .map(toWorstCaseRow);
}

function getWorstCaseGroupKey(result) {
  const scenario = result && result.scenario ? result.scenario : {};
  if (scenario.caseKey) return `${scenario.mode}:${scenario.caseKey}`;
  if (scenario.mode === 'rotation' && Number.isFinite(scenario.playersCount) && Number.isFinite(scenario.courts)) {
    return `rotation:${scenario.playersCount}p-${scenario.courts}c`;
  }
  if (scenario.mode === 'squad' && Number.isFinite(scenario.squadAPlayers) && Number.isFinite(scenario.squadBPlayers)) {
    return `squad:${scenario.squadAPlayers}v${scenario.squadBPlayers}-${scenario.courts}c`;
  }
  return `${scenario.mode || 'unknown'}:${scenario.id || scenario.name || 'unknown'}`;
}

function toWorstCaseRow(result) {
  return {
    scenario: result.scenario.name,
    coverageLoss: Math.max(0, (Number(result.scenario.targetMatches) || 0) - (Number(result.actualMatches) || 0)),
    playSpread: result.playSpread,
    playSpreadExcess: result.playSpreadExcess || 0,
    maxConsecutivePlay: result.maxConsecutivePlay,
    exactRepeatCount: result.exactRepeatCount || 0,
    exactRepeatExcess: result.exactRepeatExcess || 0,
    partnerRepeats: result.partnerRepeats,
    opponentRepeats: result.opponentRepeats,
    partnerRepeatBaseline: result.partnerRepeatBaseline || 0,
    opponentRepeatBaseline: result.opponentRepeatBaseline || 0,
    partnerRepeatExcess: result.partnerRepeatExcess || 0,
    opponentRepeatExcess: result.opponentRepeatExcess || 0,
    timeoutGuardTriggered: result.timeoutGuardTriggered,
    executionProfile: result.executionProfile,
    elapsedMs: result.elapsedMs
  };
}

function buildWorstUniqueCaseRows(results, limit = WORST_CASE_LIMIT) {
  const rowsByKey = new Map();
  results.forEach((result) => {
    const key = getWorstCaseGroupKey(result);
    const existing = rowsByKey.get(key);
    if (!existing || scenarioCommon.compareWorstResult(result, existing) < 0) {
      rowsByKey.set(key, result);
    }
  });
  return [...rowsByKey.values()]
    .sort(scenarioCommon.compareWorstResult)
    .slice(0, limit)
    .map(toWorstCaseRow);
}

function buildObservationReason(result) {
  const reasons = [];
  if ((Number(result.exactRepeatExcess) || 0) > 0) {
    reasons.push(`exactRepeatExcess=${result.exactRepeatExcess}`);
  }
  if ((Number(result.playSpreadExcess) || 0) > 0) {
    reasons.push(`playSpreadExcess=${result.playSpreadExcess}`);
  }
  if (result.timeoutGuardTriggered) reasons.push('timeout-guard');
  if (String(result.executionProfile || '').includes('guarded')) reasons.push('guarded-profile');
  if (result.executionProfile === 'greedy-fallback') reasons.push('greedy-fallback');
  const isEqualSquad = result.scenario
    && result.scenario.mode === 'squad'
    && Number(result.scenario.squadAPlayers) > 0
    && Number(result.scenario.squadAPlayers) === Number(result.scenario.squadBPlayers);
  if (isEqualSquad) {
    if ((Number(result.partnerRepeatExcess) || 0) > 0) reasons.push(`partnerRepeatExcess=${result.partnerRepeatExcess}`);
    if ((Number(result.opponentRepeatExcess) || 0) > 0) reasons.push(`opponentRepeatExcess=${result.opponentRepeatExcess}`);
  } else {
    if ((Number(result.partnerRepeats) || 0) > 0) reasons.push(`partnerRepeats=${result.partnerRepeats}`);
    if ((Number(result.opponentRepeats) || 0) > 0) reasons.push(`opponentRepeats=${result.opponentRepeats}`);
  }
  if ((Number(result.restCountSpread) || 0) > 1) reasons.push(`restSpread=${result.restCountSpread}`);
  return reasons.join(', ');
}

function buildObservationRows(results, limit = OBSERVATION_LIMIT) {
  return results
    .filter((result) => !result.failures.length)
    .filter((result) => buildObservationReason(result))
    .slice()
    .sort(scenarioCommon.compareWorstResult)
    .slice(0, limit)
    .map((result) => ({
      scenario: result.scenario.name,
      observation: buildObservationReason(result),
      playSpread: result.playSpread,
      playSpreadExcess: result.playSpreadExcess || 0,
      maxConsecutivePlay: result.maxConsecutivePlay,
      exactRepeatCount: result.exactRepeatCount || 0,
      exactRepeatExcess: result.exactRepeatExcess || 0,
      partnerRepeats: result.partnerRepeats,
      opponentRepeats: result.opponentRepeats,
      partnerRepeatExcess: result.partnerRepeatExcess || 0,
      opponentRepeatExcess: result.opponentRepeatExcess || 0,
      executionProfile: result.executionProfile
    }));
}

function buildStructuralEqualRepeatBaselineRows(results) {
  const rowsByScope = new Map();
  results
    .filter((result) => result.scenario.mode === 'squad')
    .filter((result) => Number(result.scenario.squadAPlayers) === Number(result.scenario.squadBPlayers))
    .forEach((result) => {
      const scope = `${result.scenario.squadAPlayers}v${result.scenario.squadBPlayers}/${result.scenario.targetMatches}m/${result.scenario.courts}c`;
      if (!EQUAL_REPEAT_BASELINE_SCOPES.has(scope)) return;
      const row = {
        type: 'repeat-baseline',
        scenario: result.scenario.name,
        scope,
        playSpread: result.playSpread,
        playSpreadExcess: result.playSpreadExcess || 0,
        baseline: `partner=${result.partnerRepeatBaseline || 0}; opponent=${result.opponentRepeatBaseline || 0}`,
        maxConsecutivePlay: result.maxConsecutivePlay,
        partnerRepeatExcess: result.partnerRepeatExcess || 0,
        opponentRepeatExcess: result.opponentRepeatExcess || 0,
        note: ((Number(result.partnerRepeatExcess) || 0) > 0 || (Number(result.opponentRepeatExcess) || 0) > 0)
          ? `partnerExcess=${result.partnerRepeatExcess || 0}; opponentExcess=${result.opponentRepeatExcess || 0}`
          : 'repeatExcess=0/0；raw repeat 属于结构下限'
      };
      const existing = rowsByScope.get(scope);
      const rowRepeatExcess = (Number(row.partnerRepeatExcess) || 0) * 100 + (Number(row.opponentRepeatExcess) || 0);
      const existingRepeatExcess = existing
        ? ((Number(existing.partnerRepeatExcess) || 0) * 100 + (Number(existing.opponentRepeatExcess) || 0))
        : -1;
      if (
        !existing
        || rowRepeatExcess > existingRepeatExcess
        || row.maxConsecutivePlay > existing.maxConsecutivePlay
      ) {
        rowsByScope.set(scope, row);
      }
    });

  return [...rowsByScope.values()].sort((left, right) => {
    if (left.scope !== right.scope) return left.scope.localeCompare(right.scope, 'en', { numeric: true });
    return left.scenario.localeCompare(right.scenario, 'en', { numeric: true });
  });
}

function buildStructuralSquadExceptionRows(results) {
  const rowsByScope = new Map();
  results
    .filter((result) => result.scenario.mode === 'squad')
    .filter((result) => Number(result.scenario.squadAPlayers) !== Number(result.scenario.squadBPlayers))
    .forEach((result) => {
      const scope = `${result.scenario.squadAPlayers}v${result.scenario.squadBPlayers}/${result.scenario.targetMatches}m/${result.scenario.courts}c`;
      const row = {
        type: 'structural-baseline',
        scenario: result.scenario.name,
        scope,
        playSpread: result.playSpread,
        playSpreadExcess: result.playSpreadExcess || 0,
        baseline: result.globalPlaySpreadBaseline || 0,
        maxConsecutivePlay: result.maxConsecutivePlay,
        note: result.playSpreadExcess > 0
          ? `高于结构下限 ${result.playSpreadExcess}`
          : `global=${result.playSpread}；A/B spread=${result.squadAPlaySpread}/${result.squadBPlaySpread}`
      };
      const existing = rowsByScope.get(scope);
      if (
        !existing
        || row.playSpreadExcess > existing.playSpreadExcess
        || row.maxConsecutivePlay > existing.maxConsecutivePlay
      ) {
        rowsByScope.set(scope, row);
      }
    });

  return [...rowsByScope.values()]
    .sort((left, right) => {
      if (left.playSpreadExcess !== right.playSpreadExcess) return right.playSpreadExcess - left.playSpreadExcess;
      if (left.maxConsecutivePlay !== right.maxConsecutivePlay) return right.maxConsecutivePlay - left.maxConsecutivePlay;
      return left.scenario.localeCompare(right.scenario, 'en', { numeric: true });
    });
}

function buildAcceptedExceptionRows(results, mode) {
  return scenarioCommon.buildCoverageFirstExceptionRows(results)
    .filter((row) => row.mode === mode)
    .map((row) => ({
      type: 'coverage-first',
      scenario: row.case,
      scope: row.scope,
      playSpread: '',
      playSpreadExcess: '',
      baseline: row.structureLimit,
      maxConsecutivePlay: row.maxConsecutivePlay,
      note: row.note
    }));
}

function buildModeExceptionRows(results, mode) {
  const rows = [];
  if (mode === 'squad_doubles') {
    rows.push(...buildStructuralEqualRepeatBaselineRows(results));
    rows.push(...buildStructuralSquadExceptionRows(results));
  }
  rows.push(...buildAcceptedExceptionRows(results, mode));
  return rows;
}

function buildRotationPrefixCurveRows(results) {
  const resultMap = new Map(
    results
      .filter((result) => result.scenario.kind === 'rotation_template_audit')
      .map((result) => [`${result.scenario.caseKey}@${result.scenario.targetMatches}`, result])
  );

  return ROTATION_PREFIX_TRACKED_KEYS.flatMap((key) => {
    const caseData = matchOptions && matchOptions.cases ? matchOptions.cases[key] : null;
    if (!caseData) return [];
    const templateCase = templateLibrary && templateLibrary.cases ? templateLibrary.cases[key] : null;
    const coverageMatch = Number(templateCase && findCoverageMatch(templateCase)) || 0;
    const milestones = [
      1,
      coverageMatch,
      Number(caseData.balancedMatch) || 0,
      Number(caseData.horizonMatches) || 0
    ]
      .filter((value, index, list) => value > 0 && list.indexOf(value) === index)
      .sort((left, right) => left - right);

    return milestones.map((matches) => {
      const result = resultMap.get(`${key}@${matches}`);
      return result
        ? {
          case: key,
          matches,
          playSpread: result.playSpread,
          maxConsecutivePlay: result.maxConsecutivePlay,
          uniqueExactMatchupCount: result.uniqueExactMatchupCount,
          partnerRepeats: result.partnerRepeats,
          opponentRepeats: result.opponentRepeats,
          partnerCoveragePct: result.partnerCoveragePct,
          opponentCoveragePct: result.opponentCoveragePct
        }
        : null;
    }).filter(Boolean);
  });
}

function buildStabilitySection(rows) {
  return [
    '## 附录 D：多 Seed 稳定性',
    '',
    rows.length
      ? renderMarkdownTable(
        [
          { key: 'mode', label: 'mode' },
          { key: 'label', label: 'scenario' },
          { key: 'seeds', label: 'seeds' },
          { key: 'playSpreadRange', label: 'playSpreadRange' },
          { key: 'maxConsecutiveRange', label: 'maxConsecutiveRange' },
          { key: 'uniqueExactRange', label: 'uniqueExactRange' },
          { key: 'partnerRepeatsRange', label: 'partnerRepeatsRange' },
          { key: 'opponentRepeatsRange', label: 'opponentRepeatsRange' },
          { key: 'elapsedRange', label: 'elapsedRange' },
          { key: 'worstSeed', label: 'worstSeed' },
          { key: 'worstExecutionProfile', label: 'worstExecutionProfile' },
          { key: 'executionProfiles', label: 'executionProfiles' }
        ],
        rows
      )
      : 'none'
  ].join('\n');
}

function buildRotationPrefixCurveSection(rows) {
  return [
    '## 附录 E：multi_rotate 前缀质量曲线',
    '',
    rows.length
      ? renderMarkdownTable(
        [
          { key: 'case', label: 'case' },
          { key: 'matches', label: 'matches' },
          { key: 'playSpread', label: 'playSpread' },
          { key: 'maxConsecutivePlay', label: 'maxConsecutivePlay' },
          { key: 'uniqueExactMatchupCount', label: 'uniqueExactMatchupCount' },
          { key: 'partnerRepeats', label: 'partnerRepeats' },
          { key: 'opponentRepeats', label: 'opponentRepeats' },
          { key: 'partnerCoveragePct', label: 'partnerCoveragePct' },
          { key: 'opponentCoveragePct', label: 'opponentCoveragePct' }
        ],
        rows
      )
      : 'none'
  ].join('\n');
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
    '- matrixWarnings: `' + metadata.matrixWarningCount + '`',
    '- representativeWarnings: `' + metadata.representativeWarningCount + '`',
    '- totalWarnings: `' + metadata.totalWarningCount + '`',
    '- failures: `' + metadata.failureCount + '`'
  ].join('\n');
}

function buildRotationSection(audit, representative) {
  const templateResults = audit.results.filter((result) => result.scenario.kind === 'rotation_template_audit');
  const longtailResults = audit.results.filter((result) => result.scenario.kind === 'rotation_longtail_audit');
  const warnings = audit.warnings.filter((item) => item.mode === 'rotation');
  const failures = audit.failures.filter((item) => item.mode === 'rotation');
  const representativeResults = representative.results.filter((result) => result.scenario.mode === 'rotation');
  const allResults = representativeResults.concat(templateResults, longtailResults);

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
        { key: 'greedyFallbackRatio', label: 'greedyFallbackRatio' },
        { key: 'maxPlaySpread', label: 'maxPlaySpread' },
        { key: 'maxConsecutivePlay', label: 'maxConsecutivePlay' },
        { key: 'maxPartnerRepeats', label: 'maxPartnerRepeats' },
        { key: 'maxOpponentRepeats', label: 'maxOpponentRepeats' },
        { key: 'maxRestCountSpread', label: 'maxRestCountSpread' },
        { key: 'minPartnerCoveragePct', label: 'minPartnerCoveragePct' },
        { key: 'minOpponentCoveragePct', label: 'minOpponentCoveragePct' }
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
    renderNamedTable(
      '最差 5 个 Case',
      [
        { key: 'scenario', label: 'scenario' },
        { key: 'coverageLoss', label: 'coverageLoss' },
        { key: 'playSpread', label: 'playSpread' },
        { key: 'playSpreadExcess', label: 'playSpreadExcess' },
        { key: 'maxConsecutivePlay', label: 'maxConsecutivePlay' },
        { key: 'exactRepeatCount', label: 'exactRepeatCount' },
        { key: 'exactRepeatExcess', label: 'exactRepeatExcess' },
        { key: 'partnerRepeats', label: 'partnerRepeats' },
        { key: 'opponentRepeats', label: 'opponentRepeats' },
        { key: 'timeoutGuardTriggered', label: 'timeoutGuardTriggered' },
        { key: 'executionProfile', label: 'executionProfile' },
        { key: 'elapsedMs', label: 'elapsedMs' }
      ],
      buildWorstCaseRows(allResults)
    ),
    '',
    renderNamedTable(
      '最差 Unique Case',
      [
        { key: 'scenario', label: 'scenario' },
        { key: 'coverageLoss', label: 'coverageLoss' },
        { key: 'playSpread', label: 'playSpread' },
        { key: 'playSpreadExcess', label: 'playSpreadExcess' },
        { key: 'maxConsecutivePlay', label: 'maxConsecutivePlay' },
        { key: 'exactRepeatCount', label: 'exactRepeatCount' },
        { key: 'exactRepeatExcess', label: 'exactRepeatExcess' },
        { key: 'partnerRepeats', label: 'partnerRepeats' },
        { key: 'opponentRepeats', label: 'opponentRepeats' },
        { key: 'timeoutGuardTriggered', label: 'timeoutGuardTriggered' },
        { key: 'executionProfile', label: 'executionProfile' },
        { key: 'elapsedMs', label: 'elapsedMs' }
      ],
      buildWorstUniqueCaseRows(allResults)
    ),
    '',
    renderNamedTable(
      '评测观察项',
      [
        { key: 'scenario', label: 'scenario' },
        { key: 'observation', label: 'observation' },
        { key: 'playSpread', label: 'playSpread' },
        { key: 'playSpreadExcess', label: 'playSpreadExcess' },
        { key: 'maxConsecutivePlay', label: 'maxConsecutivePlay' },
        { key: 'exactRepeatCount', label: 'exactRepeatCount' },
        { key: 'exactRepeatExcess', label: 'exactRepeatExcess' },
        { key: 'partnerRepeats', label: 'partnerRepeats' },
        { key: 'opponentRepeats', label: 'opponentRepeats' },
        { key: 'executionProfile', label: 'executionProfile' }
      ],
      buildObservationRows(allResults)
    ),
    '',
    renderNamedTable(
      '可接受例外',
      [
        { key: 'type', label: 'type' },
        { key: 'scenario', label: 'scenario' },
        { key: 'scope', label: 'scope' },
        { key: 'baseline', label: 'baseline' },
        { key: 'maxConsecutivePlay', label: 'maxConsecutivePlay' },
        { key: 'note', label: 'note' }
      ],
      buildModeExceptionRows(allResults, 'multi_rotate')
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
  const allResults = representativeResults.concat(equalResults, unevenResults);

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
        { key: 'greedyFallbackRatio', label: 'greedyFallbackRatio' },
        { key: 'maxPlaySpread', label: 'maxPlaySpread' },
        { key: 'maxConsecutivePlay', label: 'maxConsecutivePlay' },
        { key: 'maxPartnerRepeats', label: 'maxPartnerRepeats' },
        { key: 'maxOpponentRepeats', label: 'maxOpponentRepeats' },
        { key: 'maxRestCountSpread', label: 'maxRestCountSpread' },
        { key: 'minPartnerCoveragePct', label: 'minPartnerCoveragePct' },
        { key: 'minOpponentCoveragePct', label: 'minOpponentCoveragePct' }
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
    renderNamedTable(
      '最差 5 个 Case',
      [
        { key: 'scenario', label: 'scenario' },
        { key: 'coverageLoss', label: 'coverageLoss' },
        { key: 'playSpread', label: 'playSpread' },
        { key: 'playSpreadExcess', label: 'playSpreadExcess' },
        { key: 'maxConsecutivePlay', label: 'maxConsecutivePlay' },
        { key: 'exactRepeatCount', label: 'exactRepeatCount' },
        { key: 'exactRepeatExcess', label: 'exactRepeatExcess' },
        { key: 'partnerRepeats', label: 'partnerRepeats' },
        { key: 'opponentRepeats', label: 'opponentRepeats' },
        { key: 'partnerRepeatExcess', label: 'partnerRepeatExcess' },
        { key: 'opponentRepeatExcess', label: 'opponentRepeatExcess' },
        { key: 'timeoutGuardTriggered', label: 'timeoutGuardTriggered' },
        { key: 'executionProfile', label: 'executionProfile' },
        { key: 'elapsedMs', label: 'elapsedMs' }
      ],
      buildWorstCaseRows(allResults)
    ),
    '',
    renderNamedTable(
      '最差 Unique Case',
      [
        { key: 'scenario', label: 'scenario' },
        { key: 'coverageLoss', label: 'coverageLoss' },
        { key: 'playSpread', label: 'playSpread' },
        { key: 'playSpreadExcess', label: 'playSpreadExcess' },
        { key: 'maxConsecutivePlay', label: 'maxConsecutivePlay' },
        { key: 'exactRepeatCount', label: 'exactRepeatCount' },
        { key: 'exactRepeatExcess', label: 'exactRepeatExcess' },
        { key: 'partnerRepeats', label: 'partnerRepeats' },
        { key: 'opponentRepeats', label: 'opponentRepeats' },
        { key: 'partnerRepeatExcess', label: 'partnerRepeatExcess' },
        { key: 'opponentRepeatExcess', label: 'opponentRepeatExcess' },
        { key: 'timeoutGuardTriggered', label: 'timeoutGuardTriggered' },
        { key: 'executionProfile', label: 'executionProfile' },
        { key: 'elapsedMs', label: 'elapsedMs' }
      ],
      buildWorstUniqueCaseRows(allResults)
    ),
    '',
    renderNamedTable(
      '评测观察项',
      [
        { key: 'scenario', label: 'scenario' },
        { key: 'observation', label: 'observation' },
        { key: 'playSpread', label: 'playSpread' },
        { key: 'playSpreadExcess', label: 'playSpreadExcess' },
        { key: 'maxConsecutivePlay', label: 'maxConsecutivePlay' },
        { key: 'exactRepeatCount', label: 'exactRepeatCount' },
        { key: 'exactRepeatExcess', label: 'exactRepeatExcess' },
        { key: 'partnerRepeats', label: 'partnerRepeats' },
        { key: 'opponentRepeats', label: 'opponentRepeats' },
        { key: 'partnerRepeatExcess', label: 'partnerRepeatExcess' },
        { key: 'opponentRepeatExcess', label: 'opponentRepeatExcess' },
        { key: 'executionProfile', label: 'executionProfile' }
      ],
      buildObservationRows(allResults)
    ),
    '',
    renderNamedTable(
      '结构性 / 可接受例外',
      [
        { key: 'type', label: 'type' },
        { key: 'scenario', label: 'scenario' },
        { key: 'scope', label: 'scope' },
        { key: 'playSpread', label: 'playSpread' },
        { key: 'playSpreadExcess', label: 'playSpreadExcess' },
        { key: 'baseline', label: 'baseline' },
        { key: 'maxConsecutivePlay', label: 'maxConsecutivePlay' },
        { key: 'note', label: 'note' }
      ],
      buildModeExceptionRows(allResults, 'squad_doubles')
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

function buildCoverageFirstExceptionRows(report) {
  return scenarioCommon.buildCoverageFirstExceptionRows(
    []
      .concat(report && report.audit && Array.isArray(report.audit.results) ? report.audit.results : [])
      .concat(report && report.representative && Array.isArray(report.representative.results) ? report.representative.results : [])
  ).map((row) => ({
    mode: row.mode,
    case: row.case,
    scope: row.scope,
    structureLimit: row.structureLimit,
    actualMaxConsecutivePlay: row.maxConsecutivePlay,
    executionProfile: row.executionProfile,
    fallbackReason: row.fallbackReason || '',
    note: row.note
  }));
}

function buildCoverageFirstExceptionSection(report) {
  const rows = buildCoverageFirstExceptionRows(report);
  return [
    '## 附录 C：coverage-first 例外',
    '',
    rows.length
      ? renderMarkdownTable(
        [
          { key: 'mode', label: 'mode' },
          { key: 'case', label: 'case' },
          { key: 'scope', label: 'scope' },
          { key: 'structureLimit', label: 'structureLimit' },
          { key: 'actualMaxConsecutivePlay', label: 'actualMaxConsecutivePlay' },
          { key: 'executionProfile', label: 'executionProfile' },
          { key: 'fallbackReason', label: 'fallbackReason' },
          { key: 'note', label: 'note' }
        ],
        rows
      )
      : 'none'
  ].join('\n');
}

function renderSchedulerFullAuditMarkdown(report) {
  const recommendationRows = Array.isArray(report.recommendationRows) ? report.recommendationRows : [];
  const coverageRows = Array.isArray(report.coverageRows) ? report.coverageRows : [];
  const stabilityRows = Array.isArray(report.stabilityRows) ? report.stabilityRows : [];
  const rotationPrefixCurveRows = Array.isArray(report.rotationPrefixCurveRows) ? report.rotationPrefixCurveRows : [];
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
      : 'none',
    '',
    buildCoverageFirstExceptionSection(report),
    '',
    buildStabilitySection(stabilityRows),
    '',
    buildRotationPrefixCurveSection(rotationPrefixCurveRows)
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
    matrixWarningCount: auditWarnings.length,
    representativeWarningCount: representativeWarnings.length,
    totalWarningCount: auditWarnings.length + representativeWarnings.length,
    failureCount: auditMatrix.failures.length
  };

  const recommendationAuditRows = buildRecommendationAuditRows(matchOptions && matchOptions.cases);
  const recommendationAuditIssues = buildRecommendationAuditIssues(recommendationAuditRows);
  const stabilityRows = scenarioCommon.runExtendedStabilityMatrix();
  const rotationPrefixCurveRows = buildRotationPrefixCurveRows(auditMatrix.results);

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
    coverageRows: buildCoverageAppendixRows(buildMultiRotateRecommendationRows()),
    stabilityRows,
    rotationPrefixCurveRows
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
    + `scenarios=${report.metadata.auditScenarioCount} warnings=${report.metadata.totalWarningCount} failures=${report.metadata.failureCount}`
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
  buildCoverageFirstExceptionRows,
  buildCoverageFirstExceptionSection,
  buildWorstCaseRows,
  buildWorstUniqueCaseRows,
  buildObservationRows,
  buildModeExceptionRows,
  buildRotationPrefixCurveRows,
  buildStabilitySection,
  buildRotationPrefixCurveSection,
  buildRecommendationRationalitySection,
  renderSchedulerFullAuditMarkdown,
  buildReportData,
  writeReportFile
};
