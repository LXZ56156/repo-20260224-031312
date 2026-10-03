# 2026-10-03 线上后端只读检查

> 状态：历史/时点报告。适用范围为正文记录的日期、样本和检查窗口；不作实时状态或当前执行指令。当前范围/最新结果看 [current](../tasks/current.md)，已吸收规则以 [总索引](../README.md) 指向的正文为准。原结论与失败证据保留。


结论：当前 23 个主线云函数均已部署且入口源码一致，打水 V2 权限和五项声明索引已落实；最需要先修的是**开赛链路真实超时**。近 7 天窗口 `startTournament` 的 113 次独立调用有 14 次平台失败（12.39%），不是仅靠源码推断的问题。详细行为采集函数虽已存在于云端，但当前配置未启用，不能称用户操作轨迹已完整落地。

检查时间为北京时间 2026-10-03 约 01:34–01:49；查询统计固定截止 01:42，保留现有工作树，无部署、业务写入、函数调用、提交或推送。源码基线 master/b571c68754e964e1a73800645f68a49d99f40f41；当前云入口与线上客户端基线 702625a 之间未发现主线源码漂移。本报告采用 weapp-cloud-contract-audit 的结果、权限、幂等和锁合同检查方法。主控另负责全量本地验证及总报告。

## 1. 云端状态与版本一致性

| 检查项 | 实际结果 | 边界 |
|---|---|---|
| 环境 | NORMAL；数据库 RUNNING；云存储 NORMAL；上海地域；个人版 | 不是完整服务 SLO |
| 实时账单 | 到期 **2026-10-12 23:59:59**；`IsAutoRenew=false`；PREPAYMENT | 未续费、未调整套餐 |
| 云函数清单 | list 返回 39 个，列表显示部署完成；主线 23 个详情均 Active / Available / InstallDependency TRUE | 历史同环境名函数详情为 UpdateFailed / Available，最后修改 6/3，原因含 ResourceNotFound.Function；列表显示不能替代详情；16 个非主线历史函数没有删除 |
| 主线入口源码 | `GetFunction.CodeInfo` 返回的 **23/23 个 index.js 与本地逐字节一致**，已保存 SHA-256 | **只证明 index.js；不证明 lib、rotation、logic、依赖包等全部文件一致** |
| 主线修改时间 | 22 个函数在 9 月 12 日 21:51–22:05；waterSession 为 22:18:40 | 与历史部署/修复记录相符 |
| 主线运行时与超时 | 21 个 Nodejs16.13 / 3 秒；generateShareCode、manageActivityId 为 Nodejs18.15 / 10 秒 | SDK 声明 2.6.3；未进行升级 |
| 历史函数 | 额外 16 个函数中 reportOpsActivityEvents 为 Nodejs20.19，8 月 14 日创建/修改；全部 39 个均无触发器 | 没有历史源码全量安全审查 |

证据目录：`tmp/online-audit-2026-10-03/backend/`，包括 `cli-functions.json`、`detail-*.json`、`functions-summary.json`、`billing.json`、`env-detail.json`。该目录已被 Git 忽略；原始函数详情/日志包含环境及请求细节，只在本地保管，不应作为公开附件。

## 2. 实际调用、失败及延迟

CLS 使用 `function_name:*`、`src='system'`、`status_code!=202`、`retry_num=0`，按 `request_id` 去重。原始日志中同一请求会有多行，不能直接把 `count(*)` 当调用数。平台 200 仅代表函数运行完成，不保证业务返回 `ok:true`。这些数字包含开发/诊断请求，不能解释成用户数。

| 时间窗口（北京时间） | 全函数独立调用 | 平台 200 | 平台非 200 | startTournament 调用 | 开赛平台 200 | 3 秒硬超时 | 排阵超时异常 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 9/3 00:00–10/3 01:42（约 30 天） | 27,378 | 27,280 | 98 | 472 | 398 | 50 | 24 |
| 9/14 00:00–10/3 01:42 | 17,681 | 17,617 | 64 | 313 | 264 | 36 | 13 |
| 9/26 00:00–10/3 01:42（约 7 天） | 6,787 | 6,771 | 16 | 113 | 99 | 7 | 7 |

第二窗口从发布当日零点开始，早于正式发布的 12:32，因此不将它称为严格的“发布后”窗口。30 天中的 3 次缺参异常与历史无写入烟测吻合；5 次 waterSession 443 位于历史故障窗口，最近两个窗口均未发现 443，不能作为现在仍故障的证据。

### P1：开赛链路预算不足，存在真实重复失败

- 约 30 天失败率为 **74/472 = 15.68%**；近 7 天为 **14/113 = 12.39%**。近 7 天全函数失败中的 14/16 来自开赛。
- 最新硬超时：**10 月 2 日 23:42:39**；最新排阵超时异常：**10 月 2 日 14:55:30**。不是仅存在于旧发布前的异常。
- 74 个失败请求关联 53 个赛事，13 个赛事出现多次失败，单赛事最多 5 次。这里只报告汇总，未公开赛事标识。
- 50 个硬超时都有阶段日志：49 个 `legacy-guarded`，1 个 `greedy-fallback`；排阵耗时 2506–3539ms。**47/50 个硬超时出现 `phase:done`**。该日志位于事务回调内、写入请求完成之后，不能证明事务最终提交或后续分享更新已完成，提示需同时处理“提交状态不明确”的恢复路径。
- 最新一例为 11 人、22 场、2 场地：`scheduleMs=2506`、`materializeMs=1`、`writeMs=236`、`totalMs=2997`，随后平台报 3 秒超时。另有 33 人、35 场、2 场地的 greedy-fallback 排阵用时 2688ms。
- `startTournament/index.js:102` 在事务内读取/生成排阵/写入及幂等；`:275` 输出 done；`:300` 事务后仍等待分享。`lib/share-activity.js` 分享更新单项等待上限 1800ms。不能仅增加算法循环预算而不处理端到端余量。

建议：首先用这些真实参数构建直接回归，明确端到端预算和云端 timeout/memory 配置；保护开赛事务提交与幂等恢复，把非关键分享尾部工作从关键响应时限中分离。不要仅用“Active”或本地算法跑完作为修复验收。验收需包含同请求重试、已写入后返回超时、事务重试，以及线上同口径错误率和 P95 回落。

### 近 7 天主要接口指标

延迟为 CLS 对筛选后的**日志行**执行 `approx_percentile` 得到的近似百分位，包含成功和平台错误，已排除 202 中间态。调用数按 request_id 去重，但百分位查询未先按 request_id 去重，未证明所有请求的日志重复倍数相同，因此以下 P50/P95/P99 是**日志行加权近似值，未核实请求级百分位**，不作为独立 APM 追踪数据。

| 接口 | 独立调用 | 平台失败 | P50 ms | P95 ms | P99 ms | 最大 ms |
|---|---:|---:|---:|---:|---:|---:|
| startTournament | 113 | 14 | 1016 | **3000** | 3000 | 3000 |
| scoreLock | 3037 | 2 | 287 | 504 | 746 | 3000 |
| submitScore | 565 | 0 | 308 | 682 | 1024 | 2743 |
| waterSession | 191 | 0 | 230 | 1018 | 1300 | 1621 |
| createTournament | 157 | 0 | 460 | 715 | 913 | 1503 |
| joinTournament | 223 | 0 | 359 | 864 | 1460 | 2716 |
| saveUserProfile | 288 | 0 | 561 | 1111 | 1535 | 1731 |
| getUserProfile | 553 | 0 | 62 | 279 | 397 | 988 |
| generateShareCode | 47 | 0 | 1059 | 1423 | 1477 | 1477 |

近 7 天 scoreLock 的 2 次失败为 1 次硬超时、1 次写冲突；自 9/14 起还有 submitScore 两次硬超时、getUserProfile 一次硬超时，均于 9/24，需保留提交结果恢复/锁冲突监控，不能推断数据已丢失。

证据：`fn-unique-2026-09-03.json`、`fn-unique-2026-09-14.json`、`fn-unique-2026-09-26.json`、`failure-days.json`、`fn-percentiles-7d.json`、`start-failed-requestids.json`、`start-error-context-*.json`、`start-failure-summary.json`。查询 30 天日志的最早返回时间已覆盖 9/3，未出现 SQL 聚合截断；没有拉取全部原始日志，只拉汇总与失败关联日志。

## 3. 数据库实际安全规则和索引

13 个当前业务集合均通过 `DescribeSafeRule` 实时查询，接口含正确 WxAppId。类别含义按[腾讯云查询数据库安全规则文档](https://cloud.tencent.com/document/api/876/128118)核对；这些规则约束客户端访问，云函数仍需自行校验业务权限。

| 集合 | 当前规则 |
|---|---|
| client_request_logs | ADMINONLY |
| waterRooms / waterRoomMembers / waterRounds / waterEntries / waterMigrations / water_feature_flags | ADMINONLY |
| delete_tournament_requests / feedbacks / score_locks / user_profiles / waterSessions | PRIVATE（创建者及管理端） |
| tournaments | CUSTOM：`read: auth != null`；`write: doc._openid == auth.openid` |

**需要明确的隐私/写入边界**：登录用户可读赛事整个文档，包括赛事中保存的成员 ID、昵称等字段；客户端列表过滤不构成数据库访问限制。这可能是分享看赛的现有产品决定，不能直接称为越权事故。数据代理只读 count 核实当前 2764 个赛事全部没有 `_openid`，未发现这些既有文档被该条件直接赋予客户端写权限；但当前规则不是显式的管理端独占写，应针对新建路径与身份上下文做隔离验证，评估是否将写权限明确收紧并保留分享阅读语义。本次没有尝试真实越权写入。

五项 water V2 索引已逐项核对存在且字段/方向一致：

- `waterRoomMembers_openid_id_asc`：openid ASC、_id ASC；非唯一，统计访问 38 次，since 9/12 21:46:50。
- `waterRounds_roomId_number_desc`：roomId ASC、number DESC。
- `waterEntries_roomId_roundId_seq_desc`：roomId ASC、roundId ASC、seq DESC。
- `waterEntries_roundId_category_seq_desc`：roundId ASC、category ASC、seq DESC。
- `waterEntries_rootEntryId_seq_asc`：rootEntryId ASC、seq ASC。

tournaments 另有 playerIds ASC + status ASC 索引且已有访问。检查时`docs/context/architecture.md`仍写新 membership 索引未部署，属于已确认文档漂移；主控已在本轮更新为远端核实状态。`user_profiles`、`client_request_logs` 索引也已保存，不能仅凭集合 inventory 的 index_count 当作实时完整索引清单。

flags 实时 revision11：v2Read、rosterWrite、ownerWrite、memberWrite、correctWrite、reverseWrite、createRoundWrite 均 true；emergencyReadOnly false；两个灰度名单为空。该项由数据代理读取，本报告不重复拉业务数据。

证据：`rules-*.json`、`rules-summary.json`、`indexes-*.json`；数据代理 `tmp/audit-20261003-data/water_feature_flags-metadata.json` 与只读 `_openid` 计数回执。

## 4. 权限、幂等、并发和错误合同复核

- 主线身份均来自 `getWXContext`。赛事管理以 creator、录分以 creator/participant 判断；不是通过 event 自报用户 ID 获得管理身份。裁判分配目前是保留能力，不是录分权限开关，见 `scripts/permission-common.template.js:11`，不应对外宣传为裁判独占录分。
- 主要赛事写路径有事务或 version 条件；create/clone/start/delete/资料等使用请求日志幂等。`waterSession` V2 用事务、room/round version、成员权限、请求 ID 与 payload hash；同请求换载荷拒绝，不会把 V2 幂等日志误当全量行为日志。
- 上次修复的锁 session 校验、带 session 条件清锁、读取错误分类已存在于当前入口/共享模板。未重新执行远端写入用例。
- **P2 已知合同缺口**：`submitScore/index.js:118–165` 先读 score_locks 再以 tournaments.version 更新赛事，两文档不在同一事务；读取后锁接管仍有窗口。session 兼容条件在 `:141` 允许请求不传 session 的旧客户端。现有 version 防止并发覆盖，但不能证明锁始终由提交者持有。本次未在真实云重现错误比分，不能夸大为已发生事故；在修复开赛后作为下一项直接并发回归。
- `scripts/cloud-common.template.js:110` 的 runTransactionCompat 在缺少事务 API 时可退化为普通 collection。已部署 SDK 支持事务；当前没有退化实际发生证据。SDK升级/后端迁移时必须保留跨文档原子性，不能以兼容函数成功返回作为证明。
- 打水历史 listLedgers 仍扫描本人 membership 并逐项确认房间再排序，成本随本人账本数增加；目前体量不支持把它提升为首要性能问题。先观测历史列表 P95、扫描数，再决定分页或摘要优化。

## 5. 使用留痕与运维可观测性

远端 `reportOpsActivityEvents` 8/14 已部署，index.js 中只有 `OPS_ACTIVITY_EVENTS_ENABLED==='true'` 才进入采集；实时 `Environment.Variables=[]`，据源码可判断该部署默认 disabled。约 30 天 CLS 汇总没有该函数调用。没有调用它来写入测试事件。当前客户端是否接入、we分析事件统计和业务日志覆盖，以数据代理报告为准。

`client_request_logs` 是成功写入的幂等记录，不能代表打开页面、点击按钮、失败、取消、留存或完整用户旅程。现有 CLS 可回答平台故障和部分耗时，无法完整回答业务转化。下一步应先定义少量关键事件及漏斗，再实现最小字段、去标识、保留周期、失败/去重计数，并用真实设备一次完整旅程检查到端。

CLI 旧 `fn log` 接口已被底层下线，本次收到明确弃用错误后改用 `logs search` 成功。运维文档应将日志入口更新为 CLS，保存统一的 request_id 去重查询及业务成功/失败口径，避免三倍计数。

## 6. 资源配额读取与限制

现有环境不是资源点计费，`env usage` / `env info` 明确不支持。另通过 `DescribeQuotaData` 读取到以下原始快照：

| MetricName | 原始 Value |
|---|---:|
| DbReadpkg | 202 |
| DbWritepkg | 0 |
| DbSizepkg | 36 |
| FunctionInvocationpkg | 19,258 |
| FunctionGBspkg | 1,772,748,800 |
| FunctionFluxpkg | 0 |
| StorageSizepkg | 27 |
| StorageReadpkg | 28,966 |
| StorageWritepkg | 488 |

这些是配额接口口径，不能与上述自选 CLS 时间窗口直接相加/比较，也不能把 DbWritepkg=0 解释为没有业务写入。API 对多种指标的精确单位与当前套餐周期没有在本轮完整核实，因此保留原值，不换算费用或算配额百分比。存储空间指标文档单位为 MB，见[配额使用量接口](https://cloud.tencent.cn/document/product/876/42145)。证据为 `quota-*.json`、`quota-summary.json`。

## 7. 后续次序与未覆盖项

1. **P1 立即安排开赛可靠性修复**：真实案例回归 → 端到端预算/超时配置 → 事务结果恢复/幂等 → 上线前写入边界验收 → 线上错误率和延迟复测。
2. **P1 在 10/12 前处理服务续期**，当前自动续费关闭；同步确定备份频率与恢复演练。此次仅查状态，不操作费用。
3. **P1 完成使用留痕验收及最小故障看板**：业务事件成功率/开赛成功率/录分冲突与超时/关键延迟，区分用户旅程与运维日志。
4. **P2 收紧/明确数据可见性和客户端写入合同**，并修复录分锁跨文档竞态；避免把公开赛事直接变成不可分享。
5. **P2 依赖与运行时维护**：先核实当前环境支持版本，再用隔离验证升级 Node 和 SDK；23 个函数没有随库提交依赖 lock，根目录 npm audit 不覆盖云端安装结果，不在本轮声称云依赖无漏洞。可用远端完整包建立可复现依赖清单后审计。
6. **P2 灾备与历史资源治理**：备份仍以 9/11 在线非原子备份为最近完整历史证据；补充第二故障域及恢复演练。16 个历史函数先查调用/依赖再决定归档，不能直接删除。
7. **P3 有观测证据再做历史查询成本、资料同步扫描、冷启动和包体优化**。当前首要问题不在泛化重构或全面迁云。

未验证：完整线上 ZIP/lib/依赖逐文件一致性、真实手机从创建到记分/打水的全部写入路径、云事务竞态实测、安全规则新建绕行、全量原始日志、精确成本/SLO/告警订阅配置、恢复演练。没有将这些缺口报告为通过。
