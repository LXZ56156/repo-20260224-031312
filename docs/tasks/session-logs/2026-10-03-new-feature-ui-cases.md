# 新增功能截图用例：本地准备回执

本轮仅补齐新功能的截图 registry、直接测试和本日志。工作区为 `D:\projects\badminton-miniapp\main`，保留既有脏树；没有改产品源码、其他测试或已有日志，没有部署或生产写入。

## 用例与 runner 合同

新增12例，均采用通用 `data/setData` 注入路径：

| 功能 | 用例 |
| --- | --- |
| 我的比赛 | `tournamentList`、`tournamentListEmpty`、`tournamentListError`、`tournamentListLoading` |
| 提前结束 | `scheduleManualFinishReady`、`scheduleManualFinishBusy`、`scheduleManualFinished` |
| 协管大厅 | `lobbyCoManagerOwner`、`lobbyCoManagerOwnerBusy`、`lobbyCoManagerMember`、`lobbyCoManagerRevoked` |
| 协管配置 | `settingsCoManager` |

列表有进行中/未开赛/已结束、主办/参赛/双角色和长名称。提前结束代表状态有1场21:17有效完赛、1场待录分，以及完成后保留比分、取消剩余场次、显示“已提前结束”和排名/分享入口。协管大厅数据由现有纯 `buildLobbyViewModel` 派生，包含主办、已有协管、可授予的绑定成员及不可授予的guest；撤销后管理能力消失，参赛录分能力保留。设置页代表协管可编辑草稿且 `isAdmin=false`。

没有 `fixture.methods`、按钮点击、角色存储注入或远程素材。模拟busy仅是显示数据，不会调用 `finishTournament`、`manageCoManagers`、保存或重试。新用例不固定窗口宽度、不放松全局receipt合同。runner默认使用普通页 `reLaunch`，收尾仍重建单页neutral launch。

发现列表页面使用 `_requestSeq`，原通用隔离未覆盖，可能让晚到只读回包覆盖注入数据。已通知主代理；主代理在 runner `generationKeys` 加入 `_requestSeq` 并导出真实 `isolatePageDataRuntime` 测试接口。本轮测试挂起真实列表controller的 `getPage`，执行真实隔离函数、注入空态、再返回晚到分页回包，验证数据保持空态且没有调用业务方法。此为离线执行证据，不是真实DevTools或云引擎证据。

runner 的 selector 合同只接受正数节点计数，不支持 `expectedCount:0`。新增用例只声明实际存在的节点；隐藏的主办专属按钮/协管卡通过真实VM角色派生测试验证，未伪造负数/零节点截图合同。直接调用 `validateSelectorCoverage` 检查新增计数合同可被真实runner接受。

## 验证

- 原26项直接测试先复现1项失败：`pages/tournament-list/index must have a tracked screenshot case`。新增需求断言后复现5项缺失用例失败；之后补实现。
- 最终 `node --test tests/weapp-ui-screenshot-cases.test.js`：**31/31通过，0失败/跳过**。全页面registry覆盖恢复；列表展示和真实 `getPage` 映射一致，收赛状态/有效比分和真实 `applyTournament` 派生一致，协管角色和真实VM一致。
- `node node_modules/eslint/bin/eslint.js scripts/dev/weapp-ui-screenshot-cases.js tests/weapp-ui-screenshot-cases.test.js`：**0错误、0警告**。首次使用 `scripts/run-eslint.js` 带文件参数发现它仍跑全仓，暴露本测试2处裸 `structuredClone` lint错误；已改用 `globalThis.structuredClone`，最终定向检查通过。全仓既有35项warning未在本轮范围处理。
- `node scripts/dev/weapp-ui-screenshot.js --list`：成功列出新增用例，未连接或启动DevTools。
- 定向 `git diff --check`：通过。

## 待真实验收

当前DevTools安装更新仍卡住，本轮**没有真实截图、candidate PNG、黄金图或截图通过receipt**。fixture存在和离线测试通过只代表用例准备完成。

恢复独立DevTools会话后，仍需320/390/430宽度的真实图像与人工像素复核，尤其确认长名称、busy/disabled样式、safe-area及协管卡的可视区/滚动位置。协管卡位于名单之后，节点存在或非零几何不代表该卡已进入截图可视区。提前结束的原生确认modal确认/取消、真实身份/云事务/双手机权限与录分竞态仍待真实环境验证。没有操作安装器，也没有以离线结果替代这些验收。
