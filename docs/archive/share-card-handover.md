# 分享卡片功能 — 交接文档

## 概述

为小程序「羽球轮转助手」实现 Canvas 2D 动态分享卡片，用于：
- **分享到朋友圈**（`onShareTimeline`）

卡片采用 **固定背景图 + Canvas 叠加动态文字/头像/小程序码** 的方案。背景图由 ChatGPT 设计生成（金/银/铜三色对应第 1/2/3 名），Canvas 只负责在上面叠加动态数据。

当前仅前三名生成奖牌卡片。第 4 名及以后会降级为纯文字朋友圈分享，避免错误显示铜牌背景自带的「第 3 名」。

---

## 当前进度

### 已完成

| 模块 | 文件 | 状态 |
|------|------|------|
| Canvas 叠加层引擎 | `miniprogram/core/shareCard.js` | 基本完成，坐标和字号规则已对齐 |
| analytics 页朋友圈分享 | `miniprogram/pages/analytics/index.js:+onShareTimeline` | 已接入 |
| analytics 页隐藏 canvas | `miniprogram/pages/analytics/index.wxml:+canvas` | 已添加 |
| ranking 页朋友圈分享 | `miniprogram/pages/ranking/index.js:+onShareTimeline` | 已接入 |
| ranking 页隐藏 canvas | `miniprogram/pages/ranking/index.wxml:+canvas` | 已添加 |
| 背景图上传云存储 | 3 张 PNG 已上传 | 完成 |
| 背景图本地副本 | `miniprogram/assets/share-bg-{gold,silver,bronze}.png` | 本地保留用于预览 |
| Node.js 本地预览 | `scripts/preview-share-card.js` | 可重复生成 PNG 预览到 `tmp/share-card-preview/` |
| 图片加载稳定化 | `miniprogram/core/shareCard.js` | 已处理 cloud 背景下载、网络头像 `wx.getImageInfo`、本地路径缓存 |
| Canvas 节点稳定化 | `analytics` / `ranking` 页面 | 已在 `onReady` 预热，分享时等待异步 selector query 完成 |
| 分享图后台预导出 | `miniprogram/core/shareCardPreheat.js` | 已在 Canvas 和赛事数据就绪后 best-effort 生成并缓存 `imageUrl`，分享时复用 |
| 卡片统计派生 | `miniprogram/core/shareCardStats.js` | 已统一计算胜率、连胜和场均得分，零数据也明确显示 `0` |
| ranking 卡片名次 | `miniprogram/pages/ranking/index.js` | 已为排序后的 ranking row 写入真实 `rank` |
| 非前三名降级 | `miniprogram/core/shareCard.js` | 已拒绝非奖牌背景，页面自动降级为纯文字分享 |
| 头像视觉修复 | `miniprogram/core/shareCard.js` | 已对齐背景头像环、居中裁剪矩形头像，并为无头像/加载失败绘制首字占位 |
| 真实小程序码云函数 | `cloudfunctions/generateShareCode/index.js` | 已部署，规范源码为 `Active/Available`，真实调用返回 `SHARE_CODE_READY` |
| 小程序码客户端接入 | `miniprogram/core/shareCode.js`、`analytics` / `ranking` | 已按赛事和环境缓存 `fileID`，前三名卡片会传入 `qrCodeUrl` |
| iPhone 朋友圈菜单兼容 | `miniprogram/core/shareActivity.js`、`analytics` / `ranking` | `wx.showShareMenu.menus` 仅在 Android 透传；iOS 依赖页面 share handler 暴露菜单 |
| 分享卡片单测 | `tests/share-card.test.js` | 已覆盖格式化、图片路径解析、node-canvas 绘制 |

### 未完成 / 需要改进

| 问题 | 优先级 |
|------|--------|
| 手机扫码：手机微信已扫描真实码并进入目标赛事 `6人转`，设备级验收完成 | 已完成 |
| 朋友圈客户端：已修复 iPhone 排名页不可分享兼容问题并上传 `6.1.2-8209570-sharecard-ios`；仍需手机端重新扫码复验 | P1 |
| 非前三名卡片：目前降级为纯文字；如需完整覆盖，需要新增通用排名背景 | P2 |
| 背景图分辨率较大（1254×1254），node-canvas 预览正常，仍需真机性能确认 | P2 |
| 压力测试图还有视觉细节可调（如长赛事名字号是否够小） | P3 |

---

## 关键文件清单

```
miniprogram/core/shareCard.js          ← 核心引擎，Canvas 叠加层绘制
miniprogram/core/shareCode.js          ← 小程序码 fileID 请求、并发合并和内存缓存
miniprogram/core/shareCardPreheat.js   ← 分享图后台预导出、并发合并和页面级缓存
miniprogram/core/shareCardStats.js     ← 胜率、连胜、场均得分统一派生
miniprogram/core/shareActivity.js      ← 分享菜单 best-effort 预热与 Android-only menus 平台过滤
miniprogram/pages/analytics/index.js   ← 赛事复盘页，加了 onShareTimeline
miniprogram/pages/analytics/index.wxml ← 加了隐藏 <canvas type="2d" id="shareCardCanvas">
miniprogram/pages/ranking/index.js     ← 排名页，加了 onShareTimeline + onShareAppMessage
miniprogram/pages/ranking/index.wxml   ← 加了隐藏 canvas
miniprogram/assets/share-bg-gold.png   ← 第1名背景图（本地预览用）
miniprogram/assets/share-bg-silver.png ← 第2名背景图
miniprogram/assets/share-bg-bronze.png ← 第3名背景图
scripts/preview-share-card.js          ← 本地预览脚本
tests/share-card.test.js               ← 分享卡片核心测试
tests/share-code.test.js               ← 小程序码客户端缓存测试
tests/share-card-preheat.test.js       ← 分享图后台预导出缓存测试
tests/share-card-stats.test.js         ← 分享卡片统计派生测试
tests/share-activity.timeline-menu.test.js ← iOS / Android 分享菜单参数兼容测试
tests/generateShareCode.index.test.js  ← 小程序码云函数契约测试
tmp/share-card-preview/*.png           ← 本地预览生成图（git ignored）
cloudfunctions/generateShareCode/      ← wxacode.getUnlimited + 云存储上传
```

云存储路径：
```
cloud://cloud1-1ghmqjyt6428702b.636c-cloud1-1ghmqjyt6428702b-1403446496/share-cards/share-bg-gold.png
cloud://cloud1-1ghmqjyt6428702b.636c-cloud1-1ghmqjyt6428702b-1403446496/share-cards/share-bg-silver.png
cloud://cloud1-1ghmqjyt6428702b.636c-cloud1-1ghmqjyt6428702b-1403446496/share-cards/share-bg-bronze.png
```

---

## shareCard.js 架构

### 设计坐标系

所有绘制基于 **500×500 逻辑像素**。运行时按 `dpr` 放大实际 Canvas 尺寸，通过 `ctx.scale(dpr, dpr)` 保持坐标不变。

### 绘制流程

```
1. 加载背景图（按 rank 选 gold/silver/bronze）
2. drawImage 铺满 500×500
3. 先绘制首字占位头像，再圆形裁剪 + 居中 cover 绘制真实头像
4. fillText 昵称 + "的比赛战绩"
5. fillText 赛事名（按长度自适应字号）
6. fillText 模式标签（在胶囊中心）
7. fillText 战绩三列大数字（wins/losses/winRate）
8. fillText 三列数据标签
9. fillText 小标签（totalMatches/maxWinStreak/avgScore）
10. 圆形裁剪小程序码（如有；前三名页面会传真实 qrCodeUrl）
11. wx.canvasToTempFilePath 导出
```

### 关键坐标表

| 元素 | x | y | 字号 | 颜色 | 对齐 |
|------|---|---|------|------|------|
| 头像 | 19 | 14 | - | - | 圆形裁剪, 41×41 |
| 昵称 | 78 | 37 | 20 | #1D2420 | left/middle, 700 |
| 的比赛战绩 | 昵称右侧+10 | 37 | 14 | #6F7B74 | left/middle |
| 赛事名 | 250 | 75 | 24-32 | #00462E | center/middle, 800 |
| 模式 | 250 | 115 | 12-14 | #0C5A3B | center/middle, 500 |
| wins | 122 | 266 | 36 | #00462E | center/middle, 800 |
| losses | 250 | 266 | 36 | #00462E | center/middle, 800 |
| winRate | 378 | 266 | 30-34 | #00462E | center/middle, 800 |
| 标签(胜场等) | 同列x | 295 | 15 | #587367 | center/middle |
| 小标签 | 同列x | 321 | 11-12 | #0C5A3B | center/middle |
| 小程序码 | 206 | 356 | - | - | 圆形裁剪, 88×88 |

### 自适应规则

**赛事名字号**（`eventTitleSize`）：
- ≤6 中文字符 → 32px
- 7~10 → 30px
- 11~14 → 26px
- 15+ → 24px
- 最大宽度 340px，仍超宽则截断加 `…`

**胜率字号**：
- `80%`（≤3字符）→ 34px
- `100%`（4字符）→ 32px
- `87.5%`（含小数点）→ 30px

**昵称**：最大宽度 92px，超出截断加 `…`

**模式**：最大宽度 104px，14→11px 自适应

**小标签**：12→10px 自适应，各自有最大宽度限制

**数据格式化**：
- `wins/losses/totalMatches/maxWinStreak` 超过 99 显示 `99+`
- `avgScore` 保留 1 位小数
- `totalMatches` 默认 = wins + losses

### 重要约束

- **不绘制品牌名**：背景图自带「羽球轮转助手」和「扫码查看完整战绩」，代码不再重复绘制
- **不绘制排名徽章**：背景图自带「第 1/2/3 名」徽章
- **无头像或加载失败**：绘制深绿色首字占位，避免留白像资源加载失败
- **全局 `textBaseline='middle'`**

---

## 页面集成方式

两个页面（analytics / ranking）的集成模式相同：

```js
// onLoad 中
this.openid = (getApp().globalData.openid || '');
this._ensureShareMenu();  // wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })

// onReady 中
this._shareCardReady = true;
this._preheatShareCardWhenReady(this.data.tournament);

// onShareTimeline 中
var promise = ctx._getPreparedShareCard(tournament).then(function (imageUrl) {
  return { title: ..., query: ..., imageUrl: imageUrl };
}).catch(function () {
  return { title: ..., query: ... }; // 降级：纯文字
});
return { title: ..., query: ..., promise: promise };
```

`applyTournament()` 和 `onReady()` 都会触发 `_preheatShareCardWhenReady()`。`shareCardPreheat` 按赛事 ID 和可见卡片数据构造缓存 key，合并并发生成请求并复用成功导出的本地 `imageUrl`；卡片数据变化时自动重建，页面卸载时清理缓存。

`_buildShareCard` 从页面数据中提取当前用户的战绩信息，组装成 `cardData` 对象；前三名并行等待 `_getShareCardCanvas()` 和 `shareCode.getTournamentShareCode()`，把返回的云存储 `fileID` 作为 `qrCodeUrl` 传入 `shareCard.drawShareCard(canvas, cardData)`。小程序码生成失败会降级为无二维码卡片，不阻断朋友圈分享。

---

## 数据流

```
tournament 文档
  → analyticsLogic.computeAnalytics(tournament) / rankingCore.buildRankingWithTrend(tournament)
    → playerStats[] / rankings[]
      → 按 openid 匹配当前用户
        → shareCardStats 派生 { winRate, totalMatches, maxWinStreak, avgScore }
          → 提取 { userName, wins, losses, rank, playerId, ... }
          → 从 tournament.players 找头像
            → 组装 cardData
              → shareCard.drawShareCard(canvas, cardData)
                → tempFilePath → onShareTimeline imageUrl

generateShareCode(tournamentId, envVersion)
  → 校验赛事、scene 和调用者身份
    → cloud.openapi.wxacode.getUnlimited()
      → cloud.uploadFile(share-codes/<envVersion>/<sha1>.png)
        → fileID → cardData.qrCodeUrl
```

---

## 预览方法

在项目根目录运行 Node.js 脚本生成预览 PNG：

```bash
npm run preview:share-card
```

生成的预览图：
- `tmp/share-card-preview/preview-rank1.png` ~ `preview-rank3.png` — 正常短文本
- `tmp/share-card-preview/preview-stress1.png` ~ `preview-stress3.png` — 极限长文本

本轮验证（2026-06-02）：
- `npm run preview:share-card` 通过，6 张 PNG 均成功生成
- `preview-rank2` 使用横向头像、`preview-rank3` 使用纵向头像，已人工确认 cover 居中裁剪和头像环对齐
- 分享、小程序码、统计派生和后台预导出聚焦回归 => 42 pass / 0 fail
- `node --check` 本轮 JS 文件通过
- `git diff --check` 通过
- `npm run check` 通过
- `npm run lint` => 0 errors / 53 existing warnings
- 全量 `node --test tests/*.test.js` => 1054 pass / 0 fail
- DevTools 真实 `ranking` / `analytics` 页面本地运行态已验证：榜首 `4胜2负 / 66.7% / 共6场 / 连胜4场 / 场均得分19.7`；`ranking` 后台预导出约 4 秒、缓存后 `onShareTimeline()` 同步返回约 6ms，`analytics` 分别约 2 秒和 7ms
- `generateShareCode` 已部署：规范源码 probe 返回 `SHARE_CODE_READY`，函数为 `Active/Available`、`InstallDependency=TRUE`；真实小程序码保存为 `tmp/weapp-preview/real-share-code-develop.png`
- 真实带码卡片已导出并人工检查：`tmp/weapp-preview/ranking-top1-runtime-real-qr.png`、`tmp/weapp-preview/analytics-top1-runtime-real-qr.png`
- 带码链路耗时：`ranking` 首次后台预热约 5 秒、缓存后 `onShareTimeline()` promise 约 10ms；`analytics` 分别约 2 秒和 10ms
- 纯文字降级已验证：真实 `ranking` 当前登录用户 `rank6` 与显式 `rank4` 均不返回 `imageUrl`
- scene 落地已验证：`share-entry?scene=3e45192f6a04b9fa0011d5e747610595` 正确加载目标赛事
- 独立复验已完成：再次生成并逐图检查 6 张 node-canvas 预览；重新 probe 真实云函数并复验 scene 落地；新一轮页面级调用中，`ranking` / `analytics` 榜首带码预热分别为 `1609ms` / `1287ms`，缓存后 `onShareTimeline()` promise 均即时返回。新导出的 `tmp/weapp-preview/ranking-top1-runtime-real-qr-recheck.png`、`tmp/weapp-preview/analytics-top1-runtime-real-qr-recheck.png` 已人工检查通过。
- 手机扫码已验证：手机微信扫描真实码后成功进入目标赛事 `6人转`，正确显示已结束、已加入、6 人、已完成 9/9 场
- 小程序开发版已上传：`6.1.2-8209570-sharecard`，备注「朋友圈排名卡片新增真实小程序码、头像对齐与分享预热优化」，完整包大小 `612504` 字节
- 首次手机测试在扫码落地页提示「当前页面不可分享」符合 `share-entry` 未声明 `onShareTimeline()` 的页面定义；但进入 `pages/ranking/index` 后 iPhone 仍复现同一提示，已继续修复。
- 官方 `wx.showShareMenu` 文档说明 `menus` 参数目前仅支持 Android。`shareActivity.showShareMenuBestEffort()` 已改为只在 Android 透传显式 `menus`；iOS / DevTools 依赖页面 `onShareAppMessage()` / `onShareTimeline()` handler。新增 `tests/share-activity.timeline-menu.test.js`。
- DevTools 重编译后运行态已确认排名页 `_ensureShareMenu()` 在 `platform=devtools` 时只传 `{ withShareTicket: true, success, fail }`，且两个页面 share handler 均存在。
- 再次运行 `npm run preview:share-card` 生成 6 张 PNG 并抽查通过；iPhone 兼容修复聚焦分享链路 `44 pass / 0 fail`，串行全量 `node --test --test-concurrency=1 tests/*.test.js` => `1056 pass / 0 fail`。
- iPhone 兼容开发版已上传：`6.1.2-8209570-sharecard-ios`，备注「朋友圈排名卡片兼容 iPhone 分享菜单；保留真实小程序码、头像对齐与分享预热」，完整包大小 `612766` 字节。
- 待验证：退出手机端当前小程序，重新扫描真实码，在排名页手动确认朋友圈分享面板展示效果。

运行时注意：
- 官方 Page 文档说明 `onShareTimeline.promise` 从基础库 `3.12.0` 起支持，3 秒内未 resolve 会使用同步返回的默认参数。
- 当前 `project.config.json` 开发基础库为 `3.14.2`。页面会在数据和 Canvas 就绪后后台预导出图片，使常规分享直接复用缓存；真实二维码路径下缓存复用与非前三名纯文字降级均已验证。

### generateShareCode 部署注意

- `cloudfunctions/generateShareCode/config.json` 已声明 `wxacode.getUnlimited` OpenAPI 权限。
- 首次注册权限不能只使用 `tcb fn deploy`。官方说明 OpenAPI 需在 `config.json` 声明，并通过开发者工具重新上传云函数后更新权限。
- 本机 DevTools CLI 打包嵌套 `lib/` 时会报 `EISDIR`。本轮使用项目外临时平铺目录完成一次权限注册，再用 `miniprogram-ci.cloud.uploadFunction({ remoteNpmInstall: true })` 上传仓库中的规范源码并恢复依赖；临时目录已删除。
- 后续规范源码上传需保留 `remoteNpmInstall: true`，并在上传后确认 `Active/Available`、`InstallDependency=TRUE` 和真实 probe 返回 `SHARE_CODE_READY`。

---

## 相关文档

- `docs/specs/growth-flywheel-optimization.md` — 当前增长飞轮方案与 backlog
- `data/we-analysis/search-optimization-plan-verified.md` — 搜索优化方案
- `miniprogram/core/shareCard.js` — 源码注释

---

## 给接手者的提示词

如果你用 CodeX 或 ChatGPT 继续做，把以下内容发过去：

```
我正在做一个微信小程序的 Canvas 2D 分享卡片功能。请帮我审查和改进代码。

项目背景：
- 小程序叫"羽球轮转助手"，羽毛球轮转赛管理工具
- 功能：用户在赛事复盘页/排名页点"分享到朋友圈"，生成一张带个人战绩的卡片图
- 方案：3 张固定背景图（金/银/铜对应第1/2/3名，放在云存储）+ Canvas 叠加动态文字/头像/小程序码
- 设计坐标系：500×500 逻辑像素，实际 Canvas 按 dpr 缩放

当前代码文件是 miniprogram/core/shareCard.js，请先通读它。

主要待解决的问题：
1. 小程序内实际运行测试（目前 node-canvas 预览已通过）
2. 小程序码集成：云函数、qrCodeUrl、真实写入、绘制、scene 落地和手机扫码均已完成验收；仅剩微信客户端朋友圈分享面板展示确认
3. 预览图在 tmp/share-card-preview/*.png，可运行 npm run preview:share-card 重建

约束：
- 页面集成已做 Canvas Promise 等待和 ranking rank 修复；后续改动需保留该行为
- 背景图自带排名徽章和底部品牌名，代码不要再画
- 第 4 名及以后不要复用铜牌背景，当前约定是降级为纯文字分享
- 所有文字用 textBaseline='middle'
- 长文本必须做自适应截断，不能溢出
- miniprogram/assets/share-bg-*.png 只用于本地预览，project.config.json 已排除打包

请先看代码和预览图，然后：
1. 列出你发现的问题
2. 逐个修复
3. 每改完一轮，用 node-canvas 生成新的 preview 图让我检查
```
