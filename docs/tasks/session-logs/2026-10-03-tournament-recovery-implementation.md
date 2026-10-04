# 找回比赛：已批准范围的本地实现

用户“全部允许”已批准“我的”次级入口、本人主办/真实绑定参与三状态列表及既有赛事打开链路。主控负责本次实现，保留master/既有脏树；无commit、部署、上传、发布或真实数据写入。

## 实际变化

- 新只读 `getMyTournaments`，身份仅来自getWXContext。主办一路、非主办参与一路；owner路也返回参与角色，避免同一记录在两路及跨页重叠。参与查询支持现有ID别名，拿到记录后再次用实际players过滤，players存在时不信残留playerIds；无players的旧记录才使用playerIds。
- 每页20条，updatedAt Date降序、ID升序；每路只推进实际消耗的排序边界，不推进预取但尚未展示的记录。游标使用当前OPENID为密钥的HMAC绑定调用身份/边界；游标没有原始OPENID，修改游标仍不能改变服务端归属查询。此HMAC不是新增跨应用密钥服务。
- 每路最多扫描100条候选，遇陈旧索引过滤上限返回 `TOURNAMENT_RECOVERY_PAGE_PARTIAL` / completePage=false /可继续游标；不把上限当完整空列表。一条路失败整页业务失败，不显示成功部分或空列表。
- 仅返回ID、名称、模式、状态、时间、角色与已完成/总场数，完成只计status=finished且有效比分。未返回内部玩家ID、分享凭据、完整比分/名单。当前数据合同要求updatedAt为数据库Date；不兼容排序数据将明确失败，不能悄悄丢行。
- 新原生列表页含加载、空、错误、重试、继续分页、结束状态；mine既有战绩逻辑未改。列表只在内存，刷新/迟到/隐藏/卸载请求有代次保护；刷新失败重试仍查第一页，分页失败重试原游标。打开使用既有share-entry远端读取/同步，不根据摘要伪造完整赛事，不批量覆盖本机战绩。
- cloudbaserc登记getMyTournaments及第7/8的finishTournament/manageCoManagers；未指定线上runtime/timeout、未执行部署。cloud.call把getMyTournaments列为既有只读重试范围。

## 测试与工具真实结果

先添加5个云测试和3个页面测试，实际分别因对应新入口缺失失败；实现后首次14项定向验证通过（5云+3页面+6原mine回归）。后补扫描上限、有效完成计数/时间排序、刷新失败重试等直接案例，目前新增7云+4页面=11项均通过；原mine6项仍保留前述通过回执。

云测试包含25主办+25参与/10重叠合并40条稳定分页、主办未参赛、绑定ID别名、同名guest、陈旧playerIds、查询失败、游标篡改/不同真实身份、删除与解绑、100条无效索引后的继续分页。页面测试包含刷新代次、分页原游标重试、刷新原请求重试、技术错误脱敏、卸载迟到、只能打开已读ID、不写本机快照。

新源/测试的实际eslint二进制定向检查0错误/0警告。误用run-eslint带文件参数实际跑了全量，发现新增测试structuredClone不在eslint全局配置中（1错误+既有35警告），已改为本项目通用JSON克隆并以定向检查修复；该失败不能算通过。全量仍待第7/8整合后的统一检查。

同步公共模板先两次遇Windows cp写同内容文件Permission denied（分别feedbackSubmit/scoreLock），第一次未生成新lib，第二次虽生成新lib但整体同步失败。修改现有同步脚本为cmp相同则跳过，只对差异复制，之后实际同步成功；check:cloud-common与diff --check通过。公共业务模板本阶段未改变，未手改各函数lib。

## 未验证

这是离线SDK stub和Node本地行为验收。两路查询/组合索引/数组别名匹配、真实WX身份、CloudBase读取成本与3秒时限、跨设备同身份仍未在隔离云验证。updatedAt更新期间的多页列表不是原子历史快照；客户端去重防止重复展示，但不承诺并发变化下历史完整迁移。

开发者工具升级安装阻断有效截图：没有当前源码实图、320/390/430或真实Android/iPhone结果，不能宣称UI或全计划第11项完成。安装完成后重建签名会话并补实图；隔离环境明确后准备函数与最小身份fixture的实际验收。

## 10-05依序续做：当前交付与未验边界

上文为最初实现时点；后续后端已交付`fa57b70`、前端已交付`da56e80`，并有组合工具和后续本地回执，详细沿革在[逐项正文](../paused-plan-status.md)。本轮从main/master `f650482a2bab94cb4fe83a13965a21821488012b`接续第11，不将旧日志的“未提交/无图/全量待验”反推为当前源码未交付，也不将历史390图冒称当前设备验收。

本人主办/真实绑定参与的只读列表、稳定游标、失败原游标重试、刷新/旧响应互斥及share-entry打开已在批准范围实现；本轮没有新增产品动作或依赖，也没有重跑旧tests、SDK加载、全量、截图或云查询。当前getMyTournaments Linux加载证据属于第9的18组复用范围，不重复打包等价源码。真实WX身份、Date/组合及数组索引、查询成本/3秒、多页并发、跨会话/设备仍未验证；旧console的函数不存在记录是当时事实，未获得新部署回执，不能称线上功能已可用。

用户要求CloudBase暂不处理、iPhone验收后做；本轮不重新登录、创建/部署、上传/发布或写真实业务。原图、报告、备份、partial及未提交改动保留；待上述实际条件取得后依原标准补验，第11完整验收未闭合。

## 10-05恢复CLI真实验证

用户新指令明确允许必要云函数上传部署，不再沿用上段CloudBase停用作为本轮阻断；付款、客户端上传/发布和真实业务写入仍不在范围。实际现有CLI3.7.3认证可用，上海环境list exit0只见原生产，fn list exit0共39个函数，getMyTournaments确实缺失。其他地域未查询，真实环境资格/微信绑定仍未知。原始清点在`tmp/cloud-real-validation-20261005-inventory/`，主控对raw流SHA、1/39数量和环境/目标相符核验通过，无重复登录。

本轮选择仅新增已验证的独立只读getMy函数，用其11当前源码和6368自有依赖的旧完整ZIP/Linux24.11回执准备部署；不替换其他39函数、不修改业务文档/规则。部署配置/源码/工具先核，实际云detail和受控invalid-cursor smoke另记，准备不称已部署。无身份拒绝或有身份时INVALID_CURSOR都在查询前退出；需要核真实平台InvokeResult/ErrMsg/RetMsg，不把CLI exit0或Active单独当通过。

这种烟测只能证明实际handler可加载并守住受控拒绝，不能证明真实主办/参与分页、Date、组合/数组索引、跨设备、权限规则或整体3秒余量。录分锁/收赛事务要独立环境和真实身份，生产赛事不用于攻击/回滚样本；本轮未重复旧业务tests或全量。后续实际执行与未验项以[逐项正文](../paused-plan-status.md)登记。

### 实际执行回执

主控完成源码/Git/自有冻结ZIP及24工具输入的审查并发root GO后，仅新增getMy，11当前源/6368依赖、6379成员SHA/extras0通过，不安装新依赖。显式上海环境、Nodejs24.11/3秒/256MB/index.main/Event/InstallDependency FALSE，上海01:53:04–01:55:31实际外层exit0/146.46秒。新增前detail exit4/RESOURCE_NOT_FOUND为预期前提；deploy、部署后detail、一次受控invoke实际exit均0。平台实际Active/Available/24.11，InvokeResult0/ErrMsg空；RetMsg解析ok=false/code=PERMISSION_DENIED，可信微信身份缺失时在DB查询前拒绝，是该烟测预期结果，不是找回业务分页通过。

部署后再只读列函数，actual exit0/40唯一函数，仅新增getMy；原39六字段列表metadata完全相同，未下载其代码。执行原始流与SHA、配置/源码绑定、freeze及前后保全在`tmp/cloud-real-validation-20261005-prepare/execution/`，主控`tmp/cloud-real-validation-20261005-root/acceptance.json`核验通过，16dirty/71源码保持。输入ZIP不是CLI重新压缩的远端ZIP，远端完整成员SHA未验；旧Linux加载/本地测试复用，没有重跑require/全量/完整CRC。首次本地验收脚本对RetMsg.json包装结构的假设不符exit1已留诊断，修正后exit0，没有修改实际云响应或再次invoke。

本轮只闭合“函数不存在”和实际handler加载/受控无身份拒绝；没有真实微信主办/参与查询、索引、规则、跨会话/设备、手机或事务验收。用户无需为这些管理CLI动作重新网页登录；后续需要可隔离环境与微信测试身份，另核免费资格/范围，不自动付款、创建付费环境、上传客户端或写生产赛事。

主控另以CLI通用api只读DescribeBaasPackageList/DescribeEnvLimit，两进程exit0/stderr空、原始流/envelope/SHA核过，20套餐只是目录。baas_trial UnitPrice为字符串5，尚非最终单月询价；MaxFreeEnvNum1/CurrentFreeEnvNum0与MaxFreeTrialNum0/CurrentFreeTrialNum0不能证明兑换码可领或免费创建。CurrentEnvNum0与上海已有生产1不一致，口径未核，不据此创建；证据`tmp/cloud-isolation-eligibility-20261005/actual-readonly/`。首次摘要把带文本前缀输出当纯JSON解析失败，改为严格提取单对象、核余文及原始SHA后通过，未改输出或重复请求。账号资格、微信绑定和A/B/C身份仍是独立条件，未运行env create或付费替代。

随后主控核installed SDK的新购询价方法，仅发送一次billing CalculatePrice/getPrice/2018-07-09，实际trial BillTags、上海/1个月/1份/CNY；CLI exit0/stderr空、实际Price/TotalCost/RealTotalCost均0，TimeSpan/产品相符。Luna原body把tag抄多一个下划线，主控来源门禁在发云前exit1，原稿保留；另名root-approved-quote按raw修正，实际原始流/SHA/envelope回执在`tmp/cloud-isolation-eligibility-20261005/actual-price-verified/`。0元询价不是免费资格、订单或创建成功证明；没有createEnv/下单/付款/兑换码/绑定，真实事务与普通客户端规则仍待独立环境和微信身份。


## 10-05 截图复核接续

本轮实图、合同修复、全部失败、测试回执及当前未验项统一见 [原生截图复核](2026-10-05-native-screenshot-review.md)。本节仅补接续入口，不改写上方历史结果或本项业务/验收合同；唯一逐项状态仍见paused-plan-status正文。
