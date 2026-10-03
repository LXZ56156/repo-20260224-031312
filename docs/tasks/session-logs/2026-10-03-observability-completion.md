# 第3项本地留痕补齐（2026-10-03）

本轮仅本地实现和合成/离线验证。workdir为`D:\projects\badminton-miniapp\main`，branch `master`，HEAD `b571c68754e964e1a73800645f68a49d99f40f41`；开始时既有dirty全部保留。未commit/push、部署、上传/发布、写真实业务或测试实收数据，不修改current入口。合同见[activity-observability](../../specs/activity-observability.md)。

## 具体变更

- `miniprogram/core/activityTracker.js`：统一cloud写操作的现有begin/finish入口增加随机intentId/attemptIndex。同函数、同已登记原始子动作及同clientRequestId的手动重试保留意图，但生成新的operationId/traceId；内部自动重试仍一对attempt/result、仅retryCount增加。raw ID只作进程内Map键，不发送、不hash、不存盘、不日志；非空字符串长度上限256，最多100组，固定首次调用后30分钟到期（定时清除与调用时检查，满额逐出最早组），进程结束自然消失。到期、逐出、无合法ID和跨进程没有关联保证。
- 复用`core/cloud.js`已有begin/finish，本轮不修改该文件或任何云返回合同。submitScore的ok:true且显式finished:true响应，仅追加result观察`finished_confirmed/FINISHED_CONFIRMED`，与score_submit同operationId/intentId/traceId、独立eventId。包括重放结果在内，均不能证明第一次完成或finished状态切换；不伪造无法权威预判的completion attempt。
- `pages/share-entry/index.js`：onLoad先发share_enter attempt；新鲜远端读取/watch且status为draft/running/finished才确认成功。缓存回退、已有文档兜底、watch的reuse_cache均不确认远端成功；缺失、无效链接、读取失败分别留固定结果码。onHide不记离开；未完成时onUnload记left，完成/卸载后迟到结果不重复发送。显式重试重新开始入口操作，后台刷新不新增attempt。
- `core/sharePageMixin.js`统一在ranking/analytics实际onShareAppMessage/onShareTimeline回调新增tournament_share；ranking最初的本轮wrapper已移除避免doublecount，lobby/index.js直接onShareAppMessage补同一调用。发送结果unknown/DELIVERY_UNKNOWN。菜单启用、分享预热、朋友圈引导、海报生成/保存、复制不计为真实发送；water分享保持账本语义，不采tournament_share。schedule由性能任务独占并已完成同一tracker接口接入与直接验证；本代理没有改schedule或lobbyLifecycleActions。
- 所有新事件仍仅wx.reportEvent，采集失败不影响业务。页面事件无云trace时为空；SDK未提供version/envVersion时也为空，不以线上历史版本补造。

## 验证

行为实现前先补直接测试并运行，出现预期失败：初始13项中9项缺功能失败；后加reuse_cache及缺status案例也先观察失败，再修实现。

先执行`npm run test:affected -- tests/activity-tracker.test.js tests/share-entry.activity-tracking.test.js`审阅计划，再`--run`。最终直接测试16项通过：手动/自动重试、30分钟/100组边界、无后续调用时定时清除、PII剔除、完成状态与独立eventId、分享unknown、无SDK/同步与异步采集失败、缓存/共享watch/隐藏/卸载/迟到结果与缺status。

页面影响计划及执行：

```powershell
npm run test:affected -- miniprogram/pages/share-entry/index.js miniprogram/pages/ranking/index.js tests/activity-tracker.test.js tests/share-entry.activity-tracking.test.js
npm run test:affected -- --run miniprogram/pages/share-entry/index.js miniprogram/pages/ranking/index.js tests/activity-tracker.test.js tests/share-entry.activity-tracking.test.js
```

页面相关177项通过、0失败、0跳过；最后仅将合法status判断收紧为自有枚举字段后，16项直接测试再通过。局部ESLint（activityTracker/cloud/share-entry/ranking及上述两测试）0错误、0警告；git diff --check通过（输出已有其他文件CRLF提示）。core/activityTracker的test:affected规则选择全量，已输出计划，按主控分工由主控在所有并行实现结束后执行最终全量/check/lint。

随后按主控补齐其余现有赛事分享入口：新增`tests/tournament-share.activity-tracking.test.js`，行为修改前实际Page tests观察analytics/lobby未采事件的2项失败；集中mixin并补lobby后，再按以下计划→执行38项通过、0失败/跳过：

```powershell
npm run test:affected -- tests/tournament-share.activity-tracking.test.js tests/share-page-mixin.test.js tests/analytics.share-message.test.js tests/lobby.share-message.test.js tests/share-entry.activity-tracking.test.js
npm run test:affected -- --run tests/tournament-share.activity-tracking.test.js tests/share-page-mixin.test.js tests/analytics.share-message.test.js tests/lobby.share-message.test.js tests/share-entry.activity-tracking.test.js
```

新增5项直接测试证明ranking/analytics/lobby各实际hook恰好一对事件、原title/path/query/promise保持、异步图片准备不重复计数或变为送达成功、同步/异步采集故障不阻断，以及菜单/预热/海报/保存/复制/lobby touch准备/water账本不误计。该批局部ESLint0错误、1条lobby既有unused retryAction warning（本轮未变此行），diff检查通过。主控先前整合1552通过/6跳过早于这次shared mixin改动，后续shared门禁由主控补跑，不能复用早于新实现的通过结果。

独立Luna冷审发现P2：原关联键使用归一化action，waterSession的create/createLedger虽然原始动作不同、都映射water_create，相同请求ID会误合并为intent index1/2。补一条直接回归`water create aliases keep distinct intents while each original action retries correlate`，先计划后`npm run test:affected -- --run tests/activity-tracker.test.js`观察11项中该1项失败，再最小改为函数名scope，waterSession/scoreLock追加已登记原始action。修后同命令11/11通过，分别首次index1、各自重试index2、事件字段清单不变、无raw ID输出；activityTracker及其直接测试局部ESLint0错误0警告、diff检查通过。未改业务ID、事件输出、云合同或增加框架；源码稳定已通知主控与冷审，最终shared门禁需基于这次新源重跑。

## 尚未完成或未验证

- 微信后台事件字段配置、真实客户端实收/受限查询/eventId对账、上传发布均未做，本地wx stub通过不证明平台已接收。
- completion只有finished状态观察，无可靠“最后一场提交意图/首次完成”判据及paired completion漏斗；未改云合同扩大语义。
- 当前源码赛事分享hook已本地覆盖；没有送达回执，不能统计真实送达、取消或接收，真实微信分享旅程及后台实收仍未验。
- 跨会话/设备身份、7日成熟首笔率与可靠测试排除仍缺合同/证据；intent关联仅进程内限时。
- 真实微信运行时定时器、慢网、手机场景及后台留存/配额未验证；离线测试不能替代这些门禁，也不称第3项完整闭环。
