# 小程序 UI 工具故障手册

日常入口是 `npm run ui:iterate -- <case>`。它只连接现有签名热会话；仅当身份、SDK、逻辑宽度等检查通过而源码快照变化时，才自动完成 challenge → 官方打开 launch 页并编译 → 签名刷新 → 截图。失败不循环重试。日常操作见 [截图工作流](weapp-ui-screenshot-workflow.md)，视觉完成条件见 [UI 验收](weapp-ui-acceptance.md)，路径与私有配置规则见 [Windows 环境](windows-dev-environment.md)。本手册负责故障分类和恢复，不改变授权、数据保护或验收门禁。

## 先看本轮回执，避免处理错工具

在当前源码工作区执行命令；主仓库是 `D:\projects\badminton-miniapp\main`，总目录不是 Git 根。先看失败命令返回的 `logDir`，读取该目录下的 `summary.json`。不要先重新安装、猜端口、换工具或重复授权。

```powershell
Set-Location 'D:/projects/badminton-miniapp/main'
npm run ui:iterate -- --help
npm run ui:screenshot -- --list
# 将下面路径替换为本次控制台的 logDir，而不是历史成功目录
Get-Content -LiteralPath 'tmp/ui-iterate-runs/<本次id>/summary.json'
```

`summary.json` 的重点字段：

| 字段 | 含义与下一步 |
|---|---|
| `failedStage` | `doctor`、`refresh-challenge`、`compile`、`refresh-after-compile` 或 `capture`；先查同名 `.stdout.log` / `.stderr.log`。参数在进入编排前被拒绝时没有这些日志。 |
| `stages[].exitCode` / `durationMs` | 子命令退出码和耗时。底层 doctor/refresh 的退出码 2 表示检查未通过，首次有效 source challenge 返回 2 是协议的一部分；不能把任意 2 都当成成功。编排最终失败返回 1。 |
| `caseDiagnostics[].failedChecks` | 该 case 的 `receiptValidation.checks` 中未通过项；异常发生得早时可能为空，仍需看 `error` 和底层日志。 |
| `caseDiagnostics[].error` | 首行错误；完整错误和 `runtimeExceptions` 在 candidate receipt / capture 日志中。 |
| `fixtureCleanup` / `storageFixtureCleanup` / `cleanupError` | 中性页面重建、本地临时资料恢复及错误。清理失败优先于重拍。 |
| `candidatePng` / `candidateReceipt` | 失败诊断材料；只有 `captureOk=true` 才列 candidate PNG。文件不存在或机器失败时不能拿旧 final 当作本轮结果。 |
| `publication.publicationState` / `promoted` | 批次是否完整发布；`indeterminate` 表示无法证明发布回滚完整，先保全文件并核对 hash。 |

成功摘要没有 `caseDiagnostics`，看 `screenshots`、`reviewStatus` 和对应完整回执。`reviewStatus: pending` 要求主控打开 PNG 审图；机器通过不代表 UI 已验收。

## 按失败阶段恢复

| 阶段 / 现象 | 最小诊断 | 恢复路径 |
|---|---|---|
| 参数拒绝、未知或重复 case | `ui:iterate -- --help` 与 `ui:screenshot -- --list` | 明确指定 1–3 个关联 case；不传 case、重复 case 或 focus-probe 模式均不适用。不要改用无参数 `ui:screenshot` 触发全量来排错。 |
| `doctor`：`configuration is invalid`，尤其 `session` / `runnerProjectPath` / `endpoint` | 核对 cwd、选中的 session 文件是否存在；按下面“会话丢失”处理 | 配置误指向则改为当前 exact worktree 的有效 session；没有可信 session 则首次预热。不能编辑历史 receipt 路径、手填 endpoint 或复制另一 worktree 的签名。 |
| `doctor`：只有 `sourceSnapshot=false`（允许同时 `marker=false`），其余 checks 全通过 | 看 doctor stdout 的 `checks`；这是 ui:iterate 唯一自动恢复类别 | 正常由编排自动刷新和编译。文档改动也属于当前完整 Git 签名。若自动流程失败，转到下两行，不删文档 hash 或放宽签名。 |
| `doctor`：只有 `marker=false`，`sourceSnapshot=true` | 看 doctor 是否可读marker，其余身份/项目/SDK/宽度/route均通过；可能是同源码手动重编译后marker丢失 | `ui:iterate` 不自动处理这一类。显式执行一次 `npm run ui:session:refresh`，由其重新验证并绑定marker；必须 `ok=true`、checks全部通过，再跑相关case。运行时读取异常或其他检查失败则按对应故障处理，不反复刷新。 |
| `refresh-challenge`：未取得有效 challenge | 看 `checks`、`pendingSession`、`action`，核对期间是否还有文件修改 | 暂停本轮工作区编辑，先修复报错项。source/身份/宽度不稳定不能靠反复 refresh 消除。有效 challenge 未成立时不执行编译。 |
| `compile`：官方动作没有明确成功、超时或包装器配置错误 | 同名日志；必要时一次 `node scripts/dev/wechatide-local.js check_wechatide_status` | 核对现有安装和客户端配置，不输出 Token、不自动 auth。恢复原连接后重新执行相关 case；不以 `simulator_refresh` 的成功替代明确页面编译。 |
| `refresh-after-compile`：`changedSourceCompileProven` 不为 true，challenge 仍在 | 看 `runtimeRecompiledForChangedSource`、`sourceStableDuringDoctor` 与 `action` | 确认 exact worktree 已明确编译、期间没有继续编辑。保留 challenge；不要伪造 marker 消失或手写 session。满足条件后一次重新运行相关 case，仍失败则停下检查编译/运行时。 |
| `doctor`：`listenerIdentity` / `sessionRecord` / `toolProjectPath` / `sdkVersion` 失败 | 一次 `ui:doctor` 的具体 checks 与进程/路径证据；配置无法连接时看 stderr | 进程、端口、安装、SDK或项目已变化，旧签名失效；按工作流完整新预热。源码 refresh 不能修复身份变化。 |
| `doctor` 或 capture：`viewport` / `expectedWidth` 失败 | 对照预期逻辑宽度、当前返回宽度和环境覆盖值 | 先纠正误留的环境覆盖；确实换设备时按工作流重新预热。用户已手动切设备并明确保持桌面的特殊情况，按工作流 rebind-viewport 两阶段协议处理。不要切设备来碰运气。 |
| session 锁 busy | 读取错误指出的锁文件，仅确认 owner PID/启动时间及正在进行的任务 | 有活跃 owner 则等该任务正常结束，不并发操作同一模拟器。owner 已失效的 stale 锁只由新 prewarm 受控恢复；不手删锁或凭 PID 存在性猜身份。 |
| `sessionNotPoisoned=false` / `sessionNotRecovering=false` | 错误指向 `<session>.poisoned.json` / `.recovering.json` | 保留标记和证据，停止复用；完整成功的新 prewarm 才能清除。损坏 JSON 也不能当成无标记。 |
| `capture`：route / query 不匹配，`reLaunch` 报页面未注册 | 查当前 `app.json` 与 case 的 route；结合实际运行时错误 | 页面确实未注册是源码问题。已注册仍报未注册且清理失败时，按下节恢复中性页；10-04实测官方 `simulator_open_page` 明确编到页面后恢复。不能仅重复普通刷新。 |
| `capture`：selector、caseData、nonce、横向溢出或 alignment 不通过 | candidate receipt 的对应 check、selector 数量/几何及 data hash | 判断 case 是否随已授权 UI 变化而过期，或当前源码有真实缺陷；只修直接原因和关联 case。不要删门禁、减少预期数量或延长等待以伪造通过。 |
| `capture`：runtime exception | candidate receipt 的 `runtimeExceptions`，结合 case 与堆栈定位 | 修复直接异常；console 事件不都等于异常。fixture 页面不证明实际云读写，云函数缺失等情况不能靠 fixture 冒充已解决。 |
| `capture`：PNG校验、捕获/automation超时 | 分辨连接、导航、ready、settle、`App.captureScreenshot` 哪个调用失败；先确认清理结果 | 按下节执行有条件的一次串行复测；复现则保留证据并停止截图循环，评估 DevTools版本/像素源/图形会话。不要改用桌面坐标截图冒充正式产物。 |

### 清理失败先处理状态

- `fixtureCleanup.ok=false` 或 `cleanupError`：本轮没有证明中性 launch 页及单页栈重建，当前页面可能还被冻结。停止下一轮 fixture，保留 candidate receipt。确认没有别的 runner 占用会话后，仅针对已定位的导航/编译故障使用官方打开中性页恢复；这会导航且可能编译，并非只读命令：

  ```powershell
  node scripts/dev/wechatide-local.js simulator_open_page 'D:/projects/badminton-miniapp/main' 'pages/launch/index'
  ```

  该底层包装器不自行获取 session 锁，执行前必须确认没有并发 owner。官方成功也不等于之前那批清理成功；仍需后续相关 case 取得新的完整清理回执。身份已失效、poison或recovering时走新预热，不能用打开页面绕过。
- `storageFixtureCleanup.ok=false`：临时 profile/openid 等本地状态未证明精确恢复。立即停止 fixture 和业务点击。保存错误、受影响键名及本地证据，不公开值。当前没有“回滚上次 storage”命令，原快照主要保存在本次 runner 内存；重启/重新预热不证明原值已恢复。先调查快照是否仍可取得，按原值/存在性恢复并验证；无法证明时明确记录缺口，不清空用户 storage、不写云数据，也不把新截图成功当成旧状态已恢复。
- `publicationState=indeterminate`：停止使用和覆盖本轮 final，保全 receipt、manifest、stage/backup 文件，核对逐目标旧/新 SHA-256。不要自动重拍覆盖证据，也不要宣称上一批 final 未改动。普通失败只有在回执证明完整回滚时才能说旧 final 保持。

### 什么时候只重试一次

源码、case、安装或配置已经修复，属于带新证据的验证，不是盲重试；先完成直接相关测试，再只跑关联 case。相同错误、相同条件下不反复执行。

偶发 automation/capture 超时仅在以下条件都满足后，可以做**一次**串行复测：无活跃 session owner；上一轮 storage 和中性页清理均通过；无 poison/recovering 和不确定发布；已结束并行全量测试等负载；一次只读 doctor 证明身份/SDK/宽度有效（仅 source drift 可交给 ui:iterate 编排）；窗口仍处于已恢复且在后台的支持状态。记录旧 run id 与新 run id，不覆盖失败记录。再次超时就停止，不提高 timeout、不循环刷新或预热。

2026-10-04曾在全量测试与截图并行时超时，串行复测约28.1秒成功；这两个样本不证明负载就是根因。默认测试与截图串行。最小化、锁屏或远程桌面断开不在支持范围；只诊断并记录，需要桌面恢复时按当前授权判断，不自动抢焦点。

## 会话丢失与首次建立

默认 session 是 `tmp/weapp-ui-background-session.json`，属于 gitignored 本地状态。git clone、清理 tmp、DevTools退出或路径迁移后，它不会自然恢复。

1. 若已有**当前 exact worktree**的真实 launch-signed receipt，设置 `WEAPP_UI_SESSION_FILE` 指向它，然后执行一次 `npm run ui:doctor`。仅源码变化可由 `ui:iterate` 自动恢复，其余失败按前表处理。不能从历史记录猜 endpoint。
2. 没有可信 receipt 或进程/安装绑定改变时，按 [首次预热](weapp-ui-screenshot-workflow.md#3-首次预热) 设置实际 CLI、exact project、未占用端口和预期逻辑宽度，运行唯一 launch 入口 `ui:prewarm`。该操作可能激活窗口；现实现要求本次明确前台预热授权及 `WEAPP_ALLOW_FOREGROUND_PREWARM=1`。已有同范围授权时不重复询问；没有时只暂停依赖实图的步骤，继续不依赖截图的实现、测试和诊断。不能永久保存该变量。
3. 成功后保留 DevTools为已恢复后台窗口，doctor核对新session，再 `ui:iterate` 拍关联 case。不要为日常一张截图重建会话。

只检查必要环境字段，不枚举整个进程环境或私有配置：

```powershell
# 未设置session变量时使用默认文件；这里只输出路径和存在性
$taskSessionPath = if ($env:WEAPP_UI_SESSION_FILE) { $env:WEAPP_UI_SESSION_FILE } else { 'tmp/weapp-ui-background-session.json' }
Test-Path -LiteralPath $taskSessionPath
[pscustomobject]@{
  SessionFile = $taskSessionPath
  CaptureSurface = $env:WEAPP_CAPTURE_SURFACE
  ExpectedWidth = $env:WEAPP_EXPECTED_WINDOW_WIDTH
}
npm run ui:doctor
```

`ui:iterate` 默认 `simulator-frame`，但保留显式 `WEAPP_CAPTURE_SURFACE` 覆盖。底层 `ui:screenshot` 默认仍是 `page`；排查frame时不要直接切到底层命令后误比较两种像素合同。frame截图包含系统区域，PNG尺寸不等于逻辑viewport，不用比例猜裁剪。

## 凭据、真实数据与诊断记录

- 状态检查优先 `wechatide-local.js check_wechatide_status`；包装器从现有配置取原客户端名和Token，客户端名大小写不能改。它仅允许状态、refresh、open_page，不自动申请授权。不要在命令、截图、报告或Git中粘贴Token，不打印整个 `config.toml`。包装器成功输出会脱敏配置Token，失败会隐藏原始错误载荷；这不意味着任何第三方输出或其他秘密都会自动脱敏。
- fixture只证明受控状态渲染。不得为了工具诊断点击保存/记账/录分或部署云函数；不以真实数据写入建立截图状态。页面原有网络读取可能出现在运行时日志中，分享诊断前只保留定位需要的字段并隐去个人信息。
- 一次故障只记录：case、失败阶段/检查名、run id、耗时、SDK/逻辑宽度/像素尺寸、错误首行、清理与发布状态、诊断动作、复测结果、尚未解决项。日志在tmp；需要长期留证时把必要脱敏结论写入 `docs/tasks/session-logs/`，由current链接，不把全过程追加到常驻规则。
- 保留失败candidate，不用旧PNG、浏览器近似稿、旧QR/preview替代当前真实截图。机器成功、视觉审查、真实云链路与真机系统交互分别报告；完成的工具修改按 [持续授权](../../AGENTS.md#交付与文档) 立即commit/push，上传、部署、发布或真实写入仍需独立授权。

脚本字段和命令以 `scripts/dev/weapp-ui-iterate.js`、`weapp-ui-screenshot.js`、`wechatide-local.js`、`weapp-ui-prewarm.js` 及当前 `package.json` 为准；观察记录与残余限制见 [2026-10-04工具研究](../reports/2026-10-04-agent-ui-workflow-research.md)。
