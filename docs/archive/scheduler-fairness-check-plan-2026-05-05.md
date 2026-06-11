# 多人转 / 小队转排阵检查计划

- 日期: `2026-05-05`
- 范围: `multi_rotate` 与 `squad_doubles`
- 产出: 检查计划文档 + 检查结果与优化方案文档
- 变更类型: 文档与离线审计；不修改页面结构、文案、默认行为或排阵逻辑

## 目标

全面检查多人转和小队转的排阵输出质量，以及可选场次、默认场次是否与公平性目标一致。检查顺序固定为：

1. 先看搭档覆盖率，确认默认档和可选档是否优先覆盖更多不同搭档。
2. 再从多个公平性维度评估排阵质量，避免只用单一指标判断“公平”。
3. 最后输出可执行的优化方案，区分需要马上处理的问题、可接受的结构性取舍、以及后续可验证的改进方向。

## 检查对象

### 排阵生成

- `cloudfunctions/startTournament/rotation.js`
  - `multi_rotate` 实际排阵入口。
  - 重点看模板命中、长尾 fallback、`schedulerMeta` / `fairness` 输出。
- `cloudfunctions/startTournament/scheduleModes.js`
  - `squad_doubles` 实际排阵入口。
  - 重点看 `total_matches`、`total_rounds`、`target_wins` 换算后的排阵输出。
- `cloudfunctions/startTournament/squadDoublesEngine.js`
  - 小队转 beam / deterministic 质量排序。
- `cloudfunctions/startTournament/rotation.templates.js`
  - 多人转模板覆盖场景和 prefix metrics。

### 场次选择与默认值

- `miniprogram/core/ux/multiRotateMatchOptions.js`
  - 多人转固定可选场次数、`balancedMatch`、coverage-first 备注。
- `scripts/rotation-match-options-common.js`
  - 生成多人转推荐场次的规则、override、推荐合理性检查。
- `miniprogram/pages/settings/settingsViewModel.js`
  - 设置页读取推荐、决定默认 `editM`、显示可选档。
- `miniprogram/core/ux/capacity.js`
  - 通用容量建议模型。

### 审计与测试

- `scripts/scheduler-scenario-common.js`
  - 场景矩阵、搭档/对手/出场/休息/连场指标。
- `scripts/audit-scheduler-scenarios.js`
  - 控制台审计入口。
- `scripts/generate-scheduler-full-audit.js`
  - 全量审计报告生成入口。
- `tests/rotation*.test.js`
  - 多人转排阵、模板、coverage、performance。
- `tests/squad*.test.js`
  - 小队转排阵、end condition、公平性、beam performance。
- `tests/settings.view-model.test.js`
  - 可选场次与默认场次。
- `tests/multi-rotate-recommendation-rationality.test.js`
  - 多人转推荐合理性。
- `tests/scheduler*.test.js`
  - 多维审计、场景审计、报告检查。

## 指标体系

### 1. 搭档覆盖率，最高优先级

多人转：

- `totalPartnerPairs = C(players, 2)`
- `uniquePartnerPairs`
- `partnerCoveragePct = uniquePartnerPairs / totalPartnerPairs`
- `allPartnerPairsCovered`
- `partnerRepeats`
- 重点检查默认 `balancedMatch` 是否在小人数场景优先完成全搭档覆盖。

小队转：

- `totalPartnerPairs = C(A, 2) + C(B, 2)`
- `uniquePartnerPairs`
- `partnerCoveragePct`
- `partnerRepeats`
- `partnerRepeatBaseline`
- `partnerRepeatExcess`
- equal squad 与 uneven squad 分开判断，避免把结构性重复误判为算法问题。

### 2. 对手覆盖与重复

- `totalOpponentPairs`
  - 多人转: `C(players, 2)`
  - 小队转: `A * B`
- `uniqueOpponentPairs`
- `opponentCoveragePct`
- `opponentRepeats`
- `opponentRepeatBaseline`
- `opponentRepeatExcess`

### 3. 完全对阵重复

- `uniqueExactMatchupCount`
- `exactRepeatCount = actualMatches - uniqueExactMatchupCount`
- `exactRepeatBaseline`
- `exactRepeatExcess`
- 目标是默认档和可选档尽量不出现完全重复对阵；容量不足时只接受结构性重复。

### 4. 出场公平

- `playSpread`
- `theoreticalPlaySpread`
- `playSpreadExcess`
- 小队转额外拆分 `squadAPlaySpread` / `squadBPlaySpread`，避免 global 指标掩盖某一队内部不公平。

### 5. 轮次与休息公平

- `maxConsecutivePlay`
- `maxRestStreak`
- `restCountSpread`
- `maxRestCount` / `minRestCount`
- 多场地场景重点看同一人连续上场是否由结构决定，还是可通过排序优化。

### 6. 稳定性与性能

- `engine`
- `executionProfile`
- `timeoutGuardTriggered`
- `fallbackReason`
- `elapsedMs`
- `searchElapsedMs`
- 同一代表场景用多 seed 检查是否稳定，不把偶发 beam fallback 当作正常质量。

### 7. 可选场次与默认场次

多人转：

- 检查所有 `multiRotateMatchOptions.cases`：
  - `presetMatches` 是否升序、去重、在 `horizonMatches` 内。
  - `balancedMatch` 是否在 `presetMatches` 内。
  - 小人数默认档是否优先完成搭档覆盖。
  - 大人数默认档是否接近 `capacity.js` 的容量建议，且随场地增加不出现明显倒退。
- 重点复查历史 coverage-first 例外：
  - `6p-1c`
  - `9p-2c`

小队转：

- 当前设置页不展示固定 preset，默认来自通用容量建议和 end condition 换算。
- 检查 `squad_doubles` 的 `total_matches`、`total_rounds`、`target_wins` 是否会稳定换算成完整排阵。
- 检查代表性小队规模下，默认或常用总场次是否导致明显搭档覆盖短板。

## 场景矩阵

### 多人转矩阵

- 模板全前缀：
  - 来自 `rotation.templates.js` 的所有 case。
  - 每个 case 从 `1` 到 `horizonMatches` 逐场检查。
- 长尾场景：
  - `10p/31m/2c`
  - `11p/14m/2c`
  - `13p/16m/2c`
  - `15p/18m/3c`
- 默认/可选档重点抽样：
  - 所有 `multiRotateMatchOptions.cases` 的 `presetMatches` 和 `balancedMatch`。
  - 对每个默认档计算搭档覆盖率、出场 spread、连场、exact repeat。

### 小队转矩阵

- equal squad:
  - 每队 `4` 到 `10` 人。
  - 场地 `1` 到 `min(4, floor(playersPerSquad / 2))`。
  - 常规逻辑轮次 `3` 与 `6`；`10v10/4c` 加查 `5` 轮。
- uneven squad:
  - `3v4/9m/1c`
  - `5v4/12m/1c`
  - `6v5/12m/2c`
- end condition:
  - `total_matches`
  - `total_rounds`
  - `target_wins` 的派生场次上限

## 执行步骤

1. 读取当前 scheduler 相关代码和已有审计文档。
2. 运行现有审计矩阵：
   - `npm run audit:scheduler-scenarios`
   - `npm run report:scheduler-full-audit`
3. 单独抽取多人转可选/默认场次质量：
   - 遍历 `multiRotateMatchOptions.cases`。
   - 对每个 preset 生成排阵并汇总搭档覆盖率、repeat、出场、休息、连场。
4. 单独抽取小队转代表场次质量：
   - 遍历 equal / uneven 矩阵。
   - 补充 `total_rounds` 入口结果。
   - 对 `target_wins` 检查派生 `scheduledMatches` 与质量边界。
5. 对比默认场次：
   - 多人转: `balancedMatch` 对应质量是否优于或至少不劣于其他 preset 的核心指标。
   - 小队转: 默认总场次或常用档是否存在搭档覆盖明显短板。
6. 写结果文档：
   - 总体结论。
   - 多人转检查结果。
   - 小队转检查结果。
   - 可选场次 / 默认场次检查结果。
   - 优化方案，按优先级拆分。
7. 运行必要验证：
   - 文档变更至少运行审计脚本。
   - 如果报告生成改写了既有报告，检查 diff 是否只来自本次审计时间/指标刷新。

## 判定标准

### 通过

- 审计矩阵 `failures=0`。
- 默认档没有 `coverageLoss`。
- 默认档没有非结构性 `exactRepeatExcess`。
- 多人转小人数默认档优先达到 `allPartnerPairsCovered`。
- 小队转 repeat 热点能用 baseline 或明确结构约束解释。
- `executionProfile` 无异常退化到 `greedy-fallback`。

### 需要优化

- 默认档搭档覆盖明显低于相邻可选档，且提升场次成本合理。
- `partnerRepeatExcess` 或 `opponentRepeatExcess` 在默认/常用场景持续偏高。
- `maxConsecutivePlay` 高于结构下限，且不需要牺牲搭档覆盖即可降低。
- `total_rounds` 入口质量明显差于同等 `total_matches` 入口。
- 某些人数/场地无可选档，或默认值来自通用容量建议但与已验证模板不一致。

### 可接受例外

- 小人数为了完成全搭档覆盖，允许一定 `maxConsecutivePlay` 上升。
- 小队人数不等导致 `playSpread` 或 rest spread 的结构性下限大于 `0`。
- 场次数超过组合容量导致 repeat baseline 大于 `0`。
- 长尾场景触发 guarded profile，但输出仍满足质量阈值且耗时在预算内。

## 结果文档计划结构

结果文档命名为 `docs/scheduler-fairness-check-2026-05-05.md`，包含：

- 检查摘要
- 执行命令与环境
- 搭档覆盖率结论
- 多维公平性结论
- 多人转可选场次与默认场次
- 小队转场次入口与代表场景
- 风险与可接受例外
- 优化方案
- 后续验证建议
