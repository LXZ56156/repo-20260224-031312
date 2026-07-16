# Learnings & Temporary Rules

> Accumulate discoveries, gotchas, and temporary constraints here.
> Periodically review: promote stable items to CLAUDE.md, delete resolved items.

## Active
- [2026-07-16] 后续产品研发采用 `docs/tasks/parallel-development-roadmap.md` 统一编排：每个对话使用独立 worktree/`codex/roadmap-*` 分支，只维护自己的任务文档和 session log；`current.md` 与总路线图由集成对话维护。事件管道 Phase A 不接入现有业务热函数，任何用户可见页面、文案、CTA、导航、分享、默认行为或操作语义仍须先提交审批矩阵并获得明确批准。
- [2026-07-15] 用户确认当前线上正式版对应 `master` = `origin/master` = `5813ffc`。`codex/ui-optimization-v2` 虽已推送到 GitHub，但尚未执行小程序上传/发布，其 schedule/tooling/docs 变化不在线上；后续交接必须把 Git branch、preview/upload 和线上 release 三种状态分开描述。
- [2026-07-14] DevTools 冷启动只执行一次 exact `auto --project`，为同一 AppService 保留 75 秒；CLI quit 后空进程集合表示目标树已退出。截图窗口必须按同一 PID 下带 DevTools 标题的可见顶层窗口选择，恢复时校验原句柄仍归属该 PID，不能假设 `.NET MainWindowHandle` 全程稳定。全量 `node:test` 按文件串行；squad 公平性质量回归用每次 deadline read 前进 `0.002ms` 的 operation clock，使相同输入获得相同操作预算，不能用放宽阈值掩盖抖动。真实墙钟性能继续由 `squad.beam.performance.test.js` 覆盖。
- [2026-07-13] `feature/core-flow-simplification` 已因整体 UI/流程方向不符合预期而关闭。当前 `codex/ui-optimization-v2` 从 `master@5813ffc` 起步，只保留 schedule 对阵卡中央 `VS`/比分布局；其他页面、流程与视觉保持 master。后续 UI 必须逐点批准、实图验收、单独提交，详见 `docs/tasks/incremental-ui-optimization-plan.md`。
- [2026-07-13] Windows 权威源码为 `D:\projects(WIN)\badminton-miniapp`，preview 镜像为 sibling `badminton-miniapp-preview`，WSL mirror 仅显式启用。截图先跑 `npm run weapp:probe`，常用闭环为 `npm run screenshot:smoke`，失败用 `npm run screenshot:diagnose -- <case>`；不要使用空壳 `D:\projects\badminton-miniapp` 或旧端口 `9420`。
- [2026-06-15] 增长飞轮 Phase 1 已完成并推送。关键经验：
  - "方案 A + E + 轻量 D"的组合策略有效——聚焦最短可验证闭环（入口转化 + 埋点 + 再分享），而不是分散做 P0–P5 功能清单。
  - 所有改动仅限前端（零云函数、零数据库集合），改动范围收束在 share-entry/lobby/ranking/schedule/analytics/home 6 个页面 + growthTracker 模块。
  - UI 改动必须走真实截图检查（`npm run ui:screenshot -- <case>`），自动化端口 `39420`。
  - Phase 2 需要等 Phase 1 线上数据积累（≥7 天）后再启动，用埋点数据而非直觉驱动优先级。
  - 完整方案见 `docs/specs/growth-flywheel-optimization.md` v1.2.3。
- [2026-06-15] 小程序 UI 改动必须走真实截图检查。该规则仍有效，但当时的 `miniprogram-browser`/WSL 操作已被 Windows 原生 `weapp:probe`、`ui:screenshot`、`screenshot:smoke` 和 `screenshot:diagnose` 取代；历史 `layout` 只能作结构辅助。完整当前流程见 `docs/tools/weapp-ui-screenshot-workflow.md`。
- [2026-06-11] 文档生命周期规则：
  1. `docs/tasks/current.md` 保持 ≤50 行，会话结束后将验证细节提取到 `docs/tasks/session-logs/`
  2. 一次性计划/审计/报告完成后移入 `docs/reports/`（审计/报告类）或 `docs/archive/`（历史计划类）
  3. 功能设计文档和实现计划放在 `docs/specs/`
  4. 定期清理 `docs/archive/`，确认不再需要后可以删除
- [2026-06-05] 拉取微信 we分析数据时，直接使用已有的 `scripts/fetch-we-analysis.js` 本地脚本，不要通过 CloudBase MCP 或其他途径。该脚本支持 10 种 datacube API（dailyVisitTrend/monthlyVisitTrend/visitPage/userPortrait 等），从 `.env.local` 读取 WX_APPID/WX_APPSECRET，token 缓存在 `.cache/`，输出 JSON/CSV 到 `data/we-analysis/`。完整文档见 `docs/tools/we-analysis-local-script.md`。之前的拉取数据（100+ 天）已全量存在于 `data/we-analysis/` 目录，新建会话时先检查该目录已有数据避免重复拉取。
- [2026-05-27] `npm run mp:upload` 上传小程序前，用 `git log <上次上传commit>..HEAD --oneline` 查看新增提交，总结为小程序用户可感知的变更摘要，通过 `MP_DESC` 环境变量传入。不要直接使用 git commit message（那是给开发者看的），要翻译成功能变化描述。上传完成后在 `current.md` 记录本次上传的 commit 和备注。示例：`MP_DESC="共享卡片动态消息修复不生效问题；头像全局共享缓存减少闪烁" npm run mp:upload`。IP 白名单关闭后可跳过 IP 校验。密钥放在项目外 `.keys/` 目录（已 gitignore）。
<!-- Format: - [date] description. Why it matters. -->
- [2026-05-02] `scripts/*-common.template.js` 是云函数共享库唯一源；修改后先运行 `npm run sync:cloud-common`，再用 `npm run check:cloud-common` 校验，只部署实际受影响的云函数，避免手改 `cloudfunctions/*/lib/*` 造成漂移。

## Resolved / Archived
<!-- Move items here when no longer relevant, with resolution date. -->
