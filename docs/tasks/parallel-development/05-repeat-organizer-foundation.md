# 05 · 复办基础：clone preset 契约修复

> 状态：`approved_implemented_awaiting_integration`
>
> 类型：用户操作语义 + 云写入契约
>
> 范围：仅修复 `cloneTournament` 对 `presetKey/playerLimit` 的 allowlist 复制
>
> 审批记录：2026-07-16，原线程用户在完整复制行为矩阵后明确回复“批准”
>
> 实现提交：`d1b6e04 fix: preserve rotation presets when cloning tournaments`
>
> 实现工作线：`codex/roadmap-clone-retention`
>
> 交付日志：[20260716-p05-clone-preset-contract.md](../../archive/2026/session-logs/20260716-p05-clone-preset-contract.md)
>
> 发布状态：仅本地提交，待总控集成；未 push、未 preview/upload、未发布、未部署
>
> 权威路径：`D:\projects(WIN)\badminton-miniapp`

## 目标

修复固定人数多人转赛事被复制后丢失 `presetKey/playerLimit` 的契约问题，使新副本继续保持原固定人数配置。

本任务不是“常用球友名单”功能，也不新增任何 UI。复制行为矩阵已由用户明确批准，批准范围仅限本文件列出的 clone preset 契约修复；实现已完成并停留在本地工作线，等待总控集成。

## 基线与完成事实

- 权威源码：`D:\projects(WIN)\badminton-miniapp`。
- 当前开发基线：`codex/ui-optimization-v2`；线上正式版仍对应 `master@5813ffc`。
- 本工作线从统一文档 checkpoint `70845c1` 开始，实现提交为 `d1b6e04`。
- `cloneTournament` 由 home、lobby、analytics 通过 `miniprogram/core/cloneTournament.js` 调用。
- 实现前云函数会复制 `mode`、`totalMatches`、`courts`、`rules`、成员和固搭/分队信息，但没有写入 `presetKey/playerLimit`；`d1b6e04` 只补齐这两个字段的 allowlist 写入。
- `createTournament` 对已知固定人数 preset 会写入 canonical `presetKey` 与 `playerLimit`；`startTournament` 和客户端 readiness 依赖 preset 判断人数与场地约束。
- 当前已知多人转 preset 由共享 mode helper 定义，包括 `rotation_6`、`rotation_7`、`rotation_8`；不得在 clone 内另建第二套常量事实源。
- clone 已有权限、clientRequestId 幂等和稳定结果契约均未改变。
- 本实现未集成到总控分支，也未部署到微信云环境，因此当前线上行为未变化。

## 依赖与并行关系

- 可与数据复盘和排阵模板内部优化并行。
- 不依赖常用名单、组局或打水功能。
- 建议先于“常用名单/一键复办”和服务端 clone 埋点合并。
- 与产品事件管道 Phase A 无冲突，因为 Phase A 明确禁止修改 clone 热函数。
- 如果其他任务准备修改 `scripts/mode-common.template.js` 或 clone 云函数，必须串行集成。

## 已批准并实现的行为矩阵

| 审批项 | 实现前行为 | 已批准并实现的行为 | 页面/流程影响 |
|---|---|---|---|
| 已知固定人数 preset | 副本丢失 preset，表现为普通自定义多人转 | 副本保留 canonical `presetKey`，`playerLimit` 从共享 preset 定义派生 | home/lobby/analytics 的“复制赛事”结果 |
| 自定义多人转 | 副本无 preset 字段 | 明确归一为 `presetKey: 'custom'`，不写 `playerLimit` | 无 UI 变化 |
| 非多人转模式 | 不写 preset 字段 | 继续不写 `presetKey/playerLimit` | 无变化 |
| 未知或污染的 preset | 实现前因不复制而被忽略 | 降级为 `custom`，绝不复制任意 `playerLimit` | 安全降级 |
| 名单人数不符 | 实现前副本仍可创建草稿 | 保留 canonical preset，由现有 readiness/start 校验提示人数问题；不静默改名单 | lobby 开赛前校验 |
| 结果契约 | `TOURNAMENT_CLONED` + tournamentId | 完全不变 | 无调用方改动 |
| 历史数据 | 不修改 | 不回填、不原地修复；未来部署 `cloneTournament` 后仅影响新创建的副本 | 无真实数据写入 |
| UI/文案/导航 | 不变 | 不变 | 零可见布局变化 |

原线程用户对上表全部八项明确回复“批准”。该批准不包含常用名单、UI、入口、分享、历史回填或其他字段扩展。

## allowlist 规则

`d1b6e04` 已按契约调用共享 `modeHelper.resolveRotationPreset(source.presetKey)`，不信任源文档中的原始字段：

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

## 批准的实现边界与实际差异

审批时允许的最大代码范围仅包括 `cloudfunctions/cloneTournament/index.js`、必要时的 `logic.js` 和对应 clone 契约测试；关联的 core、squad preservation、readiness 与 start validation 测试只允许运行。

`d1b6e04` 的实际差异进一步收窄为：

- `cloudfunctions/cloneTournament/index.js`：新增 preset 字段构造并接入 clone 写入。
- `tests/cloneTournament.index.test.js`：新增 allowlist、污染字段、custom/未知 preset、非多人转隔离和既有契约断言。

没有修改 `logic.js`、页面、客户端 clone core、shared common、其他云函数或任何 UI 文件。

## 明确禁止

- 新增常用球友名单、收藏、分组或名单 UI。
- 修改 home、lobby、analytics 页面或 `miniprogram/core/cloneTournament.js`。
- 修改 `createTournament`、`startTournament`、`updateSettings`、`submitScore`。
- 修改 `scripts/mode-common.template.js` 或任何共享 preset 定义。
- 手工修改 `cloudfunctions/cloneTournament/lib/*`。
- 修改 clone 权限、返回 code/state、clientRequestId 幂等或成员 ID 重映射语义。
- 顺手修复赛事名称、分享、排名、排阵或其他字段。
- 回填历史赛事、读取或写入真实云数据库。

## 已完成的测试先行清单

实现前先补失败测试，最终覆盖：

1. `rotation_6/7/8` 分别保留 canonical key 与派生 playerLimit。
2. 污染的源 `playerLimit` 不得覆盖 canonical 值。
3. custom 多人转写 `presetKey: 'custom'` 且不写 `playerLimit`。
4. 未知 preset 降级 custom，不透传任意键或人数。
5. 非多人转模式不引入 preset 字段。
6. squad 分队、fixed pair 重映射、rules、场数和场地复制保持原样。
7. 重复 clientRequestId 仍只创建一个副本并返回 deduped。
8. 权限拒绝、not_found 和稳定结果 shape 保持。

最终验证包括：

```powershell
node --test tests/cloneTournament.index.test.js tests/cloneTournament.logic.test.js tests/cloneTournament.core.test.js tests/cloneTournament-squad-preservation.test.js tests/draft-start-readiness.test.js tests/lobby.viewmodel.test.js tests/startTournament.logic.test.js tests/cloud-response-contract-write-actions.test.js
npm run check:cloud-common
npm run verify:full
```

- clone/readiness/start/cloud response 聚焦回归：64/64 通过。
- `npm run check:cloud-common`：9 个模板、22 个云函数无漂移。
- `npm run verify:full`：1176 项测试中 1170 通过、0 失败、6 跳过；lint 0 errors。
- 独立最终 diff review：无阻塞 findings。

## 交付与验收

- [x] 原线程用户明确批准完整复制行为矩阵。
- [x] clone preset allowlist 按测试先行完成，代码提交为 `d1b6e04`。
- [x] 仅指定 clone index 与测试产生差异，页面和 shared common 零差异。
- [x] `TOURNAMENT_CLONED` 的 `ok/code/message/state/traceId/tournamentId` 现有消费方式保持兼容。
- [x] clone、readiness、start validation 与全量回归通过。
- [x] 未 push、未创建 PR、未 preview/upload、未发布、未部署云函数、未写真实云数据。
- [ ] 等待总控集成实现提交和本次文档收口提交。

集成与发布是后续独立动作；未来仅需提醒 `cloneTournament` 是待部署函数，本工作线不执行部署。

## 后续明确不在本任务

- 常用球友名单与用户资产 collection。
- 一键复用上次名单、周期球局或组局成员导入。
- clone 事件上报、运营后台指标和历史数据修复。
- clone 页面的 UI、文案或入口优化。

## 总控集成提示词

```text
在总控集成 worktree 收口 P05「复办基础：clone preset 契约修复」。

先阅读 docs/tasks/parallel-development/05-repeat-organizer-foundation.md 与对应 session log，核对实现提交 d1b6e04 和文档收口提交。P05 已获批准、已实现，当前只待集成，不要重新扩展产品范围。

保持既有 allowlist：已知 multi_rotate preset 使用共享 resolver 的 canonical presetKey/playerLimit；custom、缺失或未知 key 降级 custom 且不写 playerLimit；非多人转不写两字段；不信任源 playerLimit。

严格禁止新增常用名单或 UI，禁止修改页面、core/cloneTournament.js、createTournament、startTournament、updateSettings、submitScore、mode-common template、权限、幂等或返回契约。

集成前复核 clone 聚焦测试、readiness/start validation 和 npm run check:cloud-common。不要 push、创建 PR、preview/upload、发布、部署云函数或写真实云数据；未来发布阶段再单独部署 cloneTournament。
```
