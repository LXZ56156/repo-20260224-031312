# Learnings & Temporary Rules

> Accumulate discoveries, gotchas, and temporary constraints here.
> Periodically review: promote stable items to CLAUDE.md, delete resolved items.

## Active
- [2026-07-03] Windows 迁移后日常开发直接使用主源码 `D:\projects\badminton-miniapp`，通过 `D:\weapp-mcp-launcher\weapp-main-dev.cmd` 启动微信开发者工具自动化，端口仍为 `ws://127.0.0.1:39420`。旧 `D:\weapp-mcp-launcher\weapp-mcp.cmd` 和 `D:\projects\badminton-miniapp-preview` 仅保留给 preview/upload 镜像用途；Codex hooks 日常 preflight 不再触发 WSL mirror sync。`install-cloud-deploy-hook.sh` 在 Windows 必须用 Git Bash 执行：`D:\Soft\Git\bin\bash.exe scripts/install-cloud-deploy-hook.sh`，迁移阶段不要安装 `.git/hooks/post-commit`，避免 commit 后误触发云函数部署检查。
- [2026-07-03] Squad fairness 精确回归测试不能依赖真实 wall-clock beam budget。`startTournament` squad engine 增加仅测试传入的 deterministic search 选项，默认生产路径仍走原 soft/hard deadline；公平性断言未放宽。Windows 主项目已有有效 `tmp\ui-screenshots-actual\scheduleRunning.png`，确认 `21:17` 位于双方中间；后续重跑 `App.captureScreenshot` 超时但端口、页栈和 DOM 正常，作为 DevTools screenshot surface 运维问题单独排查。
- [2026-06-28] 微信 DevTools 真实截图验收优先迁到 Windows 端执行。已验证 `D:\weapp-mcp-launcher` + `weapp-mcp.cmd` + `ws://127.0.0.1:39420` 可稳定单页、跨页、每 case 重连、快速切换、同页高频和 3 分钟长跑截图；`9420` 不可用。WSL/Linux 侧截图曾出现连接失败、超时或空白图，后续 UI 验收截图用 Windows 端 launcher，代码修改和 Node 测试仍可在当前仓库执行。完整流程见 `docs/tools/weapp-ui-screenshot-workflow.md`。
- [2026-06-15] 增长飞轮 Phase 1 已完成并推送。关键经验：
  - "方案 A + E + 轻量 D"的组合策略有效——聚焦最短可验证闭环（入口转化 + 埋点 + 再分享），而不是分散做 P0–P5 功能清单。
  - 所有改动仅限前端（零云函数、零数据库集合），改动范围收束在 share-entry/lobby/ranking/schedule/analytics/home 6 个页面 + growthTracker 模块。
  - UI 改动必须走真实截图检查（`npm run ui:screenshot -- <case>`），自动化端口 `39420`。
  - Phase 2 需要等 Phase 1 线上数据积累（≥7 天）后再启动，用埋点数据而非直觉驱动优先级。
  - 完整方案见 `docs/specs/growth-flywheel-optimization.md` v1.2.3。
- [2026-06-15] 小程序 UI 改动必须走真实截图检查：先确认 DevTools 自动化运行态，再生成真实页面截图。当前稳定自动化端口是 `39420`，不要使用旧端口 `9420`；`miniprogram-browser screenshot --mode page` 在 WSL 下可能超时或空白，`layout` 只作结构辅助。真实视觉验收优先走 Windows 端 launcher。完整流程见 `docs/tools/weapp-ui-screenshot-workflow.md`。
- [2026-06-11] 文档生命周期规则：
  1. `docs/tasks/current.md` 保持 ≤50 行，会话结束后将验证细节提取到 `docs/tasks/session-logs/`
  2. 一次性计划/审计/报告完成后移入 `docs/reports/`（审计/报告类）或 `docs/archive/`（历史计划类）
  3. 功能设计文档和实现计划放在 `docs/specs/`
  4. 定期清理 `docs/archive/`，确认不再需要后可以删除
- [2026-06-05] 拉取微信 we分析数据时，直接使用已有的 `scripts/fetch-we-analysis.js` 本地脚本，不要通过 CloudBase MCP 或其他途径。该脚本支持 10 种 datacube API（dailyVisitTrend/monthlyVisitTrend/visitPage/userPortrait 等），从 `.env.local` 读取 WX_APPID/WX_APPSECRET，token 缓存在 `.cache/`，输出 JSON/CSV 到 `data/we-analysis/`。完整文档见 `docs/tools/we-analysis-local-script.md`。之前的拉取数据（100+ 天）已全量存在于 `data/we-analysis/` 目录，新建会话时先检查该目录已有数据避免重复拉取。
- [2026-05-27] `npm run mp:upload` 上传小程序前，用 `git log <上次上传commit>..HEAD --oneline` 查看新增提交，总结为小程序用户可感知的变更摘要，通过 `MP_DESC` 环境变量传入。不要直接使用 git commit message（那是给开发者看的），要翻译成功能变化描述。上传完成后在 `current.md` 记录本次上传的 commit 和备注。示例：`MP_DESC="共享卡片动态消息修复不生效问题；头像全局共享缓存减少闪烁" npm run mp:upload`。IP 白名单关闭后可跳过 IP 校验。密钥放在项目外 `.keys/` 目录（已 gitignore）。
<!-- Format: - [date] description. Why it matters. -->
- [2026-05-02] `scripts/*-common.template.js` 是云函数共享库唯一源；修改后先运行 `bash scripts/sync-cloud-common.sh`，再用 `bash scripts/check-cloud-common.sh` 校验，只部署实际受影响的云函数，避免手改 `cloudfunctions/*/lib/*` 造成漂移。

## Resolved / Archived
<!-- Move items here when no longer relevant, with resolution date. -->
