# 提前结束事务与赛事找回云函数冷审

- 调查日期：2026-10-03（Asia/Shanghai）
- 复核说明：首轮冷读时 `finishTournament` 仍是逐场事务锁读取，之后主控替换了该算法；本报告同时保留首轮采样事实并以复读后的源码作为当前状态。
- 范围：只读查看当前 `finishTournament`、`scoreLock`、`getMyTournaments` 源码；静态检查仓库外已备份的 CloudBase SDK；检索腾讯云 CloudBase 官方事务文档。
- 边界：没有 CloudBase/微信云请求，没有运行事务、部署、写数据或改代码。本记录不把 SDK 能构造的请求等同于服务端已验证支持。

## 结论

当前 `finishTournament` 在事务 callback 中用普通 `db.collection(...).where(...).limit(1).get()` 做一次未过期锁预查；请求不带事务对象，不再逐场读取锁文档。callback 仍在事务打开期间等待这次查询，因此它不占事务内的逐场操作预算，但其延迟仍消耗 callback/事务墙钟时间。官方事务文档列出每事务最多 100 个操作、执行不超过 30 秒；当前成功路径可见 4 个事务文档操作（赛事读取、幂等日志读取、赛事更新、幂等日志写入），而非旧快照的 `N + 4`。旧版逐场读取达到 97 场会超出 100 操作字面预算的判断只适用于首轮评审快照，已由当前算法消除。实现方报告的 660 场本地调用计数测试为每次 callback 1 次集合查询、0 次锁文档读取；这不是 CloudBase 服务端事务/查询行为或耗时实测。

外部备份中的 `wx-server-sdk@2.6.3` 与 `@cloudbase/database@1.4.1` 包装层允许写出 `transaction.collection(...).where(...).get()`，并会把事务 ID 传入查询请求；但腾讯云官方事务合同明确不支持事务内 `where`。这只是 SDK/服务合同差异记录，当前实现使用普通数据库引用的查询，不使用事务内批量读。

`getMyTournaments` 的身份取自 `cloud.getWXContext().OPENID`，忽略事件里的用户身份字段并拒绝空身份。它以主办、参与两条有独立游标的查询流合并排序，100 条扫描上限会显式返回 partial code 和可继续的游标。静态代码没有发现跨身份授权路径或静态数据集上的明显分页丢失。客户端找回页面已在首轮搜索之后落地，先前“未发现调用方”仅表示当时读取时点，不再作为当前缺口；本次没有重审页面行为。

## `finishTournament` 与真实事务合同

- 首轮冷读采样的旧 [finishTournament/index.js](../../../cloudfunctions/finishTournament/index.js) 在事务中逐场 `doc(lockId).get()`；当时按成功路径的 `N + 4` 次文档操作分析并建议核对比赛数预算。复读后的当前版本已移除 `readLock()` 循环，不能把该旧建议当作当前算法建议。
- 当前版本先在事务内读取赛事和幂等日志，然后以普通 `db.collection('score_locks').where({ tournamentId, expireAt: db.command.gt(Date.now()) }).limit(1).get()` 查是否存在任意未过期锁；查询失败或返回形状无效会抛错，不按“无锁”放行。赛事更新、请求日志写入仍在事务里；赛后分享消息更新在事务之外。
- 当前一次成功 callback 可见 4 个事务文档操作，加 1 次事务外集合查询；查询不带事务 ID，也不是把事务中的 `where` 改成“受支持的批量事务读”。该集合查询本身仍是一次 CloudBase 请求，并在事务 callback 内等待。
- 该并发合同依赖所有成功的锁申请、接管和心跳都在同一事务中递增同一赛事的 `scoreLockRevision` 并写锁；结束事务也更新该赛事。新锁若与结束并发，会使一方对赛事文档的写冲突并触发事务 callback 重放，而查询处于 callback 内会重新执行。此为源码/实现者报告的设计关系，不代表本次实测了 CloudBase 冲突、回放时序或查询一致性。
- 仓库外实际包版本在 `D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-0607\cloud\functions\beginMatch\code\node_modules`：`wx-server-sdk` 为 2.6.3，依赖 `@cloudbase/node-sdk` 2.9.1，数据库包为 `@cloudbase/database` 1.4.1。既有依赖清点记录 38 个备份函数的这组运行时版本一致；本次没有改动备份。
- 历史评审问题中的 SDK 核对仍成立：该包的 `Transaction.collection()` 返回带 transaction ID 的 `CollectionReference`；`where()`/`get()` 包装能构造并发送带事务 ID 的 `database.getDocument` 查询。这证明 SDK 包装层能构造请求，不证明后端接受或按事务语义执行。当前 `finishTournament` 使用普通 `db.collection()`，不走事务 where/get。
- 同包 `wx-server-sdk/index.js` 的事务包装把 `runTransaction` 默认 `times=3` 传给底层；底层 `@cloudbase/database@1.4.1` 遇数据库冲突会重跑 callback。静态实现是首次尝试加最多 3 次冲突重试（最多 4 次 callback 尝试）。每次是新事务，当前 callback 内的外部锁集合查询可能重复；这增加端到端耗时和查询调用量，但该普通集合查询不属于单个事务的 100 文档操作预算。
- [腾讯云 CloudBase 官方事务操作文档](https://docs.cloudbase.net/database/transaction)（2026-10-03 检索）列明：单个事务最多 100 个操作、最长 30 秒、事务只支持 `doc`，不支持事务内 `where`。官方没有在该页另列独立的“读操作数”上限。当前集合查询走普通数据库引用，故不违反“事务内不支持 where”这条限制；事务时限仍适用。
- 这是一项静态合同核对，不是服务端验收：没有跑当前 `finishTournament` 的真实 CloudBase 查询/事务，没有测查询延迟、事务墙钟时间、冲突重放时的实际查询次数、真实错误码或 30 秒终止表现。也没有确认当前/隔离环境云函数运行时超时，函数自身超时可能早于事务 30 秒上限。

当前算法避免了逐场事务操作数随 matches 增长；应保持事务外锁查询失败时 fail-closed，并保持每个可能创建/续期锁的路径都与结束事务共享赛事文档冲突。实现者报告的 660 场调用计数结果只证明函数层一次查询/零锁文档读取；实际数据库查询性能、事务重试和短超时环境表现仍需隔离环境验证，不能由本次审查推定通过。

## `getMyTournaments` 身份与分页

- 身份入口是 `getWXContext().OPENID`；空值返回 `PERMISSION_DENIED`。查询谓词均在服务端使用该 OPENID：一路按 `creatorId` 精确查主办赛事，另一路排除当前主办身份后按 `playerIds`、`players` 和 `players.id/playerId/_id` 候选查参与赛事。处理后再按权威玩家 ID 二次过滤；不读取 `event.openid`，昵称、名字或分享码不参与归属判断。
- 合并流以 `updatedAt desc, _id asc` 排序；每一路独立保存 `{time,id}` 边界，续页条件为更早的时间或同一时间下更大的 `_id`，与排序方向相符。参与流排除当前主办者以避免两路重复，页面内另用 `seen` 去重；角色标签分别由 `creatorId` 与权威玩家 ID 生成，所以一条赛事可同时标 owner 与 participant。
- 游标 payload 有版本号、两路边界和 done 位；外层签名用 HMAC-SHA256，密钥是当前 OPENID。OPENID 不是保密密钥，知晓自己 OPENID 的调用者可以重签并改变自己的分页提示，例如把两路 `done` 设为 true 得到自己的空完整页；这不构成跨身份读取或授权扩大，因为每条云查询仍使用服务端当前 OPENID。报告此边界，不把 HMAC 描述为抵抗持有者伪造，也不把它当作新增服务端 secret 框架的理由。
- `SCAN_LIMIT=100` 是每个 route、每次函数调用最多消费/二次过滤的候选数，不是全局总数。每次 query 最多取 21 条；若某一路 100 条内被过滤完，设 `capped` 后以 `TOURNAMENT_RECOVERY_PAGE_PARTIAL` 和 `hasMore=true` 返回；即使另一条路尚有未消费的 head，合并循环也会停止，因此该页可少于 20 条。未消费 head 不会推进该路的 `last`，下页会重新查询该位置；已过滤候选会推进 cursor，从而可以分批越过脏候选。静态排序下未见因 cap 丢弃候选的路径。
- `participant()` 对 `players` 有数组时优先使用实际名单（即使为空），只有 `players` 缺失/非数组时才回退 `playerIds`。这是已批准的权威 roster 优先设计：残留的 `playerIds` 索引不应让已不在实际名单里的身份获得找回结果。例：`creatorId:'B', players:[], playerIds:['A']`，A 会被数据库候选查询找到，再由二次过滤剔除，这是设计结果。通用 helper 的并集语义不改变此端点经批准的权威名单合同。
- 以 `rounds` 作为 projection 会把完整轮次/比分读入函数，再只返回比赛计数摘要；大赛事列表的响应体与读取成本可能偏高。可考虑预先维护计数或单独读取必要的计数数据，但要另行验证一致性。
- 首轮搜索发生在页面落地之前，故当时没有发现客户端调用方。后续实现已添加 `miniprogram/core/tournamentRecovery.js` 和 `miniprogram/pages/tournament-list/index.js`；本次日志更新据实现者提供的当前状态纠正旧记录，但没有重新审阅页面/调用链或执行端到端列表验证。
