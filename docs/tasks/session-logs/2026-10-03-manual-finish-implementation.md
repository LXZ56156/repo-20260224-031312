# 第7项：提前结束赛事，本地实现回执

用户“全部允许”已批准[推荐范围](../../specs/tournament-early-finish-and-coadmin-proposal.md)。实际 checkout 为 `D:\projects\badminton-miniapp\main`，`master`，基线 HEAD `b571c68754e964e1a73800645f68a49d99f40f41`；保留既有脏树和 submitScore 事务/分享修复。主控完成只读窗口后发出 GO 才开始写入。

## 已实现的合同

- 新增 `finishTournament`，SDK 保持 2.6.3；身份仅取 `getWXContext().OPENID`，仅主办、running、至少一场 status=finished 且有效比分可结束。伪造 event 身份不授予权限。
- 已完成比分、录分人及时间原样保留；其余场次标 `canceled`、`cancelReason=manual_finish`，删除其残留比分字段。排名复用 rankingCore，仅统计有效完成场；取消不是零分或负场。
- 一次事务写 rounds/rankings/finished/`finishMeta`、version+1 和既有 `client_request_logs` 幂等审计。finishMeta 记录 manual、operatorId、finishedAt、clientRequestId、完成/取消场数及结束时 version。
- 相同成功请求返回 `TOURNAMENT_FINISH_DEDUPED`，不重复增加 version/审计；不同请求不能再次结束。主办重置后旧成功请求返回 `FINISH_REQUEST_EXPIRED`，不会结束重新开赛的赛事。
- 活跃录分锁默认拒绝，包含已完成场的更正锁；不提供强制结束或撤回动作。错误保持 ok/code/message/state/traceId/data 合同及 root/data 兼容。
- 已完成比分仍可按原主办/真实参赛者权限更正；manual finishMeta 强制保持 finished，manual_finish 取消不会被 squad target_wins 更正复活。未人工结束的规则取消保持既有复活行为。
- reset 显式删除 finishMeta；clone 原有白名单不会复制 finishMeta 或比分。独立打水未改动。

## 锁查询与并发

最初逐场读锁已替换，最终算法每次事务 callback：

1. transaction 读取赛事和请求日志，校验权限/状态/已完成场。
2. 使用 **db，非 transaction query**，单次 `score_locks.where({tournamentId, expireAt: db.command.gt(Date.now())}).limit(1).get()`；expireAt 按既有 number 毫秒合同比较，覆盖全赛事而非仅剩余场。
3. 有活跃锁时拒绝；查询失败或返回非数组时不收赛；无活跃锁时 transaction 写同一赛事及审计。

所有成功 acquire、force takeover、heartbeat 的 `nextLockDoc` 分支，都先在同一事务写赛事 `scoreLockRevision=inc(1)`，再写锁；业务 version 不因锁操作增加。submitScore 原有事务也写赛事并删除其锁。因此在步骤1之后发生的新锁、续租、接管或录分，会与结束事务写同赛事发生冲突，callback 回放时重新查询锁和计算结果。释放不写赛事，只可能造成保守拒绝，不会允许活动锁被漏过。

**finishTournament 与该版 scoreLock 必须作为同一协同候选验收和部署；只部署 finishTournament 而沿用旧 scoreLock 无法保证新锁竞态合同。** 该要求不授予部署权限。submitScore/logic、resetTournament/logic 的匹配版本也属于上线候选。

## 最小客户端入口

赛程现有 hero 动作区新增次级“提前结束比赛”，仅主办 running 且至少一场有效完成时显示。确认说明完成X场、剩余Y场取消、排名只统计已完成场、不可撤回；筛选不会改变确认场数。提交期间阻止双击，超时重试复用请求ID，成功标记其他页面刷新并获取最新赛事；确认期间身份/状态变化重新检查。

人工结束后状态显示“已提前结束”，摘要显示实际完成/取消场数，沿用 finished 最终排名和战绩分享入口。按钮 min-height 104rpx 为320px逻辑宽度的44px触达提供结构保障；实际像素、对比度、大字/窄屏及原生modal尚未验收，结构数值不是实图通过。

## 验证结果

- 测试先行：新增云合同9项因缺少 finishTournament 全部失败；UI行为4项因缺少入口/新文案失败。随后实现；后补660场查询数/空查询后的锁申请两项先行失败，再替换读锁算法。
- 最终聚焦 `finishTournament.contract`、`scoreLock.index`、`submitScore.logic`、`schedule.manual-finish`：**38/38通过**。包含17项新增云合同及4项新增UI行为。
- 扩展命令：`node --test tests/finishTournament.contract.test.js tests/scoreLock*.test.js tests/resetTournament*.test.js tests/cloneTournament*.test.js tests/cloneTournament-squad-preservation.test.js tests/submitScore*.test.js tests/schedule*.test.js tests/smoke.reset-delete-locks.test.js tests/smoke.score-lock-submit.test.js tests/tournament.handler-e2e.test.js`：**167/167通过，0失败/跳过**，19.9秒。schedule* 同时匹配 scheduler 测试；未把它冒充全量 npm test。
- 覆盖：两比分保持/非负场排名、不同mode、伪造身份/draft/零场/活跃锁拒绝、同/异请求并发、事务失败不半提交、query捕获空结果后新锁、force takeover、心跳在过期边界两顺序、录分先完成纳入结果、结束先完成拒绝pending录分、更正不复活manual取消、自动取消仍复活、clone/reset/旧请求失效，以及分享更新提交后await且重放不重复。
- 660场 fixture：1次 `limit(1)` 活跃锁query、0次逐锁doc读取。该计数证明调用结构，不证明云耗时。
- 本任务JS与测试定向 ESLint：0错误/0警告。`git diff --check` 通过；仅已有CRLF转换提示。
- 扩展过程中 reset smoke 预期缺 finishMeta 产生1失败，已更新预期并直接复跑通过。新增 fixed_pair fixture 缺unit ID、分享fixture恰处安全过期边界已修正；不归类为生产问题或既有波动。
- 共享模板未新增业务修改；通过 sync-cloud-common 生成新函数 lib，没有手改 lib。主控后续统一执行全量/check和 cloudbaserc 登记，本回执不预先宣称其结果。

## 未完成与外部边界

DevTools 基线截图因安装器升级且原exe写入失败而终止，本次入口真实DevTools图、原生确认/取消、320/390/430、大字、Android/iPhone与人工验收未完成。未以浏览器/数学检查代替。

真实 SDK/CloudBase 事务冲突与回放、活跃锁查询索引/耗时、Timeout3、权限规则及微信身份、双手机并发仍待隔离环境验证。离线 MVCC fixture 只建模写冲突，不等同平台引擎；SDK源码/官方文档核对若另有回执，也只证明支持能力。未部署云函数、写生产数据、上传客户端、生成preview/QR、付款、commit或push。

## 2026-10-04 依序续做：当前候选与合同核对

从main/master、HEAD `59edc0d5ebf3c9dde09620e41e224d9c7f0988b5`开始，第7前后端已在此前源码交付，不能沿用上方10-03“未commit/push”作当前状态。Luna只读核对主办权限、锁/赛事共享写冲突、录分事务、更正/重置与确认/固定重试，未发现新的可达缺陷；[核对报告](../../../tmp/finish-seven-current-20261004-readonly/assessment.md)保留取证SHA。主控核其规格SHA cbadcb79对应本轮已修改的工作字节，原HEAD规格为ffadc448，不能称取自修改前；规格仅同步第7既有实现事实，没有改源码或扩大产品范围。历史38/167及最近全量1707通过/6跳过/0失败按原时点保留，本轮没有重跑应用测试或GUI。

独立[候选差异核对](../../../tmp/finish-seven-candidate-delta-20261004/assessment.md)发现旧finish包只有index与当前不同，三hunk均为后来已交付的2500ms可选分享截止；其余12源相同。scoreLock旧12源、reset旧13源与canonical HEAD逐byte相同，不因本轮重建；[第5新submit候选](../../../tmp/score-five-candidate-current-20261004-retry2/manifest.json)13源也对应当前Git，保留工作CRLF与Git LF的原两套SHA。新finish从Git tracked blobs取13源，工作原字节也相同；9个共享库沿当前模板，不从历史快照覆盖工作源码。

Sol high在全新[本地候选根](../../../tmp/finish-seven-candidate-current-20261004/summary.json)准备并执行，主控完整审工具后GO；7执行工具/输入在wrapper启动前冻结SHA，旧extract/zip/offline三工具与此前已审版字节一致，执行后未变。实际上海22:09:55–22:11:54，prepare及旧依赖提取、ZIP、Windows24.18/16.13离线require四子进程均数值exit0。旧6381成员逐SHA/CRC后只排他提取6368依赖，未复制旧index；新6381成员/36434770解包B、37585572 ZIP B，SHA `a325209eea293e0d66d9856f43cb6775340940281e9399ff5082b31455d757fc`，全成员SHA/CRC、无extra与重复构建字节核验通过。两runtime各加载409真实模块，SDK2.6.3、main未调用/网络0；两个require的stderr均为空，但不外推为全部依赖警告已修复。

真实exec外层数值0另存[外层回执](../../../tmp/finish-seven-candidate-current-20261004/outer-exec-receipt.json)，不以四子进程通过替代整体退出。旧finish产物、三复用包、工具、已有Node16、工作源和未跟踪单打前后保全；本轮没有安装依赖、升级、下载、创建环境、云调用、部署或客户端上传。targetEnv=null/isolationOnly=true，包只用于隔离准备，不是生产回退，也不证明CloudBase Linux runtime、真实身份/规则/引擎或3秒余量。

Luna[单次窄核](../../../tmp/finish-seven-candidate-delta-20261004/cold-package.md)确认实际ZIP SHA/6381唯一中央目录项及13源码成员对应固定Git blobs/工作字节、7执行文件与freeze/before/manifest/当前哈希一致、外层和四子进程数值0、两个离线回执main未调用/网络0。只实读源码成员并核CRC；完整依赖成员CRC/SHA、重复构建和实际require依据构建执行回执，没有重复inflate依赖或运行程序。主控文档核验93个本地引用/current1488字符、16原dirty及57相关源保全、差异检查通过；追加本段后最终链接和stage仍再核。

验收顺序和范围复用[隔离清单](2026-10-03-new-cloud-isolation-checklist.md)：finish+scoreLock同组，submitScore事务/人工取消保护及reset清finishMeta配套，不能只部署finish。原生确认/取消、窄屏/大字/真机、实际锁query/索引/耗时、事务回放/回滚、双机与3秒均未验；旧390画面与离线fixture不替代。当前原生工具仍无有效新会话，不盲重试；云/手机按用户暂停/后做边界保留。2500ms只约束可选提交后分享/诊断，既不取消已发请求，也不限制关键事务。完整第7未完成，唯一最新状态见[第7进度](../paused-plan-status.md#10-04依序续做第7项提前收赛)。


## 10-05 截图复核接续

本轮实图、合同修复、全部失败、测试回执及当前未验项统一见 [原生截图复核](2026-10-05-native-screenshot-review.md)。本节仅补接续入口，不改写上方历史结果或本项业务/验收合同；唯一逐项状态仍见paused-plan-status正文。
