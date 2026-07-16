# P06：组局 Lite discovery / spec

> 状态：`ready_for_parallel_discovery_spec_only`
> 任务类型：产品发现、数据契约与实现拆分；禁止生产实现
> 文档所有者：P06 独立对话

## 统一基线

- 权威源码：`D:\projects(WIN)\badminton-miniapp`。
- 路径中的 `(WIN)` 是目录名的一部分；不得写成 `D:\projects\WIN\badminton-miniapp`。
- 开发起点：由 `codex/ui-optimization-v2@743b016` 建立的统一 docs checkpoint；实际 SHA 以 `docs/tasks/current.md` 和 `docs/tasks/parallel-development-roadmap.md` 为准。
- 产品差异基线：`master@5813ffc`，也是用户确认的当前线上正式版。
- `feature/core-flow-simplification` 已关闭，不得作为设计或实现基线。
- 本任务只拥有本文件、自己的 session log，以及后续明确约定的规格报告；不得修改总路线图或其他并行任务文档。

## 目标

为“工具型组局”形成一份可审计、可拆分、可测试的 Lite 规格。首版解决：发起组局、报名、取消、候补、确认到场、从到场成员创建多人转赛事，以及按整数分计算 AA 费用。

本任务不新增页面、云函数、集合、依赖或线上数据，只把产品边界、数据模型、权限、并发、错误码、幂等、验收用例和后续实现批次定义清楚。

## 依赖与后续门槛

- 可与 P01、P02、P04、P07 立即并行，不依赖它们才能完成 discovery。
- P01 的主理人、参赛人数、复办与分享数据用于调整未来灰度优先级，但不得阻塞本规格成稿。
- 进入生产实现前，必须由用户逐点批准页面、文案、CTA、导航、分享落地、默认行为和隐私说明。
- 未来接入埋点时依赖 P04 的稳定事件字典；本任务只提出事件需求，不修改 P04 契约。
- “转赛事”必须复用届时有效的 `createTournament`/名单契约；不得把现有 `tournaments` 草稿直接当作报名容器。

## 推荐领域模型

### `game_sessions`

组局是独立于赛事的业务实体，建议至少描述：

| 字段 | 约束与用途 |
|---|---|
| `_id` | 组局主键；分享入口使用 `sessionId`，不得复用 `activityId` 或 `tournamentId` |
| `organizerOpenid` | 由云端上下文写入，拒绝客户端冒充 |
| `title` | 限长后的组局标题，不承载联系方式 |
| `startsAt` / `signupDeadlineAt` | 绝对时间；截止时间不得晚于开局时间 |
| `cityText` / `venueText` | 城市和场馆文本；首版不存精确经纬度 |
| `capacity` | 正整数人数上限；变更时不得小于当前有效报名人数 |
| `levelTags` | 有限枚举或限长标签，不做自动匹配 |
| `status` | `draft` / `open` / `closed` / `completed` / `cancelled` |
| `expensePlan` | `courtFeeCents`、`shuttleFeeCents`、`otherFeeCents`，全部为非负整数分 |
| `convertedTournamentId` | 转赛事成功后写入；幂等重试返回同一赛事 |
| `version` | 乐观并发控制 |
| `createdAt` / `updatedAt` | 服务端时间 |

人数计数可以作为事务内维护的派生快照，但真实成员清单以 `session_signups` 为准。规格必须说明计数漂移的检测和重建方式。

### `session_signups`

建议每个用户在每个组局只有一条稳定记录，并通过状态变化保留审计轨迹：

| 字段 | 约束与用途 |
|---|---|
| `_id` | 报名记录主键 |
| `sessionId` | 对应 `game_sessions._id` |
| `participantOpenid` | 由云端上下文写入；与 `sessionId` 组成唯一约束 |
| `signupStatus` | `confirmed` / `waitlisted` / `cancelled` |
| `attendanceStatus` | `unknown` / `present` / `absent`；首版由主理人确认 |
| `queueNo` | 服务端生成、单调稳定，用于候补顺序和确定性补位 |
| `profileSnapshot` | 仅保留展示所必需且已获授权的最小字段，不收集手机号或联系方式 |
| `version` | 乐观并发控制 |
| `createdAt` / `updatedAt` | 服务端时间 |

规格必须明确：重复报名幂等、满员后的候补、已取消用户重新报名、主理人取消组局、并发抢最后一个名额、取消后自动提升最早候补等行为。

## 核心操作契约

规格至少为以下操作定义调用者、前置状态、幂等键、事务边界、成功结果和稳定错误码：

1. 创建或编辑组局。
2. 开放/关闭报名与取消组局。
3. 报名：有名额进入 `confirmed`，否则进入 `waitlisted`。
4. 取消报名：只允许本人取消；释放名额后在同一事务中提升最早有效候补。
5. 到场确认：首版仅主理人可将有效报名标记为 `present`/`absent`。
6. 转赛事：仅主理人可操作，只选择 `present` 成员，满足多人转最小人数；使用 `clientRequestId` 幂等，成功后重复调用返回同一 `tournamentId`。
7. AA 计算：只计算，不接支付。总额为三项整数分之和；按实际到场人数均分，余数按稳定顺序每人多分 1 分，确保分摊合计严格等于总额。

所有未来云函数结果必须兼容前端统一结构：`ok`、`code`、`message`、`state`、`traceId`、`data`。规格需列出 `forbidden`、`invalid`、`conflict`、`closed`、`full`、`deduped` 等状态的含义，但不得在 discovery 阶段创建云函数。

## AA 整数分示例

例如场地费 12,000 分、球费 3,000 分、其他费用 1,001 分，共 16,001 分，5 人到场：基础份额 3,200 分，余数 1 分；稳定顺序中的第一人 3,201 分，其余四人各 3,200 分。禁止使用浮点元金额参与计算。

## 首版明确排除

- 附近局、地图找局、精确位置和后台持续定位。
- 自动水平匹配、陌生人推荐、公共广场和跨群流量分发。
- 聊天、私信、手机号交换、通讯录或群成员读取。
- 在线支付、代收、提现、退款、催款和支付结果确认。
- 信誉分、公开评价、公开排名或举报治理系统。
- 周期组局、搭子匹配、场馆库存和商业场馆 SaaS。

这些能力只能在 Lite 有真实供需密度、隐私/主体资质和治理方案后重新立项，不能以“预留字段”为由暗中实现。

## 用户可见审批矩阵

规格报告必须给出但不得实现以下矩阵：

| 审批项 | 必须说明 |
|---|---|
| 变化 | 用户新增或改变了什么操作 |
| 受影响页面 | 发起、详情/报名、主理人管理、分享落地、转赛事、AA 结果 |
| 文案与 CTA | 每个状态下唯一主操作及错误恢复文案 |
| 导航与分享 | `sessionId` 深链、无效/关闭/取消状态的落地方式 |
| 默认行为 | 报名满员是否自动候补、取消是否自动补位、到场默认值 |
| 隐私 | 收集字段、用途、保存期限和删除方式 |

没有用户明确批准，不得进入页面、云函数、集合或配置实现。

## 允许

- 只读检查现有创建、加入、分享、权限、同步和 clone 契约。
- 编写领域模型、状态机、权限矩阵、错误码表、并发/幂等方案、事件需求和验收测试清单。
- 在本任务自己的规格报告中使用脱敏示例数据。

## 禁止

- 修改 `miniprogram/`、`cloudfunctions/`、`scripts/`、`tests/`、`package.json`、`miniprogram/app.json` 或任何生产配置。
- 创建真实集合、索引、云函数、页面、路由或分享入口。
- 读取或写入真实用户/赛事数据。
- 安装依赖、运行 preview/upload、正式发布或部署云函数。
- 创建/切换 worktree、提交、push、PR 或 merge，除非用户当次明确授权。

## 交付

1. 组局 Lite 范围与非目标。
2. `game_sessions` / `session_signups` 字段、索引、状态机和数据保留方案。
3. 报名、取消、候补补位、到场、转赛事、AA 的权限/并发/幂等契约。
4. 分享入口、异常恢复、隐私和滥用风险说明。
5. 用户可见审批矩阵。
6. 按“领域纯逻辑 → 云契约 → 页面/分享 → 埋点/灰度”拆分的后续实施批次与测试清单。
7. 明确列出未决问题、依赖、残余风险，以及“未修改生产代码、未写真实数据、未上传未部署”的声明。

## 验证

- 检查状态转换不存在无法退出或越权路径。
- 用至少以下场景走查：并发争最后名额、重复报名、满员候补、确认用户取消、候补自动补位、主理人取消、重复转赛事、无人到场、费用不能整除。
- 检查整数分拆分的总和恒等式和确定性。
- 检查 `sessionId` 与现有 `tournamentId`/`activityId` 命名边界清楚。
- 检查 git 差异只包含获授权的 discovery 文档，运行 `git diff --check`。
- 不因文档任务运行 `npm run mp:preview`、`npm run mp:upload` 或任何 deploy 命令。

## 可复制启动提示词

```text
你负责 P06「组局 Lite discovery/spec」。权威仓库是 D:\projects(WIN)\badminton-miniapp。先只读检查 git 状态，并完整阅读 AGENTS.md、docs/tasks/current.md、docs/tasks/parallel-development-roadmap.md、docs/tasks/parallel-development/06-game-session-lite-spec.md、docs/context/architecture.md，以及现有 create/join/share/clone/permission 契约。

本轮只做 discovery 和规格，不得修改任何生产代码、测试、配置、package.json 或 miniprogram/app.json，不得创建集合/云函数/页面，不得读取或写入真实数据。请设计独立的 game_sessions 和 session_signups，完整覆盖报名、取消、候补自动补位、到场确认、从到场成员幂等转为多人转赛事，以及使用整数分且余数确定性分配的 AA 计算。首版明确排除附近、匹配、聊天、支付和精确位置。

输出领域模型、索引、状态机、权限矩阵、稳定错误码、并发/幂等方案、隐私边界、验收用例、实施拆分和用户可见审批矩阵。页面、文案、CTA、导航、分享或默认行为没有逐点批准前不得实现。最终按“交付、验证、未验证、残余风险”报告，并明确未改生产代码、未写真实数据、未上传、未部署。不要创建 worktree、提交、push、PR 或 merge，除非我另行明确授权。
```
