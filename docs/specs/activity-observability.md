# 关键行为与云故障留痕：本地准备合同

适用范围：现行本地埋点与匿名数据合同；12项计划已按用户指令恢复。后台实收/观察闭环不因本地接入交付而通过，最新状态见 [详细状态](../tasks/paused-plan-status.md)，按 [总索引](../README.md) 读取。下方日期是已有实现证据的时点，不作为外部动作授权。

状态：截至2026-10-04，本地客户端最小接入、手动提前收赛补漏、只读离线工具与合成SDK验收已完成；微信后台配置、真实客户端实收、上传/发布及监控闭环**未完成**。本文件不是生产启用回执，不改变现有growthTracker的buildPayload合同。入口与授权依据见[总计划第3项](../reports/2026-10-03-online-audit-and-roadmap.md)、[本轮准备记录](../tasks/session-logs/2026-10-03-observability-preparation.md)。

## 本轮已经实现的最小通道

`core/activityTracker.js`仅调用现有wx.reportEvent，事件名固定activity_attempt/activity_result/activity_view，不写本地持久存储、不打印payload、不调用reportOpsActivityEvents、不重发事件。老growth事件保持原行为。`core/cloud.js`统一接入create/clone/join/start/submitScore/updateSettings、scoreLock acquire及waterSession的create/createLedger/join/addParticipants/recordGame/recordDirect/correctEntry/reverseEntry/undoLast/createRound；读取、锁心跳与释放不采。water页onLoad只补water_enter，不改变可见页面。2026-10-03补充分享入口attempt/result、短期手动重试关联和录分返回finished状态确认；sharePageMixin集中接入ranking/analytics的实际onShareAppMessage/onShareTimeline，lobby/schedule的实际onShareAppMessage直接接入同一tournament_share。既有view仍沿用老事件，新通道的页面事件无云trace时留空。[补齐记录](../tasks/session-logs/2026-10-03-observability-completion.md)。

当前埋点通道经 `wx.reportEvent` 发送 `activity_attempt`、`activity_result`、`activity_view` 三个事件名，三者共用下列17个 `data` 属性；事件名参数本身不在 `data` 内。类型与取值形态由 `core/activityTracker.js` 推导，只说明现码，不代表微信平台接受了这些字段或格式。配置与实收尚未核实。

| 属性 | JavaScript 类型与现码取值 |
| --- | --- |
| `schemaVersion` | number，整数 `1` |
| `eventId` | string，由随机ID与phase生成 |
| `operationId` | string，随机不透明ID |
| `intentId` | string，随机不透明ID |
| `attemptIndex` | number，正整数 |
| `eventTime` | number，`Date.now()`毫秒时间戳 |
| `phase` | string：`attempt` / `result` / `view` |
| `action` | string，固定动作枚举 |
| `anonymousSessionId` | string，进程内随机ID |
| `traceId` | string；缺失或格式不符时为空字符串 |
| `appVersion` | string；版本缺失或不符时为空字符串，有效值最多64字符 |
| `envVersion` | string：`develop` / `trial` / `release`，或空字符串 |
| `result` | string，固定结果枚举；attempt为 `pending`，view为 `view` |
| `resultCode` | string，固定代码或通用结果枚举；允许空字符串，不发送任意错误文本 |
| `durationMs` | number，非负整数，最多86,400,000 |
| `retryCount` | number，非负整数，最多10 |
| `firstEntry` | string：`not_applicable` / `replayed` / `unknown` / `yes` / `no` |

只读SDK `getAccountInfoSync` 的 `miniProgram.version` / `envVersion`；缺失时为空，开发环境不填假发布版本。`anonymousSessionId` 在进程内随机生成、无跨重启身份意义，既不使用openid也不使用赛事短hash。trace只接受已登记函数名+时间+随机串的既有生成格式，调用者自由输入丢弃；resultCode采用已知码allowlist，其余归 `SUCCESS` / `BUSINESS_REJECTED` / `RESULT_UNKNOWN` / `SDK_EXCEPTION` 等固定枚举。

一次cloud.call只发一对attempt/result；内部网络自动重试沿用operationId/traceId，结果列retryCount，不增加attemptIndex。两个phase的eventId分别稳定为operationId_attempt/operationId_result；同一eventId运输重复可离线去重，发送本身不重试。手动重试重新调用cloud.call产生新的operationId/traceId；同一进程内同函数、同已登记原始子动作及同clientRequestId复用随机intentId，attemptIndex从1递增。关联范围使用函数名及waterSession/scoreLock的原始action，不使用归一化事件action：create/createLedger虽都发送water_create，仍是两个独立意图。范围仅留进程内，不增发送字段、不hash。原始ID只作为进程内Map键，不发送、不hash、不存盘、不日志；只接纳非空且最多256字符的字符串，最多保留100组，满额逐出最早组，每组从首次调用起固定30分钟到期，定时清除且新调用也清理过期组。到期、逐出、进程重启或没有合法请求ID都产生新随机意图，不能据此推算跨会话独立用户数；attemptIndex表示cloud.call次数，不表示已验证的点击次数。

share_enter在页面onLoad读取前发attempt；远端读取或新鲜watch快照确认目标时result=success/TARGET_CONFIRMED；reuse_cache、缓存回退和已有文档兜底不算云端确认，读取失败为failure/LOAD_FAILED，缺失为missing/TARGET_MISSING，缺参数为failure/LINK_INVALID。onHide不记离开，未完成操作在onUnload才记left/PAGE_LEFT；完成后卸载与迟到响应不再追加结果。显式重试新开一次入口操作，后台刷新不增加attempt。当前没有采集页面加载中身份识别是否完成的附加结果。

submitScore的ok:true响应显式finished:true（顶层或data）只追加一个tournament_complete的result观察：result=finished_confirmed、resultCode=FINISHED_CONFIRMED，与score_submit共用operationId/intentId/traceId，eventId为operationId_tournament_complete_result。重放也只能确认finished；不能证明第一次完成、状态切换或最后一场意图。没有权威的提交前完成判断，因此不伪造completion attempt，该动作完成漏斗仍未完整覆盖。

手动提前结束已有真实确认操作，2026-10-04将`finishTournament`登记为独立`tournament_finish`：只在确认并复核状态/权限后实际cloud.call时产生attempt/result。成功、deduped、三个既有业务拒绝码及SDK异常沿用统一合同；同请求的手动重试保留intent，内部网络重试只增加retryCount。只增加函数/固定码登记，不改UI或后端；仍是17字段，返回finished:true也不额外生成tournament_complete，不推断首次完成。取消或页面门控阻断没有cloud.call，不制造事件。

tournament_share仅在实际赛事分享回调被用户调用时发一对attempt/result，覆盖当前源码的ranking/analytics两种hook以及lobby/schedule的onShareAppMessage。菜单启用、预热、海报生成/保存、复制文案及朋友圈引导不计该动作；微信没有送达回执，result固定unknown/DELIVERY_UNKNOWN，不能统计真实发送、取消或接收。独立water账本分享不误记为赛事分享，water_share不属于本轮范围。

首笔只依据V2权威返回entry：`waterSession/index.js:2238`以round.nextSeq（初始1）生成seq、`:2283`返回publicEntry，其eventType/seq由`:694`投影。仅recordGame/recordDirect成功且原始game_recorded/transfer_recorded的seq=1时firstEntry=yes，seq>1为no；deduped为replayed，缺字段、V1及无法证明的场景为unknown/not_applicable。分页为空从不判首笔，更正/撤销不算首笔。该指标证明“本轮首个原始记账”，不能单靠它给出“新账本7日首笔率”：当前不发送房间身份和创建队列映射，跨设备/会话精确分母及导入历史排除仍需后续明确匿名关联合同。

合成SDK已覆盖11种原指定写动作及本轮手动收赛、业务ok:false、最终异常、自动重试/手动重试、失败不阻塞、PII字段剔除与eventId去重；它不证明微信后台已配置这些事件或实收。生产启用前还需确认reportEvent实际配置/字段接受合同与受限实收证据；不能照搬旧reportAnalytics的后台步骤。此前公众平台页面受tool site-policy禁止访问，本轮仅静态官方资料/本地源码核对，没有绕过或新访问后台。后台证据须由可用获准入口或用户提供。以下清单与保留/额度为后续闭环方案，尚未部署。

## 官方通道与查询边界

10-04静态核对[微信官方API类型定义](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts#L29936-L29971)：reportAnalytics为旧自定义分析接口，注释要求预配置事件/字段且标注基础库2.31.1起废弃；reportEvent首参是mp实验系统设置的事件英文名，第二参是可JSON.stringify的对象。首参形参名eventId表示事件定义名，与当前data.eventId的逐记录ID不同。类型注释未给17字段数量/叶值/空值/高基数查询规则；可序列化不证明平台存储或开放逐条查询。本次所查官方资料和本地CI命令未证实事件定义/实收查询CLI或OpenAPI，不能据无命中宣称不存在。现有fetch-we-analysis仅标准访问/留存datacube接口，不能代替自定义事件实收。

现有cloud-ops-daily-report只解析CLS raw/aggregate，不读取微信事件导出或保留action/eventId/operationId。因此真实事件逐ID对账须先取得平台实际导出/查询结构和接收计数合同，再实现必要的窄范围离线核验；当前不能臆造schema或用合成SDK当接受回执。如果实际入口只提供聚合而没有逐事件ID，精确运输去重/配对只能记未验证。当前用户答后台配置“不确定”，状态继续未核实。

## 最小动作清单

后续完整合同要求同一次用户意图可关联，每个attempt/result各有稳定eventId；本轮operationId按一次cloud.call划分，intentId的进程/时效/上限限制见上文。网络重送同一事件保留eventId，自动SDK重试不能伪造额外用户点击。下表是完整闭环的拟议清单，既有view及本轮实现范围之外的阶段仍未覆盖，特别是tournament_complete目前仅结果状态观察。

| action | attempt触发点 | result触发点/判断 |
| --- | --- | --- |
| share_enter | 分享入口开始加载 | 成功获得目标状态或找不到/读取失败/用户离开 |
| tournament_join | 确认加入且启动调用 | joined/deduped、权限/资料不足、调用失败或未知提交状态 |
| tournament_create | 确认创建且启动调用 | created/deduped、业务拒绝、网络失败；不能把导航成功当创建成功 |
| tournament_start | 确认开赛且启动调用 | started/deduped、START_TIMEOUT、状态/权限拒绝、平台超时；恢复读取另记recovered而非第二次写入成功 |
| score_enter | 合法进入录分及申请锁 | acquired/occupied/expired/forbidden/load_failed |
| score_submit | 确认有效比分并启动提交 | submitted/deduped、LOCK_EXPIRED/LOCK_OCCUPIED/VERSION_CONFLICT、网络失败/提交结果未知 |
| water_create | 确认新账本并启动调用 | created/deduped或拒绝/失败 |
| water_add_members | 确认名单并启动调用 | updated/deduped或拒绝/失败；不采成员姓名和名单文本 |
| water_first_entry | 提交本轮首笔有效账务操作 | 云端确认当前轮首次有效rootEntry时成功；重送/更正/撤销不重复算首笔；客户端无法确认首次时标firstEntryUnknown |
| tournament_complete | 拟议：最后一场有效比分提交意图；当前无法证明，未采attempt | 当前仅ok:true且显式finished:true的finished_confirmed结果观察，与score_submit同operationId、独立eventId；不算首次完成 |
| tournament_finish | 已有提前结束确认及状态/权限复核后实际调用finishTournament | success/deduped、FINISH_RUNNING_ONLY/FINISH_SCORE_REQUIRED/FINISH_REQUEST_EXPIRED、权限/锁/版本拒绝、SDK异常；不额外派生首次完赛 |
| tournament_share | 已接入页面实际分享回调被用户调用 | 当前固定unknown/DELIVERY_UNKNOWN；无平台送达回执，不把分享调用算实际接收 |

打水漏斗为进入→新建/打开账本→添加或绑定成员→首笔attempt→首笔result。需先以真实场景解释未记账原因；仅创建账本数与PV不构成完整漏斗。第7项已新增提前收赛，现已补独立tournament_finish；不采集不存在的UI动作。

## 字段与数据边界

若未来另行实现独立接收服务，曾拟议加入服务端 `receivedAt`、明确测试才填写的 `testRunId` 及非身份枚举 `mode/status`，并由接收服务将未知结果码归入 `OTHER`。这些仅是未来服务/统计schema建议，不是当前 `wx.reportEvent` 字段或已核实的平台配置事实；当前客户端不发送上述字段，也没有 `OTHER` 归类。当前实际 `data` 属性及JS类型以上方当前字段表和源码为准。未来方案中 `eventTime` 为UTC毫秒，报表展示固定北京时间窗口；服务端可记录接收时间以区分设备时钟偏差。eventId/operationId/anonymousSessionId是随机不透明标识，不从openid/手机号/姓名派生。用户输入不能作为action/result/code自由文本；原始错误仅在现有受限CLS内诊断。

禁止采集姓名、头像、联系方式、昵称、名单文本、比分备注、其他文本输入、openid、unionid、客户端完整payload、原始赛事/账本/成员ID。事件本身不需要还原个人身份；服务端认证仍通过getWXContext，认证字段不可直接入事件存储。若确需跨周主办者匿名关联，先定义单独的HMAC标识/轮换周期和允许用途，不能把现有32位赛事哈希当匿名个人身份或防碰撞ID。

traceId复用 `core/cloud.js` 已生成的__traceId；同一操作的重试保留操作关联。它只关联诊断，不作为用户可见文案或身份。结果缺trace/版本时报告missing，不填假版本。生产/体验/开发由envVersion区分；当前客户端没有 `testRunId` 字段，既有共用云环境中的历史请求也可能缺少版本，不能事后精确剔除测试账户。

客户端错误/采集disabled、限流、接收失败均不能阻塞主要业务，也不能产生额外Toast。服务端accepted/deduped/rejected/dropped逐项对账；函数ok不等于全批接受，事件接收调用不得触发自己再次采集。既有成功幂等日志保留原合同，不改作行为日志。

若后续确需独立接收服务，建议供生产启用前定稿：原始最小事件保留14天、仅不含会话/trace的日聚合保留90天；访问者仅项目所有者/明确授予的运维管理员，客户端禁止直读/枚举。先从全局每日1000事件、单客户端会话20事件及单批10事件试运行，统计dropped和rate_limited后调整；这些是初始建议，**未启用、未证明够用**。本轮仅wx.reportEvent，微信后台实际保留/权限/额度需后台核实，不能宣称已执行该建议。删除/TTL、HMAC密钥轮换与备份保留需要一起检验，避免自动备份无限保留已到期事件。既有接收包的本地协议核对见下节；当前云端集合权限、TTL与部署配置仍未验证，不能按本文件绕过既有校验。

## 既有接收函数的只读协议核对

10-04使用E副本实际恢复出的reportOpsActivityEvents完整入口/logic/retention核对；该包不在main受管源码中，只读原件，未执行/连接云。文件SHA、代码行和读取时点沿革见`tmp/ops-receiver-contract-next-20261004/REPORT.md`及[准备日志](../tasks/session-logs/2026-10-03-observability-preparation.md)。原来的“完整包协议未读”缺口已补，本地代码证明如下，不能当当前云配置/规则事实：

- 代码默认disabled，启用还需环境中的HMAC密钥/版本、AppID和普通微信身份门禁；实际配置未读。包络为events[]，eventId必须event_加32位hex，事件allowlist是旧海报/分享类；当前三个通用事件名、17字段和ID格式均不兼容，不能只开ENABLE或把data直接传入。
- 保存跨会话HMAC actorKey，未保留当前anonymousSessionId/appVersion/envVersion；trace只在批次级。与当前匿名会话/版本目标不同，不能把旧身份关联视为已批准的替代合同。
- 最多20条/32KiB、每actor每分钟5批及每日200新事件；全局日额度缺失/非法降为1。代码写180天expiresAtMs，但retention只列清理候选、未删除；实际TTL/调度/访问和备份清理未验。不得把本文件14天/批次10/全局1000建议当已执行。
- 去重是actor+eventId；部分拒绝时ok:true不等于全接受。限流或数据库失败的未接受项没有完整归入dropped，不能用四项总数作无条件守恒或把失败丢弃量判0。未来若选此通道，须先定稿映射、隐私/保留和回执对账，再独立实现验证；当前维持仅wx.reportEvent，不新增第二接收平台。

## 每日CLS报告入口

工具为 `scripts/cloud-ops-daily-report.js`。默认仅离线读取manifest明确列出的JSON，不扫描目录、不读取业务库、不调用函数、不生成事件；本轮不提供live执行模式。只读查询计划用：

```powershell
node scripts/cloud-ops-daily-report.js --queries --start '2026-10-03 02:32:05' --end '2026-10-03 07:00:00'
```

执行计划时使用已有CloudBase CLI的 `logs search --timeRange ... --limit 100 --query ... --json`；分页继续使用返回context，记录每页实际inputContext直到listOver=true。只读计划含完整原始日志、request_id-distinct平台聚合、异常筛选及缺参查询。异常筛选只是定位线索，不能代替完整窗口。CLI返回原始文件可能含身份/业务文本，只保留在Git忽略的受限本地tmp；离线报告不复制status_msg/log原文。

manifest放在采样目录中；只能引用该目录内明确文件。示例：

```json
{
  "window": {"start":"2026-10-03 00:00:00","end":"2026-10-03 23:59:59","timeZone":"Asia/Shanghai"},
  "sources": [{
    "name":"daily-raw", "kind":"raw",
    "files":[{"file":"page-001.json","inputContext":""},{"file":"page-002.json","inputContext":"上一页返回的context"}]
  }]
}
```

```powershell
node scripts/cloud-ops-daily-report.js --manifest tmp/NEW_SAMPLE/input.json --output tmp/NEW_REPORT
```

`--output`拒绝任何既有目录，包含空目录；不指定输出时只输出JSON。成功exit=0；解析/参数失败exit=1；已解析但缺页/元数据等不完整exit=2。已有聚合采样用kind=aggregate，若行无function_name需在source指定functionName；不将分组invocations累加成可证明的独立请求总数。

报表规则：

- 时间窗口必须Asia/Shanghai且起止明确；每份CLI响应的meta窗口必须一致，禁止混历史查询文件。分页query必须一致、每页inputContext必须匹配上一页context，末页必须listOver=true；SQL聚合到达LIMIT仍标可能截断，CLI listOver不能证明SQL未截断。
- 原始日志仅接纳src=system/app、retry_num=0，终态排除202；按function_name+request_id去重。相同请求多个冲突平台状态/业务结果标conflict，不能选择有利结果。app失败用同request_id关联；committed/returned日志不等于ok:true。
- 平台200与业务ok分开计数；没业务结果就是unknown。只有完整且包含全函数或指定函数完整原始查询时才输出平台失败率；异常子集与聚合不输出全量失败率。P95是每请求终态耗时最大值的nearest-rank，并报告durationCoverage；不使用日志行加权P95冒充请求P95。
- TOURNAMENT_ID_REQUIRED单列“缺参烟测候选”，既有部署烟测可由回执确认为诊断请求；单凭错误码不能证明是测试。主体指标排除了该候选，metricPopulation明确说明口径；生产活动精确分离仍未验证。
- traceId/appVersion缺失如实计数；聚合不能恢复request关联，报告requestReconstruction=unavailable-aggregate-only。complete只表示指定输入查询/分页可核对，**不表示线上业务验收、7日观察或留痕闭环已完成**。

日报建议关注开赛硬超时/业务START_TIMEOUT、录分平台失败/锁占用及冲突、首笔记账result缺失和接收丢弃；只从同窗口完整数据触发阈值判断。开赛7天至少100调用、硬超时0、平台失败低于1%仍需完整观察期，单日无调用不能宣称通过。每日简报工具不等同计划任务或告警订阅，本轮没有创建自动化。

## 生产启用前具体门禁

先完成完整远端包协议核对、客户端最小实现/回归、脱敏/去重/失败/禁用/额度直接测试、字段清单和保留/访问配置、明确指定的测试旅程及回退步骤，形成可审差异。本地准备无需额外授权；启用开关、部署函数、创建/修改生产集合或规则、事件测试实收写入、客户端上传/发布各按当前用户授权边界取得该项授权。密钥由服务端安全配置保管，不写公开文档/仓库。首次闭环验收必须有真实客户端触发→接受/去重计数→受限查询→事件ID对账，未满足不称完成。
