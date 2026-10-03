# submitScore 事务冷审

日期：2026-10-03  
范围：只读审查 `cloudfunctions/submitScore/index.js` 与 `tests/submitScore.index.test.js` 当前差异；没有修改源码、测试或部署。审查时工作区已有大量共享未提交改动，本记录只描述目标文件。按要求未读取本轮 score 实施日志或结论。读取到的 `docs/tasks/current.md` 仍记载“录分锁与赛事跨文档原子性”是限制；目标代码的当前未提交差异正在用事务覆盖两个文档。该冷审只验证本地差异的设计，不把它视为已交付或已部署状态。

## 结论

在请求的锁接管、锁 owner/session/过期、重复提交、事务回调重试及分享副作用方面，未发现可复现的实现错误。`submitScore` 将赛事更新和录分锁删除放在同一事务中；微信 SDK 回调返回后、事务提交成功后才执行分享更新。`node --test tests/submitScore.index.test.js` 结果为 15 通过、0 失败。

曾根据底层 `@cloudbase/database` 的原始返回值怀疑事务 `update` 形状不匹配；逐层核实 `wx-server-sdk@2.6.3` 包装后，确认该怀疑不成立。云函数锁定该版本于 [submitScore/package.json](../../../cloudfunctions/submitScore/package.json:6)。包链为 `wx-server-sdk@2.6.3 -> @cloudbase/node-sdk@2.9.1 -> @cloudbase/database@1.4.1`。`wx-server-sdk@2.6.3/index.js` 的 `Transaction.collection()`（1596–1600 行）将底层事务集合再包装为 SDK `CollectionReference`；包装层 `DocumentReference.update()`（1327–1344 行）返回 `{ stats: { updated: updateResult.updated }, errMsg }`，`remove()` 也包装为 `stats.removed`。主控另以已执行的 `tmp/sdk-transaction-wrapper-contract-20261003.cjs` 做了无网络验证：使用真实 wx SDK wrapper 与底层事务替身，观察到 `update.stats.updated=1`、`remove.stats.removed=1`。因此现有测试 harness 的 `stats.updated` 形状匹配本函数实际 SDK 层，不能用底层原始 `{ updated }` 响应推断这里会进入冲突分支。

## 逐项审查

- **赛事与锁的写冲突**：[submitScore/index.js](../../../cloudfunctions/submitScore/index.js:93) 在事务内读取赛事和锁；[169–200 行](../../../cloudfunctions/submitScore/index.js:169) 在同一事务中更新赛事并删除同一个锁文档。CloudBase 官方事务说明读取快照不锁文档、写入文档会产生写锁和写冲突；因此在锁接管与提交并发时，双方对同一 `score_locks` 文档的写入会冲突，失败事务重试后会重读 owner。已有专测 [submitScore.index.test.js](../../../tests/submitScore.index.test.js:188) 对接管时 revision 变化进行模拟，并断言新 owner 保留、比分不落盘。
- **owner、session 与到期**：[123–145 行](../../../cloudfunctions/submitScore/index.js:123) 依次验证锁存在、`expireAt` 尚未到期、owner 为当前 `OPENID`，并拒绝双方都有值但不匹配的 session。缺少请求 session 时仍接受旧客户端，注释说明这是兼容行为；测试分别覆盖旧 session 被拒、当前和 legacy 请求通过（[250–303 行](../../../tests/submitScore.index.test.js:250)）。这是可见的兼容边界，不是本轮引入的意外放宽。
- **重复提交**：[105–115 行](../../../cloudfunctions/submitScore/index.js:105) 在读取锁之前，对已经完成且比分相同的比赛返回 `SCORE_SUBMIT_DEDUPED`，不写赛事、不消费后来取得的锁，也不调用分享。重试测试覆盖回调重放后发现比分已存在时不发 OpenAPI（[262–290 行](../../../tests/submitScore.index.test.js:262)）；另一测试明确规定任意参赛者提交相同已完成比分都会去重（[504–539 行](../../../tests/submitScore.index.test.js:504)）。当前去重依据为已完成状态与比分值；`clientRequestId` 只回显，不作为持久化去重键。这与本次检查到的测试合同一致。
- **回调重试**：入口回调在每次运行时先清空 `shareFinishTournament`（[96 行](../../../cloudfunctions/submitScore/index.js:96)），避免前次中止尝试留下的分享状态污染重试。锁写入在事务内；外部 OpenAPI 不在回调中。锁定的 SDK 包链将事务冲突交给 `runTransaction` 重试；腾讯官方事务文档说明快照隔离及写冲突处理，CloudBase Node SDK API 文档也说明 `runTransaction` 的 callback 返回值在自动提交后返回。
- **分享时序**：[201–210 行](../../../cloudfunctions/submitScore/index.js:201) 先等待 `db.runTransaction` 完成，再且仅在返回 `SCORE_SUBMITTED` 且本次完成赛事确有活动时调用 `updateFinishedMessageBestEffort`。微信 SDK 的 `runTransaction` 包装器把事务 callback 传给底层事务运行器（`wx-server-sdk@2.6.3/index.js` 1620–1624 行）；底层成功路径在 callback 完成后提交，再返回 callback 结果。现有成功与回调重放测试覆盖调用/不调用 OpenAPI（[603–651 行](../../../tests/submitScore.index.test.js:603)）。

## 验证与未覆盖边界

本次执行 `node --test tests/submitScore.index.test.js`：15/15 通过。测试通过本地 stub 隔离数据库与 OpenAPI；锁接管测试明确模拟事务写冲突，不会验证 CloudBase 服务端对并发事务的实际调度、冲突错误返回、重试耗尽或事务回滚。主控的 wrapper contract 检查覆盖 SDK 包装与返回形状，仍使用底层事务替身，没有连接真实云环境。

`expireAt` 在事务读取锁后由云函数侧 `Date.now()` 检查（123–131 行），没有云端提交时钟的再次校验。现有过期用例覆盖已过期锁拒绝，但没有模拟锁在读取与提交之间刚好跨过到期时间；因此这里的严格“提交瞬间必须未过期”语义未验证。SDK/云数据库并发事务及真实 OpenAPI 也均未在本次审查中执行。

参考资料：

- [CloudBase 数据库事务：快照隔离、锁与写冲突](https://cloud.tencent.com/document/product/876/48442)
- [TencentCloudBase Node SDK 数据库事务 API：事务更新结果与 runTransaction](https://github.com/TencentCloudBase/node-sdk/blob/master/docs/database/database.md)
- 精确 npm 包源码（在 `$env:TEMP` 解包只读检查）：[`wx-server-sdk@2.6.3`](https://registry.npmjs.org/wx-server-sdk/-/wx-server-sdk-2.6.3.tgz)、[`@cloudbase/database@1.4.1`](https://registry.npmjs.org/@cloudbase/database/-/database-1.4.1.tgz)
