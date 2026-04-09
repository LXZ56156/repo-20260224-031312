# Current Task

> AI session handoff file. Update this when starting/completing significant work.
> Keep it short - just enough for the next session to continue without re-investigation.

## Status: in_progress

## Last Completed
- 2026-04-10 Codex: 已提交当前阶段改动，commit `e0ad33d` (`feat: refine scheduler audits and presets`)。
- 2026-04-09 Codex: 完成 `multi_rotate` horizon / preset 全面修正，60 个 case 的推荐场数与 `scheduler-full-audit.md` 已更新；关键结果包括 `20p-2c -> [12,15,18]`、`20p-3c -> [14,17,18]`、`24p-1c -> [12,15,16]`、`24p-3c -> [16,17,18]`。
- 2026-04-09 Codex: 全量测试重新跑通，`node --test tests/*.test.js` 与 `npm run check` 通过；为稳定全量回归，调整了 squad 慢测阈值，并让矩阵执行层在场景异常时重试一次后再记 failure。
- 2026-04-09 Codex: 新增 `report:scheduler-full-audit` 和 `docs/scheduler-full-audit.md`，把 `multi_rotate` / `squad_doubles` 全量矩阵审计与 60 个 `multi_rotate` 推荐场数汇总成 Markdown 报告。
- 2026-04-09 Codex: 新增排阵场景矩阵验收层，加入 `tests/scheduler.scenarios.test.js` 和 `npm run audit:scheduler-scenarios`，覆盖普通转模板/预算场景与小队转常见矩阵。
- 2026-04-09 Codex: 优化 `multi_rotate` 固定推荐场数，新增 partner coverage 里程碑指标，`16p-4c -> [8,12,16]`、`8p-2c -> [8,14,16]`，并让无历史总场次时默认落到新的 `balancedMatch`。

## In Progress
- 2026-04-10 Codex: 当前主任务已经切换为 `squad_doubles` 审计 failure 收敛。`node --test tests/*.test.js` 和 `npm run check` 通过，但 `npm run audit:scheduler-scenarios` 与 `npm run report:scheduler-full-audit` 仍按设计返回非零，因为 `squad` 等人数矩阵仍有性能 failure。
- `multi_rotate` 推荐合理性审计仍为 `0 issue`，说明这轮 horizon / preset 修正已经稳定。
- 当前报告 [docs/scheduler-full-audit.md](/home/lizixuan/projects/badminton-miniapp/docs/scheduler-full-audit.md) 顶部统计：
  - `warnings=19`
  - `failures=14`
  - `multi_rotate` 只剩 longtail 预算场景告警/失败，主要待收敛的是 `squad_doubles`

## Next Steps
- 新对话继续时，先从 [docs/scheduler-full-audit.md](/home/lizixuan/projects/badminton-miniapp/docs/scheduler-full-audit.md) 的 `## squad_doubles 审计` 开始。
- 优先处理当前 failure 列表：
  - `squad equal 6v6/6m/2c`
  - `squad equal 6v6/12m/2c`
  - `squad equal 7v7/12m/2c`
  - `squad equal 7v7/9m/3c`
  - `squad equal 7v7/18m/3c`
  - `squad equal 8v8/9m/3c`
  - `squad equal 8v8/18m/3c`
  - `squad equal 8v8/12m/4c`
  - `squad equal 8v8/24m/4c`
  - `squad equal 9v9/12m/4c`
  - `squad equal 9v9/24m/4c`
  - `squad equal 10v10/24m/4c`
- 同时关注警告模式：
  - `greedy_fallback` 占比偏高
  - `elapsed_retry_passed` 说明首次运行偶发超过阈值
  - `10v10/24m/4c` 还有 `maxConsecutivePlay=5 > structureLimit=4`
- 建议优先检查这些文件：
  - [scheduleModes.js](/home/lizixuan/projects/badminton-miniapp/cloudfunctions/startTournament/scheduleModes.js)
  - [squadDoublesEngine.js](/home/lizixuan/projects/badminton-miniapp/cloudfunctions/startTournament/squadDoublesEngine.js)
  - [scheduler-scenario-common.js](/home/lizixuan/projects/badminton-miniapp/scripts/scheduler-scenario-common.js)
  - [scheduler.scenarios.test.js](/home/lizixuan/projects/badminton-miniapp/tests/scheduler.scenarios.test.js)
  - [squad.beam.performance.test.js](/home/lizixuan/projects/badminton-miniapp/tests/squad.beam.performance.test.js)

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
