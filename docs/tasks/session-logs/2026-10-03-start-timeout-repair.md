# 2026-10-03 开赛超时修复实施记录

用户已要求按[线上检查计划](../../reports/2026-10-03-online-audit-and-roadmap.md)开始顺序执行，并明确忽略原02:00截止时间。本轮推进第1项开赛超时；第2项只准备现有备份能力和执行入口。

## 当前结果

本地实现与回归已完成。用户明确授权后，2026-10-03 02:32（北京时间）仅部署 `startTournament`，远端Timeout已为10秒，Active/Available及缺参运行烟测通过。未commit、push、上传客户端、正式发布或写入真实业务数据。客户端恢复修复仍仅在本地；线上实际开赛成功率需后续观察，不能把部署成功当成故障率目标已达成。

工作区为 `D:\projects\badminton-miniapp\main`，`master`，HEAD `b571c68754e964e1a73800645f68a49d99f40f41`；原有文档、配置、迁移脚本及未跟踪产物保留。三个子代理并行负责算法/云合同、客户端恢复、部署工具和独立复核，主控整合请求预算与分享收尾。

## 实现范围

1. `cloudbaserc.json` 仅为 `startTournament` 声明10秒平台超时。函数以入口起算9秒请求预算，在排阵前为提交预留2秒，默认排阵分配4500ms；事务重试共用截止时间，写入前不足1秒则返回 `START_TIMEOUT`。这是阶段预算检查，不会强制取消进行中的数据库调用或同步算法，不能承诺所有请求严格在9秒内结束。
2. 保留既有排阵公平性目标、搜索规则和完整赛程回退算法。线上11人/22场/2片场地参数的直接回归证明：模拟搜索消耗2300ms后，4500ms预算仍可得到与原算法相同的完整轮次、球员统计和公平性目标。squad模式传入既有hardDeadline参数；fixed pair规则未改。
3. 事务重放时清空待分享对象，避免使用已丢弃回调中的分享信息。已成功的同一 `clientRequestId` 仍优先回放，即使读取已耗尽预算。确定发生于写入前的排阵/预算超时直接返回结构化结果，不再追加可能卡住的防重日志查询。
4. 分享OpenAPI仍最多等待1800ms，并受剩余请求预算约束；开赛请求的可选诊断写入最多等500ms且不超剩余预算。过期不启动新的分享或诊断。同步修改共享模板并生成23份 `lib/share-activity.js`；没有直接编辑生成文件。
5. 日志区分 `transaction_callback_done`、`committed`、`returned`；预算/排阵超时记录 `failed` 和 `START_TIMEOUT`。业务超时返回结构化结果后可能表现为平台调用成功，观察时必须独立计数业务超时，不能只看平台200。
6. 客户端开赛恢复补充识别平台 `timed out` 文本，查询确认状态为running且存在实际比赛才进入赛程；已有重复请求防护和页面离开保护保留。本轮没有修改页面布局。
7. 部署脚本校验远端声明的Timeout，3秒或缺失值不得被当成10秒验收；配置单改按函数定位，`--files-from`涉及配置时需给明确 `--config-base`。Windows CRLF清单问题由真实干跑暴露后补回归修复。

## 验证与独立复核

- 新回归先验证失败，再修复：预算分配、事务重试、慢读取不写入、写入前余量、结构化超时、分享/诊断卡住、平台超时恢复、配置漏选和远端旧Timeout误验收。
- 主控聚焦：`node --test tests/startTournament.index.test.js tests/share-activity.deadline.test.js tests/startTournament.scheduler-deadline.test.js`，19项通过。带防重编号的超时用例及超时后的成功回放均覆盖。
- 客户端直接相关4文件42项通过；部署相关2文件11项通过，包含Windows CRLF配置清单。主控对实际PowerShell输出清单的干跑确认仅选中 `startTournament`，没有执行部署。
- 最终 `npm test`：1502项，1496通过、6跳过、0失败；6项仍为Windows下旧WSL预览测试。`npm run check`通过；最终 `npm run lint` 0错误42警告；`git diff --check`通过。日志保存在 `tmp/audit-2026-10-03/start-repair-{full-test,check,lint,after}.log`。
- 云合同冷读发现的超时后追加查询问题已关闭；部署独立复核没有其他阻断。日志中的“事务回调完成”不再被当成提交成功。

## 已授权部署与回执

部署前只读回退准备已完成：从远端实际下载完整 `startTournament` 代码包并保存配置，6388文件、37,877,167字节；清单在 `tmp/audit-2026-10-03/startTournament-rollback/manifest.json`。下载前后远端修改时间及CodeSize不变。主控核对20个非依赖文件，差异仅为本轮修改的 `index.js` 和 `lib/share-activity.js`；排阵源码、其他共享库、配置和依赖声明均一致。原始ZIP未单独保留，保留完整解压目录及逐文件SHA-256。详见[备份预检及回退回执](2026-10-03-backup-execution-preflight.md)。

用户在本轮明确回复“授权”，对应上一轮“仅部署startTournament修复，并将线上超时从3秒调整为10秒”的请求。已执行且exit=0：

```powershell
npm run deploy:cloud -- --force startTournament
```

仅执行目标函数部署，没有使用共享模板变更的全量部署入口。同步生成23份文件是仓库一致性要求，另外22个函数本轮没有部署。

部署回执保存在 `tmp/audit-2026-10-03/startTournament-deploy/`：`deploy.log`、`detail-after.json`、`code-download.json` 及真实远端重新下载的 `code/`。远端修改时间2026-10-03 02:32:05，Active/Available、InstallDependency=TRUE、Timeout=10；Nodejs16.13、256MB、index.main保持原值。脚本内置缺参调用返回 `TOURNAMENT_ID_REQUIRED`，证明处理入口与依赖可启动，未触发数据库写入；不等于真实用户开赛链路验收。

完整源码与其他配置由独立子代理核验，结果见后验 `verification.json`：20个非依赖源码文件全部与当前本地一致；相对旧包仅 `index.js`、`lib/share-activity.js` 两项预期变化。运行配置仅Timeout由3变10；CodeInfo、CodeSize、ModTime、RequestId为本次部署元数据变化，其余已比较配置一致。

云端 `installDependency` 重装发生间接依赖变化：`@types/node` 22.20.2→26.6.4、`undici-types` 6.21.0→8.9.0、`follow-redirects` 1.16.0→1.16.1。前两项为类型包，最后一项是运行依赖；完整包6388→6413文件，不能声称全包只变了两个文件。主控比对了实际 `follow-redirects/index.js`，变化为数组形式header标准化及正则转义补充，包声明仍支持Node>=4；未发现需立即回退的证据，但本次缺参烟测不验证全部网络/业务路径。依赖固定与可重复部署纳入计划第9项维护，不在本轮再次修改依赖或部署。

正式用户场景验收应在明确授权的测试赛事上进行，不能擅自开赛现有赛事。客户端修复需要单独上传/发布才能影响已发布客户端。

保留线上观察目标：连续7天至少100次调用，硬超时0、平台失败低于1%；另外独立统计 `START_TIMEOUT`、业务失败及重复请求恢复。该目标尚未验证。真实手机慢网、页面切换和开赛全链路仍待有效DevTools/手机会话。

## 后续进度：备份已暂停

在本记录初次写成后，第2项从预检推进到部分备份：数据库4/13集合、8653文档完成两遍核对；存储2735个对象下载及下载时校验完成；云函数39个目标中首批20个完整包已保存。本地恢复未导入数据，全部后续导出与核验已按用户要求暂停。具体缺口、进程清理及安全接续步骤以[暂停记录](2026-10-03-backup-paused.md)为准。