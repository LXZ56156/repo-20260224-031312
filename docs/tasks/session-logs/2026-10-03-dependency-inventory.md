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
