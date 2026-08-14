# Repository Maintenance Policy

## 每次重要任务结束

- 更新 `docs/tasks/current.md`，保持不超过 50 行。
- 若发生 push、preview/upload、云部署或正式发布，追加 `docs/status/release-ledger.md`。
- 临时发现只进入 `docs/notes/learnings.md`；稳定规则提升到 `AGENTS.md`、`docs/status/` 或 runbook。
- 运行 `npm run docs:check` 和与风险匹配的验证。

## 每周

- 运行 `npm run repo:inventory -- --json`，检查新增 dirty/detached worktree。
- 核对无 upstream 的重要分支是否已有 bundle、远端或其他可恢复备份。
- 检查 `current.md`、`project-state.md` 是否超过 14 天未更新。

## 每月

- 将完成、取消或暂停且不再执行的 task、handoff、session log 移入年度 archive。
- 对 clean worktree 生成“保留/已包含/可归档/待确认”结论。
- 只有在分支已备份、提交已包含、路径明确且用户批准后，才执行 worktree prune 或 branch 删除。
- 审查公共 npm 命令；废弃 alias 至少保留一个迁移周期再删除。

## 规模目标

- 活跃 worktree：3–5 个；其余必须有明确的保护或归档状态。
- 活跃任务入口：`docs/tasks/current.md` 一份；兼容 evidence 目录不得伪装成当前计划。
- 稳定规则只维护一份；Claude/Copilot 等入口只链接，不复制。
- 易变事实只放 `docs/status/`，不写入 architecture 或稳定 agent 指令。
