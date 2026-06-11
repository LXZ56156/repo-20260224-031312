# 朋友圈/群聊分享方案优化设计

**日期**: 2026-06-04
**状态**: 已确认

## 问题根因

1. **onShareTimeline 强行复用完整战绩卡**: `shareCard.drawShareCard` 生成 500×500 图片含头像/战绩三列/小程序码，在朋友圈 ~80×80 px 缩略图中完全无法辨认
2. **仅支持前三名**: `shareCard.getBgPath(rank ≥ 4)` 返回空字符串，`drawShareCard` 直接 throw `'share card only supports top three ranks'`
3. **onShareAppMessage 无 imageUrl**: ranking/analytics 的聊天分享只返回 `{ title, path }`，卡片显示灰色默认图
4. **无海报生成能力**: 用户无法保存战绩图片到相册或分享到其他平台
5. **代码重复**: ranking 和 analytics 的 `_buildShareCardData`/`_buildShareCard`/`_getShareCardCanvas`/`_getPreparedShareCard`/`_preheatShareCardWhenReady` 几乎完全重复
6. **比例非最优**: 500×500 (1:1) 不适合微信聊天卡片推荐比例

## 改造方案

### 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `miniprogram/core/shareCard.js` | 修改 | 支持 aspectRatio 参数；rank ≥ 4 纯色背景不抛错 |
| `miniprogram/core/shareTimelineCard.js` | 新增 | 极简纯文字缩略图 (onShareTimeline 用) |
| `miniprogram/core/sharePoster.js` | 新增 | 1080×1080 海报生成 + 预览/保存/复制文案 |
| `miniprogram/core/sharePageMixin.js` | 新增 | 提取 ranking/analytics 重复分享逻辑 |
| `miniprogram/core/shareCardPreheat.js` | 修改 | 支持多类型预热 |
| `miniprogram/pages/ranking/index.js` | 修改 | 使用 mixin；新增海报按钮；改造分享 |
| `miniprogram/pages/ranking/index.wxml` | 修改 | 新增海报按钮 + 预览弹窗 |
| `miniprogram/pages/analytics/index.js` | 修改 | 同上 |
| `miniprogram/pages/analytics/index.wxml` | 修改 | 同上 |
| `tests/share-card.test.js` | 修改 | aspectRatio/normal rank 测试 |
| `tests/share-timeline-card.test.js` | 新增 | 极简缩略图测试 |
| `tests/share-poster.test.js` | 新增 | 海报生成/降级测试 |

### 模块详细设计

#### shareCard.js
- `drawShareCard(canvas, data, options)`: 新增 `options.aspectRatio` 支持 `'1:1'`(500×500) / `'5:4'`(500×400)
- `getBgPath(rank)`: rank ≥ 4 返回 `NORMAL_BG_SENTINEL` 常量；移除 throw
- 无背景图时用品牌色 `#0C5A3B` 填充

#### shareTimelineCard.js
- `drawTimelineCard(canvas, data)`: 纯文字排版，大号排名 + 赛事名 + W/L 战绩
- 尺寸 500×400，深色背景 + 白色文字
- 复用 `shareCardStats.buildShareCardStats`

#### sharePoster.js
- `generatePoster(canvas, data, options)`: 基于 shareCard 布局放大到 1080×1080
- `previewPoster(imageUrl)`: 弹窗预览
- `savePoster(imageUrl)`: wx.saveImageToPhotosAlbum
- `copyShareText(data)`: 复制分享文案
- 复用 shareCard.drawShareCard + shareCode.getTournamentShareCode

#### sharePageMixin.js
- 提取 `_buildShareCardData`/`_buildShareCard`/`_getShareCardCanvas` 等
- 提供标准 `onShareAppMessage`/`onShareTimeline`/`onGeneratePoster`

#### 降级逻辑
- onShareTimeline.promise: 图片失败 → 纯文字 title
- onShareAppMessage: imageUrl 失败 → 不带图
- 海报生成: Canvas 不可用 → toast 提示

### 数据流

```
onShareTimeline → shareTimelineCard.drawTimelineCard() [纯文字] → resolve/reject → 降级
onShareAppMessage → shareCard.drawShareCard(aspectRatio='5:4') [横向] → resolve/reject → 降级
onGeneratePoster → shareCode + sharePoster.generatePoster() [1080] → preview → save → 降级 toast
```
