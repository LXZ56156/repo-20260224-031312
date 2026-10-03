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
