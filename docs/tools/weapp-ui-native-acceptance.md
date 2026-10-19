# 原生交互验收隔离工具

正式预热的AppService初始栈必须恰好一页；零页按原期限等待，多页立即拒签，不导航消除错误。launch返回后观察到的SDK exception跨连接保留并在marker/签名前拒绝，finally撤监听。native loadstop不代表SDK路由已完成；launch返回前事件盲区仍须Console核对。此门禁不修复SDK内部重复appLaunch，新版本现场启动须由主控单控制者协调，不能用已通过业务补验替代启动验证。

设备切换会自动销毁/重建AppService，旧SDK连接可能保持打开但RPC悬挂。430预热在首次精确5秒viewport读取超时时，仅当本次官方启动日志证明同一个exact项目/窗口出现更高代数且新的AppService进程，才在原180秒设备期限内断开旧连接、重连同一endpoint一次。重新确认原监听器进程/启动时间/安装/后台标志、源码、SDK/项目、原生容器就绪和真实非空页面；重连后必须重新读取两次一致的目标几何，之后才绑定新nonce并执行原有断开重连与来源检查。没有实例更替证据、进程/源码变化、预算不足或第二次超时均失败；不增加通用重试或设备等待时长。

用于当前VM的settings排程picker、share-entry成员认领及其真实导航。通过已签名会话连接官方SDK；Computer Use仍须按当前技能在受支持node_repl中初始化。产品处理器、原生picker、ActionSheet、Modal及设备几何保持真实；本工具不操作桌面、不选项、不确认弹窗。

## 入口

在当前exact checkout执行：

```powershell
. ..\vm-tools\Use-BadmintonVm.ps1
node scripts/dev/weapp-ui-native-acceptance.js --self-check
```

self-check只在当前单页launch启动隔离、验证探针并finally恢复，不开启弹窗、不允许业务写。需要已有当前来源的合法launch-signed session；任何来源/SDK/安装/marker失败都先停止，不自行预热、刷新或重绑。

在本地Computer Use的同一个node_repl中，通过Node `createRequire`按本机绝对路径加载：

```javascript
const { createRequire } = await import('node:module');
const req = createRequire('C:/path/to/exact-checkout/package.json'); // 换成实际VM仓库路径
const native = req('./scripts/dev/weapp-ui-native-acceptance.js');
globalThis.acceptance = await native.startNativeAcceptance();
await acceptance.open('settingsSchedulerBalanced');
await acceptance.inspect();
```

之后每个真实sky动作都放进 `await acceptance.step(async () => { /* 当前技能支持的sky调用 */ })`，保证动作抛错时自动进入清理。成功步骤间保留此对象和唯一session锁；不要并行运行doctor/ui:iterate、reset内核或另起控制器。需一次完成的流程可用 `await native.withNativeAcceptance(caseName, async acceptance => { ... })`，其finally无论正常、异常或取消都会执行finish。

完成一组后必须 `await acceptance.finish()`；该方法幂等。用户中止时先调用finish，再结束控制任务。进程/内核被外部强行终止不能声称finally执行过；原始快照保留在AppService，依据该run的 `owner-recovery.local.json` 调用 `await native.recoverNativeAcceptance(绝对文件路径)`。恢复仍严格核原会话和来源，不能将receipt改成新路径或新签名。若传输未知/恢复失败，保留guard与owner记录，停止GUI和预热，按[故障手册](weapp-ui-troubleshooting.md)处理。

## 外部终止后的同 owner 恢复

恢复前先将session、lock、owner-recovery和observations复制到新的证据目录并记录SHA256，不覆盖原件或内存快照。`recoverNativeAcceptance(ownerRecoveryPath)`仅允许在VM、原exact checkout与原签名仍一致时使用。入口核对run目录PID/nonce、observations来源与安装记录、session及原锁PID/创建时间；新run的owner文件另保存完整lockOwner。只有系统确认原owner不存在或PID已被不同创建时间的进程复用，才使用正式stale-claim状态机归档原锁。活跃owner、其他owner、查询失败、错源或并发claim一律拒绝；普通截图和ui:prewarm也不能接管native遗留锁。

恢复期间保留durable recovery barrier，只允许持有该精确claim的恢复连接，来源、安装、SDK、viewport、marker与Git检查仍全部执行。先确认同nonce的guard存在，再quiesce、回单页launch、恢复storage/globalData/SDK及原listener；核验watch/listener/native pending清零且guard状态已不存在后，才标记inactive、清除自身屏障并正常释放自己的锁。结果写同run的`recovery-result.local.json`，原锁归档保留。任何未知结果保留恢复证据并停止GUI与预热；不得强删锁、编辑receipt或先刷新源码签名。

2026-10-19认领组PID14080已按此顺序恢复；恢复前先在仓库外验证入口，保持dd658818原签名，09:36:06 UTC完成真实清理。之后才纳入永久修复，当前源码需重新签名才可继续GUI。具体证据见[VM迁移记录](../tasks/vm-migration-and-ui-acceptance-2026-10-18.md)。

## 状态、保存和确认

- `open(name)`：仅接受settingsSchedulerBalanced/Rest/Coverage、shareClaimFullNames和shareJoinOpenSlot；从生产case派生纯假赛事，经内存database加载，走原生产页面生命周期/view model，不setData伪造选择。先关闭未决原生弹窗再切case。shareJoinOpenSlot独立5/6人，保留3名guest；它的头像数量合同为5，原6人case仍严格为6。
- `inspect()`：只读返回当前页、profile/index/hint/busy、假成员ID/版本、来源8项检查、内存请求统计及原生SDK真实回调事件。原账号/storage/globalData快照值不写日志。
- 原生picker真实选中后，`await acceptance.armSave('rest')`（或balanced/coverage），再由sky点击真实保存。工具只允许当前假ID、真实页面刚选的profile、原M/C/名称/分值及非空clientRequestId的一次updateSettings；更改仅在内存假赛事，后续真实fetch/watch读回新版本。重复、未知或其他字段更改拒绝。
- 先执行列表取消、同名第二人modal取消及长昵称取消；保持未arm状态，必须写请求0、6人/归属/版本不变。准备隔离接受时，`await acceptance.armClaim('guest_ui_claim_2')`，再由sky执行真实选择及“这是我”。唯一许可请求必须为claim_guest、该唯一ID、claimConfirmed=true及当前版本。内存替换ID、保留人数/队别/搭档位置，不赋予管理权；不代表真实云事务验证。
- 普通加入：先`await acceptance.open('shareJoinOpenSlot')`，再显式`await acceptance.armJoin()`，由sky真实点击加入及列表末尾“不认领，以新成员加入”。只许可该5/6假赛事的一次action=join与精确假资料/clientRequestId；claim字段、管理字段、其他请求及重复追加拒绝。应从5人v1变6人v2，所有既有guest及位置不变，新成员不含claimedGuestId且不授管理。产品不会因为fixture arm而跳过真实选择。
  生产cloud.call会加入`__traceId`；普通join只额外接受其`joinTournament_<数字>_<base36后缀>`且最长96字符的运输字段，其他未知字段仍拒绝。`inspect().state.joinDiagnostics`仅对该假赛事记录字段名、arm/版本/容量及各谓词布尔值，不记录原账号/资料。回归必须经过真实生产cloud适配器构造请求，不能只直调wx.cloud而遗漏运输字段。
- `await acceptance.capture('rest-selected')`：保存真实App.captureScreenshot原PNG、hash、前后数据/来源及请求证据到 `tmp/native-ui-acceptance/<runId>`。原生overlay需另用sky按技能保存真窗口PNG，记录其hash与同一步骤。两者性质分开，不把全窗PNG冒充App.captureScreenshot，也不手改旧receipt。

## 隔离与恢复合同

`weapp-ui-native-isolation.js`作为单个函数在AppService执行：

1. 完整备份storage（含Date/二进制值）、globalData嵌套对象/集合/属性及原network listener数组，原SDK函数只在内存保存。原账号替换仅发生在虚拟storage/globalData中。
2. 所有sync/async storage读写使用虚拟副本；原storage在交互时不写。cloud.callFunction严格白名单、一次arm；database只提供假tournaments的get/watch，直接写、事务、未知collection/id均拒绝。HTTP、文件、socket、cloud其他网络及fetch/XHR/WebSocket入口拒绝，不调用原生产网络函数。报告/遥测也不透传。
3. 新SDK listener只登记本地；watch为可关闭的内存句柄。原生Modal/ActionSheet委托真实SDK，仅包装真实回调作审计和关闭后的失效保护；工具不注入选择/确认/取消结果。
4. 探针先核guard函数名，再调用本地nonce，避免误探原SDK。fixture假ID仅保留在内存backend。原生宽度/SDK不mock。
5. finish先quiesce关闭watch/listener；对尚未结束的弹窗调用清理专用fail/abort，避免遗留业务Promise和busy锁，迟到确认不再继续写入。此abort单独记cleanupAborts，绝不记作原生取消通过。再通过真实页面卸载/导航回单页launch清理页面timer/watch；全量恢复storage/globalData/listener，并从原数据重新投影launch。最后还原SDK函数、释放内存备份，verify来源和marker。安装失败亦回滚；丢失安装响应先查询同owner状态，不能假设没执行。
6. 非neutral、存储恢复失败或SDK恢复失败时不报告成功，尽力重装fail-closed guard并保留快照。报告 `guardsVerified` / retained / cleanup实际结果；不得删除owner、手填cleanupOk或调用原云来“验证恢复”。

隔离安装/交互期间必须guardsVerified=true。成功清理后guard已撤下，guardsVerified=false而sdkRestored=true、retained=false是正常恢复结果。六人preset的完整互动假赛事由生产view model规范化名称和场地（1场地）；不沿用静态投影中不合法的2场地，也不为通过保存而放宽请求校验。

假database返回的数组必须使用真实App的Array构造器。DevTools的`App.callFunction`注入函数中，数组字面量可能来自另一个执行域；业务的map/slice沿用该Array species，导致逻辑数据有成员、WXML却把名单视作空。`copy`从现有`app._networkListeners`取得业务Array构造器，只在复制fixture/storage数组时使用；不改产品页面、不补setData、不删头像数量断言，也不放行未知网络。跨域反例及修复见隔离测试；真实加载/PNG/finish闭环结果见任务外`vm-tools/native-claim-closed-loop.json`。

## 大屏的受控视口握手

本VM观察到官方auto启动新监听会回到先前设备。已安装官方miniprogram-automator 0.12.1的`ILaunchOptions`没有设备型号字段，Launcher调用公开`auto --project --auto-port`；不猜参数、不改DevTools内部设备配置，也不mock systemInfo。普通GUI编译已实测保留`getApp().__codexBackgroundCaptureSession`，不能保证清除source challenge；此前“普通编译→rebind签发”的交接撤回。热重载开关未显式配置，不能把保留实例的具体机制说成已证实。原source refresh门禁仍严格拒绝该情况。

改在正式prewarm内部、绑定新nonce之前等待真实目标视口：

1. 冻结源码、上组完整清理并备份原session。父协调仅允许该项目设备选择，本执行器持有唯一prewarm锁。
2. 使用正式官方启动参数，并设置`WEAPP_PREWARM_VIEWPORT_WAIT_MS=180000`、`WEAPP_EXPECTED_WINDOW_WIDTH=430`和`WEAPP_EXPECTED_WINDOW_HEIGHT=752`。启动、原生容器和AppService就绪按原门禁执行。
   启动总预算由`WEAPP_PREWARM_STARTUP_TIMEOUT_MS`配置，上限180000ms；VM包装器默认120000ms，可用`-StartupTimeoutMs`指定。起点在官方GUI/IDE服务启动之前，直到AppService实际ready；IDE、automation launch、原生容器均领取当时真实剩余时间（单阶段还受原operation timeout上限约束），容器阶段额外为AppService预留15000ms。每阶段打印elapsed/remaining/reserve/granted/minimum。AppService每次RPC前先捕获剩余预算，正式入口少于5000ms即明确报预算不足，不调用RPC，也不把不足时间夹成1ms。设备选择等待另有原180秒总期限，不重置启动预算、不增加重试；完成后的nonce/重连/来源校验仍执行。
3. 等日志明确输出`ui:prewarm awaiting real viewport 430x752`后，父协调local在当前exact项目真实选择设备；已保留目标设备则不重复切换。不点击编译、不再次auto/prewarm。程序只通过官方SDK systemInfo读取，宽高及完整几何连续两次一致才继续。Windows正式入口在首次精确5000ms超时时，按本页首段证明同窗口新AppService实例并在原期限内重连一次，清空旧稳定样本；无更替证据、第二次超时、断连、其他SDK错误及到期均拒签，不重置总期限。
4. 达到真实430×752后，仍在同一次官方launch控制流程中绑定nonce、断开重连，执行原marker/安装/项目/SDK/listener/viewport/Git/source稳定检查，并额外核height=752。全部通过才写正式session。没有手改receipt、删marker或放宽旧source refresh协议。
5. 签发后才运行ui:doctor、launch实图及隔离交互；若GUI选择导致SDK读取失败或视口未稳定，保留实际日志、释放自身锁并停止，不反复预热。

VM包装入口为`vm-tools/Invoke-BadmintonVmPrewarm.ps1 -ExpectedWidth 430 -ExpectedHeight 752 -WaitForViewport`；它与小程序源码独立，正式等待/签发逻辑在仓库prewarm脚本。390先用同一路径、实际390×671验证。当前430已完成签发、PNG、取消/布局，以及保存/最终认领/普通加入三组各一次隔离写入；具体来源和恢复证据统一见迁移记录，不把重连回归称现场执行。全流程不清缓存、不重启应用、不删用户真实草稿或storage。源码/安装/SDK/nonce/listener门禁不变，设备操作不替代大屏PNG与交互验收。

隔离工具仅支持上述明确页面和假数据，不覆盖真实云、真机、其他页面/接口。界面内容的浏览器替代图和后台setData都不能作为原生交互通过依据。完整视觉门禁见[UI验收](weapp-ui-acceptance.md)；当前运行结果和剩余项见[VM迁移记录](../tasks/vm-migration-and-ui-acceptance-2026-10-18.md)。
