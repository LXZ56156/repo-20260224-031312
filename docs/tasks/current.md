# Current Task

> AI session handoff file. Update this when starting/completing significant work.
> Keep it short - just enough for the next session to continue without re-investigation.

## Status: completed

## Last Completed
- 2026-04-10 Codex: 完成 squad_doubles 剩余 4 个 warnings 清零，串行验证 `node --test tests/*.test.js`、`npm run check`、`npm run audit:scheduler-scenarios`、`npm run report:scheduler-full-audit` 全部通过；报告已更新为 warnings=0 / failures=0。
- 2026-04-10 Claude: squad_doubles 审计 failures 从 14 降到 0，warnings 从 19 降到 4。改动范围仅 `squadDoublesEngine.js`，未触碰 multi_rotate。
- 2026-04-10 Codex: 已提交当前阶段改动，commit `e0ad33d` (`feat: refine scheduler audits and presets`)。
- 2026-04-09 Codex: 完成 `multi_rotate` horizon / preset 全面修正。

## In Progress
- 无。当前 handoff 对应的 squad_doubles warning 清零工作已完成。
- 当前报告 [docs/scheduler-full-audit.md] 顶部统计：warnings=0, failures=0。
- multi_rotate 推荐合理性审计仍为 0 issue。

## What Changed (未提交)

### 文件：`cloudfunctions/startTournament/squadDoublesEngine.js`

**改动 A：`performance.now()` 替代 `Date.now()`**
- 新增 `require('perf_hooks')` 导入
- `nowMs()` 函数改用 `performance.now()` 相对偏移，避免 WSL2 环境下 `Date.now()` 跳变导致 deadline 误判
- 影响：所有 beam deadline 检查更精确，消除了计时不稳定导致的假超时

**改动 B：自适应运行时参数 (`computeAdaptiveConfig`)**
- 新增函数 `computeAdaptiveConfig(playersPerSquad, effectiveCourts)`
- 根据队伍规模动态调整 `searchSeeds / beamWidth / restSetLimit / packageLimit / perStateLimit / timeBudgetMs`
- 核心原则：大规模问题减少 seed 数量、增加单 seed 时间预算
- 参数表：

| 范围 | seeds | beamWidth | restSet | pkgLimit | perState | timeMs |
|------|-------|-----------|---------|----------|----------|--------|
| ≤5人/1c | 6 | 48 | 48 | 24 | 8 | 220 |
| ≤5人/2c+ | 4 | 40 | 32 | 20 | 6 | 350 |
| 6-7人 | 3 | 32 | 24 | 16 | 5 | 450 |
| 8+人/≤3c | 2 | 24 | 16 | 12 | 4 | 650 |
| 8+人/4c | 2 | 16 | 12 | 8 | 3 | 650 |

**改动 C：beam 内部 deadline 检查**
- 在 `runSingleBeam` 的 beam 扩展内循环（`for (const state of beam)`）中增加 deadline 检查
- 之前只在 while 循环顶部检查，单轮扩展 16 个 state 可能耗时 1600ms 不被截断
- 修复后每个 state 扩展前都检查，确保 timeBudget 和 deadlineAtMs 被及时响应

**改动 D：beam 提前退出 + 更强的 greedy completion**
- 新增 `earlyExitThreshold = ceil(searchSeeds / 2)`：如果前半数 seed 都没有 complete schedule 且 partial 进度 < 50%，提前退出 beam 阶段
- greedy completion 参数从 `beamWidth=16, restSetLimit=6` 提升到 `beamWidth=32, restSetLimit=16, packageLimit=16, perStateLimit=4`

**改动 E：rest 组合提前截断**
- `enumerateRestForSquad` 不再一律“全枚举再 slice”
- 当 `countComb(teamSize, restCount) > limit` 时，按当前 ranked pool 顺序只保留前 `limit` 个组合，并在 visitor 中提前停止
- 影响：`10v10/12m/2c`、`10v10/18m/3c` 不再构造超大 rest 笛卡尔积

**改动 F：大 active set 的精确 mask-DP package 搜索**
- `buildPackageCandidates` 对 `activePerSide >= 6` 改走精确 mask-DP 快速路径，不再做 `partitionA × partitionB` 全量组合
- DP 以 `(usedAMask, usedBMask)` 为状态，固定 A 侧首个未用球员做锚点，避免等价划分重复
- 每个 rest 候选只返回最优 package；多样性继续由多个 rest/beam state/seed 提供
- 影响：`9v9/12m/4c`、`9v9/24m/4c` 以及部分 7v7/8v8 guarded case 能在预算内完成 schedule

**改动 G：guarded completion 增加大 roster 定向收敛**
- `buildBeamContext` 新增 `greedyRestLimit`
- guarded completion 在 `playersPerSquad >= 8` 时进一步限制 package 生成使用的 rest 前缀，减少大 roster 尾段扩展成本
- 影响：保留 `beam-guarded` 路径，但将剩余 case 从 `greedy-fallback` 拉回 beam 内完成

### 文件：`tests/squad.beam.performance.test.js`

- 计时代码从 `Date.now()` 统一到 `performance.now()`
- 新增 4 个回归 case：
  - `squad equal 9v9/12m/4c`
  - `squad equal 9v9/24m/4c`
  - `squad equal 10v10/12m/2c`
  - `squad equal 10v10/18m/3c`
- 断言生成场次数、`engineVersion === 'squad-v3-beam'`、`executionProfile !== 'greedy-fallback'`、`fairnessVersion === 'v2'`

### 未改动的文件
- `scheduleModes.js` — 未改动（greedy fallback 语义保持不变）
- `scheduler-scenario-common.js` — 未改动
- 所有 rotation / multi_rotate 文件 — 未触碰

## Next Steps
- 可选后续优化只剩性能细化，不再是 warning/failure 收敛：
  - 继续压低 `squad_doubles` 的平均/峰值耗时
  - 视需要补更多 beam profile 指标或大 roster 专项测试
- 若要提交：先 review 当前 4 个改动文件，再按 conventional commit 提交

## Blockers
- 无。

## Verified Subset Output
- 全量测试：`node --test tests/*.test.js` => 718 pass / 0 fail
- 静态检查：`npm run check` => pass
- 场景审计：`npm run audit:scheduler-scenarios` => warnings=0, failures=0
- 审计报告：`npm run report:scheduler-full-audit` => warnings=0, failures=0
- squad_doubles 审计：failures=0, warnings=0, greedyFallbackRatio=0%, maxElapsedMs=2070
- multi_rotate 审计：0 issue，推荐合理性 0 issue
