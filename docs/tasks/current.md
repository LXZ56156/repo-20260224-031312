# Current Task

> AI session handoff. Keep this file concise; detailed evidence belongs in session logs.

## Status: parallel_roadmap_ready_online_master_unchanged

## Version State (2026-07-16)

- 当前线上正式版：`master` = `origin/master` = `5813ffc`。
- 当前开发基线：`codex/ui-optimization-v2` = `origin/codex/ui-optimization-v2` = `743b016`。
- 开发分支尚未进行小程序 preview/upload 或正式发布；Git push 不等于小程序发布，schedule 中央 `VS`/比分布局、Windows 工具链和后续文档均未进入线上。
- `feature/core-flow-simplification` 已关闭，不得作为新任务基线。

## Active Roadmap

- 总入口：`docs/tasks/parallel-development-roadmap.md`。
- 独立任务：`docs/tasks/parallel-development/01-07`；每个对话只维护自己的任务文档和 session log。
- 文档 checkpoint 与独立 worktree 建好后，第一批可并行启动：01 数据基线、02 排阵观测、04 事件管道 Phase A、06 组局规格、07 UI 组件调研。
- 03 打水 MVP 与 05 clone 复办基础涉及用户可见或行为语义，实施前必须按各自审批矩阵获得明确批准。
- 02 在 01 给出高频组合 Pareto 前不得批量新增模板；04 Phase A 不接入现有业务热函数；06/07 仅做 discovery，不改生产代码。
- 推荐集成顺序：文档 checkpoint → 01/02 审计与 06/07 规格 → 05 → 04 基础设施 → 02 高频模板 → 03 → 常用名单 → 单点漏斗 UI → 组局 Lite。

## Parallel Development Contract

- 权威源码：`D:\projects(WIN)\badminton-miniapp`；不同对话必须使用独立 worktree 和独立 `codex/roadmap-*` 分支，不得在共享目录切分支。
- 所有 worktree 从同一个 docs checkpoint SHA 创建；产品差异始终对比 `master@5813ffc`。
- Worker 不修改本文件、总路线图、`AGENTS.md`、`package.json` 或 `miniprogram/app.json`，除非任务文档明确授权。
- 共享模板 `scripts/*-common.template.js` 同一时段只允许一条工作线修改；生成库必须通过 sync/check 流程维护。
- 用户可见页面、文案、CTA、导航、分享、默认行为或操作语义必须逐点审批，并在实现后做真实截图验收。

## Existing Product Boundary

- 当前开发分支相对 `master@5813ffc` 唯一已批准的产品变化仍是 schedule 对阵卡中央 `VS`/比分布局。
- 其他页面与流程保持 master；旧 core-flow 计划和日志仅作历史审计。
- 详细边界：`docs/tasks/incremental-ui-optimization-plan.md`。

## Windows Contract

- preview/upload 镜像：`D:\projects(WIN)\badminton-miniapp-preview`；显式 WSL fallback：`/home/lizixuan/projects(WSL)/badminton-miniapp`。
- 禁用空壳：`D:\projects\badminton-miniapp`；自动化端口：`ws://127.0.0.1:39420`。
- 日常 npm、hooks、DevTools 和截图使用 Windows 原生入口；preview manifest 保持 fail-closed。

## Hard Boundaries

不执行小程序 upload/preview upload、正式发布、云函数部署、真实云数据写入、push、PR 或 merge；不 reset、clean 或 checkout 覆盖既有改动。提交、推送、建 worktree 与任何发布动作均需当次明确授权。
