# 排阵算法全量审计与推荐场数报告

- 生成时间: `2026-04-14T16:35:19.428Z`
- 当前 commit: `c2b2a66`
- 工作区脏状态: `dirty`
- 矩阵场景数: `960`
- 代表性场景数: `16`
- matrixWarnings: `0`
- representativeWarnings: `0`
- totalWarnings: `0`
- failures: `0`

## 执行摘要

| mode | scenarios | warnings | failures | avgElapsedMs | maxElapsedMs | guardedRatio | greedyFallbackRatio |
| --- | --- | --- | --- | --- | --- | --- | --- |
| multi_rotate | 912 | 0 | 0 | 2 | 521 | 4/912 (0%) | 0/912 (0%) |
| squad_doubles | 48 | 0 | 0 | 873 | 2219 | 7/48 (15%) | 0/48 (0%) |

## multi_rotate 审计

| group | scenarios | warnings | failures | avgElapsedMs | maxElapsedMs | guardedRatio | greedyFallbackRatio | maxPlaySpread | maxConsecutivePlay | maxPartnerRepeats | maxOpponentRepeats | maxRestCountSpread | minPartnerCoveragePct | minOpponentCoveragePct |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| template matrix | 908 | 0 | 0 | 0 | 5 | 0/908 (0%) | 0/908 (0%) | 1 | 8 | 21 | 57 | 1 | 1 | 1 |
| longtail matrix | 4 | 0 | 0 | 315 | 521 | 4/4 (100%) | 0/4 (0%) | 1 | 4 | 3 | 47 | 1 | 34 | 68 |

### 最差 5 个 Case

| scenario | coverageLoss | playSpread | playSpreadExcess | maxConsecutivePlay | exactRepeatCount | exactRepeatExcess | partnerRepeats | opponentRepeats | timeoutGuardTriggered | executionProfile | elapsedMs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rotation template 6p-1c@18 | 0 | 0 | 0 | 4 | 0 | 0 | 21 | 57 | false | template | 1 |
| rotation template 5p-1c@15 | 0 | 0 | 0 | 4 | 0 | 0 | 20 | 50 | false | template | 1 |
| rotation template 6p-1c@17 | 0 | 1 | 0 | 4 | 0 | 0 | 19 | 53 | false | template | 1 |
| rotation template 5p-1c@14 | 0 | 1 | 0 | 4 | 0 | 0 | 18 | 46 | false | template | 1 |
| rotation template 6p-1c@16 | 0 | 1 | 0 | 4 | 0 | 0 | 17 | 49 | false | template | 1 |

### 最差 Unique Case

| scenario | coverageLoss | playSpread | playSpreadExcess | maxConsecutivePlay | exactRepeatCount | exactRepeatExcess | partnerRepeats | opponentRepeats | timeoutGuardTriggered | executionProfile | elapsedMs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rotation template 6p-1c@18 | 0 | 0 | 0 | 4 | 0 | 0 | 21 | 57 | false | template | 1 |
| rotation template 5p-1c@15 | 0 | 0 | 0 | 4 | 0 | 0 | 20 | 50 | false | template | 1 |
| rotation template 7p-1c@18 | 0 | 1 | 0 | 2 | 0 | 0 | 15 | 51 | false | template | 1 |
| rotation template 15p-1c@22 | 0 | 1 | 0 | 1 | 0 | 0 | 5 | 44 | false | template | 1 |
| rotation template 8p-2c@16 | 0 | 0 | 0 | 8 | 0 | 0 | 4 | 36 | false | template | 0 |

### 评测观察项

| scenario | observation | playSpread | playSpreadExcess | maxConsecutivePlay | exactRepeatCount | exactRepeatExcess | partnerRepeats | opponentRepeats | executionProfile |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rotation template 6p-1c@18 | partnerRepeats=21, opponentRepeats=57 | 0 | 0 | 4 | 0 | 0 | 21 | 57 | template |
| rotation template 5p-1c@15 | partnerRepeats=20, opponentRepeats=50 | 0 | 0 | 4 | 0 | 0 | 20 | 50 | template |
| rotation template 6p-1c@17 | partnerRepeats=19, opponentRepeats=53 | 1 | 0 | 4 | 0 | 0 | 19 | 53 | template |
| rotation template 5p-1c@14 | partnerRepeats=18, opponentRepeats=46 | 1 | 0 | 4 | 0 | 0 | 18 | 46 | template |
| rotation template 6p-1c@16 | partnerRepeats=17, opponentRepeats=49 | 1 | 0 | 4 | 0 | 0 | 17 | 49 | template |

### 可接受例外

| type | scenario | scope | baseline | maxConsecutivePlay | note |
| --- | --- | --- | --- | --- | --- |
| coverage-first | 6p-1c | 默认档 8/13/18；审计例外区间 5-18 场 | 3 | 4 | 为保 15 对搭档覆盖与当前 repeat 水平，当前模板允许 maxConsecutivePlay=4，暂不降档。 |
| coverage-first | 9p-2c | balanced=18；审计例外区间 17-18 场 | 8 | 8 | 保留 balancedMatch=18，以维持 18 个 unique exact matchups 与 0 partner repeat。 |

### 代表性场景

| scenario | status | elapsedMs | maxElapsedMs | executionProfile | timeoutGuardTriggered | fallbackReason | playSpread | maxConsecutivePlay | uniqueExactMatchupCount | exactRepeatCount | partnerRepeats | opponentRepeats | restCountSpread |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rotation 6p/12m/1c | pass | 1 | 300 | template | false |  | 0 | 4 | 12 | 0 | 9 | 33 | 0 |
| rotation 8p/8m/2c | pass | 1 | 300 | template | false |  | 0 | 4 | 8 | 0 | 0 | 4 | 0 |
| rotation 9p/12m/1c | pass | 1 | 300 | template | false |  | 1 | 1 | 12 | 0 | 0 | 16 | 1 |
| rotation 10p/18m/2c | pass | 1 | 300 | template | false |  | 1 | 4 | 18 | 0 | 0 | 28 | 1 |
| rotation 12p/12m/2c | pass | 0 | 300 | template | false |  | 0 | 2 | 12 | 0 | 0 | 0 | 0 |
| rotation 14p/12m/4c | pass | 1 | 300 | template | false |  | 1 | 4 | 12 | 0 | 0 | 0 | 0 |
| rotation 16p/12m/4c | pass | 0 | 300 | template | false |  | 0 | 3 | 12 | 0 | 0 | 0 | 0 |
| rotation 20p/12m/1c | pass | 1 | 300 | template | false |  | 1 | 1 | 12 | 0 | 0 | 11 | 1 |
| rotation 24p/12m/2c | pass | 1 | 300 | template | false |  | 0 | 1 | 12 | 0 | 0 | 0 | 0 |
| rotation 10p/23m/2c budget=200 | pass | 236 | 1500 | beam-guarded | true | guarded_greedy_completion | 1 | 4 | 23 | 0 | 3 | 47 | 1 |

### 失败项

none

### 警告项

none

## multi_rotate 推荐合理性

| caseCount | issueCount | largeRosterShortfall | monotonicityIssues | collapsedPresetIssues |
| --- | --- | --- | --- | --- |
| 60 | 0 | 0 | 0 | 0 |

### 异常项

none

## squad_doubles 审计

| group | scenarios | warnings | failures | avgElapsedMs | maxElapsedMs | guardedRatio | greedyFallbackRatio | maxPlaySpread | maxConsecutivePlay | maxPartnerRepeats | maxOpponentRepeats | maxRestCountSpread | minPartnerCoveragePct | minOpponentCoveragePct |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| equal matrix | 45 | 0 | 0 | 845 | 2219 | 7/45 (16%) | 0/45 (0%) | 1 | 6 | 12 | 36 | 1 | 7 | 12 |
| uneven matrix | 3 | 0 | 0 | 1289 | 1701 | 0/3 (0%) | 0/3 (0%) | 2 | 4 | 15 | 28 | 2 | 56 | 100 |

### 最差 5 个 Case

| scenario | coverageLoss | playSpread | playSpreadExcess | maxConsecutivePlay | exactRepeatCount | exactRepeatExcess | partnerRepeats | opponentRepeats | partnerRepeatExcess | opponentRepeatExcess | timeoutGuardTriggered | executionProfile | elapsedMs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| squad uneven 5v4/12m/1c | 0 | 2 | 0 | 1 | 0 | 0 | 15 | 28 | 15 | 28 | false | beam-quality | 1701 |
| squad 8v8/16m/2c | 0 | 0 | 0 | 1 | 0 | 0 | 12 | 32 | 12 | 32 | false | beam-quality | 1702 |
| squad equal 9v9/18m/3c | 0 | 0 | 0 | 2 | 0 | 0 | 10 | 2 | 10 | 2 | false | beam-quality | 1700 |
| squad uneven 3v4/9m/1c | 0 | 2 | 0 | 2 | 0 | 0 | 9 | 24 | 9 | 24 | false | beam-quality | 466 |
| squad 3v4/9m/1c | 0 | 2 | 0 | 2 | 0 | 0 | 9 | 24 | 9 | 24 | false | beam-quality | 427 |

### 最差 Unique Case

| scenario | coverageLoss | playSpread | playSpreadExcess | maxConsecutivePlay | exactRepeatCount | exactRepeatExcess | partnerRepeats | opponentRepeats | partnerRepeatExcess | opponentRepeatExcess | timeoutGuardTriggered | executionProfile | elapsedMs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| squad uneven 5v4/12m/1c | 0 | 2 | 0 | 1 | 0 | 0 | 15 | 28 | 15 | 28 | false | beam-quality | 1701 |
| squad 8v8/16m/2c | 0 | 0 | 0 | 1 | 0 | 0 | 12 | 32 | 12 | 32 | false | beam-quality | 1702 |
| squad equal 9v9/18m/3c | 0 | 0 | 0 | 2 | 0 | 0 | 10 | 2 | 10 | 2 | false | beam-quality | 1700 |
| squad uneven 3v4/9m/1c | 0 | 2 | 0 | 2 | 0 | 0 | 9 | 24 | 9 | 24 | false | beam-quality | 466 |
| squad 3v4/9m/1c | 0 | 2 | 0 | 2 | 0 | 0 | 9 | 24 | 9 | 24 | false | beam-quality | 427 |

### 评测观察项

| scenario | observation | playSpread | playSpreadExcess | maxConsecutivePlay | exactRepeatCount | exactRepeatExcess | partnerRepeats | opponentRepeats | partnerRepeatExcess | opponentRepeatExcess | executionProfile |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| squad uneven 5v4/12m/1c | partnerRepeats=15, opponentRepeats=28, restSpread=2 | 2 | 0 | 1 | 0 | 0 | 15 | 28 | 15 | 28 | beam-quality |
| squad 8v8/16m/2c | partnerRepeatExcess=12, opponentRepeatExcess=32 | 0 | 0 | 1 | 0 | 0 | 12 | 32 | 12 | 32 | beam-quality |
| squad equal 9v9/18m/3c | partnerRepeatExcess=10, opponentRepeatExcess=2 | 0 | 0 | 2 | 0 | 0 | 10 | 2 | 10 | 2 | beam-quality |
| squad uneven 3v4/9m/1c | partnerRepeats=9, opponentRepeats=24, restSpread=2 | 2 | 0 | 2 | 0 | 0 | 9 | 24 | 9 | 24 | beam-quality |
| squad 3v4/9m/1c | partnerRepeats=9, opponentRepeats=24, restSpread=2 | 2 | 0 | 2 | 0 | 0 | 9 | 24 | 9 | 24 | beam-quality |

### 结构性 / 可接受例外

| type | scenario | scope | playSpread | playSpreadExcess | baseline | maxConsecutivePlay | note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| repeat-baseline | squad equal 4v4/12m/2c | 4v4/12m/2c | 0 | 0 | partner=12; opponent=32 | 6 | repeatExcess=0/0；raw repeat 属于结构下限 |
| repeat-baseline | squad equal 6v6/18m/3c | 6v6/18m/3c | 0 | 0 | partner=6; opponent=36 | 6 | repeatExcess=0/0；raw repeat 属于结构下限 |
| repeat-baseline | squad equal 7v7/18m/3c | 7v7/18m/3c | 1 | 0 | partner=0; opponent=23 | 6 | repeatExcess=0/0；raw repeat 属于结构下限 |
| structural-baseline | squad uneven 6v5/12m/2c | 6v5/12m/2c | 1 | 0 | 1 | 4 | global=1；A/B spread=0/1 |
| structural-baseline | squad 3v4/9m/1c | 3v4/9m/1c | 2 | 0 | 2 | 2 | global=2；A/B spread=0/1 |
| structural-baseline | squad uneven 5v4/12m/1c | 5v4/12m/1c | 2 | 0 | 2 | 1 | global=2；A/B spread=1/0 |
| coverage-first | 10v10/20m/4c | 20 场 / 4 片 / 5 轮 |  |  | 3 | 4 | 当前 deterministic guarded completion 先保 playSpread=0 与完整 20 场输出，暂未找到 <=3 的 coverage 等价解。 |

### 代表性场景

| scenario | status | elapsedMs | maxElapsedMs | executionProfile | timeoutGuardTriggered | fallbackReason | playSpread | maxConsecutivePlay | uniqueExactMatchupCount | exactRepeatCount | partnerRepeats | opponentRepeats | restCountSpread |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| squad 4v4/12m/1c | pass | 11 | 2500 | beam-quality | false |  | 0 | 2 | 12 | 0 | 12 | 32 | 0 |
| squad 5v5/12m/2c | pass | 1701 | 2500 | beam-quality | false |  | 1 | 4 | 12 | 0 | 8 | 23 | 1 |
| squad 6v6/12m/2c | pass | 1701 | 6000 | beam-quality | false |  | 0 | 2 | 12 | 0 | 0 | 12 | 0 |
| squad 8v8/16m/2c | pass | 1702 | 6000 | beam-quality | false |  | 0 | 1 | 16 | 0 | 12 | 32 | 0 |
| squad 10v10/20m/4c | pass | 2114 | 6000 | beam-guarded | true | guarded_greedy_completion | 0 | 4 | 20 | 0 | 1 | 0 | 0 |
| squad 3v4/9m/1c | pass | 427 | 2500 | beam-quality | false |  | 2 | 2 | 9 | 0 | 9 | 24 | 2 |

### 失败项

none

### 警告项

none

## fixed_pair_rr 摘要

- 当前快捷轮次固定为 `1/2/3/5/10`。
- 总场次换算公式为 `C(teamCount,2) * cycle`，且共享上限为 `10` 轮。
- 当合法队伍少于 `2` 支时，不展示快捷轮次，也不生成对应推荐总场次。

| shortcut | totalMatches | note |
| --- | --- | --- |
| 1轮 | C(teamCount,2) * 1 | 快捷切换轮次 |
| 2轮 | C(teamCount,2) * 2 | 快捷切换轮次 |
| 3轮 | C(teamCount,2) * 3 | 快捷切换轮次 |
| 5轮 | C(teamCount,2) * 5 | 快捷切换轮次 |
| 10轮 | C(teamCount,2) * 10 | 共享上限 10 轮 |

## 附录 A：multi_rotate 当前推荐场数

| case | players | effectiveCourts | horizonMatches | presetMatches | balancedMatch | coverageMatch |
| --- | --- | --- | --- | --- | --- | --- |
| 4p-1c | 4 | 1 | 3 | 1 / 2 / 3 | 2 | 3 |
| 5p-1c | 5 | 1 | 15 | 5 / 10 / 15 | 10 | 5 |
| 6p-1c | 6 | 1 | 18 | 8 / 13 / 18 | 13 | 8 |
| 7p-1c | 7 | 1 | 18 | 11 / 16 / 18 | 16 | 11 |
| 8p-1c | 8 | 1 | 12 | 4 / 6 / 8 | 6 |  |
| 8p-2c | 8 | 2 | 16 | 8 / 14 / 16 | 14 | 14 |
| 9p-1c | 9 | 1 | 18 | 8 / 9 / 18 | 18 | 18 |
| 9p-2c | 9 | 2 | 18 | 9 / 10 / 18 | 18 | 18 |
| 10p-1c | 10 | 1 | 12 | 5 / 8 / 10 | 10 |  |
| 10p-2c | 10 | 2 | 22 | 5 / 10 / 15 | 10 |  |
| 11p-1c | 11 | 1 | 12 | 7 / 9 / 11 | 7 |  |
| 11p-2c | 11 | 2 | 12 | 8 / 10 / 11 | 8 |  |
| 12p-1c | 12 | 1 | 12 | 6 / 9 / 12 | 9 |  |
| 12p-2c | 12 | 2 | 12 | 6 / 9 / 12 | 9 |  |
| 12p-3c | 12 | 3 | 12 | 6 / 9 / 12 | 12 |  |
| 13p-1c | 13 | 1 | 12 | 6 / 8 / 10 | 8 |  |
| 13p-2c | 13 | 2 | 12 | 8 / 10 / 12 | 10 |  |
| 13p-3c | 13 | 3 | 16 | 11 / 13 / 14 | 11 |  |
| 14p-1c | 14 | 1 | 18 | 7 / 11 / 14 | 14 |  |
| 14p-2c | 14 | 2 | 12 | 7 / 11 / 12 | 11 |  |
| 14p-3c | 14 | 3 | 16 | 7 / 14 / 15 | 14 |  |
| 15p-1c | 15 | 1 | 22 | 9 / 11 / 15 | 9 |  |
| 15p-2c | 15 | 2 | 12 | 9 / 11 / 12 | 11 |  |
| 15p-3c | 15 | 3 | 16 | 13 / 15 / 16 | 13 |  |
| 16p-1c | 16 | 1 | 12 | 4 / 8 / 12 | 12 |  |
| 16p-2c | 16 | 2 | 16 | 8 / 12 / 16 | 12 |  |
| 16p-3c | 16 | 3 | 12 | 4 / 8 / 12 | 12 |  |
| 16p-4c | 16 | 4 | 16 | 8 / 12 / 16 | 12 |  |
| 17p-1c | 17 | 1 | 12 | 9 / 11 / 12 | 11 |  |
| 17p-2c | 17 | 2 | 18 | 10 / 13 / 16 | 13 |  |
| 17p-3c | 17 | 3 | 16 | 12 / 15 / 16 | 15 |  |
| 17p-4c | 17 | 4 | 16 | 12 / 15 / 16 | 15 |  |
| 18p-1c | 18 | 1 | 12 | 9 / 11 / 12 | 11 |  |
| 18p-2c | 18 | 2 | 18 | 11 / 14 / 17 | 14 |  |
| 18p-3c | 18 | 3 | 16 | 13 / 15 / 16 | 16 |  |
| 18p-4c | 18 | 4 | 16 | 13 / 15 / 16 | 16 |  |
| 19p-1c | 19 | 1 | 12 | 9 / 11 / 12 | 12 |  |
| 19p-2c | 19 | 2 | 18 | 11 / 14 / 17 | 14 |  |
| 19p-3c | 19 | 3 | 16 | 13 / 15 / 16 | 16 |  |
| 19p-4c | 19 | 4 | 16 | 13 / 15 / 16 | 16 |  |
| 20p-1c | 20 | 1 | 18 | 5 / 10 / 15 | 15 |  |
| 20p-2c | 20 | 2 | 18 | 12 / 15 / 18 | 15 |  |
| 20p-3c | 20 | 3 | 18 | 14 / 17 / 18 | 18 |  |
| 20p-4c | 20 | 4 | 16 | 14 / 15 / 16 | 16 |  |
| 21p-1c | 21 | 1 | 18 | 10 / 13 / 16 | 13 |  |
| 21p-2c | 21 | 2 | 16 | 13 / 15 / 16 | 16 |  |
| 21p-3c | 21 | 3 | 18 | 14 / 17 / 18 | 18 |  |
| 21p-4c | 21 | 4 | 16 | 14 / 15 / 16 | 16 |  |
| 22p-1c | 22 | 1 | 12 | 10 / 11 / 12 | 12 |  |
| 22p-2c | 22 | 2 | 16 | 13 / 15 / 16 | 16 |  |
| 22p-3c | 22 | 3 | 18 | 15 / 17 / 18 | 18 |  |
| 22p-4c | 22 | 4 | 16 | 14 / 15 / 16 | 16 |  |
| 23p-1c | 23 | 1 | 12 | 10 / 11 / 12 | 12 |  |
| 23p-2c | 23 | 2 | 16 | 13 / 15 / 16 | 16 |  |
| 23p-3c | 23 | 3 | 18 | 16 / 17 / 18 | 18 |  |
| 23p-4c | 23 | 4 | 16 | 14 / 15 / 16 | 16 |  |
| 24p-1c | 24 | 1 | 16 | 12 / 15 / 16 | 15 |  |
| 24p-2c | 24 | 2 | 18 | 6 / 12 / 18 | 18 |  |
| 24p-3c | 24 | 3 | 18 | 16 / 17 / 18 | 18 |  |
| 24p-4c | 24 | 4 | 16 | 14 / 15 / 16 | 16 |  |

## 附录 B：coverage 长带说明

| case | presetMatches | balancedMatch | coverageMatch | note |
| --- | --- | --- | --- | --- |
| 6p-1c | 8 / 13 / 18 | 13 | 8 | 最早 coverage 里程碑已经落在 8 场，后续两档继续沿长赛事带上移，避免回落到过短赛程。 |
| 7p-1c | 11 / 16 / 18 | 16 | 11 | 要纳入最早 coverage=11，同时保持高质量前缀，三档会整体偏长。 |
| 8p-2c | 8 / 14 / 16 | 14 | 14 | coverage=14 落在 8 和 16 之间，规则会用 14 替换中档，得到 8/14/16。 |

## 附录 C：coverage-first 例外

| mode | case | scope | structureLimit | actualMaxConsecutivePlay | executionProfile | fallbackReason | note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| multi_rotate | 6p-1c | 默认档 8/13/18；审计例外区间 5-18 场 | 3 | 4 | template |  | 为保 15 对搭档覆盖与当前 repeat 水平，当前模板允许 maxConsecutivePlay=4，暂不降档。 |
| multi_rotate | 9p-2c | balanced=18；审计例外区间 17-18 场 | 8 | 8 | template |  | 保留 balancedMatch=18，以维持 18 个 unique exact matchups 与 0 partner repeat。 |
| squad_doubles | 10v10/20m/4c | 20 场 / 4 片 / 5 轮 | 3 | 4 | beam-guarded | guarded_greedy_completion | 当前 deterministic guarded completion 先保 playSpread=0 与完整 20 场输出，暂未找到 <=3 的 coverage 等价解。 |

## 附录 D：多 Seed 稳定性

| mode | scenario | seeds | playSpreadRange | maxConsecutiveRange | uniqueExactRange | partnerRepeatsRange | opponentRepeatsRange | elapsedRange | worstSeed | worstExecutionProfile | executionProfiles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| multi_rotate | rotation 8p-2c/13m | 1, 7 | 1-1 | 7-7 | 13-13 | 0-0 | 24-24 | 1-2 | 7 | template | template:2 |
| multi_rotate | rotation 8p-2c/14m | 1, 7 | 0-0 | 7-7 | 14-14 | 0-0 | 28-28 | 0-1 | 7 | template | template:2 |
| multi_rotate | rotation 8p-2c/15m | 1, 7 | 1-1 | 8-8 | 15-15 | 2-2 | 32-32 | 0-0 | 1 | template | template:2 |
| multi_rotate | rotation 8p-2c/16m | 1, 7 | 0-0 | 8-8 | 16-16 | 4-4 | 36-36 | 0-0 | 1 | template | template:2 |
| multi_rotate | rotation 9p-2c/15m | 1, 7 | 1-1 | 7-7 | 15-15 | 0-0 | 25-25 | 0-0 | 1 | template | template:2 |
| multi_rotate | rotation 9p-2c/16m | 1, 7 | 1-1 | 8-8 | 16-16 | 0-0 | 29-29 | 0-0 | 1 | template | template:2 |
| multi_rotate | rotation 9p-2c/17m | 1, 7 | 1-1 | 8-8 | 17-17 | 0-0 | 32-32 | 0-0 | 1 | template | template:2 |
| multi_rotate | rotation 9p-2c/18m | 1, 7 | 0-0 | 8-8 | 18-18 | 0-0 | 36-36 | 0-0 | 1 | template | template:2 |
| multi_rotate | rotation 10p/23m/2c budget=200 | 1, 17 | 1-1 | 4-4 | 23-23 | 1-4 | 47-47 | 223-235 | 1 | beam-guarded | beam-guarded:2 |
| multi_rotate | rotation 11p/14m/2c budget=800 | 1, 17 | 1-1 | 3-3 | 14-14 | 0-0 | 8-9 | 218-226 | 1 | beam-guarded | beam-guarded:2 |
| multi_rotate | rotation 13p/16m/2c budget=800 | 1, 17 | 1-1 | 2-2 | 16-16 | 0-0 | 4-6 | 244-248 | 17 | beam-guarded | beam-guarded:2 |
| multi_rotate | rotation 15p/18m/3c budget=1200 | 1, 17 | 1-1 | 4-4 | 18-18 | 0-0 | 1-2 | 522-526 | 17 | beam-guarded | beam-guarded:2 |
| squad_doubles | squad 3v4/9m/1c | 1, 17 | 2-2 | 2-2 | 9-9 | 9-9 | 24-24 | 381-382 | 17 | beam-quality | beam-quality:2 |
| squad_doubles | squad 5v4/12m/1c | 1, 17 | 2-2 | 1-1 | 12-12 | 15-15 | 28-28 | 1620-1644 | 17 | beam-quality | beam-quality:2 |
| squad_doubles | squad 6v5/12m/2c | 1, 17 | 1-1 | 4-4 | 12-12 | 4-5 | 18-18 | 1701-1701 | 1 | beam-quality | beam-quality:2 |
| squad_doubles | squad 7v7/18m/3c | 1, 2 | 1-1 | 6-6 | 18-18 | 0-0 | 23-23 | 2100-2101 | 1 | beam-quality | beam-quality:2 |
| squad_doubles | squad 9v9/24m/4c | 1, 2 | 1-1 | 6-6 | 24-24 | 4-4 | 15-16 | 2142-2161 | 2 | beam-guarded | beam-guarded:2 |
| squad_doubles | squad 10v10/20m/4c | 1, 2 | 0-0 | 4-4 | 20-20 | 1-2 | 0-1 | 2058-2081 | 2 | beam-guarded | beam-guarded:2 |

## 附录 E：multi_rotate 前缀质量曲线

| case | matches | playSpread | maxConsecutivePlay | uniqueExactMatchupCount | partnerRepeats | opponentRepeats | partnerCoveragePct | opponentCoveragePct |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 6p-1c | 1 | 1 | 1 | 1 | 0 | 0 | 13 | 27 |
| 6p-1c | 8 | 1 | 4 | 8 | 1 | 17 | 100 | 100 |
| 6p-1c | 13 | 1 | 4 | 13 | 11 | 37 | 100 | 100 |
| 6p-1c | 18 | 0 | 4 | 18 | 21 | 57 | 100 | 100 |
| 9p-2c | 1 | 1 | 1 | 1 | 0 | 0 | 6 | 11 |
| 9p-2c | 18 | 0 | 8 | 18 | 0 | 36 | 100 | 100 |
| 17p-1c | 1 | 1 | 1 | 1 | 0 | 0 | 1 | 3 |
| 17p-1c | 11 | 1 | 1 | 11 | 0 | 6 | 16 | 28 |
| 17p-1c | 12 | 1 | 1 | 12 | 0 | 7 | 18 | 30 |
| 24p-2c | 1 | 1 | 1 | 1 | 0 | 0 | 1 | 1 |
| 24p-2c | 18 | 0 | 1 | 18 | 0 | 0 | 13 | 26 |