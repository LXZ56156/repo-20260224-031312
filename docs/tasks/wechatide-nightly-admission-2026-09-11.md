# Nightly 授权恢复与截图准入实测（2026-09-11）

## 最新结果：用户批准的独立 simulator-frame 模式

本节覆盖下方历史待授权/待决定状态。用户提供凭据后，固定已安装2.02.2609102的官方status与stdio握手已成功，49工具可用；不再安装或重复授权。实际SDK3.17.2、screen390×844、window390×671。用户批准原始整机图独立合同后，实现显式surface、隔离输出、严格来源/fixture/PNG/清理门禁和surface-aware report-only diff；旧page合同和基线不变，不声称页面几何等比。

### 真实运行与验收边界

所有run位于`tmp/frame-acceptance/runs/simulator-frame/`：

- 首轮`2026-09-11T08-03-21-707Z-71564-8a8aca1c`：24/30，5个弹层selector命中隐藏节点、1个官方响应超时；失败整批不晋升。
- 最小修复仅给water现有direct弹层根view增加唯一class，registry精确限定game/direct弹层作用域及唯一可见节点；无样式、文案、行为变化。重新编译并重签源码后，`2026-09-11T08-15-48-907Z-76908-84754052`：27/30，waterV2MemberCorrection、waterV2OwnerCorrectionLong、shareRunning官方响应超时；finalsTouched:false。
- 同一最终源码独立诊断重跑`2026-09-11T08-25-30-957Z-47616-0da606cb`：上述3case全部通过，promotion.ok:true、publicationState:committed，晋升至`tmp/frame-acceptance/diagnostic-screenshots/simulator-frame/`。临时诊断只包装RPC错误的方法名/耗时，没有复现具体故障；未增加自动重试。30case分别有通过回执，但完整单批仍为27/30，不拼接称30/30。
- frame模式launch连续3次focus-check通过：596、582、569次采样，共1747，hits0、unknown0、samplingReliable:true、captureExitCode:0。回执分别为`tmp/ui-focus-probes/20260911-162716-129-014f8247391342c28121a7d78756166b.json`、`20260911-162745-722-6bb08231ac904e46a645bc11d0a5fbc7.json`、`20260911-162814-644-1942d476048d4d3e9b09ed03c9e1fc14.json`（后两者同目录）。不覆盖冷启动/最小化/锁屏，也不是10轮A/B。
- 主控亲自检查原始waterV2OwnerEmpty、mine、waterV2Member24Game、waterV2MemberDirect等PNG，确认真实整机图及精确弹层定位；这不是所有产品UI状态的视觉验收。
- 实测pixel报告`tmp/frame-acceptance/pixel-report/report.json`：同surface可比、97变化像素、systemChromeNoise:true、pageGeometryVerified:false；不将系统时钟等噪声归因为业务变化，不更新baseline。

### 自动验证与交付

模式实现后全量1424项：1418通过、0失败、6跳过；最终viewport补丁与selector修复发生在该全量之后，分别通过2项直接门禁测试和26项registry测试。工具测试46/46、pixel-diff测试通过，focused ESLint、PowerShell语法解析及git diff --check通过。独立冷读未发现新增P0/P1。日志：`tmp/frame-full-test.log`、`tmp/frame-final-all-cases.log`、`tmp/frame-timeout-trace.log`、`tmp/frame-focus-{1,2,3}.log`。

日常入口使用`WEAPP_UI_SESSION_FILE=tmp/frame-acceptance/session.json`和`WEAPP_CAPTURE_SURFACE=simulator-frame`；变更源码/文档后必须双阶段refresh重签。旧Stable/Nightly同SDK页面图15×10 A/B仍未完成，30case单批的偶发响应超时仍是可靠性限制。未提交、push、preview/upload、发布、云部署或真实数据写入。

## 结论

授权阻塞已解除，且微信登录有效。Nightly 能获取真实 PNG，但尚不能作为当前 Stable 截图链的同环境替代：基础库与截图区域均未对齐。未执行、未声称完成 15 case × 10 轮合格 A/B，不升级正式控制层。

### 后续：固定用户已安装版本，不再循环安装

以上登录/截图结果属于隔离 2.02.2609082，不能套用到新版。用户指出已安装两次后，停止使用该旧副本：官方 quit 返回 success/canceled:false，再启动现有 `D:\Soft\微信web开发者工具`，读取 app.asar 的 package.json 确认为 2.02.2609102，进程路径同安装根，带 `--disable-backgrounding-occluded-windows`。本轮没有下载、安装或覆盖任何开发者工具。

新版 auth 任务 `auth_e6b1446dedb0b960c90275308c638a266d99f62e93d46789` 返回 success，authorized:true、cliTokenRequired:false、mcpTokenRequired:true。后续官方状态接口返回 401 / MCP_TOKEN_AUTH_ERROR / mcp_token_required，提示重新复制 Settings → Security 的 MCP 配置。因此新版门禁仍未通过，尚无新版截图结果；不能把 client 授权成功误写成所有权限就绪。

适用原文：`D:\Soft\微信web开发者工具\resources\app.asar.unpacked\wechatide-skill\references\environment-readiness.md` 的 MCP Token 节要求：`mcp_token_required` 时“立即请用户到设置→安全重新复制 MCP 配置并粘贴到客户端；停在门禁”，禁止自行翻找 Token。已告知用户，无需再安装；没有回退旧版绕过新版权限。

只读合同复核确认：旧图即使用 screen 390×844 而非 page 390×671 比例校验，sx=1.241026、sy=1.234597，仍不等比。没有独立 captureRect/边框/映射元数据时不能硬编码边框或从 PNG 尺寸倒推合同。保留原严格失败，未增加自动放行或裁图。

本轮最小工具修复：`selectToolInfo` 保留官方 `version`，让 doctor/receipt 携带实际开发工具版本；没有返回版本时记空值，不按路径猜测。一个直接回归先红后绿；`node --test tests/weapp-ui-screenshot-tool.test.js` 为 45 passed / 0 failed / 0 skipped，focused ESLint 与 `git diff --check` 通过。无业务行为、PNG阈值、来源门禁变更，未重跑业务全量或执行提交/发布。

原 Stable 恢复产物已于前轮取得并校验：官方 `stable_v2.01.2510290.json` 指向 `https://dldir1.qq.com/WechatWebDev/release/be1ec64cf6184b0fa64091919793f068/wechat_devtools_2.01.2510290_win32_x64.exe`；243209112 bytes、FileVersion 2.01.2510290、Tencent 签名 Valid、SHA256 `F817DB8DD71C9A9B27583C18A17C300144314162CA7B7F944B6262C458B127F7`。隔离解包 `%TEMP%\weapp-stable-2.01.2510290-audit-20260911`，尚未启动，保留为对照材料，不重复安装。

## 本次现场证据

### 2.02.2609102 严格会话与后台实测

Token 接入后的新版严格 prewarm 成功，独立端口39527、SDK3.17.2、390px，未改成功合同。两次focus-check使用相同签名源码快照，均为有效476×1026原始PNG，13项证据通过、仅page PNG比例失败，清理成功、finals未触碰。

- `focus-ac6b4bfa6c284a8f8090505564f0a51e`：653 samples、0 DevTools hits、3 unknown，samplingReliable:false；不能称焦点验收通过。主控查看candidate/launch.png确认完整模拟器外框。
- `focus-e84c7dceba6345cbbc0ac6da5ac276f9`：576 samples、0 hits、0 unknown、samplingReliable:true；最大采样间隔107.61ms，阈值110ms。仅该次采样窗口支持无观察到DevTools置前；由于PNG合同失败，总receipt仍ok:false、captureExitCode:2。回执路径见current.md。

公开安装代码只读复核（app.asar）：`js/8a0f2b17adff4205812a237e041dae6b.js` 的simulator_screenshot schema无region参数；`js/4d41de9788326cee3060bc535f3c75b5.js` 返回仅success/path/imageWidth/imageHeight；`js/1f543778895179c15185b3a3abf97d9f.js` 的App.captureScreenshot不传参数；`js/8c30fd019ca8e4ea3a0486e3cd18695c.js` 捕获整个normal simulator；`js/240979cff0aa18558b30bf9c89dd700f.js` 临时fitScale/fixed右下角并取整边界，未返回几何。49个已注册工具未发现等效captureRect/pageRect/zoom/frame读取能力。不能把内部函数当公开API或修改安装文件补洞。

建议但尚未实施：把“原始整机图”作为独立日常截图合同，保留来源与状态、PNG完整性、原子产物和清理门禁，明确系统chrome/墙钟像素噪声，不宣称page比例已验证、不覆盖旧page baseline；原page验收保留。此项改变了此前截图验收定义，需要用户选择；重复同一个失败API 150次不会补足原同环境A/B。

### 用户退出旧实例后的补充实测

- 用户退出后进程检查为空，隔离 Nightly 唯一启动成功。官方登录任务 `login_37eb2d5d-8b3b-4a3d-b217-1e6648d51dc1` 返回 `success/login_success`，随后状态检查通过。无需再次授权。
- 未修改 runner，使用隔离 Nightly `cli.bat`、空闲端口 39517、390px 和独立 session 执行现有 prewarm，8 项检查全部通过；实际基础库依旧是 3.17.2。它证明传统协议和严格来源绑定可用，不代表基础库已与 Stable 对齐。
- 第一次完整 launch：`2026-09-11T05-35-24-533Z-48176-9b991e49`，automator response timeout，selector/visual settle 已通过，清理成功，未晋升。
- 随后只读协议探测：Tool.getInfo 2ms、App.getCurrentPage 3ms；App.captureScreenshot 9622ms 返回 data（base64 长度 185328）。不能据首次超时断言接口完全不支持。
- 第二次完整 launch：`2026-09-11T05-36-42-303Z-11292-f5e24e6e`，PNG 有效，139006 bytes、484×1042，SHA-256 `521b77cea3a6085dde0d2771064b6737a06d04aac65f1801caa2c32f35081375`。主控亲自检查，画面含状态栏、手机外框、导航和 tabBar，与旧页面区图不同。
- 完整 receipt 的 14 项检查仅 png:false，其余 13 项通过；截图前后 fixture nonce/state hash 一致，projectProvenance:true、sourceSnapshot:true、fixtureCleanup:true。相对 390×671 内容 viewport 的比例仍为 1.2410/1.5529。退出码 1、finalsTouched:false 是正确拒绝，不是已验收成功。
- 证据根目录：`tmp/nightly-admission-20260911/`，第二次图与回执在 `runs/2026-09-11T05-36-42-303Z-11292-f5e24e6e/candidate/`。两次产物均保留，不覆盖既有 Stable final。
- 结论：传统 App.captureScreenshot 也返回整机图；之前“先验证传统接口是否能直接返回页面区”的分支已实测关闭。没有通过裁剪或放宽比例阈值把失败变成成功，15×10 A/B 尚未执行。
- 普通设置 UI 的 Computer Use 在 kernel reset 后仍初始化失败（os error 3），未点击或更改基础库。独立只读库存核验也未在 D:\Soft、项目 tmp 和已知临时目录找到原 Stable 2.01.2510290 可运行基线；旧 NW 残留不等于完整 Stable 安装。

以下保留首次授权恢复的历史记录。

- cwd `D:\projects(WIN)\badminton-miniapp`，branch `codex/online-audit-optimizations-20260828`，HEAD `6827efa3cf00182f4edacaefc5d399d58f82f260`；既有 dirty 改动保留。
- 旧 auth 任务恢复时本地服务未运行；启动同一个隔离 Nightly 后，官方 status 自动派生新任务 `auth_d4810788d6e9452065a6af9552bc7f143c521624dc9410f0`。
- 新任务两次查询后返回 `status:success`、`detail:authorization_success`、`authorized:true`、`alreadyTrusted:true`、`tokenRequired:false`。随后 status 为 `success:true`、`loginExpired:false`、`versionRelation:equal`、skill 0.3.10。不要继续要求用户重复授权。
- 官方 CLI 位置：`%TEMP%\weapp-nightly-audit-20260910\wechatide.cmd`；Nightly 2.02.2609082。测试期间保持该 GUI 实例运行，不要求持续前台。
- `open_project_window --project <exact repo> --window-mode liteMode` 成功，winId `s0`。
- 首次 `automation_runtime_info --action systemInfo` 超时；原始截图 `tmp/nightly-first-20260911.png` 显示 `something wrong in electron appservice`。
- 一次官方 `simulator_refresh` 后，`tmp/nightly-after-refresh-20260911.png` 已恢复正常首页，主控亲自检查；systemInfo/currentPage 均成功。首次异常属于 AppService frame 创建失败的表现，底层唯一原因未确定，不能归咎业务代码。
- simulator console 的 `grep -i error` 与 `grep -n .` 都为空；官方包的错误兜底走 DISPLAY_ERROR 通道，因此空 console 不等于没有启动错误。

## 对照准入

| 条件 | Stable 已验基线 | Nightly 实测 | 结论 |
|---|---|---|---|
| 基础库 | 3.14.2 | 3.17.2 | 不一致；common/private 配置均仍为 3.14.2，并非 private 覆盖 |
| 设备 | iPhone 12/13 (Pro)，390×844，pixelRatio 3 | 相同 | 此项一致 |
| 内容 viewport | 390×671，fontSizeSetting 16 | 相同 | 此项一致 |
| 原始 PNG | 717×1233，页面内容区等比 | 484×1042，包含状态栏/导航/tabBar 等完整模拟器画面 | 截图区域不同；Nightly 相对内容 viewport 的 sx=1.241、sy=1.553，不能通过现有等比合同 |
| 成功语义 | 页面、fixture、源码、会话、清理与 PNG 严格 receipt | 本次仅官方单图返回 success | 单图成功不能替代严格 receipt 或 A/B 通过 |

Nightly API 已显式 `--optimize false`，不是默认 JPEG 压缩导致的差异。真实 systemInfo 保留于 `tmp/nightly-systeminfo-20260911.log`，PNG 经现有 chunk/CRC/IDAT 校验有效。未裁剪图片、放宽校验、伪造来源或覆盖 Stable final。

公开安装包代码复核：微信模拟器按 project.libVersion 选择版本，`vendorService.translateVersion` 在指定版本不在可选集合时回退列表首项（app.asar 中 `js/4e401dc0e3b2af9707b7956f03f5a53e.js`）。因此存在版本不可用回退的解释，但未取得本次实际可选列表，不能断言该分支已触发，更不能断言 Electron 固定忽略 libVersion。未读取用户安全配置或凭据。

## 后续边界

### 后续只读复核与实际实例冲突

- SDK 选择器公开实现（app.asar `js/bd5007dc45481668a5c83fea8bc78dcb.js`）在挂载时 `getVendorConfig(Date.now())`，选择版本后 `setProjectLibVersion`/`makeSureVendorDownloaded`。应走详情→本地设置→基础库版本刷新/下载，不能手搬 vendor 包冒充版本可用。
- 传统 `auto --auto-port`、Tool.getInfo/App.getCurrentPage/App.captureScreenshot 仍存在；当前 prewarm 及路径缺失时的签名+marker 校验可复用，不需先改成功合同。Nightly 在端口占用时可能递增回退，因此必须继续核验实际 listener，不能只信请求端口。
- 与整机截图不同，传统 App.captureScreenshot 的客户端存在但页面区返回行为还需实测。不要仅因 simulator_screenshot 截全框就断言 Nightly 无法提供页面区截图。
- 后续现场恢复时，D:\Soft 安装已显示 Electron wrapper；隔离启动日志 `tmp/nightly-launch-stdout.log` 提示已有实例，新启动退出0。两处官方 status 均超时，当前主进程完整路径不可读；未强杀用户实例，等待其正常退出以建立唯一可验证测试实例。未修改安装目录、SDK配置或业务源码。

1. 不再把授权列为 blocker；若服务重启，先检查服务连接和已信任状态，不将新 auth 任务自动解释成旧授权丢失。
2. SDK 与原始截图内容区对齐后，才能接入与 Stable 等强的独立会话/源码/fixture/清理证据并执行原计划 15×10 A/B。未对齐之前重复 150 张不会证明原验收目标。
3. 当前继续保留 Stable 正式截图链；本次不修改 SDK 配置、不改业务代码、不改官方安装文件、不进行发布或云写入。
4. 诊断过程中另建并打开了无云调用的临时最小项目 `%TEMP%\weapp-nightly-minimal-20260911`（winId `s1`）；实际项目刷新恢复后未继续该对照，不能把它当作已通过测试。其窗口已通过官方 close_project_window 关闭，文件保留为可删除的本机诊断产物；实际项目窗口与已授权 Nightly 服务保持运行。

本轮只修改进度/诊断文档，验证 `git diff --check`；没有重复执行既有已通过的全量测试。
