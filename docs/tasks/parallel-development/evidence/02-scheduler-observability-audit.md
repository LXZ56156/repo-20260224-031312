# 工作线 02：排阵观测与模板覆盖审计证据

- 生成时间：`2026-07-16T07:41:21.904Z`
- 分支 / 基线：`codex/roadmap-scheduler-observability@70845c1`
- 模板库：`rotation-v3-templates`
- 运行环境：`v24.16.0 / win32 x64`

## 结论

当前树实时枚举到 60 个模板键、283 个模板 variant、941 个连续场数前缀；注册表问题 0，模板路径审计失败 0。本轮没有新增或刷新模板，也没有改变任何生产排阵行为。

路径分类共 1035 条，分类守恒：是；计数为 `{"beam":5,"error":4,"legacy":1,"template":1025}`。有效长尾场景均进入 beam guarded 路径；legacy 实现存在，但本轮有效场景命中数为 1。

## 模板覆盖矩阵

| templateKey | players | effectiveCourts | horizonMatches | variants | supported prefixes | issues |
| --- | --- | --- | --- | --- | --- | --- |
| 4p-1c | 4 | 1 | 3 | 1 | 3 | 0 |
| 5p-1c | 5 | 1 | 15 | 1 | 15 | 0 |
| 6p-1c | 6 | 1 | 18 | 1 | 18 | 0 |
| 7p-1c | 7 | 1 | 21 | 1 | 21 | 0 |
| 8p-1c | 8 | 1 | 16 | 1 | 16 | 0 |
| 8p-2c | 8 | 2 | 16 | 1 | 16 | 0 |
| 9p-1c | 9 | 1 | 18 | 1 | 18 | 0 |
| 9p-2c | 9 | 2 | 18 | 6 | 18 | 0 |
| 10p-1c | 10 | 1 | 30 | 15 | 30 | 0 |
| 10p-2c | 10 | 2 | 30 | 15 | 30 | 0 |
| 11p-1c | 11 | 1 | 12 | 1 | 12 | 0 |
| 11p-2c | 11 | 2 | 12 | 5 | 12 | 0 |
| 12p-1c | 12 | 1 | 12 | 1 | 12 | 0 |
| 12p-2c | 12 | 2 | 12 | 3 | 12 | 0 |
| 12p-3c | 12 | 3 | 12 | 1 | 12 | 0 |
| 13p-1c | 13 | 1 | 12 | 1 | 12 | 0 |
| 13p-2c | 13 | 2 | 12 | 3 | 12 | 0 |
| 13p-3c | 13 | 3 | 16 | 8 | 16 | 0 |
| 14p-1c | 14 | 1 | 18 | 1 | 18 | 0 |
| 14p-2c | 14 | 2 | 12 | 3 | 12 | 0 |
| 14p-3c | 14 | 3 | 16 | 8 | 16 | 0 |
| 15p-1c | 15 | 1 | 22 | 1 | 22 | 0 |
| 15p-2c | 15 | 2 | 12 | 4 | 12 | 0 |
| 15p-3c | 15 | 3 | 16 | 7 | 16 | 0 |
| 16p-1c | 16 | 1 | 12 | 1 | 12 | 0 |
| 16p-2c | 16 | 2 | 16 | 1 | 16 | 0 |
| 16p-3c | 16 | 3 | 12 | 5 | 12 | 0 |
| 16p-4c | 16 | 4 | 16 | 5 | 16 | 0 |
| 17p-1c | 17 | 1 | 12 | 1 | 12 | 0 |
| 17p-2c | 17 | 2 | 18 | 3 | 18 | 0 |
| 17p-3c | 17 | 3 | 16 | 6 | 16 | 0 |
| 17p-4c | 17 | 4 | 16 | 7 | 16 | 0 |
| 18p-1c | 18 | 1 | 12 | 1 | 12 | 0 |
| 18p-2c | 18 | 2 | 18 | 4 | 18 | 0 |
| 18p-3c | 18 | 3 | 16 | 5 | 16 | 0 |
| 18p-4c | 18 | 4 | 16 | 11 | 16 | 0 |
| 19p-1c | 19 | 1 | 12 | 1 | 12 | 0 |
| 19p-2c | 19 | 2 | 18 | 3 | 18 | 0 |
| 19p-3c | 19 | 3 | 16 | 8 | 16 | 0 |
| 19p-4c | 19 | 4 | 16 | 9 | 16 | 0 |
| 20p-1c | 20 | 1 | 18 | 7 | 18 | 0 |
| 20p-2c | 20 | 2 | 18 | 3 | 18 | 0 |
| 20p-3c | 20 | 3 | 18 | 11 | 18 | 0 |
| 20p-4c | 20 | 4 | 12 | 7 | 12 | 0 |
| 21p-1c | 21 | 1 | 18 | 1 | 18 | 0 |
| 21p-2c | 21 | 2 | 16 | 3 | 16 | 0 |
| 21p-3c | 21 | 3 | 18 | 7 | 18 | 0 |
| 21p-4c | 21 | 4 | 12 | 7 | 12 | 0 |
| 22p-1c | 22 | 1 | 12 | 1 | 12 | 0 |
| 22p-2c | 22 | 2 | 16 | 6 | 16 | 0 |
| 22p-3c | 22 | 3 | 18 | 11 | 18 | 0 |
| 22p-4c | 22 | 4 | 16 | 11 | 16 | 0 |
| 23p-1c | 23 | 1 | 12 | 1 | 12 | 0 |
| 23p-2c | 23 | 2 | 16 | 7 | 16 | 0 |
| 23p-3c | 23 | 3 | 18 | 11 | 18 | 0 |
| 23p-4c | 23 | 4 | 12 | 7 | 12 | 0 |
| 24p-1c | 24 | 1 | 16 | 5 | 16 | 0 |
| 24p-2c | 24 | 2 | 18 | 1 | 18 | 0 |
| 24p-3c | 24 | 3 | 18 | 7 | 18 | 0 |
| 24p-4c | 24 | 4 | 16 | 8 | 16 | 0 |

场地降级矩阵覆盖 84 个 `playersCount × requestedCourts` 组合，失败 0。完整逐前缀与逐人数据见同名 JSON。

## fallback 与无合法结果

| scenario | path | executionProfile | fallbackReason | matches | playSpread | runtime budget requested / effective ms | integrity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rotation longtail 10p/31m/2c budget=200 | beam | beam-guarded | guarded_greedy_completion | 31/31 | 1 | 200 / 600 | pass |
| rotation longtail 11p/14m/2c budget=800 | beam | beam-guarded | guarded_greedy_completion | 14/14 | 1 | 800 / 800 | pass |
| rotation longtail 13p/16m/2c budget=800 | beam | beam-guarded | guarded_greedy_completion | 16/16 | 1 | 800 / 800 | pass |
| rotation longtail 15p/18m/3c budget=1200 | beam | beam-guarded | guarded_greedy_completion | 18/18 | 1 | 1200 / 1200 | pass |
| rotation outside template band 20p/12m/5c | beam | beam-guarded | guarded_greedy_completion | 12/12 | 1 | 600 / 600 | pass |
| rotation outside template band 24p/12m/6c | error | error | 排阵超时，请减少场次或补充模板 | 0/12 |  | 600 / 600 | fail |
| rotation outside template band 24p/12m/6c legacy window | legacy | legacy-guarded | beam_unavailable | 12/12 | 0 | 800 / 800 | pass |
| rotation outside roster template band 25p/12m/4c | error | error | 排阵超时，请减少场次或补充模板 | 0/12 |  | 600 / 600 | fail |

带外路径重复采样（保留同输入出现不同 deadline 结果的事实）：

| scenario | runs | requested budget ms | path counts | profile counts | fallback reason counts | stable path |
| --- | --- | --- | --- | --- | --- | --- |
| rotation outside template band 20p/12m/5c | 5 | 600 | {"beam":1,"error":4} | {"beam-guarded":1,"error":4} | {"guarded_greedy_completion":1,"排阵超时，请减少场次或补充模板":4} | no |
| rotation outside template band 24p/12m/6c | 5 | 600 | {"error":5} | {"error":5} | {"排阵超时，请减少场次或补充模板":5} | yes |
| rotation outside template band 24p/12m/6c legacy window | 5 | 800 | {"legacy":5} | {"legacy-guarded":5} | {"beam_unavailable":5} | yes |
| rotation outside roster template band 25p/12m/4c | 5 | 600 | {"error":5} | {"error":5} | {"排阵超时，请减少场次或补充模板":5} | yes |

| invalid input | error class | outcome | reason |
| --- | --- | --- | --- |
| 3 players cannot form a doubles match | insufficient_roster | no_legal_result | 参赛人数必须不少于4人 |
| duplicate roster ids are rejected | duplicate_roster | no_legal_result | 参赛名单中有重复成员，请去重后再继续 |

## 完整性与公平性

- 模板前缀场景：941；完整性错误场景：0；`Σplays = 4 × matches` 失败：0。
- 数学上可绝对等场：114；可等场但未达成：0。
- 数学上不可绝对等场：827；错误宣称等场：0。
- 最大 playSpread / 连场 / 轮空差：1 / 8 / 1。搭档与对手重复独立记录，不以 fairnessScore 替代。

同 seed 排阵复现失败 0/60；同 seed 质量失败 0/60；跨 seed 模板路由失败 0/60；跨 seed 排阵内容不同 0/60。

## 本地性能基线

计时器 `node:perf_hooks.performance.now`，每个场景 warmup=2、repeats=20。公平性结论来自确定性审计，不用墙钟快慢替代。

| scenario | path | N | median ms | P95 ms | min ms | max ms | runtime budget requested / effective ms | same schedule |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| template 6p/12m/1c | template | 20 | 3.909 | 5.569 | 3.451 | 6.257 | default / 2500 | yes |
| template 16p/12m/4c | template | 20 | 0.207 | 0.271 | 0.183 | 0.666 | default / 2500 | yes |
| template 24p/12m/2c | template | 20 | 1.215 | 1.556 | 1.08 | 1.687 | default / 2500 | yes |
| beam 10p/31m/2c budget=200 | beam | 20 | 257.919 | 286.453 | 230.586 | 290.373 | 200 / 600 | no |
| beam 11p/14m/2c budget=800 | beam | 20 | 224.516 | 252.558 | 217.05 | 270.119 | 800 / 800 | no |
| beam 13p/16m/2c budget=800 | beam | 20 | 276.39 | 294.338 | 249.291 | 294.727 | 800 / 800 | yes |
| beam 15p/18m/3c budget=1200 | beam | 20 | 503.412 | 654.824 | 476.779 | 661.399 | 1200 / 1200 | yes |

真实性能采样中，同 seed 排阵 digest 变化 2/7，质量 digest 变化 1/7。这反映动态 deadline 的负载敏感性；模板公平性结论来自独立确定性审计，不由墙钟样本改写。

本地只测算法。`materializeMs`、`writeMs`、`totalMs` 未通过假数据冒充云端端到端耗时；本轮仅核对这些字段在生产 timing 日志中的可用性，未调用云函数、未写真实云数据。

## timing / meta 字段

| field | present phases | present in done |
| --- | --- | --- |
| scheduleMs | done, materialize, schedule | yes |
| materializeMs | done, materialize | yes |
| writeMs | done | yes |
| totalMs | done | yes |
| engine | done, materialize, schedule | yes |
| engineVersion | none | no |
| executionProfile | done, materialize, schedule | yes |
| templateKey | done, materialize, schedule | yes |
| fallbackReason | none | no |
| searchElapsedMs | none | no |
| requestedCourts | done, materialize, schedule | yes |
| effectiveCourts | done, materialize, schedule | yes |
| playersCount | done, materialize, schedule | yes |
| totalMatches | done, materialize, schedule | yes |
| mode | none | no |
| scheduledMatches | none | no |

字段键存在不代表各 mode 有可聚合值：

| mode | schedulerMeta field | present | populated | sample value |
| --- | --- | --- | --- | --- |
| multi_rotate | engineVersion | yes | yes | rotation-v3 |
| multi_rotate | engine | yes | yes | template |
| multi_rotate | executionProfile | yes | yes | template |
| multi_rotate | templateKey | yes | yes | 8p-2c |
| multi_rotate | fallbackReason | yes | no |  |
| multi_rotate | searchElapsedMs | yes | yes | 0 |
| multi_rotate | effectiveCourts | yes | yes | 2 |
| squad_doubles | engineVersion | yes | yes | squad-v3-beam |
| squad_doubles | engine | no | no |  |
| squad_doubles | executionProfile | yes | yes | beam-quality |
| squad_doubles | templateKey | no | no |  |
| squad_doubles | fallbackReason | yes | no |  |
| squad_doubles | searchElapsedMs | yes | yes | 0 |
| squad_doubles | effectiveCourts | yes | yes | 1 |
| fixed_pair_rr | engineVersion | yes | yes | fixed-pair-v1 |
| fixed_pair_rr | engine | no | no |  |
| fixed_pair_rr | executionProfile | no | no |  |
| fixed_pair_rr | templateKey | no | no |  |
| fixed_pair_rr | fallbackReason | no | no |  |
| fixed_pair_rr | searchElapsedMs | no | no |  |
| fixed_pair_rr | effectiveCourts | no | no |  |

最小观测缺口：`engineVersion, fallbackReason, searchElapsedMs, mode, scheduledMatches`。其中 schedulerMeta 已有的诊断字段若要进入生产 timing 聚合，应由集成对话另行批准；本任务未修改生产文件。

计时语义：schedule=排阵生成加完整性校验；不含此前的 policy/profile 计算。 materialize=round/player 对象物化；idToPlayerMap 在计时开始前。 write=赛事更新及可选 client request log；不含 transaction callback 返回后的工作。 total=截至 transaction callback 内写入完成；不含后置分享消息更新，因此不是严格云函数端到端。 去重提前返回、排阵异常与写入异常没有统一 done timing，生产分布存在成功样本偏差。

## 工作线 01 依赖

工作线 01 的脱敏组合 Pareto 尚未提供；本轮只完成现状矩阵，不新增或刷新模板。

## 边界确认

- 未修改 `cloudfunctions/startTournament/**`、模板库、算法、fallback、seed、阈值、赛事规则或任何 UI。
- 未读取真实赛事数据，未写真实云数据，未 preview/upload、发布或部署云函数。
- 未 push、未创建 PR；本证据只属于工作线 02 独立分支。
