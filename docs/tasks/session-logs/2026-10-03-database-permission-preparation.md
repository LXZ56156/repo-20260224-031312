# 2026-10-03 数据库权限核验与隔离测试准备

当前结论：备份时13集合权限/索引保留，本轮实际16既有集合规则已只读保存。真实DevTools身份已通过；获准专用临时集合的候选规则下2读成功、8写权限拒绝、四合成文档不变，集合已清理。没有更改现有生产集合规则，原函数兼容/角色/事务未验，未做规则引擎内部追踪。`tournaments`的登录可读仍覆盖整文档，包括内部身份字段；存量无`_openid`不能证明客户端新增也被拒绝，不能据此宣称越权事故。

## 证据与现行合同

新备份`2026-10-03-0607/cloud/database/<集合>/rule.json`保留原始API回执；只读规则归类与约01:42审查相同。

| 集合 | 实际AclTag | Rule |
| --- | --- | --- |
| tournaments | CUSTOM | read: auth != null；write: doc._openid == auth.openid |
| client_request_logs、waterEntries、waterMigrations、waterRoomMembers、waterRooms、waterRounds、water_feature_flags | ADMINONLY | 空（预设ACL，不解释为空规则=任意访问） |
| delete_tournament_requests、feedbacks、score_locks、user_profiles、waterSessions | PRIVATE | 空（预设ACL，不解释为空规则=任意访问） |

静态检索当前`miniprogram`非vendor源码：数据库调用仅见`home/index.js`的赛事ID批量get、`core/tournamentSync.js`的doc.get以及`sync/watch.js`的doc.get/watch；未发现客户端collection.add/update/set/remove。资料、名单、比分等写入通过既有云函数。该检索不能约束改造后的恶意客户端，也不能证明安全规则引擎实际拒绝。

`createTournament/index.js`由getWXContext取creatorId、首位players.id和playerIds；未手动写`_openid`。`permission-common.template.js`以creatorId作为主办身份，真实绑定participant可录分；客户端event.openid、姓名相同或导入guest不是授权身份。`submitScore`当前本地事务修复依赖此权限，再验证锁owner/session/过期及文档写冲突。

## 字段边界与待决方案

分享/看赛需要赛事名称、赛制、状态、场次、比分、排名及可展示的成员名/头像。内部字段包括creatorId、players.id、playerIds、refereeId、score.scorer.id、clientRequestId及分享动态消息内部凭据；不能因为页面没有显示就说后端没有向登录读者返回。当前整文档get/watch不能以文档级规则单独隐藏这些字段；新增公开投影会涉及读取/同步合同，应先定范围并测试，不能直接收紧read破坏已发布分享入口。

第一步候选规则只封闭客户端写入，保留现有分享读取：

```json
{
  "read": "auth != null",
  "write": false
}
```

这是可审候选，**未应用**。当前仓库静态入口支持该方向，但仍须隔离环境证明合法云函数创建、加入、录分、设置不受影响，客户端add/set/update/remove全部拒绝，再提交生产规则变更单独授权。公开字段分离属于后续合同，不能将这一候选称作隐私问题完全解决。

依据[CloudBase安全规则](https://docs.cloudbase.net/database/security-rules)：安全规则是文档级控制，create/update/delete未独立指定时继承write；查询条件还要满足规则约束。这支持需要逐操作实测的结论，不代表本轮已执行引擎。

## 隔离引擎验收清单（均未执行）

仅在用户明确指定的**非生产环境**运行；fixture命名使用专用测试前缀，身份A为主办、B为实际绑定参赛者、C为无关登录者、G为只有同名导入guest、U为未登录。禁止用生产赛事作攻击或写入试验，禁止用JS谓词模拟回执替代真实引擎。

| 操作 | 现行规则要查的结果 | 候选预期 |
| --- | --- | --- |
| U读取赛事 | 实际拒绝码 | 拒绝 |
| A/B/C读取已分享赛事、首页ID批量get、watch | 实际返回与查询限制 | 保持登录可读语义 |
| A客户端add，包括省略/自身/他人_openid及伪造creatorId | 分项保存实际拒绝/接受，不能凭存量判断 | 全部拒绝 |
| A/B/C客户端set（新ID和已有ID）、update/remove | 分项核对create/update/delete语义 | 全部拒绝，原doc不变 |
| 合法A云创建/配置/开赛、B录分 | 权威数据/version及业务结果 | 原合同成功 |
| C/G伪造event.openid/姓名调用配置/录分 | 业务拒绝且doc/锁不变 | 原合同拒绝 |
| A锁读后B接管再A提交；同锁并发两次 | 真实事务冲突与回调重试、score/锁最终状态 | A拒绝或事务重试后重新验证，不吞锁/覆盖比分 |
| A已提交后重复相同比分、锁已释放 | 幂等结果与version未重复增加 | deduped |
| score_locks、user_profiles等PRIVATE客户端自建/读取 | 预设ACL实际行为与后端读取影响 | 据证据决定是否有后续更改，不自动改13集合 |

每个case保存envId、SDK/runtime、身份角色标签、时间、请求关联、结果码、前后脱敏hash/version和清理回执；不公开token、openid或业务文本。隔离环境未指定、真实微信身份与引擎未运行，因此本项维持“本地修复/规则准备完成，云端验收未完成”。生产部署/规则写入/真实测试数据仍按用户明确的逐项授权边界。

## 10-05优先执行：单微信账号的真实身份与权限

用户要求先完成数据库权限及微信身份验收，并明确只有本人一个微信号。无需两位朋友作为全部准备的前置：同一个由真实小程序调用取得的可信WX身份，可在不同专用合成赛事中分别作为主办、绑定参赛者、无关用户/同名guest，验证该身份在各角色下的允许与拒绝。其他owner/player使用明确合成、不可登录的哨兵；这不是多个真实微信账号，不代替跨账号串号、双人接管或双设备并发验收。

目的有两层：一是云端身份必须来自基础库`getWXContext()`，不采纳请求里的openid、姓名或角色标签；二是普通客户端即使绕过页面，也必须受数据库规则及各业务函数权限约束。只隐藏按钮、调用管理CLI或离线JS权限谓词均不能证明这两层已通过。当前login函数只返回WXContext，无资料写入，但包含原始身份；独立测试驱动以脱敏标记显示结果，不让用户提供密码、验证码或OpenID。

执行顺序：

1. 核实独立非生产环境与当前小程序关联；函数、集合/规则和最小合成fixture由主控CLI准备，显式新EnvId，不改主项目指向生产的三档配置。
2. 本人用自己的微信打开独立测试项目，调用只读身份attest；实际WX身份存在、AppID匹配才继续。开发/体验成员资格及扫码需要本人，资格尚未实际核验。
3. 同一真人身份在owner、participant、unrelated/guest四份分离fixture执行管理/录分允许与拒绝；业务调用从真实客户端直达原函数，不把helper自身权限判断冒称原函数验证。
4. 对现行规则与候选`read: auth != null / write: false`分阶段测试真实客户端get/query及add（省略/自身/其他_openid/伪造creatorId）、set新/旧、update/remove；每例独立fixture，后台前后hash/version核对。区分SDK本地拒绝、真实规则引擎拒绝、业务函数拒绝与执行错误，不能把任何失败都算权限通过。
5. 合法云函数写入成功、普通客户端写入拒绝且数据未变、伪造身份不能提升角色才算各case通过；多真人、无云身份客户端、双设备及完整事务仍分别记待验，不以单账号结论扩充。

### 当前环境前置与用户动作

Edge旧登录态失效但CLI认证仍有效，用户重新登录后已看到原上海环境。主控已在新建页选择上海、`bd-verify-20261005`（18字符）、云数据库（URL sqlType=mongo）、免费体验，配置费用0元/页面免费试用6个月；兑换码为空，立即购买禁用。当前原环境页到期显示2026-11-12 23:59:59，这是只读页面事实，不是本轮付款或已核续费订单。原API单月0元询价与页面6个月口径分别记录，不混成已创建有效期。

用户当前只需扫描购买页“关注公众号”弹出的官方二维码，在手机微信按页面指引发送“领取兑换码”，取得后直接填页面，无需把兑换码交到聊天；填好再核兑换结果及最终费用。扫码/公众号动作由本人完成，主控未代发消息。页面草案和公开QR资产保存于`tmp/identity-permission-20261005-root/`；没有提交创建、条款、支付或更改生产规则。

官方[CreateEnv API](https://cloud.tencent.cn/document/api/876/128592)明确该接口自动下单支付并从余额扣款，且输入没有最大金额字段；因此未授权付款时，不把独立CalculatePrice/getPrice的0元试算当作无条件可执行CreateEnv。当前创建器未运行、不切付费替代；浏览器具体免费兑换/最终订单先核。必要实际扫码、绑定或条款提交由用户配合，现有CLI管理操作无需另行登录。

本轮原规则、备份、partial、原始失败及未提交源码保留。官方微信云函数身份资料已重新读取；账号FAQ和安全规则旧URL读取失败不冒充新验证。一次本地wechatide状态包装检查exit1，未显示原始载荷、未自动授权或循环重试；此为连接诊断失败，不是身份或规则测试失败。独立工具实现/离线安全验证及后续实云结果按[逐项正文](../paused-plan-status.md)登记，准备不写成云端验收完成。

## 10-05调整路线：保留免费试用，先本地验证

用户质疑额外测试环境的必要性，希望把免费试用留给后续正式使用。主控撤回上述领码/填码要求，本轮不创建环境、不提交购买；独立环境不再作为全部工作的前置。已保存的草案、公开QR与工具候选保留，不继续扩大该路线。此段为最新安排，前段领码步骤仅记录当时提案。

本地Node测试和开发者工具本地运行可证明输入校验、角色判定、伪造event拒绝、幂等及模拟事务流程；SDK加载也可离线验证。它们不能证明云端安全规则引擎、微信到云函数的真实身份传递或数据库真实冲突/回滚通过。若本地调试中的SDK连接现有云数据库，读写仍然发生在云端，不是离线隔离；从电脑用CLI上传部署同样是云端部署，目标环境决定使用哪份规则和数据。

额外环境的直接收益是允许部署候选规则、制造合成冲突和回滚而不影响生产。用户目前选择不使用免费额度：先收口本地能验证的部分，随后可在现有环境安排只读微信身份检查，不需要为它单独创建环境。不能在原环境直接套候选规则或用真实赛事做破坏性试验；若剩余引擎/事务验收最终需要改变生产规则或写入合成数据，先准备具体范围和证据，再按原边界取得该项授权。未验证项保留，不制造通过结论。

本轮重新读取[微信小程序调用云函数官方资料](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)，确认真实身份取自`getWXContext()`且CLI部署与本地运行不同；安全规则旧URL再次读取失败，未据此新增规则引擎结论。已有应用测试不因解释路线重复全量运行。

## 10-05现有环境只读身份：DevTools实际通过

用户确认继续。新增[生成器](../../../scripts/dev/wx-identity-readonly.js)及[五项直接测试](../../../tests/wx-identity-readonly.test.js)，仅生成全新ignored小程序；正式源码、私有配置和原云函数保持。入口仅按钮调用login，空data、显式现有env、traceUser=false；启动不调用，身份不走原应用七日缓存。本地绑定AppID先与运行AppID比对，再比对云返回；root/data矛盾拒绝。界面只显示固定结果码及布尔，UNIONID缺失不作为失败，没有DB、其他函数、分析事件或SDK错误回显。复用已生成 `tmp/wx-identity-readonly-20261005-current/` 九文件；将来生成须指定全新目录：`node scripts/dev/wx-identity-readonly.js --output tmp/<新目录>`，已存在目标拒绝且保留partial。

注册的wechatide MCP本次正常：登录未过期；versionRelation=skip_check，未声称skill版本兼容。旧自定义本地桥接exit1不是登录失效证据，不再要求重登。只读函数详情确认login为Active、Nodejs16.13、timeout3；未部署。主控审原handler仅getWXContext/okResult及生成入口，核固定配置和SHA后，以官方MCP打开/编译新项目，初始结果为空。上海2026-10-05 03:15:36调用一次verifyIdentity，真实wx.cloud.callFunction返回LOGIN_OK，openid非空与AppID匹配均true，UNIONID存在false；03:16:18保存脱敏观察回执。这两个时刻不是云函数执行耗时。实际SDK3.17.2/platform devtools，未mock、未使用管理端invoke。486×1048实图主控亲看，结果一致且无原始身份/错误。

验收根 `tmp/wx-identity-readonly-root-20261005/` 含前态/函数状态、runtime-go、actual-identity-receipt、runtime-info、actual-login.png及acceptance；主控核七输入/九生成文件未变。Sol的生成/语法/两文件lint均退出0，Luna窄冷审无新P0/P1/P2。首版五测试原始流保留；固定expectedAppID加强后的测试只有工具输出，缺独立子进程final回执，主控为此只补最终五直接测试，实际5通过、0失败/跳过、exit0，独立流/SHA保存，不重复应用全量。旧隔离harness六测试只属离线工具安全，封存不执行。

结论仅为**现有环境、DevTools真实微信到login身份链路通过**。iPhone本人扫码、跨账号、赛事主办/参与/同名guest授权、客户端规则拒绝、索引、并发/真实事务回滚仍未验。没有兑换试用、创建/付款、客户端preview/upload、云部署、规则变更或业务数据读写；正常平台调用日志不属于应用业务写入。

## 下一步提案：现有环境的临时集合规则验收（未执行）

为保留免费试用，拟仅新增 `codex_acl_verify_20261005` 临时集合。执行前确认该名称不存在；若已有同名集合则停止，不复用、覆盖或删除。原13集合、其规则/索引及所有生产函数保持。

该新集合拟使用 `CUSTOM`，规则为 `{"read":"auth != null","write":false}`；具体[设置规则API](https://cloud.tencent.com/document/api/876/128959)请求必须显式目标EnvId、CollectionName和JSON字符串Rule。官方页面打开超时，官方检索结果确认CUSTOM必填Rule及2018-06-08合同；没有执行修改。管理端预置四条纯合成文档：`fixture_read/set/update/remove`，仅marker=SYNTHETIC_ONLY、value=1。准备独立客户端驱动，原只读入口不加数据库动作。

真实微信客户端十类操作：get/query、四种add（省略/自己/合成他人_openid及伪造creatorId）、set新/旧、update/remove。期望登录读取成功、客户端写入拒绝、四基线文档全量hash不变；SDK本地拦截、引擎拒绝、网络/未知错误分别记，不能将所有失败算通过。意外写成功或未知故障立即停后续case，保存证据。完成检查并保留本地证据后，只清理本次新建的测试集合；清理失败如实保留，不扩大删除范围。

确切提案JSON在 `tmp/wx-identity-readonly-root-20261005/next-acl-scope-proposal.json`，不是执行器；新客户端驱动/离线安全验证在本地准备，云规则、fixture与真实SDK测试均未执行。该方案涉及**现有生产环境的新临时集合及规则/合成写入范围**，不同于此前非生产环境合成验收；准备具体候选后取得该范围授权，不直接套用旧授权。它验证候选规则的引擎行为，不证明现有tournaments已改规则、原业务函数合法写入兼容、角色授权或真实事务已完成。

## 10-05临时集合客户端驱动准备完成（未执行云验收）

实现由6.1 Sol high完成，6 Luna max独立冷读；仅写新 ignored `tmp/wx-acl-candidate-20261005/` 与 `tmp/wx-acl-cold-20261005/`。最终执行候选为 `driver-final.js`、`generate-final.cjs`、`safety-final.test.cjs` 和已经生成的十文件 `project-final/`。原 `HANDOFF.md`/plan及project是首版历史材料；最终差分以 `final-variant-delta.json` 为准，不能原样重跑其旧生成命令，也不能覆盖已存在的project-final。

主控发现首版所谓伪造creatorId实际为当前用户自身，不能证明伪造他人。最终窄修改为固定不可登录的合成他人哨兵，直接测试同时断言该值及其不等于caller；原代码、测试、项目和冻结全部保留。主控亲审最终驱动/生成器/测试与启动入口，核固定环境/集合/AppID、空payload真实login前置、两读基线、八写独立目标。任一意外写成功、未知异步失败或SDK同步拒绝均立即停，不自动重试；错误只存固定分类/安全整数码，原身份和SDK消息不进入证据。页面启动零调用，只有明确runACL触发。

最终六直接安全测试、实际生成、最终生成页面启动一测试，三独立子进程均数值exit0，测试分别6/6和1/1、0失败/跳过；回执及stdout/stderr在 `final-direct-safety-tests.*`、`final-local-generation.*`、`final-generated-startup.*`。主控核回执流SHA、最终输入/十产物SHA及旧原件保全，不复跑既有全量。最终driver SHA256为 `0065a1d551fd275415044c2af780f345562a9d38da4672e1c3488d092db03a38`，与生成项目driver一致。Luna冷报告未见未关闭P0/P1/P2；报告的最终产物9文件为计数笔误，实际10，独立勘误保留原报告。

以上仅证明工具安全和候选准备。真实CloudBase规则、四合成文档、十项客户端操作和清理均**未执行**。原生SDK的纯数值错误映射尚缺可靠依据，不能把任意拒绝当规则通过；symbolic权限响应也需结合规则读回与后端前后全量快照核来源，驱动的engineValidationPassed始终false。不改原13集合/其规则、生产函数或业务数据，不创建环境/消耗免费试用/付款/上传。下一步仅请求现有环境中新建该临时集合、配置登录可读/客户端禁止写、预置四合成文档、执行十类操作及证据保存后清理该新集合的具体授权。

## 10-05获准专用临时集合：真实客户端候选行为与清理

用户回复“允许”，范围为现有环境专用 `codex_acl_verify_20261005`：新建、仅该集合规则设置、四合成seed、十客户端操作及证据保存后的本次集合删除。不扩大为现有业务集合/规则更改、生产函数部署、真实业务写入、新环境/试用/付款或客户端上传。实际master/HEAD `be5bea5`，既有dirty/private/partial保留。

环境列表确认目标；结构查询0偏移/limit100/Total16/16条且目标名称不存在后才新建。当前16既有集合与备份时13的不同如实记录，不能沿用旧数：新增出现在当前清单的relation_data_depart/sys_department/sys_user仅只读保存规则，不推断来源或删除。CLI分别保存16个原规则；只对新集合调用ModifySafeRule，随后DescribeSafeRule读回CUSTOM及精确JSON `{"read":"auth != null","write":false}`。管理端一次预置fixture_read/set/update/remove四文档，各只有_id/marker/value。全量读取Total4/4条唯一ID、完整基线通过。

首次打开页面报“Failed to connect to WechatIDE”，当时尚无客户端ACL调用；用户继续后查明安装路径内DevTools进程已退出，使用现有安装Hidden启动恢复，没有auth或登录。注册MCP一度不在工具列表，未改配置或创建替代桥；工具恢复后官方安装诊断compatible=true/2.02.2609292，已读内置wechatide-skill0.3.11，再明确传版本得到equal/loginExpired=false。旧未传版本的skip_check仅历史状态，不能当本轮就绪。安装诊断有DEP0190警告，未称工具全无警告。官方打开项目/编译到pages/identity/index成功，初态busy=false/result=null，真实runtime为SDK3.17.2/devtools。

上海10-05 **04:08:01**仅一次callMethod runACL空args；方法返回后先读到busy=true，再仅等3秒读取最终状态，不重复runACL或制造样本。真实login成功/身份非空/AppID匹配；get/query两读成功，add省略/自己/合成他人_openid/合成他人creatorId、set新/旧、update/remove八写全部异步返回symbolic DATABASE_PERMISSION_DENIED，安全数字码-502003。完整10case、0未知/SDK本地拒绝/意外写成功；数字本身没有作为判据。驱动保守保留engineOriginVerified和engineValidationPassed=false，未采集内核追踪，不把symbolic标签单独升级为内部引擎来源证明。

实际回执 `actual-client-receipt.json`，后台 `documents-before/after.private.json` 完整四文档逐字段相等，排序canonical SHA256 `5f9839898a8b3c13d668a6560f3d9548d1444731161ac9e50b8f16648ceca5fc`；原16规则前后除RequestId逐字段相等，新集合规则再读仍相同。原/最终工具及十产物SHA保持。469×1013诊断实图actual-acl.png主控亲看，仅脱敏结果；诊断JSON部分超出屏幕，完整判据取页面data回执，不称正式产品UI验收。一次后台after查询因恢复后的内存AppID缺失被MCP参数校验拒绝，没有发云查询；重新从本地配置内部读取后取得完整快照。一次证据路径的内存值缺失将新回执落到仓库外同项目undefined目录，核内容/边界后无覆盖移动到正确ignored根；旧文件及用户资料未动。

保存before-cleanup-acceptance及完整原始回执后，仅请求删除本次创建集合，pending任务原件保存且未主动轮询；先结构查询仍17含临时，随后处理文档时再次查完整列表，上海10-05 **04:14:40**核得16条/Total16、原16名称完全相同、临时不存在，cleanup-observed通过。原16规则早已前后核相同；不把数据库记录数自然变化当作本任务写入证据。`tmp/wx-acl-live-20261005-0347/`独占根包含授权/前置、CLI逐进程原始流与SHA、身份脱敏十case、完整快照、故障/恢复、图、清理和manifest；不覆盖旧候选/partial，不重复六+一工具测试或应用全量。

有限结论：**一个真实微信登录客户端在专用临时集合上的候选规则读写行为符合预期**。身份传递和候选行为取得实际证据；现有tournaments仍为原read登录可读/write基于doc._openid，未应用write:false。合法云函数在候选规则下的兼容、无身份读取、单账号各角色授权、锁接管/事务冲突与回滚/幂等、iPhone本人/多账号/双机均未闭合。本地准备下一独立临时命名范围及原函数同源候选，具体部署/写入先准备后按对应范围授权，不恢复免费环境领码。

6 Luna max另行只读复核实际回执、前后四文档与16组规则，报告在 `tmp/wx-acl-actual-cold-20261005/assessment.md/json`；确认10类记录与前后相等，仅作限定观察结论，未确认内部引擎来源，不升级为原生产ACL、角色或事务通过。该复核无云/GUI/测试/原业务数据读取，主控保存清理回执/完整列表证据，不重复全量。
