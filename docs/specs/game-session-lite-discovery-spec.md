# 组局 Lite discovery / spec

> 状态：`discovery_complete_pending_product_approval`
> 规格日期：2026-07-16
> 开发基线：`70845c1`（统一 docs checkpoint，来源于 `codex/ui-optimization-v2@743b016`）
> 产品差异基线：线上 `master@5813ffc`
> 本文只定义未来契约，不授权创建页面、云函数、集合、索引、配置或真实数据。

## 1. 结论

组局 Lite 应是独立于 `tournaments` 的业务域，以 `game_sessions` 保存组局本身，以 `session_signups` 保存每个用户唯一且可恢复的报名记录。首版只解决群内工具型组局：发起、显式报名、取消、满员候补、确定性补位、主理人确认到场、把到场成员原子转换为赛事草稿，以及按整数分计算 AA。两个新集合必须是 cloud-only：小程序端 SDK 默认拒绝直接读写，所有读取都经过按角色裁剪的云端投影。

首版不做公共流量分发，也不把赛事草稿当报名容器。分享入口只负责展示，任何 `intent`、`scene` 或 `fromShare` 参数都不能自动报名或充当权限凭证。所有写身份均由云端 `OPENID` 决定，客户端不得上传主理人或参与者身份。

本文给出可实施的推荐默认值，但页面、文案、CTA、导航、分享、默认行为、隐私说明及下文标记为“待批准”的产品选择，在用户逐点批准前均不得实现。

## 2. 范围与非目标

### 2.1 Lite 范围

- 已登录用户创建、编辑、开放、关闭、完成或取消一场组局。
- 用户从 `sessionId` 分享落地页浏览后，主动点击唯一报名 CTA。
- 有名额时成为 `confirmed`；满员时自动进入 `waitlisted`。
- 用户取消自己的有效报名；确认用户释放名额后，事务内提升最早有效候补。
- 主理人把确认报名者标记为 `present`、`absent` 或恢复为 `unknown`。
- 主理人基于服务端重新读取的 `present` 名单，只创建一次 `multi_rotate` 自定义赛事草稿。
- 保存场地、用球和其他费用的整数分计划；按实际到场人数做确定性均分，只计算、不收款。

### 2.2 明确排除

- 附近局、地图找局、精确经纬度、后台持续定位。
- 自动水平匹配、陌生人推荐、公共广场、跨群流量分发。
- 聊天、私信、手机号交换、通讯录或群成员读取。
- 在线支付、代收、提现、退款、催款、支付结果或欠款账本。
- 信誉分、公开评价、公开排名、举报治理系统。
- 周期组局、搭子匹配、场馆库存、商业场馆 SaaS。
- 用预留字段、隐藏入口或内部开关提前实现上述能力。

## 3. 与现有赛事契约的边界

只读审计确认：

- 现有赛事深链的 canonical 参数是 `tournamentId`，分享落地不会自动加入；组局必须另建 `sessionId` 解析器和落地适配，不能扩写 `tournamentEntry` 后混用通用 `id`。
- `createTournament` 会把云端 `OPENID` 同时写成 `creatorId` 和首位 player；组局转换若直接调用它，会在主理人未到场时违反“名单只含 present 成员”。
- `cloneTournament` 会把创建者以外的成员重映射为 guest，并复制赛事配置，不适合把已认证到场成员转为新赛事。
- `joinTournament` 把名单嵌在 tournament 文档内，满员直接失败，没有候补、取消、到场和费用语义；唯一昵称 guest 认领也不能作为人员或 AA 身份依据。
- 赛事权限是 `creatorId` / participant / score editor；组局必须使用独立的 organizer、self signup owner 和 attendee 权限，不能让“赛事参与者可录分”外溢成组局管理权。
- 可复用的仅是机制：云端身份、serverDate、结构化结果、事务冲突、请求日志、保留键检查、赛事草稿字段 builder 和客户端显式写入防重模式。

因此，未来“转赛事”应是专用原子命令：同一真实事务内读取 session 与 present signups、创建 tournament、回写 `convertedTournamentId` 和幂等日志；不得由一个云函数调用另一个云函数，也不得串联 `createTournament -> addPlayers`。

## 4. 术语和全局不变量

- **主理人**：`game_sessions.organizerOpenid` 对应的云端身份；不等于一定到场的参与者。
- **有效报名**：父 session 尚未到达 `startsAt`、未进入终态，且 signup 为 `confirmed` 或 `waitlisted`；开局后仍存储的 waitlisted 记录只用于审计，其派生结果是 `not_admitted`，不再是有效报名。
- **确认报名**：占用容量的 `confirmed` signup。
- **候补**：不占用容量、按 `queueNo` 排队的 `waitlisted` signup。
- **到场**：只有 `confirmed` signup 才能拥有 `present` / `absent`；默认始终是 `unknown`。
- **绝对时间**：数据库保存 UTC instant，API 使用 ISO 8601；所有截止判断使用服务端时间，客户端时区只负责展示。
- **整数分**：费用只接受 `Number.isSafeInteger(value) && value >= 0` 的分值，禁止浮点元参与任何中间计算。

必须始终成立：

```text
0 <= confirmedCount <= capacity
0 <= waitlistedCount
0 <= presentCount <= confirmedCount
confirmedCount = count(signupStatus == confirmed)
waitlistedCount = count(signupStatus == waitlisted)
presentCount = count(signupStatus == confirmed && attendanceStatus == present)
nextQueueNo > max(all currently stored queueNo in this session)，且 nextQueueNo 永不降低
cancelled/waitlisted signup 的 attendanceStatus == unknown
convertedTournamentId 一旦非空便不可替换
convertedTournamentId 非空 => status == completed && attendanceFrozenVersion 非空
convertedTournamentId/sourceSessionRef 未产生时字段必须缺省，禁止写 null 或空字符串
signupDeadlineAt <= startsAt
status 属于 completed/cancelled => retentionUntil 为非空 UTC instant
deletionState 属于 deleting/redacted => status 属于 completed/cancelled
deletionState == redacted => convertedTournamentId 非空，且仅保留第 5.5 节 tombstone 白名单字段
```

## 5. 领域模型

### 5.1 `game_sessions`

| 字段 | 类型与约束 | 语义 |
|---|---|---|
| `_id` | 内部文档 ID | 只在云端关联，不进入页面、分享或分析事件 |
| `sessionId` | 服务端 CSPRNG 生成 128 bit 随机值并编码为 22 字符无 padding base64url | 唯一且不可枚举的公共定位符；不得复用 `activityId` / `tournamentId`，首版不可轮换且不授予权限 |
| `organizerOpenid` | 非空字符串，云端写入 | 权威主理人身份；任何 API 投影均不向客户端返回该值 |
| `creationKeyDigest` | 服务端 keyed digest | `operator + create clientRequestId` 的唯一领域锚点；不投影、不进日志明文，防 request log 清理后重复创建 |
| `creationPayloadMac` | 服务端 keyed MAC | 创建请求 canonical payload 的持久锚点；与 creationKeyDigest 一起区分同 key 同/异 payload，不投影 |
| `title` | 规范化纯文本，建议 1–40 个 Unicode 字符 | 不允许控制字符、换行或联系方式 |
| `startsAt` | UTC instant | 开局时间 |
| `signupDeadlineAt` | UTC instant，`<= startsAt` | 报名截止；行为以服务端时间为准 |
| `cityText` | 规范化纯文本，建议 0–20 字 | 城市级文本，不存定位权限或坐标 |
| `venueText` | 规范化纯文本，建议 0–80 字 | 场馆说明；禁止借此收集联系方式 |
| `capacity` | 正整数，候选上限 64，待批准 | 确认报名上限；不得降到 `confirmedCount` 以下 |
| `levelTags` | 0–3 个已批准枚举 | 仅展示，不用于匹配或推荐；禁止自由文本标签 |
| `status` | `draft/open/closed/completed/cancelled` | 组局生命周期，不复用赛事状态机 |
| `statusChangedAt` | serverDate | 最近一次状态变化时间 |
| `openedAt/closedAt/completedAt/cancelledAt` | serverDate 或缺省 | 对应里程碑；重复操作不改写原始时间 |
| `cancelReasonCode` | 有限枚举或缺省 | 首版不保存自由文本取消原因 |
| `expensePlan` | 见下表 | AA 的唯一费用输入，不代表支付或债务 |
| `confirmedCount` | 非负整数 | 事务内派生快照，真实清单以 signups 为准 |
| `waitlistedCount` | 非负整数 | 同上 |
| `presentCount` | 非负整数 | 同上 |
| `nextQueueNo` | 正整数，初始 1 | 事务内分配后单调增加，永不回退或复用 |
| `attendanceFinalizedAt` | serverDate 或缺省 | 主理人冻结到场名单的时间；非空后 signup/attendance 不可再变 |
| `attendanceFrozenVersion` | 正整数或缺省 | 冻结后的 session 版本；转赛事和 AA 客户端以 `expectedAttendanceFrozenVersion` 回传并校验 |
| `convertedTournamentId` | tournament ID；未转换时字段缺省 | 转赛事语义幂等锚点；成功后不可替换；禁止用 `null`/`''` 占位 |
| `convertedAt` | serverDate 或缺省 | 首次转换成功时间 |
| `conversionSourceVersion` | 正整数或缺省 | 转换时 session 版本，便于审计名单快照 |
| `version` | 正整数，初始 1 | 每次真实 session 变更递增；no-op/dedupe 不递增 |
| `countersRebuiltAt` | serverDate 或缺省 | 最近一次派生计数修复时间 |
| `retentionUntil` | UTC instant；仅非终态可缺省 | 进入 `completed/cancelled` 的同一事务必须写入 |
| `deletionState` | `active/deleting/redacted`，默认 active | 与生命周期正交的清理状态；deleting 起禁止新业务命令，redacted 仅用于已转换最小 tombstone |
| `deletionRequestedAt` | serverDate 或缺省 | 原子认领提前删除/保留期清理的时间 |
| `createdAt/updatedAt` | serverDate | 服务端时间 |

`expensePlan`：

| 字段 | 约束 |
|---|---|
| `courtFeeCents` | 非负安全整数分 |
| `shuttleFeeCents` | 非负安全整数分 |
| `otherFeeCents` | 非负安全整数分 |

三项与总额都必须是安全整数；未来服务端还应设置单项和总额风控上限，但具体上限属于产品/风控审批项，不在客户端硬编码。

首版候选额度为 `capacity <= 64`、同时有效的 waitlisted 不超过 128、单用户同时有效的 session 报名数和创建数受服务端限额约束；具体阈值全部待批准。达到候补上限必须稳定拒绝，不能写入一个不计数的 signup。`queueNo/nextQueueNo/signupCycle/version` 也必须是正安全整数；任何字段耗尽或加一溢出时 fail closed。

### 5.2 `session_signups`

| 字段 | 类型与约束 | 语义 |
|---|---|---|
| `_id` | 服务端生成的固定长度 base64url 文档 ID | 管理和返回使用的 opaque signup ID；相同 queueNo 的最终排序按 ASCII binary 升序 |
| `sessionId` | 非空 session ID | 与 `participantOpenid` 组成唯一约束 |
| `participantOpenid` | 非空字符串，云端写入 | 权威本人身份；任何客户端投影不得返回 |
| `signupStatus` | `confirmed/waitlisted/cancelled` | 一人一条稳定记录，通过状态迁移而非删除 |
| `attendanceStatus` | `unknown/present/absent` | 默认 `unknown`；仅主理人可修改有效确认报名 |
| `queueNo` | 正整数 | 每个有效报名周期固定；取消后重新报名分配新的队尾号 |
| `signupCycle` | 正整数，初始 1 | 每次 `cancelled -> active` 递增，阻止迟到的旧取消请求误伤新周期 |
| `profileSnapshot` | `{ displayName }` | Lite 首版只保存昵称；不保存、托管或复制头像 URL/fileID/asset ID。头像若未来立项，必须先另写资产删除、引用计数、TTL、孤儿清理和赛事复制白名单 |
| `confirmedAt/waitlistedAt/cancelledAt` | serverDate 或缺省 | 最近一次进入相应状态的时间 |
| `attendanceUpdatedAt` | serverDate 或缺省 | 最近一次到场更新 |
| `version` | 正整数，初始 1 | 每次真实 signup 变更递增；no-op/dedupe 不递增 |
| `createdAt/updatedAt` | serverDate | 服务端时间 |

同一用户取消后重新报名时更新原记录：`signupCycle += 1`、分配新的 `queueNo`、`attendanceStatus = unknown`，再根据当时容量进入 `confirmed` 或 `waitlisted`。旧 `queueNo` 不再代表当前周期优先级，且 `nextQueueNo` 保证重报名永远排在当前队尾。

### 5.3 索引计划（仅规格，不创建）

| 集合 | 索引 | 用途 |
|---|---|---|
| `game_sessions` | `_id` 默认索引 | 云端内部关联 |
| `game_sessions` | UNIQUE sparse `(sessionId)` | live session 分享定位；redacted tombstone 字段缺省，需验证多个缺省值可共存 |
| `game_sessions` | UNIQUE `(creationKeyDigest)` | live session 创建领域幂等；redacted tombstone 继续保留不可逆 digest，阻止旧 create key 复活资源 |
| `game_sessions` | `(organizerOpenid, updatedAt DESC)` | 主理人自己的组局 |
| `game_sessions` | `(status, retentionUntil)` | 终态保留清理；不用于公共广场 |
| `game_sessions` | UNIQUE sparse `(convertedTournamentId)` | 防止同一赛事被多个 session 链接；未转换时字段必须完全缺省，并在真实云库验证 null/缺省行为 |
| `game_sessions` | UNIQUE sparse `(sessionLookupDigest)` | 仅已转换且提前删除的 tombstone 定位；live session 字段缺省 |
| `session_signups` | UNIQUE `(sessionId, participantOpenid)` | 一人一局一条稳定记录 |
| `session_signups` | `(sessionId, signupStatus, queueNo ASC, _id ASC)` | 确定性候补提升与计数重建 |
| `session_signups` | `(sessionId, attendanceStatus, queueNo ASC, _id ASC)` | 到场名单、转换与 AA |
| `session_signups` | `(participantOpenid, updatedAt DESC)` | 用户自己的报名记录 |
| `tournaments`（未来转换字段） | UNIQUE sparse `(sourceSessionRef)` | 来源 session 的反向幂等锚点；普通赛事字段缺省，真实云库需验证 |

不创建地理索引、联系人索引、公开发现索引或自由文本搜索索引。

### 5.4 API 投影

`game_sessions` 与 `session_signups` 的数据库权限默认拒绝小程序端 SDK 的直接读、写、watch 和聚合；仅受审计的云函数服务身份可访问。数据库文档不得直接透传：

- 匿名/普通查看者：`draft` 一律按不存在处理；其余状态仅返回逐状态公共字段白名单、有效状态和人数计数，默认不返回报名人姓名或头像。
- 本人：额外返回自己的 signup ID、状态、到场状态、版本和本人 AA 行。
- 主理人：返回管理所需 signup ID、最小资料快照、报名/到场状态和版本；仍不返回 openid。
- 转赛事时的 openid 只在服务端解析为已认证 roster 身份，再经 server-only tournament identity adapter 映射；不得经过客户端参数、响应或页面 data。

候选公共字段白名单（待逐点批准）：

- `open/closed`：`sessionId/title/startsAt/cityText/venueText/levelTags/status/capacity/confirmedCount/waitlistedCount`；费用、取消原因、名单和内部版本不公开。
- `completed/cancelled`：`sessionId/title/startsAt/cityText/status`；默认隐藏场馆、候补人数、费用和取消原因细节，避免终态链接在 180 天内持续暴露活动地点。
- 本人投影额外返回服务端派生的 `effectiveSignupStatus`：父状态 cancelled 时无论存储值为何都返回 `session_cancelled`；存储为 waitlisted 且已到 `startsAt` 或父状态已 completed 时返回 `not_admitted`；其余返回存储状态。候补位次必须实时按有效候补排序派生为 `waitlistPosition`，不能把 `queueNo` 当实时位次。
- 服务端同时返回 `capabilities`（如 `canSignup/canCancelSelf/canManage/canFinalizeAttendance/canConvert/canViewAllAa`）；客户端不得为了判角色而索取 organizer 或 participant OPENID。

### 5.5 数据保留与删除候选方案（待隐私审批）

- 从未开放且连续 30 天未更新的 `draft`，在确认没有 signup 后硬删除；不能无限保留废弃草稿。
- 到 `startsAt + 30 天` 仍为 `open/closed` 的遗留 session，由受控清理事务转为 `cancelled`（reason=`stale_session`）并写 `retentionUntil`；清理任务不参与报名正确性，失败可安全重试。
- `completed/cancelled` 的 session 与 signups 候选保留 180 天，然后先阻断新读写、按 sessionId 批量删除 signups、最后删除 session；孤儿 signup 扫描必须可重试。
- 报名人请求去标识化时：开局前先按正常权限取消本人报名，再把公开/主理人可见昵称替换为固定占位；隐藏的身份关联为防重复占位保留至 session 清理，不用于画像或分析。终态也允许同样去标识化，且不修改已独立生成的 tournament；该限制必须在确认文案中告知。
- 主理人请求提前删除仅允许终态：未转换时按“阻断新写 -> signups -> session”硬删除；已转换时立即删除 signups，并把 session 原地最小化为 tombstone 至原 `retentionUntil`。tombstone 只保留 `_id/status=completed/deletionState=redacted/sessionLookupDigest/organizerKeyDigest/creationKeyDigest/creationPayloadMac/convertedTournamentId/attendanceFrozenVersion/retentionUntil/version/updatedAt`：四个 digest/MAC 均不可逆且分用途使用独立密钥，原 `sessionId/organizerOpenid` 及标题、地点、费用、计数全部删除。creation anchors 只用于把旧 create key 稳定导向 deletion gate，绝不返回旧 sessionId。公共/非主理人读取统一 not_found；主理人仅可通过服务端计算 lookup/operator digest 重放“查看转换结果”，返回同一 tournamentId，AA 和其他命令均关闭。到期先确认 tournament backlink，再硬删除 tombstone；已转换 tournament 遵循独立保留规则且不级联。这一延迟删除最小 link 的限制需明确告知并批准。
- active 资源的成功 mutation request log 仅保留完整唯一键、keyed payload MAC、opaque resource reference、时间，以及可原样重放的最小安全响应快照 `{ok,code,state,traceId,data:{resource IDs, versions, promotionCount/resourceState}}`；禁止保存标题、场馆、昵称、openid 明文或可离线猜测的普通 hash。其 `retentionUntil` 与关联 session 对齐，不能固定 30 天先删。显式删除是原样重放的唯一例外：认领 deleting 后先以 deletion gate 屏蔽所有旧业务日志；进入 redacted/hard delete 前必须删除这些快照和 create/signup/cancel 等 request log，只保留不含 sessionId/signupId 的 deletion operation log 与 tombstone 转换结果。资源硬删除后请求幂等保证随之结束。创建动作由 live/redacted 资源上的 `creationKeyDigest + creationPayloadMac` 覆盖日志意外缺失，并让 tombstone 稳定拒绝旧 create key。无资源的限流/参数失败诊断候选 TTL 才是 30 天。

## 6. 状态机

### 6.1 Session 状态机

```text
create
  -> draft
draft
  -> open       (主理人开放，字段校验通过)
  -> cancelled  (主理人取消)
open
  -> closed     (主理人关闭或截止时间到达)
  -> cancelled  (主理人取消)
closed
  -> completed  (主理人确认所有到场状态并冻结)
  -> cancelled  (主理人取消)
completed       (报名/到场生命周期终态；可转赛事，仍可调整 expensePlan 后重算 AA)
cancelled       (终态；只读取消落地，不再计算 AA 或转换)
```

规则：

- 正确性不依赖定时任务。任何读写都先以 `status == open && serverNow < signupDeadlineAt && serverNow < startsAt` 计算 `signupAccepting` 与 `effectiveStatus`；截止后即使存储状态尚未异步归一为 `closed`，也必须把有效状态视为 `closed` 并拒绝报名。下一次合法 mutation 在同一事务先把持久状态归一为 `closed`，再执行该动作。
- 首版推荐禁止 `closed -> open`，避免候补、到场和分享语义回滚；是否允许重开仍列入审批矩阵，未批准前按禁止处理。
- `closed -> completed` 不是按时钟自动发生，且只允许 `serverNow >= startsAt`。主理人必须把所有 confirmed signup 明确标为 `present/absent`，再执行冻结；仍有 `unknown` 时稳定拒绝。
- `completed/cancelled` 不允许生命周期回退。完成前必须由 UI 明确确认，避免误触；修正方案需另行立项，不在 Lite 暗加回退。
- 转赛事只允许从 `completed` 发起，并使用 `attendanceFrozenVersion`；转换成功不再改变生命周期。
- completed 后不能取消 session，也不会删除、重置或取消 linked tournament。
- 创建 session 时必须满足 `serverNow < signupDeadlineAt <= startsAt`；开放时再次校验两者仍在未来。`startsAt/signupDeadlineAt` 只可在 `draft`，或在尚未到达当前截止时间的 `open` 中修改；新值仍须在服务端当前时间之后。一旦有效状态为 closed，禁止延后时间形成隐式重开。
- `title/cityText/venueText/levelTags` 只可在 `draft/open/closed` 且开局前编辑；capacity 可在同一窗口调整并按候补规则原子补位；`expensePlan` 可在 `draft/open/closed/completed` 编辑，以支持赛后录入实际费用。

删除是与生命周期正交的受控子状态：

```text
active -> deleting -> hard deleted                 (未转换终态)
active -> deleting -> redacted -> hard deleted     (已转换终态)
```

只有终态可从 active 进入 deleting。认领删除必须在一个事务中校验 organizer/受控清理身份、`expectedSessionVersion`，写 `deletionState=deleting`、`deletionRequestedAt` 并递增 version；从该提交开始，转换、AA、费用更新和所有 signup/attendance 命令 fail closed。转换事务与删除认领都写同一 session version：转换先提交时删除流程看到 converted link 并走 redacted；删除先提交时转换回滚并返回 `SESSION_DELETING`。批量删 signups 失败可重试，不能把 deleting 恢复为 active。

### 6.2 Signup 状态机

```text
none
  -> confirmed   (有名额)
  -> waitlisted  (满员)
confirmed
  -> cancelled   (本人取消，可能原子提升最早候补)
waitlisted
  -> confirmed   (释放/增加名额时系统原子提升)
  -> cancelled   (本人取消)
cancelled
  -> confirmed   (重新报名且有名额；新 signupCycle、新 queueNo)
  -> waitlisted  (重新报名且满员；新 signupCycle、新 queueNo)
```

规则：

- 已是 `confirmed` 或 `waitlisted` 的用户重复报名，返回原记录 `deduped`，不刷新 queue、计数或到场状态。
- `cancelled -> active` 仅在 `signupAccepting` 时允许，且必须排到当前队尾。
- 本人可在 `startsAt` 前取消有效报名，即使 session 已手动关闭或到达报名截止；开局后由主理人标记 absent，不再用取消改写名单。开局时仍为 waitlisted 的记录不 fan-out 改写，但本人投影返回派生 `not_admitted`，不再算有效报名或可取消记录。
- 确认用户取消后，在同一事务中提升 `(queueNo ASC, _id ASC)` 的最早候补；报名关闭不停止已有候补的补位，但 `startsAt` 到达后停止补位。
- 候补取消只减少 `waitlistedCount`；确认用户取消且无人候补时才减少 `confirmedCount`。
- 增加 capacity 时，开局前按同一顺序原子提升已有候补；降低 capacity 不得低于 `confirmedCount`，也绝不自动降级确认用户。
- session 取消不做无界 fan-out 更新。signups 保留取消瞬间的审计状态，但因父 session 为 `cancelled` 而全部失效，所有后续写均被父状态拦截。

### 6.3 Attendance 子状态机

```text
unknown <-> present
unknown <-> absent
present <-> absent
```

仅主理人可修改，且目标 signup 必须为 `confirmed`，父 session 的有效状态必须为 `closed` 且尚未冻结。同值写入返回 `deduped`；一旦 signup 在开局前取消，attendance 原子重置为 `unknown`。标记 `absent` 不释放报名容量，也不触发候补提升；容量变化只由报名取消或主理人增加 capacity 触发。首版允许主理人在手动关闭后提前整理到场候选，但在 `startsAt` 前冻结按钮必须禁用，提前标记不会剥夺本人取消权。

冻结动作必须满足 `serverNow >= startsAt`，并在同一事务确认所有 confirmed signup 均非 `unknown`，写入 `status=completed`、`attendanceFinalizedAt` 和 `attendanceFrozenVersion`。允许零人到场完成，但 AA 与转赛事分别返回稳定的“无到场者”和“人数不足”错误。冻结后，新 requestId 的 signup、取消、候补、到场或容量命令都必须拒绝；资源仍 active 时，相同 requestId 才可按已提交 request log 原样重放，重复冻结和重复转换按不可变领域锚点返回 deduped；删除 gate 生效后改按第 10.3 节遮蔽。

## 7. 权限矩阵

所有权限由云端重验；客户端权限 helper 只决定展示，不能作为安全边界。

| 操作 | 匿名查看者 | 已登录非成员 | 本人 confirmed/waitlisted | present 成员 | 主理人 |
|---|---:|---:|---:|---:|---:|
| 读取公共组局投影 | 允许（draft 除外） | 允许（draft 除外） | 允许 | 允许 | 允许 |
| 读取自己的 signup | 禁止 | 无记录 | 允许 | 允许 | 若本人也是成员则允许 |
| 创建组局 | 禁止 | 允许 | 允许 | 允许 | 允许 |
| 编辑/开关/冻结到场/取消组局 | 禁止 | 禁止 | 禁止 | 禁止 | 允许 |
| 显式报名 | 禁止 | 允许（开放且资料达标） | deduped | deduped | 仅按本人身份报名，不能代报 |
| 取消报名 | 禁止 | 禁止 | 仅取消自己 | 仅取消自己 | 不能代替别人取消；可取消自己的记录 |
| 查看管理名单 | 禁止 | 禁止 | 禁止 | 禁止 | 允许 |
| 标记到场 | 禁止 | 禁止 | 禁止 | 禁止 | 允许 |
| 转赛事 | 禁止 | 禁止 | 禁止 | 禁止 | 允许 |
| AA aggregate + 自己一行 | 禁止 | 禁止 | absent/unknown 禁止 | 允许 | 允许 |
| AA 全部明细 | 禁止 | 禁止 | 禁止 | 默认禁止，待批准 | 允许 |

补充约束：

- 分享链接只证明用户知道 `sessionId`，不授予管理或报名权限。
- 角色可重叠，最终权限取服务端 capabilities：organizer + present 同时拥有管理权和本人权；organizer 未 present 不获得本人 AA 行；已取消本人仅能读经去标识化的本人结果，不能借旧 signup ID 读取管理资料。
- 主理人不能通过客户端上传 participant openid、present 列表或 AA 人员列表；只能提交 signup ID 与期望版本，服务端再按 session 归属校验。
- 主理人可以不在到场名单中。转赛事时 `creatorId` 仍是主理人，但 `players/playerIds` 必须严格等于 present signups；这要求实施前验证“非参赛 creator”对现有 lobby/start/score/ranking 全链路的兼容性。
- 若兼容性验证失败，只能在“支持非参赛主理人”与“要求主理人先确认到场”之间请用户选择，不能默默把主理人加入名单。

## 8. 统一结果与稳定错误码

### 8.1 Envelope

未来所有云函数结果必须包含：

```js
{
  ok: true | false,
  code: 'STABLE_UPPER_SNAKE_CASE',
  message: '可展示但不可供程序分支依赖的文案',
  state: 'stable_lower_case_state',
  traceId: 'non-empty-trace-id',
  data: {}
}
```

业务字段以 `data` 为 canonical。为兼容现有 `cloud.normalizeCloudResult` 和赛事 core，迁移期可把 `sessionId`、`signupId`、`tournamentId` 镜像在根级，但不得只移动一处而不做契约测试。

### 8.2 `state` 语义

| state | ok | 含义 |
|---|---:|---|
| `created/updated/open/completed/cancelled/calculated` | true | 对应动作产生真实状态变化或计算结果 |
| `confirmed/present/absent` | true | 报名或到场的实际结果 |
| `full` | true | 容量已满，但本次已成功进入 `waitlisted`；`data.signupStatus` 必须为 `waitlisted` |
| `deduped` | true | 相同意图已成功处理或目标状态已满足；返回同一资源，不重复副作用 |
| `invalid` | false | 参数、时间、金额、最小人数或字段组合不合法 |
| `forbidden` | false | 调用者身份无权执行；不得用它代替生命周期关闭 |
| `not_found` | false | session/signup 不存在，或调用者无权区分其存在性 |
| `closed` | true/false | `ok=true` 表示关闭动作成功；`ok=false` 表示报名窗口、开局时间或父状态拒绝该写入 |
| `conflict` | false | 版本过期、事务冲突、相同幂等键携带不同 payload 或不可替换转换结果 |
| `rate_limited` | false | 受控额度或速率已用尽；可按 `data.retryAfterMs` 稍后重试 |
| `limit_reached` | false | 业务容量/候补额度已满，但 session 生命周期本身未必关闭 |
| `unavailable` | false | 服务端事务/存储能力暂不可用；禁止非原子降级 |

### 8.3 稳定 code

| code | state | 场景 |
|---|---|---|
| `SESSION_CREATED` | `created/deduped` | 创建成功或同请求重放 |
| `SESSION_UPDATED` | `updated/deduped` | 编辑、计数修复或费用更新 |
| `SESSION_DELETION_STARTED` | `updated/deduped` | 终态删除/清理已原子认领，后续批次可重试 |
| `SESSION_OPENED` | `open/deduped` | 开放或已开放 |
| `SESSION_CLOSED` | `closed/deduped`（ok=true） | 主理人关闭或已关闭；与失败态由 `ok` 区分 |
| `SESSION_CANCELLED` | `cancelled` | 首次取消成功，或相同 request key 的原结果重放；父状态已 cancelled 的新 key 不 dedupe |
| `AUTH_REQUIRED` | `forbidden` | 写操作缺少有效云端身份 |
| `SESSION_ID_REQUIRED` | `invalid` | 缺少 sessionId |
| `SESSION_NOT_FOUND` | `not_found` | session 不存在或不可见 |
| `SESSION_PERMISSION_DENIED` | `forbidden` | 非主理人执行管理动作 |
| `SESSION_WRITE_CLOSED` | `closed` | 终态或时间窗禁止该写入 |
| `SESSION_VERSION_CONFLICT` | `conflict` | expectedVersion 过期或事务冲突耗尽 |
| `SESSION_COUNTER_DRIFT` | `conflict` | 派生人数与 signup 真值不一致，需先重建 |
| `SESSION_SETTINGS_INVALID` | `invalid` | 标题、时间、容量、标签或费用不合法 |
| `SESSION_PROFILE_INVALID` | `invalid` | 昵称不满足最小资料/安全约束 |
| `SESSION_CONTENT_REJECTED` | `invalid` | 标题、场馆、城市或昵称未通过内容安全检查 |
| `SESSION_RATE_LIMITED` | `rate_limited` | 创建、报名、取消或读取额度已用尽 |
| `SESSION_TRANSACTION_UNAVAILABLE` | `unavailable` | 所需真实事务/查询能力不可用或结果可能被截断 |
| `SESSION_DELETING` | `closed` | session 已原子认领删除/清理，不再接受新业务命令 |
| `CLIENT_REQUEST_ID_REQUIRED` | `invalid` | mutation 缺少 clientRequestId |
| `IDEMPOTENCY_KEY_REUSED` | `conflict` | 同 key 的 canonical payload fingerprint 不同 |
| `SIGNUP_CONFIRMED` | `confirmed` | 获得名额 |
| `SIGNUP_WAITLISTED` | `full` | 满员后成功进入候补 |
| `SESSION_WAITLIST_FULL` | `limit_reached` | 候补达到获批上限，未创建/激活报名记录；不表示 session 生命周期 closed |
| `SIGNUP_DEDUPED` | `deduped` | 已 confirmed/waitlisted，未改变 queue 与计数 |
| `SIGNUP_CLOSED` | `closed` | 未开放、过截止、已开局或父 session 终态 |
| `SIGNUP_NOT_FOUND` | `not_found` | 本人无报名记录或 signup 不属于该 session |
| `SIGNUP_CANCELLED` | `cancelled/deduped` | 首次取消；或父状态仍非终态且开局前，新 key 命中本人已取消记录 |
| `SIGNUP_VERSION_CONFLICT` | `conflict` | 迟到请求命中新 signupCycle/version |
| `ATTENDANCE_UPDATED` | `present/absent/updated/deduped` | 到场更新或 no-op |
| `ATTENDANCE_SIGNUP_INVALID` | `invalid` | 非 confirmed signup 或不支持的目标值 |
| `ATTENDANCE_INCOMPLETE` | `invalid` | 冻结时仍有 confirmed signup 为 unknown |
| `ATTENDANCE_FINALIZED` | `completed/deduped` | 到场名单已冻结或重复冻结 |
| `ATTENDANCE_WRITE_FROZEN` | `closed` | 新意图试图在冻结后修改 signup 或到场 |
| `PRESENT_MEMBER_MINIMUM_REQUIRED` | `invalid` | present 少于当前多人转最小人数 4 |
| `PRESENT_MEMBER_MAXIMUM_EXCEEDED` | `invalid` | present 超过当前多人转上限 30；组局本身仍保持 completed |
| `SESSION_TOURNAMENT_CONVERTED` | `created/deduped` | 首次转换或返回同一 tournamentId |
| `SESSION_TOURNAMENT_CONFLICT` | `conflict` | session link、request log 与已创建 tournament 不一致，或名单快照事务冲突 |
| `AA_EXPENSE_INVALID` | `invalid` | 非整数分、负数或总额溢出 |
| `AA_NO_PRESENT_MEMBERS` | `invalid` | 没有 present 成员，不能均分 |
| `AA_CALCULATED` | `calculated` | 纯计算成功 |

`SESSION_CLOSED` 的成功结果允许 `state=closed`；失败的报名关闭也使用 `state=closed`，调用方必须先判断 `ok` 再判断 `state`，不能仅按 state 推断成功。

## 9. 操作契约

| 操作 | 调用者与前置状态 | 幂等 / 版本 | 原子边界 | 成功结果 |
|---|---|---|---|---|
| 创建组局 | 已登录；字段合法且 `serverNow < deadline <= startsAt` | 必填 `clientRequestId`；完整 key 使用 scope=`create_session`、subjectKey=`creationKeyDigest`、operatorDigest；payload MAC + 唯一 creationKeyDigest/creationPayloadMac | session + request log，同一真实事务；禁止非事务 fallback | `SESSION_CREATED` + 同一 `sessionId` |
| 编辑组局/费用 | 主理人；`deletionState=active`；字段对应的可编辑状态；completed 仅允许 expensePlan；有效 closed 后不得延后时间 | `clientRequestId` + `expectedSessionVersion`；相同 key 不同 payload 冲突 | session + affected signups + counters + request log 同一真实事务；capacity 提升任一步失败全部回滚 | `SESSION_UPDATED` + 新 version + promotionCount |
| 开放/关闭/取消 | 主理人；`deletionState=active`；合法状态边；开放时两个时间仍在未来 | `clientRequestId` + `expectedSessionVersion`；open/closed 非终态目标已满足可 dedupe；cancelled 新 key 拒绝 | session + request log；终态同事务写 retentionUntil，不批量改 signups | 稳定状态 code + effectiveStatus |
| 报名 | `deletionState=active`；已登录本人；`signupAccepting`；最小资料通过 | `clientRequestId`；唯一 `(sessionId, participantOpenid)`；活跃记录状态式 dedupe | session + 本人 signup + request log；读取/递增 nextQueueNo 和计数 | `SIGNUP_CONFIRMED` 或 `SIGNUP_WAITLISTED` |
| 取消报名 | `deletionState=active`；本人；有效报名；`startsAt` 前 | `clientRequestId` + `expectedSignupVersion` + `expectedSignupCycle` | session + 本人 signup + 最早候补 signup + request log | `SIGNUP_CANCELLED` + 是否发生 promotion；不向取消者泄露被提升者资料 |
| 更新到场 | `deletionState=active`；主理人；目标为 confirmed；父有效状态 closed 且未冻结 | `clientRequestId` + session/signup 期望版本 | session presentCount/version + signup attendance/version + request log | `ATTENDANCE_UPDATED` + 新版本 |
| 冻结到场 | `deletionState=active`；主理人；父有效状态 closed；`serverNow >= startsAt`；所有 confirmed 非 unknown | `clientRequestId` + `expectedSessionVersion`；重复冻结 deduped | 必要时先归一 closed，再与权威 confirmed signups/request log 同一真实事务提交 | `ATTENDANCE_FINALIZED` + attendanceFrozenVersion |
| 转赛事 | `deletionState=active`；主理人；父状态 completed；冻结的 present 为 4–30 | 必填 `clientRequestId`、`expectedSessionVersion`、`expectedAttendanceFrozenVersion`；冻结版本 + backlink + convertedTournamentId 三锚点 | session + 权威 present signups + tournament + request log，同一真实事务 | `SESSION_TOURNAMENT_CONVERTED` + 永远相同的 tournamentId |
| AA 计算 | `deletionState=active`；主理人或 present 本人；父状态 completed | 纯读无幂等日志；必填 `expectedAttendanceFrozenVersion`，可带 `expectedSessionVersion` 防止展示旧费用 | 同一一致性快照读取 session + 冻结的 present signups；不写 obligation/ledger | `AA_CALCULATED` + aggregate + 按权限裁剪的 lines |
| 计数重建 | 仅受控服务端维护路径；无公开 CTA/客户端 endpoint | 内部 `operationId` + `baseVersion`；相同聚合重放无副作用 | 有界完整读取全部 signups 后，事务重读 session；分页/查询截断即 unavailable | `SESSION_UPDATED/deduped` + rebuilt counters/version |
| 提前删除/保留清理 | 主理人终态请求，或受控 TTL worker | `clientRequestId/operationId` + expectedSessionVersion；deleting/redacted 领域锚点 | 第一事务只认领 deleting/version 并提交 request log；之后可重试批量删 signups，最终 hard delete 或写 redacted tombstone | 接受时 `SESSION_DELETION_STARTED`；随后业务 API `SESSION_DELETING` 或遮蔽 not_found |

所有 mutation 的 `clientRequestId` 必须由客户端在一次用户意图开始时生成，并在网络/超时重试时复用。客户端 `actionGuard` 只防双击，不能返回伪成功，也不能代替服务端幂等。

### 9.1 转赛事字段映射

转换命令的客户端输入只允许 `sessionId`、`clientRequestId`、`expectedSessionVersion`、`expectedAttendanceFrozenVersion`；不得上传 organizer、present IDs、player IDs、费用或任意赛事字段。事务内按 `(queueNo ASC, _id ASC)` 完整读取权威 present signups，校验人数为当前多人转支持的 4–30 人，并通过届时统一的 tournament draft builder 生成：

- tournament `name` 来源于规范化 session title；player displayName 原样规范化，允许不同身份同名，不按姓名去重、改名或追加后缀。
- creator 身份来自云端主理人，roster 严格来自 present signups，均为已认证 `user`，主理人未 present 时不自动加入。身份经 server-only tournament identity adapter 映射；不得把 participant OPENID 放入响应、页面 data 或分享参数。
- `mode=multi_rotate`、`presetKey=custom`、`status=draft`、`settingsConfigured=false`、`totalMatches=0`、`courts=0`。
- rules 使用届时 `createTournament` 的自定义草稿默认值；`rounds/rankings` 为空，调度、公平性和统计字段按统一 builder 初始化，`version=1`。
- session 的 expense、候补、attendance、queue 和隐私字段不得复制进 tournament。
- tournament 同时写不可变、server-only 的 `sourceSessionRef`（内部 session `_id`，未转换时字段缺省）并施加唯一约束；同一事务再写回唯一 `convertedTournamentId`、`convertedAt`、`conversionSourceVersion`。`conversionSourceVersion` 明确记录事务读取的转换前 session version，提交后 session version 再递增。
- 任何已有非空 link 都返回同一 ID，只有 link/log/resource/backlink 自相矛盾时才报 `SESSION_TOURNAMENT_CONFLICT`。现有赛事同步会把以 OPENID 为 player id 的完整文档放入页面 data，因此在完成“服务端身份映射 + 客户端安全投影”并通过回归前，转换实现属于阻断状态。
- 现有 `deleteTournament` 会硬删除资源，与不可替换 link 冲突。推荐候选是：session 来源赛事只能做保留 `_id/sourceSessionRef` 的 tombstone 删除；转换重试仍返回同一 tournamentId 和 `resourceState=deleted`，绝不创建第二场。是否采用该删除保护必须在 Phase 0 逐点批准并在 Phase 2 先完成，否则不得上线转换。

## 10. 并发、幂等与计数修复

### 10.1 并发争最后名额

1. 事务读取 session、本人唯一 signup，并以有界权威查询核对 confirmed/waitlisted 真值与 counters；查询不完整即 fail closed。
2. 以服务端时间验证 `signupAccepting`，并检查本人/组局额度。
3. 若 confirmed 已满且权威 waitlisted 已达到获批上限，返回 `SESSION_WAITLIST_FULL`；不得创建/激活 signup，不递增 cycle、queue 或 counters。
4. 只有确定会创建/激活报名后，才从 session 取得当前 `nextQueueNo` 并在安全整数范围内递增。
5. 若权威 confirmed 数量 `< capacity`，写 `confirmed`；否则写 `waitlisted`。
6. 同一事务更新 counters、session version、signup version 和 request log。
7. 两个请求争同一确认名额或最后一个候补位时都写同一 session 热点；只能一个事务提交。另一请求在事务回调完整重跑后进入 waitlist、返回 waitlist full，或重试耗尽返回 `SESSION_VERSION_CONFLICT`，绝不能超额。

唯一索引负责同用户去重，session 文档的事务冲突负责容量串行化；二者缺一不可。

### 10.2 取消与补位

确认用户取消的事务顺序：

1. 校验父 session、本人身份、signup version/cycle 和开局时间。
2. 查询最早 `waitlisted`：`queueNo ASC, _id ASC, limit 1`。
3. 本人改为 `cancelled`，attendance 重置 `unknown`。
4. 若存在候补，将其改为 `confirmed`；`confirmedCount` 不变、`waitlistedCount -= 1`。
5. 若无候补，`confirmedCount -= 1`。
6. 若取消者原为 present，`presentCount -= 1`。
7. 原子提交所有文档和 request log。

并发取消、报名和 capacity 调整都必须触碰同一 session 文档，因此提交顺序是唯一可观察顺序。补位始终由 queue 排序决定，而不是昵称、请求到达客户端的时间或 openid。

### 10.3 双层幂等

- **请求幂等**：`scope + subjectKey + operatorDigest + clientRequestId` 构成完整唯一键，日志保存 canonical payload keyed MAC 和最小安全响应快照。同 key 同 payload 返回首次结果；同 key 不同 payload 在关联资源/日志保留期内返回 `IDEMPOTENCY_KEY_REUSED/conflict`。create 的 `subjectKey=creationKeyDigest`；其余 session 命令使用内部 session `_id`，signup 子资源由 scope/payload 进一步绑定。
- **领域幂等**：唯一 signup、目标状态 no-op、以及不可替换的 `convertedTournamentId` 保证即使客户端错误地产生新 requestId，也不会重复占位、重复取消或重复创建 tournament。
- request log 只有在业务事务提交时才能标记 succeeded；不得先写成功日志再做业务写。
- 事务能力缺失必须 fail closed，不允许沿用 `runTransactionCompat` 的非原子降级。
- timeout/network 可用原 key 重试；`conflict` 必须刷新 authoritative version 后由用户或客户端显式重试。

所有 mutation 固定按以下优先级判定，客户端与云端测试不得各自猜测：

1. 校验参数形状、云端身份并以不泄露存在性的方式定位 live subject 或 keyed-digest tombstone；create 也必须先计算 creationKeyDigest 查询 live/redacted 记录。
2. **删除隐私 gate（普通原样重放的显式例外）**：若 `deletionState=deleting/redacted`，只有 delete scope 的同 key 安全日志可重放，或原主理人执行纯读“查看转换结果”；其他旧 create/signup/cancel/edit/convert key 不得读取历史快照，统一返回 `SESSION_DELETING` 或遮蔽 not_found。
3. 仅对 `deletionState=active` 的资源 canonicalize payload、计算 keyed MAC，并查完整 `scope + subjectKey + operatorDigest + clientRequestId` request key。同 key 不同 MAC 在保留期内返回 `IDEMPOTENCY_KEY_REUSED`，即使父生命周期已终态；同 key 同 MAC 从安全响应快照原样重放首次提交结果。
4. create 没有 request log 时，先按 creationKeyDigest 查 active session：creationPayloadMac 相同返回同一 session，MAC 不同返回 `IDEMPOTENCY_KEY_REUSED`，不存在才继续创建。
5. 其他动作没有 request log 时，在事务内读取父资源和本人资源。父状态为 `cancelled` 时，除读取外的新 key 一律 `SESSION_WRITE_CLOSED`；父状态为 `completed` 时，仅 expensePlan 更新、AA、重复冻结和转换领域锚点可继续，其余 signup/attendance 新 key 拒绝。
6. 对仍允许的动作检查不可变领域 no-op：非终态中已 active 的本人重复报名可 `SIGNUP_DEDUPED`，即使报名窗口已关闭；已取消本人只有在开局前且父状态非终态时可返回取消 deduped。冻结与转换可跨不同 key 依据冻结版本/backlink 返回 deduped。
7. 仍需真实变更时，最后校验有效生命周期、服务端时间、expected version、计数真值与额度，再原子提交业务资源和 request log。

因此，截止后已有报名者的新 key 重复报名返回本人 authoritative `SIGNUP_DEDUPED`，未报名者返回 `SIGNUP_CLOSED`；冻结后新 key 的到场写返回 `ATTENDANCE_WRITE_FROZEN`。只有 `deletionState=active` 时同 key 历史成功结果才优先重放；deletion gate 永远先于普通 request log。

转赛事不仅依赖 request log。两个不同 `clientRequestId` 同时转换时都必须触碰同一 session version；最多一个事务能提交 tournament add、不可变 server-only backlink 与 `convertedTournamentId`，失败事务的 add 必须回滚。通过第 3 步 payload MAC 校验后，重试再读取 `convertedTournamentId` 并返回同一赛事。到场更新与冻结同样触碰 session version，因而旧到场请求不能穿透冻结。

### 10.4 计数漂移检测与重建

- 每个写命令先校验 counters 非负、`confirmedCount <= capacity`、`presentCount <= confirmedCount`；不满足则拒绝普通写并记录无 PII 诊断。
- 容量分配、补位、冻结和转换不能只相信 counters。事务必须读取所需 signup 真值并核对计数；最后名额读取计数及竞争者，冻结完整读取不超过 64 个 confirmed，转换完整读取不超过 30 个 present。任何查询达到平台 limit、分页不完整或计数不一致都返回 `SESSION_TRANSACTION_UNAVAILABLE`/`SESSION_COUNTER_DRIFT`，不能继续分配名额或生成赛事。
- reconciliation 仅由受控服务端维护路径触发，不给主理人或客户端开放“修数字”按钮。事务外按稳定游标分页聚合全部 signup 状态并取历史最大 queueNo，同时记录 `baseVersion`；任何页失败或重复/缺页均放弃本次修复。
- 聚合开始时记录 `baseVersion`；修复事务重新读取 session，若 version 已变化则返回 conflict 并重新聚合，不能用陈旧快照覆盖并发报名。
- 修复值为聚合计数，`nextQueueNo = max(currentNextQueueNo, observedMaxQueueNo + 1)`，永不降低。
- 修复只更新 counters、`countersRebuiltAt`、`updatedAt` 和 version，不改任何 signup 状态。
- 必测：聚合期间并发报名导致 baseVersion 变化、刚好命中查询上限、跨页重复/缺页、重试 operationId、`nextQueueNo` 接近安全整数上限，全部 fail closed 或安全重算。
- 运营观测只上报“是否漂移、差值绝对值、修复是否成功”，不发送 openid、昵称、session title 或 venue。

## 11. AA 整数分契约

### 11.1 输入与参与人

```text
totalCents = courtFeeCents + shuttleFeeCents + otherFeeCents
participants = signupStatus == confirmed && attendanceStatus == present
stableOrder = queueNo ASC, _id ASC
```

三项费用均为必填；缺省、字符串、浮点、负数、NaN、Infinity 均拒绝，`-0` canonicalize 为 `0`。每一步加法及总额都需通过安全整数校验。人数为 0 时返回 `AA_NO_PRESENT_MEMBERS/invalid`；总额为 0 且人数大于 0 时合法，每人 0 分。`_id` 只含 base64url ASCII，稳定次序使用 ASCII binary 升序，不受 locale 影响。

### 11.2 算法

```text
n = participants.length
baseCents = floor(totalCents / n)
remainderCents = totalCents % n
第 0 .. remainderCents-1 位：baseCents + 1
其余：baseCents
```

必须满足：

```text
sum(shareCents) == totalCents
max(shareCents) - min(shareCents) <= 1
同一 sessionVersion + 同一 present 集合 + 同一 expensePlan => 完全相同结果
```

示例：`12,000 + 3,000 + 1,001 = 16,001` 分，5 人到场。`base=3,200`，`remainder=1`；稳定顺序第一人 3,201 分，其余四人各 3,200 分，合计严格为 16,001 分。

### 11.3 返回与隐私

请求必须带 `expectedAttendanceFrozenVersion`，并可带 `expectedSessionVersion`；前者不匹配冻结名单、后者不匹配费用版本时均返回 conflict。返回至少包含 `sessionVersion`、`attendanceFrozenVersion`、三项费用、`totalCents`、`participantCount`、`baseCents`、`remainderCents` 和 lines。主理人可见所有 `{signupId, displayName, shareCents}`；present 本人默认只见 aggregate 与自己的 line。结果是按权威冻结快照即时派生，不保存支付状态、债务、已付金额或催款状态，也不创建 ledger/obligation 集合。费用修改导致 sessionVersion 变化时，旧 AA 结果必须被识别为过期。

## 12. 分享、异常恢复、隐私与滥用

### 12.1 分享入口

- canonical 参数只用 `sessionId`；scene 推荐 `sessionId=<opaque-id>`。服务端仅接受固定 base64url 字符集与批准长度，首版不兼容高碰撞的通用 `id` alias。
- `sessionId` 是可被群成员继续转发的访问定位符，不是群成员证明或 secret capability。首版不支持单独撤销/轮换分享，只能关闭报名或取消组局；这一默认行为必须明确批准。若未来要求撤销，另增 rotatable share token，不能原地改变 signup 外键语义。
- 候选分享卡片标题为 `「{title}」邀你报名`，使用通用无个人信息配图；卡片不含场馆、费用、人数姓名或头像。path 仅含 sessionId，落地后仍按服务端当前状态裁剪。
- 分享 path 固定先落到 session 查看入口；`intent` 未知值归一为 `view`，且无论值为何都不能触发写入。
- 页面加载可匿名读取公共投影；真正报名时才登录并完成最小资料 gate。
- 身份识别 pending 时禁用写 CTA；超时可降级游客查看，不把身份超时当成已报名或未报名的确定结论。
- `draft` 对非主理人显示未发布/不可用；`open` 可显式报名；`closed` 显示报名已截止但保留只读详情；`completed` 显示已完成；`cancelled` 显示已取消和安全返回。
- 坏参数/不存在/已删除统一由 API 返回遮蔽后的 `not_found`，客户端映射到 `invalid` 落地；网络/超时/unavailable 进入 `retryable`。`closed/cancelled` 不是无效链接，不能与 not_found 合并。

### 12.2 异常恢复

- 网络或 timeout：保留同一 clientRequestId 重试，并在刷新后以服务端状态为准。
- version conflict：刷新 session/signup；不得自动覆盖主理人或本人较新的操作。
- 重复动作先按第 10.3 节固定优先级处理：同 key 同 payload MAC 原样重放，同 key 异 payload conflict；新 key 只有在该动作允许领域 no-op 时才返回 authoritative deduped。
- 转赛事响应丢失：先完成同 key fingerprint 校验；之后新旧 clientRequestId 都读取 backlink/`convertedTournamentId`，返回同一 tournamentId。
- 取消与补位响应丢失：本人刷新自己的状态；主理人刷新计数和候补队列，不依赖 toast 判断成功。
- 计数异常：阻断普通写，执行 version-aware reconciliation 后再恢复。

### 12.3 隐私最小化

- 必需：仅服务端可见的 openid、显示昵称。Lite 首版不读取、保存、托管或复制头像；现有以 OPENID 命名的头像 fileID/URL 和任意 opaque 资产都不进入本域。
- 不收集：手机号、微信号、通讯录、群成员、性别、生日、精确位置、持续定位、聊天内容。
- 城市和场馆是用户主动填写的文本；需限长、去控制字符并提示不得填写联系方式。
- openid 永不进入组局页面 data、分享参数、埋点或错误日志；客户端管理操作使用 opaque signup ID。转赛事前还必须修复现有 tournament 完整文档直达页面 data 的身份泄露路径，否则转换保持禁用。
- 默认公共落地只显示人数计数，不展示报名人、候补、到场或 AA 明细；若未来展示必须单独审批。
- 分析事件禁止携带原始 `sessionId/signupId/tournamentId/clientRequestId/traceId`；如确需关联，只能使用事件协议批准的短期、不可回查匿名 token。request log、错误日志和分析数据使用不同密钥与访问域。

### 12.4 滥用与治理边界

- session ID 使用至少 128 bit CSPRNG 随机值；没有公共列表或搜索接口。
- 创建、报名、取消、到场与分享读取都需按 operator/session/action 限流；具体阈值在实现阶段压测后批准。
- 标题、城市、场馆、昵称做长度、字符和内容安全检查；有效候补候选上限 128，并设置单用户有效报名数和创建数额度；达到额度返回稳定 code，不静默截断。
- 首版没有举报、封禁、主理人移除单个报名人、公开评价或信用体系。主理人取消整局与用户自取消是唯一产品治理手段；这一限制及可能的恶意占位风险必须批准，严重滥用的后台处置属于后续独立合规方案。

## 13. 用户可见审批矩阵

以下全部为“候选默认，待逐点批准”，本文不等于产品批准。候选逻辑页为 `pages/sessionCreate/index`、`pages/sessionDetail/index`、`pages/sessionManage/index`、`pages/sessionAa/index`；路由名称本身也需批准，本轮不创建。

### 13.1 功能默认值

| 审批项 | 变化 | 受影响页 | 候选默认 | 必须批准的边界 |
|---|---|---|---|---|
| 发起组局 | 新增独立组局表单 | 发起/详情 | capacity 上限 64；城市/场馆文本；发布后去详情 | 时间、字段、levelTags、创建额度 |
| 分享落地 | 群分享只读落地 | 详情 | 只传 `sessionId`；任何 intent 都不写；持有链接者可继续转发 | 首版链接不可单独撤销、无群成员校验 |
| 满员报名 | 满员自动候补 | 详情 | capacity 未满显示 `报名`，已满显示 `加入候补`；成功后显示实时派生位次 | 有效候补上限候选 128、是否通知转正 |
| 取消与补位 | 本人取消后确定性补位 | 详情/管理 | 开局前可取消；closed 仍补位；候补按 queueNo/_id | 二次确认文案、截止后取消语义 |
| 到场与冻结 | 主理人逐个标记并在开局后冻结 | 管理 | 默认 unknown；`startsAt` 前不能冻结；无 unknown 才可完成 | 是否提前整理、是否批量标记、确认文案 |
| 关闭/重开 | 控制报名窗口 | 管理/详情 | 首版关闭后不重开；截止后不能延长时间隐式重开 | capacity 增加是否仍提升已有候补 |
| 取消组局 | 取消态有独立落地 | 管理/详情 | completed 前可取消且不可恢复；不 fan-out signup | 原因枚举、取消确认文案 |
| 转赛事 | 冻结 present 生成一次草稿 | 管理/赛事结果 | 4–30 人、`multi_rotate/custom`；主理人不自动参赛 | 身份安全投影；来源赛事删除用 tombstone 还是禁止删除 |
| AA | 三项费用整数分均分 | 管理/AA | present 均分；只计算、不支付；费用变更提示旧结果过期 | present 是否互看全部明细 |
| 资料与保留 | 收集最小资料并可去标识化 | 报名 gate/隐私说明 | 首版仅昵称、无头像；终态 180 天；stale 非终态清理 | 字段用途、各期限、本人/主理人删除影响 |

### 13.2 逐状态唯一主操作与错误恢复

角色匹配优先级固定为 `主理人 > 本人 signup 状态 > 已登录非成员 > 匿名/identity pending`。主理人即使同时 confirmed/waitlisted/present，也始终使用主理人行的管理 CTA；本人报名、取消或 AA 只作为管理页内次级入口，不再成为第二个主 CTA。下表的成员/非成员行均指“非主理人”。

| 有效状态 / 查看者 | 候选落地与可见内容 | 唯一主 CTA | 候选提示或错误恢复 | 导航结果 |
|---|---|---|---|---|
| draft / 主理人 | 发起页草稿；全部可编辑字段 | `发布组局` | `请先补全时间和人数`，校验失败留原页 | 成功到详情 |
| draft / 非主理人或匿名 | invalid 落地；不泄露标题 | `返回首页` | `组局暂不可查看` | 返回，不重试写入 |
| open / identity pending | 公共详情；写 CTA 禁用 | `身份确认中`（禁用） | 超时显示 `暂时无法确认身份`，次操作为文字链接 `重试` | 不自动报名 |
| open / 匿名 | 公共详情 | `登录后报名` | 登录失败 `登录未完成，请重试` | 登录后仍回同一 session |
| open / 已登录非成员且未满 | 公共详情 | `报名` | conflict 时 `状态已变化，请刷新` | 成功留详情显示 confirmed |
| open / 已登录非成员且已满 | 公共详情 | `加入候补` | 候补满 `候补人数已满`，仅刷新可重试 | 成功留详情显示实时位次 |
| open / confirmed | 公共 + 本人状态 | `取消报名` | `取消后名额会自动顺延给候补，是否继续？` | 成功刷新本人状态 |
| open / waitlisted | 公共 + 本人位次 | `取消候补` | `取消后需重新排队，是否继续？` | 成功刷新本人状态 |
| open / 主理人 | 公共 + 管理摘要 | `管理组局` | 关闭/取消均在管理页二次确认 | 去管理页 |
| closed 且 startsAt 前 / confirmed 或 waitlisted | 关闭说明 + 本人状态 | `取消报名` / `取消候补`（按本人状态二选一） | `报名已关闭，但开局前仍可取消` | 原页刷新；已有候补仍可被提升 |
| closed / 非成员 | 关闭说明与公共投影 | `返回首页` | `报名已结束` | 不创建 signup |
| closed 且 startsAt 前 / 主理人 | 管理名单；可提前整理状态 | `管理到场` | `开局后才能确认到场名单`，冻结禁用 | 留管理页 |
| closed 且 startsAt 后、仍有 unknown / 主理人 | 管理名单 | `继续确认到场` | `仍有 N 人待确认` | 留管理页 |
| closed 且 startsAt 后、无 unknown / 主理人 | 管理名单摘要 | `确认到场名单` | `确认后不可修改，是否继续？` | 成功进入 completed |
| completed 未转换 / 主理人 | 冻结摘要、AA 入口 | `转为赛事` | 少于 4 人 `至少 4 人到场才能转赛事`；超过 30 人 `当前多人转最多 30 人` | 成功去赛事 lobby；AA 为次级入口 |
| completed 已转换 / 主理人 | 转换结果 | `查看赛事` | tombstone 时 `赛事已删除，不能再次转换` | 去赛事或停留结果页 |
| completed / present 本人 | 本人到场与费用摘要 | `查看我的 AA` | 费用版本变化 `费用已更新，请刷新` | 去 AA 结果 |
| completed / absent 或 not_admitted | 结果摘要，不显示 AA 明细 | `返回首页` | `本次未计入到场均分` | 返回 |
| cancelled / 所有人 | 取消态公共投影 | `返回首页` | `组局已取消`；不得显示报名 CTA | 返回 |
| deleting / 主理人 | 删除进度，不显示业务资料 | `返回首页` | `资料正在清理，请稍后查看`；不允许恢复 | 返回 |
| redacted tombstone / 原主理人 | 仅转换结果状态 | `查看赛事` | `组局资料已删除，仅保留转换关联至到期` | 去赛事或 deleted 结果 |
| deleting/redacted / 非主理人 | invalid 落地 | `返回首页` | `组局链接无效或已失效` | 不泄露 tombstone 存在性 |
| invalid（坏参数/not_found/已删除） | 无业务字段 | `返回首页` | `组局链接无效或已失效` | 返回；不区分原因 |
| retryable/unavailable | 上次安全快照或骨架屏 | `重试` | `网络或服务暂不可用，请重试` | 同一页面、零写入 |
| conflict | authoritative 摘要 | `刷新状态` | `状态已由其他操作更新` | 刷新后由新 capabilities 决定 CTA |
| rate_limited | 只读详情 | `稍后重试`（倒计时禁用） | `操作太频繁，请稍后再试` | 不生成新 requestId 自动循环 |

### 13.3 隐私、分享与治理审批

| 审批项 | 候选默认 | 需要用户明确确认 |
|---|---|---|
| 游客逐状态字段 | open/closed 可见标题、时间、城市、场馆、等级和计数；终态隐藏场馆、费用、名单 | 是否还要收窄时间/场馆；分享卡片是否只含标题与日期、不含场馆 |
| 链接与分享卡片 | 128-bit sessionId 可继续转发；无群成员校验；首版不可单独撤销；标题候选 `「{title}」邀你报名`，通用配图且不含场馆 | 是否接受，或把可撤销 share token 列为首版阻断项；标题/配图逐项批准 |
| 报名资料 | 首版只有昵称，用于主理人辨认并复制为赛事 displayName；不读取或保存头像 | 昵称对主理人/赛事参与者的可见性及赛事独立保留期 |
| 主理人名单 | 只显示 active/到场操作需要的 signupId、昵称、状态；cancelled 默认去标识化 | 是否需要查看已取消历史及原因 |
| 报名人删除 | 开局前先取消并去标识化；终态可去标识化；隐藏关联保留至清理 | 是否接受不能级联删除已生成赛事中的身份副本 |
| stale 与终态保留 | draft 30 天；startsAt+30 天遗留态转 cancelled；终态 180 天；成功 request log 与资源同期限、无资源失败诊断 30 天；已转换提前删除保留最小 keyed-digest tombstone | 期限、清理通知、失败重试和 tombstone 字段/期限 |
| AA 可见性 | 主理人看全部；present 默认仅 aggregate + 自己一行；费用更新显示版本提示 | present 是否互看姓名与全部金额 |
| 通知 | 首版不发订阅通知，候补转正/到场变更靠刷新 | 是否需要通知；若需要必须单独申请模板与同意 |
| 滥用治理 | 无举报、封禁、单人移除；仅限流、内容安全、本人取消和整局取消 | 是否接受恶意占位风险；创建/报名/候补额度 |
| 来源赛事删除 | 推荐 tombstone 保留同一 ID/backlink，不允许硬删后重新转换 | 对现有赛事删除流程的用户可见变化与保留说明 |

只有上述逻辑页、逐状态 CTA/文案、分享标题与字段、默认行为、隐私期限和删除影响逐项获批后，才能进入生产实现。

## 14. 后续实施拆分

### Phase 0：产品与隐私审批冻结

- 逐点批准第 13 节所有用户可见行为，尤其是主理人是否参赛、满员候补、closed 后取消/补位、是否支持重开、到场冻结、AA 可见性、链接可转发性和保留期。
- 冻结 capacity/候补/账户额度、levelTags 枚举、页面路径、逐状态文案、CTA、分享卡片、游客字段白名单、本人去标识化和删除说明。
- 决定来源赛事硬删除保护/tombstone，以及现有赛事 player identity 不进入页面 data 的改造方案；任一未定都阻断“转赛事”。
- 未完成本阶段，不得进入生产代码、集合、索引、页面或云函数实现。

### Phase 1：领域纯逻辑

- 固化字段 normalizer、session/signup/attendance 状态转换表、权限 predicate、错误码常量、AA 纯函数和 payload fingerprint。
- 使用纯对象和确定性时钟，不依赖 `wx`、数据库或页面。
- 先写单元/性质测试：所有合法/非法边、queue 稳定性、整数守恒、安全整数溢出、同 key 不同 payload。
- 门槛：产品默认行为获批；纯逻辑覆盖全部关键分支；仍不创建真实集合。

### Phase 2：云契约与存储

- 评审并创建 `game_sessions` / `session_signups` 与索引；验证 UNIQUE sparse 对 missing/null 的真实行为；两集合安全规则拒绝客户端直接读写/watch/aggregate，并加入全部绕过拒绝测试。
- 复用现有 request log 前先补 keyed payload MAC、operator digest、TTL、creationKeyDigest 和 fail-closed 事务能力。
- 实现最小查询/命令边界，所有写从 WX context 取身份，返回统一 envelope。
- 抽取并复用赛事草稿纯 builder；专用转换事务不调用其他云函数。先完成 tournament server-only identity adapter、安全投影、唯一 sourceSessionRef backlink 和来源赛事 tombstone/delete guard，再开放转换。
- 加入 counter reconciliation、限流和无 PII 诊断；不接支付、地图、聊天或公共发现。
- 实现 deletionState 原子认领、可重试 signup 清理、redacted tombstone 白名单与 request log 同寿命清理；删除 worker 与转换共享 session version 冲突测试。
- 门槛：云契约、权限、事务、不同 requestId 并发转换、非参赛 creator 兼容测试全部通过；仅在单独授权后部署。

### Phase 3：页面与分享

- 在逐点批准后实现发起、详情/报名、主理人管理、分享落地、转赛事和 AA 结果界面。
- 新建 session 专用 parser/view model；只复用分享的安全 decode、retryable/invalid 分型和 identity pending 模式。
- 保证分享加载零写入、唯一 CTA 显式报名、closed/cancelled/invalid/retryable 清晰分流。
- 对所有状态做微信开发者工具真实截图，并验证弱网、身份超时、重复点击和返回路径。

### Phase 4：埋点与灰度

- 依赖 P04 已稳定的事件协议，默认关闭接线；候选事件包括 create/open/share_view/signup_confirmed/signup_waitlisted/cancel/promote/attendance/convert/aa_calculated/completed/cancelled。
- 事件不得包含 openid、昵称、头像、标题、场馆、费用明细、精确时间地点，或原始 sessionId/signupId/tournamentId/clientRequestId/traceId；只使用批准的不可回查匿名维度和人数桶。
- 灰度先面向已有主理人群体，只观察单 session 内分享到报名、候补转正和到场到转赛事，不启动公共发现。次周复办需要跨周稳定主体键，与“不可回查短期 token”不兼容，首版不采集；若 P04 未来提出该指标，必须单独审批 keyed cohort 标识、作用域和 TTL。
- 门槛：事件幂等、无 PII、可关闭、数据口径稳定；发布仍需独立授权。

## 15. 验收测试清单

### 15.1 领域与状态

- 枚举 session/signup/attendance 的每一条允许边和拒绝边；终态无越权出口。
- draft 不可报名；deadline/startsAt 边界使用服务端时间且 fail closed。
- create/open 的 deadline/startsAt 必须在未来；已到有效截止态后延长 deadline 仍拒绝，不能形成隐式重开。
- 首版推荐 closed 不可重开；若用户另行批准重开，必须补齐独立状态边和候补/到场回滚测试；completed/cancelled 永不可重开。
- 冻结前 confirmed 不得残留 unknown；冻结后 signup/attendance/capacity 写入全部稳定拒绝。
- `startsAt-1ms` 冻结拒绝、`startsAt` 可冻结；提前标到场与本人取消并发时，取消成功必须重置 unknown 且冻结因 version/unknown 失败。
- cancelled 父状态使所有 signup 写失效，但不要求 fan-out。
- 提前删除/TTL worker 必须先原子认领 deleting；认领后 AA/转换/费用更新均拒绝，批量清理失败只能继续清理，不能恢复 active。
- completed 且 deletionState=active 时仅 expensePlan 可编辑；同一请求在 deleting 认领先后并发时最多一方按 version 提交。
- 开局时仍 waitlisted 的存储状态保留，派生状态稳定为 not_admitted，不再显示有效位次或取消 CTA。
- capacity 下降不低于 confirmed；增加按 queue 批量提升且计数正确。
- capacity 增加的提升、计数、session/signup 版本和 request log 任一步失败全部回滚；超时同 key 重试不重复提升。

### 15.2 报名与并发

- 两个用户并发争最后名额：恰好一个 confirmed、一个 waitlisted。
- 两个用户并发争最后一个候补位：恰好一个 waitlisted、一个 `SESSION_WAITLIST_FULL`；失败方不消耗 queueNo、不创建 signup。
- 同一用户相同/不同 clientRequestId 并发报名：唯一记录、唯一 queue、计数只加一次。
- active 资源中，同 key 不同 payload 必须先于领域 no-op 返回 `IDEMPOTENCY_KEY_REUSED`；同 key 同 payload 在父生命周期变化后仍原样重放。
- active session 的成功 request log 与资源同期限且快照可重放 promotion/version；模拟 create log 缺失时 creationKeyDigest + creationPayloadMac 仍能区分同/异 payload。
- 认领 deleting 后，旧 create/signup/cancel/edit/convert key 即使同 payload 也不能回放 sessionId/signupId；redacted 前相关业务日志已清除，只保留 deletion 安全结果和转换 backlink。
- redacted tombstone 存续期间重放旧 create key（同 payload 或篡改 payload）均不得创建新 session、不得返回旧 sessionId；到期硬删除后幂等保证按已批准保留期结束。
- 已 confirmed/waitlisted 重复报名返回 deduped，queue/version 不变。
- 满员报名进入 waitlisted，不返回伪失败。
- waitlisted 取消只减候补；confirmed 取消提升最早候补。
- 两个 confirmed 并发取消提升两个不同候补；顺序按 queueNo/_id。
- cancelled 重新报名获得新 cycle 和队尾 queueNo；旧延迟取消因 version/cycle 冲突不能取消新周期。
- cancelled 重新报名撞上候补上限时原记录、cycle、queueNo 和计数完全不变。
- session 取消后报名、取消、补位、到场、转换全部被稳定拒绝。
- 截止后已 active 本人的新 key 重复报名 deduped，未报名者 closed；completed 后新 key 取消/到场拒绝，但重复冻结/转换按不可变锚点 deduped。
- session 首次取消与同 key 重放返回同一取消结果；父状态已 cancelled 后换新 key 再取消返回 `SESSION_WRITE_CLOSED`，不返回 deduped。
- 计数偏小/偏大、查询刚好达到 limit、reconciliation 跨页缺失和 baseVersion 并发变化均不得超卖或覆盖新数据。

### 15.3 权限与隐私

- 客户端伪造 organizerOpenid/participantOpenid/presentIds 全部无效。
- 非主理人不能编辑、到场、看管理名单、转赛事或看全部 AA。
- 本人只能取消自己的 signup；使用其他 session、无权或不存在的 signupId 固定返回相同 `SIGNUP_NOT_FOUND/not_found`，不得形成存在性侧信道。
- 所有公共、本人、主理人投影均不返回 openid、手机号、性别或坐标。
- 小程序端直接 read/write/watch/aggregate 两个集合全部被安全规则拒绝；draft 对任何非主理人统一 not_found。
- 任何头像 fileID/URL/asset ID 都不得进入 signup、管理投影或 tournament；未来头像能力需独立规格与审批。
- 跨 session signupId、无权 signupId 和真实不存在 signupId 对非主理人固定返回相同 `SIGNUP_NOT_FOUND/not_found` envelope、时序预算和字段集合。
- 分享 onLoad/onShow/scene/intent 均不触发 mutation；必须点击 CTA 后才恰好发起一次报名意图。

### 15.4 转赛事

- 无人到场、1–3 人到场返回 `PRESENT_MEMBER_MINIMUM_REQUIRED`，不创建 tournament。
- 4 人及以上只取 present；absent、unknown、waitlisted、cancelled 均不进入 players。
- 30 人允许转换；31/64 人返回 `PRESENT_MEMBER_MAXIMUM_EXCEEDED`，不创建部分 tournament。
- 不同 OPENID 的同名成员全部保留原 displayName 和独立身份，不去重、不追加后缀。
- 主理人未 present 时仍只做 creator、不进入 players；现有全链路兼容测试必须先通过。
- 转换只接受 completed + attendanceFrozenVersion；冻结后的迟到到场请求不得改变 roster。
- 相同 key 并发、不同 key 并发、成功响应丢失重试：只创建一场 tournament，永远返回同一 ID。
- 同 key 不同 payload 返回 conflict；不得静默返回不匹配的第一次结果。
- 转换事务任一步失败时 session link、tournament、request log 均不部分提交。
- `convertedTournamentId/sourceSessionRef` 缺省、null、空字符串的真实唯一索引行为通过环境测试；link 与 backlink 任一不一致均 conflict。
- 至少两个 redacted tombstone 同时存在时，缺省 sessionId 不触发 sparse unique 冲突；各自 creationKeyDigest/sessionLookupDigest 仍唯一，旧 create key 只命中原 tombstone 并被 deletion gate 拒绝。
- 来源赛事 tombstone 后重试返回原 tournamentId + deleted 状态，不创建第二场；现有 hard delete 路径必须被 guard。
- 来源 session 删除认领与转换并发：最多一方先提交 session version；转换先赢则删除走 redacted tombstone，删除先赢则零 tournament 创建且转换返回 `SESSION_DELETING`。
- 未转换终态清理在删 signups 中途失败可重试且不开放业务写；已转换提前删除只保留第 5.5 节字段，非主理人 not_found，主理人只能读取原转换结果。
- 转换后的赛事投影、lobby、start、score、ranking、share 和 sync 全链路均不把其他用户 OPENID 放入页面 data。

### 15.5 AA

- 费用为负数、浮点、字符串、NaN、Infinity、超出安全整数或总额溢出均拒绝。
- 缺省字段拒绝，`-0` 规范化为 0；三项分别安全但相加溢出仍拒绝。
- 无人到场拒绝；总额 0 且有人到场时每人 0。
- 16,001 分 / 5 人得到 `[3201,3200,3200,3200,3200]`。
- 费用不能整除时总和恒等、最大差 1；随机安全范围总额和 1–64 人性质测试通过。
- 反转数据库返回顺序不改变结果；排序只使用 queueNo/_id。
- present 集合或 expensePlan/version 变化后返回新计算，旧 expectedVersion 返回 conflict。

### 15.6 回归与发布门槛

- 现有 `createTournament`、`joinTournament`、`cloneTournament`、赛事分享、权限与 sync 测试保持通过。
- 云契约实现阶段运行 `cloud-common`、permission、create/join/clone、share-entry、auth、sync 和 smoke 聚焦测试。
- 页面实现阶段完成真实截图；任何 preview/upload、云函数部署、集合创建、真实数据或发布均需另行明确授权。

## 16. 未决问题、依赖与残余风险

### 16.1 待用户批准

- capacity 上限是否采用 64、有效候补是否采用 128，以及 levelTags 和账户额度的具体枚举/阈值。
- 报名是否仅昵称必需且首版不收头像；open/closed 与终态游客字段白名单、分享卡片字段是否采用第 13 节候选。
- 满员自动候补、closed/截止后仍为已有候补自动补位、取消二次确认的具体语义。
- closed 后是否完全禁止重开；本文推荐首版禁止。
- 到场是否要求逐个清除 unknown 后才能冻结；本文推荐必须明确 present/absent。
- 主理人未到场时“只做赛事 creator、不进入 players”的产品语义。
- 转换固定为 `multi_rotate/custom`、4–30 人上限、tournament 身份安全投影，以及来源赛事使用 tombstone/delete guard 的删除语义。
- present 本人只看自己 AA 行，还是所有到场者互相可见全部明细。
- draft 30 天、遗留态 startsAt+30 天、终态 180 天、成功 request log 与资源同期限、本人去标识化、提前删除和实际隐私文案。
- 链接可继续转发、无群成员校验且首版不可单独撤销，是否可接受。
- 无举报、封禁、单人移除和订阅通知的首版治理边界。
- 所有页面、导航、分享标题、状态文案、CTA 与错误恢复文案。

### 16.2 外部依赖

- P04 稳定事件协议后才能接埋点；本文事件名只是需求，不修改 P04 字典。
- 转赛事前需抽取届时有效的 tournament draft builder，完成 tournament 安全投影/身份 adapter、sourceSessionRef backlink、delete guard/tombstone，并验证非参赛 creator 全链路。
- 生产存储前需确认微信云数据库唯一复合索引、事务查询/写入上限和真实事务能力；能力不满足时必须调整架构，不能退化为非原子写。
- 灰度优先级可参考 P01 数据，但不阻塞本规格完成。

### 16.3 残余风险

- session 文档是容量和计数热点；极端同一时刻报名可能产生冲突，需要压测和有限重试。
- capacity 增加导致多候补批量提升，受事务写上限约束；上限 64 仍需实测。
- 父 session 取消不 fan-out，所有读取必须始终结合父状态，不能只看 signupStatus。
- 非参赛 creator 在现有赛事 UI 中缺少既有产品样本，是转换实现前最大的兼容风险。
- 现有 tournament 完整文档同步会把 OPENID 身份键带入页面 data，且 deleteTournament 会硬删除；两项未改造前必须禁用转换。
- 文本场馆仍可能被用户写入联系方式；内容安全和提示只能降低、不能消除该风险。
- AA 只是算术结果，不形成债权债务或支付证明；界面文案若模糊可能让用户误以为已收款。
- 领域与存储只允许 canonical `cancelled`。当前 `miniprogram/core/cloud.js` 的旧 `canceled` 仅可在兼容适配层单向映射为 `cancelled`；必须测试 `closed/full/cancelled`，不能让取消态落入 unknown，也不能把两种拼写都写入新集合。

## 17. 本轮声明

本轮只完成 discovery、现有契约只读审计和本文规格。未修改 `miniprogram/`、`cloudfunctions/`、`scripts/`、`tests/`、`package.json`、`miniprogram/app.json` 或生产配置；未创建页面、路由、云函数、集合或索引；未读取或写入真实用户/赛事数据；未 preview/upload、未发布、未部署、未 push、未创建 PR。
