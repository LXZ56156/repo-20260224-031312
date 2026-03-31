# 审计整改实施计划

> 基于审计报告：`docs/audit-report-2026-03-30.md`
> 制定日期：2026-03-30

## Context

项目整体质量 ★★★★☆，距"成熟产品"约 15-20%。本计划覆盖全部 11 项发现（2 个 P1、6 个 P2、3 个 P3），按风险和依赖排序分 8 个阶段执行。

---

## 关键设计决策

### lobby 拆分策略：WXML `<template>` + `<import>`，不引入 `Component({})`
- 项目当前零自定义组件，引入 Component 意味着新的生命周期模型、JSON 配置、测试模式
- lobby 各区块通过 `this` 共享 `fetchTournament()`/`handleWriteError()`/`applyLobbyPatch()` 等方法，template 保持同一 Page 实例，无需事件通信层
- lobby 的区块不在其他页面复用，是"视觉分解"而非"可复用组件"

### nav.js 策略：增加目标页 helper
- 当前 `nav.js` 仅有 URL builder（`buildTournamentUrl`）+ 一个 `goHome()`
- home 页 13 处、mine 页 4 处直接调用 `wx.navigateTo`/`switchTab`
- 增加 `goLobby`/`goSchedule`/`goMatch`/`goRanking`/`goAnalytics`/`goLaunch`/`goProfile`/`goPreferences`/`goFeedback`

### 暗色模式：移除 toggle（不实现）
- 当前 toggle 保存偏好但全无消费者，60+ CSS 变量均为浅色硬编码
- 完整暗色模式是多天级设计工作，不属于整改范围

### mine 页面：仅做内容密度提升
- 将"编辑资料"/"设置"下沉到服务网格，充实 tabBar 页面感
- 不加新功能（历史记录、成就等属独立需求）

---

## Phase 0: 死代码与样式清理 [P2/P3, 零风险]

**目标**：删除残留文件、移除重复 CSS 定义

| # | 动作 | 文件 |
|---|------|------|
| 0a | 删除孤立文件 | `miniprogram/styles/matchPrimaryNav.wxss`（文件头注释已标注"已迁移"，零 import） |
| 0b | 移除 lobby.wxss 中重复的 pcolor-0~5（第 949-954 行），app.wxss 全局已有完全相同定义 | `miniprogram/pages/lobby/index.wxss` |
| 0c | 将 `.ad-breakpoint` / `.ad-badge` 样式从 home.wxss（~423-442 行）和 analytics.wxss（~149-168 行）提取到 app.wxss 统一定义，删除页面级重复 | `miniprogram/app.wxss`, `miniprogram/pages/home/index.wxss`, `miniprogram/pages/analytics/index.wxss` |

**验证**：`node --test tests/*.test.js` 全部通过 + 微信开发者工具视觉检查 lobby/home/analytics 页面无样式异常

---

## Phase 1: tabBar 图标 [P1, 低风险, 需用户审核图标设计]

**目标**：为三个 tab 添加图标，消除最明显的"未完成"信号

| # | 动作 | 文件 |
|---|------|------|
| 1a | 创建 6 个 PNG 图标（81×81px，< 40KB）| `miniprogram/assets/tab-home.png`, `tab-home-active.png`, `tab-launch.png`, `tab-launch-active.png`, `tab-mine.png`, `tab-mine-active.png` |
| 1b | app.json tabBar 每项添加 `iconPath` + `selectedIconPath` | `miniprogram/app.json` |

**图标建议**：首页=房屋/网格，发起=加号圆/羽毛球，我的=人物轮廓。未选中色 `#8A93A0`，选中色 `#1EA65E`。

**验证**：开发者工具预览三个 tab 图标正常显示（常态+选中态）

---

## Phase 2: nav.js 导航集中化 [P2, 低风险]

**目标**：消除 home/mine 页面的裸 `wx.navigateTo`/`switchTab` 调用

| # | 动作 | 文件 |
|---|------|------|
| 2a | nav.js 新增 9 个目标页 helper：`goLobby(tid, query)`, `goSchedule(tid, query)`, `goMatch(tid, query)`, `goRanking(tid)`, `goAnalytics(tid)`, `goLaunch()`, `goProfile()`, `goPreferences()`, `goFeedback()` | `miniprogram/core/nav.js` |
| 2b | home/index.js：13 处裸调用替换为 nav helper | `miniprogram/pages/home/index.js` |
| 2c | mine/index.js：4 处裸调用替换为 nav helper | `miniprogram/pages/mine/index.js` |
| 2d | lobby/lobbyDraftActions.js：~3 处裸调用替换 | `miniprogram/pages/lobby/lobbyDraftActions.js` |
| 2e | 新增 nav helper 单元测试 | `tests/nav.helpers.test.js`（新建） |

**验证**：全量测试通过 + 手动冒烟：从首页进入各赛事页面、从"我的"进入个人资料/设置/反馈

---

## Phase 3: 暗色模式 toggle 移除 [P2, 极低风险, 需用户审核]

**目标**：移除无功能的主题模式 toggle，消除用户预期落差

| # | 动作 | 文件 |
|---|------|------|
| 3a | 删除 WXML 第 44-50 行的"主题模式" form-item | `miniprogram/pages/preferences/index.wxml` |
| 3b | 删除 `setThemeMode` handler、`THEME_MODE_KEY` 常量、data 中 `themeMode` 字段及 onShow 中加载逻辑 | `miniprogram/pages/preferences/index.js` |

**验证**：全量测试通过 + 偏好设置页面不再显示主题模式选项

---

## Phase 4: lobby WXML 模板拆分 [P1, 中等风险]

**目标**：将 425 行单体 WXML 拆分为 6 个命名模板文件

### 拆分方案

| 模板文件 | 原 WXML 行号 | 内容 |
|----------|-------------|------|
| `lobby-hero.wxml` | 22-57 | Hero 卡片（赛事名、状态、KPI） |
| `lobby-state-panel.wxml` | 59-102 | 状态概览面板（清单、主操作） |
| `lobby-join-sheet.wxml` | 117-159 | 加入/资料 bottom-sheet 表单 |
| `lobby-player-grid.wxml` | 161-183 | 参赛名单网格 |
| `lobby-share-bar.wxml` | 185-199 | 分享邀请栏（合并两个几乎相同的 share bar 为一个） |
| `lobby-admin-panel.wxml` | 201-372 | 管理员面板（快速配置 + 导入名单 + 固搭组队） |

### index.wxml 改造后结构（~80 行）

```xml
<import src="./lobby-hero.wxml"/>
<import src="./lobby-state-panel.wxml"/>
<import src="./lobby-join-sheet.wxml"/>
<import src="./lobby-player-grid.wxml"/>
<import src="./lobby-share-bar.wxml"/>
<import src="./lobby-admin-panel.wxml"/>

<view class="container safe-bottom lobby-page" wx:if="{{tournament}}">
  <!-- primary nav (12 行，保留在主文件) -->
  <!-- sync banner (7 行，保留在主文件) -->
  <template is="lobby-hero" data="{{...}}"/>
  <template is="lobby-state-panel" data="{{...}}"/>
  <!-- view-only prompt + join trigger (保留，共 12 行) -->
  <!-- sheet mask (保留) -->
  <template is="lobby-join-sheet" data="{{...}}"/>
  <template is="lobby-player-grid" data="{{...}}"/>
  <template is="lobby-share-bar" data="{{...}}"/>
  <template is="lobby-admin-panel" data="{{...}}"/>
  <!-- info panel (保留，13 行) -->
  <!-- retry box (保留，4 行) -->
</view>
<!-- error state (保留) -->
<!-- skeleton state (保留) -->
```

**关键约束**：`<template>` 的 `data="{{...}}"` 使用展开语法传递整个 page data scope，所有 `{{变量}}` 引用和 `bindtap` 处理器无需任何修改。

**不需要改动的文件**：所有 JS 文件、index.wxss、index.json

**验证**：
- 全量测试通过
- 手动冒烟 lobby 所有状态：draft（管理员/参赛者/旁观者）、running、finished
- 验证所有交互：join sheet 开关、admin panel 展开收起、quick settings picker、import textarea、pair team CRUD、share 按钮、primary nav tab 切换

---

## Phase 5: lobby JS 进一步拆分（lobbyDraftActions.js） [P1, 中等风险]

**目标**：将 654 行的 lobbyDraftActions "杂物抽屉" 拆分为聚焦模块

### 拆分方案

| 新模块 | 职责 | 约行数 |
|--------|------|--------|
| `lobbyQuickSettingsActions.js`（新建） | `setQuickMatchCount`, 所有 `onPickQuickConfig*`, `syncQuickEndConditionUi`, `refreshQuickRecommendations`, `saveQuickSettings` | ~180 |
| `lobbyImportActions.js`（新建） | `parseImportPlayers`, `quickImportPlayers`, `focusQuickImportArea`, `onQuickImportInput` | ~80 |
| `lobbyLifecycleActions.js`（新建） | `handleStart`, `cancelTournament`, `cloneCurrentTournament`, `saveAndStart`, `handleWriteError` | ~130 |
| `lobbyDraftActions.js`（精简） | `runFlowAction`, 导航/scroll helper, `onChecklistTap`, `onNextActionTap`, `onPickJoinSquad`, `onTogglePlayerSquad`, `goBatchScoring` | ~160 |

### lobbyDelegates.js 更新

```js
const quickSettingsActions = require('./lobbyQuickSettingsActions');
const importActions = require('./lobbyImportActions');
const lifecycleActions = require('./lobbyLifecycleActions');
const draftActions = require('./lobbyDraftActions');
// ...
return Object.assign({}, profileActions, draftActions, quickSettingsActions,
  importActions, lifecycleActions, pairActions, sync, retryMethods);
```

**验证**：
- 全量测试通过
- 新增合约测试：验证组合后的 delegates 对象包含所有预期方法名
- 手动冒烟：quick settings 保存、import 导入、开赛、取消、克隆

---

## Phase 6: 广告位隐藏 [P3, 极低风险]

**目标**：未接入广告前隐藏空占位区域

| # | 动作 | 文件 |
|---|------|------|
| 6a | home 页 ad slot：将 `showHomeAdSlot` 默认值改为 `false`，或在 adGuard 中关闭 | `miniprogram/pages/home/index.js` 或 `miniprogram/core/adGuard.js` |
| 6b | analytics 页同上 | `miniprogram/pages/analytics/index.js` 或 `miniprogram/core/adGuard.js` |

**验证**：全量测试通过 + 首页和复盘页无虚线框广告占位

---

## Phase 7: 后端小修 [P2, 低风险]

### 7a: Guest ID 随机性增强

```js
// Before
function makeId(i) { return `guest_${Date.now()}_${i}_${Math.floor(Math.random()*1e6)}`; }
// After
const crypto = require('crypto');
function makeId(i) { return `guest_${Date.now()}_${i}_${crypto.randomBytes(8).toString('hex')}`; }
```

**文件**：`cloudfunctions/addPlayers/index.js`（第 49-51 行）、`cloudfunctions/cloneTournament/logic.js`

### 7b: 云函数按需同步（可选，评估后决定）

- 新建 `cloud-deps.json` 声明每个函数的实际依赖
- 更新 `scripts/sync-cloud-common.sh` 读取 manifest 按需复制
- 新增 `tests/cloud-deps-manifest.test.js` 验证 manifest 与实际 require 一致

**验证**：`node --test tests/*.test.js` + `./scripts/sync-cloud-common.sh` + `./scripts/check-cloud-common.sh`

---

## Phase 8: mine 页面内容密度 [P2, 需用户审核]

**目标**：充实"我的"页面服务网格

**方案**：
- 服务网格新增"编辑资料"和"设置"入口（handler 已有 `goProfile()`, `goSettings()`）
- 考虑移除顶部 hero 区的重复按钮，让服务网格成为统一导航入口
- 导航调用已在 Phase 2 迁移到 nav.js

**文件**：`miniprogram/pages/mine/index.wxml`, `miniprogram/pages/mine/index.wxss`

**验证**：用户审核布局 → 全量测试 + 视觉检查

---

## 不在本次整改范围

| 项 | 原因 |
|----|------|
| Referee 角色（P3 #10） | 后端已完整实现，前端需产品设计决策，属功能新增 |
| 暗色模式实现 | 60+ CSS 变量 + 14 页面 WXSS 审计，属独立多天级项目 |
| mine 页面新功能（历史、成就等） | 属功能新增，不在整改范围 |

---

## 执行总览

| Phase | 问题 | 优先级 | 风险 | 工时 | 依赖 | 用户审核 |
|-------|------|--------|------|------|------|----------|
| 0 | #7, #11, #9 样式 | P2/P3 | 零 | 30min | 无 | 否 |
| 1 | #2 tabBar 图标 | P1 | 低 | 1-2h | 无 | 是 |
| 2 | #5 nav 集中化 | P2 | 低 | 1-2h | 无 | 否 |
| 3 | #3 暗色模式 toggle | P2 | 极低 | 20min | 无 | 是 |
| 4 | #1 lobby WXML 拆分 | P1 | 中 | 3-4h | Phase 0 | 否 |
| 5 | #1 lobby JS 拆分 | P1 | 中 | 2-3h | Phase 4 | 否 |
| 6 | #9 广告位隐藏 | P3 | 极低 | 15min | 无 | 否 |
| 7 | #8 guest ID / #6 按需同步 | P2 | 低 | 1-2h | 无 | 否 |
| 8 | #4 mine 页面密度 | P2 | 低 | 1h | Phase 2 | 是 |

**总工时**：约 12-16 小时

**可并行**：Phase 0/1/2/3/6/7 互相独立，可并行执行。Phase 4→5 串行。Phase 8 依赖 Phase 2。

**每个 Phase 的门禁**：`node --test tests/*.test.js`（548 条）全部通过。Phase 4/5 额外要求 lobby 全状态手动冒烟测试。
