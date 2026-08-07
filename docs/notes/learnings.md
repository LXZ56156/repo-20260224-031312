# Learnings & Temporary Rules

> Accumulate discoveries, gotchas, and temporary constraints here.
> Periodically review: promote stable items to CLAUDE.md, delete resolved items.

## Active
- [2026-08-07] Windows 上不得把裸 `bash` 当成 Git Bash：当前 `bash` 可能解析到 `C:\Windows\System32\bash.exe`（WSL 入口），直接运行仓库 `.sh` 会出现 `WinError 193`、`EFTYPE` 或路径语义错误。npm scripts 统一走 `scripts/run-bash-script.js`，Node 测试统一用 `scripts/lib/git-bash.js`，Python hook 也必须显式解析 Git Bash。ESLint Flat Config 的构建产物忽略项必须放在独立的全局 `ignores` 配置对象中，否则前置推荐规则仍会扫描 `miniprogram/miniprogram_npm`。
- [2026-08-07] UI 完工前执行强制视觉自检，不把基础验收转嫁给用户：
  1. 只检查当前源码生成的真实微信 DevTools 截图；浏览器稿、旧截图、结构快照和自动量测都不能代替肉眼验收。
  2. 检查主操作、次操作和辅助操作是否一眼可辨。可点击项必须同时具备足够的文案、颜色、边框或填充等视觉线索，不能只做到“代码里能点”；所有关键触达区至少 44px。
  3. 检查文字基线、换行、截断、图标与文字间距、卡片边界、圆角、阴影、裁剪、遮挡、横向溢出和弹层越界，尤其防止原生 `button` 默认样式导致突出或漂移。
  4. 覆盖与本次改动相关的完整状态，不只看默认态：输入前/后、清空、空结果、选中/未选中、禁用、加载，以及人数或数据量变化。
  5. 涉及宽度或密度时至少检查 320/390/430；涉及长名单时同时检查阈值前后和高人数状态。
  6. 自动检查通过不等于视觉通过。主控逐张确认操作显著性、层级、对齐和边界均无明显缺陷，发现问题先修复、重跑测试和实图，再向用户汇报。
- [2026-06-15] 增长飞轮 Phase 1 已完成并推送。关键经验：
  - "方案 A + E + 轻量 D"的组合策略有效——聚焦最短可验证闭环（入口转化 + 埋点 + 再分享），而不是分散做 P0–P5 功能清单。
  - 所有改动仅限前端（零云函数、零数据库集合），改动范围收束在 share-entry/lobby/ranking/schedule/analytics/home 6 个页面 + growthTracker 模块。
  - UI 改动必须走真实截图检查（`npm run ui:screenshot -- <case>`），自动化端口 `39420`。
  - Phase 2 需要等 Phase 1 线上数据积累（≥7 天）后再启动，用埋点数据而非直觉驱动优先级。
  - 完整方案见 `docs/specs/growth-flywheel-optimization.md` v1.2.3。
- [2026-06-15] 小程序 UI 改动必须走真实截图检查：先用 `miniprogram-browser doctor` / `snapshot -i --layout` 确认 DevTools 运行态，再用 `npm run ui:screenshot -- <case>` 生成真实页面截图。当前稳定自动化端口是 `39420`，不要使用旧端口 `9420`；`miniprogram-browser screenshot --mode page` 在 WSL 下可能超时或空白，`layout` 只作结构辅助。完整流程见 `docs/tools/weapp-ui-screenshot-workflow.md`。
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
