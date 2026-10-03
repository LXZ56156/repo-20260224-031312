# 第 7 / 8 / 11 项云函数隔离验收清单

最新本地闭包：除Windows Node16候选核验外，[18实际完整ZIP Linux解包加载](2026-10-03-isolation-linux-zip-load.md)全部通过，Node24.13.1/SDK2.6.3、main/网络0；与云端新建24.11不同，后面的真实EnvId/身份/规则/事务/索引/部署门禁仍适用。本文原“只读检查”是清单建立阶段的范围，后续证据以对应日志为准。

- 检查日期：2026-10-03（Asia/Shanghai）
- 范围：只读检查当前源码、`cloudbaserc.json`、5 个目标函数 package/config、部署脚本和本地 CLI help；本清单不实现代码、不运行测试、不调用 CloudBase API/远程函数、不操作浏览器。
- 仓库：`D:\projects\badminton-miniapp\main`，`master`，HEAD `b571c68754e964e1a73800645f68a49d99f40f41`。工作树已有大量改动；本次没有清理、暂存、提交或修改任何源码/配置。
- 结论：要验证第 7 / 8 / 11 项的真实身份与平台合同，至少应按下表成组部署到**已确认的隔离 EnvId**。项目 `cloudbaserc.json` 目前仍指向生产环境，项目部署脚本不能当作隔离环境选择器。此次没有部署或写云端业务数据。

## 当前注册和依赖事实

| 函数 | 当前本地注册 / package | 直接合同依赖与配置观察 |
| --- | --- | --- |
| `finishTournament` | 已列入 `cloudbaserc.json`；`wx-server-sdk: 2.6.3`；`installDependency: true` | 主办身份取 `getWXContext().OPENID`；事务读取赛事和 `client_request_logs`，另通过非事务 `score_locks` 活跃锁查询后写赛事与请求日志。函数目录的 `config.json` 声明 `updatableMessage.setUpdatableMsg`。 |
| `manageCoManagers` | 已列入；`wx-server-sdk: 2.6.3`；`installDependency: true` | 主办 grant/revoke，写 `tournaments` 与 `client_request_logs`；使用其函数目录内复制的 `lib/permission.js`。 |
| `getMyTournaments` | 已列入；`wx-server-sdk: 2.6.3`；`installDependency: true` | 只读 `tournaments`；从 `getWXContext().OPENID` 固定身份，两路查询、`updatedAt desc / _id asc` 合并分页。页面集成还经过 `core/tournamentRecovery.js` 和 `pages/tournament-list`。 |
| `scoreLock` | 已列入；`wx-server-sdk: 2.6.3`；`installDependency: true` | 事务读赛事/锁；acquire、接管、heartbeat 先增加赛事 `scoreLockRevision` 再写锁，与提前结束共享赛事写冲突。 |
| `submitScore` | 已列入；`wx-server-sdk: 2.6.3`；`installDependency: true` | 事务读赛事/锁，写比分并删除锁；目录 `config.json` 同样声明 updatable message OpenAPI 权限。 |

这五个函数目录各自有自己的 package；本次只读文件清单未发现函数级 `package-lock.json` / `npm-shrinkwrap.json` / yarn / pnpm lock。五个目标在 `cloudbaserc.json` 均未声明 `runtime`、`timeout` 或 `memorySize`；目前仅 `startTournament` 有明确 `timeout: 10`。不能仅凭本地配置断言隔离环境会给这五个函数分配什么实际 Runtime/超时/内存，部署后须查询函数详情。函数目录各自包含生成的 `lib` 副本；Cloud 函数之间不会在部署时自动共享一份模板运行时代码。

本地 `cloudbaserc.json` 的 `envId` 仍是生产环境。其 functions 列表已经包含以上五项；这只证明本地配置登记，不证明它们当前在云端已注册、运行或部署到了某个环境。账号免费兑换资格、主账号与小程序 AppID 绑定以及可用真实微信测试身份仍按[隔离环境调查](2026-10-03-authorized-isolation-plan.md)记录为未验证。

## 必须配套部署的函数组

1. **提前结束与锁合同**：`finishTournament` 和 `scoreLock` 必须同一轮部署。当前收赛查询全赛事活跃锁；成功 acquire / takeover / heartbeat 会在同一事务写相同赛事的 `scoreLockRevision`，仅部署新 `finishTournament` 而保留旧 `scoreLock`，不能验证“空锁查询后新锁 / 续租会令收赛重验”的并发合同。
2. **真实录分旅程**：如要验证锁持有者提交、结束与提交竞争及锁原子消费，还要把当前配套 `submitScore` 一起部署；单独部署 `scoreLock` 只能验证锁接口，不能验证比分和锁的同事务提交/删除。若覆盖“重置后旧 finish 请求失效 / clone 不复制 finishMeta”，还需部署相应当前版本 `resetTournament`、`cloneTournament`；这两项不是收赛锁竞争的必要最小组。
3. **协管权限合同**：完整证明“主办可授予、绑定成员在批准的 7 个入口拥有管理能力”需要同一轮部署 `manageCoManagers` 与其 7 个权限消费者：`addPlayers`、`removePlayer`、`setPlayerSquad`、`managePairTeams`、`updateSettings`、`startTournament`、`setReferee`。这些函数各有复制的 permission helper，仅部署协管管理函数不会更新其他云函数的权限判断。测试“协管仍不能删除 / 重置 / 提前结束 / 克隆”时，还须在隔离环境运行对应当前版本 `deleteTournament`、`resetTournament`、`finishTournament`、`cloneTournament`；否则只能证明这些未更新的远端版本行为，不能称为当前源码合同。
4. **找回列表**：列表服务合同本身只需部署 `getMyTournaments`。若验收“我的比赛”完整客户端路径，还要包含当前小程序源码/页面：`mine` 次级入口、`pages/tournament-list` 和 `core/tournamentRecovery.js`。打开条目进入既有 `share-entry` 后由 `tournamentSync` 直接读取/监听赛事文档；这条后续路径依赖该隔离环境 `tournaments` 数据与数据库读规则，不是 `getMyTournaments` 单函数烟测能够证明的。
5. **真实身份 fixture 准备**：使用小程序登录身份创建/加入测试赛事时，需要隔离环境中有匹配版本的 `createTournament`、`joinTournament`，并在协管/比分流程中使用 `startTournament`。若不用应用流程而由受控测试夹具预置数据，则夹具中的 `creatorId`、权威 `players`、状态、比分、`updatedAt`、`playerIds` 和锁时间必须按真实数据形状构造；本轮没有实施任何预置。

6. **新身份登录入口**：`miniprogram/core/auth.js:17`在没有新鲜缓存时实际调用`login`，新A/B/C完整客户端旅程需配套同版login，不能依赖生产缓存假定已完成隔离身份验证。

目前[18函数范围完整本地候选](2026-10-03-isolation-function-group-candidates.md)已完成：保留submitScore、新增17完整ZIP、源码/依赖/归档及Windows Node16加载已核；不等于已部署或已获得隔离环境。下文“此前只有submitScore”的准备缺口由本批产物补齐，实际平台/身份/规则/事务仍待验证。

## 最小真实身份和样本

- `A`：一个实际登录的小程序 OPENID；作为赛事 `creatorId` 的主办者。不能通过事件参数伪造身份。
- `B`：与 A 不同的实际登录 OPENID；先以绑定玩家身份加入，再由 A 授予协管。该玩家必须存在于权威对象型 `players` 名单中，不能只出现在 `playerIds`。B 可兼作合法录分参赛者。
- `C`：与 A/B 不同的实际登录用户；不在该赛事绑定名单中，用于验证无关用户在管理、录分和找回中的拒绝/空结果。
- `G`：一个 roster guest 项（如同名但未绑定的 guest），不是独立认证身份；可把其显示名设置为 C 的同名，以验证姓名不授予绑定权限。
- `U`：未登录调用上下文，用于验证找回入口的 `PERMISSION_DENIED`。U 不需要另一个微信账号。

因此跨设备身份测试最少要有 A / B / C 三个真实登录身份；guest 和未登录是两种单独数据/会话状态，不能用 event.openid 或本地 stub 代替。实际能否准备这些账号、它们是否使用本项目 AppID，以及真实 OpenID 均未核实，记录时只用角色代号。

## 隔离验收步骤与预期

### 协管授权

1. A 创建隔离赛事；B 实际加入并绑定。再准备同名 guest G 和无关登录者 C。
2. A grant B，重放同一 `clientRequestId`，期望首次更新、重放 deduped 且不再次增加版本/审计；同 request ID 换 action/target 应拒绝。A revoke B 后重放旧 grant 不得恢复 B。
3. 检查 B 在允许列表中的 7 个 endpoint 分别可完成一项低影响合法操作；逐个确认 C 拒绝。G 不能被 grant；残留 `playerIds`、姓名相同和 event 身份字段不得替代权威 roster / WXContext。
4. 检查 B 在 `deleteTournament`、`resetTournament`、`finishTournament`、`cloneTournament` 的主办专属边界仍被拒绝；A revoke 后再测 B 的管理动作。以 `removePlayer` 与 grant/revoke、`startTournament` 与 revoke 的交错操作检查权限撤销/状态竞争；观察版本与名单最终态，不仅看客户端 Toast。

上述完整角色合同需要“必须配套部署”第 3 项的 8 个管理函数；负向边界函数也必须是本地对应版本。`finishTournament` 同时属于第 1 项组。

### 录分锁与提前结束

1. 由 A 创建并由 B 加入、开赛；fixture 至少有一场有效已完成比分及一场待打场。另准备已完成场的更正锁样本。
2. B acquire 后，A finish 应因任一未过期赛事锁返回 `LOCK_OCCUPIED`，不得改赛事状态、比分、排名或请求日志。覆盖 active lock 位于 pending 与 finished match 两类位置。
3. 无锁时 A finish：只允许 running 且至少一场有效已完成比分；保留已完成比分，取消其余场。相同成功 request 返回 deduped；重置/重开之后旧 request 不能结束新一轮。
4. 两个实际会话竞争：在 finish 的空锁查询前/后安排 B acquire 或 heartbeat、force takeover；覆盖 heartbeat 跨 expireAt 边界，以及 submitScore 先提交 / finish 先提交两种完成顺序。记录真实业务状态与 lock 文档前后值，确认无“比分已写但锁未删”或“锁已消费但比分未写”。并发时序若平台不给事务 callback 次数/重放日志，不要宣称已直接观测 callback replay；仅报告观察到的最终线性化结果。
5. 这些真实事务样本必须至少部署当前 `finishTournament + scoreLock + submitScore`；该三函数组必须使用同一套更新代码。配套本地实现与 MVCC fixture 的现有验证见[提前收赛实现回执](2026-10-03-manual-finish-implementation.md)和[录分事务修复](2026-10-03-score-transaction-repair.md)，不等于 CloudBase 实际事务验证。

### 找回、分页与权限

1. A 主办流、B 非主办参与流，另建一个 A/B 重叠赛事；用 25 个主办候选、25 个参与候选及 10 个交集（合计 40 条）检验 20 条分页、相同时间的 `_id` tie-break、跨页不重不漏。C 应只得到自己的零结果，U 应得到未登录拒绝。
2. B 解绑/移除后续页不能从旧游标重新看见该赛事；`players` 存在（包括空数组）时，以权威 roster 二次过滤，陈旧 `playerIds` 不得授予找回权限。没有 `players` 的旧文档才走既有 `playerIds` 兼容路径；记录这一旧数据合同的范围。
3. G 与 C 同名但未绑定时，G 项不得让其找回；游标篡改及从 B 交给 C 应拒绝。HMAC key 是调用者自身 OPENID：测试只证明服务端归属始终受 `getWXContext().OPENID` 过滤、跨身份游标拒绝和普通篡改拒绝；**不声称**它阻止知道自己 OPENID 的调用者重签自己的游标，这也不使其可查询他人赛事。
4. 准备超过每路 100 条候选且大量为陈旧 roster index 的样本，确认超扫描上限时返回 `completePage:false`、有继续游标而非完整空列表，下一次仍可继续发现实际权威 roster 中的有效记录。独立校验两路 query 的组合索引/数组别名查询；当前没有隔离环境上的索引回执。
5. `getMyTournaments` 是数据库只读接口，但要验证真实查询计划、授权、索引和延时必须在隔离 CloudBase 中读取受控 fixtures。现有 11 项本地页面/函数验证和冷审只证明 SDK stub / 本地行为；详见[找回实现回执](2026-10-03-tournament-recovery-implementation.md)及[找回冷审](2026-10-03-recovery-cloud-cold-review.md)。

## CLI 目标、依赖安装与失败回退

- 本机 `tcb` 为 CloudBase CLI 3.7.3。只读 `tcb --help` 显示全局 `-e, --env-id <envId>`；`tcb fn deploy --help` 显示部署命令会读取 `cloudbaserc.json`，应用其 `envId` 和 functions 配置，并可用 `--install-dependency <boolean>` 覆盖安装选项、`--runtime` 仅在首次部署生效；该子命令 help 没有列出 `--env-id`。本轮随后检查了 CLI 实际实现，环境目标优先级和结论见下节。官方文档入口：[CloudBase CLI 部署云函数](https://docs.cloudbase.net/cli-v1/functions/deploy)。未调用任何云端命令。
- 仓库 `scripts/deploy-cloudfunctions.sh` 调用的是 `tcb fn deploy <name>`，不会传 `-e`；项目 `deploy:cloud` 脚本里的 `CLOUDBASE_ENV_ID` 只被打印，没有被传给 CloudBase CLI，也没有重写 `cloudbaserc.json`。所以 `npm run deploy:cloud -- <name>` 按当前配置仍可能打到生产；`deploy:cloud:all` 明确部署所有登记函数。当前配置目标未改，不执行这些命令。
- 后续若开始隔离部署，命令形状应明确提供 CloudBase 全局环境参数（例如 `tcb -e <已确认的隔离EnvId> fn deploy <function>`），逐个函数部署后核对该目标环境的函数详情、版本、Runtime、Timeout、Memory 与依赖安装状态；先通过只读环境标识确认目标。静态实现已确认全局 `-e` 优先于本项目 `cloudbaserc.json` 的生产 `envId`，故该显式命令不会被生产配置覆盖；本轮未运行该命令或验证远端状态。
- 五个目标 functions 配置 `installDependency:true`、package 只声明 `wx-server-sdk 2.6.3`。CLI默认云端安装且无函数lock，不代表传递解析已锁定；`--install-dependency false`须有对应完整node_modules候选。当前已[固化18函数范围](2026-10-03-isolation-function-group-candidates.md)：保留submitScore的6381项/13源文件候选，另17完整ZIP包含当前源码与各自声明依赖；逐源/成员SHA及CRC/重复字节和Windows Node16加载已通过。不能据本地包宣称云上传接受、运行成功或所有依赖树相同；环境/Runtime/云验收仍待确认。
- `deploy-changed-cloudfunctions.sh` 要求部署相关 worktree 干净并基于提交快照；当前树已有未提交云函数和配置改动，不能把 HEAD/该脚本的默认快照称为本轮源码。`deploy-cloudfunctions.sh` 没有等价脏树保护；更不应因方便而运行到默认生产 EnvId。
- 失败处理边界：只允许隔离EnvId；成组部署一项失败即停止该组验收，核隔离端版本并恢复/重传同版候选，不用混合版本得出权限或竞争结论。当前必要函数组本地候选已固化，但没有已确认隔离端的远端前镜像，不宣称精确远端回退。既有备份/候选保留；测试失败保留脱敏前后状态并停止，不用生产赛事、生产锁或生产备份作恢复样本。

## 仍未验证

- 免费体验环境兑换码/领取资格、腾讯云主账号与小程序 AppID 关联、A/B/C 实际可登录、环境是否能导入/转换；入口依据是[免费隔离环境调查](2026-10-03-authorized-isolation-plan.md)，绑定状态仍是“未验证”。
- 真实 CloudBase 安全规则、函数 WXContext 传入、Node Runtime（预期 Nodejs16.13 但本任务未读远端函数详情）、函数实际超时/内存、客户端 SDK 版本、云端依赖安装和平台上传是否接受当前包。
- `finishTournament` 的 CloudBase 事务冲突/回滚、回调回放、非事务活跃锁查询一致性/索引/耗时，以及与锁 acquire/heartbeat/submitScore 的竞争。
- `manageCoManagers` 与七权限入口在真实 OPENID 下的最小权限、事务回放和撤销/开赛/名单编辑竞争；未请求账号或操作登录。
- `getMyTournaments` 两路数组条件和排序/复合索引、Date 类型、最大查询成本、3 秒限制内的表现、100 条扫描上限续页与真实账号过滤；现有本地 stub 不是 CloudBase 引擎。
- 没有创建环境、部署、付款、调用云函数、写入或清理云数据；未访问微信公众平台页面。本清单只把后续隔离验收切成可执行的最小组合，所有真实云端步骤仍待隔离环境及身份可用后由主控按原授权边界执行。

## 本机 CLI 3.7.3 环境目标实现闭包（静态读取）

检查对象是本机全局包 `@cloudbase/cli` 3.7.3：`C:\Users\LIZIXUAN\AppData\Roaming\npm\node_modules\@cloudbase\cli\dist\standalone\cli.js`。入口 `C:\Users\LIZIXUAN\AppData\Roaming\npm\tcb.ps1` 将参数原样传给该包的 `bin/tcb`，后者 require `dist/standalone/cli.js`。只读了已安装源码和 package 版本；没有打印、读取或验证登录凭据。

- 全局 `-e, --env-id` 在 `cli.js:218` 注册。命令上下文在 `cli.js:8007-8012` 读取配置和本机默认环境，并按 `parentOptions.envId || cmdOptions.envId || config.envId || globalEnvId || ''` 选目标。因此显式全局 `-e` **高于**当前 `cloudbaserc.json` 的生产 `envId`；仅设置 `tcb env use <id>` 不会覆盖项目里已经存在的 `cloudbaserc.envId`。
- 配置由 `cli.js:8009` 的 `getCloudBaseConfig(...)` 读取；其实现位于 `cli.js:56220-56237`，经 ConfigParser 解析本地配置。默认环境 `globalEnvId` 来自 `GlobalEnvStore`（`cli.js:59155-59176` 本地存储）；`tcb env use` 写该 store 在 `cli.js:19395`。这条默认值只在命令行和配置文件都没有 envId 时作为最后回退。
- `fn deploy` 在 `cli.js:21225` 起的 `FunctionDeploy.execute` 从已生成的 `ctx.envId` 取值（`21299`），经 `resolveEnvId`（调用处 `21326`、实现 `21379-21394`）仅在 envId 缺失/未解析时才提示选择环境；然后把已解析的 `envId` 放进 `deployContext`（`21330` 起）。`ConfigBasedDeployStrategy` 从 `context.envId` 取目标（`cli.js:21508-21528`）；批量 `createFunction` / `updateFunctionCode` 收到该值（`21801`、`21860`），单函数 `createFunction` 也收到该值（`21914` 起）。策略不会再以 `cloudbaserc.envId` 覆盖已传入的 CLI 目标。
- `fn detail` 在 `cli.js:22956-22971` 使用 `ctx.envId` 构造 FunctionService；只有缺少 envId 时才选择环境（`22966` 起）。`fn invoke` 在 `cli.js:23214-23241` 同样使用该 envId 构造 FunctionService、查询函数详情，后续 Event 调用于 `23369` 使用该 service。它们与 deploy 共用上面同一个命令上下文优先级。
- 环境变量边界：命令上下文优先级代码（`8007-8012`）没有读取通用 `process.env.CLOUDBASE_ENV_ID`。CLI 包中同名变量出现在 `resolveApiKeyFromEnv`（`214311-214314`），仅与 `CLOUDBASE_API_KEY` 配套解析 API Key 认证，不改变本项目的函数目标选择。`CLOUDBASE_ENV_ID` 在项目 `scripts/deploy-cloud.sh` 中只用于输出提示，没有转成 `tcb -e` 参数；因此项目脚本运行时仍会由配置里的生产 envId 胜出。
- 已由源码闭包确认：`tcb -e <隔离ID> fn deploy <function>` 会选显式隔离 ID，不会被生产 `cloudbaserc.envId` 覆盖；无 `-e` 时则 production config 高于 `tcb env use` 默认值。该结论是本机静态实现事实，不代表本轮真的部署/详情查询/函数调用，也不能替代未来回执中核对远端 Namespace/EnvId。
