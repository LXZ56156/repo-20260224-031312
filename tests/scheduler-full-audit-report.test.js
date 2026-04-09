const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const report = require('../scripts/generate-scheduler-full-audit');
const matchOptions = require('../miniprogram/core/ux/multiRotateMatchOptions');

function buildRepresentativeResult(name, mode, overrides = {}) {
  return {
    scenario: {
      name,
      mode,
      maxElapsedMs: overrides.maxElapsedMs || 300
    },
    elapsedMs: overrides.elapsedMs || 123,
    executionProfile: overrides.executionProfile || 'beam',
    timeoutGuardTriggered: overrides.timeoutGuardTriggered === true,
    fallbackReason: overrides.fallbackReason || '',
    playSpread: overrides.playSpread || 0,
    maxConsecutivePlay: overrides.maxConsecutivePlay || 1,
    uniqueExactMatchupCount: overrides.uniqueExactMatchupCount || 8,
    warnings: overrides.warnings || [],
    failures: overrides.failures || []
  };
}

test('scheduler full audit recommendation appendix covers all multi_rotate cases', () => {
  const rows = report.buildMultiRotateRecommendationRows();
  const expectedCases = matchOptions && matchOptions.cases ? matchOptions.cases : {};
  const rowMap = Object.fromEntries(rows.map((row) => [row.key, row]));

  assert.equal(rows.length, Object.keys(expectedCases).length);

  for (const [key, caseData] of Object.entries(expectedCases)) {
    const row = rowMap[key];
    assert.ok(row, key);
    assert.equal(row.presetMatches, caseData.presetMatches.join(' / '), `${key} presetMatches`);
    assert.equal(row.balancedMatch, caseData.balancedMatch, `${key} balancedMatch`);
  }

  assert.equal(rowMap['6p-1c'].coverageMatch, '8');
  assert.equal(rowMap['7p-1c'].coverageMatch, '11');
  assert.equal(rowMap['8p-2c'].coverageMatch, '14');
  assert.equal(rowMap['9p-1c'].coverageMatch, '18');
  assert.equal(rowMap['9p-2c'].coverageMatch, '18');
});

test('scheduler full audit markdown renders required sections and none placeholders', () => {
  const markdown = report.renderSchedulerFullAuditMarkdown({
    metadata: {
      generatedAt: '2026-04-09T00:00:00.000Z',
      commit: 'abc1234',
      dirty: false,
      auditScenarioCount: 857,
      representativeScenarioCount: 16,
      warningCount: 0,
      failureCount: 1
    },
    audit: {
      results: [],
      warnings: [],
      failures: [{ scenario: 'rotation template 8p-2c@8', mode: 'rotation', code: 'elapsed_ms', message: 'elapsedMs=999' }]
    },
    representative: {
      results: [
        buildRepresentativeResult('rotation 8p/8m/2c', 'rotation'),
        buildRepresentativeResult('squad 4v4/12m/1c', 'squad', { executionProfile: 'beam-guarded', timeoutGuardTriggered: true })
      ],
      warnings: [],
      failures: []
    },
    modeSummaryRows: [
      {
        mode: 'multi_rotate',
        scenarios: 600,
        warnings: 0,
        failures: 1,
        avgElapsedMs: 12,
        maxElapsedMs: 250,
        guardedRatio: '1/600 (0%)',
        greedyFallbackRatio: '0/600 (0%)'
      },
      {
        mode: 'squad_doubles',
        scenarios: 257,
        warnings: 0,
        failures: 0,
        avgElapsedMs: 100,
        maxElapsedMs: 2200,
        guardedRatio: '100/257 (39%)',
        greedyFallbackRatio: '10/257 (4%)'
      }
    ],
    recommendationAuditRows: [
      { key: '20p-2c', players: 20, courts: 2, horizonMatches: 18, highestPreset: 18, balancedMatch: 15, capacitySuggested: 15 },
      { key: '20p-3c', players: 20, courts: 3, horizonMatches: 18, highestPreset: 18, balancedMatch: 18, capacitySuggested: 18 }
    ],
    recommendationAuditIssues: [],
    recommendationRows: report.buildMultiRotateRecommendationRows().slice(0, 3),
    coverageRows: report.buildCoverageAppendixRows(report.buildMultiRotateRecommendationRows()).slice(0, 2)
  });

  assert.match(markdown, /^# 排阵算法全量审计与推荐场数报告/m);
  assert.match(markdown, /^## 执行摘要$/m);
  assert.match(markdown, /^## multi_rotate 审计$/m);
  assert.match(markdown, /^## multi_rotate 推荐合理性$/m);
  assert.match(markdown, /^## squad_doubles 审计$/m);
  assert.match(markdown, /^## fixed_pair_rr 摘要$/m);
  assert.match(markdown, /^## 附录 A：multi_rotate 当前推荐场数$/m);
  assert.match(markdown, /^## 附录 B：coverage 长带说明$/m);
  assert.match(markdown, /### 警告项\n\nnone/m);
  assert.match(markdown, /1\/2\/3\/5\/10/);
  assert.match(markdown, /rotation template 8p-2c@8/);
});

test('scheduler full audit report writer persists markdown even with failures present', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-full-audit-'));
  const outputPath = path.join(tmpDir, 'scheduler-full-audit.md');
  const markdown = report.renderSchedulerFullAuditMarkdown({
    metadata: {
      generatedAt: '2026-04-09T00:00:00.000Z',
      commit: 'abc1234',
      dirty: true,
      auditScenarioCount: 1,
      representativeScenarioCount: 0,
      warningCount: 0,
      failureCount: 1
    },
    audit: {
      results: [],
      warnings: [],
      failures: [{ scenario: 'rotation longtail 10p/23m/2c budget=200', mode: 'rotation', code: 'elapsed_ms', message: 'elapsedMs=2000' }]
    },
    representative: {
      results: [],
      warnings: [],
      failures: []
    },
    modeSummaryRows: [
      {
        mode: 'multi_rotate',
        scenarios: 1,
        warnings: 0,
        failures: 1,
        avgElapsedMs: 2000,
        maxElapsedMs: 2000,
        guardedRatio: '1/1 (100%)',
        greedyFallbackRatio: '0/1 (0%)'
      },
      {
        mode: 'squad_doubles',
        scenarios: 0,
        warnings: 0,
        failures: 0,
        avgElapsedMs: 0,
        maxElapsedMs: 0,
        guardedRatio: '0/0 (0%)',
        greedyFallbackRatio: '0/0 (0%)'
      }
    ],
    recommendationAuditRows: [
      { key: '24p-3c', players: 24, courts: 3, horizonMatches: 18, highestPreset: 18, balancedMatch: 18, capacitySuggested: 21 }
    ],
    recommendationAuditIssues: [
      { key: '24p-3c', code: 'large_roster_shortfall', message: 'balanced=18 capacitySuggested=21' }
    ],
    recommendationRows: report.buildMultiRotateRecommendationRows().slice(0, 1),
    coverageRows: []
  });

  report.writeReportFile(outputPath, markdown);

  assert.equal(fs.existsSync(outputPath), true);
  const content = fs.readFileSync(outputPath, 'utf8');
  assert.match(content, /rotation longtail 10p\/23m\/2c budget=200/);
  assert.match(content, /large_roster_shortfall/);
  assert.match(content, /^## 附录 A：multi_rotate 当前推荐场数$/m);
});
