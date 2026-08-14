# Current Task

> 当前 CONTROL 分支任务入口。跨分支产品、发布和 worktree 事实统一见 `control/`；说明性产品边界见 `docs/status/project-state.md`。

## Status: worktree_consolidation_completed

## Scope

- 用户要求按顺序执行项目文档与工作流整理方案。
- 已落地唯一 CONTROL、干净 PRODUCTION、注册表和只读状态检查；不修改用户可见产品行为。
- dirty worktree 仅在完整 bundle、patch、未跟踪归档与逐文件恢复验证通过后，按用户统一授权卸载。
- 不执行 push、preview/upload、正式发布、cloud deploy 或真实数据写入。

## Completed

- 2026-08-14 完成 36 个本地分支、20 个 worktree 的初始保护盘点；12 个 worktree dirty。
- 建立 `control/PROJECT.md`、`control/worktrees.json`、`control/release-ledger.jsonl` 和逐树 `control/archives/`，作为唯一当前事实源。
- 用户已统一选择兼容云函数自动部署；合同记录于 `docs/decisions/0001-compatible-cloud-auto-deploy.md`。
- 收敛 `AGENTS.md` / Claude / Copilot 入口，归档关闭计划、历史 session log 和已完成 handoff。
- 增加 `docs:check`、`repo:inventory`、`verify:changed`、回归测试和 GitHub Actions `verify` workflow。
- 用户确认正式线上版本为 `6.1.2-e60d827-r3`，客户端源码身份为 `55bfc4f`；`master@5813ffc` 降为历史基线。
- 从 `55bfc4f` 建立并逐文件验证干净 PRODUCTION；未执行 preview、upload、release 或 cloud deploy。
- 所有历史 dirty worktree 均先保存 bundle、binary patch、untracked archive、SHA-256 manifest 和恢复 clone，再按授权卸载。
- upload 私密证据 6579 个文件、旧打水组 2466 个文件、Next-Gen 组 127 个文件均完成逐文件恢复验证。
- worktree 总数从 20 收敛至 3；15 个历史 worktree 已归档，主 Git 工作区已登记为只读 `METADATA_ROOT`。

## Current Branch

- 工作区：`D:\projects(WIN)\badminton-miniapp-control`
- 分支：`codex/project-control`
- 当前任务：worktree 与文档控制面收敛完成，进入常态维护。

## Next Action

1. 新产品任务以 PRODUCTION 的线上源码基准创建唯一 ACTIVE。
2. 每次开工先运行 `npm run worktree:status`；任何未登记、漂移或关键工作区 dirty 都会失败。
