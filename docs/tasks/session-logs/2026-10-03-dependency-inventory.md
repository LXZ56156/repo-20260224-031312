# 云函数运行时与依赖清点

日期：2026-10-03。工作区为 `D:\projects\badminton-miniapp\main`，`master` / `b571c68754e964e1a73800645f68a49d99f40f41`。开始清点时工作树已有其他未提交修改；本任务只新增本记录和 `tmp/dependency-inventory-20261003/` 两个汇总文件，没有改 `current.md`、应用源码、云函数源码或依赖。

## 结果与边界

远端清单共 **39 个函数条目**：旧 `0238` 清单20个完整代码包，新 `0607` 清单18个完整代码包，另有一个无法下载代码的条目。两批之间函数名不重复。现有 `0607/verification/cloud-package-integrity.json` 已记录38/38包完整；本次沿用该回执，没有重算文件哈希。

| 归属 | 0238 | 0607 | 合计 |
| --- | ---: | ---: | ---: |
| 可下载且映射到本地受管配置 | 18 | 5 | 23 |
| 可下载但不在本地受管配置 | 2 | 13 | 15 |
| 无可下载代码 | 0 | 1 | 1 |

23个受管函数都能以同名映射到本地 `cloudfunctions/<name>`，且在 `cloudbaserc.json` 中配置。`0238` 的18个是 `addPlayers`、`cloneTournament`、`deleteTournament`、`feedbackSubmit`、`generateShareCode`、`getMyPerformanceStats`、`getUserProfile`、`manageActivityId`、`managePairTeams`、`rebuildRankings`、`removePlayer`、`saveUserProfile`、`scoreLock`、`setPlayerSquad`、`startTournament`、`submitScore`、`updateSettings`、`waterSession`。`0607` 的5个是 `createTournament`、`joinTournament`、`login`、`resetTournament`、`setReferee`。

15个未映射但有包的函数是：`0238` 的 `reportOpsActivityEvents`、`submitFeedback`；`0607` 的 `beginMatch`、`createEvent`、`editResult`、`ensureUser`、`exportEvent`、`generateSchedule`、`getEventCode`、`joinEvent`、`resetMatch`、`setEventStatus`、`setJudge`、`setPlayerLevel`、`submitResult`。代码入口显示后13个使用 `events` / `matches` 及 `event_members`、`event_players`、`event_stats`、`users` 等集合，是另一套赛事/场次函数；`reportOpsActivityEvents` 的 `logic` 写入运维行为事件及限流数据；`submitFeedback` 写 `feedbacks`。本地受管的 `feedbackSubmit` 也处理反馈，但仅凭两个入口不能判定哪一个仍被调用或应保留。上述15个函数的业务责任人、调用状态与是否退役均未知。

唯一不可下载项名为 `cloud1-1ghmqjyt6428702b`（与环境ID同名），`UpdateFailed` / `Available`，列出运行时 `Nodejs16.13`，但没有下载地址或代码文件；不把它推断为可恢复的业务函数。

## 运行时与包版本

38个完整包的清单运行时为：35个 `Nodejs16.13`、2个 `Nodejs18.15`、1个 `Nodejs20.19`。较新的两个是 `generateShareCode`、`manageActivityId`（Node 18）；`reportOpsActivityEvents` 是 Node 20；其余35个完整包是 Node 16。不可下载项也列出 Node 16。Node官方将16、18、20均列为EOL；EOL版本不再接收上游安全更新，见 [Node.js EOL](https://nodejs.org/en/about/eol)。项目此前依据 [CloudBase云函数运行环境文档](https://docs.cloudbase.net/cloud-function/runtime-support)记录 Node 24.11 为支持/推荐版本；本次没有核实该CloudBase环境当前实际可选的运行时，不能据此判定线上可直接切换。

38个代码根都有 `package.json`，没有一个有 `package-lock.json`，也没有声明 `engines`。全部38个根清单直接声明 `wx-server-sdk`：25个固定为 `2.6.3`，13个使用 `~2.6.3`。指定路径下实际安装版本在38包中完全一致：`wx-server-sdk@2.6.3` → `@cloudbase/node-sdk@2.9.1` → `@cloudbase/database@1.4.1`。后两个包没有作为根依赖直接声明，实际版本从函数代码根的 `node_modules` 指定元数据文件读取。没有lock意味着这些源码根不能仅凭清单确定一次新的依赖解析结果；这里记录的是备份中已安装的包版本，不是升级兼容性结论。

### 工具链与SDK4隔离目录

根 `package-lock.json` 中 `miniprogram-ci@2.1.31` 与 `miniprogram-automator@0.12.1` 都标为开发依赖；根锁文件没有 `wx-server-sdk`、`@cloudbase/node-sdk` 或 `@cloudbase/database`。已有根目录审计记录 `tmp/audit-2026-10-03/npm-audit.json` 报告94个受影响包条目（44 critical、24 high、24 moderate、2 low）。静态对应到99个锁文件节点引用，99个节点均标记为dev/devOptional，生产节点为0；这是本地工具链审计结果，不是38个云函数包或线上运行时的漏洞结论。

`tmp/sdk4-audit/` 是独立目录，仅见 `node_modules`，没有根 `package.json` 或 `package-lock.json`。其中实际安装的是 `wx-server-sdk@4.0.2`、`@cloudbase/node-sdk@3.17.2`、`@cloudbase/database@1.4.3`。它与备份中的云函数包分开记录；这组版本本身不能证明某个远端函数使用SDK4，也不是已选定的升级目标。

## 合同验证范围

主控07:27后补只读控制台核验（Edge，已登录原环境）：submitScore配置显示Node.js16.13/Timeout3/256MB/index.main/正常，修改时间2026-09-12 22:04:58，该页面标注运行环境不支持修改。另打开新建代码包表单、选择“普通云函数”并仅展开runtime菜单，实际选项有Node.js24.11（公测中）、22.21（公测中）、20.19、18.15、16.13。没有填函数名、上传文件、选择新runtime、点击创建/保存/测试，已离开未提交表单并保留submitScore配置页。故“官方文档推荐LTS”与“本环境控制台可选但标公测”分别记录；没有把已有函数配置页面推断成可直接原地升级，也没有升级生产。浏览器事实来自`tcb.cloud.tencent.com/dev?envId=cloud1-1ghmqjyt6428702b#/scf/create-function?method=code-archive`下拉菜单；后续仍须指定隔离环境测试。

现有本地核验使用真实 `wx-server-sdk@2.6.3` 包装层和底层事务替身，没有连CloudBase网络；已确认事务集合 `update` / `remove` 经包装后的 `stats.updated` / `stats.removed` 返回形状，见 [录分事务冷审](2026-10-03-score-transaction-cold-review.md) 和 [录分事务修复记录](2026-10-03-score-transaction-repair.md)。这项结果不覆盖隔离CloudBase环境中的身份、服务端事务冲突/回滚、错误映射、日期及int64序列化、幂等行为。上述项目需要明确目标CloudBase环境和单独授权后才能做环境验证；本次没有连接云环境、部署或写入真实数据。

## 方法与产物

主控补做无网络SDK包装比较：实际加载备份wx2.6.3和隔离目录wx4.0.2，预先禁止http/https请求、替换底层transaction入口。两者doc.get、update.stats.updated、remove.stats.removed、非法update参数拒绝、retry次数参数转发、合成getWXContext及缺上下文为空均通过。输入Date对象和十进制int64字符串未被包装层改变；它们由替身直接给出，**不是网络序列化/真实int64 codec验收**。脚本`tmp/compare-wx-sdk-offline-contract-20261003.cjs`、回执`tmp/dependency-inventory-20261003/offline-wrapper-comparison.json`。未修改或升级任何项目依赖；身份真实性、服务端冲突回滚、真实错误、Node切换和SDK4业务幂等仍未验证。

汇总器 [collect.js](../../../tmp/dependency-inventory-20261003/collect.js) 对两份函数清单逐项读取代码根的 `package.json`、`package-lock.json`、三个指定SDK元数据路径和根 `index.js`，并与本地 `cloudbaserc.json` / 函数目录名对照。结果在 [inventory.json](../../../tmp/dependency-inventory-20261003/inventory.json)，含39条函数映射和逐包版本字段。本次没有跑测试、npm audit、安装、升级或云端操作。

执行早期查找时有一次 `rg --files` 对 `0607` 备份根递归枚举了文件名，终端输出被截断；没有打开node_modules子树内的包清单，也没有重算238k文件哈希。随后清点脚本将读取限制为上面列明的路径和入口文件。

## 2026-10-04依序续做：第9项

本轮main/master起点为`136bfda674c95b75577ce15990e7e5b68c36dfe2`，远端同SHA、index空。16个既有未提交文件和325份云源码/依赖清单/相关工具测试的SHA保存在`tmp/dependency-nine-root-20261004/before.json`；私有配置、单打候选、QR、备份、partial和旧证据保留。默认Git状态会聚合未跟踪目录，不能与展开文件数混用；本轮current的并发修改属于任务文档，不是原dirty增加或丢失。

两名Luna分别只读当前依赖与既有运行时证据对应性。只读核查阶段没有登录或查询CloudBase、升级SDK/运行时、安装依赖、执行npm audit或audit fix，也没有构建/require、应用测试、GUI、部署、上传、付款或真实数据写入。上方38备份包/39云条目、旧94条工具审计与平台runtime菜单均是带日期的历史事实，不据它们声称本轮重新检查了线上或最新安全公告。

本轮重点将当前Git源、冻结依赖、候选ZIP和实际运行回执串在一起，避免把“版本相同”当“包已验”，也避免重复已有验证。`tmp/final-cloud-head-bundles-20261004/final-receipt.json`七个ZIP摘要与第5/7/8最近构建包一一相同：add/remove/settings、finish、join/start、submit；旧七包的官方Linux24.11与Windows16.13回执可在源与输入对应性确认后复用，不再新建等价包。七包清空NODE_NO_WARNINGS/NODE_OPTIONS的回执和其余旧11包未记录警告变量的边界分开，不把空stderr写成DEP0040已修复。

当前26个tracked函数清单均固定wx-server-sdk2.6.3，没有函数lock或engines。根package.json/lock相对阶段起点SHA未变；根工具依赖不冒称云SDK链。两份只读结果为`tmp/dependency-nine-current-20261004-readonly/assessment.md`与`tmp/dependency-nine-runtime-map-20261004/assessment.md`。固定HEAD到旧dc73的cloudfunctions tracked内容无差异：7个新包95源加11份旧Linux包127源，共18组222源对应当前canonical Git内容；submitScore/index.js仅工作CRLF与Git LF差异，保留双SHA，不称原字节相同。其余11组没有新require或重新完整CRC，依赖树证据沿用对应旧回执。

全26组此前只有Windows聚合加载；另外8组缺独立当前Linux包与加载证据，因此继续补反馈、分享码、个人成绩/档案、活动ID、排名重建、档案保存及打水8组。Sol仅在全新`tmp/dependency-nine-eight-current-20261004/`准备工具，取固定HEAD的93源和各自0238备份files.json列明的6368依赖，合计50944依赖；没有原ZIP时不借别的函数安装树或重新解析依赖。先核各自完整manifest/既有integrity与当前package合同，再由主控审实际工具和输入、冻结SHA后才允许单次构建与官方Linux24.11离线加载。18组已有匹配证据不重复加载。构建与真实结果后续另记，不把准备检查当加载通过。


准备与执行跨上海10-04/10-05，证据根仍保留创建时的20261004名称。来源补充`provenance-binding.json`实际绑定0238总manifest8行树摘要、各files.json及input-plan，50944列明成员resolve均在各自code根；JS/Python语法通过。entry loader逐字节复用旧已审版本，Linux validator仅替换任务根/新ext4临时目录前缀。主控全文审适配builder/zip/driver，Luna窄审无P0/P1。准备中按前一指令把provenance追加freeze时，保留原7项freeze完整字节为initial；后发“不改freeze”到达时追加已结束，实际8项freeze为aab324d4f82ed574bb980d072b2d8193d8a90b7ef71f96e632983d33cd346812，7原工具与input-plan字节未变，旧HANDOFF不变。主控另核两版及sidefreeze后才在`root-GO.json`明确批准单次8包执行，不将旧freeze冒称最终执行依据。主控两次只读比较误用了旧临时目录前缀/初最终freeze假设，exit1诊断保留；按实际diff/最终8项重核exit0，没有改执行工具或触发构建。

工具冷审的非阻断边界分别处理：顶层wrapper也要求在实际启动时清NODE_OPTIONS/NODE_PATH/NODE_NO_WARNINGS/WX_CONTEXT_KEYS并另留痕；内层Node40秒超时时Python可能未写inner receipt，此时须按外层非零/错误流判失败，不用缺回执推通过。正式执行从审定工具启动，不新增旧18组/Windows聚合require、应用全量或云操作。实际完成与否及退出闭合后续记录。


### 10-05单次实际运行结果

上海00:06:51.269–00:19:37.845，8/8构建与官方Linux24.11加载通过，wrapper真实outer0/timeout=false、builder0，各包zip-build/linux-ext4/inner Node共24原始退出码全部0，无失败/重试。93源与50944自有依赖构成51037成员，291622029解包字节，300827425 ZIP字节。逐成员SHA/CRC、排序/固定时间/重复ZIP字节、extra0、Linux新ext4提取与加载后成员hash实际通过；每包真实SDK、main/网络/subprocess0，模块限定于各自解包ZIP，targetEnv=null/isolationOnly=true，不写业务。未运行Windows聚合或旧应用full。

| 函数 | 当前源 | 成员 | ZIP字节 | ZIP SHA256 |
| --- | ---: | ---: | ---: | --- |
| feedbackSubmit | 11 | 6379 | 37582174 | `b786feae0ec728b853ca47110a866a57b40ed1c17c4415db8fb59857481b7750` |
| generateShareCode | 12 | 6380 | 37582915 | `3812398c4433c5855c6e30d0da4c5c5327101341504a4e2b6d459acb49dd5e34` |
| getMyPerformanceStats | 12 | 6380 | 37586601 | `d7cdd22a958c89094881904d2aa14211beafeaea730a26a73cc4809914b0a2ae` |
| getUserProfile | 11 | 6379 | 37579597 | `51796b954423e36e8ce3ccc2ddbd2318de6225427799914879e8538b610ebbc3` |
| manageActivityId | 12 | 6380 | 37587913 | `0fe30f72880edb8b00e7bf217b3ccf010883bdf54e71a31e9c6e2e915996916f` |
| rebuildRankings | 11 | 6379 | 37579610 | `49b141a023fd9f1ba246ddb2a140fcfd4e979093c6d8ad73c3c5245cbfe8fd97` |
| saveUserProfile | 11 | 6379 | 37590133 | `7f858fa2cdc6671341a5ef8770455ffe1fec18619b09ed1749c65176fc16d91b` |
| waterSession | 13 | 6381 | 37738482 | `133a08c22ba82c040e16b8925ccae36e77e12100ca8996878b947c1c0e12aa8f` |

主控`accept-eight.py`单次只读实际回执与流SHA、freeze/side输入、16dirty/325源码/清单/工具，exit0，结果`tmp/dependency-nine-root-20261004/eight-acceptance.json`。实际launch四变量为''，inner NODE_OPTIONS/NODE_NO_WARNINGS明确清空，各stderr无DEP0040；不据此宣称历史警告已修复。原7项freeze、旧HANDOFF及最终8项/sidefreeze前后hash闭合，备份/partial/旧18包/既有官方Node16与Linux二进制保留。最终完整26组315源的Linux对应性由18组222源复用与本轮8组93源共同支持，不冒称26次新require或CloudBase平台验收。无新的业务源码、lock或SDK改动；真实身份/规则/事务/回滚、日期/int64 wire、实际云runtime与升级仍待验。独立产物窄冷核和文档/交付闭合后续另记。


最终Luna仅一次窄核8个实际ZIP整包SHA/中央目录、只inflate93源码，与manifest/工作raw/Git object ID三方相同；24 child及builder/outer数值退出与流SHA、8项freeze/side谱系通过，issues空。报告`tmp/dependency-nine-eight-current-20261004/cold-artifacts.md/json`最终SHA分别84451595aa2644c3b03d48f490e3156b78a3d0c2705b4b45a5b5ff45d60c2146/c69fed76b28a8817ba053cc52a20401e2daa18a8f4d0927b9a8884b590ba23d8；review说明区分既有实际执行与冷核未重跑，不重inflate50944依赖/CRC/require，也不重复325保全（引用主控actual0）。第9本地可推进证据已补齐，云端标准仍保留；随后依序核第10当前源码与性能采样，相关新观察另在对应性能日志登记。文档引用、范围差异与staged审查后按持续授权仅交付三文档，ignored包/工具不提交。
