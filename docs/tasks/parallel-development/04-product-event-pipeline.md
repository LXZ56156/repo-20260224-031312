# 04 · 产品事件管道 Phase A

> 状态：`ready`
>
> 类型：非可见基础设施 + 新云契约
>
> 开关：客户端和云端均默认关闭
>
> 权威路径：`D:\projects(WIN)\badminton-miniapp`

## 目标

建立一条隔离、匿名、可幂等重试的产品事件通道，为后续业务漏斗和运营后台提供可靠数据基础。

Phase A 只完成事件协议、客户端缓冲、独立接收云函数和自动化测试。不得把服务端事件直接接入现有热业务云函数，也不得开启真实上报。

## 当前基线

- 权威源码：`D:\projects(WIN)\badminton-miniapp`。
- 当前开发基线：`codex/ui-optimization-v2`；线上正式版仍对应 `master@5813ffc`。
- `miniprogram/core/growthTracker.js` 当前只做 `console.info('[growth]')` 和 `wx.reportEvent`，已有调用分散在 home、lobby、match、ranking、analytics、schedule、share-entry。
- 当前没有可靠的本地事件队列、自建事件 collection、批量接收接口或业务幂等键。
- `startTournament` 已有排阵阶段 timing 日志和 `schedulerMetaJson`，但这不等于产品事件管道。
- 云结果需兼容 `miniprogram/core/cloud.js` 的稳定归一化：`ok`、`code`、`message`、`state`、`traceId`、`data`。

## 依赖与并行关系

- Phase A 可与数据复盘、模板优化、clone 修复和打水审批并行。
- 事件名称与属性应参考指标字典，但不依赖数据复盘完成后才能搭建协议。
- Phase A 严禁修改 `startTournament`、`submitScore`、`updateSettings`、`cloneTournament`、`createTournament`、`joinTournament` 等现有业务函数。
- 服务端关键成功事件属于 Phase B，必须等对应业务分支合并后逐函数串行接入。
- 运营后台 UI、实时告警和历史数据回填不属于 Phase A。

## Phase A 协议

### 客户端事件

建议最小结构：

```js
{
  eventId: 'uuid-or-random-stable-id',
  name: 'allowlisted_event_name',
  occurredAtMs: 0,
  anonymousInstallId: 'random-local-id',
  properties: {}
}
```

约束：

- `eventId` 在客户端首次生成后保持稳定，重试不得换 ID。
- 单次请求为有上限的小批次；建议最多 20 条。
- `name` 必须命中明确 allowlist，不接受任意动态名称。
- `properties` 只能使用指标字典允许的键，字符串和数组长度均设上限。
- 允许的赛事标识只能是现有 `growthTracker.shortTournamentId` 或不可逆摘要，不得发送原始 tournamentId。
- 客户端队列失败、超时或禁用时不得阻断任何业务操作，不向用户弹错误提示。

### 匿名与无 PII

禁止采集、发送或保存：

- `OPENID`、原始用户 ID、手机号、昵称、头像 URL。
- 原始赛事 ID、群 ID、分享票据、地理位置。
- 比赛名称、球员姓名、反馈正文、错误堆栈中的用户内容。
- 任意自由文本或可反推出个人身份的组合字段。

`anonymousInstallId` 必须由客户端随机生成，仅用于事件去重和粗粒度留存；云端只保存其不可逆摘要。不得在云端把它与 `OPENID` 建表关联。

### 默认关闭

- 客户端配置默认 `enabled: false`，禁用时只保留现有 `console.info + wx.reportEvent` 行为，不调用自建云函数。
- 云函数也必须有独立 server-side 开关；环境变量缺失时视为关闭。
- 关闭状态收到请求时返回稳定的非阻断结果，例如 `ok=true`、`code=EVENT_PIPELINE_DISABLED`、`state=disabled`，`data` 中计数均为 0。
- 本任务完成时不得把任一开关改为开启。

### 幂等与写入

- 云端用匿名摘要与 `eventId` 生成稳定文档键，同一事件重复批次只写一次。
- 部分重复不应使整批失败；返回 accepted、deduped、rejected 三类计数。
- 非法事件逐条拒绝并给出机器可读原因，不回显敏感 payload。
- 服务端时间作为 `receivedAt`，客户端时间只作为受范围校验的 `occurredAtMs`。
- 任意数据库失败都返回稳定失败状态，不把 SDK 原始异常结构暴露给客户端。

建议成功响应：

```js
{
  ok: true,
  code: 'PRODUCT_EVENTS_ACCEPTED',
  message: '事件已接收',
  state: 'accepted',
  traceId: '...',
  data: {
    accepted: 0,
    deduped: 0,
    rejected: 0
  }
}
```

## 允许修改

- `miniprogram/core/growthTracker.js`：在保持原有行为的前提下接入默认关闭的 transport。
- 新增 `miniprogram/core/productEventQueue.js` 或职责等价的纯模块。
- 新增独立配置，例如 `miniprogram/config/productEvents.js`，默认关闭。
- 新增独立云函数 `cloudfunctions/reportProductEvents/` 及必要的 index、logic、package/config 文件。
- 为新云函数通过仓库同步机制生成其 `lib/*`；不得手工修改模板生成文件作为源头。
- 新增协议、队列、云函数、幂等、匿名与契约测试。
- 如确有需要，可最小补充事件字典文档，但不得改动业务页面。

## 明确禁止

Phase A 不得修改以下文件或目录中的业务实现：

- `cloudfunctions/startTournament/**`
- `cloudfunctions/submitScore/**`
- `cloudfunctions/updateSettings/**`
- `cloudfunctions/cloneTournament/**`
- `cloudfunctions/createTournament/**`
- `cloudfunctions/joinTournament/**`
- 任何现有页面中的 `growthTracker.track(...)` 调用点
- `miniprogram/core/cloud.js` 的全局错误与重试语义
- `miniprogram/permission/permission.js`
- `scripts/*common.template.js`，除非只是为新云函数使用现有模板同步且无需改模板源码

同时禁止：

- 开启客户端或服务端开关。
- 创建真实 collection、写真实事件或回填历史数据。
- 采集 PII、自由文本、原始赛事 ID 或原始异常 payload。
- 增加 UI、文案、弹窗、导航、订阅消息或后台页面。
- 把埋点失败变成业务失败。

## 测试先行清单

1. 默认关闭：不会调用自建云函数，原 `console.info + wx.reportEvent` 行为保持。
2. allowlist：非法事件名和非法属性被拒绝。
3. PII 防线：危险键、原始 ID、URL、自由文本不会进入请求或存储。
4. 队列：批量上限、稳定 eventId、成功删除、失败保留、指数退避和容量上限。
5. 幂等：相同事件跨批次重试只写一次，返回 deduped 计数。
6. 部分失败：单条非法不影响其他合法事件。
7. 契约：enabled、disabled、invalid、database failure 均返回稳定 shape。
8. 非阻断：同步异常、Promise rejection、无 `wx.cloud` 环境都不影响业务调用者。

聚焦回归至少包括：

```powershell
node --test tests/growth-tracker.test.js tests/product-event-queue.test.js tests/reportProductEvents.logic.test.js tests/reportProductEvents.index.test.js tests/cloud-response-contract-write-actions.test.js tests/cloud-db-write-shape.test.js
npm run check:cloud-common
npm run verify:full
```

新增测试文件名可以按仓库命名规范调整，但覆盖项不可减少。

## 交付与验收

- 一份明确的事件名称和属性 allowlist。
- 默认关闭的客户端队列和 transport。
- 默认关闭的独立 `reportProductEvents` 云函数。
- 匿名、无 PII、幂等、批量、部分失败和非阻断测试全部通过。
- 现有业务页面、热业务云函数及其结果契约零差异。
- `npm run check:cloud-common` 与 `npm run verify:full` 通过。
- 最终汇报说明新云函数未来需要部署，但本任务不部署、不建真实 collection、不启用开关。
- 不提交、不 push、不创建 PR、不 preview/upload、不发布、不部署云函数、不写真实云数据。

## Phase B 明确后置

以下事项另开任务，不得在 Phase A 顺手完成：

- 在 `createTournament`、`joinTournament`、`startTournament`、`submitScore`、`updateSettings`、`cloneTournament` 写服务端关键成功事件。
- 业务日聚合、漏斗、cohort、排阵性能聚合。
- 运营后台、告警、数据保留策略和线上开关启用。
- 历史赛事回填。

## 可复制启动提示词

```text
在 D:\projects(WIN)\badminton-miniapp 开始任务 04「产品事件管道 Phase A」。

先完整阅读 AGENTS.md、docs/tasks/current.md、docs/context/architecture.md、docs/tasks/parallel-development/04-product-event-pipeline.md，并使用 weapp-regression-guard 与 weapp-cloud-contract-audit。先核对 git status，保留现有改动，禁止 reset/clean/checkout 覆盖。

本任务状态为 ready，可以直接测试先行实现，但范围必须隔离：只允许改 growthTracker、增加默认关闭的客户端事件队列/配置、增加独立 reportProductEvents 云函数及测试。客户端和云端开关都保持 false；匿名、无 PII、不发送原始 tournamentId；eventId 稳定、批量有上限、服务端幂等、部分失败可报告，所有异常都不得阻断业务。

严格禁止修改 startTournament、submitScore、updateSettings、cloneTournament、createTournament、joinTournament、现有页面埋点调用、core/cloud.js 全局语义或 permission；不得接入任何服务端热业务事件。稳定返回契约保持 ok/code/message/state/traceId/data。

完成后运行聚焦测试、npm run check:cloud-common、npm run verify:full。不要 commit、push、创建 PR、preview/upload、发布、部署云函数、创建真实 collection、启用开关或写真实云数据；最终按“变更、测试、未测试、风险”汇报，并明确 Phase B 后置项。
```
