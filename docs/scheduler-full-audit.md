# 排阵算法全量审计与推荐场数报告

- 生成时间: `2026-04-09T16:48:30.933Z`
- 当前 commit: `93648d3`
- 工作区脏状态: `dirty`
- 矩阵场景数: `959`
- 代表性场景数: `16`
- warnings: `19`
- failures: `14`

## 执行摘要

| mode | scenarios | warnings | failures | avgElapsedMs | maxElapsedMs | guardedRatio | greedyFallbackRatio |
| --- | --- | --- | --- | --- | --- | --- | --- |
| multi_rotate | 912 | 1 | 2 | 13 | 5512 | 2/912 (0%) | 0/912 (0%) |
| squad_doubles | 47 | 18 | 12 | 2379 | 5518 | 21/47 (45%) | 12/47 (26%) |

## multi_rotate 审计

| group | scenarios | warnings | failures | avgElapsedMs | maxElapsedMs | guardedRatio | greedyFallbackRatio |
| --- | --- | --- | --- | --- | --- | --- | --- |
| template matrix | 908 | 0 | 0 | 0 | 4 | 0/908 (0%) | 0/908 (0%) |
| longtail matrix | 4 | 1 | 2 | 2863 | 5512 | 2/4 (50%) | 0/4 (0%) |

### 代表性场景

| scenario | status | elapsedMs | maxElapsedMs | executionProfile | timeoutGuardTriggered | fallbackReason | playSpread | maxConsecutivePlay | uniqueExactMatchupCount |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rotation 6p/12m/1c | pass | 0 | 300 | template | false |  | 0 | 4 | 12 |
| rotation 8p/8m/2c | pass | 0 | 300 | template | false |  | 0 | 4 | 8 |
| rotation 9p/12m/1c | pass | 1 | 300 | template | false |  | 1 | 1 | 12 |
| rotation 10p/18m/2c | pass | 0 | 300 | template | false |  | 1 | 4 | 18 |
| rotation 12p/12m/2c | pass | 0 | 300 | template | false |  | 0 | 2 | 12 |
| rotation 14p/12m/4c | pass | 0 | 300 | template | false |  | 1 | 4 | 12 |
| rotation 16p/12m/4c | pass | 0 | 300 | template | false |  | 0 | 3 | 12 |
| rotation 20p/12m/1c | pass | 1 | 300 | template | false |  | 1 | 1 | 12 |
| rotation 24p/12m/2c | pass | 0 | 300 | template | false |  | 0 | 1 | 12 |
| rotation 10p/23m/2c budget=200 | pass | 218 | 1500 | beam-guarded | true | guarded_greedy_completion | 1 | 4 | 23 |

### 失败项

| scenario | code | message |
| --- | --- | --- |
| rotation longtail 13p/16m/2c budget=800 | elapsed_ms | elapsedMs=5512 > 2500 |
| rotation longtail 15p/18m/3c budget=1200 | elapsed_ms | elapsedMs=5503 > 2500 |

### 警告项

| scenario | code | message |
| --- | --- | --- |
| rotation longtail 13p/16m/2c budget=800 | runtime_retry_passed | firstError=排阵超时，请减少场次或补充模板 retryElapsedMs=5512 |

## multi_rotate 推荐合理性

| caseCount | issueCount | largeRosterShortfall | monotonicityIssues | collapsedPresetIssues |
| --- | --- | --- | --- | --- |
| 60 | 0 | 0 | 0 | 0 |

### 异常项

none

## squad_doubles 审计

| group | scenarios | warnings | failures | avgElapsedMs | maxElapsedMs | guardedRatio | greedyFallbackRatio |
| --- | --- | --- | --- | --- | --- | --- | --- |
| equal matrix | 44 | 18 | 12 | 2468 | 5518 | 20/44 (45%) | 12/44 (27%) |
| uneven matrix | 3 | 0 | 0 | 1077 | 1700 | 1/3 (33%) | 0/3 (0%) |

### 代表性场景

| scenario | status | elapsedMs | maxElapsedMs | executionProfile | timeoutGuardTriggered | fallbackReason | playSpread | maxConsecutivePlay | uniqueExactMatchupCount |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| squad 4v4/12m/1c | pass | 736 | 2500 | beam-quality | false |  | 0 | 1 | 2 |
| squad 5v5/12m/2c | pass | 1312 | 2500 | beam-guarded | true | soft_deadline_guard | 1 | 4 | 12 |
| squad 6v6/12m/2c | pass | 5510 | 6000 | beam-guarded | true | soft_deadline_guard | 0 | 2 | 12 |
| squad 8v8/16m/2c | pass | 5516 | 6000 | greedy-fallback | true | beam_no_complete_schedule | 0 | 2 | 16 |
| squad 10v10/20m/4c | warn | 5517 | 6000 | greedy-fallback | true | beam_no_complete_schedule | 2 | 5 | 20 |
| squad 3v4/9m/1c | pass | 309 | 2500 | beam-quality | false |  | 2 | 2 | 9 |

### 失败项

| scenario | code | message |
| --- | --- | --- |
| squad equal 6v6/6m/2c | elapsed_ms | elapsedMs=5502 > 2500 |
| squad equal 6v6/12m/2c | elapsed_ms | elapsedMs=5516 > 2500 |
| squad equal 7v7/12m/2c | elapsed_ms | elapsedMs=5510 > 2500 |
| squad equal 7v7/9m/3c | elapsed_ms | elapsedMs=5501 > 2500 |
| squad equal 7v7/18m/3c | elapsed_ms | elapsedMs=5518 > 3000 |
| squad equal 8v8/9m/3c | elapsed_ms | elapsedMs=5516 > 2500 |
| squad equal 8v8/18m/3c | elapsed_ms | elapsedMs=5506 > 3000 |
| squad equal 8v8/12m/4c | elapsed_ms | elapsedMs=5505 > 3000 |
| squad equal 8v8/24m/4c | elapsed_ms | elapsedMs=5508 > 3000 |
| squad equal 9v9/12m/4c | elapsed_ms | elapsedMs=5504 > 3000 |
| squad equal 9v9/24m/4c | elapsed_ms | elapsedMs=5500 > 3000 |
| squad equal 10v10/24m/4c | elapsed_ms | elapsedMs=5515 > 3000 |

### 警告项

| scenario | code | message |
| --- | --- | --- |
| squad equal 7v7/6m/2c | elapsed_retry_passed | firstElapsedMs=3821 retryElapsedMs=1693 |
| squad equal 7v7/18m/3c | greedy_fallback | executionProfile=greedy-fallback fallbackReason=beam_no_complete_schedule |
| squad equal 8v8/12m/2c | greedy_fallback | executionProfile=greedy-fallback fallbackReason=beam_no_complete_schedule |
| squad equal 8v8/18m/3c | greedy_fallback | executionProfile=greedy-fallback fallbackReason=beam_no_complete_schedule |
| squad equal 8v8/24m/4c | greedy_fallback | executionProfile=greedy-fallback fallbackReason=beam_no_complete_schedule |
| squad equal 9v9/18m/3c | greedy_fallback | executionProfile=greedy-fallback fallbackReason=beam_no_complete_schedule |
| squad equal 9v9/12m/4c | greedy_fallback | executionProfile=greedy-fallback fallbackReason=beam_no_complete_schedule |
| squad equal 9v9/24m/4c | greedy_fallback | executionProfile=greedy-fallback fallbackReason=beam_no_complete_schedule |
| squad equal 10v10/3m/1c | elapsed_retry_passed | firstElapsedMs=3231 retryElapsedMs=1700 |
| squad equal 10v10/6m/1c | greedy_fallback | executionProfile=greedy-fallback fallbackReason=beam_no_complete_schedule |
| squad equal 10v10/6m/2c | elapsed_retry_passed | firstElapsedMs=8000 retryElapsedMs=1926 |
| squad equal 10v10/12m/2c | elapsed_retry_passed | firstElapsedMs=3022 retryElapsedMs=2524 |
| squad equal 10v10/12m/2c | greedy_fallback | executionProfile=greedy-fallback fallbackReason=beam_no_complete_schedule |
| squad equal 10v10/18m/3c | greedy_fallback | executionProfile=greedy-fallback fallbackReason=beam_no_complete_schedule |
| squad equal 10v10/12m/4c | greedy_fallback | executionProfile=greedy-fallback fallbackReason=beam_no_complete_schedule |
| squad equal 10v10/24m/4c | max_consecutive | maxConsecutivePlay=5 structureLimit=4 |
| squad equal 10v10/24m/4c | greedy_fallback | executionProfile=greedy-fallback fallbackReason=beam_no_complete_schedule |
| squad equal matrix | greedy_ratio | greedyRatio=0.27 (12/44) |

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