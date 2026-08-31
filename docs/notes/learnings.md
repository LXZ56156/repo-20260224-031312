# Learnings & Temporary Rules

> Accumulate discoveries, gotchas, and temporary constraints here.
> Periodically review: promote stable rules to AGENTS.md or the matching spec/tool document, and archive resolved items.

## Active
- [2026-08-31] 在线缓存先显是性能实现，不是用户任务，必须静默；临时顶部同步横幅会造成页面跳动和视觉噪声。`syncUsingCache=true && networkOffline=false` 时，不得因伴随的 stale 或 polling 状态换文案继续显示顶部提示；真实离线、写入失败和数据冲突提示不受影响。
- [2026-08-11] 高风险 UI 必须做两次相互隔离的盲审，并由主控记录共同结论、分歧和采纳/拒绝理由。双盲审最低规则：同一状态最多“主显示 + 一次校验”；主 CTA 不承载动态摘要，真实图中必须 ≥44px、全宽/对齐且默认单行；长名单采用固定 header/footer + 单一中部滚动；safe-area 只有一个 owner；选择状态至少使用文字/符号与边框/填充中的两类线索，不能只靠红绿或伪元素；高密度状态先测 24 人、长昵称、320/390/430、字体放大、搜索空态、键盘和原生 picker。实现后盲审还必须核对：当前操作侧与首屏名单一致、滚动有显式可发现线索、人数/单位等语义原子不会被截断、关键弹层有 ≥44px 可访问关闭入口、24rpx 辅助文字达到 4.5:1；筛选空态不得保留已经失效的滑动/点选提示，必须提供可见且 ≥44px 的清除或恢复入口；户外高频页面的禁用关键 CTA 即使属于 WCAG 豁免，也按至少 4.5:1 保证可辨认性。完整双盲审记录见 `docs/reports/2026-08-11-water-ui-blind-review.md`。
- [2026-08-08] 增量 UI 的“从 master + 单一 overlay 建基线”是一次性启动门槛，不是每个后续对话都重做的动作。基线后逐点批准的功能必须写入 `current.md` 和路线文档；继续任务从当前批准链出发。初始“仅 schedule 两文件、cloud 空”只能标为历史建基线证据，不能覆盖后来已批准的 water/launch/cloud 差异。
- [2026-08-08] UI 证据必须分三类表述：真实 DevTools 图、结构/数学检查、浏览器近似稿。只有第一类可作当前源码小程序像素验收；320/390/430 未分别截图时，必须逐档写“结构/数学等效”，不得称“三档实图”。44px 触达按每个 viewport 的最终 CSS px 核对，不能只看 rpx 数字。
- [2026-08-08] DevTools 端口没有固定协议角色。一次会话中的 `39420` IDE HTTP、`39424` CDP、`39432` automation 不能推广成永久映射；必须验证进程树、exact project path、`Tool.getInfo` 和 `App.getCurrentPage`，再显式设置 `WEAPP_WS_ENDPOINT`。最小化 surface 可能截图超时，优先 restored-but-background，并如实记录当前脚本没有窗口/焦点证明。
- [2026-08-08] Launch CTA 对齐的有效修复是让 quick-water 与 tournament action row 具有相同 DOM 子结构，再复用同一 flex 规则；这比为单个卡片猜 Grid 列宽稳定。该结论仅适用于本页面当前结构。自动 validator 仍需检查每个 selector 精确命中一次和真实绝对 geometry；相对 left/width 相等不能排除共同溢出。
- [2026-08-08] 只有 pre-change 或未改依赖闭包能重复出现的失败才可称既有 flake。必须记录测试文件、错误/失败数、运行模式和复跑结果；“baseline flake”不等于全量通过。提交例外要求用户先看见完整事实并明确授权，后续新失败仍需重新判断。
- [2026-08-08] commit、push、PR、preview QR、preview、`mp:upload`、正式发布、云函数部署和真实数据写入是独立状态。一次 `waterSession` 部署授权不覆盖再次部署或小程序发布；早于 `c2f438a` 的 preview QR 不能作为当前 launch 或线上版本证据。
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
  - UI 改动必须走真实截图检查（`npm run ui:screenshot -- <case>`）；当时使用 `39420`，该端口只作历史记录，不是当前固定 automation endpoint。
  - Phase 2 需要等 Phase 1 线上数据积累（≥7 天）后再启动，用埋点数据而非直觉驱动优先级。
  - 完整方案见 `docs/specs/growth-flywheel-optimization.md` v1.2.3。
- [2026-06-15] 小程序 UI 改动必须走真实截图检查。该原则仍有效；当时的 WSL/miniprogram-browser/`39420` 操作已经历史化，当前 endpoint 必须按 exact Windows DevTools 会话验证并显式传入。`layout` 和 DOM 只作结构辅助。完整流程见 `docs/tools/weapp-ui-screenshot-workflow.md`。
- [2026-06-11] 文档生命周期规则：
  1. `docs/tasks/current.md` 保持 ≤50 行，会话结束后将验证细节提取到 `docs/tasks/session-logs/`
  2. 一次性计划/审计/报告完成后移入 `docs/reports/`（审计/报告类）或 `docs/archive/`（历史计划类）
  3. 功能设计文档和实现计划放在 `docs/specs/`
  4. 定期清理 `docs/archive/`，确认不再需要后可以删除
- [2026-06-05] 拉取微信 we分析数据时，直接使用已有的 `scripts/fetch-we-analysis.js` 本地脚本，不要通过 CloudBase MCP 或其他途径。该脚本支持 10 种 datacube API（dailyVisitTrend/monthlyVisitTrend/visitPage/userPortrait 等），从 `.env.local` 读取 WX_APPID/WX_APPSECRET，token 缓存在 `.cache/`，输出 JSON/CSV 到 `data/we-analysis/`。完整文档见 `docs/tools/we-analysis-local-script.md`。之前的拉取数据（100+ 天）已全量存在于 `data/we-analysis/` 目录，新建会话时先检查该目录已有数据避免重复拉取。
- [2026-05-27] `npm run mp:upload` 上传小程序前，用 `git log <上次上传commit>..HEAD --oneline` 查看新增提交，总结为小程序用户可感知的变更摘要，通过 `MP_DESC` 环境变量传入。不要直接使用 git commit message（那是给开发者看的），要翻译成功能变化描述。上传完成后在 `current.md` 记录本次上传的 commit 和备注。示例：`MP_DESC="共享卡片动态消息修复不生效问题；头像全局共享缓存减少闪烁" npm run mp:upload`。IP 白名单关闭后可跳过 IP 校验。密钥放在项目外 `.keys/` 目录（已 gitignore）。
<!-- Format: - [date] description. Why it matters. -->
- [2026-05-02] `scripts/*-common.template.js` 是云函数共享库唯一源；修改后在 Windows 运行 `node scripts/run-bash-script.js scripts/sync-cloud-common.sh` 与 `npm run check:cloud-common`，只部署实际受影响的云函数，避免手改 `cloudfunctions/*/lib/*` 造成漂移。Windows 不得直接调用裸 `bash`。

## Resolved / Archived
<!-- Move items here when no longer relevant, with resolution date. -->
