# 微信 DevTools 后台截图链路优化方案（2026-09-03）

> 2026-09-11最新：用户已批准并实现新版独立`simulator-frame`日常截图合同，保留旧page合同/基线；MCP连接阻塞已解除，无需再次安装。3连后台截图通过，1747次可靠采样前台命中0；最终源码30case单批27通过，另3项超时后独立重跑通过。整批可靠性与原同SDK页面图15×10 A/B仍未闭合，不宣称P0–P2全部完成。详见`wechatide-nightly-admission-2026-09-11.md`顶部和`current.md`。

> 最新状态（2026-09-10）：Stable 后台截图已通过 10/10 焦点采样及 30/30 真实 case；原 P0/P1 已闭合，P2 仅 Nightly 10 轮 A/B 因本机 CLI 授权超时未完成。逐项当前结论以 `weapp-background-screenshot-validation-2026-09-10.md` 和 `current.md` 最新节为准。以下实施过程与 3.5 矩阵保留 2026-09-03 历史事实，不作为当前完成状态。方案不授权产品 UI、业务流程、发布、部署或真实数据改动。

## 0. 已批准的核心决定

- 首要目标是日常截图不再抢占用户桌面；正式截图命令只连接已经预热的 DevTools automation 热会话。
- 冷启动 DevTools 没有可验证的 `--headless` 或 `--no-focus` 合同，可能弹出窗口，因此不计入“零打扰截图”能力；需要冷启动时单独预热一次，再由用户把窗口留在 restored-but-background 状态。
- `App.captureScreenshot` 是唯一正式页面像素捕获路径；Win32 可见窗口、PrintWindow、透明窗口、虚拟桌面和输入模拟退出 active runner。
- 先完成文档与成功合同，再小步实现依赖锁定、严格 receipt、后台会话 doctor、事务输出和 tracked scenario registry。

## 1. 目标

建立一条简单、可复现、不会抢占用户桌面的原生微信小程序截图链路：

- 用户只需显式执行一次 `ui:prewarm` 打开并编译当前 exact worktree；
- DevTools 保持“已恢复但位于其他窗口后方”，截图期间不切前台、不移动窗口、不模拟输入；
- 工具只连接用户明确提供的 loopback automation endpoint；
- 使用 `miniprogram-automator` 的 `App.captureScreenshot` 获取真实模拟器像素；
- 每张图严格绑定源码、worktree、DevTools 会话、页面、fixture、设备宽度和 PNG hash；
- 失败只保留候选诊断产物，不覆盖上一批已验收证据；
- 自动检查用于拦截明显错误，最终 UI 验收仍由主控逐张查看真实 DevTools 图。

不以浏览器近似稿、DOM 数学量测、旧截图或 preview QR 替代当前源码的真实 DevTools 图。

## 2. 非目标

- 日常 `ui:doctor` / `ui:screenshot` 不打开、关闭或重启微信 DevTools；只有用户明确执行的 `ui:prewarm` 可以 launch；
- 不调用 `quit`、`Tool.close`、`App.exit`，不接管用户已有 DevTools 会话；
- 不调用 `SetForegroundWindow`、`SendInput`、鼠标/键盘模拟、窗口移动、透明窗口、虚拟桌面或 PrintWindow；
- 不扫描端口，不根据 listener、404、CDP 端口或历史端口猜 automation endpoint；
- 不恢复 private desktop、Win32 transaction、listener confinement、三帧 challenge 等复杂诊断路线；
- 不把 fixture 截图描述成真实云链路、真机系统层或正式版本证据；
- 不在本方案中改变任何用户可见 UI、CTA、文案、导航、权限或业务语义。

## 3. 实施前基线事实

> 本节保留 2026-09-03 开始实施前的审计基线，用于解释为什么要改；不再代表当前代码能力。当前实现进度见 3.4。

### 3.1 当前主截图脚本

- `scripts/dev/weapp-ui-screenshot.js` 当前约 2632 行，同时包含直接 `App.captureScreenshot` 和两阶段 Win32 capture 两套路线。
- `scripts/dev/weapp-devtools-win32-capture.ps1` 当前约 1097 行。
- `docs/tasks/weapp-real-devtools-screenshot-simplified-handoff-2026-08-12.md` 已明确要求绕过 Win32/private desktop/transaction 路线，但实现和测试仍保留该复杂链。
- 脚本仍把 `ws://127.0.0.1:39420` 作为默认 endpoint；该端口在历史会话中曾是 IDE HTTP，并不是稳定的 automation 角色。
- 未传 `WEAPP_PROJECT_PATH` 时脚本仍允许以空 source path 连接。
- `miniprogram-automator@0.12.1` 当前只存在于本机 `node_modules`，`npm ls` 标记为 extraneous，未进入 `package.json` 和 lockfile。

### 3.2 case 与证据覆盖

- 正式 `--list` 当前有 20 个 case，只覆盖 8/15 个页面：water、launch、home、share-entry、lobby、ranking、schedule、analytics。
- 缺少 mine、profile、feedback、create、match、settings、preferences；当前任务尤其缺少 match 截图 case。
- `water` 是现有 V2 water 状态的别名，2026-08-31 内建证据实际保存 19 张图。
- 只有 water case 使用严格 receipt；其余 case 即使完整 provenance/receipt 失败，仍可能因最小 PNG 条件成立而返回顶层 `ok=true`。
- 2026-08-31 归档说明写“19/19 内建 receipt 通过”，逐份检查实际为 18/19；`home` 的 provenance 与 `receiptValidation` 均失败，但顶层 `ok` 仍为 true。
- 现有 136 张归档 PNG 覆盖全部 15 页，文件、大小和 SHA-256 均完整且唯一；其中 117 张扩展图来自 87 个状态 spec。
- 生成 87 个状态的 `tmp/capture-ui-review-20260831.js` 仍在本机，但位于 gitignored `tmp/`，硬编码 endpoint、SDK 和 390px，不能作为可移植工具。

### 3.3 旧开发链路

- `.codex/hooks.json` 会在 prompt 和 Stop 阶段执行旧 preview mirror。
- `.claude/settings.json` 会在编辑后执行 mirror、lint 和全量测试。
- `scripts/dev/weapp-dev.sh` 默认旧 WSL 路径、preview mirror 和固定端口，并会修改 npx cache 中的 `weapp-dev-mcp` 代码。
- `scripts/dev/start-weapp-preview.ps1` 固定 preview 路径与端口，只检查 TCP listener，不证明协议或 exact project。
- preview mirror 只应服务明确授权的 preview/upload，不应成为日常源码或截图权威。

### 3.4 当前实现进度（2026-09-03）

已完成：

- `miniprogram-automator@0.12.1` 已精确锁入 `package.json` 与 lockfile，不再依赖 npx cache 残留。
- 新增显式 `ui:prewarm`：只有该命令可能激活 DevTools；它通过“新未占用 listener + exact-project launch + listener 进程身份 + AppService marker + disconnect/reconnect”生成 launch-signed receipt，并要求 launch 前后 Git snapshot 完全一致。
- `ui:doctor` 和 `ui:screenshot` 只连接已签热会话；错误 endpoint、错误 listener 进程、错误 worktree、错误 SDK/viewport/route 或 source snapshot 均 fail closed。
- doctor 使用“两次 doctor + 中间一次明确编译/重载”的 source challenge：首次只绑定目标 Git hash 并失败，第二次只有看到同一 challenge 随 AppService 重建而消失、且 Git 检查期间稳定，才允许签发新 snapshot；首次 marker 已缺失也不能自证成功。
- active runner 已移除固定 `39420`、Win32/PrintWindow/private-desktop 两阶段路线与旧 PowerShell helper。
- 全部 case 统一 `captureOk` / `evidenceOk` / `machineOk` / `reviewStatus` 合同；PNG 会校验 chunk、CRC 与 IDAT 解压，不再只看 header。
- promotion 已改为请求批次级 all-or-nothing；PNG、per-case receipt 和 run manifest 同一事务发布，末项失败会按原始 SHA-256 验证回滚。无法证明时显式记为 `publicationState: indeterminate`，不会误报 `finalsTouched=false`。
- tracked registry 已从 20 个 case 扩到 29 个，覆盖 `app.json` 15/15 页面，并增加 `matchIdle` / `matchEditing` / `matchLocked`。
- data/fixture case 会失效页面异步代次、watch、网络订阅与 score-lock timer；资料门禁 fixture 在路由前快照 storage/App openid，结束后逐项恢复并复验，应用中途失败的 emergency rollback 结果也会上报给整轮控制器；整轮 `finally` 使用 `reLaunch` 重建到唯一中性 launch 页并核对页面栈，不把冻结页面冒充为恢复完成。
- fixture 已移除 HTTP 远程头像；runner 收集 console/exception，exception 或 cleanup 失败会阻止 promotion。
- prewarm、doctor 与 capture 共用 session 锁，阻止两个 runner 交错操作同一模拟器并保证 session receipt 在锁内读取；doctor/capture 对 stale 锁 fail closed，只有新 prewarm 可通过 token-bound claim、PID/启动时间和搬移前 token 复核保留旧锁证据后恢复。搬锁前持久写入 recovery barrier，普通 acquire 在加锁前后都检查，focus-check 在 child 启动前检查；rename 窗口或搬锁后崩溃都保持 fail closed，barrier 只由成功的新 prewarm 清除。
- selector readiness 已要求声明数量与全部匹配节点非零尺寸；当前高风险 match/settings/preferences case 声明唯一数量，并在截图前执行 500ms reveal settle 后二次复验。
- 新增动态 ancestry 的 focus probe，绑定具体 capture run、session/listener/Git manifest，并设置总时限；probe 强制单 case/no-storage/no-publish，CIM 分类 unknown 或采样间隔不可靠都会 fail closed，不会调用聚焦或输入 API；首次 CIM 预热不占正式采样时限。
- focus 超时会先写并回读验证 session poison；只有验证成功才有界终止 child，无法验证时不强杀并让存活 child/session 锁阻止复用。poison 文件存在即拒绝后续 doctor/capture，只有成功的新 prewarm 可清除。
- 新 prewarm 会仅为其启动子链合并 `NW_PRE_ARGS=--disable-backgrounding-occluded-windows`，并从 listener 进程链命令行确认开关真正生效；已有顶层单实例不会被误签为支持后台 capture，也不修改 DevTools 安装目录。
- focus 分类改为核对前台 PID 的启动时间和实际 executable 是否位于签名 DevTools 安装根；同根窗口保守计为 target，路径不可读仍 fail closed。它不再因 ChatGPT 等普通应用的历史父进程已退出而重复进行慢 CIM ancestry 查询。
- 当前截图工具聚焦故障注入与本轮 Windows 兼容回归合计 69/69；session lock 缺失、损坏或 ownership 改变时，runner/prewarm 也会以失败退出；rename 竞争与搬锁后崩溃均有直接 barrier 测试，不把残留锁或无锁窗口冒充为成功。静态通过不代表 live DevTools 通过。

现场实测后仍未完成：

- 已使用本机 Stable DevTools `2.01.2510290`、基础库 `3.14.2`、390px 设备和 exact worktree 成功生成 launch-signed 热会话；因此“不具备热会话”不再是阻塞原因。
- DevTools 窗口经只读 Win32 检查为 visible、restored、not minimized，ChatGPT 保持前台。`launch` 的 route、selector 数量/尺寸和 500ms settle 均成功，但 `App.captureScreenshot` 在 45 秒后超时；第二个独立原始协议调用在同样后台条件下也于 30 秒超时。两次都没有得到 PNG，不能完成三连截或主控逐图检查。
- 首轮 focus probe 的 48 个前台样本全部是 ChatGPT PID，`devToolsForegroundHits=0`；当时的动态 ancestry 在前台应用父进程已退出时返回 `process-disappeared`，造成 48 个 unknown 和最大约 1.54 秒采样间隔。该分类逻辑随后已改为安装根路径判定，辅助实测可正确区分 ChatGPT/DevTools；完整 probe 仍待新会话复验。
- 现场诊断切换了 automation listener，随后又有 tracked 工具/测试改动；磁盘中的旧 session receipt 不能继续作为当前热会话使用。下次 live test 必须重新选择未使用端口执行 prewarm。
- `.codex/hooks.json`、`.claude/settings.json` 与旧 preview mirror 开发链仍会在 prompt、Stop 或编辑阶段自动执行重任务，尚未按影响映射收敛。
- 87 个历史状态不再整批盲迁移；后续按实际页面风险逐项加入 tracked registry，避免重建难维护的大矩阵。

现场实测中已修复并增加回归保护：

- Node `v24.18.0` 不能直接 spawn `.bat`；旧实现又用全局 Node 执行 DevTools `cli.js`，导致 CLI 找错安装根。Windows 预热现改为 `cmd /d /s /c call <官方 cli.bat>`，继续由官方 wrapper 选择其 bundled Node。
- Windows DevTools 实际把 automation listener 绑定到 `::`；listener identity 现接受 loopback endpoint 对应的 `127.0.0.1`、`::1`、`0.0.0.0`、`::` 监听记录，并继续核对唯一 owner、PID、启动时间和安装归属。
- listener 进程查询强制 PowerShell UTF-8 输出；focus probe 对 session、manifest 和 poison JSON 也改为严格 UTF-8 读取，中文安装路径不再被系统代码页破坏。
- `miniprogram-ci` 已从范围版本改为精确 `2.1.31`；新增旧 Home receipt 专门回归，确认缺 project provenance/source snapshot 时一定被严格合同拒绝。
- 安装包还原确认 `App.captureScreenshot` 最终调用顶层 NW.js `global.Win.capturePage(callback)`，只有 callback 内才 resolve；其前置 `onceWebviewStable` 默认最多 5 秒并会自行放行。当前 NW.js 0.54.1/Chromium 91 进程未带抗 occlusion 开关，因此最高概率根因是 Windows Native Window Occlusion。实现已加入单开关 mitigation，但因旧 DevTools 顶层进程仍在，尚未完成严格 A/B。

根因与 mitigation 的一手参考：NW.js [`Window.capturePage`](https://docs.nwjs.io/References/Window/)、[`NW_PRE_ARGS`](https://docs.nwjs.io/References/Command%20Line%20Options/)、[0.54.1 / Chromium 91 发布记录](https://nwjs.io/blog/v0.54.1/)，以及 Chromium [Windows Native Window Occlusion 说明](https://blog.chromium.org/2021/12/chrome-windows-performance-improvements-native-window-occlusion.html)和[后台截图开关提交](https://chromium.googlesource.com/chromium/src.git/+/aa109a26304654435e85997e20c992e88c627a7d)。这里的 occlusion 根因仍标为高置信推断，待新进程 A/B 后才能升级为已证实。

### 3.5 按用户原 P0 / P1 / P2 清单的完成度复核

| 阶段 | 结论 | 主要未完成项 |
|---|---|---|
| P0 | 部分完成 | active runner 已无固定 39420、依赖已精确锁定、旧 Home receipt 已有拒绝测试；但旧 `weapp-dev.sh` 仍扫描/修改 `_npx`，11 个 water method fixture 没有 case/run nonce 或关键状态 hash 纳入 receipt，`ui:doctor` 会更新本地 session/AppService marker，不能按字面称为“只读”。 |
| P1 | 部分完成 | 单一 `App.captureScreenshot`、candidate 原子晋升、15/15 页面、console/exception、本地资产均已有；但缺 `matchError`，仍有可解释的固定 500ms settle 且没有 fixture nonce，pixelmatch/baseline/diff 完全未实现。更关键的是当前正式截图 API 在真实后台场景超时。 |
| P2 | 未完成 | 自动 mirror/full-test hooks 未停、`squad.fairness` 仍依赖墙钟 deadline、没有 Nightly wechatide 10–15 case × 10 与 9/10 门槛、没有 `analyseCode` 低频质量线、也没有 `wx-server-sdk` 4.x 云合同迁移审计。SDK 未被顺手升级或部署，边界保持正确。 |

所以不得将“69/69 静态/故障注入测试通过”解释为 P0–P2 全部完成，也不得把 `devToolsForegroundHits=0` 单独摘出来宣称零抢焦；该次 probe 的截图和采样可靠性均失败。

## 4. 目标架构

```text
ui:prewarm 显式 launch exact worktree（唯一可能激活窗口的步骤）
  └─ 窗口保持 restored-but-background
       ↓ launch-signed endpoint + exact project/listener receipt
ui:doctor（本地 session/marker 刷新、fail closed）
  ├─ loopback WebSocket 校验
  ├─ Tool.getInfo / App.getCurrentPage
  ├─ exact-launch 或匹配的 project/session provenance
  ├─ SDK / device / viewport
  ├─ Git HEAD + dirty 文件 hash
  └─ 仅在运行时已重编译或 source 未变时刷新 session receipt
       ↓
tracked scenario registry
  ├─ 15 页基础 smoke
  ├─ 与本次改动直接相关的风险状态
  ├─ 本地确定性 fixture
  └─ selector / 44px / containment 断言
       ↓
单一 automator connection
  ├─ 路由并等待真实就绪条件
  ├─ 冻结旧异步、注入 fixture
  ├─ App.captureScreenshot
  ├─ 精确恢复并复验 storage；整轮 reLaunch 到单页中性 launch 页
  └─ 捕获 console exception
       ↓
唯一 run 目录
  ├─ candidate PNG
  ├─ per-case compact receipt
  ├─ run manifest
  └─ 全部严格通过后才 promotion
       ↓
主控逐图检查 + 必要双盲评审
```

### 4.1 后台运行合同

- runner 只使用已存在的 automation 会话，不负责启动 DevTools；
- runner 不包含任何 OS 窗口控制或输入模拟代码；
- DevTools 最小化时可能停止可靠绘制，因此最小化不属于支持状态；
- 如果 surface 超时、页面 stale 或 provenance 不完整，本轮立即失败，不自动抬起窗口、换端口、重启或重跑；
- 用户可以继续在其他应用中工作，DevTools 保持恢复状态并位于其后方。

### 4.2 证据合同

正式成功必须同时满足：

- endpoint 是用户明确提供的 `ws://127.0.0.1:<port>`；
- exact project path 与目标 worktree 一致；若当前 Stable DevTools 的 `Tool.getInfo` 不返回 `projectPath`，必须使用由 exact-project 预热阶段生成并与 endpoint/port 匹配的 session provenance，不能放宽为猜测；
- `Tool.getInfo`、`App.getCurrentPage` 和 case route/query 一致；
- SDK、设备型号、逻辑宽高和字体设置完整；
- Git HEAD、dirty 状态及 dirty 文件 hash 完整；
- fixture、页面 data、selector 与 geometry hash 完整；
- PNG header、尺寸、比例、字节数和 SHA-256 合法；
- P0 至少要求 selector coverage、声明数量、全部匹配节点非零尺寸、页面横向溢出和 case 断言通过；44px 与绝对 viewport containment 作为 P2 geometry 门禁继续补齐；
- storage 在 `finally` 中精确恢复并复验；冻结的页面运行时通过整轮结束后的单页中性重建退出，不声称可逆恢复已取消的旧网络订阅或 timer；
- 本轮没有 console exception、cleanup error 或半完成 case。

不得再使用一个含义模糊的 `ok` 同时表示“截到了图片”和“证据可验收”。至少区分 `captureOk`、`evidenceOk` 和 `reviewStatus`；只有 `evidenceOk=true` 且主控确认后才能标为已验收。

## 5. 实施优先级

### P0：建立可信、可复现的最短主链

1. 将 `miniprogram-automator` 以确认兼容的精确版本加入 `devDependencies` 和 lockfile，删除 npx cache 自动发现。
2. 新增不做业务/云写入的本地会话预检与刷新 `ui:doctor`：强制显式 endpoint、exact project path 和 expected viewport；缺失或不一致时在截图前失败。
3. 删除不可信的默认 `39420`；禁止 connect 模式使用空 source path。
4. 所有正式 case 统一启用严格 receipt，route、project、viewport、Git 或 provenance 任一失败都返回非零。
5. 写入唯一 run 目录，候选产物与已验收产物分离；失败不得覆盖旧图。
6. 从历史 87 个状态中只迁移当前风险需要的 tracked scenario；第一批保证 15/15 页面均有基础 case，并补齐 match。
7. `--list`、case 文档和覆盖统计由同一 registry 生成，消除文档与实现漂移。

#### P0 验收标准

- 干净 clone 执行 `npm ci` 后无需本机残留 npx cache 即可运行 `--list` 和工具测试；
- 缺 endpoint、错误 endpoint、错误 project、错误 route、错误宽度均在 promotion 前失败；
- 用新规则校验现有 `home` receipt 时必须失败，不能再出现顶层假成功；
- 正式 registry 覆盖 15/15 页面，至少包含 match 的 idle、editing、locked/error 中与当前任务直接相关的最小状态；
- 故意让最后一个 case 失败时，上一批已验收 PNG 与 receipt 字节不变；
- 将其他应用置于前台连续运行同一单 case 三次，以 20–50ms 间隔采样 `GetForegroundWindow`/进程归属；三次运行中 DevTools 前台命中数与 unknown 分类数均为 0、采样间隔可靠，且 probe-only manifest 证明正式 final 未被触碰；输入 API 禁用由静态合同证明，不冒充运行时输入监测；
- runner 源码中不存在自动 launch/quit、窗口聚焦、窗口移动、透明窗口、虚拟桌面或输入模拟调用。

### P1：缩短循环并降低维护成本

1. 从 active runner 移除 `--prepare`、`--capture-win32` 与 Win32 helper 依赖；历史代码通过 Git 历史保留，不继续作为当前执行面。（已完成）
2. 停用 Codex/Claude 的自动 preview mirror hooks；如仍有旧 WSL 使用者，只保留显式 `legacy:` 命令作为短期过渡。
3. 将单体脚本拆为 session、registry、fixture、capture、receipt 五个小模块；不新增框架层。
4. 使用 route + selector 数量/非零尺寸就绪条件；仅保留可解释的 500ms reveal 动画预算，并在 settle 后二次复验。（已完成）
5. 为页面提供统一 freeze，并在整轮结束后 `reLaunch` 到单页中性页，阻止晚到云响应、polling 或 timer 覆盖 fixture；不把不可逆 unsubscribe 伪装成原页 restore。（已完成）
6. fixture 只使用本地静态资产，移除 DiceBear 等远程头像依赖。（已完成）
7. 收集 `miniprogram-automator` console/exception，异常写入 receipt 并使 case 失败。（已完成）
8. 让 `scripts/run-eslint.js` 支持显式文件和 `--fix`；建立“改动文件 → 聚焦测试 → 截图 case”的简单映射。

#### P1 验收标准

- 普通 prompt、编辑和 Stop 不启动 rsync、preview mirror、MCP 或全量测试；
- 正式截图入口不加载 Win32 PowerShell helper，也不修改 npx cache；
- 单个已就绪页面 case 不依赖任意 1.8 秒固定 sleep；当前 500ms 只覆盖已核对的最长 420ms reveal delay + duration，并在前后两次校验 selector 合同；
- 断网状态下使用本地 fixture 可以稳定截图，且不会访问远程头像；
- 注入迟到异步响应或 console exception 时 case 必须失败，页面 fixture 不被覆盖；
- 修改一个页面时可以只运行相关 ESLint、聚焦测试和对应 case，完整门禁仍在交付前执行。

### P2：增加变化定位与风险矩阵

1. 在相同 SDK、设备、fixture 下增加 PNG diff 和 diff 图，仅用于人工审图前定位变化，不自动批准 UI。
2. scenario 声明支持 selector 唯一、最小 `44×44px`、绝对 viewport containment、对齐、关键文案和禁用态可辨认等断言。
3. 390px 作为日常基线；宽度或高密度相关改动才运行 320/390/430，未实际截图的宽度继续明确标为结构/数学检查。
4. 对高风险名单、弹层和筛选补充 24 人、长昵称、搜索空态、字体放大、键盘与 safe-area 的最小状态矩阵。
5. 日常 run 保留在 gitignored `tmp/ui-runs/`；只有明确验收后的精选图和紧凑 manifest 才进入仓库。

#### P2 验收标准

- 同环境下能生成 baseline、candidate 和 diff PNG，并给出变化像素比例；
- 自动 geometry 能拦截小于 44px、共同横向溢出和 selector 多匹配；
- 高风险 UI 的 320/390/430 证据逐档注明是真实截图还是结构检查；
- modal、picker、键盘、分享、头像、权限、Toast/Loading 等系统层仍单列真机/DevTools 人工检查，不被普通截图冒充覆盖；
- 新一轮日常截图不会默认再向 Git 增加整套 20MB 以上证据。

## 6. 分层开发与验证路线

```text
内循环
  → 修改文件 ESLint / node --check
  → 直接相关 node:test
  → 单页、单状态真实截图

页面交付门槛
  → 页面聚焦测试
  → UI 静态合同
  → changed-page risk cases
  → 主控真实图检查

仓库交付门槛
  → npm test
  → npm run check
  → npm run lint
  → git diff --check
  → 如实记录已知 flake、跳过和未覆盖状态

发布门槛（另行授权）
  → preview / 真机系统层检查
  → upload / 正式发布 / 云部署分别执行
```

`tests/squad.fairness.test.js` 的墙钟 beam deadline 波动应单独处理：优先改为确定性操作预算，无法立即改时独立串行运行并保留完整失败事实，不以自动重跑掩盖。

## 7. 风险与取舍

- `miniprogram-automator` 依赖 DevTools automation 协议，升级 DevTools 前必须运行一个 live smoke；锁版本不能替代兼容性验证。
- 本机当前组合中，`App.captureScreenshot` 不仅在最小化时有风险，在 DevTools visible/restored 但被 ChatGPT 覆盖的后台场景也已连续两次超时。完成前台对照或更换 DevTools 版本/运行隔离层之前，只能判定“当前后台主链不可用”，不能推断 API 在所有场景均损坏。
- fixture 只能证明当前源码在指定状态下的渲染；云函数合同、权限和真实写入仍由对应测试或经授权环境验证。
- 像素 diff 会受 SDK、字体、GPU 和动态资源影响；必须锁环境、使用本地资源并保留人工检查。
- 移除旧 hooks 前要确认是否仍有 Claude/WSL 使用者；先停自动触发、保留显式过渡命令，比直接删除更稳妥。
- 320/430 自动设备切换若没有可靠的官方能力，不以 OS 窗口缩放或修改私密配置绕过，继续由用户切换设备后严格验证宽度。

## 8. 动作边界

本方案后续实施只授权本地工具、测试和文档改动时，仍不得自动执行以下动作：

- 修改用户可见 UI、文案、CTA、导航、权限或业务流程；
- 切换 canonical 工作区分支或覆盖用户现有 dirty 内容；
- 打开、关闭、重启、置前、移动或最小化微信 DevTools；
- 扫描端口或连接非 loopback 地址；
- preview QR、preview、`mp:upload`、正式发布；
- 云函数部署或真实云数据写入；
- local commit、Git push 或 PR。

上述 Git、preview、upload、发布、云部署和真实数据动作继续分别需要用户明确授权。截图 fixture 不得调用真实云写入；测试输出和候选截图默认写入 gitignored `tmp/`。

## 9. 推荐实施顺序

```text
P0-1 固定依赖、prewarm 与 doctor（已实现）
  → P0-2 严格 receipt 与整批事务输出（已实现）
  → P0-3 tracked 15 页 / 29 case registry（已实现）
  → P0-4 session 锁、source challenge、probe-only/poison 与故障注入（已实现）
  → 真实 prewarm 已通过，restored-but-background 截图已复现超时（现场验收失败）
  → 完整退出旧 DevTools 后，用新顶层进程验证 occlusion 开关并重做三连截/10 次稳定性采样
  → focus probe 快速安装根分类已实现，随新会话复验采样性能
  → P1 审计并停用自动 mirror hooks、继续按需要拆分模块
  → P2 diff、geometry 与按风险 viewport 矩阵
  → 持续更新正式截图工作流文档（本阶段已更新）
```

任何实现批次都应保持“小步、单独验证、单独审查”；若工具改动暴露产品 UI 问题，应先报告并取得具体 UI 修改批准，不得顺手修改产品。
