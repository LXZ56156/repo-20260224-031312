# Current Task

> AI session handoff file. Update this when starting/completing significant work.
> Keep it short - just enough for the next session to continue without re-investigation.

## Status: completed

## Last Completed
- 2026-04-10 Codex: 恢复已录分修改能力；管理员和参赛成员可对 `finished` 场次重新加锁修改比分，`canceled` 仍不可改；`squad_doubles + target_wins` 改分后会复活无比分的自动取消场次并重算排名/状态。
- 2026-04-10 Codex: 完成 squad_doubles 剩余 4 个 warnings 清零，串行验证 `node --test tests/*.test.js`、`npm run check`、`npm run audit:scheduler-scenarios`、`npm run report:scheduler-full-audit` 全部通过；报告已更新为 warnings=0 / failures=0。
- 2026-04-10 Claude: squad_doubles 审计 failures 从 14 降到 0，warnings 从 19 降到 4。改动范围仅 `squadDoublesEngine.js`，未触碰 multi_rotate。
- 2026-04-10 Codex: 已提交当前阶段改动，commit `e0ad33d` (`feat: refine scheduler audits and presets`)。
- 2026-04-09 Codex: 完成 `multi_rotate` horizon / preset 全面修正。

## In Progress
- 无。

## What Changed (未提交)

- `miniprogram/pages/match/*`：`finished` 场次允许持锁编辑，已完赛 CTA 显示“修改比分”，`canceled` 场次仍只读。
- `cloudfunctions/scoreLock/logic.js`：允许 `finished` 场次 acquire/status/heartbeat，继续拒绝 `canceled`。
- `cloudfunctions/submitScore/*`：允许有权限且持锁用户覆盖 `finished` 比分；同比分 finished submit 走 deduped/no-op；target_wins 改分会复活无比分 canceled 场次再重算。
- Tests：补充 match view state、scoreLock、submitScore index/logic/idempotency 覆盖。

## Next Steps
- 若要提交：review 当前 13 个改动文件后按 conventional commit 提交，建议 `fix: allow editing submitted scores`。

## Blockers
- 无。

## Verified Subset Output
- focused：`node --test tests/match*.test.js tests/submitScore*.test.js tests/scoreLock*.test.js tests/permission*.test.js tests/role-permission-matrix-score-entry.test.js tests/cloud*.test.js tests/ranking-core*.test.js tests/smoke.score-lock-submit.test.js tests/smoke.reset-delete-locks.test.js tests/smoke.weak-network-cache-fallback.test.js` => 111 pass / 0 fail
- shared common：`bash ./scripts/check-cloud-common.sh` => pass
- 静态检查：`npm run check` => pass
- 全量测试：`node --test tests/*.test.js` => 首次 726 pass / 1 fail（`rotation 10p/23m/2c budget=200` 偶发超时）；单独重跑 `tests/scheduler.scenarios.test.js` => 16 pass / 0 fail；再次全量 => 727 pass / 0 fail
