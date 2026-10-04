# 2026-10-03 录分锁与赛事提交事务修复

第5项本地实现已把赛事读取、权限/比分校验、锁读取、赛事比分/排名/版本写入及锁删除放入同一CloudBase事务；尚未部署，真实云事务冲突、双手机录分和生产规则引擎验收未完成。

## 证据与实现

- 基线main/master/b571c687，保留既有脏树。使用[weapp-cloud-contract-audit](D:/Relocated/LIZIXUAN/Codex/skills/weapp-cloud-contract-audit/SKILL.md)，只处理本次锁合同。
- 新确定性回归模拟A读锁后B接管，旧实现仍返回SCORE_SUBMITTED并写比分（先执行得到1失败）；按官方快照隔离语义调整stub后，单纯将锁读取搬入事务也复现1失败。最终把锁删除作为真实写操作纳入事务，冲突重试重新验证B锁，返回LOCK_OCCUPIED且比分未写入、B锁保留。
- 使用真实SDK已提供的db.runTransaction及transaction.collection().doc().update/remove；原来的赛事version单文档谓词改为同一事务的文档写冲突校验，version仍递增。没有runTransaction时不做非原子fallback。
- 同比分幂等回放仍在锁读取之前；缺lockSessionId的旧客户端合同保持。LOCK_EXPIRED/LOCK_OCCUPIED/VERSION_CONFLICT及结果根/data、traceId合同保持。
- callback每次重跑先清除分享局部状态；锁owner/expireAt/session校验后，锁删除与比分提交原子完成。锁删除失败将回滚比分，改变了原先比分可成功而best-effort清锁失败的内部行为，以关闭已证实接管漏洞。只有提交成功后执行已有best-effort分享更新；不在callback内调用外部分享API。
- 真实备份中的wx-server-sdk及@cloudbase/database源码已确认事务API及冲突callback重试存在。本地stub模拟冲突不代替平台实测。
- [官方CloudBase事务原理](https://docs.cloudbase.net/database/transaction)说明快照隔离、修改文档加锁、读取不加相同锁，故本次不能只依赖读集校验。事务仅使用doc，不使用where。

## 验证

- 最终直接handler及比分边界16项通过（handler15、边界1）；早期affected计划审阅后执行28文件125项通过、零失败/跳过，后续callback回放用例另经直接及全量验证。
- affected运行中已有fixture的预期错误/存储stub日志不等于失败，以上计数以node:test终态为准。
- 主控整合全量1529通过/6跳过/0失败，check通过、lint0错误42警告、diff检查通过；首次3处fixture失败及补齐合同见[整合回执](2026-10-03-local-stage-validation.md)。
- [Luna冷审](2026-10-03-score-transaction-cold-review.md)未发现可复现阻塞。审查曾仅按底层@cloudbase返回值质疑stats，主控逐层检查真实wx包装并实际执行无网络`tmp/sdk-transaction-wrapper-contract-20261003.cjs`，证明wx事务update.stats.updated与remove.stats.removed，审查据此撤回；没有为该误判修改业务代码或加入多形状兼容。

## 剩余门禁

13集合安全规则和索引已读入备份；[字段/规则方案和隔离引擎清单](2026-10-03-database-permission-preparation.md)已完成，真实规则引擎尚无隔离环境测试。tournaments任意登录可读/基于doc._openid客户端写的风险不能从存量无_openid推导关闭；候选保留read、客户端write=false尚未应用。已询问非生产envId，部署/测试写入仍需具体授权。

临近expireAt边界只按事务读取时Date.now验证，不声称提交瞬间严格未过期；真实CloudBase冲突调度/回滚、双手机与OpenAPI尚未验证。新submitScore部署、任何规则更改及真实写入仍各需新授权。

## 2026-10-04 当前HEAD隔离候选补齐

从main/master/HEAD `f7131eec9528dcae65e96c7f80393e74ca4e3e24`继续第5项，仅准备本地包，不恢复CloudBase。Luna核第5最小旅程：scoreLock12/createTournament11/login11源与当前HEAD相同；join入口包落后，start旧包混入未跟踪单打候选，submit旧完整包缺后来可选诊断deadline。报告`tmp/score-five-next-20261004-readonly/report.md`。原候选、未跟踪单打源码、配置、QR、备份和partial保全，最新状态仍由[12项正文](../paused-plan-status.md#10-04依序续做第5项当前候选)维护。

Sol构建的首根`tmp/score-five-candidate-current-20261004/`错误地只允许Git mode100644，遇普通文件100755退出1；另根retry1修mode后遇工作CRLF/HEAD LF字节比较退出1。原工具/receipt/stdout/stderr未改或删除，失败阶段均未创建bundle/调用离线入口。只读13源诊断exit0：仅index263个CRLF，工作11859B/SHA5811ce16fa1ffa18dc81c63f49a810af6335af19ac46d8b2e8635065de431456，固定HEAD11596B/SHA1a588e42a04dc65bd0c2f978cb6842b79df7d1ad9dc68ad9de0f6fb846bee5e8；仅CRLF→LF后完全一致，其余12原字节一致。没有修改工作源码或行为。

新`tmp/score-five-candidate-current-20261004-retry2/`已完成：run/prepare/ZIP及两个离线入口子进程均exit0，上海21:14:18.334–21:16:10.967。主控执行前完整审4工具及两次修订diff，tool-before在执行前记录SHA、结束保持。包从固定Git blobs取13源、复用旧已验6368依赖，6381成员/36445079解包字节；完整逐成员CRC/SHA/无额外成员和重复构建字节核验通过，ZIP37595881B/SHA52bbba392d80f38c42f1a76d67c428d25b532a44782065357b658597c4e40632，源树SHAd7c7307c2b90bc02e0fefa0018776e4721f84753a8df1c1d998022f0ed032fc9。manifest明确两套源SHA、literalByteIdentical=false/gitNormalizedByteIdentical=true，不能说工作原字节完全等于包。

本机Windows Node24.18.0与现有确切16.13.0各加载409模块文件，真实wx-server-sdk2.6.3/@cloudbase/node-sdk2.9.1/@cloudbase/database1.4.1及main入口可加载、未调用main、网络尝试0；不是真实CloudBase Linux runtime或业务验收。原包5证据/6381成员、工具、已有Node16和13工作源前后SHA不变。targetEnv=null/isolationOnly=true，无部署/调用/安装升级，无业务源码改动；复用最近全量1707通过/6跳过/0失败，不重复业务测试。submitScore单次独立冷核已确认实际ZIP/13源/工具/旧五证据一致；[权限逐操作清单](2026-10-03-database-permission-preparation.md)的真实规则、身份、事务冲突/回滚、双机与3秒仍未执行。

两辅助新包也已本地完成，根`tmp/score-five-aux-candidates-current-20261004/`，上海21:22:44.696–21:26:18.616，run及8子process均exit0。主控全文读新prepare/extract/run，复用已审zip/offline不变；执行前工具SHA记录，结束保全。join12源/6368依赖=6380成员/36445567解包B，ZIP37596277B/SHA82a55ed2bc14d171ff28ca62a6fc4c20a4c0553dd66e5da5ec7d50357d02ef74；start20 tracked源/6393依赖=6413成员/38025748解包B，ZIP39181466B/SHAa55af8d164a6d58a18db30092e166801ca6310e27d8867b7b7d754359e9a9ade。旧ZIP逐成员CRC/SHA后仅提取声明依赖，新包同核/重复字节/extra0；Node24.18/16.13离线分别405/414真实模块/入口，main未调用、网络0。32工作源原字节等于固定HEAD；start排除旧未跟踪single，原single及旧join17/start26证据前后SHA不变，没有复建其余3辅助或18全组。只读blob诊断曾默认1MB缓冲不足ENOBUFS，明确4MB后核32源exit0，未改应用代码。辅助单次冷核已确认ZIP/中央目录/32源码/工具/旧17及26证据相符、single排除且原文件保全；报告`tmp/score-five-next-20261004-readonly/cold-submitScore.md`只核源码成员，未重复inflate依赖/require或业务测试。主控preflight核16既有dirty/45工作源保全、82链接/current1493字符通过；未创建/调用云、生产部署、客户端上传、付款或真实业务写入。
