# Current Task

> AI session handoff file. Update this when starting/completing significant work.
> Keep it short — just enough for the next session to continue without re-investigation.

## Status: idle

## What I'm Doing
- 当前无进行中工作。上一轮完成分享卡片全链路优化（Canvas 叠加层、海报、预热、小程序码、mixin 提取）。
- 仅剩 iPhone 真机朋友圈分享面板人工复验（代码已上传开发版 `6.1.2-8209570-sharecard-ios`）。

## Last Completed
- 2026-06-11: 文档重组与工作流优化。`docs/` 19 个文件重组成 5 个功能目录（specs/reports/archive/tools/session-logs），`current.md` 从 104 行精简为 ~40 行，清理 `docs/superpowers/` 空目录。
- 2026-06-05 Codex: 完成增长飞轮优化方案 v1.0（P0–P5），基于 104 天 we 分析数据 + CloudBase 审计。
- 2026-06-04 Codex: 完成朋友圈/群聊分享方案优化。`sharePageMixin` 提取 ranking/analytics 重复逻辑；`sharePoster` 新增 1080×1080 海报生成/预览/保存；`shareCard` 支持 aspectRatio 多比例和普通排名纯色背景；`shareTimelineCard` 新增极简纯文字缩略图；`shareCardPreheat` 支持多类型预热。
- 2026-06-02 Codex: Canvas 分享卡片视觉、统计派生与真实小程序码链路自动化验收通过。`generateShareCode` 已部署（`Active/Available`）。iPhone 排名页朋友圈菜单兼容修复并上传开发版。详细验证记录见 `docs/tasks/session-logs/2026-06-02-share-card-verification.md`。
- 2026-06-01 Codex: 收口动态分享 UI 状态与旧头像诊断。3 个 share 入口接入 `dynamicSharePreparing/Ready/Error/UnavailableReason` 状态机。新增 `avatarPolicy` 拒绝临时路径写入长期数据。部署 `createTournament`/`joinTournament`/`saveUserProfile`。
- 2026-06-01 Codex: 补齐头像与共享卡片动态消息诊断。`avatarDisplay` 增加 fileID 请求列表和逐项错误日志。lobby 动态分享新增完整状态机（校验 API/模板 → showShareMenu → manageActivityId → updateShareMenu），失败保留普通分享。
- 2026-06-01 Codex: 修复朋友圈战绩卡片首轮分享与排名准确性。Canvas 移到条件渲染外、`onReady` 预热、等待 selector query。排名 row 补真实 `rank`。`getBgPath` 仅允许 1/2/3 名使用奖牌背景。
- 2026-05-29 Codex: Canvas 2D 分享卡片核心稳定化。云存储背景图下载、本地路径缓存、网络头像转换、DPR 取整。新增 `npm run preview:share-card` 本地预览。
- 2026-05-28 Codex: 部署 `manageActivityId`/`joinTournament` 云函数。
- 2026-05-27 Codex: 修复分享入口 profile 保存和分享预热。`share-entry` 加入后保存云资料；`schedule`/`analytics` 补 `showShareMenuBestEffort` 预热。上传 `6.1.2-6e34faf`。
- 2026-05-27 Codex: 头像显示二次修复补丁。`joinTournament` 新增 `profile_update` action contract。`avatarDisplay` 拆分 image error 与 temp URL 解析失败。持久 cache 合并 storage 与内存。
- 2026-05-27 Claude: 头像显示二次修复（share-avatar-fix-plan 全部实施）。P1–P5 头像链路修复，全局共享 cache，storage 持久化。
- 2026-05-27 Codex: 共享卡片动态消息 + 头像显示后续修复。`showShareMenu` best-effort 预热；全局共享 `avatarCache`；`saveCloudProfile` 成功后写本地。
- 2026-05-22 Codex: 共享卡片动态消息二次修复。预热从 promise 前移到 `setTournament` 后；3 个 share 按钮 `bindtouchstart` 兜底；`onHide` 不清理菜单。云端 `share-activity` helper 增加诊断字段。
- 2026-05-20 Claude: miniprogram-ci 接入。`npm run mp:preview`/`mp:upload`，版本号自动生成。
- 2026-05-14 Codex: lobby 流程入口收口。移除下方重复 action layer，状态面板成为唯一入口。
- 2026-05-14 Codex: 头像显示链路彻底修复。`avatarDisplay` 统一处理 `getTempFileURL`、批量限制、TTL、冷却和缓存清理。
- 2026-05-14 Codex: CloudBase CLI 自动部署工作流。`deploy-cloudfunctions.sh`、`deploy-changed-cloudfunctions.sh`、post-commit hook。
- 2026-05-14 Codex: 固定 `6人转`/`7人转`/`8人转` 推荐档等场化与 `7p-1c@21` 模板补齐。scheduler full audit `warnings=0/failures=0`。
- 2026-05-14 Codex: `6人转`/`7人转` 默认场次最小上调。`rotation_6: 9 场`、`rotation_7: 14 场`。同步云函数模板和前端 mode 配置。
- 2026-05-13 Codex: 本地 we 分析拉取脚本 `scripts/fetch-we-analysis.js`。10 种 datacube API、token 缓存、JSON/CSV 输出。
- 2026-05-07 Codex: `6人转`/`7人转`/`8人转` 固定人数转入口及名称同步收口。`presetKey` 持久化 + 显示标签。
- 2026-05-04 Codex: 全局 UI 视觉优先级修复。`core/uiPreferences` motion/density class 接入 11 个页面。
- 2026-05-02 Codex: 稳定性优先级修复。score lock 释放、storage 容错、cloud call 重试、快照上限 100、分页头像同步。
- 2026-04-16 Codex: 后端审计全部完成。`scoreLock`/`submitScore` 状态语义收口、结构化错误返回、事务幂等、`player.id` contract 统一、共享 `client_request_logs`。

> 更早的记录已归档到 git history，此处仅保留最近约 25 条摘要。

## What Changed (uncommitted)
- 本轮文档重组：`docs/` 目录重构（移动 18 个文件），`current.md` 精简，`CLAUDE.md`/`AGENTS.md`/`learnings.md` 路径更新，`scripts/generate-scheduler-full-audit.js` 输出路径更新。
- 前序未提交：`CLAUDE.md`（6 行新增）、`docs/notes/learnings.md`（1 行新增）。

## Next Steps
- iPhone 真机复验朋友圈分享菜单（代码已修，开发版 `6.1.2-8209570-sharecard-ios` 已上传，待人工确认）
- 增长飞轮 P0：首次体验优化（share-entry 重设计、新用户引导、demo 赛事）— 方案见 `docs/specs/growth-flywheel-optimization.md`
- 增长优化待办：添加到我的小程序引导、订阅消息（需先确认 MP 模板可用性）

## Blockers
- Windows DevTools / MCP 自动化端口 `39420`（`xray.exe` 占用 `9420`）。
- iPhone 朋友圈分享面板验证需手机端实际操作，MCP 无法覆盖。

## Uploaded Versions
- 2026-06-02: `6.1.2-8209570-sharecard-ios` — iPhone 朋友圈菜单兼容修复
- 2026-06-02: `6.1.2-8209570-sharecard` — 朋友圈排名卡片 + 真实小程序码 + 头像对齐 + 分享预热
- 2026-05-27: `6.1.2-6e34faf` — 动态分享稳定性修复；头像资料同步；分享链接资料云端保存

## Verification Logs
> 已完成工作的详细验证记录见 `docs/tasks/session-logs/`。
> 最新: `docs/tasks/session-logs/2026-06-02-share-card-verification.md`
