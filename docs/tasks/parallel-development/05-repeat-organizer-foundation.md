# 05 · 复办基础：clone preset 契约修复

> 状态：`awaiting_approval`
>
> 类型：用户操作语义 + 云写入契约
>
> 范围：仅修复 `cloneTournament` 对 `presetKey/playerLimit` 的 allowlist 复制
>
> 权威路径：`D:\projects(WIN)\badminton-miniapp`

## 目标

修复固定人数多人转赛事被复制后丢失 `presetKey/playerLimit` 的契约问题，使新副本继续保持原固定人数配置。

本任务不是“常用球友名单”功能，也不新增任何 UI。由于复制后的默认配置会发生变化，第一步仍需先提交审批矩阵，取得明确批准后再实现。

## 当前基线

- 权威源码：`D:\projects(WIN)\badminton-miniapp`。
- 当前开发基线：`codex/ui-optimization-v2`；线上正式版仍对应 `master@5813ffc`。
- `cloneTournament` 由 home、lobby、analytics 通过 `miniprogram/core/cloneTournament.js` 调用。
- 当前云函数会复制 `mode`、`totalMatches`、`courts`、`rules`、成员和固搭/分队信息，但没有写入 `presetKey/playerLimit`。
- `createTournament` 对已知固定人数 preset 会写入 canonical `presetKey` 与 `playerLimit`；`startTournament` 和客户端 readiness 依赖 preset 判断人数与场地约束。
- 当前已知多人转 preset 由共享 mode helper 定义，包括 `rotation_6`、`rotation_7`、`rotation_8`；不得在 clone 内另建第二套常量事实源。
- clone 已有权限、clientRequestId 幂等和稳定结果契约，本修复不得改变这些行为。

## 依赖与并行关系

- 可与数据复盘和排阵模板内部优化并行。
- 不依赖常用名单、组局或打水功能。
- 建议先于“常用名单/一键复办”和服务端 clone 埋点合并。
- 与产品事件管道 Phase A 无冲突，因为 Phase A 明确禁止修改 clone 热函数。
- 如果其他任务准备修改 `scripts/mode-common.template.js` 或 clone 云函数，必须串行集成。

## 待批准的行为矩阵

| 审批项 | 当前行为 | 修复后行为 | 页面/流程影响 |
|---|---|---|---|
| 已知固定人数 preset | 副本丢失 preset，表现为普通自定义多人转 | 副本保留 canonical `presetKey`，`playerLimit` 从共享 preset 定义派生 | home/lobby/analytics 的“复制赛事”结果 |
| 自定义多人转 | 副本无 preset 字段 | 明确归一为 `presetKey: 'custom'`，不写 `playerLimit` | 无 UI 变化 |
| 非多人转模式 | 不写 preset 字段 | 继续不写 `presetKey/playerLimit` | 无变化 |
| 未知或污染的 preset | 当前因不复制而被忽略 | 降级为 `custom`，绝不复制任意 `playerLimit` | 安全降级 |
| 名单人数不符 | 当前副本仍可创建草稿 | 保留 canonical preset，由现有 readiness/start 校验提示人数问题；不静默改名单 | lobby 开赛前校验 |
| 结果契约 | `TOURNAMENT_CLONED` + tournamentId | 完全不变 | 无调用方改动 |
| 历史数据 | 不修改 | 不回填、不原地修复；只影响批准后新创建的副本 | 无真实数据写入 |
| UI/文案/导航 | 不变 | 不变 | 零可见布局变化 |

用户批准前不得修改 clone 代码。

## allowlist 规则

实现必须调用共享 `modeHelper.resolveRotationPreset(source.presetKey)`，不得只信任源文档中的原始字段：

1. `mode === 'multi_rotate'` 且 resolver 返回已知 preset：
   - 写入 resolver 返回的 canonical `presetKey`。
   - `playerLimit` 从 canonical preset 的 `playerLimit` 派生。
   - 忽略源文档可能被污染或过时的 `playerLimit`。
2. `mode === 'multi_rotate'` 但 preset 缺失、为 custom 或未知：
   - 写入 `presetKey: 'custom'`。
   - 不写 `playerLimit`。
3. `squad_doubles`、`fixed_pair_rr` 等非多人转模式：
   - 不写 `presetKey`。
   - 不写 `playerLimit`。
4. 不修改源赛事，不回填历史副本。

## 允许修改

严格限于：

- `cloudfunctions/cloneTournament/index.js`
- 必要时 `cloudfunctions/cloneTournament/logic.js`
- `tests/cloneTournament.index.test.js`
- `tests/cloneTournament.logic.test.js`
- 必要时补充一个命名清晰的 clone preset 契约测试文件

允许只运行但不修改的关联测试包括 core、squad preservation、readiness 和 start validation。

## 明确禁止

- 新增常用球友名单、收藏、分组或名单 UI。
- 修改 home、lobby、analytics 页面或 `miniprogram/core/cloneTournament.js`。
- 修改 `createTournament`、`startTournament`、`updateSettings`、`submitScore`。
- 修改 `scripts/mode-common.template.js` 或任何共享 preset 定义。
- 手工修改 `cloudfunctions/cloneTournament/lib/*`。
- 修改 clone 权限、返回 code/state、clientRequestId 幂等或成员 ID 重映射语义。
- 顺手修复赛事名称、分享、排名、排阵或其他字段。
- 回填历史赛事、读取或写入真实云数据库。

## 测试先行清单

先补失败测试：

1. `rotation_6/7/8` 分别保留 canonical key 与派生 playerLimit。
2. 污染的源 `playerLimit` 不得覆盖 canonical 值。
3. custom 多人转写 `presetKey: 'custom'` 且不写 `playerLimit`。
4. 未知 preset 降级 custom，不透传任意键或人数。
5. 非多人转模式不引入 preset 字段。
6. squad 分队、fixed pair 重映射、rules、场数和场地复制保持原样。
7. 重复 clientRequestId 仍只创建一个副本并返回 deduped。
8. 权限拒绝、not_found 和稳定结果 shape 保持。

聚焦回归至少包括：

```powershell
node --test tests/cloneTournament.index.test.js tests/cloneTournament.logic.test.js tests/cloneTournament.core.test.js tests/cloneTournament-squad-preservation.test.js tests/draft-start-readiness.test.js tests/lobby.viewmodel.test.js tests/startTournament.logic.test.js tests/cloud-response-contract-write-actions.test.js
npm run check:cloud-common
npm run verify:full
```

## 交付与验收

- 一份获用户批准的复制行为矩阵。
- clone preset allowlist 的测试先行实现。
- 仅指定 clone 文件与测试产生差异，页面和 shared common 零差异。
- `TOURNAMENT_CLONED` 的 `ok/code/message/state/traceId/tournamentId` 现有消费方式保持兼容。
- clone、readiness、start validation 与全量回归通过。
- 最终仅提醒未来需要部署 `cloneTournament`，本任务不部署。
- 不提交、不 push、不创建 PR、不 preview/upload、不发布、不部署云函数、不写真实云数据。

## 后续明确不在本任务

- 常用球友名单与用户资产 collection。
- 一键复用上次名单、周期球局或组局成员导入。
- clone 事件上报、运营后台指标和历史数据修复。
- clone 页面的 UI、文案或入口优化。

## 可复制启动提示词

```text
在 D:\projects(WIN)\badminton-miniapp 开始任务 05「复办基础：clone preset 契约修复」。

先完整阅读 AGENTS.md、docs/tasks/current.md、docs/context/architecture.md、docs/tasks/parallel-development/05-repeat-organizer-foundation.md，并使用 weapp-regression-guard 与 weapp-cloud-contract-audit。先核对 git status，保留现有改动，禁止 reset/clean/checkout 覆盖。

本任务当前状态是 awaiting_approval。第一轮只输出任务文档中的复制行为审批矩阵，明确已知 preset、custom、未知 preset、非多人转、名单人数不符和历史数据的行为；在我明确批准前，不得修改代码。

批准后测试先行，只修 cloudfunctions/cloneTournament/index.js、必要的 logic.js 和对应测试。必须通过共享 modeHelper resolver 做 allowlist：已知 multi_rotate preset 保留 canonical presetKey，并从 canonical preset 派生 playerLimit；custom/未知 key 降级 custom 且不写 playerLimit；非多人转不写两字段。不要信任源 playerLimit。

严格禁止新增常用名单 UI，禁止修改页面、core/cloneTournament.js、createTournament、startTournament、updateSettings、submitScore、mode-common template、权限、幂等或返回契约。

完成后运行 clone 聚焦测试、readiness/start validation 回归、npm run check:cloud-common、npm run verify:full。不要 commit、push、创建 PR、preview/upload、发布、部署云函数或写真实云数据；最终按“变更、测试、未测试、风险”汇报，并只提醒 cloneTournament 是未来待部署函数。
```
