# 排阵算法全量审计与推荐场数报告

- 生成时间: `2026-04-29T08:38:41.236Z`
- 当前 commit: `f114d20`
- 工作区脏状态: `dirty`
- 矩阵场景数: `990`
- 代表性场景数: `16`
- matrixWarnings: `0`
- representativeWarnings: `0`
- totalWarnings: `0`
- failures: `0`

## 执行摘要

| mode | scenarios | warnings | failures | avgElapsedMs | maxElapsedMs | guardedRatio | greedyFallbackRatio |
| --- | --- | --- | --- | --- | --- | --- | --- |
| multi_rotate | 942 | 0 | 0 | 2 | 479 | 4/942 (0%) | 0/942 (0%) |
| squad_doubles | 48 | 0 | 0 | 732 | 2101 | 3/48 (6%) | 0/48 (0%) |

## multi_rotate 审计

| group | scenarios | warnings | failures | avgElapsedMs | maxElapsedMs | guardedRatio | greedyFallbackRatio | maxPlaySpread | maxConsecutivePlay | maxPartnerRepeats | maxOpponentRepeats | maxRestCountSpread | minPartnerCoveragePct | minOpponentCoveragePct |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| template matrix | 938 | 0 | 0 | 1 | 10 | 0/938 (0%) | 0/938 (0%) | 1 | 8 | 21 | 75 | 1 | 1 | 1 |
| longtail matrix | 4 | 0 | 0 | 287 | 479 | 4/4 (100%) | 0/4 (0%) | 1 | 4 | 17 | 79 | 1 | 34 | 68 |

### 最差 5 个 Case

| scenario | coverageLoss | playSpread | playSpreadExcess | maxConsecutivePlay | exactRepeatCount | exactRepeatExcess | partnerRepeats | opponentRepeats | timeoutGuardTriggered | executionProfile | elapsedMs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rotation template 6p-1c@18 | 0 | 0 | 0 | 4 | 0 | 0 | 21 | 57 | false | template | 1 |
| rotation template 5p-1c@15 | 0 | 0 | 0 | 4 | 0 | 0 | 20 | 50 | false | template | 0 |
| rotation template 6p-1c@17 | 0 | 1 | 0 | 4 | 0 | 0 | 19 | 53 | false | template | 0 |
| rotation template 5p-1c@14 | 0 | 1 | 0 | 4 | 0 | 0 | 18 | 46 | false | template | 1 |
| rotation longtail 10p/31m/2c budget=200 | 0 | 1 | 0 | 4 | 0 | 0 | 17 | 79 | true | beam-guarded | 231 |

### 最差 Unique Case

| scenario | coverageLoss | playSpread | playSpreadExcess | maxConsecutivePlay | exactRepeatCount | exactRepeatExcess | partnerRepeats | opponentRepeats | timeoutGuardTriggered | executionProfile | elapsedMs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rotation template 6p-1c@18 | 0 | 0 | 0 | 4 | 0 | 0 | 21 | 57 | false | template | 1 |
| rotation template 5p-1c@15 | 0 | 0 | 0 | 4 | 0 | 0 | 20 | 50 | false | template | 0 |
| rotation longtail 10p/31m/2c budget=200 | 0 | 1 | 0 | 4 | 0 | 0 | 17 | 79 | true | beam-guarded | 231 |
| rotation template 10p-2c@30 | 0 | 0 | 0 | 4 | 0 | 0 | 15 | 75 | false | template | 1 |
| rotation template 10p-1c@30 | 0 | 0 | 0 | 2 | 0 | 0 | 15 | 75 | false | template | 1 |

### 评测观察项

| scenario | observation | playSpread | playSpreadExcess | maxConsecutivePlay | exactRepeatCount | exactRepeatExcess | partnerRepeats | opponentRepeats | executionProfile |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rotation template 6p-1c@18 | partnerRepeats=21, opponentRepeats=57 | 0 | 0 | 4 | 0 | 0 | 21 | 57 | template |
| rotation template 5p-1c@15 | partnerRepeats=20, opponentRepeats=50 | 0 | 0 | 4 | 0 | 0 | 20 | 50 | template |
| rotation template 6p-1c@17 | partnerRepeats=19, opponentRepeats=53 | 1 | 0 | 4 | 0 | 0 | 19 | 53 | template |
| rotation template 5p-1c@14 | partnerRepeats=18, opponentRepeats=46 | 1 | 0 | 4 | 0 | 0 | 18 | 46 | template |
| rotation longtail 10p/31m/2c budget=200 | timeout-guard, guarded-profile, partnerRepeats=17, opponentRepeats=79 | 1 | 0 | 4 | 0 | 0 | 17 | 79 | beam-guarded |

### 可接受例外

| type | scenario | scope | baseline | maxConsecutivePlay | note |
| --- | --- | --- | --- | --- | --- |
| coverage-first | 6p-1c | coverage-first 默认档 8；审计例外区间 5-18 场 | 3 | 4 | 8 场完成 15 对搭档覆盖；为保持当前 repeat 水平，模板允许 maxConsecutivePlay=4。 |
| coverage-first | 9p-2c | balanced=18；审计例外区间 17-18 场 | 8 | 8 | 保留 balancedMatch=18，以维持 18 个 unique exact matchups 与 0 partner repeat。 |

### 代表性场景

| scenario | status | elapsedMs | maxElapsedMs | executionProfile | timeoutGuardTriggered | fallbackReason | playSpread | maxConsecutivePlay | uniqueExactMatchupCount | exactRepeatCount | partnerRepeats | opponentRepeats | restCountSpread |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rotation 6p/12m/1c | pass | 9 | 300 | template | false |  | 0 | 3 | 12 | 0 | 9 | 33 | 0 |
| rotation 8p/8m/2c | pass | 1 | 300 | template | false |  | 0 | 4 | 8 | 0 | 0 | 4 | 0 |
| rotation 9p/12m/1c | pass | 6 | 300 | template | false |  | 1 | 1 | 12 | 0 | 0 | 16 | 1 |
| rotation 10p/18m/2c | pass | 1 | 300 | template | false |  | 1 | 4 | 18 | 0 | 0 | 28 | 1 |
| rotation 12p/12m/2c | pass | 1 | 300 | template | false |  | 0 | 2 | 12 | 0 | 0 | 0 | 0 |
| rotation 14p/12m/4c | pass | 1 | 300 | template | false |  | 1 | 4 | 12 | 0 | 0 | 0 | 1 |
| rotation 16p/12m/4c | pass | 0 | 300 | template | false |  | 0 | 3 | 12 | 0 | 0 | 0 | 0 |
| rotation 20p/12m/1c | pass | 8 | 300 | template | false |  | 1 | 1 | 12 | 0 | 0 | 11 | 1 |
| rotation 24p/12m/2c | pass | 2 | 300 | template | false |  | 0 | 1 | 12 | 0 | 0 | 0 | 0 |
| rotation 10p/23m/2c budget=300 | pass | 1 | 1500 | template | false |  | 1 | 4 | 23 | 0 | 1 | 49 | 1 |

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
| equal matrix | 45 | 0 | 0 | 699 | 2101 | 3/45 (7%) | 0/45 (0%) | 1 | 6 | 12 | 36 | 1 | 7 | 12 |
| uneven matrix | 3 | 0 | 0 | 1217 | 1701 | 0/3 (0%) | 0/3 (0%) | 2 | 4 | 15 | 28 | 2 | 56 | 100 |

### 最差 5 个 Case

| scenario | coverageLoss | playSpread | playSpreadExcess | maxConsecutivePlay | exactRepeatCount | exactRepeatExcess | partnerRepeats | opponentRepeats | partnerRepeatExcess | opponentRepeatExcess | timeoutGuardTriggered | executionProfile | elapsedMs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| squad equal 8v8/12m/2c | 0 | 0 | 0 | 1 | 0 | 0 | 8 | 16 | 8 | 16 | false | beam-quality | 1701 |
| squad equal 8v8/18m/3c | 0 | 1 | 0 | 3 | 0 | 0 | 7 | 13 | 7 | 5 | true | beam-guarded | 1737 |
| squad uneven 5v4/12m/1c | 0 | 2 | 0 | 1 | 0 | 0 | 15 | 28 | 7 | 0 | false | beam-quality | 1594 |
| squad equal 6v6/9m/3c | 0 | 0 | 0 | 3 | 0 | 0 | 6 | 0 | 6 | 0 | false | beam-quality | 7 |
| squad equal 10v10/24m/4c | 0 | 1 | 0 | 4 | 0 | 0 | 4 | 6 | 4 | 6 | true | beam-guarded | 2019 |

### 最差 Unique Case

| scenario | coverageLoss | playSpread | playSpreadExcess | maxConsecutivePlay | exactRepeatCount | exactRepeatExcess | partnerRepeats | opponentRepeats | partnerRepeatExcess | opponentRepeatExcess | timeoutGuardTriggered | executionProfile | elapsedMs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| squad equal 8v8/12m/2c | 0 | 0 | 0 | 1 | 0 | 0 | 8 | 16 | 8 | 16 | false | beam-quality | 1701 |
| squad equal 8v8/18m/3c | 0 | 1 | 0 | 3 | 0 | 0 | 7 | 13 | 7 | 5 | true | beam-guarded | 1737 |
| squad uneven 5v4/12m/1c | 0 | 2 | 0 | 1 | 0 | 0 | 15 | 28 | 7 | 0 | false | beam-quality | 1594 |
| squad equal 6v6/9m/3c | 0 | 0 | 0 | 3 | 0 | 0 | 6 | 0 | 6 | 0 | false | beam-quality | 7 |
| squad equal 10v10/24m/4c | 0 | 1 | 0 | 4 | 0 | 0 | 4 | 6 | 4 | 6 | true | beam-guarded | 2019 |

### 评测观察项

| scenario | observation | playSpread | playSpreadExcess | maxConsecutivePlay | exactRepeatCount | exactRepeatExcess | partnerRepeats | opponentRepeats | partnerRepeatExcess | opponentRepeatExcess | executionProfile |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| squad equal 8v8/12m/2c | partnerRepeatExcess=8, opponentRepeatExcess=16 | 0 | 0 | 1 | 0 | 0 | 8 | 16 | 8 | 16 | beam-quality |
| squad equal 8v8/18m/3c | timeout-guard, guarded-profile, partnerRepeatExcess=7, opponentRepeatExcess=5 | 1 | 0 | 3 | 0 | 0 | 7 | 13 | 7 | 5 | beam-guarded |
| squad uneven 5v4/12m/1c | partnerRepeatExcess=7, restSpread=2 | 2 | 0 | 1 | 0 | 0 | 15 | 28 | 7 | 0 | beam-quality |
| squad equal 6v6/9m/3c | partnerRepeatExcess=6 | 0 | 0 | 3 | 0 | 0 | 6 | 0 | 6 | 0 | beam-quality |
| squad equal 10v10/24m/4c | timeout-guard, guarded-profile, partnerRepeatExcess=4, opponentRepeatExcess=6 | 1 | 0 | 4 | 0 | 0 | 4 | 6 | 4 | 6 | beam-guarded |

### 结构性 / 可接受例外

| type | scenario | scope | playSpread | playSpreadExcess | baseline | maxConsecutivePlay | note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| repeat-baseline | squad equal 4v4/12m/2c | 4v4/12m/2c | 0 | 0 | partner=12; opponent=32 | 6 | repeatExcess=0/0；raw repeat 属于结构下限 |
| repeat-baseline | squad equal 6v6/18m/3c | 6v6/18m/3c | 0 | 0 | partner=6; opponent=36 | 6 | repeatExcess=0/0；raw repeat 属于结构下限 |
| repeat-baseline | squad equal 7v7/18m/3c | 7v7/18m/3c | 1 | 0 | partner=0; opponent=23 | 6 | repeatExcess=0/0；raw repeat 属于结构下限 |
| repeat-baseline | squad 8v8/16m/2c | 8v8/16m/2c | 0 | 0 | partner=8; opponent=32 | 1 | repeatExcess=0/0；raw repeat 属于结构下限 |
| structural-baseline | squad uneven 6v5/12m/2c | 6v5/12m/2c | 1 | 0 | 1 | 4 | global=1；A/B spread=0/1；repeatExcess=3/0 |
| structural-baseline | squad 3v4/9m/1c | 3v4/9m/1c | 2 | 0 | 2 | 2 | global=2；A/B spread=0/1；repeatBaseline=9/24 |
| structural-baseline | squad uneven 5v4/12m/1c | 5v4/12m/1c | 2 | 0 | 2 | 1 | global=2；A/B spread=1/0；repeatExcess=7/0 |
| coverage-first | 10v10/20m/4c | 20 场 / 4 片 / 5 轮 |  |  | 3 | 4 | 当前固定轮休 + 轮内 deterministic 配对优先保 playSpread=0 与完整 20 场输出，maxConsecutivePlay 仍高于结构下限 3。 |

### 代表性场景

| scenario | status | elapsedMs | maxElapsedMs | executionProfile | timeoutGuardTriggered | fallbackReason | playSpread | maxConsecutivePlay | uniqueExactMatchupCount | exactRepeatCount | partnerRepeats | opponentRepeats | restCountSpread |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| squad 4v4/12m/1c | pass | 0 | 2500 | beam-quality | false |  | 0 | 2 | 12 | 0 | 12 | 32 | 0 |
| squad 5v5/12m/2c | pass | 1700 | 2500 | beam-quality | false |  | 1 | 4 | 12 | 0 | 8 | 23 | 1 |
| squad 6v6/12m/2c | pass | 1701 | 6000 | beam-quality | false |  | 0 | 2 | 12 | 0 | 0 | 12 | 0 |
| squad 8v8/16m/2c | pass | 0 | 6000 | beam-quality | false |  | 0 | 1 | 16 | 0 | 8 | 32 | 0 |
| squad 10v10/20m/4c | pass | 0 | 6000 | beam-quality | false |  | 0 | 4 | 20 | 0 | 3 | 0 | 0 |
| squad 3v4/9m/1c | pass | 364 | 2500 | beam-quality | false |  | 2 | 2 | 9 | 0 | 9 | 24 | 2 |

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
| 4p-1c | 4 | 1 | 3 | 1 / 2 / 3 | 3 | 3 |
| 5p-1c | 5 | 1 | 15 | 5 / 10 / 15 | 5 | 5 |
| 6p-1c | 6 | 1 | 18 | 8 / 13 / 18 | 8 | 8 |
| 7p-1c | 7 | 1 | 18 | 11 / 16 / 18 | 11 | 11 |
| 8p-1c | 8 | 1 | 16 | 8 / 14 / 16 | 14 | 14 |
| 8p-2c | 8 | 2 | 16 | 8 / 14 / 16 | 14 | 14 |
| 9p-1c | 9 | 1 | 18 | 8 / 9 / 18 | 18 | 18 |
| 9p-2c | 9 | 2 | 18 | 9 / 10 / 18 | 18 | 18 |
| 10p-1c | 10 | 1 | 30 | 15 / 23 / 30 | 23 | 23 |
| 10p-2c | 10 | 2 | 30 | 15 / 23 / 30 | 23 | 23 |
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
| 4p-1c | 1 / 2 / 3 | 3 | 3 | 3 场完成 6 对搭档覆盖，作为默认均衡档。 |
| 5p-1c | 5 / 10 / 15 | 5 | 5 | 5 场完成 10 对搭档覆盖，作为默认均衡档。 |
| 6p-1c | 8 / 13 / 18 | 8 | 8 | 8 场完成 15 对搭档覆盖，作为默认均衡档，后续两档沿长赛事带加量。 |
| 7p-1c | 11 / 16 / 18 | 11 | 11 | 11 场完成 21 对搭档覆盖，作为默认均衡档。 |
| 8p-1c | 8 / 14 / 16 | 14 | 14 | 对标 8p-2c，14 场完成 28 对搭档覆盖，作为默认均衡档。 |
| 8p-2c | 8 / 14 / 16 | 14 | 14 | 14 场完成 28 对搭档覆盖，作为默认均衡档。 |
| 9p-1c | 8 / 9 / 18 | 18 | 18 | 18 场完成 36 对搭档覆盖，作为默认均衡档。 |
| 9p-2c | 9 / 10 / 18 | 18 | 18 | 18 场完成 36 对搭档覆盖，作为默认均衡档。 |
| 10p-1c | 15 / 23 / 30 | 23 | 23 | 23 场完成 45 对搭档覆盖，作为默认均衡档；30 场为加量档。 |
| 10p-2c | 15 / 23 / 30 | 23 | 23 | 23 场完成 45 对搭档覆盖，作为默认均衡档；30 场为加量档。 |

## 附录 C：coverage-first 例外

| mode | case | scope | structureLimit | actualMaxConsecutivePlay | executionProfile | fallbackReason | note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| multi_rotate | 6p-1c | coverage-first 默认档 8；审计例外区间 5-18 场 | 3 | 4 | template |  | 8 场完成 15 对搭档覆盖；为保持当前 repeat 水平，模板允许 maxConsecutivePlay=4。 |
| multi_rotate | 9p-2c | balanced=18；审计例外区间 17-18 场 | 8 | 8 | template |  | 保留 balancedMatch=18，以维持 18 个 unique exact matchups 与 0 partner repeat。 |
| squad_doubles | 10v10/20m/4c | 20 场 / 4 片 / 5 轮 | 3 | 4 | beam-quality |  | 当前固定轮休 + 轮内 deterministic 配对优先保 playSpread=0 与完整 20 场输出，maxConsecutivePlay 仍高于结构下限 3。 |

## 附录 D：多 Seed 稳定性

| mode | scenario | seeds | playSpreadRange | maxConsecutiveRange | uniqueExactRange | partnerRepeatsRange | opponentRepeatsRange | elapsedRange | worstSeed | worstExecutionProfile | executionProfiles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| multi_rotate | rotation 8p-2c/13m | 1, 7 | 1-1 | 7-7 | 13-13 | 0-0 | 24-24 | 0-0 | 1 | template | template:2 |
| multi_rotate | rotation 8p-2c/14m | 1, 7 | 0-0 | 7-7 | 14-14 | 0-0 | 28-28 | 0-0 | 1 | template | template:2 |
| multi_rotate | rotation 8p-2c/15m | 1, 7 | 1-1 | 8-8 | 15-15 | 2-2 | 32-32 | 0-0 | 1 | template | template:2 |
| multi_rotate | rotation 8p-2c/16m | 1, 7 | 0-0 | 8-8 | 16-16 | 4-4 | 36-36 | 0-0 | 1 | template | template:2 |
| multi_rotate | rotation 9p-2c/15m | 1, 7 | 1-1 | 7-7 | 15-15 | 0-0 | 25-25 | 0-0 | 1 | template | template:2 |
| multi_rotate | rotation 9p-2c/16m | 1, 7 | 1-1 | 8-8 | 16-16 | 0-0 | 29-29 | 0-0 | 1 | template | template:2 |
| multi_rotate | rotation 9p-2c/17m | 1, 7 | 1-1 | 8-8 | 17-17 | 0-0 | 32-32 | 0-0 | 1 | template | template:2 |
| multi_rotate | rotation 9p-2c/18m | 1, 7 | 0-0 | 8-8 | 18-18 | 0-0 | 36-36 | 0-0 | 1 | template | template:2 |
| multi_rotate | rotation 10p/31m/2c budget=200 | 1, 17 | 1-1 | 4-5 | 31-31 | 17-17 | 79-79 | 227-228 | 17 | beam-guarded | beam-guarded:2 |
| multi_rotate | rotation 11p/14m/2c budget=800 | 1, 17 | 1-1 | 3-3 | 14-14 | 0-0 | 8-9 | 212-213 | 1 | beam-guarded | beam-guarded:2 |
| multi_rotate | rotation 13p/16m/2c budget=800 | 1, 17 | 1-1 | 2-2 | 16-16 | 0-0 | 6-8 | 225-226 | 1 | beam-guarded | beam-guarded:2 |
| multi_rotate | rotation 15p/18m/3c budget=1200 | 1, 17 | 1-1 | 4-4 | 18-18 | 0-0 | 1-2 | 472-478 | 17 | beam-guarded | beam-guarded:2 |
| squad_doubles | squad 3v4/9m/1c | 1, 17 | 2-2 | 2-2 | 9-9 | 9-9 | 24-24 | 352-353 | 1 | beam-quality | beam-quality:2 |
| squad_doubles | squad 5v4/12m/1c | 1, 17 | 2-2 | 1-1 | 12-12 | 15-15 | 28-28 | 1528-1606 | 17 | beam-quality | beam-quality:2 |
| squad_doubles | squad 6v5/12m/2c | 1, 17 | 1-1 | 4-4 | 12-12 | 4-5 | 18-18 | 1700-1701 | 1 | beam-quality | beam-quality:2 |
| squad_doubles | squad 7v7/18m/3c | 1, 2 | 1-1 | 6-6 | 18-18 | 0-0 | 23-23 | 2100-2100 | 1 | beam-quality | beam-quality:2 |
| squad_doubles | squad 9v9/24m/4c | 1, 2 | 1-1 | 6-6 | 24-24 | 4-4 | 15-16 | 2009-2073 | 2 | beam-guarded | beam-guarded:2 |
| squad_doubles | squad 10v10/20m/4c | 1, 2 | 0-0 | 4-4 | 20-20 | 3-3 | 0-0 | 0-0 | 1 | beam-quality | beam-quality:2 |

## 附录 E：multi_rotate 前缀质量曲线

| case | matches | playSpread | maxConsecutivePlay | uniqueExactMatchupCount | partnerRepeats | opponentRepeats | partnerCoveragePct | opponentCoveragePct |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 6p-1c | 1 | 1 | 1 | 1 | 0 | 0 | 13 | 27 |
| 6p-1c | 8 | 1 | 3 | 8 | 1 | 17 | 100 | 100 |
| 6p-1c | 18 | 0 | 4 | 18 | 21 | 57 | 100 | 100 |
| 9p-2c | 1 | 1 | 1 | 1 | 0 | 0 | 6 | 11 |
| 9p-2c | 18 | 0 | 8 | 18 | 0 | 36 | 100 | 100 |
| 17p-1c | 1 | 1 | 1 | 1 | 0 | 0 | 1 | 3 |
| 17p-1c | 11 | 1 | 1 | 11 | 0 | 6 | 16 | 28 |
| 17p-1c | 12 | 1 | 1 | 12 | 0 | 7 | 18 | 30 |
| 24p-2c | 1 | 1 | 1 | 1 | 0 | 0 | 1 | 1 |
| 24p-2c | 18 | 0 | 1 | 18 | 0 | 0 | 13 | 26 |