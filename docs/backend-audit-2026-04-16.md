# 2026-04-16 后端全面审查报告

- 生成时间：`2026-04-16T00:54:00+08:00`
- 基线 commit：`9f588a6`
- 审查方式：本地交叉审查 + 4 个并行 agent 只读检查
- 覆盖范围：`cloudfunctions/`、`scripts/*-common.template.js`、`miniprogram/core/cloud.js`、关键前端调用链、对应 tests

## 执行摘要

本次后端全面检查共确认 8 个问题和 1 个工具链缺口。

- 高优先级 3 项：`startTournament` 跨动作幂等污染、排阵 roster ID contract 漂移、`clientRequestId` 非原子幂等。
- 中优先级 3 项：结构化错误契约不一致、`getUserProfile` 吞掉数据库异常、前端把 `not_found` 降级成 `param`。
- 低优先级 2 项：`MATCH_FINISHED/canceled` 状态语义漂移、排阵审计脚本忽略 `effectiveCourts`。
- 附加风险 1 项：`getMyPerformanceStats` 的 4k 查询上限会静默截断结果。

## 修复进度更新（2026-04-16，当前工作区）

以下进度反映当前工作区状态，不改写上方基线审计结论；原始“主要发现 / 测试缺口”仍对应基线 commit `9f588a6`。

- 已修复高优先级 1：`startTournament` 不再使用通用 `lastClientRequestId` 做 dedupe，改为只认 `client_request_logs` 中 `scope=start_tournament` 的成功记录；返回 `deduped` 前还会再次确认赛事已 `running` 且 `rounds` 已物化。
- 已修复高优先级 2：排阵链路已统一 canonical roster 语义，`playerId/_id` 会在入口归一化为 `player.id`；`validateBeforeGenerate()`、`generateSchedule()`、`buildSquadSchedule()`、`buildFixedPairSchedule()`、`idToPlayerMap()` 已切到同一套 contract。
- 已修复高优先级 3：`createTournament`、`feedbackSubmit`、`cloneTournament`、`saveUserProfile`、`startTournament` 已切到事务内请求日志幂等，不再使用“先查再写”的非原子模式；共享 helper 已下沉到 `scripts/cloud-common.template.js` 并同步到 `cloudfunctions/*/lib/common.js`。
- 已修复中优先级 4：`createTournament`、`feedbackSubmit`、`cloneTournament`、`saveUserProfile`、`addPlayers`、`setReferee`、`scoreLock` 的预期内失败已统一到结构化 `failResult()`；`scoreLock` 已补 `TOURNAMENT_NOT_FOUND` / `MATCH_NOT_FOUND` 契约。
- 已修复中优先级 5：`getUserProfile` 仅在 “collection not exists” 时降级返回 `PROFILE_READY + profile:null`；其余数据库异常改为结构化 `PROFILE_LOAD_FAILED`。前端 `syncCloudProfile()` 遇到 `ok:false` 会保留本地资料，不再把真实故障当成“云端没资料”。
- 已修复中优先级 6：`miniprogram/core/cloud.js` 已新增 `not_found` 分类，`TOURNAMENT_NOT_FOUND` 不再被降级为 `param`；`getUnifiedErrorMessage()` 在 release 环境下也会保留结构化 `not_found` / `invalid` 文案。
- 已修复低优先级 7：`scoreLock` / `submitScore` 不再把 `occupied` / `expired` / `finished` / `canceled` 折叠成 `state: 'conflict'`；`scoreLock` 已新增 `MATCH_CANCELED` 并保留现有用户可见文案，客户端 `cloud.js` 也已将这些 score-entry 状态从通用 conflict modal 中拆出。
- 已修复低优先级 8：`scripts/scheduler-scenario-common.js` 已改按 `schedulerMeta.effectiveCourts` 推导 `logicalRounds`、`restMetrics`、`globalPlaySpreadBaseline`。
- 已修复附加风险：`getMyPerformanceStats` 返回已新增 `truncated` 与 `queryCap=4000`，超过查询上限时会显式给出截断信号。
- 已补齐对应测试缺口：新增跨动作 `clientRequestId` 污染回归、create/update 并发幂等测试、`playerId/_id` roster contract 测试，并将原串行 dedupe 用例改成 request-log 模型。
- 当前仍待处理：无。审计报告列出的 8 个问题与 1 个附加风险均已在当前工作区收口；若后续继续打磨，只剩可选增强项（如 `MATCH_NOT_FOUND` 独立分类、“已取消”专用文案）。

### 当前工作区验证

- `bash scripts/check-cloud-common.sh`：通过
- `node --test tests/*.test.js`：`793 pass / 0 fail`
- `npm run check`：通过

## 主要发现

### 1. 高：`startTournament` 会被其他动作写入的 `lastClientRequestId` 误触发 dedupe

- 位置：`cloudfunctions/startTournament/index.js:84`、`cloudfunctions/startTournament/index.js:93`、`cloudfunctions/updateSettings/index.js:104`
- 现象：`startTournament` 在校验草稿态之前就拿通用字段 `lastClientRequestId` 做幂等判断，而 `updateSettings` 等其他写操作也会写同一个字段。
- 本地最小复现：赛事仍是 `draft`、`settingsConfigured=false`，但文档中已有 `lastClientRequestId='update_settings_123'` 时，调用 `startTournament(clientRequestId='update_settings_123')` 直接返回：

```json
{
  "ok": true,
  "code": "TOURNAMENT_STARTED",
  "state": "deduped",
  "version": 7
}
```

- 风险：把“实际上没开赛”的赛事伪装成“已开赛成功”，会污染前端状态机、重试逻辑和用户认知。
- 建议：把 `startTournament` 的幂等键改成专用字段，或至少把 dedupe 判断放到 `assertDraft` 和 `settingsConfigured` 校验之后，并校验已有赛程/状态确实符合“已开赛”。

### 2. 高：roster 校验接受 `playerId/_id`，但排阵与物化层几乎只消费 `player.id`

- 位置：`cloudfunctions/startTournament/logic.js:51`、`scripts/schedule-common.template.js:25`、`cloudfunctions/startTournament/rotation.js:1224`、`cloudfunctions/startTournament/scheduleModes.js:544`、`cloudfunctions/startTournament/lib/fixed-pair.js:40`、`cloudfunctions/startTournament/index.js:28`
- 现象：校验层用 `extractPlayerId()` 接受 `id/playerId/_id`，但 rotation、squad、fixed-pair 和最终物化映射都只认 `player.id`。
- 本地最小复现：
  - `validateBeforeGenerate()` 对仅含 `playerId` 的 roster 返回成功。
  - `generateSchedule()` 随后报 `invalid template player index: 1`。
  - `buildSquadSchedule()` 对同样模式的数据报 `小队转需要 A/B 队至少各 2 人`。
- 风险：同一份名单在“校验通过”后又在“排阵生成”阶段崩溃，属于实现间 contract 不一致。
- 建议：统一全链路 ID 提取语义，排阵层和物化层都应使用同一套 `extractPlayerId()`。

### 3. 高：多条 `clientRequestId` 幂等路径是先查再写，不具备原子性

- 位置：`cloudfunctions/createTournament/index.js:54` 与 `cloudfunctions/createTournament/index.js:119`、`cloudfunctions/feedbackSubmit/index.js:35` 与 `cloudfunctions/feedbackSubmit/index.js:60`、`cloudfunctions/cloneTournament/index.js:25` 与 `cloudfunctions/cloneTournament/index.js:91`、`cloudfunctions/saveUserProfile/index.js:157` 与 `cloudfunctions/saveUserProfile/index.js:180`
- 现象：这些路径都先执行“按 `clientRequestId` 查询现有文档”，再执行 `add()`；并发重试时两个请求都可能在查询阶段看到“尚不存在”，从而双写成功。
- `saveUserProfile` 额外风险：读取侧只 `limit(1)` 取任意一条 profile，见 `cloudfunctions/getUserProfile/index.js:11`，一旦产生重复 profile，后续读结果会不稳定。
- 风险：重复赛事、重复反馈、重复 profile 文档，且难以通过当前串行测试暴露。
- 建议：改为单文档幂等日志、唯一键占位、事务内写幂等记录，或用“先写占位再落库”的原子模式。

### 4. 中：多条云函数的预期内失败仍然直接 `throw Error(...)`，没有稳定结构化契约

- 典型位置：`cloudfunctions/createTournament/index.js:50`、`cloudfunctions/addPlayers/index.js:61`、`cloudfunctions/setReferee/index.js:11`、`cloudfunctions/saveUserProfile/index.js:151`、`cloudfunctions/feedbackSubmit/index.js:28`、`cloudfunctions/cloneTournament/index.js:22`
- 额外不一致：`scoreLock` 在“赛事不存在 / 比赛不存在”路径上也直接抛异常，见 `cloudfunctions/scoreLock/index.js:67`。
- 影响：前端拿不到稳定的 `ok/code/state/traceId/data`，只能靠 message 文本猜测类型；release 环境下未结构化错误会被压成通用失败提示。
- 本地验证：`赛事名称不能为空`、`反馈内容至少10字`、`提交太频繁，请稍后再试`、`赛事不存在` 在 release 环境下都被 `miniprogram/core/cloud.js` 统一映射为 `操作失败，请稍后重试`。
- 建议：把这些预期内失败统一收敛到 `failResult()`，并为 `scoreLock` 补齐 `TOURNAMENT_NOT_FOUND` / `MATCH_NOT_FOUND` 结构化返回。

### 5. 中：`getUserProfile` 会把真实数据库故障伪装成“没有资料”

- 位置：`cloudfunctions/getUserProfile/index.js:10`
- 现象：数据库查询一旦抛错，函数直接返回 `ok: true, state: 'ready', profile: null`。
- 风险：调用方无法区分“用户没填资料”和“集合缺失 / 权限异常 / 数据库瞬时故障”。
- 当前测试还把这个行为固化了：`tests/getUserProfile.index.test.js:86`
- 建议：只对“集合不存在”等可接受降级场景兜底，其余错误应保留结构化失败。

### 6. 中：前端通用写入错误解析把 `not_found` 语义降级成了 `param`

- 位置：`miniprogram/core/cloud.js:8`、`miniprogram/core/cloud.js:211`、`miniprogram/core/cloud.js:244`
- 现象：`TOURNAMENT_NOT_FOUND` 被放进 `PARAM_CODES`，`classifyCloudError()` 没有 `not_found` 分支。
- 本地验证：把 `{ code: 'TOURNAMENT_NOT_FOUND', state: 'not_found' }` 喂给解析器后，分类结果是 `param`。
- 风险：写链路无法区分“资源已删除/不存在”和“参数错误”，与读链路 `tournamentSync` 已有的 `not_found` 专门处理不一致。
- 建议：把 `not_found` 从 `param` 分离出来，并补齐 `assertWriteResult()` / `describeWriteError()` 的对应 UI 分支。

### 7. 低：`MATCH_FINISHED`、`LOCK_EXPIRED`、`LOCK_OCCUPIED` 的 `state` 语义发生漂移

- 位置：`cloudfunctions/scoreLock/logic.js:44`、`cloudfunctions/scoreLock/index.js:133`、`cloudfunctions/scoreLock/index.js:139`、`cloudfunctions/submitScore/index.js:96`、`cloudfunctions/submitScore/index.js:173`
- 现象：
  - `scoreLock` 逻辑层先把 `canceled` 折叠成 `finished`。
  - 入口层又把 `MATCH_FINISHED` / `LOCK_EXPIRED` / `LOCK_OCCUPIED` 的 `state` 统一改成 `conflict`。
  - 页面层现在主要靠 `code` 特判，`state` 已不再可靠。
- 风险：`state` 字段不能稳定表达业务语义，后续容易继续漂移。
- 建议：明确 `finished`、`expired`、`occupied`、`canceled` 的独立 contract，不要再把互斥语义折叠成同一个 `conflict`。

### 8. 低：排阵审计脚本在有效场地数下降时会低估 `totalRounds/rest` 指标

- 位置：`scripts/scheduler-scenario-common.js:971`、`scripts/scheduler-scenario-common.js:973`、`scripts/scheduler-scenario-common.js:1058`
- 现象：审计用请求值 `scenario.courts` 推导 `logicalRounds`，而不是用实际结果里的 `effectiveCourts`。
- 直接受影响的代表性 case：`rotation 14p/12m/4c` 在场地降级到 3 片时，审计仍按 4 片场地估算轮休分布。
- 风险：报告会比真实排阵更乐观，掩盖休息差异。
- 建议：审计脚本统一以 `schedulerMeta.effectiveCourts` 为准推导 rounds/rest。

## 附加风险

### `getMyPerformanceStats` 有 4k 查询上限且无截断信号

- 位置：`cloudfunctions/getMyPerformanceStats/index.js:9`、`cloudfunctions/getMyPerformanceStats/index.js:16`、`cloudfunctions/getMyPerformanceStats/index.js:82`
- 现象：超过约 4000 条 `finished` 赛事后会静默停止扫描，返回值里也没有 `truncated`、cursor 或告警字段。
- 影响：当前主线页面未依赖该云函数，所以优先级较低，但它的结果在高数据量下会静默低估。

## 测试与工具链缺口

- 缺少跨动作 `clientRequestId` 碰撞测试，无法捕获 `startTournament` 被其他写操作污染的问题。
- 缺少 `playerId/_id` roster 测试，当前所有排阵相关测试默认都使用 `player.id`。
- 缺少并发/竞态测试，当前幂等测试都是串行 happy path，无法证明“真实原子幂等”。
- 缺少结构化失败契约测试，很多负例目前只断言“抛了某段文本”。
- 缺少 `scoreLock` 的 `TOURNAMENT_NOT_FOUND` / `MATCH_NOT_FOUND` 契约测试。
- 技能文档中提到的 `scripts/run-cloud-contract-checks.sh` 在仓库里不存在；当前实际可用的是 `bash scripts/check-cloud-common.sh` 和 `bash scripts/sync-cloud-common.sh`。

## 验证记录

- `bash scripts/check-cloud-common.sh`：通过
- `npm run check`：通过
- `node --test tests/*.test.js`：首次运行 `763 pass / 1 fail`
- 首次全量失败点：`tests/rotation.performance.test.js:211`，报错为 `排阵超时，请减少场次或补充模板`
- `node --test tests/rotation.performance.test.js`：单独复跑 `14 pass / 0 fail`
- 结论：当前仓库存在至少 1 个不稳定测试点，暂时更像波动而不是稳定红灯，但应单独跟踪

## 建议修复顺序

1. 修 `startTournament` 的跨动作幂等污染，避免“未开赛误报成功”。
2. 收敛 `clientRequestId` 的原子幂等实现，优先覆盖 `saveUserProfile`、`createTournament`、`feedbackSubmit`、`cloneTournament`。
3. 统一排阵链路的成员 ID 提取 contract，确保校验、生成、物化使用同一套语义。
4. 统一结构化失败返回，补齐 `scoreLock` 和其他裸异常入口的 `failResult()`。
5. 把前端 `not_found` 从 `param` 分类里拆出来，并校正 `MATCH_FINISHED/canceled` 的状态语义。
6. 修审计脚本的 `effectiveCourts` 口径，并补上对应测试。
