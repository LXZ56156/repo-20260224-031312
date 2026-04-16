# Current Task

> AI session handoff file. Update this when starting/completing significant work.
> Keep it short - just enough for the next session to continue without re-investigation.

## Status: completed

## Last Completed
- 2026-04-16 Codex: 完成后端高优先级 contract 修复并补齐交接。引入共享 `client_request_logs` 幂等日志与事务兼容 helper，`createTournament` / `feedbackSubmit` / `cloneTournament` / `saveUserProfile` / `startTournament` 全部改为事务内先查请求日志、成功后写日志；`startTournament` 不再依赖通用 `lastClientRequestId` 做 dedupe，只有赛事确实 `running` 且已物化 `rounds` 时才返回 `deduped`。同时把排阵链路的 roster contract 统一到 canonical `player.id`：模板源 `scripts/player-common.template.js` / `scripts/schedule-common.template.js` / `scripts/fixed-pair-common.template.js` 新增 `normalizeRosterPlayers()` 并同步到 `cloudfunctions/*/lib/*`，`validateBeforeGenerate`、`generateSchedule`、`buildSquadSchedule`、`buildFixedPairSchedule`、`idToPlayerMap` 均已切换。新增跨动作 requestId 污染回归、create/update 并发幂等、`playerId/_id` roster contract 测试。验证结果：`bash scripts/check-cloud-common.sh` 通过，`node --test tests/*.test.js` => `771 pass / 0 fail`，`npm run check` 通过。
- 2026-04-16 Codex: 完成后端全面审查并新增 `docs/backend-audit-2026-04-16.md`。报告确认 3 个高风险问题：`startTournament` 会被其他动作写入的 `lastClientRequestId` 误触发 dedupe、排阵链路对 `playerId/_id` 与 `player.id` 的 contract 不一致、`createTournament/feedbackSubmit/cloneTournament/saveUserProfile` 的 `clientRequestId` 幂等是先查再写且非原子。额外记录了结构化错误返回不一致、`getUserProfile` 吞掉数据库异常、前端将 `not_found` 降级为 `param`、审计脚本忽略 `effectiveCourts` 等问题。验证结果：`bash scripts/check-cloud-common.sh`、`npm run check` 通过；`node --test tests/*.test.js` 首跑 `763 pass / 1 fail`（`tests/rotation.performance.test.js` 超时），单独复跑该文件 `14 pass / 0 fail`。
- 2026-04-15 Codex: 完成 `multi_rotate` 模板短前缀的 rounds 顺序后处理优化。`cloudfunctions/startTournament/rotation.js` 新增仅对短前缀模板结果生效的 round reorder post-process：保持对阵集合完全不变，仅在 `targetMatches<=12` 且重排后能同时改善 `maxConsecutivePlay / maxRestStreak` 时接收新顺序。代表性 `rotation 6p/12m/1c` 已从 `maxConsecutivePlay=4 / maxRestStreak=2` 降到 `3 / 1`，且 `uniqueExactMatchupCount=12`、`partnerRepeats=9`、`opponentRepeats=33` 不变；`6p-1c@18` 等 coverage-first 默认档保持原口径不变。`node --test tests/*.test.js`、`npm run check`、`node scripts/audit-scheduler-scenarios.js`、`node scripts/generate-scheduler-full-audit.js` 全部通过，报告已刷新为 `warnings=0 / failures=0`。
- 2026-04-15 Codex: 完成 `squad_doubles` 热点与 uneven repeat baseline 修复。`scheduleModes` 新增 `8v8/16m/2c` 与 `10v10/20m/4c` 两段式 deterministic 路径；`squadDoublesEngine` 为 `9v9/18m/3c` 增加 round-layout/partner-diversity 排序，稳定到 `partnerRepeats=0` 且保持 `beam-quality`；审计层为 tracked uneven case（`3v4/9m/1c`、`5v4/12m/1c`、`6v5/12m/2c`）补齐 `partner/opponentRepeatBaseline` 与 `Excess`；报告按 repeatExcess 解释 uneven/equal 热点，并刷新 `docs/scheduler-full-audit.md` 为 `warnings=0 / failures=0`。同时把 rotation guarded representative 的离线预算样本从 `budget=200` 稳定到 `budget=300`，避免全量并发下的偶发超时误报。`node --test tests/*.test.js`、`npm run check`、`node scripts/audit-scheduler-scenarios.js`、`node scripts/generate-scheduler-full-audit.js` 全部通过。
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
- 共享模板源：`scripts/cloud-common.template.js` 新增 `client_request_logs` helper（确定性 log id、事务兼容封装、log 读写/回读）；`scripts/player-common.template.js`、`scripts/schedule-common.template.js`、`scripts/fixed-pair-common.template.js` 新增 canonical roster 归一化并统一用 `extractPlayerId()` 识别成员。
- 云函数同步产物：已执行 `bash scripts/sync-cloud-common.sh`，所有 `cloudfunctions/*/lib/common.js` / `player.js` / `schedule.js` / `fixed-pair.js` 已从模板同步到最新。
- 高优先级写链路：`cloudfunctions/createTournament/index.js`、`feedbackSubmit/index.js`、`cloneTournament/index.js`、`saveUserProfile/index.js`、`startTournament/index.js` 已切到事务内 request-log 幂等；`startTournament` 现在只认 `scope=start_tournament` 的请求日志，并要求赛事已经 `running` 且 `rounds` 已物化后才返回 `deduped`。
- 排阵 contract：`cloudfunctions/startTournament/logic.js`、`rotation.js`、`scheduleModes.js`、`index.js` 已统一 canonical `player.id` 语义，`playerId/_id` roster 不会再在校验通过后于排阵阶段崩溃。
- 回归测试：更新 `tests/createTournament.index.test.js`、`feedbackSubmit.index.test.js`、`cloneTournament.index.test.js`、`saveUserProfile.index.test.js`、`startTournament.index.test.js`，新增 `tests/startTournament.roster-contract.test.js`；覆盖跨动作 requestId 污染、串行 dedupe、create/update 并发幂等、`playerId/_id` roster contract。

## Next Steps
- 中优先级后端 contract 仍待收口：结构化失败返回统一、`getUserProfile` 真实数据库故障透传、前端 `not_found` 分类纠正。
- 低优先级与审计项仍待处理：`scoreLock` 的 `finished/expired/occupied/canceled` state 语义整理、`scripts/scheduler-scenario-common.js` 改按 `effectiveCourts` 推导 `logicalRounds/rest`。
- 附加风险仍未处理：`getMyPerformanceStats` 4k 查询上限没有 `truncated` 信号。

## Blockers
- 无。

## Verified Subset Output
- 全量测试：`node --test tests/*.test.js` => `771 pass / 0 fail`
- 静态检查：`npm run check` => pass
- shared-common 校验：`bash scripts/check-cloud-common.sh` => pass
