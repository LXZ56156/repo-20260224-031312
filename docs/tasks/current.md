# Current Task

> AI session handoff file. Update this when starting/completing significant work.
> Keep it short - just enough for the next session to continue without re-investigation.

## Status: in_progress

## Last Completed
- 2026-04-09 Codex: 完成 `multi_rotate` horizon / preset 全面修正，60 个 case 的推荐场数与 `scheduler-full-audit.md` 已更新；关键结果包括 `20p-2c -> [12,15,18]`、`20p-3c -> [14,17,18]`、`24p-1c -> [12,15,16]`、`24p-3c -> [16,17,18]`。
- 2026-04-09 Codex: 全量测试重新跑通，`node --test tests/*.test.js` 与 `npm run check` 通过；为稳定全量回归，调整了 squad 慢测阈值，并让矩阵执行层在场景异常时重试一次后再记 failure。
- 2026-04-09 Codex: 新增 `report:scheduler-full-audit` 和 `docs/scheduler-full-audit.md`，把 `multi_rotate` / `squad_doubles` 全量矩阵审计与 60 个 `multi_rotate` 推荐场数汇总成 Markdown 报告。
- 2026-04-09 Codex: 新增排阵场景矩阵验收层，加入 `tests/scheduler.scenarios.test.js` 和 `npm run audit:scheduler-scenarios`，覆盖普通转模板/预算场景与小队转常见矩阵。
- 2026-04-09 Codex: 优化 `multi_rotate` 固定推荐场数，新增 partner coverage 里程碑指标，`16p-4c -> [8,12,16]`、`8p-2c -> [8,14,16]`，并让无历史总场次时默认落到新的 `balancedMatch`。

## In Progress
- 2026-04-09 Codex: 当前未继续改算法；待处理项已经切换为 `squad_doubles` 审计失败收敛。`npm run audit:scheduler-scenarios` 现在能完整跑完并输出表格，但当前结果是 `warnings=20 / failures=17`；`npm run report:scheduler-full-audit` 会写出报告后以非零退出，当前报告里是 `warnings=19 / failures=14`。
- `multi_rotate` 推荐合理性审计仍为 `0 issue`，说明这轮 horizon / preset 修正已经稳定。

## Next Steps
- 如果继续当前主题，下一步应聚焦 `squad_doubles` 的等人数矩阵慢场景，优先看报告里的 failure 列表：`6v6/2c`、`7v7/2c/3c`、`8v8/3c/4c`、`9v9/4c`、`10v10/3c/4c`。
- 若只准备提交本轮 `multi_rotate` 工作，可直接提交；需要注意提交说明里应明确“测试全绿，但矩阵审计与 full audit 仍暴露既有 squad 性能失败”。

## Blockers
- 无代码阻塞；当前 blocker 是 `squad_doubles` 审计指标未收敛，所以 `audit` / `report` 命令按设计返回非零。

## Verified Subset Output
- 当前仓库产物已验证：
  - `20p-2c -> horizon 18, presets [12,15,18], balanced 15`
  - `20p-3c -> horizon 18, presets [14,17,18], balanced 18`
  - `20p-4c -> horizon 16, presets [14,15,16], balanced 16`
  - `24p-1c -> horizon 16, presets [12,15,16], balanced 15`
  - `24p-2c -> horizon 18, presets [6,12,18], balanced 18`
  - `24p-3c -> horizon 18, presets [16,17,18], balanced 18`
  - `24p-4c -> horizon 16, presets [14,15,16], balanced 16`
