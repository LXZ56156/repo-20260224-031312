# 下一步待修清单与任务交接

状态：2026-10-15 18:09起用户仅恢复工具链诊断，产品决策与外部验收保留暂停；之前纯代码交付保留，BIZ-05/TEL-01/UI-01已以88ed12a、BIZ-03/FA-04已以c9798aa交付；EFF-03/07已以4f52ec3交付；EFF-05/06已以2866cd9交付；本批EFF-01部分/EFF-02/ENG-01与依赖、合同评估见下节。10-14 P1源码与离线交付保留。10-13 的暂停回执、UI历史证据与外部未验保留；UI14两个既有文件仍未提交，尚未完成实图门禁。既有配置/单打候选/私有文件逐hash保全。未部署、发布、preview/upload、真实业务写入、付款或扩展凭据权限，不启动中期业务/活动，不新建其他Codex任务。

## 新任务从这里开始

1. 读取[项目规则](../../AGENTS.md)与[current](current.md)，核对checkout、branch、HEAD和dirty；实际Git/npm目录为`D:/projects/badminton-miniapp/main`，总目录不是Git根。
2. 两个业务P1、BIZ-05/TEL-01/UI-01、BIZ-03/FA-04、EFF-03/07及本批EFF-05/06本地实现与相称离线门禁已完成；真实云引擎、当前生产安装包、手机/原生入口与隔离云验收保留未验。不因Node通过关闭外部条件；下一批先按最新授权及下表复现。
3. UI14本轮测试/check/lint及402实图/SDK开关回读通过，本次前台授权与预热已完成。当前缺原生Windows控制入口，正常/430大屏物理背景滚动与设备切换阻塞；SDK事件不替代物理验收，UI14两稿暂不提交。小屏/小屏大字继续跳过，机型/尺寸以实际回读为准。

## 10-15工具链复核与恢复边界

本轮只处理工具链，业务缺陷/产品方案/云与原生验收不追加实施；起点master/5d1e92a，原18项及UI14两稿按原SHA保全。下表是18:09–18:15 UTC新实测，旧记录只作对照，不拿旧错误当新失败。

| 环节 | 当前实测 | 判定 |
| --- | --- | --- |
| 命令执行 18:09 | PowerShell时间、cwd、HEAD/status正常 | Windows执行通；不说明原生控制通 |
| DevTools MCP 18:10 | check_wechatide_status ok/success=true，loginExpired=false；版本比较skip_check | 当前认证和状态读取通，未做刷新、输入或云业务调用 |
| 桌面/核心 18:10–18:12 | 当前运行OpenAI.Codex包26.1007.9446.0，与05:31:53基线一致；包内和活跃托管core --version为0.162.0-alpha.17.2，另有0.162.1 daemon | 未证实对应修复已进入当前桌面；不把Chromium文件版本或CLI版本当桌面版本 |
| CUA最小健康 18:09–18:10 | 唯一一次await cua.getState()；kernel15736退出code1/stdout_eof，MXC launcher: cannot locate required Windows platform directory: HRESULT 0x80070003 | 在JS及控制面枚举之前失败；原生控制阻塞，浏览器UI控制未验；没有reset/重试 |
| 主机目录 18:11 | shell的SystemRoot/WINDIR均指向现存Windows，System32与TEMP存在 | 不支持“主机Windows目录消失”；未取得失败kernel环境，不能确认具体变量根因 |
| 任务读取/导航 18:10–18:13 | list50找到本任务，navigate API成功；read1仅当前委托工具项，read5取回四批完整结论 | 已找到可用历史读取方式；实时评论回读与前端显示稳定性未验 |
| 本地更新检查 18:09 | check_app_update拒绝：App updates are only available on the local desktop host. | 未得到up_to_date/update_available，不能判无更新；未下载/安装/重启 |

**任务读取恢复**：对当前任务调用read_thread时用turnLimit=5（必要时按nextCursor向前），再取agentMessage且phase=final_answer；本轮实际取得5d1e92a、2866cd9、4f52ec3、c9798aa四份结论。只取最新1轮时正在进行轮只有委托输出，没有文字，不能据此判断整个任务为空。本任务元数据仍是durable及云包装cwd，显式hostId=local也返回durable；父来源任务本轮turns=[]。这些是路由/读取事实，不是数据库损坏证明，不修改内部数据库、不复制或重建任务。

**未解决的启动故障**：user给出的PR54027/54069与rust-v0.163.0-alpha.10.1作为上游环境传递线索保留；本次未取得对应桌面可用修复版本。当前错误发生于MXC启动，未进入@oai/sky，不通过shell拉起node_repl或计算机控制helper。Computer Use的[初始化技能](D:/Relocated/LIZIXUAN/Codex/plugins/cache/openai-bundled/computer-use/26.1007.71326/skills/computer-use/SKILL.md)要求从node_repl导入@oai/sky；其轻量超时重试规则不等于应对同一启动失败反复reset。web检索不是浏览器UI，浏览器UI成功也不能代替Windows原生控制成功。

**最小下一步**：在实际本地桌面上下文调用check_app_update或使用应用官方更新检查入口，只读取已装/合资格版本和结果，不先安装/重启。当前委托端被local-only限制挡住，此步骤需主桌面上下文执行。若确认有修复且需退出/重启，再给出具体目标版本、来源、活跃任务影响与维护窗口，取得对应授权后实施；本轮不退出整个应用、不干扰其他任务。若没有合资格更新，保留此脱敏诊断供经授权的官方支持排查，不以独立CLI覆盖核心、改隔离/注册表/凭据、清缓存或未知安装绕过。

官方[故障文档](https://learn.chatgpt.com/docs/reference/troubleshooting)支持先用基础命令区分执行问题，并要求重启前等活跃聊天完成；[Windows文档](https://learn.chatgpt.com/docs/windows/windows-app)不能提供本例修复版本映射，不能作为桌面已含修复的证明。未采用文档中的新建聊天/重启建议，因为用户明确限定沿本任务且不退出应用。

ignored本机tmp/toolchain-recheck-20261015/recheck.json记录时间、版本/进程来源、一次CUA错误、脱敏MCP状态、任务读取范围、更新检查拒绝和剩余动作；不存令牌、完整登录身份或无关任务内容。文档引用/diff及原18项保全单独核验；本轮没有业务代码变更，不重复业务全量/check/lint冒充工具健康。产品决策、UI14、真实云和所有原外部门禁仍未完成。

## 10-15离线候选收尾批次

- **范围与保全**：起点本地/远端master/2866cd9cdd0f1978da69b6d385d46ed72d4ed405，原18项逐SHA保持、初始暂存区空。仅waterSession历史只读列表、water页筛选水位、只读预检脚本及对应测试/文档；不混UI14两稿、配置、单打候选或私有文件。BIZ-02只核现行合同，EFF-04不清缓存，FA不动算法，DEP不升级依赖。
- **EFF-01部分优化**：原room/round逐会员串行；每100会员页按4个一组并行独立读取。原openid/确定会员ID/灰度/有效会员/schema/迁移状态/round归属检查及legacy发现、updatedAt降序+ID降序、严格日期游标均保持。模拟延迟读峰值4，8账本19次document.get与两页输出/游标对照相同；100账本真实handler模拟前后第一页/第二页仍各205次读取方法调用，不能称扫描数/费用已降低。现有101会员、多同时间分页、隔离权限与legacy测试通过。云合同审计仅只读调度变化，ok/code/message/state/traceId/data、参数错误/权限错误/读取失败和版本/幂等/锁写路径未改，无新索引/字段/迁移。
- **EFF-01扫描方案与门禁**：保留待优化。短期并行仅减少串行等待，真实延迟/限流未验；禁止把membership ID游标当更新时间游标。消除全扫描需用户历史摘要及可索引updatedAt/id，先量摘要在记账/更正/参与者变更/结束/迁移时的写放大和失败补偿，再审索引、回填、双读对照及回滚方案；隔离云覆盖并发更新、同毫秒、跨页移动、重复/漏页、撤销成员/灰度/legacy发现和500/1000规模，比较读数/端到端时延。无新增/部署索引、迁移或真实数据操作。
- **EFF-02**：保留每轮权威get以刷新配置、身份和权限；房间roomVersion/syncVersion、轮次revision/eventCount/status、room/round/filter、viewer及capabilities全部一致，且get含完整entries/latestSeq头、先前筛选增量成功且其latestSeq等于轮次eventCount，才跳过第二次listEntries。普通game/direct三轮由get3/list3变get3/list1；不是省略权限get。失败、缺水位、不同服务端水位、筛选切换、旧页加载/失败、版本/权限/角色变化、功能关闭均保守失效；保留更正生命周期、缺口全重置、旧页游标与pending新记录提示，不改变筛选/刷新周期。
- **ENG-01**：新增scripts/environment-preflight.js与5项回归；只读检查真实npm目录/lock、依赖可解析、canvas原生ABI内存绘图、tmp与shell路径、显式npm缓存访问。缺项给操作建议，不安装/建目录/启动shell/IDE/认证，不输出异常里的私有文本。默认不推断npm缓存，实际显式D:/Caches/npm-cache访问通过；访问检查不是写入往返证明，fresh checkout仍须按提示准备并执行业务/平台门禁。Windows实际必要项通过，WSL/DevTools/云/凭据状态保持未验，[用法](../tools/windows-dev-environment.md#只读环境预检)。
- **DEP-01评估**：npm ls根6直接依赖版本与锁一致：canvas3.2.3、eslint8.57.1、miniprogram-automator0.12.1、miniprogram-ci2.1.31、pixelmatch7.1.0、pngjs7.0.0。当前package-lock-only审计97受影响条目（critical44/high27/moderate25/low1），102个受影响锁路径实际包版本一致；omit=dev为0仅覆盖根生产依赖。CI SDK可由build-miniprogram-npm/mp-ci/mp-quality入口达，automator由截图工具加载；这些开发链会处理包/素材/构建凭据，但未证明特定攻击链可利用。26本地函数均声明wx-server-sdk2.6.3、无函数锁/本地安装树；在ignored临时目录仅解析锁、未生成node_modules，审计17条（critical3/high7/moderate7），不能据此认定生产安装版本。自动fix建议含automator0.5.1与SDK4.0.2的SemVer-major变化，CI无自动修复建议；不直接采用。下一步先界定独立构建上下文与凭据边界、逐链核实际可达受影响API，评审兼容升级/函数级锁候选与核心事务/权限/重放回归，再决定隔离云安装验收；root锁/SDK/生产包未改，不audit fix --force。
- **BIZ-02仅核查**：joinTournament/index.js唯一同名guest会在无明确认领字段的普通加入中替换身份及赛程引用，和singles-round-robin-requirements.md现行同名不自动绑定冲突；claim/index现有15项通过，含明确断言旧自动认领，不能当规格验收。本批按仅核查授权未修、未改测试期望；不新增认领入口。后续可按既定不自动绑定合同另行修正普通加入并同步旧测试，新显式认领产品设计单列。
- **验证**：新增行为14项叠2866cd9归档9通过/5失败；预检修前缺模块而失败，修后5通过。中间实现追加get缺page/entries两项，2失败后收紧；最终工作区waterSession/预检237通过，纯提交236通过（排除UI14草稿多出的1项）。当前显式串行全量含全部19新增测试1972项/1966通过/0失败/6既有WSL平台跳过；全量运行中补入页头用例，最终相关237及隔离236独立复验最终文件。check通过，最终lint0错误/35既有警告，diff/文档引用通过；test:affected仅本批6路径full=true/320文件。提交前Git blob重建副本再验，不把预检ready当平台全绿。
- **证据**：ignored tmp/final-offline-20261015/保存history-red.log、filter-red.log、preflight-red.log、feed-head-red.log、red-final-baseline.log、green-related-final.log、candidate/staged-related.log、full-serial.log、check/lint-final.log、preflight-actual/explicit-cache/final-actual.json、installed-root.json、audit-root/root-production/sdk-resolved.json、dependency-assessment.json、functions-declarations.json、cache-budget-model.json、baseline/candidate-history-count.json及delivery-manifest/receipt.json。未部署、发布、preview/upload、真实业务写入、改凭据权限/生产结构或新任务。

### 缓存与公平性待选方案

EFF-04推荐 **50份完整文档与4MiB估算JSON字节双软上限**，实施前按设备实测总限额和其他占用进一步缩减；这不是微信存储额度声明。理由：最近入口20条、完成战绩摘要另有100上限，50是保留更多离线赛事与增长控制之间的初始方案。24人合成完整文档20/100/300场约10843/45330/131510 UTF-8字节；50份小/中赛事先触数量上限，300场大文档约31份触4MiB，20份该大文档约2.51MiB。真实赛程/头像长度/序列化开销分布尚未测，不把样本当P95或绝对容量保证。

| 选项 | 数量/估算字节软预算 | 离线取舍 |
| --- | --- | --- |
| 紧凑 | 20份/2MiB | 较省空间，大赛程可能不能保留全部最近入口的完整离线内容 |
| 推荐起点 | 50份/4MiB | 允许超出最近20条的离线余量，以数量和体积同时限制增长 |
| 扩展 | 100份/6MiB | 更多离线历史，必须核设备剩余空间与其他缓存占用 |

共同保护方案：活动页面赛事、存在计分草稿/待确认写入的赛事先pin；按实际完整文档访问更新LRU，写入后或安全维护时仅淘汰未pin的完整doc及对应cacheAt，一并清LRU索引。草稿、进行中的请求、独立完成战绩map/snapshot不淘汰；不能按最近ID列表直接删除。pin超预算则允许临时超额，不为强达限额丢草稿；待写入结束/释放后再回收。正式实现前测存储失败与半写、崩溃索引重建、旧缓存迁移、权限变化后的快照校核、离线重开及所有pin超额场景。三个预算均未实施，缓存未清理，保留用户选择。

FA-01/03只汇总目标：A保持休息优先和当前最大连打约束；B允许示例中的连打1→2以换覆盖（历史样本FA-01搭档/对手12/12→28/28、FA-03 24/32→32/64）；C先定义休息硬底线再比较覆盖。样本不是所有规模的改善保证，比较必须同出场预算、多seed、同时报告搭档/对手覆盖、重复次数、出场极差与最大连打/等待。暂建议保持现行休息默认，用户明确权重后再选算法目标。FA-02可选维持现时限并先测降级质量，或接受更长预算追求均衡；12v10强制降级5/3与可构造人人4只证明改进空间，不是生产超时率。质量底线/预算/轻量交换均未实现。

### 连续开发整体收尾

| 分类 | 当前结果与下一步 |
| --- | --- |
| 已修本地实现与离线验证 | 9bb11cb：P1 BIZ-04/01；88ed12a：BIZ-05/TEL-01/UI-01；c9798aa：BIZ-03/FA-04；4f52ec3：EFF-03/07；2866cd9：EFF-05/06；本批：EFF-02、EFF-01限量并行部分、ENG-01只读预检。DEP-01已评估未升级。早期UI06/12/13与UI03 fixture沿原记录，不借本批关原生门禁。 |
| 已知未修或需决定 | BIZ-02现行合同冲突本批仅核查，修正不等同新增认领设计；EFF-04预算/保护策略待选；FA-01/03目标与FA-02质量/时限待选；EFF-01全扫描仍在，摘要/索引/迁移需专项方案与隔离云证明；依赖风险未因完成评估消失。 |
| 待云与原生/对应平台验收 | 已修事务/锁/幂等的真实云与生产安装包、EFF真实SDK/慢网/读量，EFF-08/09权限/环境/失效及成本、ENV-01独立隔离、OBS-01/TEL-02日志/事件口径与原12项；UI14两稿正常/430物理滚动/恢复，以及UI06/12/13/03/04大屏/字体/键盘/保存；ENG-01六项WSL运行态按对应平台执行。 |

本轮明确允许实施、无需产品决定/生产结构变化的安全离线小修已做完并收尾；BIZ-02按仅核查边界未修，不将统一清单说成清零。继续推进必须对应上表剩余授权/决策/环境门禁，工具故障保持挂起，无新任务/上线动作。

## 10-15缓存与初始化读取批次

- **范围/保全**：起点本地/远端master/4f52ec3e931c223df42071bb758c86b7f4092563；仅home排序、sync/watch首读复用、两份新增回归与三份文档。原18项按initial-dirty-hashes.json逐SHA保持，UI14/配置/单打候选/私有与QR排除。工具问题保持挂起；不扩展BIZ-02认领、公平性、部署设置或新功能。
- **EFF-05**：原初读加players/status/updated切换产生4次远端查询。成功获取完整列表后记录最近ID快照，每次loadRecents先失效；仅快照/当前最近ID顺序一致、卡片ID齐全且无loading/loadError/syncRefreshing/syncUsingCache才本地排序。复用原sortItems比较器及refreshVisibleState，保留missing卡、人数同分更新时间次序、筛选/hero/状态计数、侧滑关闭、原raw map与同步时间。不完整、缓存回退、刷新中、错误及ID变化继续原远端分支；onShow/下拉/重连/显式刷新不改。明确切换排序仅改变已持有列表顺序，不额外保证一次隐式远端刷新；受控初读加三次排序4→1，不声称生产费用。8项回归覆盖以上边界。
- **EFF-06**：DevTools原init_fetch与0ms首次poll各get一次，已完成或仍在途均复用本次首读Promise，首轮仍走原devtools_polling事件、保留init_fetch来源；不从缓存initialDoc替代远端。普通首读失败返回空后首次poll仍新读，not_found终止或关闭/换代后不再补读。首轮等待期间missing/关闭失败竞态先复现再加代际检查；下一周期仍正常get，原1500ms起步/抖动/退避和实时监听/恢复保持。7项回归含成功、悬停、失败重试、初始不存在、悬停后终止、关闭与零遗留timer；相关手机实时/恢复/跨页生命周期旧回归通过，不泛化DevTools请求频率到手机。
- **EFF-04复现但未实施**：纯内存mock调用真实storage API，125赛事访问后recentIds=20、fullCacheDocs=125；未读写真实微信存储。最近记录数量不等于完整文档预算；直接裁到20会改变离线赛事可用范围，getLocalCompletedTournamentSnapshots还用完整缓存校核/刷新快照，计分草稿另键保存。需先选数量与字节预算、当前赛事/草稿保护识别、LRU访问口径与淘汰时机，才能验证限额和回收行为。保持待优化，未随两项读优化静默加入淘汰。
- **验证/证据**：首轮13项修前4失败/9通过；补两项首读终止竞态在中间实现上2失败，修后通过。最终15新回归叠原4f52ec3归档6失败/9通过；工作区及只叠本批4文件的隔离副本，首页/监听/同步19文件77项通过。test:affected显式仅本批4路径，full=true/319文件，因此共享同步源执行显式串行全量1953项/1947通过/0失败/6旧WSL平台跳过；check通过，lint0错误/35原警告，diff和文档引用通过。提交前再从index Git blob重建候选复验，不以含原草稿的工作区全量冒充纯提交验证。
- **交付/外部未验**：本机ignored tmp/cache-read-20261015/存red.log、terminal-race-red.log、red-final-baseline.log、green-direct.log、green-related.log、candidate-related.log、staged-related.log、affected-plan.json、full-serial.log、check/lint.log、cache-budget-probe.json、baseline/candidate-sort-count.log及delivery-manifest/receipt.json。真实SDK/DevTools读量、原生排序交互、手机慢网、云/事件实收与原12项未验；UI14正常/430物理滚动继续未验。无部署、发布、preview/upload、真实业务写入、配置权限扩展或新任务。

## 10-15资源请求去重批次

- **范围与保全**：从本地/远端master/c9798aa14b19539c2b9d131b6aceeb33d81b4840接续，AGENTS/current/统一清单重新核验。原18项逐SHA保持、初始暂存区空。仅2个实现、2份新增直接测试、2份旧消费者测试等待适配和3份文档；UI14/配置/单打候选/私有文件/QR不混入。按用户顺序只处理EFF-03与头像EFF-07，未动服务端二维码EFF-09，不排查已挂起工具问题。
- **EFF-03复现与修复**：假计时器连续3次5秒status或15秒heartbeat，在第一个Promise未完成时原实现各发3次请求。新增controller内Map，以动作载荷+会话代际+session为键共享Promise；状态/心跳分开，不合并acquire/release/submit。settle按对象身份清理，teardown清空并递增旧代际，隐藏不再发请求，过期成功/失败均不写页面或弹提示。手动加入静默status会将共享请求升级为非静默，一次结果保留一次通知。原计时器频率、倒计时、release重试、错误信息及云锁/权限/版本合同不变。8项回归覆盖悬停多tick、settle后新请求、手动通知、隐藏/teardown、旧请求finally、新会话及动作隔离。
- **45秒租约边界**：云源码LOCK_TTL_MS仍45000；额外受控时钟探针证明未响应心跳只发1次，到原deadline后仍转idle并停计时器，迟到acquired不能复活旧锁。未加本地超时、延长租约或改变云调用重试；core/cloud没有独立的SDK调用时间上界，本轮不把服务端TTL误当客户端请求超时，也不宣称真实慢网必能续租。证据lease-boundary.json，真实手机/慢网/云到期竞争未验。
- **EFF-07复现与修复**：同fileID三次冷态并发原SDK计数3，修后1；交叠列表只为未在途ID发请求。WeakMap按SDK对象分组、Map按完整fileID保留Promise，成功/失败finally按身份释放；每调用仍走原解析/缓存/失败分支、更新自身cache并返回自己的requested/updated/failed。保留50项批次、部分批次成功、失败60秒冷却、50分钟URL缓存、首显默认头像及持久化规则；不持久化Promise或新建永久结果缓存。6项回归覆盖共享/私有cache、交叠列表、失败后冷却和重试、跨50项批次、单ID失败与不同SDK隔离。合成计数不是生产流量、费用或命中率。
- **验证及失败**：新增14项修前12失败/2通过，最终新测试叠原c9798aa归档复证相同结果。修后直接65项首次64通过/1失败，旧profile测试只等两个微任务；首次等待编辑未匹配LF，第二日志仍失败，已保留。改等页面实际解析Promise后65通过。首次全量1938项/1931通过/1失败/6跳过，唯一mine.render-before-sync头像测试也依赖固定两个微任务，改等实际local/cloud解析Promise，针对3文件11项通过。新测试setImmediate未显式导入导致lint1错误，补node:timers导入后6项重跑及lint通过。最终显式串行全量1938项/1932通过/0失败/6旧WSL平台跳过；check通过，最终lint0错误/35既有警告，diff/文档引用通过。test:affected只传本批6路径，计划full=true/317文件，按共享模块跨页面风险执行串行全量，不重复默认并发运行。
- **纯提交与证据**：原c9798aa归档仅叠本批6文件，13个头像/锁/资料/我的页/赛程相关文件82项通过；提交前从index Git blob重建后复验，UI14/单打候选不在副本。工作区全量保留原草稿，不与纯提交结果混称。ignored本机tmp/efficiency-20261015/保存red.log、red-final-baseline.log、green-direct*.log、avatar-consumers-final.log、avatar-after-lint-fix.log、affected-plan.json、full-serial.log、full-serial-final.log、check.log、lint*.log、lease-boundary.json、candidate-related.log、staged-related.log及delivery-manifest/receipt.json；直接回归随源码提交。
- **未验/交付终点**：源代码本地可交付，真实SDK/CDN、手机慢网/断线、前后台与多设备云锁竞争、原生头像显示、事件实收和原12项未验；UI14两稿及正常/430物理滚动继续未完成。未部署、发布、preview/upload、真实业务写入、改安全配置或新建任务。本阶段只完成本批，不自动转为公平性调整或新功能。

### 余项分类与阶段终点

最新分类以[连续开发整体收尾](#连续开发整体收尾)为准：本批允许实施的低风险离线项已完成；BIZ-02仅核查未修、EFF-01全扫描、依赖升级与所有云/原生门禁保留。缓存和公平性方案见[待选方案](#缓存与公平性待选方案)。本阶段不再自动启动下一批，不恢复挂起工具问题。

## 10-15完成事件与固定搭档休息批次

- **范围/保全**：重新读取AGENTS/current/本清单并核master与origin，起点均88ed12a4796fe9cfbbfc2183abc8925f8c781202。原18个dirty/untracked逐SHA保持，初始暂存区空；本批3个实现、5份测试与4份相关文档，不混UI14两稿、配置、单打候选或私有/QR。用户已授权继续小批纯代码修复，工具故障单独挂起，不新建任务。
- **BIZ-03合同与修改**：现行[事件规范](../specs/activity-observability.md)将submitScore.finished定义为赛事完成确认，而原helper只凭单场已录就返回true。修前事务内读取到running赛事且另有pending，普通幂等与零更新重读路径均返回true。现在helper接收赛事上下文，仅权威status=finished返回true；两个handler路径分别传t/latestTournament，缺上下文为false。首次写入仍用原computed.finished/nextStatus；已finished赛事（含取消未打场次）仍能重放确认。没有新增字段/产品动作，也不尝试重写历史错误事件。
- **云合同审计**：按weapp-cloud-contract-audit核对，只改变错误的finished含义；ok/SCORE_SUBMIT_DEDUPED/state=deduped/message/traceId/clientRequestId/scorerName及root/data兼容不变。权限仍先于幂等判定，正常写仍事务doc.update/version递增并消费当前锁；同分重放不读/写锁，重读分支不删除锁，权限、保留根键、事务冲突/错误与分享更新行为未改。真实handler→客户端cloud.call→activityTracker的4组离线测试验证running无tournament_complete、finished恰一条FINISHED_CONFIRMED并与score_submit关联，两个路径均覆盖；1项helper回归证明未知上下文不能确认赛事完成。旧3项helper与1项smoke补充明确的赛事上下文，不删原断言。
- **FA-04合同与修改**：固定搭档restPlayers是当前物化批次未上场的全名单成员ID，保持名单顺序；它包含受场地分批限制而暂休者，不只逻辑轮的Berger BYE。按matches真实teamA/teamB集合补齐，不修改配对、轮次、截断、循环、fairness/seed/schedulerMeta。开赛既有ID→成员对象映射及赛程既有轮空文本保持；只影响后续新生成排程，不回填已存在云赛事。5个排程边界测试含3对单场地、5对多场地、单场地分批、末批截断与满场重复循环；1个真实scheduler接入开赛handler测试验证保存休息成员对象。5组修前/修后完整输出去掉restPlayers后逐值相同，证据schedule-equivalence.json。
- **复现与验证**：11项新回归修前8失败/3通过；仅叠最终测试到原88ed12a归档复证同为8失败/3通过。修后首轮直接92项中1失败，原因是合法成员归一化补type=user，精确补齐期望后92项全通过。test:affected只传本批8路径，审阅计划34文件/full=false；考虑两个独立云领域仍跑显式串行全量：node --test --test-concurrency=1 --test-reporter=tap tests/*.test.js，1924项/1918通过/0失败/6原WSL平台跳过，退出0。check通过、lint0错误/35原警告、diff通过。工作区全量保留原草稿；原88ed12a归档仅叠本批8文件的隔离候选14个相关文件115项通过，另含云返回消费者、事件、开赛名单与赛程原投影，未带UI14/单打候选草稿。提交前逐blob核对。
- **交付证据与未验**：本机ignored根tmp/completion-rest-20261015/含red.log、red-final-baseline.log、green-direct.log、green-direct-final.log、affected-plan.json、full-serial.log、check.log、lint.log、candidate-related.log、staged-related.log、schedule-equivalence.json及delivery-manifest/receipt.json；跨机器需核文件可用，直接回归随源码提交。真实云事务/部署包/事件实收、手机与固定搭档休息原生展示未验；没有用Node投影冒充UI门禁，UI14正常/430物理验收继续未完成。未部署、发布、preview/upload、真实业务写入或改安全配置，不启动新功能/AA/组局；本批到此阶段交付，其余清单与公平性目标取舍保留。

## 10-15纯代码修复批次

- **范围/保全**：从本地及远端master/42f9ce8接续，远端与checkout重新核验；无index锁或已暂存内容，原18个dirty/untracked文件逐SHA一致。本批仅三个实现、三份直接测试和任务/指标文档；UI14两个草稿、配置/单打候选/私有文件/QR未混入。不新建任务，工具故障按用户新顺序挂起，不重复排查。未部署、preview/upload、发布、真实业务写入或改安全配置。
- **BIZ-05 / P2本地已修**：成功收尾比较刷新结果与当前watch文档的version，仅在快照版本较旧且响应有有效版本时按实际发出的比分补偿；同版/更高权威比分及记分者保留，不套用旧意图再抬高version。响应缺版本且刷新失败时不伪造确认比分。确认成功后的刷新抛错只进入本地收尾，不误报写入失败/提供重复提交。原写入请求、幂等ID、锁与导航合同未扩展；客户端离线可验，不改云数据。7项回归含迟到响应、两个记分者交错、watch期间旧刷新、输入变化、刷新null/抛错、同版与缺版本。
- **TEL-01 / P2本地已修**：仅有限非负number或非空数值字符串计入耗时；null/undefined/空白归missing，布尔/数组/对象/负数/非有限数归invalid。每请求仍取有效终态耗时最大值；有有效值则计coverage，否则有invalid即durationInvalid，否则durationMissing，三者互斥且和为主体requests。app行/探针不混入终态主体；三条null现在coverage0/P95null。3项直接回归，既有完整summary断言补齐新计数，口径见[指标规范](../specs/activity-observability.md#每日cls报告入口)中的报表规则。
- **UI-01 / P3初始化本地已修**：页面onLoad和返回路径中嵌套tournamentId统一安全解码；单个%、不完整UTF-8和非法字节不再抛URIError，仍完成本地资料及云同步初始化。畸形外层路径回退空returnUrl，继续原navigateBack→mine兜底；畸形赛事ID不触发赛事同步。正常编码内部路径与赛事ID保持，不新增跳转范围/可见结构/文案/CTA。5项直接回归通过；原生入口、保存及手机导航本批未验，不把Node结果称为完整UI验收。
- **先红后绿**：首次实现前46项中12失败、34通过。修后首轮3个断言因生产normalize补充名单字段失败，收窄到版本/比分/记分者/时间，未弱化缺陷断言。最终15项新增测试叠加原42f9ce8隔离源码，13失败、2通过；修后三个直接文件48通过。另一次原快照全文件14失败包含旧summary断言对新计数字段的适配，不能全称新行为缺陷。
- **最终验证与边界**：审阅test:affected仅传本批6路径，计划full=true/315文件，执行全量。首次npm追加串行/reporter参数落在文件列表后，实际默认reporter输出1913项/1907通过/0失败/6跳过，保留为全量成功但不当明确串行证据。最终使用node --test --test-concurrency=1 --test-reporter=tap tests/*.test.js，1913项/1907通过/0失败/6原平台跳过，退出0。check通过，lint0错误/35既有警告，git diff --check通过。全量在保留原草稿的工作区；从git archive 42f9ce8构建、仅叠加本批6文件的隔离候选执行match/profile/日报136项全通过，无UI14/单打候选草稿依赖。提交前复核候选文件与工作区字节一致。
- **证据/后续**：ignored本机tmp/code-batch-20261015/保留red.log、red-final-baseline.log、red-regressions-only.log、green.log、green-final.log、affected-plan.json、full-npm-trailing-options.log、full-serial-final.log、candidate-related.log、check.log、lint.log及交付manifest/receipt。跨机器需核可用；直接回归随源码提交。下一批优先重新复现BIZ-03单场幂等完赛误报，其次FA-04固定搭档轮空名单；本批不继续扩展。UI14正常/430物理验收、真实云/生产包/手机和原12项仍未验；新手机交错比分与资料入口/真实日志亦未验。

## 10-14恢复与P1源码交付

- **仓库与保全**：main/master从1363d0d安全快进`c60480b0699362aab17d691b500b4fad34045b4b`；origin为`https://github.com/LXZ56156/repo-20260224-031312.git`。无Git锁，未见其他活跃羽毛球任务。本地`.agents`为空，使用已安装weapp-cloud-contract-audit。初始18个dirty/untracked文件全部逐SHA保持，包括UI14两文件、配置、单打候选、浏览器与QR。仅本任务修改加入提交范围。
- **BIZ-04**：startTournament/addPlayers/removePlayer/updateSettings/setReferee在事务读取权威文档后，改用同事务`doc(tournamentId).update`。版本条件由同一文档的事务读集/冲突重试保障，仍递增version；权限/草稿限制、去重、reserved-root保护和开赛/移除请求日志继续保持。没有修改共享模板/lib、SDK或部署配置。
- **BIZ-01**：V1 create的不存在检查与首次set合入真实`db.runTransaction`；冲突重试重新读取，已有账本返回WATER_SESSION_READY及权威现状，保留active与finished原数据，不覆盖记录/名单/版本。只有缺失才检查写开关并初始化。旧ID、V1 owner-only/返回结构、V2/迁移路由保持；不依赖无事务fallback创建。finished不再清空是明确数据保护变化，不提供重开旧账本的新动作。
- **直接证据**：12个[事务回归](../../tests/cloud-tournament-transaction.test.js)覆盖五入口文档写/版本递增与冲突后权限重查，以及开赛/移除日志失败原子回滚和成功重放；4个[V1创建回归](../../tests/waterSession.create-concurrency.test.js)覆盖并发创建、创建与名单/记账交错、只读开关下读取与finished历史保全。修前BIZ-04测试12失败，V1并发两项失败；修后全量覆盖16项通过。另仅在内存加载c60480b原V1源码复跑公开探针，精确确认2人/1记录/version3变为1人/0记录/version1；当前源码没有回退。
- **精确SDK**：从仓库公开证据ZIP解压database@1.4.1运行依赖，实际五handler通过wx数据适配进入真实SDK请求构造，仅替换Db.reqClass出口。5组成功及开赛/移除2组日志失败共7组通过；文档读、业务写、日志set与commit/abort事务ID一致。start失败后既有错误映射会再读日志，不能用最后一条请求当成事务终态。没有账号、凭据、socket或真实引擎请求；只证明生成请求，不能当作生产包或平台回滚证明。
- **最终门禁**：`npm.cmd test -- --test-concurrency=1`实际1898项/1892通过/0失败/6跳过/0取消todo，退出0，约49.6秒；6项原平台限定跳过。首轮1898项/1891通过/1失败/6跳过/退出1，唯一失败`cloud-response-contract-write-actions.test.js`旧mock缺doc.update，保留原响应合同断言完成适配，直接1项及最终全量通过。check含bootstrap/废弃API/共享云库一致性通过；最终lint0错误/35原警告；git diff --check通过。全量是在保留UI14和单打候选的当前工作树执行，不宣称干净远端UI14已修。
- **旧工具测试**：deploy-changed-cloudfunctions直接9项、两次完整全量均通过，包括config-only timeout。旧continue日志仅失败概要，无完整错误/最终计数，本轮不能倒推旧原因或称既有波动；已保留旧日志，未执行deploy。post-commit hook的兼容目标明确`exit 0`，不会触发云部署。
- **P1隔离提交验证**：源码提交`9bb11cbb6058afbcee224ddedf9d1062f96a93d9`已推送并核远端master一致。通过git archive导出独立提交快照，任务16文件及原始UI14源码/测试逐字节匹配Git blob，未含UI14两稿或未跟踪单打候选；在该快照执行五赛事入口、V1入口、两份新回归和返回合同9文件，共78通过/0失败/0跳过。当前工作树全量1892通过与这个提交范围证明分别记录。该源码commit Actions为空、check-runs0、statuses0；聚合status显示pending只是无status，不称CI已通过或失败。
- **UI14与工具边界**：本轮page-meta四状态、全量/check/lint通过。旧40402无监听；获本次明确前台授权后，仅官方prewarm打开main并选未用8510端口，预热退出0。DevTools2.02.2610092/SDK3.17.3，实际iPhone17屏402×874、窗口402×694、字号16、safeArea54–840。首iterate只有marker失效、source/监听/SDK/宽度均通过；按故障手册显式refresh退出0，未放宽门禁。`2026-10-14T18-04-56-825Z-37700-0b14d9db`正式capture两状态退出0，约46.8秒，2PNG均469×1015（不是逻辑宽度）；主控亲看waterV2Member24Game、waterV2Member24，无本轮新增可见问题。来源为9bb11cb+保留dirty，manifest`8f244b671ec32ffd6067607f5413acc4f2c70b15e8d8e5d3be9d6d1cef424021`。
- **UI14实际页面事件**：复用受控native-harness触发真实页面SDK close/reopen/close，实际page-meta属性依次`overflow: hidden; → 空 → overflow: hidden; → 空`。重开PNG`tmp/ui-audit-20261011-unlocked/native-actions/ui14-20261014-402-sdk-reopened.png`已亲看；异常0，10步检查，缓存/SDK恢复与中性单页重建通过、无残留隔离。正式两case同样SDK/storage恢复通过，仅受控拒绝和抑制遥测，未通过原云/原遥测验证恢复。这是SDK页面事件与属性证明，不是物理滚动。
- **仍阻塞**：computer-use的SKILL.md及guidance要求通过node_repl的sky API控制Windows；当前可用工具无node_repl，现有cua_repl明确native disabled。已读完整技能/控制/确认说明，未使用PowerShell输入或自建helper绕过；官方`cli auto --help`仅提供端口/账户/票据/项目等，无设备切换选项。正常/430大屏的物理背景边界滚动、关闭恢复、原生遮罩/picker仍未验。UI14两个草稿保全且不提交，不把SDK回读当全部UI门禁。文档交付后末次全文签名/相关采集结果以`ui-iterate402-final.log`及其summary为准，不把文档更新前的签名冒称最终签名。
- **本次证据根**：`tmp/p1-repair-20261014/`（ignored本机证据）：initial-dirty-hashes.json、biz04-red.log、biz01-red.log、biz01-baseline-repro.json/log、p1-green.log、sdk-handler-probe.cjs/log与sdk-handler-requests.json、affected-plan.json、deploy-direct.log、handlers-*、contract-final.log、full-serial.log、full-serial-final.log、check.log、lint-delivery.log、ui-doctor.log、committed-source-manifest.json、committed-source.zip与committed-related-tests.log、ui-prewarm402.log、ui-refresh402.log、ui-iterate402-after-marker.log、ui14-sdk-check.json/log、cli-auto-help.log及末次ui-iterate402-final.log。正式图回执位于tmp/ui-screenshots-actual/simulator-frame，两轮iterate摘要在tmp/ui-iterate-runs。错误探针/旧mock适配失败日志也保留。已提炼的直接回归随源码提交；ignored证据跨电脑不能假定存在。
- **交付边界**：仅P1六入口、两份新直接回归、六份旧mock适配和current/本任务正文。UI14/配置/单打候选等既有改动保留。真实云回滚、冲突、身份/规则/索引、生产安装包、原12项、手机及其余原生UI未验。其余清单项目保持原级别；不启动AA/组局、活动或automation-3。

### 本轮工具恢复诊断补充

- 既有Codex任务“推进羽毛球小程序修复”（01a13b7b-b9e8-76e1-9918-48b30b62b0e5）通过应用工具重新核实已关联本地badminton-miniapp项目，导航返回navigated=true；宿主仍为durable，未证明迁移为local执行器。没有改内部数据库或新建任务。
- 已选安装的IDE HTTP29558与SDK8510归属核验通过。heartbeat200；带现有Token的GET/通知请求快速返回缺session的400，initialize则两种Accept均在8秒内没有响应头。只证明初始化路径受阻，不推断认证失效；没有auth/轮换Token。
- 只读核验官方app.asar：initialize等待所有项目窗口notifyMcpBootstrap；此调用先等待ensureStarted/startDevtools，随后触发编译，服务端没有显式超时。可解释HTTP健康而initialize挂起，但尚未定位具体窗口/等待点，不称完整根因。
- 官方exact-project close一次返回0后，新端口2815的auto明确返回autoPort8510/requestedAutoPort2815；SDK重新连接首页、旧marker消失，证明项目运行时曾恢复。新的预热脚本按请求2815连接而失败，未伪造新session。此后refresh创建合法当前源码challenge；再次官方close/auto（8510和2815）分别60秒/45秒超时，当次只读SDK连接12秒超时。随后官方普通open（不再auto）退出0，SDK12秒探针恢复首页，marker/challenge均消失；已经找到不重启主进程的本项目恢复路径。不把close的exit0或auto日志preparing当成编译成功；旧402图来源仍为15547c4，最新全文签名未完成。
- 只清理本轮超时且路径/父进程或命令特征匹配的CLI助手，未终止DevTools主进程或其他窗口。一次并发refresh被会话锁拒绝，无修改；最终无fixture安装/真实业务动作。原生输入仍因当前工具无node_repl且CUA native disabled而不可执行，未绕过。正文更新后使用已有8510会话建立当前源码challenge，再官方exact-project close→普通open→refresh核重编译，最终以recovery-final-*日志和回执为准；不清缓存或修改凭据。
- 本机ignored证据：mcp-http-diagnosis.json、vendor-js-4cf9575d00bc48997ba17badd269ccea.js、runtime-after-official-reopen.json、project-recovery-prewarm.log、ui-session402-recovered.json.cli-1792003931299-26872-9e4e8da9.log、refresh-after-official-reopen.log、challenge-reopen-*.log、exact-windows-reopen-*.log、runtime-after-challenge-close-auto.json、exact-project-open.log。旧回执与challenge保留；本节只是诊断记录，不新增业务修改，不需要复跑已过P1全量。

### UI14最小人工验证步骤

补交人工步骤文档后的来源刷新：首次refresh按合同返回2并建立challenge，但官方MCP编译及只读status均失败；原生cwd路径+compile锁的单次复测仍失败。仅内存阶段诊断定位到`initialize-read`，退出1、stderr0B，没有认证失败证据、未auth或改凭据。8510监听仍有效，SDK只读回读证实中性launch单页、无capture isolation/临时偏好/poison/recovery。保留source challenge，最新全文签名未完成；15547c4的402图片及产品文件SHA仍有效，不冒称新的文档HEAD已拍。诊断/恢复日志为`ui-manual-doc-*`和`final-runtime-cleanup-after-manual-doc.json`，无需重跑已过P1测试。

0. 接续先设置现有`WEAPP_UI_SESSION_FILE=tmp/p1-repair-20261014/ui-session402.json`，执行一次`npm.cmd run ui:session:refresh`，核有效challenge（source变化时返回2是预期）；**随后由人只按当前main项目的“编译”**，不清缓存/换项目/授权登录。期间不要修改源码；再执行refresh及`npm.cmd run ui:doctor`，两者应退出0、检查全通过，然后再开展下面物理检查。新文档HEAD变化时须重新生成挑战，不能直接删除marker或强绑旧签名。

当前只是待执行步骤，不计通过；前台操作已获本轮授权，生产写入仍未授权。自动截图会在结束时恢复到中性launch页，**最终截图不代表合成fixture仍在运行**，现在也没有保留的隔离。人工开始前，由执行会话复用现有`tmp/ui-audit-20261011-unlocked/native-harness.cjs`的`NativeAudit.open → load('waterV2Member24Game')`，确认当前签名/项目/设备及SDK隔离通过后，保持该scope只供本次人工动作；未能确认guard时不进入真实账本。结束必须由同一scope调用`close`并取得SDK/缓存/偏好和中性单页恢复回执，不能直接关进程当作清理。

1. 先在实际iPhone17/402、普通字号16验证；记录当前屏/窗口/safeArea。先用×关闭预置弹层，将背景名单滚到有余量的位置后再打开“记一局”，记录标题或列表锚点及page scrollTop。
2. 用真实鼠标滚轮/触控板或触摸，分别在弹层上方可见遮罩处上下滚动，并将弹层名单滚到顶部、底部继续同向滚动。合格：名单正常滚动，背景锚点/scrollTop均不变，无边界滚动传递。不点击“确认记一局”，不创建/记账。
3. 用实际×关闭后再滚背景，合格：背景恢复滚动；再打开并重复边界检查。另通过遮罩关闭一次；在人为可以命中的快速重开路径观察弹层能否回到屏内，不能拿SDK事件代替物理命中。原生picker只检查打开/取消，取消后不产生写入。
4. 结束并验证当前scope恢复后，由人从DevTools设备菜单选择实际Pro Max/430宽度；将机型/宽度回读记入回执，不只改SDK系统信息。设备变化后按现有预热/签名流程重建合法会话，再用同一受控fixture重复第1–3步。小屏与小屏大字仍跳过。
5. 每屏留实际操作录像/截图、前后锚点或scrollTop、关闭方式、恢复回执及异常数。只有正常/大屏均通过、SDK/缓存恢复通过后，才能关闭UI14物理门禁并提交其两个草稿；失败保留证据，按具体现象续修。手机滚动、键盘/大字和真实云结果仍分别验收。

可供本机查看/分享的截图材料：`tmp/ui-screenshots-actual/simulator-frame/waterV2Member24Game.png`、`waterV2Member24.png`及各自receipt（最终15547c4实图已亲看）；重开图为`tmp/ui-audit-20261011-unlocked/native-actions/ui14-20261014-402-sdk-reopened.png`。这些是合成24人fixture，机型/像素尺寸与SDK事件范围见上文，不当作手机或物理动作证明。不包含私有配置、session或缓存原值，未发布到第三方。最终只读运行时清理检查见`tmp/p1-repair-20261014/final-runtime-cleanup.json`，缓存恢复另由各capture与SDK检查回执证明。

## 具体待修清单

P1/P2保留原问题级别。以下是本轮处置及残余门禁；未验不等于通过。

| 顺序 / 编号 | 问题与证据范围 | 代码入口 / 下一步 | 完成标准 |
| --- | --- | --- | --- |
| 1 · UI06 · P1 | 已修共用动画：leave 链去重，按 Promise 身份清理，完成后重放最新 show；不靠延时掩盖缺陷 | [transition](../../miniprogram/miniprogram_npm/@vant/weapp/mixins/transition.js)、[持久补丁](../../scripts/patch-vant-transition.js)、[本地构建](../../scripts/build-miniprogram-npm.js)；Vant 固定 1.11.7 | 9 项真实 bundle 受控回归通过；实际 npm ci、npm 重建保留补丁通过。402 SDK game/manual 约183/121ms重开可见、名单输入通过；物理快速命中、遮罩拦截与大屏仍未验 |
| 2 · UI12 · P2 | 已修：idle 说明与开始/修改动作同源派生 | [matchViewModel](../../miniprogram/pages/match/matchViewModel.js)；其他锁/权限提示不覆盖 | 185 项关联测试通过；402真实 applyTournament 完赛说明/按钮一致，点击进入编辑通过（受控锁响应）。未完赛说明直接回归通过，大屏/真实锁未验 |
| 3 · UI13 · P2 | 已修：以 QR 实际 drawImage 成功决定页脚；无码覆盖奖牌素材烧入的码圈/扫码字；异常恢复 clip | [sharePoster](../../miniprogram/core/sharePoster.js)、[shareCard](../../miniprogram/core/shareCard.js) | 47项关联测试含缺 URL、加载/绘制失败、金银铜、并列冠军。402真实Canvas普通/金牌、阿杰与小林两位冠军无码预览完整；有图码绘制页脚完整。关闭/复制按钮通过，保存仅触发，系统保存结果/大屏未验 |
| 4 · UI03 · P2 | 当前生产投影已有数量单位绑定；旧详情 fixture 注入普通空格绕过投影，已纠正并补 fixture 回归 | [fixture](../../scripts/dev/water-v2-screenshot-fixtures.js)；未重复修改生产格式器 | 101项关联检查通过；402实际详情按钮→getEntry受控响应→decorateFeedEntries链路通过，2水成组换行，原描述/ARIA保留。大屏未验 |
| 5 · UI04 · P2优化 | 402普通字号未复现：末行完整“重试”，两名评审均可接受；本轮未增加文案或结构 | 保持历史错误提示；重试真实按钮可清错误并返回空历史（受控响应） | 正常屏已看/重试通过；大屏孤字复看未验，仍保留原问题，不称全尺寸关闭 |
| 6 · UI15 · P2建议 | 评估后不采纳新增常驻原因区：已有Toast、冲突Modal、比分保留和重试入口，暂无消失提示阻碍恢复的新证据 | [matchSubmitService](../../miniprogram/pages/match/matchSubmitService.js)、[writeErrorUi](../../miniprogram/core/writeErrorUi.js)保持既有行为 | 不新增需另行设计的状态/清理规则，不恢复重复草稿提示。真实云失败与手机提示仍未验 |
| 7 · UI14 · P2 · 未提交 | 源码确认page-meta仅锁历史弹层、漏掉gameSheetOpen；各屏宽共用。已最小加入gameSheetOpen条件，无新增JS状态或触摸拦截 | 工作区[water WXML](../../miniprogram/pages/water/index.wxml)、[直接测试](../../tests/waterSession.ui-copy.test.js)；四种开关组合证明任一打开锁定、全关恢复，关联218通过 | 原320背景约33px证据保留，小屏仍跳过。本轮四状态测试/全量/check/lint通过；已获前台授权并恢复402实图，实际SDK关闭/重开回读锁定/恢复通过；当前缺原生控制入口，正常/430大屏物理滚动仍未验，不计全部UI完成 |

## 远端审计待修与优化清单

状态：下表初次整合于2026-10-14；后续授权已完成BIZ-04/01本地修复，2026-10-15又完成BIZ-05/TEL-01/UI-01、BIZ-03/FA-04、EFF-03/07、EFF-05/06及本批离线候选收尾，外部未验保持。初次同步前远端master为 `1363d0dfccca52d47419d96941ce15f3180f5893`，与本轮检查版本一致。

[10-14 检查正文](../reports/2026-10-14-source-offline-audit.md)保留范围、复现、建议、测试结果及线上限制；[10-09 审计](../reports/2026-10-09-remote-comprehensive-audit.md)保留旧编号、原始公开证据包及历史结论。本表是统一待办，复用 BIZ/FA/EFF/TEL/UI-01 编号，不把旧问题当新增；UI14 只引用上方原条目。ENG/ENV/DEP 为原有工程风险显式跟踪，OBS 为待补证口径，EFF-08/09 为本轮新增观察。

25 个报告条目已全部映射；缺陷、优化、产品目标取舍、风险及待补证分别标注，不把它们统称 25 个新 bug，也不改写旧报告的 18 项历史计数。UI06/UI12/UI13、UI03 fixture 等已修事项不重复登记为新缺陷，其残余原生验收继续保留。

| 统一编号 | 10-14 对应 | 优先级 / 状态 | 问题与证据 | 下一步 / 验收 |
| --- | --- | --- | --- | --- |
| BIZ-04 | A1 | P1 · 本地已修，云未验 | 五入口已改同事务doc.update，事务读集保护版本；7组精确SDK请求与12项回归通过 | [本轮证据](#10-14恢复与p1源码交付)；独立云引擎失败回滚/冲突与当前生产包仍未验，未部署 |
| BIZ-01 | A2 | P1 · 本地已修，云未验 | V1事务内查无再创建，冲突重读权威现状；4项并发/只读/历史回归通过 | [本轮证据](#10-14恢复与p1源码交付)；真实云并发与生产包仍未验，未部署 |
| BIZ-05 | B1 | P2 · 本地已修，手机未验 | 补偿保留同版/更高权威比分，固定发出意图；7项交错/缺版本/刷新失败回归通过 | [本批证据](#10-15纯代码修复批次)；手机交错、生产包未验，不改云数据 |
| BIZ-02 | B2 | P2 · 合同冲突已核，未修 | 普通加入仍自动绑定唯一同名guest，旧15测试认可该行为，与现行规格冲突 | [本批核查](#10-15离线候选收尾批次)；按本轮仅核查边界未改，后续修正与新认领设计分开 |
| BIZ-03 | B3 | P2 · 本地已修，实收未验 | 幂等finished取权威赛事status；两路径及完成事件4组/未知上下文1项通过 | [本批证据](#10-15完成事件与固定搭档休息批次)；真实云/手机/事件实收未验 |
| FA-01 | C1 | P2 · 目标取舍 | 8 人 17 场搭档/对手仅 12/12；对照 28/28，连打 1→2 | 明确覆盖与休息优先级；同预算多 seed 比较，不称无条件更优 |
| FA-02 | C2 | P2 · 待优化 | 12v10、5 场地、24 场强制降级，队内出场 5/3 可改善为人人 4 | 增加降级质量底线/轻量交换；不将强制复现当生产超时率 |
| FA-03 | C3 | P2 · 目标取舍 | 8v8 模板搭档/对手 24/32；对照 32/64，连打 1→2 | 与 FA-01 合并决策覆盖/休息目标，保持出场均衡 |
| FA-04 | C4 | P2 · 输出本地已修，原生未验 | 物化批次补齐restPlayers，5组排程与开赛对象映射回归通过 | [本批证据](#10-15完成事件与固定搭档休息批次)；原生休息展示未验，不回填旧赛事 |
| EFF-01 | D1 | P2 · 串行已优化，全扫描保留 | 独立读限4路并行；100账本两页仍各205次读方法调用 | [本批证据/方案](#10-15离线候选收尾批次)；摘要/索引/迁移及真实正确性门禁另审，不称省计费读数 |
| EFF-02 | D2 | P2 · 本地已修，实流未验 | 保留权威get，已确认同版本/序号/身份/权限筛选水位跳过重复list；缺页/失败/变化重读 | [本批证据](#10-15离线候选收尾批次)；真实更正/权限/断网/分页仍待验 |
| EFF-03 | D3 | P2 · 本地已修，慢网未验 | 动作/目标/会话在途合并，隐藏/过期清理；8项回归及45秒截止探针通过 | [本批证据](#10-15资源请求去重批次)；5秒/15秒/45秒合同保留，真实云慢网未验 |
| EFF-04 | D4 | P2 · 已复现，待预算取舍 | 真实storage API内存探针：recent20/full125；未实施淘汰 | [本批评估](#10-15缓存与初始化读取批次)；先明确数量/字节预算、离线范围与保护对象 |
| EFF-05 | D5 | P3 · 本地已修，原生未验 | 完整远端列表按原比较器本地重排；受控初读加三次排序4→1 | [本批证据](#10-15缓存与初始化读取批次)；缓存/缺项/刷新/ID变化仍读，显式刷新保留 |
| EFF-06 | D6 | P3 · 本地已修，实流未验 | DevTools首轮消费初始化远端Promise，普通失败重试、终止不补读 | [本批证据](#10-15缓存与初始化读取批次)；后续间隔/实时监听保持，不泛化手机频率 |
| EFF-07 | D7 | P3 · 本地已修，SDK实流未验 | SDK实例+fileID在途合并，受控冷态3→1；6项回归通过，成功/失败缓存保持 | [本批证据](#10-15资源请求去重批次)；真实SDK/CDN/原生显示未验 |
| EFF-08 | D8 | P3 · 新观察 | 三次 heartbeat 各做集合检查、赛事/锁读写 | 先量测集合准备和 watch 成本；scoreLockRevision 参与收赛冲突，不可直接删除 |
| EFF-09 | D9 | P3 · 新观察 | 同一赛事/环境两次服务端调用重复生成码并上传 | 权限验证后复用，明确并发去重、失效和环境隔离；费用未实测 |
| TEL-01 | E1 | P2 · 本地已修，实收未验 | null/空白不再计零；coverage/missing/invalid按请求互斥，3项回归通过 | [本批证据](#10-15纯代码修复批次)；真实日志与生产口径未采样 |
| OBS-01 | E2 | 待补证/口径 | 17 字段 activity 与 7 字段 growth 无可靠统一漏斗 | 先核配置与实收，关联/去重/测试隔离/规模维度；合并原 1/3/6 待验，不造新七日通过 |
| UI14 | F1 | P2 · 已有草稿未验 | 远端 page-meta 缺 gameSheetOpen；原电脑有未提交修复 | 只沿上方 UI14 条目续做，不另建修复；远端回归不覆盖本机草稿/物理滚动 |
| UI-01 | F2 | P3 · 初始化本地已修，原生未验 | returnUrl与嵌套ID安全解码；5项初始化/正常编码回归通过 | [本批证据](#10-15纯代码修复批次)；默认返回合同不变，手机原生入口未验 |
| ENG-01 | F3 | P2 · 只读预检已补，WSL未验 | checkout/依赖/canvas/tmp/shell/显式npm缓存检查，5回归及本机实测通过 | [预检用法](../tools/windows-dev-environment.md#只读环境预检)；6旧WSL平台跳过仍需对应环境，不删测试 |
| ENV-01 | F4 | P2 · 隔离风险 | develop/trial/release 默认同一云环境 | 真实数据测试前核隔离；当前不改配置/创建环境，不推断已有生产误写 |
| DEP-01 | F5 | P2 · 评估完成，依赖未升级 | 当前根锁97条/102受影响路径匹配安装；独立SDK锁解析17条；26本地函数无锁/安装树 | [本批评估](#10-15离线候选收尾批次)；可达性/生产包未证明，兼容方案与隔离云另审，不force升级 |

### 保留观察与验证边界

- TEL-02：继续保留旧输入/人工水位不一致的 **P3 输入防护观察**，不计已确认缺陷。本轮未重新复现；合成显式零不证明真实未成熟 D7 为零，缺 key 仍未知。详见[旧报告](../reports/2026-10-09-remote-comprehensive-audit.md#六tel-02旧输入与人工水位不一致的-p3-防护观察)。后续可加采集时间/完整水位一致性检查，不推翻旧历史固定水位结果。
- 10-14 受控全量 1860 项：1846 通过、6 失败、8 跳过，退出码 1；6 项均为 weapp-preview-workflow.test.js 缺 rsync/wslpath。check 通过，lint 0 错误/35 警告。首轮依赖未就绪失败和排阵超时保留在报告，不称全量全绿。
- 固定远端的 config-only timeout 测试通过，不关闭电脑 UI14 未提交工作区那次未完成全量及未知原因失败。原电脑窗口/源码绑定、手机和大屏门禁未复验。
- 精确 SDK 请求捕获及离线复现不证明生产安装包、真实回滚、实际发生率或费用；真实云规则/索引、事件实收、七日窗口、备份恢复、手机 P95 等沿下方外部未验项保留。
- 后续推荐顺序：先确认 ENV-01 的真实验证隔离前提；业务先 BIZ-04/01/05/03，再 FA-01～04；随后 EFF-01～04 与 TEL-01/OBS-01；BIZ-02 按现行规格修正；UI14 沿现有草稿续做；其他 P3/工程依赖项按风险处理。这是排期建议，不是本次修复授权。

## 本轮验证与证据

- 实际设备回读：DevTools **iPhone 17，402×874，字号16，SDK 3.17.3**，safeArea top54/bottom840；不是16 Pro或手机实测。当前菜单无独立16 Pro项。先验正常屏；430等大屏尚未执行，小屏及小屏大字按要求跳过，正常机型大字/键盘仍未验。
- 正常屏5张正式fixture图及11张native-action图已主控亲看；两名隔离评审均无共同P0/P1或阻断P2。评审认可数量单位/历史错误/完赛说明/扫码降级；无码奖牌下方留白较多可接受，不扩展视觉重做。静态图不证明物理点击/滚动归属。
- UI06直接测试9通过，实际`npm ci --prefix miniprogram`与`npm run mp:npm:build`通过并保留补丁；独立代码复核无阻断发现。关联测试UI12 185、UI13 47、fixture 101均通过。
- `npm test`首次1875通过/6跳过/0失败。lint新增测试常量循环1错误已修，9项直接复跑通过。之后全量复跑41失败，`npm test -- --test-concurrency=4`复跑8失败：含deploy配置Git子进程失败、privacy-api-package、scheduler.scenarios、squad.beam.performance/end-condition/fairness、startTournament.index/logic文件进程失败，日志有spawn ENOMEM/UNKNOWN及V8 Zone Allocation OOM；未称既有波动。相同全套以`node --test --test-concurrency=1 tests/*.test.js`串行1875通过/6跳过/0失败。check通过，最终`npm.cmd run lint`0错误/35原警告。失败文件和计数在下述JSON，保留全部失败日志。
- 原始证据：`tmp/ui-fixes-20261013/`（prewarm/iterate/test/check/lint、`test-failures.json`）；交互图/回执在`tmp/ui-audit-20261011-unlocked/native-actions/fixes13-402-*`，恢复回执`summary-1791868928878.json`、`summary-1791869521824.json`。两次scope的10键/保护缓存/SDK恢复通过，0运行时异常；探针计数不等于真实云调用。图片均来自当前源码DevTools实际Canvas/页面，不是合成画面。目录ignored，跨电脑需先确认原文件可用。
- 有QR只用已有本地码作为隔离绘制素材，未生成真实云码/验当前扫码；完整Canvas PNG本地导出通过。复制文案有原生Toast；保存按钮已触发，系统保存结果未证明，不能计手机相册保存通过。
- 新工具阻断：第二次prewarm后Windows窗口控制返回DevTools标题却显示其他应用像素；fresh selection、NodeREPL重建后activation仍报`failed to activate captured window`，已停止旧坐标。官方项目窗口close未明确成功、open桥接超时/失败，未反复重试/自动auth；窗口恢复和设备切换API不足，已请求用户手动恢复。产品修改后的签名实图已取得；仅交接文档更新后最后一次`ui:iterate`在compile阶段失败（run `2026-10-13T05-49-55-726Z-27320-b5fa9a44`，约31.2秒），未刷新/采集或覆盖final，source challenge保留，最新全文签名尚未完成。新成功不倒验旧工具失败。恢复后先核真实窗口/设备，再按会话协议完成大屏、遮罩、取消、picker和UI14动态滚动。

### 续做后暂停回执

- UI14两个未提交文件仅改背景锁条件及最小直接测试。新断言先红1项，再审阅`test:affected`计划并`--run`：218通过/0失败/0跳过，范围diff检查通过。先前实图/双评审未覆盖这一新改动。
- 启动`npm test -- --test-concurrency=1`后用户要求暂停；暂停后无该执行会话或测试进程，日志停在中途，无最终计数/退出回执。已观察`tests/deploy-changed-cloudfunctions.test.js`中的“configuration-only timeout changes select only their function for commit, range and explicit file baselines”1项失败；未获完整错误详情，原因未知，不称旧波动或资源失败。未继续诊断/复跑，未跑新版本check/lint。日志`tmp/ui-fixes-20261013/continue-npm-test-serial.log`。曾尝试NODE_OPTIONS串行选项，被Node拒绝，未启动该次测试；随后使用上述显式npm参数。
- 一次只读doctor回执`continue-doctor.log`：session/marker/listener/SDK/viewport/route/项目通过，sourceSnapshot=false。脱敏现有bridge诊断`continue-ide-status.json`为initialize-read超时，未获登录/版本状态，不推断Token错误、不auth。官方连接器期间反复不可用。
- Windows控制读到全灰DevTools窗，但下一次项目菜单点击实际落到Codex菜单，已停止该控制路径；没有更改其他项目内容。一次官方CLI项目close/open返回0（`continue-cli-close.log`/`continue-cli-open.log`），随后窗口ID与39452监听PID仍相同，不能证明重开/编译完成。未反复关闭、未强杀DevTools，已请求用户手动“项目→重新打开此项目”。目前暂停，后续需继续指令。
- 本次仅提交暂停交接文档；UI14源码/测试留作工作区草稿，未混入提交。原既有dirty完整保留。无新增fixture隔离、云写入、部署或发布。上述日志均位于`tmp/ui-fixes-20261013/`，ignored本机证据，跨电脑须确认原文件可用。

## 已完成历史基线

- UI07比分对齐、UI11完整picker触达，以及头像忙态、赛程空态、对比度、主流水单位、短屏首行、单打完整数据校验和重复草稿提示均已修并验，不再作为待修重复开展。
- 10-11历史完整测试：1862通过/6旧WSL跳过/0失败；check通过、lint0错误35原警告。网络分层合同39通过；不是实际断网/手机云watch。390八图、430九图主控亲看并双评审，最终两scope的10键/SDK/保护缓存恢复通过。
- 本机原始证据根：`tmp/ui-audit-20261011-unlocked/`。UI06读`water-popup-rapid-reopen-analysis.md`；UI14读`native-actions/water320-correction-physical-layout-actions.result.json`；其余按`viewport-review-*`与`native-actions/`检索。文件在本机ignored目录，跨电脑接续需先确认可用，不能把准备计划当执行结果。
- 工具问题独立跟踪：TOOL14/15/16旧批总恢复未验证，TOOL17 SDK错选，TOOL18未响应/错窗根因未知。新会话成功不倒验旧失败；不要把工具错选当产品缺陷。UI采集使用[日常循环](../tools/agent-development-workflow.md)，失败按[故障手册](../tools/weapp-ui-troubleshooting.md)对应阶段处理。

## 外部未验与动作边界

这些是待验条件，不是本次已确认的产品缺陷；小屏暂缓不关闭它们：

- 原1/6：完整七日、≥100来源/版本可靠的开赛调用；真实首次记账、排除测试后的新账本七日首笔率。原截止不顺延、不制造调用凑数。
- 原3/4：后台事件配置/实收、逐ID去重与查询权限；实际断网/慢网、手机首次watch错误与实时恢复。Node合同与静态图不代替事件实收。
- 原5/7/8/11：可信WX身份/角色、真实数组/组合索引、事务冲突与回滚、锁查询/权限撤销竞争、双机与跨设备找回及耗时。收赛相关函数需成组验证，不能单独部署finish。
- 原9/10/12：云runtime/SDK真实日期数值与错误合同；低端Android/iPhone同场景改前改后P95；单打真实云/比赛/手机与当前发布包。正常机型键盘、安全区和相关大字仍未验。
- 原2：续费仍暂不付款；历史空函数代码与线上整环境恢复未验。完整12项标准见[归档清单](paused-plan-status-history-2026-10-13.md#收尾待验清单保留原12项标准)。

完成且通过相称验证后，按AGENTS持续授权提交/推送并核远端。部署、上传/发布、PR/preview/QR、付款、生产规则与真实业务写入需该动作的当前授权；不恢复automation-3，不auth/兑换，不从历史快照扩大授权。10-09/10-14 审计发现已登记到本页统一待修清单；本批及P1已修状态以上文为准；其他条目不因文档整合自动开展。

## 历史入口

[完整历史归档](paused-plan-status-history-2026-10-13.md)保留原文、失败和证据。以下六个标题仅兼容旧文档锚点，按需追溯，不是新任务待执行清单。

### 10-04按顺序续做：第1项手动观察

见[原观察记录](paused-plan-status-history-2026-10-13.md#10-04按顺序续做第1项手动观察)。

### 10-04依序续做：第2项本机资产恢复

见[原恢复记录](paused-plan-status-history-2026-10-13.md#10-04依序续做第2项本机资产恢复)。

### 10-04第3项本地配置与客户端验收准备

见[原事件准备](paused-plan-status-history-2026-10-13.md#10-04第3项本地配置与客户端验收准备)。

### 10-04依序续做：第5项当前候选

见[原权限事务候选](paused-plan-status-history-2026-10-13.md#10-04依序续做第5项当前候选)。

### 10-04依序续做：第6项首次记账诊断

见[原首笔诊断](paused-plan-status-history-2026-10-13.md#10-04依序续做第6项首次记账诊断)。

### 10-04依序续做：第7项提前收赛

见[原收赛记录](paused-plan-status-history-2026-10-13.md#10-04依序续做第7项提前收赛)。
