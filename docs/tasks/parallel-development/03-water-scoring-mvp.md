# 03 · 「打水」计分 MVP

> 状态：`ready_for_integration`
>
> 类型：用户可见功能 + 云写入契约
>
> 默认行为：关闭；仅支持 `multi_rotate`
>
> 权威路径：`D:\projects(WIN)\badminton-miniapp`

## 目标

在多人转比赛中增加可选的单局「打水」记录，并从赛事 `rounds` 确定性派生整场榜单。该功能只是一项独立趣味账目，不改变正式比分、比赛状态或排名规则。

本任务的第一步不是改代码，而是提交下方审批矩阵。只有用户逐项明确批准后，才可按测试先行方式实现。

## 当前基线

- 权威源码：`D:\projects(WIN)\badminton-miniapp`。
- 当前开发基线：`codex/ui-optimization-v2`；线上正式版仍对应 `master@5813ffc`。
- 当前唯一已批准的可见产品变化是 schedule 中央比分布局；settings、match、analytics 的新 UI 均未获批准。
- `updateSettings` 只允许创建者在 `draft` 阶段更新设置，并使用乐观锁和稳定结果契约。
- `submitScore` 已包含比分校验、录分锁、幂等重试、乐观锁、排名重算和完赛状态更新；打水数据必须与这次比分写入保持原子一致。
- `cloneTournament` 当前会复制完整 `rules`。把配置放在 `rules.water` 可自然继承，不需要在本任务修改 clone 热点函数。

## 依赖与并行关系

- 可立即进行：审批矩阵、字段契约、纯函数测试设计、低保真原型。
- 实现依赖：用户明确批准本任务的可见行为、文案、页面位置和默认值。
- 与模板优化可以并行，但不得修改 `startTournament` 或排阵生成器。
- 与事件管道 Phase A 可以并行，但事件管道不得修改 `updateSettings`、`submitScore`；服务端打水事件接入后置。
- 与“首次录分”漏斗 UI 优化冲突：两者都会触及 match 页面，必须串行。
- 建议在 clone preset 修复合入后再做最终集成，但本任务不得顺手扩展 clone 行为。

## 已批准的产品矩阵

| 审批项 | 建议方案 | 影响页面 | 用户确认 |
|---|---|---|---|
| 功能入口 | 赛事设置中增加「打水记账」开关 | settings | 已批准 |
| 默认行为 | 新建和历史赛事均默认关闭；关闭时不显示额外录分控件 | settings、match、analytics | 已批准 |
| 模式范围 | 仅 `multi_rotate` 可开启；其他模式不展示、不接受写入 | settings、match | 已批准 |
| 单局瓶数 | 开启后每局选择负方每人 `0 / 1 / 2` 瓶；建议默认 `1` 瓶 | match | 已批准 |
| 记账定义 | 每名负方 `请水 += N`，每名胜方 `赢水 += N`，双方总量相等 | match、analytics | 已批准 |
| 榜单位置 | analytics 增加独立「打水榜」，展示赢水、请水、净水 | analytics | 已批准 |
| 正式排名 | 打水数据永不进入 `rankings`，不改变胜场、分差或名次 | 无排名 UI 变化 | 已批准 |
| 改分语义 | 改比分或改瓶数时按当前单局快照重算；不做增量累加 | match、analytics | 已批准 |
| 导航与分享 | MVP 不增加页面、导航、分享文案或分享卡片字段 | 无 | 已批准 |

审批前只允许整理和汇报，不得编辑产品代码。

用户于 2026-07-16 明确回复“全部批准”。实现与验收证据见 `docs/tasks/session-logs/20260716-water-scoring-mvp.md`。

## 数据契约

### 赛事设置

建议保存在现有 `rules` 内：

```js
rules: {
  // existing fields...
  water: {
    enabled: true,
    defaultUnitsPerLoser: 1
  }
}
```

约束：

- 缺失、非法或非 `multi_rotate` 一律归一为关闭。
- `defaultUnitsPerLoser` 只接受整数 `0`、`1`、`2`。
- 不新增顶层聚合字段，不写 `waterRankings`。

### 单局快照

只有已完成比赛可带打水快照：

```js
match.water = {
  unitsPerLoser: 1
}
```

负方和胜方必须由该 match 的当前 `score` 与 `teamA/teamB` 派生，不在快照中重复保存成员总账。

### 榜单派生

- 唯一事实源是当前赛事 `rounds`。
- 只统计 `status === 'finished'`、比分合法且 `unitsPerLoser` 为 `0/1/2` 的比赛。
- `pending`、`canceled`、非法比分和缺失配置不计入。
- 同比分幂等重试结果不重复计数。
- 修改已完成比分或瓶数后，从最新 rounds 全量重算。
- 正式 `rankings`、`rankingCore`、`rebuildRankings` 不得读取打水字段。

## 允许修改

审批后允许的最小实施面：

- 新增 `miniprogram/core/waterLedger.js`。
- `miniprogram/pages/settings/settingsActions.js`
- `miniprogram/pages/settings/settingsViewModel.js`
- `miniprogram/pages/settings/index.wxml`
- `miniprogram/pages/settings/index.wxss`
- `miniprogram/pages/match/matchSubmitService.js`
- 必要时修改 `matchViewModel.js`、`matchDraftController.js`。
- `miniprogram/pages/match/index.wxml`
- `miniprogram/pages/match/index.wxss`
- `miniprogram/pages/analytics/index.js`
- `miniprogram/pages/analytics/index.wxml`
- `miniprogram/pages/analytics/index.wxss`
- `cloudfunctions/updateSettings/index.js`
- `cloudfunctions/updateSettings/logic.js`
- `cloudfunctions/submitScore/index.js`
- `cloudfunctions/submitScore/logic.js`
- 对应测试；若缺少 settings/match/analytics 真机 case，可最小增加截图 fixture 与矩阵测试。

任何超出以上范围的修改都要先说明理由并再次确认。

## 明确禁止

- 审批前修改任何产品代码。
- 修改 `startTournament`、排阵模板或排阵算法。
- 修改正式排名排序、`rankingCore` 或 `rebuildRankings`。
- 修改 `scoreLock` 的权限、占锁、心跳或释放语义。
- 修改 `cloneTournament`；`rules.water` 应由现有 rules 复制自然保留。
- 支持 `squad_doubles` 或 `fixed_pair_rr`。
- 新增支付、催款、逐人债务、公开羞辱榜、积分奖励或分享裂变。
- 新增页面、导航路径、分享卡片或订阅消息。
- 为本功能修改 `scripts/*common.template.js`，除非先证明现有公共模块无法满足且取得额外批准。

## 测试先行清单

先新增失败测试，再实现：

1. `waterLedger`：0/1/2 瓶、胜负双方、多人累计、净水、缺字段、取消场次、非法比分。
2. 改分：胜负方翻转后旧结果完全消失，按最新 rounds 重算。
3. 幂等：相同比分与相同瓶数重复提交不重复累计。
4. 设置：默认关闭、只允许多人转、非法瓶数归一或拒绝、已有 rules 字段不丢失。
5. 提交：打水快照与比分同一次乐观锁写入；冲突、过期锁、他人占锁不写入。
6. 排名：有无打水字段时正式排名结果完全一致。
7. 克隆与重置：rules 配置按现有复制契约保留，rounds 清空后榜单为空。

聚焦回归至少包括：

```powershell
node --test tests/water-ledger.test.js tests/updateSettings.index.test.js tests/updateSettings.logic.test.js tests/settings.view-model.test.js tests/settings.fetch-result-shape.test.js tests/submitScore.index.test.js tests/submitScore.logic.test.js tests/submitScore.idempotent-retry.test.js tests/submitScore.score-bounds.test.js tests/ranking-core.concurrent-submit.test.js tests/ranking-core.consistency.test.js tests/match.submit-guard.test.js tests/match.lock-lifecycle.test.js tests/smoke.score-lock-submit.test.js
npm run check:cloud-common
npm run verify:full
```

若实际文件名不同，先用 `rg --files tests` 核对，不得跳过对应测试领域。

## 交付与验收

- 一份已获用户逐项批准的审批矩阵。
- 字段契约和纯函数测试覆盖。
- settings、match、analytics 三处可见变化的真实截图与人工检查结果。
- `updateSettings` 与 `submitScore` 的稳定云结果契约不变：`ok/code/message/state/traceId/data` 的既有归一化必须兼容。
- 锁、幂等、乐观锁、改分和排名回归全部通过。
- 明确列出受影响云函数：`updateSettings`、`submitScore`，但不部署。
- 不提交、不 push、不创建 PR、不 preview/upload、不发布、不部署云函数、不写真实云数据。

## 可复制启动提示词

```text
在 D:\projects(WIN)\badminton-miniapp 开始任务 03「打水计分 MVP」。

先完整阅读 AGENTS.md、docs/tasks/current.md、docs/context/architecture.md、docs/tasks/parallel-development/03-water-scoring-mvp.md，并使用 weapp-regression-guard 与 weapp-cloud-contract-audit。先核对 git status，保留现有改动，禁止 reset/clean/checkout 覆盖。

本任务当前状态是 awaiting_approval。第一轮只输出文档中的产品审批矩阵，逐项说明 settings、match、analytics 的可见变化、文案、导航、默认行为和数据语义；在我明确批准前，不得修改产品代码。

批准后按测试先行实现：默认关闭、仅 multi_rotate、每局负方每人 0/1/2 瓶、配置放 rules.water、单局保存最小快照、整场榜单只从 rounds 派生、改分全量重算、幂等不重复、不影响正式 rankings。严格限制在任务文档允许文件内，不修改 startTournament、rankingCore、rebuildRankings、scoreLock 语义或 cloneTournament。

完成后运行聚焦测试、npm run check:cloud-common、npm run verify:full，并对 settings/match/analytics 做真实截图验收。不要 commit、push、创建 PR、preview/upload、发布、部署云函数或写真实云数据；最终列出变更、测试、未测试项、风险和待部署函数名。
```
