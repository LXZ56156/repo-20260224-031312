# Current Task

> AI session handoff. Keep this current; historical implementation evidence belongs in session logs.

## Status: ui_v2_branch_pushed_online_master_unchanged

## Version State (2026-07-15)

- 用户确认当前线上正式版对应 `master` = `origin/master` = `5813ffc`。
- 开发分支 `codex/ui-optimization-v2` 已推送到 `origin/codex/ui-optimization-v2`；实现 checkpoint 为 `06922a6`，后续文档同步继续在同一分支提交。
- Git push 只同步源码，不等于小程序 upload/preview upload/发布或云函数部署；当前分支尚未进行小程序 preview/upload 或正式发布，schedule 中央比分及 tooling/docs 变化未进入线上。

## Product Decision (2026-07-13)

用户否定 `feature/core-flow-simplification` 的整体 UI 与流程方向。该分支虽然曾完成技术验证，但删除了过多创建确认、信息层级、赛后复盘、分享语境和视觉氛围，不再继续 UI 点 4/5，也不再作为开发基线。

当前分支 `codex/ui-optimization-v2` 从 `master@5813ffc` 创建，保持 master 原产品流程与视觉。唯一获准保留的可见改动是 schedule 对阵卡：待录分 `VS` 和完赛比分位于双方头像姓名之间，名称可使用两行，避免原固定右侧比分栏挤压姓名。

详细范围：`docs/tasks/incremental-ui-optimization-plan.md`；本轮交接记录见 `docs/tasks/session-logs/20260715-ui-v2-online-baseline-and-push.md`。旧 core-flow 计划和日志只作为历史审计。

## Current Scope

- 产品代码白名单：`miniprogram/pages/schedule/index.wxml`、`miniprogram/pages/schedule/index.wxss`；`cloudfunctions/` 保持 master，无需部署。
- `launch/create/lobby/match/ranking/analytics/home/share-entry`、导航、业务 core 与全局样式保持 master。
- 从旧分支按白名单迁入 Windows 原生工具链、workflow records、hooks 与验证测试；fixture 通过 13/13 契约测试，2026-07-14 三页真实 smoke 全部通过。canonical record 是 `5813ffc + dirty=true` 的 pre-commit acceptance snapshot，只证明当时工作区像素验收。
- 冷启动/全量复验修复四项非功能工具问题：空进程集合参数校验、过早第二次 `auto` 引发的 AppService 竞态、DevTools 多顶层窗口/前台锁导致的截图恢复失败，以及墙钟预算型调度质量回归受桌面负载影响；公平性测试改用确定的 operation clock，独立性能测试仍用真实时钟。
- 文档体系同步 canonical Windows 路径、工具命令、旧方向关闭原因和新 UI 审批方式。

## Windows Development Contract

- 权威源码：`D:\projects(WIN)\badminton-miniapp`
- preview/upload 镜像：`D:\projects(WIN)\badminton-miniapp-preview`
- 显式 WSL fallback：`/home/lizixuan/projects(WSL)/badminton-miniapp`
- 禁用空壳：`D:\projects\badminton-miniapp`
- 主 launcher：`D:\weapp-mcp-launcher\weapp-main-dev.cmd`
- 自动化端口：`ws://127.0.0.1:39420`

日常 npm、Codex/Claude hooks、DevTools 和截图走 Windows 原生 Node/PowerShell；WSL mirror 仅在显式 `WEAPP_CODEX_DEV_MODE=wsl-mirror` 时启用。preview manifest 有意保持 stale/fail-closed，明确同步并取得 preview/upload 授权前不得使用。

## Acceptance Before Completion

- 审查相对 master 的产品差异，只允许两个 schedule 文件；云函数差异必须为空。
- schedule 聚焦测试、`verify:windows-env`、`verify:light`、`verify:full` 与 `git diff --check` 已通过；最终全量为 1165 项、1159 通过、6 跳过、0 失败，lint 0 error（64 个既有 warning）。
- 已从权威 Windows 源码重跑 `scheduleRunning` 与三页 smoke；`VS`、`21:17`、长中文名、长英文名均完整可读，无重叠或裁切。
- 2026-07-12 的三页 smoke 属于旧分支/工具迁移历史证据，不能代替新分支产品验收。
- 本轮 5 个实现/验收提交已于 2026-07-15 推送到远端开发分支；未创建 PR、未合并 master、未执行小程序或云函数远程操作。下一项用户可见优化必须重新逐点审批。

## Hard Boundaries

不执行小程序 upload/preview upload、发布、云函数部署或真实云数据写入；不 reset、clean 或 checkout 覆盖既有改动。后续 push 仍需当次授权；任何其他用户可见 UI、文案、CTA、导航或流程变化都要逐点取得明确批准。增长飞轮 Phase 2 仍需刷新线上数据并单独批准，不属于本轮任务。
