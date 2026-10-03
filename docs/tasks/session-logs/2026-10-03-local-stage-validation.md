# 2026-10-03 第3–5本地阶段整合验证

当前主仓库main/master/b571c687，既有脏树保留；这些回执仅覆盖本地源码，不证明客户端发布、微信事件实收、真实CloudBase事务或手机体验。

- 第3：最小activityTracker接入和offline CLS工具；[合同/范围限制](../../specs/activity-observability.md)。
- 第4：三缺陷修复与冷审P2（旧payload重试成功丢新草稿）补修；[P2修复](2026-10-03-client-retry-success-repair.md)。
- 第5：score与锁同事务写入、冲突后callback重新校验、分享postcommit；[修复](2026-10-03-score-transaction-repair.md)、[规则准备](2026-10-03-database-permission-preparation.md)。冷审尚在进行。

## 必要门禁

1. 首次最终全量1535项：1526通过、3失败、6跳过；证据`tmp/plan-final-tests-20261003.log`。不称既有波动或通过。失败为post-save-start-focus两个ctx只装settingsActions，缺新增真实Page的hasUnsavedSettingsDraft；tournament.handler-e2e的顺序数据库替身缺doc.update。
2. 只修测试fixture合同：前者装入当前真实Page方法，保留focus/toast/navigation断言；后者提供实际doc.update（复用既有where patch），仍保留赛事创建→配置→开赛→锁→录分→排名→幂等→重置→删除断言。没有给生产代码加降级路径或把断言去掉。
3. 定向28项通过、0失败；`tmp/plan-fixture-repair-20261003.log`。
4. 最终全量1535项：**1529通过、0失败、6跳过**；`tmp/plan-final-tests-20261003-rerun.log`。6跳过为Windows平台不执行的旧WSL预览测试，非真实端到端。
5. `npm run check`通过：V2声明清单、deprecated wx API、共享云lib一致性；`tmp/plan-final-check-20261003.log`。lint **0错误42警告**，未把警告当0；`tmp/plan-final-lint-20261003.log`。fixture改后再次lint相同；git diff --check通过，CRLF转换提示非whitespace error。

## 实际只读CLS报表

主控使用CloudBase CLI3.7.3 logs search，固定北京时间02:32:05–06:42:00、query=function_name:*、sort=asc、limit100；新sample目录拒覆盖。1页19条日志，末页listOver=true，原文件/meta/context链保留`tmp/online-followup-20261003-0644/sample/`。新工具offline读取显式manifest，新report目录拒覆盖，complete=true、issues=[]、requestReconstruction=raw-request-id-deduped。

共可重建3次终态请求：login平台/业务成功1；manageActivityId平台200但业务PERMISSION_DENIED1，平台失败率0不能掩盖业务失败；startTournament缺参诊断候选1单列，与原部署烟测request_id相同。没有新增真实开赛样本。各请求P95及版本/trace缺失按实际日志登记，极少样本不作性能结论；不推断这两次额外调用属于哪个真实用户或测试来源。

report complete只证明输入/分页可核对，连续7天100调用、真实留痕闭环、监控订阅均未完成。未创建自动化、未付款、未部署、未提交、未上传/发布、未写真实业务数据。
# 第3补齐/统计/性能整合门禁（07:20）

在全部本次相关源/测试最后修改时间早于测试日志创建时间之后执行：`npm test`总1558项，1552通过、6跳过、0失败，回执`tmp/plan-final-tests-20261003-latest.log`。`npm run check`通过，lint0错误35警告（旧分析脚本替换后减少7警告），diff检查通过。回执分别为`tmp/plan-final-check-20261003-latest.log`、`tmp/plan-final-lint-20261003-latest.log`。保留上一轮1529/6及先前失败历史，不覆盖旧日志。

该轮包含匿名重试/分享进入/完赛状态观察、明确窗口统计工具和赛程单call体量修复。之后新增mixin集中ranking/analytics两个分享hook、lobby直接hook，移除ranking多余wrapper避免doublecount，5项新的实际Page测试验证不重复采集及失败不阻断。主控因此另跑新门禁：1563项中1557通过、6跳过、0失败；check通过、lint0错误35警告、diff检查通过。新回执为`tmp/plan-final-{tests,check,lint}-20261003-share-coverage.log`，不覆盖上一轮。所有结果为本地，真实DevTools、手机、后台实收/平台事务未验证。

## 冷审关闭与最终门禁（07:32–07:37）

[Luna冷审](2026-10-03-final-local-cold-review.md)复现create/createLedger同原始ID的匿名关联P2，6.1实现代理将内部scope区分函数和原始已登记动作，输出字段不变；直接回归先1失败、后11/11通过，冷审关闭，没有其他可复现P0/P1。

修复后全量1564项曾出现1557通过、1失败、6跳过，原始回执`tmp/plan-final-tests-20261003-intent-scope.log`保留。失败是`tests/weapp-ui-screenshot-tool.test.js`“ui:doctor refreshes only a launch-signed exact hot session”：该测试创建session时取真实共享Git快照，07:31:59开始测试后，代理07:32:20更新spec/log，runDoctor按源码变化合同拒绝签发，result.ok=false。主控没有称既有波动或删除断言，更未放宽生产签名护栏。

该“源码不变”fixture改为隔离加载真实模块并固定合成Git快照；相邻源码变化/challenge消失拒签用例原样保留，另断言sourceStableDuringDoctor=true。第一次fixture修复误从模块旧导出函数取hash，与注入快照不一致，50项49通过/1失败（`tmp/doctor-fixture-repair-20261003.log`），修正为同一个明确快照的hash后50/50通过（`tmp/doctor-fixture-repair-20261003-rerun.log`）。生产截图工具未修改，也没有启动/激活DevTools。

最终源/测试稳定后全量**1564项：1558通过、6跳过、0失败**（`tmp/plan-final-tests-20261003-doctor-fixture.log`）；lint0错误35警告（`tmp/plan-final-lint-20261003-doctor-fixture.log`）。check沿用本次分享共享改动后的通过回执，之后仅tracker内部scope和测试fixture变化，未引入其所查API、声明或云lib差异；diff检查通过。后续若只更新记录不重复跑这些测试。
