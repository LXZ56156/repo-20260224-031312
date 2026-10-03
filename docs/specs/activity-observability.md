# 关键行为与云故障留痕：本地准备合同

适用范围：现行本地埋点与匿名数据合同；原任务暂停。后台实收/观察闭环不因本地准备完成而通过，最新状态见 [详细状态](../tasks/paused-plan-status.md)，按 [总索引](../README.md) 读取。下方日期是已有实现证据的时点，不作为恢复任务授权。

状态：2026-10-03本地客户端最小接入、只读离线工具与合成SDK验收已完成；微信后台配置、真实客户端实收、上传/发布及监控闭环**未完成**。本文件不是生产启用回执，不改变现有growthTracker的buildPayload合同。入口与授权依据见[总计划第3项](../reports/2026-10-03-online-audit-and-roadmap.md)、[本轮准备记录](../tasks/session-logs/2026-10-03-observability-preparation.md)。

## 本轮已经实现的最小通道

`core/activityTracker.js`仅调用现有wx.reportEvent，事件名固定activity_attempt/activity_result/activity_view，不写本地持久存储、不打印payload、不调用reportOpsActivityEvents、不重发事件。老growth事件保持原行为。`core/cloud.js`统一接入create/clone/join/start/submitScore/updateSettings、scoreLock acquire及waterSession的create/createLedger/join/addParticipants/recordGame/recordDirect/correctEntry/reverseEntry/undoLast/createRound；读取、锁心跳与释放不采。water页onLoad只补water_enter，不改变可见页面。2026-10-03补充分享入口attempt/result、短期手动重试关联和录分返回finished状态确认；sharePageMixin集中接入ranking/analytics的实际onShareAppMessage/onShareTimeline，lobby/schedule的实际onShareAppMessage直接接入同一tournament_share。既有view仍沿用老事件，新通道的页面事件无云trace时留空。[补齐记录](../tasks/session-logs/2026-10-03-observability-completion.md)。

实际发送allowlist固定为schemaVersion/eventId/operationId/intentId/attemptIndex/eventTime/phase/action/anonymousSessionId/traceId/appVersion/envVersion/result/resultCode/durationMs/retryCount/firstEntry。只读SDK getAccountInfoSync的miniProgram.version/envVersion；缺失时为空，开发环境不填假发布版本。anonymousSessionId在进程内随机生成、无跨重启身份意义，既不使用openid也不使用赛事短hash。trace只接受已登记函数名+时间+随机串的既有生成格式，调用者自由输入丢弃；resultCode采用已知码allowlist，其余归SUCCESS/BUSINESS_REJECTED/RESULT_UNKNOWN/SDK_EXCEPTION等固定枚举。

一次cloud.call只发一对attempt/result；内部网络自动重试沿用operationId/traceId，结果列retryCount，不增加attemptIndex。两个phase的eventId分别稳定为operationId_attempt/operationId_result；同一eventId运输重复可离线去重，发送本身不重试。手动重试重新调用cloud.call产生新的operationId/traceId；同一进程内同函数、同已登记原始子动作及同clientRequestId复用随机intentId，attemptIndex从1递增。关联范围使用函数名及waterSession/scoreLock的原始action，不使用归一化事件action：create/createLedger虽都发送water_create，仍是两个独立意图。范围仅留进程内，不增发送字段、不hash。原始ID只作为进程内Map键，不发送、不hash、不存盘、不日志；只接纳非空且最多256字符的字符串，最多保留100组，满额逐出最早组，每组从首次调用起固定30分钟到期，定时清除且新调用也清理过期组。到期、逐出、进程重启或没有合法请求ID都产生新随机意图，不能据此推算跨会话独立用户数；attemptIndex表示cloud.call次数，不表示已验证的点击次数。

share_enter在页面onLoad读取前发attempt；远端读取或新鲜watch快照确认目标时result=success/TARGET_CONFIRMED；reuse_cache、缓存回退和已有文档兜底不算云端确认，读取失败为failure/LOAD_FAILED，缺失为missing/TARGET_MISSING，缺参数为failure/LINK_INVALID。onHide不记离开，未完成操作在onUnload才记left/PAGE_LEFT；完成后卸载与迟到响应不再追加结果。显式重试新开一次入口操作，后台刷新不增加attempt。当前没有采集页面加载中身份识别是否完成的附加结果。

submitScore的ok:true响应显式finished:true（顶层或data）只追加一个tournament_complete的result观察：result=finished_confirmed、resultCode=FINISHED_CONFIRMED，与score_submit共用operationId/intentId/traceId，eventId为operationId_tournament_complete_result。重放也只能确认finished；不能证明第一次完成、状态切换或最后一场意图。没有权威的提交前完成判断，因此不伪造completion attempt，该动作完成漏斗仍未完整覆盖。

tournament_share仅在实际赛事分享回调被用户调用时发一对attempt/result，覆盖当前源码的ranking/analytics两种hook以及lobby/schedule的onShareAppMessage。菜单启用、预热、海报生成/保存、复制文案及朋友圈引导不计该动作；微信没有送达回执，result固定unknown/DELIVERY_UNKNOWN，不能统计真实发送、取消或接收。独立water账本分享不误记为赛事分享，water_share不属于本轮范围。

首笔只依据V2权威返回entry：`waterSession/index.js:2238`以round.nextSeq（初始1）生成seq、`:2283`返回publicEntry，其eventType/seq由`:694`投影。仅recordGame/recordDirect成功且原始game_recorded/transfer_recorded的seq=1时firstEntry=yes，seq>1为no；deduped为replayed，缺字段、V1及无法证明的场景为unknown/not_applicable。分页为空从不判首笔，更正/撤销不算首笔。该指标证明“本轮首个原始记账”，不能单靠它给出“新账本7日首笔率”：当前不发送房间身份和创建队列映射，跨设备/会话精确分母及导入历史排除仍需后续明确匿名关联合同。

合成SDK已覆盖11种指定写动作、业务ok:false、最终异常、自动重试/手动重试、失败不阻塞、PII字段剔除与eventId去重；它不证明微信后台已配置这些事件或实收。生产启用前还需事件定义/字段后台配置与受限实收证据。当前公众平台整站受tool site-policy禁止访问，本轮没有绕过；后台证据须由可用获准入口或用户提供。以下清单与保留/额度为后续闭环方案，尚未部署。

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
| tournament_share | 已接入页面实际分享回调被用户调用 | 当前固定unknown/DELIVERY_UNKNOWN；无平台送达回执，不把分享调用算实际接收 |

打水漏斗为进入→新建/打开账本→添加或绑定成员→首笔attempt→首笔result。需先以真实场景解释未记账原因；仅创建账本数与PV不构成完整漏斗。第7项若新增提前收赛，再追加对应动作，不采集不存在的UI动作。

## 字段与数据边界

拟议最小allowlist：schemaVersion、eventId、operationId、eventTime、receivedAt（服务端）、phase、action、result、resultCode、durationMs、appVersion、envVersion、anonymousSessionId、traceId、attemptIndex、testRunId（明确测试才填写）及非身份枚举mode/status。eventTime为UTC毫秒，报表展示固定北京时间窗口；服务端记录接收时间以区分设备时钟偏差。eventId/operationId/anonymousSessionId是随机不透明标识，不从openid/手机号/姓名派生。用户输入不能作为action/result/code自由文本；未知结果码归入OTHER，原始错误仅在现有受限CLS内诊断。

禁止采集姓名、头像、联系方式、昵称、名单文本、比分备注、其他文本输入、openid、unionid、客户端完整payload、原始赛事/账本/成员ID。事件本身不需要还原个人身份；服务端认证仍通过getWXContext，认证字段不可直接入事件存储。若确需跨周主办者匿名关联，先定义单独的HMAC标识/轮换周期和允许用途，不能把现有32位赛事哈希当匿名个人身份或防碰撞ID。

traceId复用 `core/cloud.js` 已生成的__traceId；同一操作的重试保留操作关联。它只关联诊断，不作为用户可见文案或身份。结果缺trace/版本时报告missing，不填假版本。生产/体验/开发由envVersion区分；既有共用云环境中的历史请求未带版本/testRunId，不能事后精确剔除测试账户。

客户端错误/采集disabled、限流、接收失败均不能阻塞主要业务，也不能产生额外Toast。服务端accepted/deduped/rejected/dropped逐项对账；函数ok不等于全批接受，事件接收调用不得触发自己再次采集。既有成功幂等日志保留原合同，不改作行为日志。

若后续确需独立接收服务，建议供生产启用前定稿：原始最小事件保留14天、仅不含会话/trace的日聚合保留90天；访问者仅项目所有者/明确授予的运维管理员，客户端禁止直读/枚举。先从全局每日1000事件、单客户端会话20事件及单批10事件试运行，统计dropped和rate_limited后调整；这些是初始建议，**未启用、未证明够用**。本轮仅wx.reportEvent，微信后台实际保留/权限/额度需后台核实，不能宣称已执行该建议。删除/TTL、HMAC密钥轮换与备份保留需要一起检验，避免自动备份无限保留已到期事件。远端既有协议的byte cap/批次/集合/TTL尚须从完整包logic核实后对齐，不能按本文件绕过既有校验。

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
