# Current Task

> 当前分支任务入口。跨分支产品、发布和 worktree 事实统一见 `docs/status/`。

## Status: docs_governance_consolidation_completed_online_baseline_confirmed

## Scope

- 用户要求按顺序执行项目文档与工作流整理方案。
- 当前只整理文档、状态入口和本地验证工作流；不修改用户可见产品行为。
- 不删除、移动或 prune 任何 dirty worktree，不执行 push、preview/upload、正式发布或真实数据写入。

## Completed

- 2026-08-14 完成 36 个本地分支、20 个 worktree 的只读盘点；12 个 worktree dirty。
- 确认 score-only 基线 worktree 已存在且 clean：`codex/incremental-ui-score-baseline-20260729@51fe6dc`。
- 建立 `docs/README.md`、`docs/status/project-state.md`、`release-ledger.md` 和 `worktree-inventory.md`。
- 用户已统一选择兼容云函数自动部署；合同记录于 `docs/decisions/0001-compatible-cloud-auto-deploy.md`。
- 收敛 `AGENTS.md` / Claude / Copilot 入口，归档关闭计划、历史 session log 和已完成 handoff。
- 增加 `docs:check`、`repo:inventory`、`verify:changed`、回归测试和 GitHub Actions `verify` workflow。
- 已为四个获准的 clean 研究 worktree 创建并验证 Git bundle，移除 worktree 后保留全部分支；现有 worktree 从 20 降为 16。
- 用户确认正式线上版本为 `6.1.2-e60d827-r3`，客户端源码身份为 `55bfc4f`；`master@5813ffc` 降为历史基线。

## Current Branch

- 工作区：`D:\projects(WIN)\badminton-miniapp`
- 分支：`codex/ui-optimization-v2@5c2e563`
- 开始整理前状态：clean，领先 `origin/codex/ui-optimization-v2` 2 个提交。

## Next Action

1. 按 `docs/status/worktree-control-plane.md` 建立独立 CONTROL 与干净 PRODUCTION；在控制面就绪前冻结新增 worktree。
