# 第8项：最小协管矩阵，本地实现回执

按用户“全部允许”批准的[推荐矩阵](../../specs/tournament-early-finish-and-coadmin-proposal.md)实施。实际工作区为main/master，保留全部原有改动；没有把 isAdmin 扩为协管。

## 权限与字段

- 新增 `coManagers`（openid数组）和显式 `canManageTournament`。`isAdmin` 仍严格表示 creatorId；canEditScore 沿用主办/既有参赛者权限，裁判标签不单独授予录分权。
- 管理能力必须同时满足 coManagers 与权威 players 身份绑定的交集，不能依赖残留 playerIds、event名单或同名导入。当前普通 join 成员没有type字段，故绑定判定接受权威roster中的对象型、非guest、id非guest_成员；拒绝纯字符串、type=guest和guest_ ID。guest认领转换后才有可授权身份。
- 新增 `manageCoManagers`，仅 getWXContext 主办可 grant/revoke，允许 draft/running；grant目标必须为真实绑定成员，不能授予主办自己、缺失成员或guest。finished不新改角色。
- 角色更改在赛事事务内写 coManagers、updatedAt、version+1；复用 client_request_logs 保留 operator/action/target/request/time 的受限操作审计。同请求回放不重做授予/撤销，同ID换目标或动作拒绝；旧grant在后续revoke后重放也不会恢复权限。无变化的操作只记录一次幂等审计，不增加赛事version。
- 获批7入口使用明确管理能力：addPlayers、removePlayer、setPlayerSquad、managePairTeams、updateSettings、startTournament、setReferee。其余删除、重置、提前结束、复制仍主办专属。
- removePlayer同事务移除被删成员的协管ID；任意权威roster缺失也会立刻使残留协管ID无效。直接读取+version条件写入的分队/配对保留原并发合同，角色撤销增加version后旧写不能提交。
- 授予/撤销、名单移除、开赛都写同赛事；发生写冲突时管理事务回放重新校验身份、名单与状态。开赛先提交后主办仍可撤销/授权，协管的新草稿配置仍被status拒绝。

## 最小客户端

大厅现有名单后增加协管管理卡。主办在draft/running可看到每名成员的“已绑定身份/尚未绑定身份/主办者”，真实绑定成员显示“设为协管/撤销协管”，现有协管带文字标签。没有openid自由输入或姓名匹配。

协管只看能力说明和自己的角色标签，草稿管理面板、批准的配置/导入/分队/配对/开赛动作开放；取消赛事按钮和对应handler仍用isAdmin。设置页新增独立canManageTournament可编辑条件，保留isAdmin=主办。

管理角色操作复用critical action guard防止双击；失败重试保存固定action/target/request payload，即使晚到的roster更新已显示授予，也不会把原grant重试变成revoke。成功刷新赛事并标记其他页面刷新。最新watch/fetch重新派生角色；不以旧按钮状态作为云端授权依据。

## 测试和检查

- 6项云合同和2项UI角色派生先行失败（能力函数/新函数/派生字段未实现），然后实现。第7云fixture抽到 `tests/helpers/tournament-cloud-fixture.js`供两项功能复用；第7原17项仍通过。
- 最终第8直接合同：`node --test tests/coManagers.contract.test.js tests/lobby.coManagers.test.js`，**12/12通过**（8云+4UI）。
- 直接覆盖真实handler管理矩阵、删除/重置/finish/clone拒绝、撤销后真实scoreLock+submitScore仍允许；伪造event身份/名单与guest/残留playerIds拒绝；重复并发审计/事务失败不半提交；grant与移除两顺序、start与revoke两顺序；直接分队/配对在读权限后被撤销时version冲突；UI角色更新/主办取消入口隔离/固定payload重试。
- 扩展命令：`node --test tests/addPlayers*.test.js tests/removePlayer*.test.js tests/setPlayerSquad*.test.js tests/managePairTeams*.test.js tests/setReferee*.test.js tests/updateSettings*.test.js tests/startTournament.index.test.js tests/lobby*.test.js tests/settings*.test.js tests/permission*.test.js tests/coManagers.contract.test.js tests/finishTournament.contract.test.js`，**223/223通过，0失败/跳过**；随后新增4项直接案例已通过上面的最终12项运行。
- 定向ESLint：**0错误、16警告**（既有名单解析正则escape及viewmodel未用解构变量），未为清警告改动无关代码。全量/check由主控在本波稳定后统一执行，不预先声称结果。
- 修改唯一权威 `scripts/permission-common.template.js` 后执行sync-cloud-common，生成各函数lib；未手改lib。同步完成已告知主控，cloudbaserc由主控统一登记manageCoManagers。

## 未验收与边界

真实DevTools/320/390/430、大名单长名大字、原生交互与用户验收待完成，安装器升级故障尚未恢复。双盲评审如按UI门禁适用，须使用本次真实图，当前没有实图通过回执。

真实微信身份、CloudBase安全规则/事务回放与冲突、各受管handler在SDK2.6.3/实际runtime下的执行、角色撤销与双手机并发待隔离验证。离线MVCC仅证明模型内线性化，不冒充真实引擎。该角色功能须与所用公共permission的7个handler匹配版本共同验收，未部署到云端。

没有改独立打水、root负责的找回/单打候选，也没有执行生产数据写、部署、客户端上传/发布、preview/QR、付款、commit/push。

## 2026-10-04依序续做：第8项

本轮起点为main/master、HEAD `7b3e5ff2e0677fe51a37ad01136c736e6b3680e7`，index空。16个既有dirty文件和183份相关源码/测试的SHA记录在`tmp/coadmin-eight-root-20261004/before.json`；私有配置、单打候选、QR、旧包、备份和partial保留。后端/helper已随`a85eb148`交付，协管客户端也已有独立交付，不能沿用上方10-03“未提交”描述判断当前源码。原生工具仍无有效会话，无新恢复证据，不盲重试；本轮不访问CloudBase、安装依赖、部署、上传或写真实数据。

两名Luna独立核当前合同和12候选对应性，Sol high实施本页修复并准备三个新本地包。当前绑定身份交集、主办专属授撤、七管理入口、事务version/审计/固定请求重放及删除/重置/收赛/复制主办门控没有新越权缺口；历史云模型测试不替代真实引擎，既有全量不重复。只读依据分别在`tmp/coadmin-eight-current-20261004-readonly/assessment.md`和`tmp/coadmin-eight-candidate-delta-20261004/{assessment.md,delta.json}`。

### 成功重试提示的切页缺陷

直接复现：grant/revoke先失败保存固定请求，重试等待期间hide/unload，成功回调因generation失效早退但未清对应失败记录；guard release还会写隐藏页面busy。恢复页面后仍能见到旧重试。真实Page加retryAction的原源码RED为4通过/6失败、exit1，保存在`tmp/coadmin-eight-stale-retry-20261004/red.log`及退出回执。最小修复限定大厅动作、生命周期和直接测试三个文件；隐藏/卸载不写UI，恢复后同步busy并只清成功的对应entry，旧Toast/fetch继续被generation拦截。固定payload/requestId不变，同key较新失败与新赛事保全。

首轮GREEN最终7个直接依赖测试文件37/37、0失败/跳过，语法3项、定向lint和diff检查通过；保留index.js既有未使用import警告1条。原3源码路径affected计划扩到44文件，未执行；审阅后仅执行大厅、retryAction、actionGuard直接测试闭包，没有全量或真实云调用。主控及Luna冷读随后发现普通直接再点按钮成功未清旧entry的P2：旧grant失败→新grant成功→revoke成功后仍可重试旧grant。该修复回归在提交前继续补直接RED/GREEN，前一轮证据不覆盖，最终结果见下节。

### 当前候选来源

12组共152份清单源码核对：9个候选源逐文件等于当前HEAD；旧addPlayers/removePlayer/updateSettings各仅index缺已交付的2500ms可选分享截止。12份permission副本等于当前模板。start使用第5新20源包、finish使用第7新13源包，避免旧单打未跟踪文件和旧finish入口。delete/reset/clone的历史离线回执未加载permission，只能证明其记录的require结果，不能宣称权限运行时已验。

仅在全新`tmp/coadmin-eight-candidates-current-20261004/`补三个落后包；37份当前源取固定HEAD blobs，工作原字节全等且均i/lf w/lf，旧三包52个证据文件保全。每包沿用各自6368依赖，不从备份扫描、不统一依赖树或联网安装。准备首次inspect把removePlayer默认diff hunk数强定为3而exit1；实际三处修改合并为2个hunk，另名消费核验通过，失败证据保留。主控全文审prepare/run/audit及源patch，核7工具/输入冻结和旧证据、无既有目标后才执行；回执在`tmp/coadmin-eight-root-20261004/preexecution-review.json`，当时检查exit0，构建结果待本节后续收口。

### 最终修复与本地构建结果

普通成功残留的追加RED为13项12通过/1失败、exit1。只在普通动作开始捕获当时本协管key对应entry；重试保持原闭包entry。成功仅在同赛事、对象仍匹配时登记清理，等待期间的新失败保留，固定请求和原生命周期门控不改。正常grant失败→新grant成功→revoke成功后旧grant不可再重放已有直接断言。最终同7测试文件39/39、0失败/取消/跳过，真实exit0；两新改文件语法、三文件定向lint、diff检查通过，既有import警告1条。证据在另新`tmp/coadmin-eight-stale-retry-20261004-followup/`，含RED/GREEN/完整HEAD patch/增量/最终SHA，首轮所有证据不覆盖。仅本页两个源和一个直接测试，无共享模块、后端或权限变更；历史1707通过/6跳过的全量不是本轮结果。

单次候选prepare于上海22:56:46.911–23:02:22.180运行；prepare及12个extract/zip/双Node加载子进程均数值exit0，外层run的数值exit0保存在`run-outer-process.json`，prepare退出保存在`receipt.json`。旧ZIP全成员SHA/CRC实际核后只提取各自依赖；新ZIP同核、重复字节相同/extra0。Windows24.18与16.13分别加载add/remove各406、settings409个真实SDK模块，main未调用/网络0。每包targetEnv=null、isolationOnly=true；不证明CloudBase Linux或平台部署/真实交易。封存导出器第一次引用错误任务根的preexecution-review而FileNotFound，原失败保留，另名只读导出纠正；没有重跑构建或加载。

| 当前新候选 | 源/依赖/成员 | 解包字节 | ZIP字节 | ZIP SHA256 |
| --- | --- | ---: | ---: | --- |
| addPlayers | 12/6368/6380 | 36438254 | 37588964 | `51f049b9b963cfcf1d3d6388b5a5418717018a9286e59a4efae91a8fcc663043` |
| removePlayer | 12/6368/6380 | 36434150 | 37584860 | `b09186538925a1e92d5917a0926cd114f4514961797e048a9d44674575047919` |
| updateSettings | 13/6368/6381 | 36442476 | 37593278 | `97868a4b6d34c0b0b09b4d6dae0733111b4c3a58f61ffbab12d83f453646c034` |

旧包、工作云源、冻结工具及已有Node16保全。第8权限组的其余9个包继续使用前述delta选定路径，不因本轮docs/大厅变更重建。真实身份/规则/事务冲突与回放、跨会话撤权/双机、实际平台runtime及3秒余量仍未验；当前原生图、320/430/大字和手机也未验。完整第8未完成，前项待验不删除，后续编号第9。独立冷读与主控文档/原dirty/非目标源保全回执随本阶段收口保存；按持续授权仅交付三个已验源/测试与四份相关文档，候选和私有证据留在ignored本地目录。


## 10-05 截图复核接续

本轮实图、合同修复、全部失败、测试回执及当前未验项统一见 [原生截图复核](2026-10-05-native-screenshot-review.md)。本节仅补接续入口，不改写上方历史结果或本项业务/验收合同；唯一逐项状态仍见paused-plan-status正文。
