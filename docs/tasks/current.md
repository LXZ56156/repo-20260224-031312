# Current Task

> 当前 CONTROL 分支任务入口。跨分支产品、发布和 worktree 事实统一见 `control/`。

## Status: worktree_consolidation_finalizing

## Scope

- 用户要求按顺序执行项目文档与工作流整理方案。
- 已落地唯一 CONTROL、干净 PRODUCTION、注册表和只读状态检查；不修改用户可见产品行为。
- dirty worktree 仅在完整 bundle、patch、未跟踪归档与逐文件恢复验证通过后，按用户统一授权卸载。
- 不执行 push、preview/upload、正式发布、cloud deploy 或真实数据写入。

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
- `local-ops-dashboard` 锁定进程已通过 Restart Manager 确认为本地 Node 看板并停止；非 Git 残留已移动到备份区，原路径已清除。
- Phase 3 第一组 `07af`、`a6ba` 已完成四件套、实际恢复验证和卸载。
- Phase 3 upload 组 `ba45`、`mp-upload-e60d827`、feedback-r3 已完成恢复验证和卸载；私密 `.codex` 证据单独离线保存。
- Phase 3 旧打水组 V1、Vant、TDesign 已完成逐文件恢复验证和卸载。
- Phase 3 Next-Gen 组 4 棵树的 127 个变更/未跟踪文件已完成状态与 SHA-256 恢复验证并卸载。
- worktree 总数从 20 收敛至 3；15 个历史 worktree 已归档，剩余主 Git 工作区 1 个待登记为元数据根。

## Current Branch

- 工作区：`D:\projects(WIN)\badminton-miniapp-control`
- 分支：`codex/project-control`
- 当前任务：安全归档已完成，正在收敛主 Git 元数据根并执行最终验证。

## Next Action

1. 将主 Git 工作区登记为 clean、只读的 `METADATA_ROOT`，保留 linked worktree 共用 Git 元数据。
2. 运行控制面对账与最终全量验证，完成整理。
