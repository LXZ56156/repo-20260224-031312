# VM 迁移与调试基础库验收

## 最终验收结论（2026-10-19，覆盖下文历史待办）

VM工具链与隔离原生工作流已迁移。390正常机型已完成排程偏好/保存、认领取消/最终确认和普通加入。430×752/font16/iPhone15ProMax在原16张取消/布局图基础上，补完三组真实UI写入：设置一次updateSettings后重开仍rest/index1/version2；满员第二guest一次claim_guest绑定、6人不变/version2、其他成员和创建者不变；普通加入一次action=join从5→6/version2，原五人及guest保留，新成员不含claimedGuestId。均不授管理权；canConfigureSettings的原草稿合同未改。所有写入仅隔离内存backend，不代表真实云通过。

三组原始账本为tmp/native-ui-acceptance/2026-10-19T16-28-34-015Z-5864-28c295d4、2026-10-19T16-32-21-346Z-5864-6f18a6fd、2026-10-19T16-34-36-224Z-5864-1b3388f3；源码任务逐项核原observations/owner记录：每组一写、v1→v2、owner inactive，storage/globalData/SDK/neutral全部恢复，watch/listener/nativePending/cleanupAborts为0、retained=false、来源8/8。最终doctor8/8、本地线程completed/idle。断线发生在写入/恢复后，没有重复arm或提交。九张映射图已逐张view_image核对。

本轮完整验收源码manifest为6ba50d7f3c9119018758d2ccd63e127264913d0aead7ae8fff5a5c507a923072，16:23:40.799UTC正式签发。新session保全和launch原图/receipt在任务外430-write-completion同前缀证据；doctor8/8、原生430×752/font16、SDK3.17.4。早期取消组5f27cfbe签名及原receipt原样保留。其后仅验收/脱敏文档更新，不重做GUI、不改receipt；提交后Git来源变化另记，不能称旧签名覆盖新HEAD。

官方本地线程的受支持Computer Use接续满足点击需求；durable自身native挂载仍缺失。VM只读手机USB枚举0，无线配对/未插线状态未核；开发/体验/正式和默认项目共用原生产环境，未找到独立测试云入口或VM CloudBaseCLI，不能据此断言云端不存在测试环境。没有读取真实用户数据、复制凭据、新认证/权限、创建环境、preview/upload/deploy。真实手机/云事务/身份/规则/并发、320小屏和大字仍未验。重连恢复分支只有65项直接回归，成功430现场未触发。

### 图中两条启动错误的准确诊断

只读Console已取得原文：appLaunch with non-empty page stack，以及对应SystemError(appServiceSDKScriptError)/Page route错误。显示的错误组时间2026-10-19 16:23:30UTC；各条独立时间没有显示，来源为SDK3.17.4的WAServiceMainContext/WASubContext，不能用“无业务帧”证明无害。不是隔离期预期拒绝；它发生在16:23正式预热、三组业务补验之前。

官方生命周期日志同窗口记录16:23:07.928 init、08.593 reload、10.576 loadstop，再23.261 reload、24.030 loadstop；本工具仅一次官方auto。安装SDK的Launcher源码只spawn一次auto并connect/checkVersion，prewarm签名前没有路由操作，业务App.onLaunch也没有导航。vendor的onContainerInited异步hook完成后会reload，独立compile路径也会reload。上述可证明外部启动生命周期包含两次reload；究竟哪条内部路由消息造成重复appLaunch尚未被完整协议日志证明，不能断言改个等待即可修好SDK。

本次prewarm在24.222发只读AppService探针，34.307收到一次vendor桥接超时，34.335探针返回pageCount=2仍被旧门禁接受，35.424绑定marker、40.799签发。这确认工具把非空多页初始栈误当启动就绪，是可修的签发缺口；原生webview loadstop也不能单独证明SDK路由完成。旧签发只证明当时其余来源检查通过，不能证明启动无异常。

最小修复仅收紧预热工具：正式新启动和设备替换后的AppService必须pageCount=1，多页立即拒签，不轮询/导航清理来掩盖；0页仍按原有期限等待。探针只记录无query的pageRoutes。官方launch返回后即订阅SDK exception事件，首次异常跨连接保留，在容器/ready/marker/签名前拒签，finally解除监听。没有增加launch、重试、延时或改SDK/业务。它保证不接受已观察异常和已知多页状态；launch返回前的异常可能未被事件捕获，仍需Console时间核对，不能称零错误证明。

离线反例先复现多页被接受，再覆盖双页拒绝、单页成功、异常跨连接保留/清理和替换连接多页拒绝。175/175关联回归通过，check通过，lint0错误/35既有警告，diff通过；结果在任务外launch-stack-gate同前缀记录。**尚未现场验证新门禁，也未修复外部SDK内部竞态。** 原三组业务在后续中立单页下隔离执行并恢复的账本事实保留，但它们不能反证预热无错；不重复这三组写入。

现场阶段方案只需主控先协调一个控制者：冻结源码/备份原session，现有local仅观察；一次官方430预热，记录启动前后Console时间与计数、新guard日志和pageCount/pageRoutes。只有单页、无已观察异常、原来源/SDK/几何/nonce全校验才签发；否则保留失败、不重试或清日志。终态后只读查Console，若仍有新同类错误则按SDK限制交付，不改vendor或强行修栈。此阶段未执行，不把离线回归当现场启动通过。

### 验证与交付授权

Windows全量2032/2032通过、0失败/跳过/取消；首次旧静态launch断言失败后只改测试，69项关联及完整复跑通过。运行和业务代码此后未变，补验后仅跑相称的隔离/恢复/来源回归及check/lint/diff，结果在任务外430-post-acceptance日志。原始快照、机器日志、绝对私人路径和私有配置不入Git。用户随后明确批准提交并推送至LXZ56156/repo-20260224-031312 master，远端预核仍e0b4bdf无新增提交；按精确范围提交、不force，不授权部署。历史下文的待验与排障动作不代表当前状态。可复用合同见[原生验收工具](../tools/weapp-ui-native-acceptance.md)。

## 范围与来源

用户于 2026-10-18 授权新任务在重连的 VM 完成开发/截图环境迁移，并恢复原生截图验收；不操作宿主机 LZX，不再新建任务。2026-10-18 18:09 UTC 用户提出“那直接升级行不行”，随后确定采用正式调试/截图基础库升级路线。项目 `libVersion` 从 3.14.2 升至 3.17.4，VM 忽略的私有配置及本次显式验收期望一致；不修改手机后台最低兼容版本、业务依赖或产品功能。

官方 [基础库更新日志](https://developers.weixin.qq.com/miniprogram/dev/framework/release/) 列出 3.17.4（2026-09-05）。[项目配置](https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html) 的 libVersion 为调试基础库，私有配置优先；真实客户端兼容性按 [兼容性指南](https://developers.weixin.qq.com/miniprogram/dev/framework/compatibility.html) 独立验证。DevTools Stable 发行渠道与 SDK 的实际 public/gray 状态不同，尚未取得 VM 可选 SDK 列表，不猜测旧版未生效原因。

## 实际 VM 环境

- 机器 VM / VMware20,1，Windows 11 家庭版 25H2，10.0.26200.9711；PowerShell 7.6.5。
- 独立仓库 `<VM_TASK_ROOT>/badminton-vm`；起始 master `e0b4bdfddf9d7b8ac5ff5bd570efc3d74b87b0c7`，开始时 tracked clean。
- Git 2.55.0.windows.3 / Git Bash 5.3.15；任务内官方 Node 24.19.0 / npm 11.17.0；现有原生 Python 3.12.14 的任务内 python3 命令入口。
- 官方 Stable DevTools 2.02.2608080，安装目录 `..\vm-tools\wechat-devtools`，安装包 Tencent 签名 Valid；用户明确同意协议/UAC并完成 UAC 点击及服务端口启用，官方 islogin 返回 true。未复制其他电脑凭据或创建 MCP token。
- root 与 miniprogram npm ci 按各自 lockfile 安装，Vant 1.11.7 不升级；npm 构建生成物与原仓库一致。
- `Tool.getInfo` 与 systemInfo 均实测 SDK 3.17.4；iPhone 12/13 (Pro) screen 390×844、window 390×671、pixelRatio 3。

## 兼容性与证据合同

官方跨版本变化涉及 input/textarea、键盘、scroll-view、tabbar 和组件行为，本轮优先复查长昵称/emoji、picker/弹层和滚动。静态筛查未发现业务使用已下线的 official-account-publish/shareToOfficialAccount 旧参数，也未发现付费 httpDNS、audioMode、componentExport 的使用；不据此宣称原生回归已通过。

截图工具已按 env/session 严格比较具体 SDK，不改校验代码。历史 SDK、截图 manifest 和旧 receipt 不改；`tests/weapp-ui-screenshot-tool.test.js:212` 旧 SDK 来源拒绝用例及其他版本 fixture 保留。原先“只改 expectedSDK 再签发”被自动审批拒绝，未执行；本次是明确变更项目基线后重新验证、重新编译和新 launch-signed 预热，不复用旧证据。

Windows 升级前基线：npm test 1981/1981 通过、0 失败/跳过；check 通过；lint 0 错误/35 警告。旧 3.14.2 预热共三次失败，包含一次 rawPath/pageMeta 原生错误；未产生正式 PNG/receipt，不将该错误视为已修复。

## 验证顺序与当前状态

1. 同步公共/私有调试配置、显式 SDK 期望和本记录，保留所有门禁。
2. 重新运行 Windows npm test/check/lint 与 npm 构建，再以官方项目打开/编译流程应用新配置。
3. 从唯一 ui:prewarm 入口建立 exact checkout 的新 launch-signed 热会话；端口由操作系统分配后验证未占用，不扫描或猜端口。
4. 正常机型 ui:doctor、ui:iterate launch，核对真实 PNG、per-case receipt 和 manifest，主控亲看后继续偏好 picker、认领选择/二次确认、取消、满员、同名长昵称；再大屏。320 小屏/小屏大字不恢复优先级。
5. 测试和截图串行，同一模拟器单一控制者；fixtures 隔离/清理、源码/安装/SDK/viewport/marker/Git 校验不放松。真机和真实云另列未验。

升级后实际结果：首轮全量 1981 个具名用例通过，但额外出现 waterSession.v2-page 文件级失败（总计 1982、失败 1，222.22 秒）；未确定原因，不宣称该轮通过。该文件定向 79/79 通过；完整 TAP 复核 1981/1981 通过、0 失败/跳过（226.46 秒）。check、lint 和本地 npm 构建退出 0，lint 0 错误/35 警告；构建仅两处空白差异已审查恢复，没有更改锁依赖。日志为 `tmp/vm-sdk-upgrade-test.log`、`vm-sdk-upgrade-water-retest.log`、`vm-sdk-upgrade-test-confirm.log` 和同前缀 check/lint/npm-build 日志。

原生会话与截图验收继续按上述门禁执行；结果须以本轮实际 session、PNG、receipt、manifest 为准，不从静态回归推断通过。Computer Use 已安装启用但当前没有技能要求的 node_repl 入口；仅使用支持的官方 CLI/automator 入口，不另启控制 helper。

升级后的首次正常机型 launch-signed 会话已通过。首次 cold auto 超时后，只读确认运行时就绪，再一次受控预热成功；随后 doctor 仅 marker 缺失、sourceSnapshot 等其余检查通过，按故障手册同源码 marker-only 分支显式 refresh 后 doctor 全通过。launch、settings、shareDraft、lobbyGuide 的真实 App.captureScreenshot frame PNG 均通过来源/PNG/隔离清理/整批发布门禁，运行时异常 0，执行代理已逐张查看；不代表主控/用户完成验收。

初始 settings fixture 未启用新偏好字段，shareDraft 未含 guest，所以这四张只作基础链路证据。仅在截图 registry 新增 settingsSchedulerBalanced/Rest/Coverage 和 shareClaimFullNames 隔离数据：偏好标签由现有 settings view model 派生；满员数据保留两个同名但不同 ID 的 guest 和一个长昵称，不自动认领。两项直接回归在旧 case 缺失时失败，补数据后关联 50/50、影响测试 103/103 通过，lint 0 错误/35 警告，diff 检查通过。不改业务源码、依赖或 SDK 合同。新状态的实际截图仍按本轮独立 receipt 验证；原生 picker/ActionSheet、二次确认/取消和大屏切换仍需可用的受支持原生控制入口。

任务外可复用启动脚本为 `..\vm-tools\Use-BadmintonVm.ps1`，完整本地环境/安装和工具诊断见任务根目录 `VM-MIGRATION.md`、`vm-validation-final.json`。这些文件包含本机路径与阶段日志，不作为跨机器已验证证据。此任务不包含云部署、mp:preview、mp:upload、发布、生产写入或 GitHub Actions。

## marker 排查与 fixture 校正

主控已查看此前四图。settings 的“已完成”来自 settingsReady，表示参数设置完成，不代表赛事 finished；赛事 fixture 是 draft。旧 fixture 却缺 settingsConfigured=true，已以失败回归复现并补齐，保持两个字段一致。业务 WXML 编辑入口/保存按钮检查 draft；现有测试把赛事切到 running 后调用 saveSettings，云写入次数为 0。未修改业务保存逻辑或用户文案。lobbyGuide 仅为空 players/未设置字段的引导布局，不代表真实赛事数据验收。

新增 fixture 后的失败停在 reconnectMarker，SDK/viewport/route/安装归属均通过；Git sourceStableDuringPrewarm 比较在该失败之后，不能误称 Git hash 不匹配。只读三次快照确认 App/home 可用但 marker 持续缺失。官方 IDE 日志在该次时段记录 AppService compile/restart 和 18:44:55 UTC reload；旧失败无精确绑定时刻，不能仅据此断言完整因果。

已复现确定的 readiness 缺陷：旧实现将空 getCurrentPages() 数组当 ready。最小修复要求非空栈且当前页有真实 route 后才构造/绑定 nonce，仍仅轮询有效 not-ready 状态，传输错误立即失败，不增加 launch/marker 重试。新增就绪/绑定时间及失败 marker hash 诊断；任务外 VM helper 移除多余 CLI open，保留官方 automator.launch(auto --project) 唯一启动流程。预热门禁相关 21/21、设置/截图相关 67/67 通过；修复后完整 TAP 1984/1984 通过、0 失败/跳过（221.34 秒），日志为 `tmp/vm-marker-fix-full-test.log`。当前源码新状态仍待真实预热/采图验证，不以离线测试替代。

## 最终采集前的来源冻结记录

带时间诊断随后确认直接触发链：19:03:02.668 UTC marker 绑定成功；19:03:06.815 官方 IDE 日志记录 .git、tmp 父目录事件触发 compile onFileChange；19:03:07.077 AppService reload。原 watchOptions 只有 tmp/** 和 .git/**，未匹配父目录本身，预热写入 receipt/日志及 Git 刷新反而触发热重载。CLI auto 已在 19:02:38 返回，故不是等待 CLI 退出可以解决的问题。此后同源码 marker-only 显式刷新曾通过 doctor，未把刷新冒充旧 marker 一直存活。

最小配置修复仅补 tmp、.git 两个父目录字面匹配，保留既有子项与 node_modules 规则；回归确认 miniprogram（含其内部 tmp）、cloudfunctions、scripts、docs 和项目配置仍被监听。按 [官方 watchOptions](https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html#watchOptions) 说明只重开本项目窗口应用规则，未重启整个应用。

第一次五 case 批次中 launch、满员预览 candidate 通过，三档偏好因目标滚动超出短页上限失败；整批未发布，旧 finals 未动，五 case 的 fixture/storage/SDK 恢复均通过。滚动修复读取官方 SDK Page.size() 的真实 document.scrollHeight，计算可达目标，仍要求实际 scrollTop 到达该目标且整张目标卡片完整可见；未知几何/传输失败/未到目标继续拒绝。父目录与短页反例先红后绿，相关 115/115 通过，最终 Windows 全量 1986/1986 通过、0 失败/跳过（226.21 秒），日志 `tmp/vm-watch-scroll-fix-full-test.log`。

以上为最终采集前冻结的源码记录；此后的 PNG、receipt、marker 持续性和发布结果统一写入任务根目录本地结果索引，避免逐条改源码使来源签名失效。原生 picker/ActionSheet 操作、二次确认/取消、大屏及真实端验收仍独立判断，不由隔离预览图推断通过。

## 原生容器二次重载

父目录排除生效后仍出现独立重载：19:21:54.868 UTC marker 已绑定，19:21:56.658 AppService reload，之前没有文件变更事件。只读检查当前官方安装的 AppService 模块及其 hooks：onContainerInited 等待调试器连接结果（其内部超时为 15 秒），完成后调用 reload；首次 compile 可在此 promise 未结束时先加载页面。因此非空页栈只是必要条件，不能证明容器初始化已结束。

新增 Windows 只读启动屏障：从唯一已选 CLI 安装哈希对应的 WeappLog 目录，在唯一 automator.launch 之前截取日志游标；只接受本次新增、精确项目路径绑定且无歧义的原生窗口，等待容器完成后的 reload/loadstop，再检查真实 AppService API/页栈并构造唯一 marker。历史日志或临时 compile 的 loadstop 不放行；歧义、文件读取错误或既有启动期限耗尽均失败。不增加固定等待、重试、marker 重绑或 SDK/来源合同例外，不执行日志里的代码。

先用源顺序回归复现失败，再完成关联 28/28 回归（包含 UTF8 增量、历史游标、同名路径前缀、多窗口歧义、后续初始化失效和期限/错误）。最初普通沙箱运行中三个本机 HTTP 测试 EACCES；授权 VM 本地测试环境下 28 项全部通过。实际失败日志重放：03:21:45.663+08:00 loadstop 被拒绝、03:21:56.874+08:00 最终 loadstop 放行，对应 `tmp/vm-native-container-historical-proof.json`。新完整测试、热会话及截图结果继续写任务外本地索引，避免采集时改变源签名。

本轮实际预热还发现官方日志启用晚于容器创建：新日志仅从首次 loadstop 开始，故初版屏障拒绝签名（未绑定 marker、未写新 receipt）。并非可安全直接合并的跨文件证据。新增直接失败回归后，补充同一文件/窗口的可证序列：首次 loadstop 仍拒绝，普通 restart→reload→loadstop 仍拒绝，只有已观察首次加载之后的无 restart 钩子 reload 及其后 loadstop 才标记容器完成。真实日志 20:02:53.994 UTC 首次 loadstop 拒绝，20:03:02.620 reload 后仍拒绝，20:03:04.445 最终 loadstop 放行；`tmp/vm-native-container-late-log-proof.json` 留存重放结果。此前版本完整复核 1992/1992 通过（首轮 1991/1 排程超时、单文件 14/14 通过，均留日志），本次补充分支关联 29/29 通过，新完整结果在本地索引记录。

## 设置卡片滚动验收断言

在 source266ca795 的正常机型会话中，launch 已正式发布且来源校验通过；四个功能状态批次中满员候选通过、三档偏好滚动超时，故整批未发布，失败候选和 receipt 保留在 tmp/ui-runs/simulator-frame/2026-10-18T20-12-21-194Z-15248-dad7541e。20:16–20:18 UTC 通过同一已签名会话/原隔离流程实测三档：卡片 top=119、height=504.5、bottom=623.5，窗口高671，文档高753，无 scroll-view；视觉稳定前后相同。官方 wx selector query 和 getWindowInfo 独立复核相同边界。请求滚到82或753仍观测scrollTop=0；753−671得出的82只是计算界限，不能宣称已测得真实最大滚动范围。

确定的工具问题是把进入可见区域误定义为强制对齐到12px；卡片本已完整可见，无需额外滚动。最小修复对原点已完全可见的卡片请求0，否则保留原有可达目标和严格到达断言。新增原生 boundingClientRect/viewport scrollOffset 实时证据，并在视觉稳定后再次核对完整可见、原生滚动值及卡片高度；裁切、尺寸变化、API失败继续拒绝。两个反例先红后绿，结果见 tmp/vm-scroll-visible-red.log / green.log；三档原始诊断在任务外 vm-tools/settings-scroll-three-profiles-original.json，原生交叉核验在 settings-scroll-real-geometry.json。没有改业务布局、产品逻辑或fixture字段来隐藏问题。

此前最终启动屏障全量1993/1993通过（218.91秒）、check/lint/diff通过。当前滚动修复产生新来源签名，关联/完整测试及重新预热后的正式批次结果只写任务外索引。静态偏好/满员图不代表原生 picker、认领选择/二次确认/取消或大屏已经验收。

## 重连后的自动化桥接启动超时

2026-10-19 重连实测原12项改动及 d7bfdbf4 源签名未变，但 DevTools 已退出、旧端口不监听。主控交接独占权后，官方预热两轮均完成原生容器屏障，随后在唯一的 `App.callFunction(inspectAppServiceReady)` 就绪探测阶段返回 `timeout waiting for automator response`；不是连接、marker绑定或签名重连读回失败。官方本地代码确认该错误来自桥接层10秒等待，早于脚本原有60秒启动期限。无新marker/receipt生成，旧证据保留。

新连接的同一探测12ms成功；无marker的逐RPC最小复现中，原连接10次合法探测、5791ms后真实App/单页路由就绪，未出现永久连接失效。因此具体故障点已确定为启动中的桥接响应，但更底层偶发原因未完全证明。最小修复仅在原生屏障已验证且仍处原启动期限内，对精确桥接超时允许一次只读探测复核；不重新launch、不延长期限、不吞其他错误，第二次同错立即失败。所有API/非空路由/唯一nonce/重连读回/安装与Git来源检查仍必须通过。

新增回归覆盖一次恢复后仍须真实就绪、无原生证明时拒绝、第二次同错拒绝、期限耗尽和其他异常立即拒绝；失败日志、最小RPC时序、完整测试与新签名实图结果见任务根目录 `VM-RECONNECT-20261019.md` 和 `vm-tools/` 对应记录。原生Computer Use入口缺失独立保留，未重复旧弹窗探针，未升级RC或写生产数据。

## 原生交互的内存后端

主控后续已在既有本地线程恢复受支持node_repl/@oai/sky，并取得当前DevTools真实只读窗口图；原生交互尚未开始。为其补最小隔离工具，覆盖实际settings/share-entry的cloud.callFunction、database get/watch、其他网络入口及完整storage/globalData/listener/SDK恢复。业务写默认拒绝，明确arm后仅许可一次假赛事保存/认领；真实原生事件不mock。未知接口无生产透传，安装失败、异常、取消和丢失安装响应均走可靠清理；不确定结果保留owner/guard。

代码与可执行命令见[原生验收隔离工具](../tools/weapp-ui-native-acceptance.md)。关联回归含实际settings保存/memberClaim决策处理器、未知请求拦截、watch释放、原始storage/globalData恢复及失败回滚；完整测试、新合法签名和VM安装/清理自检结果写任务外本地交接索引。未修改产品规则、环境ID或生产配置，没有远端推送；正常/大屏原生最终验收仍由主控排程。

## 认领组外部终止后的恢复（2026-10-19）

本地GUI在`2026-10-19T09-25-11-429Z-14080-fe658052`组加载认领页期间超时重置，没有执行认领选择。VM系统查询证明原PID14080不存在，原锁创建时间`134368717791706424`及run目录/nonce/来源一致。先将原锁、session、owner与observations备份到任务根`vm-evidence/native-orphan-recovery-20261019T093257Z`并保存SHA256；未覆盖内存快照，未强删锁。

正式恢复旧入口被stale锁阻断。先在仓库外验证专用恢复状态机，保留原`dd658818baf22d1a51df06eb3f70f25e091585747ef19f47b3c90132f85fd561`签名，使用现有原子claim、durable屏障与stale归档入口。09:36:06 UTC真实恢复完成：前后8项绑定全通过，storage/globalData/SDK/中立页刷新均true，watch/listener/native pending为0，guard状态不存在，retained=false，owner inactive，屏障清除且锁正常释放。结果在上述备份目录`recovery-result.json`；旧lock以`.lock.stale-4fef681314a2848b8a8c487634c06f4dcb12328b6606fe7c`保留。

之后才将修复纳入`weapp-ui-native-recovery.js`与正式入口，补死亡、活跃、未知、错源、其他owner、并发、PID复用及源码变化回归；普通预热也拒绝接管native遗留锁。原8项来源/SDK/viewport/marker合同不变。新增代码后须重新签名，未自动预热或恢复GUI。完整Windows2018/2018通过、check通过；随后仅修正finally异常收尾并补锁释放失败回归，最终关联76/76通过、lint0错误/35既有警告、diff检查通过，未再重复全量。全量和最终检查分别在任务根`vm-tools/native-orphan-recovery-validation.json`与`native-orphan-recovery-final-validation.json`及同前缀日志。

当前认领组内存业务写0、native事件0，拦截网络3次；不代替此前排程组的真实picker/保存证据。已恢复排程组的`settings-result.json`记录`manageActivityId/getOrCreate/__ui_scheduler_balanced`被拒绝；当前认领组请求账本未出现该cloud调用。代码定位在lobby动态分享`prepareDynamicShareMessage`，`getOrCreate`涉及资源创建，不能直接当作合法只读响应加入白名单。其与认领页超时的因果关系未证实；后续只能隔离诊断，不得生产透传。正常/大屏认领交互、真机与真实云仍未验。

## 认领加载的数组执行域修复

在恢复后保持本地GUI暂停，用原签名22445d8b的单控制器脚本对照RPC。settings路由4939ms、ready355ms、视觉稳定650ms；claim路由5024ms及数据库读取成功，却在`ready:.participant-avatar-img`约10秒超时。两组finally均完整恢复、来源8项通过，未遗留guard/锁。诊断文件在任务根`vm-tools/native-claim-diagnostic/run-1792403445706.json`。

继续只读采样发现真实share-entry逻辑数据有6名成员、joinAllowed=true、participantPreviewList长度6，但实际WXML名单分支为空，PNG显示“还没有参赛者”。只读类型探针证明SDK注入域的`[]`不是业务App的Array实例。隔离copy创建了该域数组；生产map/slice沿用其species，造成名单无法渲染。最小跨域反例先失败，再仅将copy的数组分配改用现有App listener数组的构造器，保持所有原DOM数量、来源与网络拦截合同。23项隔离/恢复关联回归、lint（0错误/35既有警告）和diff通过；未重跑无关全量。

最终源码重新合法预热后的claim单页加载、原SDK PNG、数据/DOM/类型读取与finish验证，由任务外`vm-tools/native-claim-closed-loop.json`保存实际结果；其脚本不执行原生点击。此闭环只证明页面可交接，不替代原生认领取消/确认与大屏验收。

## 普通加入与大屏交接

主控后续报告：真实认领组取消、同名/长昵称确认取消均0写6人v1；最终仅一次内存claim_guest绑定guest_ui_claim_2，6人v2、不授管理，恢复来源8项全true且无锁guard。该结论属于本地GUI证据，不扩展为真机或真实云验证。

补独立5/6人shareJoinOpenSlot fixture及armJoin。严格action=join只追加一个假账号；保留原5人/guest/位置与creator/coManagers，拒绝claim或管理字段注入、未arm和重复请求。最小反例先失败，普通加入/隔离恢复及390→430×752视口两阶段关联78项通过，最终lint/diff与可交接加载证据保存在任务外同名前缀记录，不重跑无关全量。

本地GUI已实测iPhone15 Pro Max430×752，但官方auto预热回退到旧设备，viewport=false正确拒签。已核本机官方SDK的公开launch类型/实现无设备型号参数，不使用未支持配置。复用现有强制challenge→真实编译→稳定实际视口验证的`--rebind-viewport`流程；详细步骤只维护在[原生验收工具](../tools/weapp-ui-native-acceptance.md#大屏的受控视口握手)。先建立冻结源码390正式基线，再交父协调真实430选择、challenge后同窗口编译，最终430签发必须实测通过。此阶段不提前声明大屏完成。

命令联调补获npm脚本固定`--refresh-session`前缀与`--rebind-viewport`组合被旧解析器拒绝；最小反例先失败，再仅规范化该明确组合，仍拒绝非正宽度及额外选项。原签名算法和视口校验不变。该末尾修正沿现有ui:iterate的source challenge/官方编译/重签流程更新390基线，不重复auto预热，保留最初launch来源供430握手审核。

### 普通编译保留实例后的流程修正

父线程10:31现场证据证明普通编译后challenge仍存在，source refresh正确拒签；doctor其余7项通过而sourceSnapshot=false。marker存于getApp().__codexBackgroundCaptureSession，不是临时页面对象；本机未显式设置热重载标志，不能断言编译为何保留实例。前述依赖普通编译清除marker的提议撤回，不再重复这一GUI动作，也不删marker或改receipt。

补正式prewarm的有界真实视口等待：官方启动完成后、nonce绑定前等待实际宽高连续稳定，再原样完成launch来源、nonce重连、安装/SDK/listener/source校验，额外核目标高度。390用同一路径先现场验证，以便普通加入；430再由父协调在明确等待日志后选择设备，不编译/再次启动。关联回归保留“marker留存即拒绝compile证明”，覆盖等待中的旧设备、宽高/几何漂移、超时和SDK错误。结果在任务外native-viewport-startup-wait同前缀日志；权威步骤见原生验收工具。未清任何缓存或用户storage。

### 实际join运输字段与设备切换暂态超时

主控10:50报告真实普通加入末项选择被白名单拒绝、5人v1零写，430设备选择期间systemInfo单次5000ms超时终止；两组均完整清理。旧账本未保存完整参数，因此读取实际生产cloud.call构造链并在隔离回归中捕获真实适配器请求：它必加__traceId，旧普通join字段白名单缺此字段。回归先失败并显示完整8字段形状，再仅许可该假赛事的规范trace运输字段，保留身份/资料/arm/版本/容量/单次追加及未知字段拒绝，并补fixture谓词诊断。

视口等待只对已观察的精确5000ms读超时容忍一次，在最初总期限内重新取得两次成功稳定样本；第二次超时、永久错误、断连或到期立即失败。反例先失败，修复后107项直接关联测试覆盖真实cloud适配器参数、join保护及暂态/永久超时边界。最终390实际load/arm/模拟真实适配器参数的一次内存join/finish与新签名证据位于任务外native-join-trace-adapter同前缀记录；它不冒充原生点击通过，430实际交接仍由父协调。

### VM冷启动总预算

主控随后报告真实390普通加入已通过并完整恢复：单次内存join5→6/v1→v2，guest保留、不认领、不授管理，15谓词true，恢复来源8/8。仅430剩余；最新启动原生容器耗时37213ms，随后AppService read被夹成1ms而失败，未进入设备等待/未签发。

旧60秒共享窗口从automation launch前开始，launch/归属检查和原生容器耗尽时间，Math.max(1, remaining)仍启动无意义RPC。改为显式有上限的总启动预算，从官方启动前统一计时，VM默认120秒、最大180秒；每阶段按真实剩余授权，native为AppService预留15秒，正式AppService探测少于5秒直接预算不足、零RPC，读取超时值在调用前捕获并受同一绝对deadline约束。设备等待仍独立且有界，既有暂态单次恢复次数不增加，ready/viewport/source条件不变。

最小回归覆盖7秒IDE+25秒launch+37.213秒native后仍有50.787秒真实AppService窗口并成功读取，以及总期限耗尽/仅1ms时零RPC、总预算上限拒绝。109项直接关联验证与真实390启动/签发证据保存在任务外native-startup-budget同前缀日志；430下一次仍须在真实awaiting日志后由local选择设备，不能在容器/预算阶段未完成时抢先点击。

### 430设备切换重建AppService后的连接

11:34:52UTC真实选择iPhone15ProMax后，官方日志在同一rt0/s0记录AppService销毁/重建，进程先14092、自动compile再11188，11:34:59loadstop；旧SDK systemInfo在两次5秒超时后退出，未绑定nonce、未签430。11:38只读connect原endpoint63186通过：同一监听器PID12892/启动时间/安装/源码，实际430×752、SDK3.17.4、真实home路由，旧marker已消失。故障为设备切换重建后旧SDK连接悬挂，不能只增加读取重试。

最小修复在原设备期限内仅一次重连：首次精确读超时必须先由本次官方日志证明同一个exact项目窗口代数增加，最终新AppService进程完成原生就绪；同时核原监听器/安装/源码，再官方connect同endpoint、核SDK/项目/真实非空页和实例未再次更替，重新取得两次稳定目标几何后才走原nonce断开重连全校验。无实例证据、同PID、其他窗口、source/listener漂移、SDK不符、空页、再更替或预算不足均拒绝。65项直接关联回归通过，lint0错误/35既有警告，diff检查通过；现场与完整来源结果置于任务外native-device-reconnect同前缀证据。GUI保持idle，无需重复切设备。

## 2026-10-20 固定目录与后续工作边界

旧任务 checkout 已可逆复制至 VM `C:\Projects\badminton\badminton-vm`；320 个提交完整，新旧均为干净的 209b43d，依赖与关键工具哈希一致，环境预检、Git 完整性及 check 通过。原目录、失败现场与全部验收证据保留；旧任务的临时 cwd/无项目归属尚未调整，不将文件复制等同任务迁移。项目登记及本次获准的单个项目内 UI 任务仍待实际创建与 cwd/归属回执。

209b43d 首次现场启动在 2026-10-19 17:19:42 UTC 按预算拒绝：AppService 持续 0 页，无新 marker/session，旧 session 未改。基础库 3.17.4 的 screenHeight/getPageTypeById 异常已保留原文；17:41 UTC 一次官方“编译”后首页显示与单页栈恢复，无新增 Console 错误，但正式安全续签入口仍缺，不能称启动链路已完成或旧会话适用于固定目录。

此后代码实现、非 GUI 测试和文档由 dot 云端直接完成；VM 只做同版本 DevTools 截图、UI/交互及必要平台验证，详见[工作流](../tools/agent-development-workflow.md#环境与任务边界)。文档体系整理是独立目标，云端复用现有索引/专题进行，不另建文档 Codex 任务。本次仅文档更新，不变更运行代码；原验收证据仍仅覆盖其记录的源码版本，不能覆盖新文档 manifest。
