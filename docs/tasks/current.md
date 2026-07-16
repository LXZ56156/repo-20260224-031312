# Current Task

> AI session handoff. Keep this file concise; detailed evidence belongs in session logs.

## Status: parallel_roadmap_integrated_and_verified_locally_online_master_unchanged

## Version State (2026-07-17)

- 当前线上正式版：`master` = `origin/master` = `5813ffc`。
- 统一并行 checkpoint：`codex/ui-optimization-v2@70845c1`；本地功能集成 head：`530ecae`，其后仅追加本总控文档与验证记录。
- 远端开发分支仍为 `origin/codex/ui-optimization-v2@743b016`；本地集成未 push、未建 PR。
- 开发分支尚未进行小程序 preview/upload 或正式发布；Git 本地提交不等于小程序发布，schedule 中央 `VS`/比分布局、打水 UI、Windows 工具链和本轮全部集成均未进入线上。
- `feature/core-flow-simplification` 已关闭，不得作为新任务基线。

## Integrated Roadmap

- 总入口：`docs/tasks/parallel-development-roadmap.md`。
- 总集成记录：`docs/tasks/session-logs/20260717-parallel-roadmap-integration.md`。
- P01 数据基线、P02 排阵覆盖审计、P05 clone preset 修复、P04 默认关闭事件管道 Phase A、P03 打水 MVP 已按 `P06 → P07 → P01 → P02 → P05 → P04 → P03` 本地集成。
- P03 的 9 项用户可见矩阵已批准；打水仅适用于 `multi_rotate`、默认关闭，不影响正式排名。
- 主集成树已通过云契约、`verify:full` 和 `settingsWater` / `matchWater` / `analytics` 三张真实 DevTools 截图验收；未做真机或真实云 smoke。
- P04 仍为双端关闭；不得部署启用、建真实集合或写入真实事件。启用前必须处理弱赛事假名、持久 install ID、调用者绑定/限流、保留删除和成本熔断。
- P06 保持 `discovery_complete_pending_product_approval`；P07 保持 `discovery_complete_pending_explicit_pilot_approval`，均未进入生产实现。
- P02 未修改模板或算法：180 日高频 `multi_rotate` 424 场中 406 场已命中当前模板前缀，18 场超过 horizon；缺失模板键为 0。后续只能单独审批 6 个满足等场必要条件的 horizon 扩展，`13p-2c@30m` 不满足等场规则。

## Parallel Development Contract

- 权威源码：`D:\projects(WIN)\badminton-miniapp`；不同对话必须使用独立 worktree 和独立 `codex/roadmap-*` 分支，不得在共享目录切分支。
- 所有 worktree 从同一个 docs checkpoint SHA 创建；产品差异始终对比 `master@5813ffc`。
- Worker 不修改本文件、总路线图、`AGENTS.md`、`package.json` 或 `miniprogram/app.json`，除非任务文档明确授权。
- 共享模板 `scripts/*-common.template.js` 同一时段只允许一条工作线修改；生成库必须通过 sync/check 流程维护。
- 用户可见页面、文案、CTA、导航、分享、默认行为或操作语义必须逐点审批，并在实现后做真实截图验收。

## Product Boundary

- 当前本地开发分支包含已批准但未上线的 schedule 对阵卡中央 `VS`/比分布局和 P03 打水 MVP。
- P05 只改变 `cloneTournament` 的配置复制契约；P04 基础设施默认关闭且未部署；P01/P02/P06/P07 不改变线上产品行为。
- 旧 core-flow 计划和日志仅作历史审计；未批准模板扩展、组局生产实现或 UI 组件试点。
- 详细边界：`docs/tasks/incremental-ui-optimization-plan.md`。

## Windows Contract

- preview/upload 镜像：`D:\projects(WIN)\badminton-miniapp-preview`；显式 WSL fallback：`/home/lizixuan/projects(WSL)/badminton-miniapp`。
- 禁用空壳：`D:\projects\badminton-miniapp`；自动化端口：`ws://127.0.0.1:39420`。
- 日常 npm、hooks、DevTools 和截图使用 Windows 原生入口；preview manifest 保持 fail-closed。

## Hard Boundaries

本轮本地 worktree、收口提交和主分支集成已获用户明确授权并完成。继续禁止小程序 upload/preview upload、正式发布、云函数部署、真实云数据写入、push 或 PR；禁止启用 P04 事件采集；不 reset、clean 或 checkout 覆盖既有改动。未来任何远端、发布、部署或新的用户可见实现仍需当次明确授权。
