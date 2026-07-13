# 多人转 / 小队转排阵检查结果与优化方案

- 日期: `2026-05-05`
- 计划文档: `docs/archive/scheduler-fairness-check-plan-2026-05-05.md`
- 主要输入: `docs/reports/scheduler-full-audit.md`
- 检查范围: `multi_rotate`、`squad_doubles` 的排阵输出、可选场次、默认场次
- 本文为优化前检查结论与方案；优化执行记录见 `docs/archive/scheduler-optimization-implementation-2026-05-05.md`

## 检查摘要

现有全量 scheduler 审计通过：

| item | result |
| --- | --- |
| 全量矩阵场景 | `990` |
| 代表性场景 | `16` |
| matrixWarnings | `0` |
| representativeWarnings | `0` |
| totalWarnings | `0` |
| failures | `0` |

本轮额外做了默认/可选场次聚焦统计：

| mode | 聚焦对象 | 核心结论 |
| --- | --- | --- |
| `multi_rotate` | `60` 个场次选项 case，`180` 个 preset 输出 | preset 配置无结构问题；4-10 人默认档全部完成搭档全覆盖；所有默认档无 exact repeat excess、无 play spread excess |
| `squad_doubles` | `48` 个 `total_matches` 场景 | 全部无 failure/warning；无 exact repeat excess、无 play spread excess；热点集中在 repeat excess |
| `squad_doubles` | `48` 个等价 `total_rounds` 场景 | 能完整输出且无 exact repeat excess，但 `45/48` 走 `greedy-total-rounds`，其中 `4` 个场景出现 play spread excess |
| `squad_doubles` | `target_wins` 抽样 | 默认换算与 `total_matches` 等价，输出质量无新增异常 |

## 执行命令

```bash
npm run audit:scheduler-scenarios
npm run report:scheduler-full-audit
```

结果：

- `npm run audit:scheduler-scenarios`: `scenarios=990 warnings=0 failures=0`
- `npm run report:scheduler-full-audit`: 当时输出文案为 `wrote docs/scheduler-full-audit.md scenarios=990 warnings=0 failures=0`；文档重组后当前输出位于 `docs/reports/scheduler-full-audit.md`。

另外运行了临时 Node 聚焦统计，直接调用：

- `scripts/scheduler-scenario-common.js`
- `miniprogram/core/ux/multiRotateMatchOptions.js`
- `miniprogram/core/scheduleContract.js`

## 搭档覆盖率优先结论

### multi_rotate

多人转小人数默认档符合“先搭档覆盖”的目标。`4p` 到 `10p` 的默认 `balancedMatch` 全部完成 `100%` 搭档覆盖：

| case | defaultMatches | partnerCoverage | partnerRepeats | playSpread | maxConsecutivePlay |
| --- | --- | --- | --- | --- | --- |
| `4p-1c` | `3` | `6/6` | `0` | `0` | `3` |
| `5p-1c` | `5` | `10/10` | `0` | `0` | `4` |
| `6p-1c` | `8` | `15/15` | `1` | `1` | `3` |
| `7p-1c` | `11` | `21/21` | `1` | `1` | `2` |
| `8p-1c` | `14` | `28/28` | `0` | `0` | `2` |
| `8p-2c` | `14` | `28/28` | `0` | `0` | `7` |
| `9p-1c` | `18` | `36/36` | `0` | `0` | `1` |
| `9p-2c` | `18` | `36/36` | `0` | `0` | `8` |
| `10p-1c` | `23` | `45/45` | `1` | `1` | `2` |
| `10p-2c` | `23` | `45/45` | `1` | `1` | `4` |

说明：

- `8p-2c` 的 `maxConsecutivePlay=7` 是结构性结果：2 片场、8 人、每轮 2 场时所有人每轮都上场，没有轮休空间。
- `9p-2c` 的 `maxConsecutivePlay=8` 已在现有审计中作为 coverage-first 例外记录：18 场完成全搭档覆盖且 `partnerRepeats=0`。
- `6p-1c`、`10p-1c`、`10p-2c` 默认档为完成全搭档覆盖会产生 `partnerRepeats=1`，但没有完全重复对阵。

大人数默认档的绝对搭档覆盖率较低，但这是“短赛程 + 大组合空间”的结构结果，不是重复过高导致：

| case | defaultMatches | partnerCoverage | partnerRepeats | exactRepeatExcess | note |
| --- | --- | --- | --- | --- | --- |
| `23p-1c` | `12` | `24/253 (9%)` | `0` | `0` | 单场地短赛程，只能覆盖少量组合 |
| `22p-1c` | `12` | `24/231 (10%)` | `0` | `0` | 无搭档重复，覆盖低来自组合空间大 |
| `24p-1c` | `15` | `30/276 (11%)` | `0` | `0` | 当前默认偏容量均衡，不偏长赛覆盖 |
| `24p-2c` | `18` | `36/276 (13%)` | `0` | `0` | 无搭档重复、无对手重复 |
| `24p-3c` | `18` | `36/276 (13%)` | `0` | `0` | 无搭档重复、无对手重复 |

结论：

- 多人转默认档对小人数已明确执行 coverage-first。
- 大人数默认档不追求全覆盖；它更像“短赛程内尽量无重复”。如果产品目标改为大人数也优先搭档覆盖，需要新增更长的覆盖优先档或调整默认策略，这属于用户可见默认行为变更，实施前需要确认。

### squad_doubles

小队转搭档覆盖率需要分 `total_matches` 与 `total_rounds` 两条入口看。

`total_matches` 路径整体质量稳定：

| group | scenarios | minPartnerCoveragePct | maxPartnerRepeats | maxPartnerRepeatExcess | maxOpponentRepeatExcess | exactRepeatExcessCount |
| --- | --- | --- | --- | --- | --- | --- |
| equal matrix | `45` | `7%` | `12` | `8` | `16` | `0` |
| uneven matrix | `3` | `56%` | `15` | `7` | `0` | `0` |

搭档覆盖率最低的场景是大队伍短赛程，例如 `10v10/3m/1c` 只有 `7%`。这类场景没有 repeat excess，本质是只打 3 场时每队只产生 6 个搭档位置，而 `10v10` 两队合计有 `90` 对可搭档组合。

repeat 热点主要是这些场景：

| scenario | partnerCoveragePct | partnerRepeatExcess | opponentRepeatExcess | playSpread | maxConsecutivePlay |
| --- | --- | --- | --- | --- | --- |
| `squad equal 8v8/12m/2c` | `29%` | `8` | `16` | `0` | `1` |
| `squad equal 8v8/18m/3c` | `52%` | `7` | `5` | `1` | `3` |
| `squad uneven 5v4/12m/1c` | `56%` | `7` | `0` | `2` | `1` |
| `squad equal 6v6/9m/3c` | report observation | `6` | `0` | `0` | `3` |
| `squad equal 10v10/24m/4c` | `49%` | `4` | `6` | `1` | `4` |

这些都没有完全重复对阵，且全量审计仍为 `warnings=0 / failures=0`。优化空间主要在 beam scoring 对 repeat excess 的权重，而不是完整性或基础公平性错误。

## 多维公平性结论

### multi_rotate 默认档

| metric | result |
| --- | --- |
| default case count | `60` |
| optionIssues | `0` |
| maxPlaySpread | `1` |
| maxConsecutivePlay | `8` |
| maxPartnerRepeats | `1` |
| maxOpponentRepeats | `49` |
| exactRepeatExcessCount | `0` |
| playSpreadExcessCount | `0` |
| guardedCount | `3` |
| greedyCount | `0` |

结论：

- 默认档没有完全重复对阵超额。
- 默认档没有出场 spread 超额。
- 长尾/大人数有 `guarded`，但没有 greedy fallback。
- 最大对手重复来自小人数长赛覆盖档，这是完成全搭档覆盖后的自然重复，不影响搭档覆盖优先结论。

### squad_doubles total_matches

| metric | result |
| --- | --- |
| scenario count | `48` |
| maxPlaySpread | `2` |
| maxConsecutivePlay | `6` |
| maxPartnerRepeats | `15` |
| maxOpponentRepeats | `36` |
| exactRepeatExcessCount | `0` |
| playSpreadExcessCount | `0` |
| guardedCount | `3` |
| greedyCount | `0` |

结论：

- `total_matches` 是当前小队转质量最稳定入口。
- 所有输出都能完整到目标场次。
- 没有完全重复对阵超额，也没有出场 spread 超结构基线。
- 主要质量热点是 repeat excess，可作为后续优化项。

### squad_doubles total_rounds

`total_rounds` 入口当前直接走 `greedy-total-rounds`，质量明显弱于 `total_matches`：

| metric | result |
| --- | --- |
| scenario count | `48` |
| greedyCount | `45` |
| exactRepeatExcessCount | `0` |
| playSpreadExcessCount | `4` |
| maxPlaySpread | `3` |
| maxPartnerRepeatExcess | `4` |
| maxOpponentRepeatExcess | `21` |

play spread 超结构基线的场景：

| scenario | targetRounds | actualMatches | playSpread | baseline | playSpreadExcess | partnerCoveragePct | maxConsecutivePlay |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `squad equal 9v9/18m/3c` | `6` | `18` | `2` | `0` | `2` | `50%` | `3` |
| `squad equal 6v6/6m/2c` | `3` | `6` | `2` | `0` | `2` | `40%` | `3` |
| `squad equal 6v6/6m/1c` | `6` | `6` | `2` | `0` | `2` | `40%` | `2` |
| `squad uneven 5v4/12m/1c` | `12` | `12` | `3` | `2` | `1` | `100%` | `3` |

结论：

- `total_rounds` 可以完整输出，也没有 exact repeat excess。
- 但它绕过 beam，出场公平和 repeat 控制都更弱。
- 这是本轮最明确的算法优化候选。

### squad_doubles target_wins

设置页默认 `target_wins` 目标为 `ceil(totalMatches / 2)`，`deriveScheduledMatches(totalMatches, target_wins)` 在该默认下会回到原 `totalMatches`：

| sample | scheduledMatches | actualMatches | partnerCoveragePct | playSpread | maxConsecutivePlay | executionProfile |
| --- | --- | --- | --- | --- | --- | --- |
| `4v4/5m/1c target=3` | `5` | `5` | `83%` | `1` | `2` | `beam-quality` |
| `6v6/12m/2c target=6` | `12` | `12` | `80%` | `0` | `2` | `beam-quality` |
| `10v10/20m/4c target=10` | `20` | `20` | `41%` | `0` | `4` | `beam-quality` |

结论：

- 默认 `target_wins` 不会意外扩大赛程。
- 如果用户手动设置更高目标胜场，`deriveScheduledMatches` 会扩到 `target * 2 - 1`，并由 `updateSettings` / `startTournament` 校验最大可选场次。

## 可选场次与默认场次

### multi_rotate

配置检查：

| item | result |
| --- | --- |
| option case count | `60` |
| preset row count | `180` |
| preset 排序/去重问题 | `0` |
| `balancedMatch` 不在 preset 内 | `0` |
| preset 超出 `horizonMatches` | `0` |

默认档检查：

| item | result |
| --- | --- |
| 默认档总数 | `60` |
| 默认档完成全搭档覆盖 | `10` |
| 4-10 人默认档完成全搭档覆盖 | `10/10` |
| 默认档就是最高覆盖 preset | `36/60` |
| 默认档不是最高覆盖 preset | `24/60` |

解释：

- 小人数默认档就是 coverage-first 档。
- 大人数中有 `24/60` 个 case 的更高 preset 能覆盖更多搭档，但默认档保留在更短、更可控的赛程长度上。
- 当前默认策略是“低重复 + 容量均衡”，不是“大人数也尽量覆盖最多搭档”。

### squad_doubles

当前小队转没有类似 `multiRotateMatchOptions` 的固定 preset 表。场次入口来自：

- `total_matches`: 使用设置页 `editM`，排阵走 beam / deterministic。
- `total_rounds`: UI 目标为轮数，排阵当前走 greedy。
- `target_wins`: 通过 `deriveScheduledMatches()` 换算为最多可能需要的总场数，再走 `target_matches` 排阵。

默认值来源：

- 新创建赛事 `totalMatches=0`，未配置。
- 设置页根据 `capacity.js` 的 `suggestedMatches` 生成 `editM`。
- `squad_doubles` 下展示结束条件；`total_matches` 目标自动等于 `editM`，`total_rounds` 默认 `ceil(editM / courts)`，`target_wins` 默认 `ceil(editM / 2)`。

结论：

- `total_matches` 默认/常用路径质量稳定。
- `target_wins` 默认换算稳定。
- `total_rounds` 是质量短板，因为它绕过 beam。

## 风险与可接受例外

可接受例外：

- `multi_rotate 6p-1c` 为完成全搭档覆盖允许 `partnerRepeats=1` 和较高连续上场。
- `multi_rotate 9p-2c` 保留 18 场默认档，换取 `36/36` 搭档覆盖和 `partnerRepeats=0`。
- `multi_rotate 8p-2c` 默认 14 场的 `maxConsecutivePlay=7` 是 8 人 2 片场无轮休空间导致。
- 小队人数不等时，`playSpread` / rest spread 的结构基线可能大于 `0`。
- 短赛程大队伍的搭档覆盖率低是组合空间导致，不等于算法重复。

残余风险：

- `total_rounds` 路径没有纳入主报告矩阵的 warning/failure 口径，本轮通过临时统计发现质量弱点。
- 小队转 repeat 热点虽然不触发 warning，但如果产品目标明确把“搭档多样性”放在首位，需要重新调权。
- 大人数多人转默认档的低覆盖率可能与“覆盖优先”的用户直觉冲突，需要产品层确认是否接受当前短赛程默认。

## 优化方案

### P0: 不需要立即修复的项

- 不建议改动 `multi_rotate` 小人数默认档；它们已经完成 4-10 人全搭档覆盖。
- 不建议把大人数默认档直接改成最高覆盖 preset；这会改变用户默认赛程长度，属于用户可见默认行为变更，需要先确认产品取舍。
- 不需要为 `target_wins` 做算法修复；默认换算和校验链路是稳定的。

### P1: 优先优化 `squad_doubles total_rounds`

问题：

- `total_rounds` 当前直接走 `greedy-total-rounds`。
- 本轮 `48` 个等价场景中 `45` 个为 greedy。
- `4` 个场景出现 `playSpreadExcess > 0`。

建议：

1. 把 `total_rounds` 转换为确定的 `targetMatches = targetRounds * effectiveCourts`。
2. 在不超过目标轮数的前提下复用 beam / deterministic 搜索。
3. 仅当 beam 超时或无完整解时再降级 greedy。
4. 在审计脚本中加入 `total_rounds` 矩阵，避免以后只看 `total_matches`。

建议验收：

```bash
node --test tests/squad.end-condition.test.js tests/squad.fairness.test.js tests/scheduler.scenarios.test.js
npm run audit:scheduler-scenarios
npm run report:scheduler-full-audit
```

目标：

- `total_rounds` 的 `playSpreadExcessCount` 从 `4` 降到 `0`。
- `exactRepeatExcessCount` 继续为 `0`。
- 不引入 `greedy-fallback` 作为常态路径。

### P1: 固化默认/可选场次质量回归

本轮默认/可选场次统计是临时 Node 脚本。建议新增正式测试或审计段：

- `multi_rotate`:
  - `optionIssues=0`
  - `4-10` 人默认档 `allPartnerPairsCovered=true`
  - 默认档 `exactRepeatExcess=0`
  - 默认档 `playSpreadExcess=0`
- `squad_doubles`:
  - `total_matches` 与 `total_rounds` 分开统计
  - repeat excess 热点列入报告，但按 baseline 判断 warning

### P2: 调整小队转 repeat excess 热点

优先候选：

- `squad equal 8v8/12m/2c`
- `squad equal 8v8/18m/3c`
- `squad uneven 5v4/12m/1c`
- `squad equal 10v10/24m/4c`

建议：

1. 在 `squadDoublesEngine` 的排序中提高 baseline-aware partner/opponent repeat 权重。
2. 对 uneven squad 单独保留结构性 baseline，不用 equal squad 的目标误压。
3. 保持 `playSpreadExcess=0`、`exactRepeatExcess=0` 为硬约束，repeat 优化只能在不破坏这些指标时接受。

### P2: 大人数多人转增加“覆盖优先”评估选项

现状：

- 大人数默认档搭档覆盖率低，但无搭档重复。
- `24/60` 个多人转 case 中，更高 preset 能提升覆盖率。

建议：

1. 不直接改默认值。
2. 先在报告中增加 “default vs highest coverage preset” 对照。
3. 如果后续产品确认要强调搭档覆盖，可新增一个明确的覆盖优先档或提示，而不是静默改变默认档。

注意：

- 新增 UI 文案、标签、默认选择都属于用户可见变更，需要单独确认后再实现。

### P3: 报告能力补强

建议把以下内容纳入 `generate-scheduler-full-audit.js`：

- `multi_rotate` 默认/可选 preset 汇总。
- `squad_doubles total_rounds` 对照矩阵。
- `target_wins` 默认换算抽样。
- 每个模式的 `defaultIsBestCoverageCount` 与 `defaultNotBestCoverageCount`。

这样以后不用临时脚本才能发现默认档和入口差异。

## 后续验证建议

如果后续实施 P1/P2，需要至少运行：

```bash
node --test tests/squad.end-condition.test.js tests/squad.fairness.test.js tests/squad.beam.test.js tests/squad.beam.performance.test.js tests/scheduler.scenarios.test.js
npm run audit:scheduler-scenarios
npm run report:scheduler-full-audit
npm run check
```

如触及 `cloudfunctions/startTournament/` 共享库或模板，应按仓库规则同步并检查：

```bash
./scripts/sync-cloud-common.sh
./scripts/check-cloud-common.sh
```
