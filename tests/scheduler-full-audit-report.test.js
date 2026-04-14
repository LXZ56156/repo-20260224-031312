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
      maxElapsedMs: overrides.maxElapsedMs || 300,
      ...(overrides.scenario || {})
    },
    elapsedMs: overrides.elapsedMs || 123,
    actualMatches: overrides.actualMatches || ((overrides.scenario && overrides.scenario.targetMatches) || 8),
    executionProfile: overrides.executionProfile || 'beam',
    timeoutGuardTriggered: overrides.timeoutGuardTriggered === true,
    fallbackReason: overrides.fallbackReason || '',
    playSpread: overrides.playSpread || 0,
    playSpreadExcess: overrides.playSpreadExcess || 0,
    globalPlaySpreadBaseline: overrides.globalPlaySpreadBaseline || 0,
    squadAPlaySpread: overrides.squadAPlaySpread || 0,
    squadBPlaySpread: overrides.squadBPlaySpread || 0,
    maxConsecutivePlay: overrides.maxConsecutivePlay || 1,
    uniqueExactMatchupCount: overrides.uniqueExactMatchupCount || 8,
    exactRepeatCount: overrides.exactRepeatCount || 0,
    exactRepeatBaseline: overrides.exactRepeatBaseline || 0,
    exactRepeatExcess: overrides.exactRepeatExcess || 0,
    partnerRepeats: overrides.partnerRepeats || 0,
    opponentRepeats: overrides.opponentRepeats || 0,
    partnerRepeatBaseline: overrides.partnerRepeatBaseline || 0,
    opponentRepeatBaseline: overrides.opponentRepeatBaseline || 0,
    partnerRepeatExcess: overrides.partnerRepeatExcess || 0,
    opponentRepeatExcess: overrides.opponentRepeatExcess || 0,
    partnerCoveragePct: overrides.partnerCoveragePct || 100,
    opponentCoveragePct: overrides.opponentCoveragePct || 100,
    restCountSpread: overrides.restCountSpread || 0,
    totalRounds: overrides.totalRounds || ((overrides.scenario && overrides.scenario.logicalRounds) || 2),
    effectiveCourts: overrides.effectiveCourts || ((overrides.scenario && overrides.scenario.courts) || 1),
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
      matrixWarningCount: 0,
      representativeWarningCount: 1,
      totalWarningCount: 1,
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
        buildRepresentativeResult('squad 4v4/12m/1c', 'squad', { executionProfile: 'beam-guarded', timeoutGuardTriggered: true }),
        buildRepresentativeResult('squad 10v10/20m/4c', 'squad', {
          executionProfile: 'beam-guarded',
          timeoutGuardTriggered: true,
          fallbackReason: 'guarded_greedy_completion',
          maxConsecutivePlay: 4,
          scenario: {
            courts: 4,
            totalMatches: 20,
            targetMatches: 20,
            logicalRounds: 5,
            squadAPlayers: 10,
            squadBPlayers: 10,
            coverageFirstExceptionId: 'squad-10v10-20m-4c'
          }
        })
      ],
      warnings: [{ scenario: 'squad 10v10/20m/4c', mode: 'squad', code: 'soft_deadline_guard', message: 'representative-only warning' }],
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
    coverageRows: report.buildCoverageAppendixRows(report.buildMultiRotateRecommendationRows()).slice(0, 2),
    stabilityRows: [
      {
        mode: 'multi_rotate',
        label: 'rotation 9p/18m/2c',
        seeds: '1, 7, 17',
        playSpreadRange: '0-0',
        maxConsecutiveRange: '8-8',
        uniqueExactRange: '18-18',
        partnerRepeatsRange: '0-0',
        opponentRepeatsRange: '12-12',
        elapsedRange: '1-2',
        worstSeed: 1,
        worstExecutionProfile: 'template',
        executionProfiles: 'template:3'
      }
    ],
    rotationPrefixCurveRows: [
      {
        case: '6p-1c',
        matches: 13,
        playSpread: 0,
        maxConsecutivePlay: 4,
        uniqueExactMatchupCount: 13,
        partnerRepeats: 0,
        opponentRepeats: 2,
        partnerCoveragePct: 87,
        opponentCoveragePct: 73
      }
    ]
  });

  assert.match(markdown, /^# 排阵算法全量审计与推荐场数报告/m);
  assert.match(markdown, /^## 执行摘要$/m);
  assert.match(markdown, /^## multi_rotate 审计$/m);
  assert.match(markdown, /^## multi_rotate 推荐合理性$/m);
  assert.match(markdown, /^## squad_doubles 审计$/m);
  assert.match(markdown, /^## fixed_pair_rr 摘要$/m);
  assert.match(markdown, /^## 附录 A：multi_rotate 当前推荐场数$/m);
  assert.match(markdown, /^## 附录 B：coverage 长带说明$/m);
  assert.match(markdown, /^## 附录 C：coverage-first 例外$/m);
  assert.match(markdown, /^## 附录 D：多 Seed 稳定性$/m);
  assert.match(markdown, /^## 附录 E：multi_rotate 前缀质量曲线$/m);
  assert.match(markdown, /^### 最差 5 个 Case$/m);
  assert.match(markdown, /^### 最差 Unique Case$/m);
  assert.match(markdown, /^### 评测观察项$/m);
  assert.match(markdown, /^### 结构性 \/ 可接受例外$/m);
  assert.match(markdown, /### 警告项\n\nnone/m);
  assert.match(markdown, /matrixWarnings: `0`/);
  assert.match(markdown, /representativeWarnings: `1`/);
  assert.match(markdown, /totalWarnings: `1`/);
  assert.match(markdown, /1\/2\/3\/5\/10/);
  assert.match(markdown, /rotation template 8p-2c@8/);
  assert.match(markdown, /10v10\/20m\/4c/);
  assert.match(markdown, /rotation 9p\/18m\/2c/);
  assert.match(markdown, /\| 6p-1c \| 13 \| 0 \| 4 \| 13 \| 0 \| 2 \| 87 \| 73 \|/);
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
      matrixWarningCount: 1,
      representativeWarningCount: 0,
      totalWarningCount: 1,
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

test('scheduler full audit exception appendix deduplicates accepted coverage-first rows', () => {
  const rows = report.buildCoverageFirstExceptionRows({
    audit: {
      results: [
        buildRepresentativeResult('rotation template 6p-1c@18', 'rotation', {
          maxConsecutivePlay: 4,
          totalRounds: 18,
          scenario: {
            kind: 'rotation_template_audit',
            playersCount: 6,
            courts: 1,
            targetMatches: 18,
            coverageFirstExceptionId: 'rotation-6p-1c'
          },
          effectiveCourts: 1
        })
      ]
    },
    representative: {
      results: [
        buildRepresentativeResult('squad 10v10/20m/4c', 'squad', {
          executionProfile: 'beam-guarded',
          fallbackReason: 'guarded_greedy_completion',
          maxConsecutivePlay: 4,
          scenario: {
            courts: 4,
            totalMatches: 20,
            targetMatches: 20,
            logicalRounds: 5,
            squadAPlayers: 10,
            squadBPlayers: 10,
            coverageFirstExceptionId: 'squad-10v10-20m-4c'
          }
        })
      ]
    }
  });

  assert.deepEqual(
    rows.map((row) => row.case),
    ['6p-1c', '10v10/20m/4c']
  );
  assert.equal(rows[0].structureLimit, 3);
  assert.equal(rows[0].actualMaxConsecutivePlay, 4);
  assert.equal(rows[1].executionProfile, 'beam-guarded');
});

test('scheduler full audit mode exception rows separate structural uneven and coverage-first cases', () => {
  const rows = report.buildModeExceptionRows([
    buildRepresentativeResult('squad uneven 3v4/9m/1c', 'squad', {
      playSpread: 2,
      playSpreadExcess: 0,
      globalPlaySpreadBaseline: 2,
      squadAPlaySpread: 0,
      squadBPlaySpread: 1,
      scenario: {
        targetMatches: 9,
        courts: 1,
        squadAPlayers: 3,
        squadBPlayers: 4
      }
    }),
    buildRepresentativeResult('squad 10v10/20m/4c', 'squad', {
      maxConsecutivePlay: 4,
      scenario: {
        targetMatches: 20,
        courts: 4,
        totalMatches: 20,
        logicalRounds: 5,
        squadAPlayers: 10,
        squadBPlayers: 10,
        coverageFirstExceptionId: 'squad-10v10-20m-4c'
      }
    })
  ], 'squad_doubles');

  assert.deepEqual(rows.map((row) => row.type), ['structural-baseline', 'coverage-first']);
  assert.match(rows[0].note, /global=2/);
});

test('scheduler full audit mode exception rows include repeat baseline notes for tracked equal hotspots', () => {
  const rows = report.buildModeExceptionRows([
    buildRepresentativeResult('squad equal 4v4/12m/2c', 'squad', {
      playSpread: 0,
      partnerRepeats: 12,
      opponentRepeats: 32,
      partnerRepeatBaseline: 12,
      opponentRepeatBaseline: 32,
      partnerRepeatExcess: 0,
      opponentRepeatExcess: 0,
      scenario: {
        targetMatches: 12,
        courts: 2,
        squadAPlayers: 4,
        squadBPlayers: 4
      }
    }),
    buildRepresentativeResult('squad equal 6v6/18m/3c', 'squad', {
      playSpread: 0,
      partnerRepeats: 13,
      opponentRepeats: 36,
      partnerRepeatBaseline: 6,
      opponentRepeatBaseline: 36,
      partnerRepeatExcess: 7,
      opponentRepeatExcess: 0,
      scenario: {
        targetMatches: 18,
        courts: 3,
        squadAPlayers: 6,
        squadBPlayers: 6
      }
    })
  ], 'squad_doubles');

  const repeatRows = rows.filter((row) => row.type === 'repeat-baseline');
  assert.deepEqual(repeatRows.map((row) => row.scope), ['4v4/12m/2c', '6v6/18m/3c']);
  assert.match(repeatRows[0].note, /repeatExcess=0\/0/);
  assert.match(repeatRows[1].note, /partnerExcess=7/);
});

test('scheduler full audit worst-case rows sort by coverage then fairness pressure', () => {
  const rows = report.buildWorstCaseRows([
    buildRepresentativeResult('rotation A', 'rotation', {
      actualMatches: 7,
      scenario: { targetMatches: 8 },
      playSpread: 0,
      maxConsecutivePlay: 2
    }),
    buildRepresentativeResult('rotation B', 'rotation', {
      actualMatches: 8,
      scenario: { targetMatches: 8 },
      playSpread: 2,
      maxConsecutivePlay: 5
    }),
    buildRepresentativeResult('rotation C', 'rotation', {
      actualMatches: 8,
      scenario: { targetMatches: 8 },
      playSpread: 1,
      maxConsecutivePlay: 3
    })
  ]);

  assert.deepEqual(rows.map((row) => row.scenario), ['rotation A', 'rotation B', 'rotation C']);
});

test('scheduler full audit worst-case rows rank equal squad hotspots by repeat excess instead of raw repeat', () => {
  const rows = report.buildWorstCaseRows([
    buildRepresentativeResult('squad equal 4v4/12m/2c', 'squad', {
      partnerRepeats: 12,
      opponentRepeats: 32,
      partnerRepeatBaseline: 12,
      opponentRepeatBaseline: 32,
      partnerRepeatExcess: 0,
      opponentRepeatExcess: 0,
      maxConsecutivePlay: 6,
      scenario: { targetMatches: 12, squadAPlayers: 4, squadBPlayers: 4, courts: 2 }
    }),
    buildRepresentativeResult('squad equal 6v6/18m/3c', 'squad', {
      partnerRepeats: 13,
      opponentRepeats: 36,
      partnerRepeatBaseline: 6,
      opponentRepeatBaseline: 36,
      partnerRepeatExcess: 7,
      opponentRepeatExcess: 0,
      maxConsecutivePlay: 6,
      scenario: { targetMatches: 18, squadAPlayers: 6, squadBPlayers: 6, courts: 3 }
    })
  ]);

  assert.deepEqual(rows.map((row) => row.scenario), ['squad equal 6v6/18m/3c', 'squad equal 4v4/12m/2c']);
  assert.equal(rows[0].partnerRepeatExcess, 7);
  assert.equal(rows[1].partnerRepeatExcess, 0);
});

test('scheduler full audit worst-case rows rank exact-repeat regressions ahead of pure repeat pressure', () => {
  const rows = report.buildWorstCaseRows([
    buildRepresentativeResult('squad exact-repeat regression', 'squad', {
      actualMatches: 6,
      uniqueExactMatchupCount: 2,
      exactRepeatCount: 4,
      exactRepeatBaseline: 0,
      exactRepeatExcess: 4,
      partnerRepeats: 4,
      opponentRepeats: 8,
      scenario: { targetMatches: 6, squadAPlayers: 4, squadBPlayers: 4, courts: 1 }
    }),
    buildRepresentativeResult('squad repeat-only pressure', 'squad', {
      actualMatches: 12,
      uniqueExactMatchupCount: 12,
      exactRepeatCount: 0,
      exactRepeatBaseline: 0,
      exactRepeatExcess: 0,
      partnerRepeats: 16,
      opponentRepeats: 32,
      partnerRepeatBaseline: 0,
      opponentRepeatBaseline: 0,
      partnerRepeatExcess: 16,
      opponentRepeatExcess: 32,
      scenario: { targetMatches: 12, squadAPlayers: 8, squadBPlayers: 8, courts: 2 }
    })
  ]);

  assert.equal(rows[0].scenario, 'squad exact-repeat regression');
  assert.equal(rows[0].exactRepeatExcess, 4);
});

test('scheduler full audit observation rows explain equal squad repeats with excess metrics', () => {
  const rows = report.buildObservationRows([
    buildRepresentativeResult('squad equal 4v4/12m/2c', 'squad', {
      partnerRepeats: 12,
      opponentRepeats: 32,
      partnerRepeatBaseline: 12,
      opponentRepeatBaseline: 32,
      partnerRepeatExcess: 0,
      opponentRepeatExcess: 0,
      scenario: { targetMatches: 12, squadAPlayers: 4, squadBPlayers: 4, courts: 2 }
    }),
    buildRepresentativeResult('squad equal 7v7/18m/3c', 'squad', {
      partnerRepeats: 4,
      opponentRepeats: 23,
      partnerRepeatBaseline: 0,
      opponentRepeatBaseline: 23,
      partnerRepeatExcess: 4,
      opponentRepeatExcess: 0,
      maxConsecutivePlay: 6,
      scenario: { targetMatches: 18, squadAPlayers: 7, squadBPlayers: 7, courts: 3 }
    })
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].scenario, 'squad equal 7v7/18m/3c');
  assert.match(rows[0].observation, /partnerRepeatExcess=4/);
  assert.doesNotMatch(rows[0].observation, /opponentRepeats=23/);
});

test('scheduler full audit worst-case rows rank squad cases by playSpreadExcess instead of raw playSpread', () => {
  const rows = report.buildWorstCaseRows([
    buildRepresentativeResult('squad structural', 'squad', {
      playSpread: 2,
      playSpreadExcess: 0,
      globalPlaySpreadBaseline: 2,
      scenario: { targetMatches: 9, squadAPlayers: 3, squadBPlayers: 4, courts: 1 }
    }),
    buildRepresentativeResult('squad degraded', 'squad', {
      playSpread: 1,
      playSpreadExcess: 1,
      globalPlaySpreadBaseline: 0,
      scenario: { targetMatches: 9, squadAPlayers: 4, squadBPlayers: 4, courts: 1 }
    })
  ]);

  assert.deepEqual(rows.map((row) => row.scenario), ['squad degraded', 'squad structural']);
});

test('scheduler full audit worst unique-case rows deduplicate repeated case prefixes', () => {
  const rows = report.buildWorstUniqueCaseRows([
    buildRepresentativeResult('rotation template 9p-2c@15', 'rotation', {
      playSpread: 1,
      maxConsecutivePlay: 7,
      scenario: { caseKey: '9p-2c', targetMatches: 15, playersCount: 9, courts: 2 }
    }),
    buildRepresentativeResult('rotation template 9p-2c@18', 'rotation', {
      playSpread: 0,
      maxConsecutivePlay: 8,
      scenario: { caseKey: '9p-2c', targetMatches: 18, playersCount: 9, courts: 2 }
    }),
    buildRepresentativeResult('rotation template 8p-2c@16', 'rotation', {
      playSpread: 0,
      maxConsecutivePlay: 8,
      scenario: { caseKey: '8p-2c', targetMatches: 16, playersCount: 8, courts: 2 }
    })
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.scenario), ['rotation template 9p-2c@18', 'rotation template 8p-2c@16']);
});

test('scheduler full audit observation rows keep non-failing guarded and repeat-heavy cases', () => {
  const rows = report.buildObservationRows([
    buildRepresentativeResult('squad guard', 'squad', {
      executionProfile: 'beam-guarded',
      timeoutGuardTriggered: true,
      partnerRepeats: 2
    }),
    buildRepresentativeResult('clean case', 'rotation'),
    buildRepresentativeResult('repeat case', 'rotation', {
      opponentRepeats: 5
    })
  ]);

  assert.deepEqual(rows.map((row) => row.scenario), ['repeat case', 'squad guard']);
  assert.match(rows[0].observation, /opponentRepeats=5/);
  assert.match(rows[1].observation, /timeout-guard/);
  assert.match(rows[1].observation, /partnerRepeats=2/);
});

test('scheduler full audit observation rows ignore structural uneven playSpread when there is no excess', () => {
  const rows = report.buildObservationRows([
    buildRepresentativeResult('squad structural only', 'squad', {
      playSpread: 2,
      playSpreadExcess: 0,
      globalPlaySpreadBaseline: 2,
      scenario: { squadAPlayers: 3, squadBPlayers: 4, targetMatches: 9, courts: 1 }
    }),
    buildRepresentativeResult('squad excess', 'squad', {
      playSpread: 2,
      playSpreadExcess: 1,
      globalPlaySpreadBaseline: 1,
      scenario: { squadAPlayers: 4, squadBPlayers: 4, targetMatches: 9, courts: 1 }
    })
  ]);

  assert.deepEqual(rows.map((row) => row.scenario), ['squad excess']);
  assert.match(rows[0].observation, /playSpreadExcess=1/);
});

test('scheduler full audit observation rows surface exact-repeat excess explicitly', () => {
  const rows = report.buildObservationRows([
    buildRepresentativeResult('squad exact-repeat regression', 'squad', {
      actualMatches: 12,
      uniqueExactMatchupCount: 2,
      exactRepeatCount: 10,
      exactRepeatBaseline: 0,
      exactRepeatExcess: 10,
      partnerRepeats: 20,
      opponentRepeats: 40,
      scenario: { targetMatches: 12, squadAPlayers: 4, squadBPlayers: 4, courts: 1 }
    })
  ]);

  assert.equal(rows.length, 1);
  assert.match(rows[0].observation, /exactRepeatExcess=10/);
  assert.equal(rows[0].exactRepeatCount, 10);
});
