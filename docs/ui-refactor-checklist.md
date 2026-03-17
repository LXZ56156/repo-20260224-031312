# UI 重构自检清单

方向：轻专业赛事中控台风
执行日期：2026-03-17
测试结果：447/447 ✅

## 设计系统 (Phase 1)

| # | 检查项 | 状态 |
|---|--------|------|
| 1 | app.wxss 色彩 token 体系完整 (brand/neutral/info/accent/status) | ✅ |
| 2 | 文字层级 6 档 (display/title-page/title-section/metric/body/caption) | ✅ |
| 3 | 间距工具类 (gap-xs~xl, mt-xs~xl) | ✅ |
| 4 | 按钮体系 (primary/secondary/subtle/ghost/text/danger + 尺寸) | ✅ |
| 5 | sync-banner 全局化 + hidden 模式 + 平滑过渡 | ✅ |
| 6 | state-empty / state-error 统一结构 | ✅ |
| 7 | skeleton 基类全局化 | ✅ |
| 8 | action-rail / bottom-tray 组件 | ✅ |
| 9 | matchPrimaryNav 全局化 (Section X) | ✅ |
| 10 | 旧 CSS 变量别名兼容 | ✅ |

## Layout Shift 修复 (Phase 4)

| # | 检查项 | 状态 |
|---|--------|------|
| 11 | sync-banner: wx:if → hidden (match/lobby/schedule/ranking/home/analytics/share-entry/settings/create) | ✅ |
| 12 | .sync-banner[hidden] 全局折叠规则 (max-height:0, opacity:0, transition) | ✅ |
| 13 | home 页 sync-banner 去重，仅保留间距覆盖 | ✅ |

## 页面覆盖 (Phase 2+3)

| # | 页面 | WXML | WXSS | 备注 |
|---|------|------|------|------|
| 14 | match | ✅ | ✅ | Hero 紧凑化, 比分舞台重构, 批量录分进度条 |
| 15 | lobby | ✅ | ✅ | Hero 层级分明, admin 折叠面板, share-bar 位置修正 |
| 16 | share-entry | ✅ | ✅ | 决策型 action-rail, 状态一致 |
| 17 | analytics | ✅ | ✅ | 赛后战报 Hero, 双列 metric-card, 卡片层级分化 |
| 18 | home | ✅ | ✅ | 工作台 Hero, 紧凑列表, 筛选 chip |
| 19 | schedule | ✅ | ✅ | Round card 左侧强调条, match card focus 态 |
| 20 | ranking | ✅ | ✅ | Top 3 渐变背景, trend pill, 积分榜感 |
| 21 | launch | ✅ | ✅ | 赛制选择面板, 左侧色彩暗示条, 默认推荐强调 |
| 22 | create | ✅ | ✅ | Wizard 式表单, 预设 chip, sticky bottom-tray |
| 23 | mine | ✅ | ✅ | Dashboard Hero, 2×2 stats grid, service grid |
| 24 | profile | ✅ | ✅ | 居中 avatar, gender segment, sticky save |
| 25 | settings | ✅ | ✅ | 表单水平布局, 错误态统一化 |
| 26 | preferences | ✅ | ✅ | Neutral chip 选择器, switch brand 色统一 |
| 27 | feedback | ✅ | ✅ | 对话式反馈, 新 token |

## 一致性 (Phase 4+5)

| # | 检查项 | 状态 |
|---|--------|------|
| 28 | 所有页面 WXSS 无硬编码旧 brand 色 (#16a34a/#1EA65E) | ✅ |
| 29 | switch 组件 color 统一为 #18B368 | ✅ |
| 30 | pcolor-0 使用 var(--brand-500) | ✅ |
| 31 | matchPrimaryNav.wxss 源文件 token 化 | ✅ |
| 32 | 测试全量通过 447/447 | ✅ |

## 变更统计

- 修改文件：29 个
- 新增行：~2947
- 删除行：~2381
- 净变化：+566 行（主要来自 app.wxss 设计系统扩展和 sync-banner[hidden] 全局规则）
