# 2026-10-03 总计划执行准备审查

结论：第1项可以立刻继续只读线上采样；第2项由主控及备份子任务接续。第3项可在本地补最小事件合同、失败统计和CLS查询工具，第4/5项有明确可实施缺陷；第6–12项需分别完成诊断/方案或隔离验证，不能把研究报告当产品功能已上线。严格按总计划编号登记未完成门禁，等待时间或外部授权不构成跳过。

本子任务只读源码、已有证据及配置，只新增本日志。未调用生产函数、部署、付款、写生产业务数据、打开浏览器、运行测试或执行新CLS采样；下文均为核实的入口和建议验收，**不是执行通过回执**。实际workdir为 `D:\projects\badminton-miniapp\main`，branch `master`，HEAD `b571c68754e964e1a73800645f68a49d99f40f41`；已核对现有脏树，保留startTournament修复、23份共享库同步和全部已有文档/脚本修改。

读取依据：[AGENTS](../../../AGENTS.md)、[current](../current.md)、[总计划](../../reports/2026-10-03-online-audit-and-roadmap.md)、[后端报告](../../reports/2026-10-03-backend-audit.md)、[前端报告](../../reports/2026-10-03-frontend-audit.md)、[start修复](2026-10-03-start-timeout-repair.md)。部署、客户端上传/发布、付款和真实业务写入均需该项新授权；已有单函数部署授权已消费。

## 1. 开赛修复后线上观察

- 现有可用只读入口是 `tmp/online-audit-2026-10-03/backend/query.cjs` 的 `read()`，通过安装的 `@cloudbase/cli/bin/tcb` 执行 `logs search --timeRange ... --limit ... --query ... --json`。`fn log` 已下线，不继续使用。`followup.cjs` 固定截止01:42；`latency.cjs`、`start-context.cjs` 也写死历史窗口与输出名，**不可直接重跑覆盖旧证据**。复制查询方式到新输出目录，声明部署后起点 `2026-10-03 02:32:05`（北京时间）及采样终点。
- 平台口径沿用 `src='system' AND status_code!=202 AND retry_num=0`，按 `request_id` 去重；按函数/平台状态分组 `count(distinct request_id)`。诊断缺参烟测单列，不能计入用户业务开赛成功率。
- 应另查 `src:app` 的 `failed` / `START_TIMEOUT`、`transaction_callback_done`、`committed`、`returned` 日志，依request_id关联；结构化业务失败可能属于平台200。只统计系统200会掩盖业务超时。必要时按失败request_id批量拉上下文，保留原始CLI返回与截断/分页状态。
- `latency.cjs` 的百分位针对日志行，沿用时必须标为日志行加权；要报告请求级P95应先每request_id取唯一终态/耗时，再聚合，不能直接重命名已有指标。
- 阶段验收：新采样可解析且窗口/去重清楚；目标仍是连续7天、至少100调用、硬超时0且平台失败低于1%，业务失败独立统计。10月3日当日无法宣称7日目标已达成。客户端恢复仍仅本地，发布、真实测试赛事开赛各需独立授权。

## 3. 留痕与故障监控

当前 `miniprogram/core/growthTracker.js` 只有console与 `wx.reportEvent`；payload allowlist是t/s/m/src/a/r/ts，赛事ID做32位短哈希。已有19种调用，多为view/click/success，缺attempt/result、耗时、版本、事件ID、匿名会话和完整失败。`miniprogram/core/cloud.js:523` 已生成 `__traceId`，调用异常会附同一traceId，可复用关联；接入时须避免事件采集调用自身递归。打水可在 `pages/water/index.js` 的createLedger、runMutation、join及onLoad入口接入最少动作，不另建重复业务日志。

远端 `reportOpsActivityEvents` 不属于当前cloudbaserc受管23函数，当前仓库无其实现目录。已保存入口 `tmp/online-audit-2026-10-03/backend/remote-reportOpsActivityEvents.js`；不能只凭这一入口移植完整服务，logic、集合/索引/TTL等需先从备份完整包核实。

- 入口默认disabled；除 `OPS_ACTIVITY_EVENTS_ENABLED=true` 外还要求至少32字符HMAC secret、keyVersion=v1、allowedAppId及合法WXContext来源。默认globalDailyCap为1，开关单开可能仍不可用。不得在公开日志输出密钥。
- 现有协议返回accepted/deduped/rejected/dropped及rate_limited/paused等，说明客户端应准确处理接受和丢弃，不能以函数ok等同每个事件已入库。服务端匿名化方案应优先于把openid或输入文本写入客户端日志。
- 可本地完成：最小事件清单/字段allowlist；稳定eventId与attempt/result关联；相同业务重试去重而失败也计数；版本/envVersion与traceId；SDK拒绝/disabled不影响业务；离线接收stub和指定测试旅程对账；只读CLS每日简报与异常查询；将新指标规则沉淀到可重复工具。
- 需要先定稿的保留期、访问主体、测试识别和额度是配置/隐私合同；本地可准备具体默认建议及检验，但生产启用、创建/修改集合规则、事件实收写入、客户端上传/发布仍须该项授权。真实客户端→后台接受→查询→漏斗对账尚未完成。
- `scripts/analyze-we-data.js` 默认混读全目录；总报告已确认旧文件混读、缺失留存填零及加权问题。重复报表应显式输入时间窗和manifest，沿用本次成熟队列，61503计算中不能填零。

## 4. 三项直接客户端缺陷

| 项 | 实现位置 | 最小验收 |
| --- | --- | --- |
| 设置草稿/重试 | `pages/settings/index.js:136` applyTournament；`settingsViewModel.js:326`编辑态；`settingsActions.js:252–326`保存/失败重读 | 名单同步保留脏字段但权限/状态仍更新；失败后原payload与clientRequestId固定；主动改内容产生新请求；已有异步fixture不得stub掉真实applyTournament |
| 迟到身份 | `pages/schedule/index.js:375,411,454`；`share-entry/index.js:106,212` | 冷启动空openid→登录迟到→同一Page恢复canEditScore；hide/unload迟到结果不写回；必要时查看match/settings实际入口，不凭相似代码扩大范围 |
| 返回首页 | `pages/schedule/index.wxml:182` goHome缺失 | Page调用既有nav.goHome；错误态事件能运行，不重做布局 |

以上已在总计划明确授权实现，属于既有动作恢复，可直接本地修复/回归。真实手机慢网及当前源码DevTools验收仍待有效会话；前台预热不从本地实现授权推导，上传/发布仍独立请求。

## 5. 录分并发与数据库规则

`cloudfunctions/submitScore/index.js:118–165`先独立读score_locks，之后按tournaments.version写赛事；版本保护不能防止锁读取后被接管。`scoreLock/index.js:62`已使用跨文档事务，但submit不在同一事务。优先做确定性隔离复现：submit读取A锁→B接管→A尝试写；应拒绝A且比分不变。继而把锁有效性、赛事权限/状态/比分版本与写入放入同一事务；提交成功后的幂等回放仍应优先，不要求已释放锁重现。保持旧客户端可缺lockSessionId合同、结构化LOCK_EXPIRED/LOCK_OCCUPIED/VERSION_CONFLICT，以及成功后带session条件清锁。修改时加载weapp-cloud-contract-audit。

已有测试入口：`tests/scoreLock.index.test.js`、`scoreLock.logic.test.js`、`smoke.score-lock-submit.test.js`、`submitScore.score-bounds.test.js`、`role-permission-matrix-score-entry.test.js`。其中smoke是纯logic链，不证明真实数据库锁事务，需要handler+事务冲突stub直接测试。

规则证据保存在 `tmp/online-audit-2026-10-03/backend/rules-*.json`，tournaments全登录可读、`doc._openid==auth.openid`可写；当前存量无_openid不证明新增无写权限。本地可形成公开/内部字段和只云写入合同、隔离规则测试计划；真实安全规则引擎测试需明确隔离环境，不能用JS谓词模拟当云端规则验收。修改生产规则是生产配置动作，需具体差异与证据后授权；分享可读语义不能自行收紧破坏。

## 6–12. 后续事项的本地交付和门禁

| 序号 | 可继续的具体本地交付 | 必须保留的未完成项/决策 |
| --- | --- | --- |
| 6 首笔记水 | 第3事件补进入/创建/成员/首笔结果；`water/index.js:703,1518,1849,1963,2120,2264`覆盖入口；现有fixture走查空名单、同名绑定、权限、首笔有效条件，7日首笔率显式排除测试与未成熟账本 | 真实场景原因未验证；没有阻塞证据先不改页面。新增可见流程/文案超出批准范围须定方案；真实行为写入及UI新图仍待授权/会话 |
| 7 提前收赛 | 写方案及offline规则样例：保留已录比分、剩余canceled、排名只含已完成、操作者/原因/版本/幂等；核对现有自动结束 | 当前只有squad target_wins自动取消。`submitScore/logic.js:71`会复活全部无分canceled；人工取消必须区分规则取消，防止更正比分复活剩余比赛。新手动结束CTA、可否撤回、零已录是否允许均需明确方案/用户决定；独立打水无结束合同不变 |
| 8 协管/裁判 | 权限矩阵与具体反馈复现入口；`scripts/permission-common.template.js:4,11`creator管理、creator/participant录分；`setReferee`目前分工不限制录分 | 不能把指定裁判宣传为独占，也不能偷偷新增管理员。确需协管时让用户选择改配置/名单/开赛/录分最小权限与审计，再实现；源码研究和现行说明可先完成 |
| 9 运行时/依赖 | 将39函数完整备份包的实际package-lock/运行依赖清单与23受管映射；根工具链audit分别登记；隔离Node/SDK合同验证；明确回退包 | 不直接audit fix --force；部署实际重装已使startTournament间接依赖变化，不能称仅两源码变。Node16/可选运行时状态需官方/当前环境再核验；生产runtime/SDK更改须独立部署授权，历史16函数只登记不删除 |
| 10 性能 | `home/index.js:374,416`整文档读取；`schedule/index.js`完整rounds viewmodel；`core/tournamentSync.js`降级读取；固定大赛事fixture比较setData字节/构建时长；CLS请求级P95工具 | 离线JS基准不等同低端机首屏；真实低端Android+iPhone、启动/渲染P95未测。指标证明最贵路径后才选最小实现，不能先拆包/换同步架构 |
| 11 找回/跨设备 | 云找回列表合同与creator/实际参赛查询样例；`getMyPerformanceStats/index.js:63`仅fallback/analysis，finished参与赛事查询有上限；`core/performanceStats.js`为本机完成快照口径 | 不接云统计覆盖“我的战绩”本机合同。先定义本人是creator/已绑定participant，导入姓名不能匹配身份；需明确找回入口/排序/范围和隐私、UI方案；全个人记录映射是另一个后续范围 |
| 12 单打等新模式 | 需求/规则清单、奇偶人数/轮空/总场次/裁判/排名/分享离线样例；现有 `core/mode.js`三模式及startTournament/scheduleModes.js作为边界 | 一条反馈不构成需求验证通过；用户需确认人数/赛制/排序/结束条件后才加模式。不能复用fixed_pair_rr并把双人队伍替换单人而忽略页面/权限/分享合同 |

## 推荐推进与状态标记

第1先生成一份部署后只读样本和固定查询，7日指标保留“观察中”；第2先解释100差额再安全续备份及隔离恢复；其后按第3→4→5实现与聚焦回归，再依次提交第6诊断、第7/8具体方案、第9依赖隔离证据、第10性能基线、第11找回合同、第12规则需求清单。可独立证据准备并行，验收不能越过未满足门禁。主控维护current及各阶段正式回执，本日志不宣称上述任务完成。
