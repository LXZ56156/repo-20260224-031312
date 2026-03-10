# 第 0 阶段基线审计

日期：2026-03-11

## 测试基线

- `node --test tests/*.test.js`
- 实际扫描到测试文件：`92`
- 首次全量运行结果：`91` 通过，`1` 失败
- 失败项：`tests/rotation.quality.test.js`
- 立即复跑全量结果：`92` 通过，`0` 失败
- 仓库内静态声明的 `test(...)` 用例数：`227`

说明：

- Node 内置测试运行器当前以“文件”为执行单元汇总，因此摘要里的 `tests 92` 对应的是 `92` 个测试文件。
- 仓库内显式声明的 `test(...)` 语句共 `227` 个，不是 `229`。

## 已确认成立

1. 页面同步壳层重复明显存在
   - `lobby`、`schedule`、`ranking`、`analytics`、`share-entry`、`match`、`settings` 都各自维护 `fetchSeq/watchGen/startWatch/fetchTournament` 的近似实现。

2. 高频写操作失败重试逻辑重复明显存在
   - `setLastFailedAction` / `clearLastFailedAction` / `retryLastAction` 和 `handleWriteError` 分散在多个页面与 action 模块中。

3. `schedule` / `ranking` 缺少网络订阅与弱网状态感知
   - 两页都没有接 `app.subscribeNetworkChange`，也没有 `networkOffline` 状态。
   - 两页仅有 `showStaleSyncHint`，缺少离线、缓存、同步中的统一表达。

4. `share-entry` 的 `identityPending` 可能长期卡住
   - `primeViewerIdentity()` 直接等待 `auth.login()`，没有超时与降级逻辑。
   - 当登录 Promise 长时间不返回时，主按钮会停留在“识别中...”。

5. `mine` 页首屏会被云同步阻塞
   - `onShow()` 先 `await profileCore.syncCloudProfile()`，随后才做本地资料与统计渲染。

6. `lobby` 的 `_sharePulseTimer` 在 `onHide` 未清理
   - 当前只在 `onUnload` 清理，页面隐藏后仍可能回写 UI。

7. `submitScore` 后端缺少比分合理上限校验
   - `cloudfunctions/submitScore/lib/score.js` 当前只校验非负、整数、非平局。
   - `cloudfunctions/submitScore/index.js` 未限制异常比分，如 `999:998`。

8. `joinTournament` 后端缺少最小资料兜底
   - 允许空头像、未知性别。
   - 新加入且昵称为空时直接生成 `球员N` 默认名，未对关键加入动作做最小资料校验。

9. `Lobby` 头像异步回写缺少 generation guard
   - `resolveDisplayPlayersAvatars()` 先复制当前列表，再异步回写 `displayPlayers`，旧请求可能覆盖新名单。

10. `Lobby` 当前为单次大 patch + 全量 `setData`
    - `lobbyViewModel.buildLobbyViewModel()` 输出单个大 patch。
    - `setTournament()` 直接 `this.setData(next.patch)`，没有 diff 或区域化 patch。

## 已复核不成立

- 暂无。

说明：

- `watch.js` 的“一个页面关闭 watcher 会立即 dispose 共用 channel”这一最直接风险，按现有引用计数逻辑并不成立。
- 但多页面同赛事的重入、重开、关闭顺序仍缺少专门测试，因此暂不判定“完全安全”。

## 需要在后续阶段通过测试进一步验证

1. `watch.js` 多页面共享 channel 生命周期隐患
   - 代码审阅显示基础 listener 引用计数是存在的。
   - 但缺少覆盖“多页面同时监听、先后关闭、重新打开”的契约测试，需在第 1 阶段补 `watch.multi-page-lifecycle.test.js` 后再决定是否修。

2. Lobby 角色视图收束方案
   - 当前确实混排，但需要结合 `lobbyViewModel` 和页面模板一起验证最小改法，避免动到玩法语义。

3. `cloneTournament` 在 `squad_doubles` 下的用户预期问题
   - 代码中复制后把所有 `squad` 清空，需结合现有业务流和测试确认是 Bug 还是刻意重置。

4. 裁判能力边界
   - 后端 `setReferee` 已存在，前端样式中也有相关痕迹，但当前入口是否“半启用”还需结合 `settings` 模板与权限流再确认。

5. `rotation.quality.test.js` 基线波动原因
   - 第一次全量运行失败，第二次立即复跑通过，当前更像波动性红灯。
   - 第 0 阶段不处理该测试，只记录为后续全量回归时需要持续观察的基线项。

## 第 0 阶段扫描范围

- `miniprogram/core/tournamentSync.js`
- `miniprogram/sync/watch.js`
- `miniprogram/core/cloud.js`
- `miniprogram/core/actionGuard.js`
- `miniprogram/core/profile.js`
- `miniprogram/pages/lobby/*`
- `miniprogram/pages/match/*`
- `miniprogram/pages/schedule/*`
- `miniprogram/pages/ranking/*`
- `miniprogram/pages/share-entry/*`
- `miniprogram/pages/create/*`
- `miniprogram/pages/mine/*`
- `miniprogram/pages/settings/*`
- `cloudfunctions/startTournament/*`
- `cloudfunctions/submitScore/*`
- `cloudfunctions/scoreLock/*`
- `cloudfunctions/joinTournament/*`
- `cloudfunctions/cloneTournament/*`
- `cloudfunctions/setReferee/*`
- `tests/*`
