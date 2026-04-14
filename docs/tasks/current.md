# Current Task

> AI session handoff file. Update this when starting/completing significant work.
> Keep it short - just enough for the next session to continue without re-investigation.

## Status: completed

## Last Completed
- 2026-04-15 Codex: 完成 `squad_doubles 4v4/1c` exact-matchup 去重修复。`scheduleModes` 新增窄范围 deterministic 模板路径，覆盖 `4v4/1c` 且 `targetMatches<=12` 的 `total_matches` / `total_rounds` 两条入口；`3m/6m/12m` 及其余前缀均改为无完全重复对阵，`4v4/12m/1c` 达到 `uniqueExactMatchupCount=12`、`partnerRepeats=12`、`opponentRepeats=32`。审计层新增 `exactRepeatCount / exactRepeatBaseline / exactRepeatExcess`，报告按 exact-repeat 暴露热点；同步确认 `4v4/12m/1c` 在无 exact repeat 前提下 `maxConsecutivePlay<=1` 不可实现，因此代表性验收口径改为 `<=2`。`node --test tests/*.test.js`、`npm run check`、`node scripts/audit-scheduler-scenarios.js`、`node scripts/generate-scheduler-full-audit.js` 全部通过，报告已刷新为 warnings=0 / failures=0。
- 2026-04-14 Codex: 完成 `squad_doubles` equal hotspot 优化与 repeat baseline 纠偏。审计层新增 `partnerRepeatBaseline` / `opponentRepeatBaseline` / `partnerRepeatExcess` / `opponentRepeatExcess`；`4v4/12m/2c` 改判为结构性最优基线；`6v6/18m/3c` 稳定降到 `partnerRepeats=6`、`7v7/18m/3c` 稳定降到 `partnerRepeats=0` 且保持 `opponentRepeats=23`；报告新增 repeat-baseline 解释并改用 repeatExcess 排序/观察；`node --test tests/*.test.js`、`npm run check`、`node scripts/audit-scheduler-scenarios.js`、`node scripts/generate-scheduler-full-audit.js` 全部通过，报告已刷新为 warnings=0 / failures=0。
- 2026-04-13 Codex: 完成排阵热点修复与评测降噪。`squad_doubles` 新增 uneven 结构性 `playSpread` 基线与 `playSpreadExcess` 审计口径；报告新增“最差 Unique Case”“结构性 / 可接受例外”视图；`7v7/18m/3c` 从 `beam-guarded` 降到 `beam-quality`；多 seed/stability 扩展到 longtail、risk prefix、uneven、guarded heavy case；`node --test tests/*.test.js`、`npm run check`、`node scripts/audit-scheduler-scenarios.js`、`node scripts/generate-scheduler-full-audit.js` 全部通过，报告已刷新为 warnings=0 / failures=0。
- 2026-04-10 Codex: 恢复已录分修改能力；管理员和参赛成员可对 `finished` 场次重新加锁修改比分，`canceled` 仍不可改；`squad_doubles + target_wins` 改分后会复活无比分的自动取消场次并重算排名/状态。
- 2026-04-10 Codex: 完成 squad_doubles 剩余 4 个 warnings 清零，串行验证 `node --test tests/*.test.js`、`npm run check`、`npm run audit:scheduler-scenarios`、`npm run report:scheduler-full-audit` 全部通过；报告已更新为 warnings=0 / failures=0。
- 2026-04-10 Claude: squad_doubles 审计 failures 从 14 降到 0，warnings 从 19 降到 4。改动范围仅 `squadDoublesEngine.js`，未触碰 multi_rotate。
- 2026-04-10 Codex: 已提交当前阶段改动，commit `e0ad33d` (`feat: refine scheduler audits and presets`)。
- 2026-04-09 Codex: 完成 `multi_rotate` horizon / preset 全面修正。

## In Progress
- 无。

## What Changed (未提交)

- `cloudfunctions/startTournament/scheduleModes.js`：新增 `4v4/1c` 窄范围 deterministic 模板族，优先接管 `targetMatches<=12` 的 `squad_doubles` 单场地排阵；统一从 rounds 派生 `playSpread` / `maxConsecutivePlay` / `partnerRepeats` / `opponentRepeats` / `fairnessScore`，避免走通用 beam 后出现 exact matchup 重复。
- `scripts/scheduler-scenario-common.js`：新增 `totalExactMatchupCapacity`、`exactRepeatCount`、`exactRepeatBaseline`、`exactRepeatExcess`；worst-case 比较逻辑改为在 coverage 后优先暴露 exact-repeat excess；`squad-4v4-12m-1c` 的代表性验收上限调整为 `maxConsecutivePlay<=2`。
- `scripts/generate-scheduler-full-audit.js` + `docs/scheduler-full-audit.md`：代表性表、worst-case、observation 补充 `exactRepeatCount` / `exactRepeatExcess` 展示，避免“uniqueExact 很低但不显眼”的报告盲点。
- `tests/squad.fairness.test.js`、`tests/scheduler.multidimensional-audit.test.js`、`tests/scheduler-full-audit-report.test.js`：补充 `4v4/1c` 的 `3m/6m/12m` 与 `total_rounds` 回归、exact-repeat 审计派生字段、report 排序与 observation 文案断言。
- `scripts/scheduler-scenario-common.js`：新增 `globalPlaySpreadBaseline` / `playSpreadExcess` / `squadAPlaySpread` / `squadBPlaySpread`；squad worst-case 改按结构下限退化排序；extended stability 扩展到 longtail、risk prefix、uneven 和 guarded heavy case。
- `cloudfunctions/startTournament/squadDoublesEngine.js`：uneven case 引入结构基线优先 rest/package 排序；高压 equal case 增加 completed early-exit，`7v7/18m/3c` 不再走 guarded。
- `scripts/generate-scheduler-full-audit.js` + `docs/scheduler-full-audit.md`：新增 “最差 Unique Case” 和 “结构性 / 可接受例外” 表，observation 不再把结构性 uneven `playSpread` 当作退化。
- `tests/scheduler.multidimensional-audit.test.js`、`tests/scheduler-full-audit-report.test.js`、`tests/squad.fairness.test.js`：补充结构基线、unique-case 去重、mode exception rows、uneven hotspot 与 `7v7/18m/3c` 回归断言。
- `scripts/scheduler-scenario-common.js`：新增 equal squad repeat baseline/excess 衍生字段，`compareWorstResult` 对 `squad_doubles` 改为优先看 repeatExcess。
- `cloudfunctions/startTournament/squadDoublesEngine.js`：仅对 `6v6/18m/3c`、`7v7/18m/3c` 开启 partner-diversity 优先启发式；补充 `newPartnerPairs` / `newOpponentPairs` / `uniquePartnerPairCount` / `uniqueOpponentPairCount` 状态；为该热点 profile 提高软预算并禁用 completed early-exit，避免 full suite 下退化到 `opponentRepeats=24`。
- `scripts/generate-scheduler-full-audit.js` + `docs/scheduler-full-audit.md`：equal squad 报告改用 `partnerRepeatExcess` / `opponentRepeatExcess` 解释热点，新增 `repeat-baseline` 结构说明，`4v4/12m/2c` 不再因 raw repeat 进入热点。
- `tests/scheduler.multidimensional-audit.test.js`、`tests/scheduler-full-audit-report.test.js`、`tests/squad.fairness.test.js`：补充 equal repeat baseline、repeatExcess 排序/解释、`6v6/18m/3c` 与 `7v7/18m/3c` 多 seed 回归。
- `miniprogram/pages/match/*`：`finished` 场次允许持锁编辑，已完赛 CTA 显示“修改比分”，`canceled` 场次仍只读。
- `cloudfunctions/scoreLock/logic.js`：允许 `finished` 场次 acquire/status/heartbeat，继续拒绝 `canceled`。
- `cloudfunctions/submitScore/*`：允许有权限且持锁用户覆盖 `finished` 比分；同比分 finished submit 走 deduped/no-op；target_wins 改分会复活无比分 canceled 场次再重算。
- Tests：补充 match view state、scoreLock、submitScore index/logic/idempotency 覆盖。

## Next Steps
- 若继续排阵专项：优先检查 `squad 8v8/16m/2c` 和 uneven case 的 repeat 是否存在结构性下限之外的 excess，再决定是补基线口径还是继续调 beam/guarded 启发式。

## Blockers
- 无。

## Verified Subset Output
- 全量测试：`node --test tests/*.test.js` => 760 pass / 0 fail
- 静态检查：`npm run check` => pass
- 审计脚本：`node scripts/audit-scheduler-scenarios.js` => `scenarios=960 warnings=0 failures=0`
- 报告生成：`node scripts/generate-scheduler-full-audit.js` => `scenarios=960 warnings=0 failures=0`
- 全量测试：`node --test tests/*.test.js` => 755 pass / 0 fail
- 静态检查：`npm run check` => pass
- 审计脚本：`node scripts/audit-scheduler-scenarios.js` => `scenarios=960 warnings=0 failures=0`
- 报告生成：`node scripts/generate-scheduler-full-audit.js` => `scenarios=960 warnings=0 failures=0`
- focused：`node --test tests/scheduler.multidimensional-audit.test.js tests/scheduler-full-audit-report.test.js tests/squad.fairness.test.js` => pass
- focused：`node --test tests/match*.test.js tests/submitScore*.test.js tests/scoreLock*.test.js tests/permission*.test.js tests/role-permission-matrix-score-entry.test.js tests/cloud*.test.js tests/ranking-core*.test.js tests/smoke.score-lock-submit.test.js tests/smoke.reset-delete-locks.test.js tests/smoke.weak-network-cache-fallback.test.js` => 111 pass / 0 fail
- shared common：`bash ./scripts/check-cloud-common.sh` => pass
- 静态检查：`npm run check` => pass
- 全量测试：`node --test tests/*.test.js` => 首次 726 pass / 1 fail（`rotation 10p/23m/2c budget=200` 偶发超时）；单独重跑 `tests/scheduler.scenarios.test.js` => 16 pass / 0 fail；再次全量 => 727 pass / 0 fail
