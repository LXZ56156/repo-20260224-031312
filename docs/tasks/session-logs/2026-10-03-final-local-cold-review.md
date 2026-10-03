# 第3项留痕与第10项性能修复冷审（2026-10-03）

结论：未发现P0/P1阻塞。审查中复现一个P2意图关联边界；最小修复已合入当前工作树并由直接回归验证关闭。本文仅记录只读审查与该项关闭证据，不修改 `current.md`。workdir为 `D:\projects\badminton-miniapp\main`，branch `master`，HEAD `b571c68754e964e1a73800645f68a49d99f40f41`。

## 复现与关闭的P2

`WATER_ACTIONS.create` 与 `createLedger` 都映射为遥测action `water_create`。原意图Map只按映射后的action和 `clientRequestId` 建键，所以将相同请求ID依次传给这两个不同的原始动作，会得到同一个 `intentId` 和递增的attemptIndex。只读复现：

```js
const tracker = require('./miniprogram/core/activityTracker');
const create = tracker.begin('waterSession', { action: 'create', clientRequestId: 'same-test-id' });
const ledger = tracker.begin('waterSession', { action: 'createLedger', clientRequestId: 'same-test-id' });
console.log(create.intentId === ledger.intentId, create.attemptIndex, ledger.attemptIndex);
```

修复后，关联scope区分函数及 `waterSession` / `scoreLock` 的原始已登记动作，遥测仍可保留聚合action。现有修复位于 [activityTracker.js](../../../miniprogram/core/activityTracker.js#L43) 与 [begin分派](../../../miniprogram/core/activityTracker.js#L128)。新增 [alias直接回归](../../../tests/activity-tracker.test.js#L118) 验证 `create` 与 `createLedger` 不合并；各自同动作重试仍复用自己的intent、attemptIndex分别递增，payload字段不变且原始请求ID不发送。该回归在修复前11项中出现1项预期失败，修复后11/11通过。正常客户端生成的两类请求ID已有动作前缀；这次修复也覆盖显式传入相同ID的边界。

## 其余合同核验

- 隐私字段：tracker只发送固定字段allowlist；事件action/result/resultCode等为枚举，版本只取SDK `miniProgram.version/envVersion`，缺失留空。trace只接纳现有生成格式；原始请求ID只作有上限、有过期时间的进程内Map键，不发送、不hash、不持久化、不打印。直接覆盖见 [activity-tracker.test.js](../../../tests/activity-tracker.test.js#L24) 与 [活动留痕规范](../../specs/activity-observability.md#L5)。
- 自动与手动重试：`cloud.call` 在循环前只begin一次，成功或最终失败出口finish一次；内部重试共用operationId/traceId，finish写实际retryCount。单次内部重试和显式再次调用的配对由 [重试测试](../../../tests/activity-tracker.test.js#L72) 覆盖；该用例实际模拟一次内部重试，源代码loop及成功/终止异常出口已逐项检查。手动intent仅在进程内保持，最多100组、首次调用后30分钟失效；到期、逐出、无效ID的直接覆盖见同测试文件第95行起。
- 分享进入：缓存回退和 `reuse_cache` 不会被记成云端确认；onHide不产生永久离开结果；pending操作只在unload记一次left，完成后卸载及迟到响应不重复出result。直接覆盖见 [share-entry.activity-tracking.test.js](../../../tests/share-entry.activity-tracking.test.js#L23)、[缓存与显式重试](../../../tests/share-entry.activity-tracking.test.js#L42)、[卸载与迟到响应](../../../tests/share-entry.activity-tracking.test.js#L90)。
- 完赛与分享：completion只观察成功响应中显式finished状态，包含重放时不宣称首次完成；赛事实际分享hook记unknown/DELIVERY_UNKNOWN，海报、预热、菜单和复制不冒充送达。覆盖见 [完成状态测试](../../../tests/activity-tracker.test.js#L135)、[ranking/analytics/lobby分享测试](../../../tests/tournament-share.activity-tracking.test.js#L28)、[schedule分享测试](../../../tests/schedule.share-message.test.js#L31) 及 [规范说明](../../specs/activity-observability.md#L13)。
- 赛程预算与权威源：直接Page测试确认24人/660场及20字符导入名下每个实际patch均小于1MiB，长旧数组缩短会清尾，筛选、迟到身份、version2刷新及分享继续使用完整 `_latestTournament`。最后一批render callback仅在page active、代次和source仍匹配时可启动focus/头像工作；确认缺失和hide后旧回调不能复活旧source。覆盖见 [schedule.setdata-budget.test.js](../../../tests/schedule.setdata-budget.test.js#L47) 与 [schedule.identity-recovery.test.js](../../../tests/schedule.identity-recovery.test.js#L32)。性能回执已将单call字节计数、Node测量边界和未完成真机门禁分开记录：[性能基线与修复](2026-10-03-performance-baseline.md#L50)。

## 复核验证与边界

修复前，本审查运行以下六个直接套件，32项通过、0失败、0跳过：

```powershell
node --test tests/activity-tracker.test.js tests/share-entry.activity-tracking.test.js tests/schedule.setdata-budget.test.js tests/schedule.identity-recovery.test.js tests/schedule.share-message.test.js tests/tournament-share.activity-tracking.test.js
```

修复仅涉及tracker的意图scope及其新增回归；修复后再次运行 `node --test tests/activity-tracker.test.js`，11项通过、0失败、0跳过。该审查未重跑npm全量或其他直接套件；主控负责变更后的整合门禁。分享hook更新前的整合1552项结果不覆盖本次shared改动，状态见[补齐记录](2026-10-03-observability-completion.md#L35)。

真实微信后台事件配置、实收/查询对账、真实分享旅程、DevTools数组路径渲染，以及低端Android/iPhone的桥传输和渲染均未在本次只读冷审中验证。离线stub和Node字节预算测试只证明本地合同与合成用例；不得据此宣称线上留痕闭环或真机性能验收完成。
