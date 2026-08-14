# Current Task

> 当前 CONTROL 分支任务入口。跨分支产品、发布和 worktree 事实统一见 `control/`。

## Status: worktree_control_plane_phase_1_completed

## Scope

- 用户要求按顺序执行项目文档与工作流整理方案。
- 已落地唯一 CONTROL、干净 PRODUCTION、注册表和只读状态检查；不修改用户可见产品行为。
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
- 已提交治理基线 `0157c66`，并创建 `codex/project-control` 与 `codex/production-baseline-20260814`。
- 已从 `55bfc4f` 建立干净 PRODUCTION，未执行 preview、upload、release 或 cloud deploy。
- 已登记全部 18 个挂载 worktree：CONTROL 1、PRODUCTION 1、ACTIVE 0、RELEASE 0、archive pending 16；实时对账无漂移。
- 已验证 PRODUCTION 的 633 个 tracked `miniprogram` 文件及两个 upload overlay SHA-256，并保存控制面 receipt。
- 全量验证通过：1359 tests / 0 failed / 7 skipped，lint 0 errors。
- Phase 2 的 3 个 clean 历史 worktree 已完成 bundle、SHA-256、实际 clone 恢复验证和 Git worktree 卸载；branch 与 bundle 保留。
- worktree 总数从 18 降至 15；剩余 13 个历史挂载树仍为 `archive_pending`。
- `local-ops-dashboard` 原路径存在被运行中进程锁定的非 Git 残留，已登记，未强杀进程。

## Current Branch

- 工作区：`D:\projects(WIN)\badminton-miniapp-control`
- 分支：`codex/project-control`
- 当前任务：Phase 1 已完成，等待进入安全归档阶段。

## Next Action

1. Phase 3 按“截图/文档 → upload 隔离 → 旧打水 → Next-Gen”顺序归档 dirty worktree。
2. 每棵先生成完整四件套和恢复验证，再逐路径取得卸载授权。
