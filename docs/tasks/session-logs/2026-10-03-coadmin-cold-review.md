# 第8项协管权限闭包冷审（2026-10-03）

## 范围

只读核对 `scripts/permission-common.template.js`、前端实际权限路径 `miniprogram/permission/permission.js`（任务原写 `miniprogram/core/permission.js`，该路径不存在，主控已更正）、`cloudfunctions/manageCoManagers/index.js` 与 `docs/tasks/session-logs/2026-10-03-coadmin-implementation.md`。为确认直接授权闭包，额外只检查了已批准7个handler与delete/reset/finish/clone的门禁和版本写入位置，以及权限 helper 直接依赖的 `playerUtils.extractPlayerId` 实现。没有运行测试、CloudBase操作或外部写入；主控正在跑统一全量/check/lint，未重复。

## 结论

本轮未发现已证实的 P1 权限扩权。

客户端与云端 `permission` helper 的角色规则一致：`isAdmin` 只比较 `creatorId`；`canManageTournament` 为主办或当前 `coManagers` 与 `players` roster ID 的交集；交集会排除主办。二者的 `getBoundPlayerIds` 只从 `players` 中的对象取 ID，拒绝 `type=guest` 和 `guest_` 前缀；不会把 `playerIds` 数组单独当作授权来源。`canEditScore` 仍为主办或既有参赛者，没有把协管角色用于录分权限。参考 `scripts/permission-common.template.js:3-32`、`miniprogram/permission/permission.js:3-32`；直接 ID 提取定义见 `scripts/player-common.template.js:1-5` 和 `miniprogram/core/playerUtils.js:1-5`。

获批的7个handler均有云端 `canManageTournament` 检查：`addPlayers:158`、`removePlayer:52`、`setPlayerSquad:32`、`managePairTeams:41`、`updateSettings:49`、`startTournament:123`、`setReferee:44`。`removePlayer` 同事务从 roster 删除目标，再以新 roster 重算 `coManagers` 并按旧 `version` 条件写入（`cloudfunctions/removePlayer/index.js:84-104`）；自我移除仍是独立的既有分支。

owner-only 闭包仍收紧：`deleteTournament` 在读取后和事务内都 `assertCreator`（`cloudfunctions/deleteTournament/index.js:125-133`）；`resetTournament` `assertCreator`（`resetTournament/index.js:17-19`）；`finishTournament` 在事务内用 `permission.isAdmin`（`finishTournament/index.js:24-27`）；`cloneTournament` 直接比较源赛事 `creatorId` 与 `OPENID`（`cloneTournament/index.js:77-80`）。这些handler没有改用 `canManageTournament`。

`manageCoManagers` 从 `getWXContext()` 取操作者身份，并先检查主办权限；请求键包含 tournament、operator、clientRequestId。成功日志重放只在 action/target 匹配时返回当前 `getCoManagerIds(t)`，不写赛事；同ID改 action 或 target 拒绝。grant 仅接受当前 bound roster ID，拒绝主办自授；新变更限 draft/running。变更在事务中更新 `coManagers` 并 `version + 1`，无变化只记幂等日志、不增加版本（`manageCoManagers/index.js:7-52`）。旧 grant 在后续 revoke 后重放不会恢复角色。

七个 handler 中，`addPlayers`、`removePlayer`、`updateSettings`、`startTournament`、`setReferee` 使用事务并有事务内版本条件更新；`setPlayerSquad` 与 `managePairTeams` 使用旧版本条件写入。协管撤销对赛事版本的增量会使两个非事务写路径的旧版本条件失效，其他路径依赖同一赛事事务冲突与重试时重新校验权限。`manageCoManagers` 自身的角色修改和 request log 同事务提交。此为源码闭包判断；实际 CloudBase 事务冲突/重放行为仍按原实现记录待隔离环境验证，不冒称线上验收。

## 未覆盖边界

指定文件没有包含独立“解绑身份”转换处理。当前协管 eligibility 由 `players` 对象 ID 派生，不读取 `playerIds` 或单独的 openid/bound 字段。因此，残留 `playerIds` 单独不能保留协管；若某个未审阅的解绑流程只清理 `playerIds`、却保留 `players[].id` 为该用户 OPENID，helper 仍会把它视为 bound。现有范围不足以证明该解绑流程是否如此，故记录为待对照的边界，不定性为已复现漏洞；若解绑是实际权限要求，应单独核验其 roster 变换。

客户端按钮或隐藏状态未作为云端授权证据。没有发现需给出的 P1 最小复现；真实 CloudBase 事务及未审阅的解绑转换仍未由本次只读源码检查验证。

## Roster 解绑与身份转换补充（2026-10-03）

按主控追加范围只读追踪了云函数源码中实际写 `players` / `playerIds` 的赛事路径，并复核 `saveUserProfile` 的头像同步。没有运行云函数、测试或外部写入。

- **未发现仅删除 `playerIds`、保留 `players[].id === OPENID` 的实际解绑路径。** 自助退出由 `removePlayer` 接收调用者的 `OPENID` 与目标 ID 比较；确认目标存在后从 `players` 完整移除目标、由剩余 roster 重建 `playerIds`、用新 roster 重算 `coManagers`，再以旧 `version` 条件更新（`cloudfunctions/removePlayer/index.js:48-64,84-105`）。如果目标不存在，只返回幂等成功，不会只改数组（同文件 `:63-81`）。
- `joinTournament` 使用服务端 `getWXContext().OPENID`，不接收客户端指定的 roster 身份（`cloudfunctions/joinTournament/index.js:189-201`）。已有成员更新会将对象 `id`（以及已存在的 `playerId`）规范成该 OPENID，并从新对象列表重建 `playerIds`（同文件 `:243-257,288-345`）；普通加入以该 OPENID 新建成员对象（`:354-360,394-410`）。唯一 guest 转换路径先要求同名 guest 恰好一个（`:252-256`），再将 roster、`playerIds`、对阵引用一并换为当前登录者 OPENID（`:127-162,362-391`）。因此按当前写路径，转换后的 roster ID 与本次认证的 OPENID 相同。
- **匿名 guest 认领的条件风险：** guest 归属依靠唯一、规范化后的昵称匹配，客户端可提供本次 join 昵称；此处没有 per-guest token 或旧账号证明（`joinTournament/index.js:197-200,252-256`）。认领者取得的是自己的服务端 OPENID，并不会让任意非 OPENID 的对象 ID 直接获得协管；协管仍须主办者之后显式 grant。若产品要求 guest 只能由原本人认领，则昵称匹配不足以证明本人，需单独确认/设计该身份合同；本次不将其定为协管权限绕过。
- **当前代码可达性：** 其余创建路径也只产生可解释身份：创建者行来自 `OPENID`（`createTournament/index.js:100-107,136-137`）；导入由服务端生成 `guest_…` 且标为 `guest`（`addPlayers/index.js:58-60,189-200,243-247`）；复制只将当前操作者映射为新赛事主办/用户行，其余行重建为 guest（`cloneTournament/logic.js:17-39`）。`saveUserProfile` 的赛事同步只改头像，并且仅对 ID 与 OPENID 相同、非 guest 的对象生效；不改身份 ID 或 `playerIds`（`saveUserProfile/index.js:28-42,44-96,107-114,139-175`）。检索到的其他 roster 读写代码没有另一个解绑或 claim writer。
- **依赖数据前提的条件风险，不是已发现的当前写路径：** `getBoundPlayerIds` 将任意对象型、非 `type=guest`、提取 ID 不以 `guest_` 开头的成员视作已绑定（`scripts/permission-common.template.js:11-16`）；`manageCoManagers` 的 grant 仅按该列表验目标，仍要求操作者是主办（`cloudfunctions/manageCoManagers/index.js:21-40`）。它没有独立绑定 OPENID 字段可交叉验证。若旧库/手工数据存在错标为非 guest 的任意 ID，owner 可为该 ID 记协管；该 ID 只有恰好是某调用者 OPENID 时才会让该调用者通过 `canManageTournament`，而当前 create/join/claim/add/clone writer 不会产生这种不一致形状。当前只读检查没有读取或校验线上 roster 数据，故该历史数据前提未验证。
- 对象同时含不同的 `id` 与 `playerId`/`_id` 时，提取器优先 `id`（`scripts/player-common.template.js:1-5`）；join 的匹配逻辑也在 `id` 非空时只比较 canonical `id`（`joinTournament/index.js:26-35`）。因此若已有这类不一致旧对象，当前自助退出按 OPENID 可能找不到其 roster 行，且协管身份按 canonical `id` 而非其他别名判断；没有发现当前 writer 会新建这种别名冲突。属于需由实际数据审计才能确认的遗留数据风险。

本补充没有发现“残留 `playerIds` 单独留权”或可由当前正常 roster 写路径生成非绑定 ID 再授予协管的已证实缺陷。线上/历史 roster 形状、guest claim 是否需要更强本人证明，以及真实 CloudBase 行为仍未由这次源码冷审验证；全量/check/lint与真实服务核验由主控负责，本轮未重跑。
