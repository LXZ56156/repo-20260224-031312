# 分享卡片验证日志 — 2026-06-02

> 从 `docs/tasks/current.md` 提取的详细验证输出。
> 对应 work item: Canvas 分享卡片视觉、统计派生与真实小程序码链路。

## What Changed (本轮文件)

`miniprogram/core/shareCard.js`、`miniprogram/core/shareCode.js`、`miniprogram/core/shareCardPreheat.js`、`miniprogram/core/shareCardStats.js`、`miniprogram/core/shareActivity.js`、`cloudfunctions/generateShareCode/`、`cloudbaserc.json`、`scripts/preview-share-card.js`、`tests/share-card.test.js`、`tests/share-code.test.js`、`tests/share-card-preheat.test.js`、`tests/share-card-stats.test.js`、`tests/share-activity.timeline-menu.test.js`、`tests/generateShareCode.index.test.js`、`tests/deploy-changed-cloudfunctions.test.js`、`docs/tasks/current.md`、`docs/tasks/share-card-handover.md`；并继续复用前序 `analytics` / `ranking` 页面接入改动。

本轮修复：头像环坐标对齐、矩形头像居中 cover 裁剪、空头像首字占位、长模式和小标签安全宽度；零数据 pill 不再留白；`shareCardStats` 统一派生 `winRate / maxWinStreak / avgScore`，避免真实 ranking row 缺少 `winRate` 时 card data 固化为错误 `0%`。本地预览已增加横向/纵向头像和零数据样本。新增 `generateShareCode` 云函数调用 `wxacode.getUnlimited` 并上传确定性云存储路径，客户端按赛事和环境缓存 `fileID`，前三名卡片接入真实 `qrCodeUrl`，第 4 名以后仍不请求码并降级纯文字。新增 `shareCardPreheat`，在 Canvas 和赛事数据就绪后 best-effort 预导出并缓存本地 `imageUrl`，让 `onShareTimeline.promise` 常规路径直接复用结果。真机 iPhone 复现排名页不可分享到朋友圈后，`shareActivity.showShareMenuBestEffort()` 改为只在 Android 透传 `menus: ['shareAppMessage', 'shareTimeline']`，iOS 和 DevTools 依赖页面声明的 `onShareAppMessage()` / `onShareTimeline()` 暴露菜单。

注意：工作树在本轮开始前已有分享相关未提交改动与 3 张 `miniprogram/assets/share-bg-*.png` 背景图；本轮未回退这些前序改动。

## 已上传版本

- 2026-06-02: `6.1.2-8209570-sharecard-ios` — 备注「朋友圈排名卡片兼容 iPhone 分享菜单；保留真实小程序码、头像对齐与分享预热」
- 2026-06-02: `6.1.2-8209570-sharecard` — 备注「朋友圈排名卡片新增真实小程序码、头像对齐与分享预热优化」
- 2026-05-27: `6.1.2-6e34faf` — 备注「动态分享稳定性修复；头像资料同步与缓存刷新修复；分享链接加入后资料云端保存；赛程/复盘页分享兼容性增强」
- 2026-05-27: `6.1.2-7867b19` — 备注「共享卡片动态消息新增 showShareMenu 预热修复不生效问题；头像全局共享缓存减少首字闪烁；lobby 资料缓存提前写入修复」

## Verified Subset Output

### 2026-06-02 分享卡片视觉、统计派生与真实小程序码验收

`npm run preview:share-card` => 6 张 PNG 生成并人工检查通过；真实 DevTools `ranking` / `analytics` 榜首带码卡片分别导出 `tmp/weapp-preview/ranking-top1-runtime-real-qr.png` 和 `tmp/weapp-preview/analytics-top1-runtime-real-qr.png`，确认 `4胜2负 / 66.7% / 共6场 / 连胜4场 / 场均得分19.7`、头像首字占位、小程序码圆形裁剪和整体布局正常。真实小程序码原图保存为 `tmp/weapp-preview/real-share-code-develop.png`。`ranking` 带码后台预导出约 5 秒，缓存后 `onShareTimeline()` promise 约 10ms；`analytics` 分别约 2 秒和 10ms。真实 `ranking` 当前登录用户 `rank6`、显式 `rank4` 均降级为纯文字分享；`share-entry?scene=3e45192f6a04b9fa0011d5e747610595` 正确加载目标赛事。`generateShareCode` 规范源码部署后 probe 返回 `SHARE_CODE_READY`，函数为 `Active/Available`、`InstallDependency=TRUE`。聚焦 `node --test tests/share-card-stats.test.js tests/share-card-preheat.test.js tests/share-card.test.js tests/share-code.test.js tests/generateShareCode.index.test.js tests/analytics.share-message.test.js tests/ranking.avatar-display.test.js tests/deploy-changed-cloudfunctions.test.js` => `42 pass / 0 fail`；`node --check` 本轮 JS 文件、`git diff --check`、`bash scripts/check-cloud-common.sh`、`npm run check` 通过；`npm run lint` => 0 errors / 53 existing warnings；`node --test tests/*.test.js` => `1054 pass / 0 fail`。剩余手机扫码属于设备级人工确认。

### 2026-06-02 分享卡片独立复验

再次运行 `npm run preview:share-card` 并逐图人工检查 3 张常规样本、3 张压力样本；头像环、矩形头像 cover 裁剪、首字占位、截断、`99+`、`100%` 和零数据均正常。当前 DevTools 会话重新 probe `generateShareCode` 返回同一确定性 `fileID`，重新验证 `share-entry?scene=<tournamentId>` 落地为目标赛事且 `loadError=false`。页面级真实调用重新确认：`ranking` 当前用户 `rank6` 和显式 `rank4` 均在 2ms 内纯文字降级；榜首带码后台预热 `ranking=1609ms`、`analytics=1287ms`，缓存后两个页面的 `onShareTimeline()` promise 均即时返回带 `imageUrl`。本轮新导出的 `tmp/weapp-preview/ranking-top1-runtime-real-qr-recheck.png`、`tmp/weapp-preview/analytics-top1-runtime-real-qr-recheck.png` 已人工检查通过。

### 2026-06-02 手机扫码验收

手机微信扫描 `tmp/weapp-preview/real-share-code-develop.png` 后成功进入 `pages/share-entry/index` 对应的目标赛事 `6人转`，页面正确显示已结束、已加入、6 人、已完成 9/9 场。真实码生成、扫码识别和 scene 落地链路已完成设备级确认；仅剩朋友圈客户端分享面板展示确认。

### 2026-06-02 小程序开发版上传

手机端首次测试在扫码落地页提示「当前页面不可分享」；确认 `share-entry` 本身未声明 `onShareTimeline()`，并在 DevTools 真实点击「查看排名」验证会进入具备 `onShareAppMessage()` / `onShareTimeline()` 的 `pages/ranking/index`。同步 Windows 镜像后执行 `MP_VERSION='6.1.2-8209570-sharecard' MP_DESC='朋友圈排名卡片新增真实小程序码、头像对齐与分享预热优化' npm run mp:upload`，上传成功，完整包大小 `612504` 字节。需重新扫码并进入排名页完成朋友圈客户端面板验收。

### 2026-06-02 iPhone 朋友圈菜单兼容修复

手机进入 `pages/ranking/index` 后仍提示「当前页面不可分享」。官方 `wx.showShareMenu` 文档说明 `menus` 参数目前仅支持 Android；`Page` 文档说明页面声明 `onShareAppMessage()` / `onShareTimeline()` 即可展示对应菜单。新增 `shareActivity.buildShowShareMenuPayload()`，仅 Android 保留显式 `menus`，iOS / DevTools 删除该字段；`ranking` / `analytics` 统一调用该 helper。DevTools 重编译后运行态抓取 `_ensureShareMenu()` 实参为 `{ withShareTicket: true, success, fail }`，且页面两个 share handler 均存在。聚焦分享链路 `44 pass / 0 fail`；再次生成并抽查 6 张 node-canvas 预览正常；`npm run lint` => 0 errors / 53 existing warnings；`npm run check`、`git diff --check` 通过；并发全量仅既有 scheduler 审计长尾抖动，串行 `node --test --test-concurrency=1 tests/*.test.js` => `1056 pass / 0 fail`。已上传开发版 `6.1.2-8209570-sharecard-ios`，完整包大小 `612766` 字节；待手机端复验朋友圈菜单。
