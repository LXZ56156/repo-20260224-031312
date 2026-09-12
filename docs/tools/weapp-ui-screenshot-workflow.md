# 微信 DevTools 后台截图工作流

> 当前日常路线：用户已批准的原始整机图 `simulator-frame`，只连接已签热会话。实际安装、会话文件和验证结果见 [current.md](../tasks/current.md)；历史Stable/Nightly实测见其证据链接。MCP连接已配置，不依据历史失败重复安装或授权。

## 1. 当前入口

### 已批准的新原始整机图模式（2026-09-11）

用户已同意新版 Electron 日常使用原始整机图，不再把它当作旧页面区像素。原 `page` 模式默认行为、比例门禁和旧基线不变。

```powershell
$env:WEAPP_UI_SESSION_FILE = 'tmp/frame-acceptance/session.json'
$env:WEAPP_CAPTURE_SURFACE = 'simulator-frame'
npm run ui:screenshot -- launch
```

日常截图命令只连接已签热会话、通过 App.captureScreenshot 取原始 PNG，不启动/关闭/聚焦窗口。正式截图仍要求源码/Git、安装/会话、SDK/逻辑宽度、route、selector、fixture nonce和截图前后状态、PNG校验、异常与清理全部通过；frame不验证页面区等比，不推算裁剪坐标、不修改图像。

frame 的截图输出和 runRoot 在配置目录下自动追加 `simulator-frame` 子目录，即使指定与page相同的父目录也不会覆盖旧页面图。回执明确 `captureSurface.kind=simulator-frame`、`pageGeometryVerified=false`、`systemChromeNoise=true`。要恢复原模式，设置 `WEAPP_CAPTURE_SURFACE=page` 或移除该环境变量。未知模式直接拒绝。

`ui:diff` 读取相邻同名 `.receipt.json` 并核对图片hash；page/frame不同或单边来源未知时不比较。两个无receipt的普通PNG仍可做通用report-only比较，不构成来源证明。frame之间可报告像素变化，但系统栏/墙钟有噪声，不能宣称页面像素可复现，尺寸不同也不比较。不会自动更新baseline。

该模式替代日常截图的页面比例要求，不等于原Stable/Nightly同SDK页面像素15×10 A/B通过；原实验与历史失败单独保留。

```powershell
npm run ui:prewarm
npm run ui:doctor
npm run ui:session:refresh
npm run ui:screenshot -- --list
npm run ui:screenshot -- <case>
npm run ui:screenshot:focus-check -- <case>
```

本分支没有 `screenshot:smoke`、`screenshot:diagnose`、`weapp:probe` 或 `records:latest`。不要使用其他 worktree 的别名，也不要把 preview mirror 当作源码权威。

以下为工具使用说明，不要求每次任务全读或全执行：日常看第1/5节；源码变化看第4节；仅在会话失效时看第3节；工具/安装变化的焦点验收看第8节；故障看第9节。视觉门禁见 [UI验收](weapp-ui-acceptance.md)。

## 2. 两段式后台合同

### 2.1 一次性 `ui:prewarm`

- 这是唯一允许调用 `miniprogram-automator.launch()` 的入口，可能打开或激活 DevTools；执行前应预期一次桌面打扰。
- Windows/Node 24 下不直接 spawn `.bat`，也不使用全局 Node 绕过 vendor wrapper；实现通过 `cmd /d /s /c call <cli.bat>`，由 DevTools 官方 batch 选择其 bundled Node。
- prewarm 通过官方 GUI exe 显式传入 `--disable-backgrounding-occluded-windows`，同时合并 `NW_PRE_ARGS`，并从 listener 进程链命令行确认开关已生效。仅设置环境变量不足以证明开关。旧顶层单实例没有开关时拒绝签发 session；需要明确退出旧实例再预热，不修改安装目录或伪造回执。
- 必须显式提供当前脚本所在 exact worktree、微信 DevTools CLI、一个未被占用的 automation 端口和预期逻辑宽度。
- 预热会验证新 listener 的进程身份、DevTools 安装归属、exact project、SDK、viewport、AppService 随机 marker，以及 launch 前后 Git snapshot 完全一致；Windows listener 可能显示为 `::`/`0.0.0.0` wildcard bind，但连接 endpoint 仍强制 `127.0.0.1`，并继续要求唯一 owner 与安装路径归属。进程查询强制 UTF-8，支持中文安装路径。随后只断开 automation WebSocket，不关闭 DevTools。
- 只有全部验证通过才写 launch-signed session receipt；新回执写入成功后才清除旧的 stale-recovery barrier 与 session poison。失败不会伪造回执，也不会调用 `App.exit`、`Tool.close` 或杀掉 DevTools。

### 2.2 日常 `ui:doctor` / `ui:screenshot`

- 两者只 `connect()` 已签名的热会话，不 launch、不 quit、不置前、不移动窗口、不模拟输入。
- 日常截图失败不能自动激活/恢复窗口、预热或更改设备尺寸；保持用户桌面，记录故障后只做不抢焦点的诊断。当前缺少可用热会话时暂停依赖截图的步骤；切设备或前台恢复必须另有用户本次明确授权，不能从截图请求推导。
- DevTools 应保持 restored-but-background：窗口已恢复但放在其他应用后方。最小化、锁屏和断开的远程桌面不属于支持状态。
- endpoint 只能来自 launch-signed receipt，并且必须是 `ws://127.0.0.1:<port>`；工具不扫描端口，不猜历史端口，也不接受 `localhost`、`0.0.0.0` 或远端地址。
- runner 强制 DevTools 项目就是当前脚本 registry 所在 worktree，不能用 A worktree 的页面配 B worktree 的 fixture/Git 证据。
- prewarm、doctor、capture 共用同一个 session 级互斥锁；同一模拟器不会被两个 runner 并发路由、注入 fixture 或发布产物。doctor/capture 遇到旧 owner 已失效的 stale 锁也会直接失败，只有新的 `ui:prewarm` 能在 PID/启动时间证明 owner 失效、独占 token-bound recovery claim 并在搬移前复核 token 后，把旧锁转存为 stale 诊断文件。搬锁前还必须先持久写入 `<session>.recovering.json`；doctor/capture 在加锁前后都检查它，focus-check 在启动 child 前检查它，因此 rename 到新 lock 之间的窗口或搬锁后崩溃都不能绕过门禁。该 barrier 只有完整新 prewarm 写成 session receipt 后才能清除；session receipt 本身也只在锁内读取。
- 正式像素只来自 `App.captureScreenshot`。系统 picker、原生 modal、软键盘和分享面板仍需 DevTools/真机人工检查。

旧 `--prepare`、`--capture-win32`、PrintWindow、private desktop 和 Win32 helper 已退出 active runner；历史实现只从 Git 历史恢复。

## 3. 首次预热

只有用户明确允许本次前台预热后，才在当前独立 worktree 的 PowerShell 中执行；环境变量是本地动作护栏，不是授权提示，也不能长期设置为默认值：

```powershell
$env:WEAPP_CLI_PATH = 'D:\Soft\微信web开发者工具\cli.bat'
$env:WEAPP_PROJECT_PATH = (Resolve-Path '.').Path
$env:WEAPP_AUTO_PORT = '39450' # 示例；每套新会话必须自行选择一个未使用端口
$env:WEAPP_EXPECTED_WINDOW_WIDTH = '390'

$env:WEAPP_ALLOW_FOREGROUND_PREWARM = '1' # 仅对应用户本次明确前台预热授权
try { npm run ui:prewarm }
finally { Remove-Item Env:WEAPP_ALLOW_FOREGROUND_PREWARM -ErrorAction SilentlyContinue }
```

以上CLI路径需核验实际安装版本；本机新版使用frame模式，不能套用旧Stable的page比例证据。prewarm 成功只证明会话/来源/SDK/viewport，不证明截图像素合同通过。

缺少精确值 `WEAPP_ALLOW_FOREGROUND_PREWARM=1` 时，prewarm 在任何进程启动/launch之前直接拒绝，不弹授权、不重试。下文涉及重新prewarm的修复步骤也受此门禁约束，不构成失败后的自动回退。

不要手工设置 `WEAPP_WS_ENDPOINT` 冒充已签会话。`ui:prewarm` 成功后会生成：

```text
tmp/weapp-ui-background-session.json
```

回执绑定 endpoint、exact project path/hash、listener PID 与启动时间、DevTools CLI 根目录、SDK、viewport、AppService marker 和 Git manifest。成功后把 DevTools 窗口放到其他应用后方，不要最小化；日常命令会从回执读取配置。

如需多套会话，可在 prewarm、doctor、capture 和 focus-check 中始终使用同一个 `WEAPP_UI_SESSION_FILE`。该变量支持仓库相对路径和绝对路径。

## 4. 只读诊断与显式会话刷新

`ui:doctor` 只读检查来源、进程、SDK、页面和宽度，不更新 session receipt 或 AppService marker。现场已验证执行前后磁盘回执与内存 marker 不变。`ui:session:refresh` 才是显式的 fail-closed 会话刷新入口；它更新 gitignored receipt 和内存 marker，不启动、关闭、聚焦 DevTools，也不调用业务写入。

使用规则：

1. DevTools listener、进程、端口、SDK或项目变化：旧回执作废，重新选择未使用端口执行 `ui:prewarm`，仍受前台授权门禁限制。仅设备宽度变化时也默认如此；例外是用户已手动切换设备且明确要求保持桌面，此时可执行 `node scripts/dev/weapp-ui-screenshot.js --rebind-viewport 390`（390替换为用户明确选择的实际逻辑宽度）。此命令只连接原launch签名会话，先按原宽度验证回执及原进程/SDK/项目绑定，再核对实际宽度。第一次只写含from/to宽度的源码challenge并返回非零；明确后台编译/重载后，不改源码，第二次执行同一命令，只有challenge消失且Git、身份、实际宽度均通过才原子更新receipt，并保留原launch来源及宽度变更记录。期间不启动/激活窗口、不更改设备、不手改receipt；旧marker已缺失也不能跳过第一阶段。完成后清除不再适用的旧 `WEAPP_EXPECTED_WINDOW_WIDTH` 覆盖值，再运行只读 `ui:doctor`；日常doctor/capture仍严格拒绝宽度漂移。
2. Git source snapshot 变化：先运行一次 `npm run ui:session:refresh`。这一步只写入与当前 Git hash 绑定的 challenge，并按设计返回非零；即使旧 marker 已经缺失，也不能把“缺失”当作编译证明。
3. 在 DevTools 中明确执行一次编译/重载，使 challenge 随 AppService 重建而消失；然后第二次运行 `npm run ui:session:refresh`。只有它看到同一 source challenge 已消失、且 Git 在检查期间未再变化，才会签发新 session receipt。
4. challenge 仍存活、Git 再次变化或 marker/进程不一致时继续 fail closed，不得靠重复刷新或手改回执绕过。
5. Git 未变化时，doctor 只核对，不刷新 marker；需要刷新时显式使用 `ui:session:refresh`。

doctor 会核对：launch receipt、listener PID/启动时间、runtime marker、exact project、SDK、route、viewport，以及当前 Git HEAD、dirty 文件和文件 hash。任一项不可信即返回非零。

## 5. 标准单页流程

```powershell
npm run ui:screenshot -- --list
npm run ui:screenshot -- launch
```

标准步骤：

1. 确认 DevTools 已编译当前 exact worktree，窗口 restored-but-background。
2. 如源码刚变化，先按上一节完成会话刷新与明确编译/重载，再用 doctor 检查。
3. 只运行本次改动相关 case；不传 case 时会在同一 connection 中运行全部 case。
4. 核对 `captureOk`、`evidenceOk`、`machineOk`、route/query、project provenance、viewport、Git hash、PNG hash、cleanup 和 runtime exception。
5. 主控打开真实 PNG 逐张检查。`reviewStatus: pending` 表示机器证据通过但尚未完成人工视觉验收。

`feedback` 和 `create` 会在路由前临时写入一个本地假资料，用于绕过资料门禁；runner 会快照并在 `finally` 中逐项恢复原 storage 与 `getApp().globalData.openid`，并在恢复后逐键复验，不会调用云写入。其他 data case 会失效 fetch/watch/lifecycle 代次、网络订阅和 score-lock timer，阻止晚到响应覆盖 fixture。整轮结束后统一 `reLaunch` 到中性 launch 页，并证明页面栈只剩这一页，而不是把已冻结页面冒充为“已恢复”。

selector 在共享 deadline 内满足数量与非零尺寸合同，再轮询 selector geometry 及 reveal opacity/transform，要求 reveal 完成且连续两次状态一致；75ms 是轮询间隔，不是固定完成等待。5 秒内不稳定则拒绝。每个 case 注入随机 nonce，截图前后数据 hash 与 nonce 必须保持一致。截图 fixture 不引用远程头像，console/exception 随回执保留。

日常使用 `npm run test:affected -- --run <改动文件>` 执行影响测试；不带 `--run` 只打印计划。Prompt/Edit/Stop 不再自动运行 mirror、全量测试或云公共库检查。像素比较为 `npm run ui:diff -- <baseline.png> <candidate.png>`，仅报告差异，不阻断、不改 baseline。`npm run mp:quality` 仅用于低频本地交付检查，不包含 preview/upload。

## 6. 输出与成功合同

每次执行生成唯一 run id。以下路径展示默认 `page` 布局；`simulator-frame` 在runRoot/outDir父目录下分别追加同名子目录（例如 `tmp/ui-runs/simulator-frame/<run-id>/candidate/` 和 `tmp/ui-screenshots-actual/simulator-frame/`）。自定义父目录遵守相同隔离规则。候选文件先写入：

```text
tmp/ui-runs/<run-id>/candidate/<case>.png
tmp/ui-runs/<run-id>/candidate/<case>.receipt.json
tmp/ui-runs/<run-id>/candidate/manifest.receipt.json
```

当前是请求批次级 all-or-nothing：只有本轮全部 case 的机器证据都通过，所有 PNG、per-case receipt 和 run manifest 才在同一事务中发布。最后一个 case 失败时，前面 case 也不会覆盖上一批 final：

```text
tmp/ui-screenshots-actual/<case>.png
tmp/ui-screenshots-actual/<case>.receipt.json
tmp/ui-runs/<run-id>/manifest.json
```

正式成功至少要求：

- `captureOk=true`：PNG chunk、CRC、IDAT解压、尺寸、字节数和SHA-256合法；page额外验证页面比例，frame不声明页面几何等比；
- `evidenceOk=true`：route/query、project/session provenance、listener、SDK、viewport、Git manifest、selector coverage、横向溢出、case data 和特有 alignment 通过；
- storage 精确恢复与整轮单页中性重建成功，本 case 没有 runtime exception；
- `machineOk=true` 且 run-level `promotion.promoted=true`；
- run manifest 与全部图片、回执属于同一事务。

失败 candidate 保留作诊断，上一批 final 保持字节不变。发布失败会逐目标核对旧文件存在性与 SHA-256；若无法证明回滚完整，receipt/diagnostic manifest 使用 `publicationState: indeterminate` 且 `promoted`、`finalsTouched` 为 `null`，不得误报“未改动”。`ok=true` 只表示可供审图，不表示 UI 已验收。

## 7. 当前内置 case

当前 registry 有 30 个 case，覆盖 `app.json` 的 15/15 页面：

| Case | 页面 / 状态 |
|---|---|
| `waterV2OwnerEmpty` | 打水账本，房主空记录 |
| `waterV2Member24` | 打水账本，24 人成员总账 |
| `waterV2Member24Game` | 打水账本，24 人选人记一局 |
| `waterV2VisitorLong` | 打水账本，访客长流水 |
| `waterV2MemberDirect` | 打水账本，成员直接记账 |
| `waterV2MemberCorrection` | 打水账本，成员更正 |
| `waterV2OwnerCorrectionLong` | 打水账本，房主长摘要更正 |
| `waterV2EntryDetail` | 打水账本，记录详情 |
| `waterV2ArchivedRound` | 打水账本，历史轮次 |
| `waterV2SheetError` | 打水账本，弹层错误态 |
| `water` | `waterV2Member24` 日常别名 |
| `launch` | 启动页，打水/比赛 CTA 对齐 |
| `mine` | 我的页，资料与本机战绩 |
| `profile` | 资料编辑页 |
| `feedback` | 反馈填写态 |
| `create` | 创建比赛，自定义多人转 |
| `home` | 首页，已结束赛事卡 |
| `shareDraft` | 分享入口，报名中 |
| `shareRunning` | 分享入口，进行中 |
| `shareFinished` | 分享入口，已结束 |
| `lobbyGuide` | 大厅，新人引导 |
| `ranking` | 最终排名与分享入口 |
| `schedule` | 已完赛赛程 hero/share |
| `matchIdle` | 录分，待开始 |
| `matchEditing` | 录分，编辑中 |
| `matchLocked` | 录分，被他人占用 |
| `matchError` | 录分失败，本机草稿保留与重试 |
| `settings` | 草稿赛事设置 |
| `preferences` | 本地偏好 |
| `analytics` | 赛后战报 |

registry 不含 HTTP 远程视觉资源。多数 case 是本地 `setData`/fixture 状态，只证明当前源码在该状态下的页面渲染，不证明真实云数据、权限或写入链路。

## 8. “不抢焦点”的现场验收

仅当验证截图工具/安装变化后的不抢焦能力时运行，不是每次业务改动或每张截图的附加门禁。先让任意非 DevTools 应用保持前台，再执行：

```powershell
npm run ui:screenshot:focus-check -- launch
```

focus probe 会：

- 以默认 30ms（允许 20–50ms）采样前台窗口 PID；
- 每次只允许一个不修改 storage 的 case；未传 case 时默认 `launch`，`feedback` / `create` 等 storage fixture case 会被 runner 拒绝；
- 使用 PID + 启动时间缓存并动态追溯 ancestry，只与 launch receipt 中目标 DevTools anchor 比较；CIM 查询失败、进程瞬退、PID 复用或层级超限会记为 unknown；采样间隔超阈值则令 `samplingReliable=false`。两类情况都会使验收失败，不能被当作“非 DevTools”；首次 CIM/ancestry 预热发生在 child 启动和正式采样计时之前，并单独记录 `warmDurationMs`；
- child 使用 `focus-probe-no-publish-v1`：只写本轮 candidate 与唯一 run manifest，绝不调用正式 promotion，也不触碰 `tmp/ui-screenshots-actual` 中上一批图片/回执；
- 给 child 注入唯一 probe id/run id，并核对 run manifest 的 sessionId、endpoint、listener hash、Git hash、单 case、`probeOnly=true`、`promoted=false` 与 `finalsTouched=false`；
- 设置总时限；超时先原子写入 `<session>.poisoned.json`，再回读核对 session/listener/probe/run/child 身份，只有 poison 验证成功才终止本探针启动的 Node runner。poison 无法验证时不强杀 child，只做有界等待，仍存活的 child/session 锁继续阻止复用；全程不关闭 DevTools。poison 文件只要存在（即使 JSON 损坏），doctor/capture/focus-check 就全部拒绝，只有成功的新 `ui:prewarm` 能清除；
- 把结果写入 `tmp/ui-focus-probes/`。

验收需要同一 case 连续执行三次，三份 receipt 都满足 `devToolsForegroundHits=0`、`unknownClassificationCount=0`、`samplingReliable=true`、`captureExitCode=0`、`manifestValidation.ok=true`。这只能表述为“采样期间未观察到目标 DevTools 成为前台”，不能证明短于采样间隔的绝对零切换。探针不监测系统输入事件，因此回执明确写 `inputInjectionProbe: not-instrumented`；“没有输入模拟”由 runner/探针源码禁用相关 API 的静态合同证明，不冒充运行时输入监测。

当前没有 launch-signed 热会话时，不为完成验收而自动冷启动；等用户允许一次 prewarm 后再做三连截。

历史失败过程已移至 [2026-09-03记录](../tasks/session-logs/2026-09-03-screenshot-failure-excerpt.md)，不作为日常操作步骤。

## 9. 失败处理

1. `configuration is invalid` / `runnerProjectPath`：必须在脚本所在 exact worktree 重新 prewarm。
2. session/listener identity 失败：会话进程、端口或 listener 已变化，使用新未占用端口 prewarm。
3. `runtimeRecompiledForChangedSource` 失败：按“两次 ui:session:refresh，中间一次明确编译/重载”的 challenge 流程执行，不能把 marker 缺失直接当成成功。
4. route/selector/case data/width 不匹配：确认当前设备和 case，再判断 registry 过期或产品回归。
5. screenshot timeout/stale：只读核查连接、运行时和窗口状态；最小化、锁屏、断开远程桌面可能影响捕获，但不能据此断言它们是所有超时根因。runner及外部协作工具均不得为日常截图自动抬起/恢复窗口、预热、改尺寸或盲重试。
6. runtime exception、storage/fixture cleanup 或整批 promotion 失败：保留 candidate，修复直接原因后只重跑相关 case。
7. `sessionNotPoisoned` 失败：上次 focus probe 被强制中断，或 poison 标记已损坏，fixture/page 状态不可证明；选择新的未占用端口执行一次完整 `ui:prewarm`，doctor 不得清除 poison。
8. `sessionNotRecovering` 失败：上次 stale-lock recovery 在新锁或新 session 完成前中断；普通 doctor/capture/focus-check 不得绕过，执行一次完整新 `ui:prewarm`，成功后由 prewarm 清除 barrier。
9. `publicationState: indeterminate`：停止使用本轮 final，保留 backup/stage 诊断证据，先人工核对 receipt 中逐目标 hash，不得把它归类为普通失败或自动重跑覆盖。
10. selector/route 已通过而 `App.captureScreenshot` 超时：先确认窗口 visible/restored/not minimized、进程链携带 occlusion 开关；若仍复现，保留 candidate receipt 并停止批量重试，进入像素源/DevTools 版本/图形会话隔离评估，不提高 timeout 冒充修复。2026-09-10 的本机组合已通过 10 连截及最终代码 3 连截。

不得用浏览器稿、DOM 数学量测、旧截图、旧 QR 或 preview 输出替代失败的真实 DevTools 图。只有分别实际捕获的图片才能称为 320/390/430 实图。
