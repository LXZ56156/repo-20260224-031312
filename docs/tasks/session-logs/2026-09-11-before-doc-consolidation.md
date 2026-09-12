# 文档整理前的 current.md 快照（只读历史）

本文件完整保留整理前状态。其旧授权、端口、待办和测试结论不是当前操作指令；恢复任务只读 [current.md](../current.md)。历史正文中的仓库路径以仓库根目录解析。

# Current Task

## Status: stage18_simulator_frame_verified_batch_reliability_ab_pending

## Approved Route Adjustment (2026-09-11)

- 用户已明确“同意”新增原始整机图模式；不再对此重复审批。新增显式WEAPP_CAPTURE_SURFACE=simulator-frame，保留旧page模式和基线，保留来源/页面/fixture/PNG完整性/异常/清理门禁，不声明page几何等比。
- frame输出目录和runRoot自动分区，diff拒绝混合page/frame与不匹配回执hash，系统chrome像素噪声明示。实现与本轮验收已完成；整批可靠性和原A/B尚未完成。旧节“待用户决定”已被本节授权覆盖。
- 新模式实现后的全量测试1424项：1418 passed、0 failed、6 skipped；最终viewport门禁补丁后直接测试通过，focused ESLint与diff-check通过。首轮30case实测24通过，5个打水弹层旧选择器命中隐藏van-popup节点而失败，1个entryDetail官方响应超时；全部保留candidate，整批未晋升/未触碰旧final。runId `2026-09-11T08-03-21-707Z-71564-8a8aca1c`，根目录 `tmp/frame-acceptance/runs/simulator-frame/`。
- 隐藏弹层问题已按最小测试定位修复：只给现有direct根view增加唯一class并限定registry作用域，不修改UI结构/CSS/行为，不放宽全局可见性合同。registry直接回归26/26通过。
- 最终源码重新签名后30case单批27通过、3官方响应超时（waterV2MemberCorrection、waterV2OwnerCorrectionLong、shareRunning），整批未晋升、finalsTouched:false；这3case独立重跑3/3通过并原子晋升至独立诊断目录。同一源码30case分别已有通过回执，不等于单批30/30。未复现可定位的方法故障，因此未增加猜测性自动重试。
- 新frame模式launch连续3次focus-check均通过：596+582+569=1747次采样，DevTools前台命中0、unknown0、samplingReliable:true、captureExitCode:0。只证明热会话采样窗口未观察到抢焦；不覆盖冷启动/最小化/锁屏。
- 当前热会话：`tmp/frame-acceptance/session.json`，用户安装2.02.2609102、SDK3.17.2、390px。日常必须显式设置该session及`WEAPP_CAPTURE_SURFACE=simulator-frame`；源码变化后按双阶段refresh重新签名，不手改hash。
- 完整runId、采样回执、测试和像素报告见`docs/tasks/wechatide-nightly-admission-2026-09-11.md`顶部最新结果。以下旧page失败、待授权状态均为历史，不再要求安装或授权。未提交/发布/部署/写真实数据，原同SDK页面图15×10 A/B未完成。

## Latest Screenshot Verification (2026-09-11, 2.02.2609102)

- 新版严格 prewarm 通过，explicit port 39527、SDK 3.17.2、390px、exact worktree/Git/进程归属/后台启动参数均已绑定；独立 session `tmp/nightly-2609102/session.json`。本节在实测后更新，后续实测前需要重新绑定源码快照。
- 两次 launch focus-check 都成功得到实际原始图 476×1026，receipt 的 14 项中仅 PNG 页面区等比失败，其余13项通过；清理成功，finalsTouched:false，不晋升。主控检查第一张确认完整手机框/状态栏/导航/tabBar。
- 第一次 653 次采样，0 DevTools foreground hit，但3次 unknown，samplingReliable:false；不能用于无抢焦验收。第二次 576 次，0 hit/0 unknown、samplingReliable:true，支持该次热会话截图采样窗口未观察到抢焦，不证明冷启动/最小化/锁屏或10轮可靠性。
- 第二次采样回执 `tmp/ui-focus-probes/20260911-155412-908-e84c7dceba6345cbbc0ac6da5ac276f9.json`；截图回执 `tmp/nightly-2609102/runs/focus-e84c7dceba6345cbbc0ac6da5ac276f9/candidate/launch.receipt.json`。总结果仍失败（captureExitCode:2），不是完整截图合同通过。
- 当前版本49个公开工具没有发现截图时captureRect/pageRect/zoom/frame元数据或只截页面参数；官方实现临时fitScale并捕获完整模拟器，不能用screenRatio/固定边框裁剪自证。详见实测文档。
- 需用户决定的验收调整：建议日常截图新增明确的“原始整机图”模式，保留源码/会话/fixture/页面/设备/PNG完整性/清理校验，明确不承诺页面区像素等比，不与旧page baseline混用；原严格page模式和失败历史保持。该变化尚未实施、未获明确选择，原15×10同环境A/B仍未完成。

## Latest Connection Verification (2026-09-11)

- 用户显式提供凭据后，已在 Codex 用户级 config.toml 启用 wechatide stdio MCP，固定 D:\Soft\微信web开发者工具；凭据不写入仓库、不在日志或文档回显。以下历史 Token blocker 已解除。
- 官方 status 成功：loginExpired:false、versionRelation:equal、skill 0.3.10；stdio initialize 与 tools/list 实测成功，49 个工具，包含截图工具。当前对话原有工具目录是否热加载不作为连接成功的证明，以上为独立握手证据。
- 当前项目 automation_runtime_info 成功，实际 SDK 3.17.2、screen 390×844、window 390×671；新版 simulator_screenshot 返回 526×1134 原始 PNG，路径 `tmp/nightly-2609102-connected.png`。这只证明新版连接和诊断截图可用，不代表严格页面区 receipt 或 15×10 A/B 完成。

## Current Resume Result (2026-09-11, installed version selected)

- 用户反馈 MCP 配置已完成后的复验：本会话可调用工具及资源模板没有微信 MCP；固定新版 CLI 的 status 仍返回 401/mcp_token_required。此结果只证明当前调用未携带令牌，不能断言用户没有配置。下一步确认用户配置所在客户端和连接状态（不索取明文 Token、不读取安全文件），不能重复让用户安装或盲目重新生成令牌。
- 不再安装或启动旧测试副本。已通过官方 quit 正常退出 `%TEMP%\weapp-nightly-audit-20260910`，随后启动用户现有 `D:\Soft\微信web开发者工具`；安装包内 package.json 确认版本 `2.02.2609102`，当前主进程路径和后台参数均匹配该安装。
- 官方连接授权任务 `auth_e6b1446dedb0b960c90275308c638a266d99f62e93d46789` 已查询为 success/authorized:true；最初一次查询连接失败，下一次成功，未重复创建任务。它只证明 clientName 授权成功。
- 新版随后 `check_wechatide_status` 返回 HTTP 401、`MCP_TOKEN_AUTH_ERROR` / `mcp_token_required`；因此尚未取得新版登录/运行时/截图的通过结果。CLI 的 cliTokenRequired:false 不等于 MCP 不需要 Token。
- 当前唯一外部门禁：用户在开发者工具「设置 → 安全」重新复制带独立 Token 的 MCP 配置并配置到客户端。不得翻本地安全文件找 Token、改安全策略、切旧版绕过或继续未授权业务请求；不需要再次安装。恢复时使用本节新版路径，不复用旧 session。
- 原 Stable 官方安装包上轮已校验 FileVersion 2.01.2510290、Tencent Authenticode Valid、SHA256 `F817DB8DD71C9A9B27583C18A17C300144314162CA7B7F944B6262C458B127F7`，并隔离解包到 `%TEMP%\weapp-stable-2.01.2510290-audit-20260911`；未启动。此前“本地无 Stable”是恢复前历史，不再重复下载/安装。
- 原 P0/P1 历史通过仍有效；当前新版后台截图与 P2 的 15×10 A/B 尚未验收，不能把旧版实测推广到新版。以下均为旧实例历史。
- 本轮修复：selectToolInfo 保留官方 version 字段，doctor/截图回执不再丢弃实际工具版本；缺失时保持空值、不猜版本。新增直接回归先红后绿，截图工具测试 45/45 passed、0 failed/0 skipped，focused ESLint 和 git diff --check 通过；未重复全量业务测试，未提交/发布。

## Current Resume Result (2026-09-11, after user exit/login)

- 用户正常退出旧实例后，已启动唯一的隔离 Nightly 2.02.2609082；官方 login 任务返回 success，status 为 loginExpired:false、versionRelation:equal、tokenRequired:false。实例冲突和登录门禁均已解除，不再要求重复授权或退出。
- 现有严格 ui:prewarm 原样在 Nightly 成功：独立端口 39517、exact worktree、进程归属/后台参数、重连 marker、Git snapshot 和 390px 检查全部通过。隔离 session 为 `tmp/nightly-admission-20260911/session.json`，实际 SDK 仍为 3.17.2。
- 传统 App.captureScreenshot 已完成实测，不再是待验证猜测：首次 launch 请求超时；独立接口探测随后返回 data，第二次完整 launch 得到有效 484×1042 PNG，主控检查确认同样包含手机外框/导航/tabBar。receipt 中只有 PNG 等比合同失败，其他 13 项通过，fixture 清理成功，finalsTouched:false。
- 第二次产物：`tmp/nightly-admission-20260911/runs/2026-09-11T05-36-42-303Z-11292-f5e24e6e/candidate/launch.receipt.json`。保持失败，不裁图、不放宽合同、不晋升 Nightly。当前仍未完成原定义的同 SDK 15×10 A/B。
- 本节与实测文档在截图后更新，已改变 Git dirty manifest；隔离 session 只证明截图时的源码快照，后续 capture 前须按工作流重新绑定，不手改 session hash。
- Computer Use 重置后初始化仍报 `failed to write kernel assets: 系统找不到指定的路径。 (os error 3)`，未操作 SDK 选择器。已知本地目录内也未找到原 Stable 2.01.2510290 可运行安装；D:\Soft 已升级，历史 Stable session 不能视为当前可用。
- 下一步需恢复独立、版本可验证的 Stable 对照，并解决 Nightly 实际 SDK/截图区域合同；继续重复同样截图不能证明 A/B 通过。以下为此前冲突历史，不覆盖本节。

## Prior Instance Conflict (2026-09-11, resolved)

- SDK/截图对齐继续推进时，实际安装环境已与前次不同：`D:\Soft\微信web开发者工具\cli.bat` 现在是 Electron wrapper，存在 wechatide.cmd/skill 0.3.10；不能继续把该路径直接当作原 Stable 2.01.2510290。
- 隔离 exe 的启动日志明确返回“已有运行中的实例，已唤起已有窗口，本次启动退出”，退出码 0。当前主进程 PID 58184 的 ExecutablePath 不可读，多名子进程来自 D:\Soft 安装；隔离及该安装的官方 status 均 authorization timeout。前次授权成功仍是真实历史事实，这不是用户未授权的证明。
- 不强杀路径不可读、可能含用户未保存工作的主进程。需要用户正常退出当前微信开发者工具后，再启动唯一、版本已确认的测试实例；不要重复要求用户在聊天里授权。
- 新增只读复核已找到最短路线：官方基础库选择器挂载时刷新在线列表，选择 3.14.2 后官方下载；Nightly 保留传统 auto --auto-port 和 App.captureScreenshot，可先复用现有严格 prewarm/runCase，不需要先改成整机PNG裁剪或放宽证据合同。静态接口存在不等于现场兼容通过。
- 下一步：核验唯一实例/版本 → 官方 status → 版本选择与真实 SDK 核验 → 独立空端口、签名 session → 页面区截图实测 → 同环境 15×10 A/B。当前仍未完成 A/B。

## Latest Nightly Result (2026-09-11)

- 授权已实证成功：新任务 `auth_d4810788d6e9452065a6af9552bc7f143c521624dc9410f0` 返回 `authorized:true/alreadyTrusted:true`；status 为登录有效、skill 版本一致、tokenRequired:false。下面旧 pendingTask 为历史记录，不能再次据此要求重复授权。
- Nightly 首次 AppService frame 异常，经一次官方 refresh 恢复正常首页；实际 systemInfo/currentPage 与原始 PNG 已取得。
- A/B 准入未通过：Nightly 实际 SDK 3.17.2（项目 common/private 都为 3.14.2）；PNG 484×1042 含完整模拟器 chrome，不是 Stable 的页面内容区等比截图。保持严格来源/像素合同，不替换 Stable，不称 15×10 A/B 完成。
- 实测产物、独立复核与后续条件见 `docs/tasks/wechatide-nightly-admission-2026-09-11.md`。本次无业务源码/SDK配置修改，无发布、部署或真实数据写入。

## Nightly Resume (2026-09-11)

- 本轮 cwd/branch/HEAD 核对未变；保留已有 dirty 改动，未重跑既有已通过检查。
- 官方 `check_wechatide_status --skill-version 0.3.10` 已成功创建可查询的授权任务，不再直接返回 authorization timeout；但尚未证明登录或业务工具可用。
- `pendingTask`：`taskId=auth_9d1fe46bf9529f01789b3845f191cd3965dcc708b67aad53`，`taskType=auth`，`clientName=Codex`，最后状态 `pending`；已按官方 skill 查询 10 次，等待用户在 Nightly 完成授权。
- 恢复时先用现有隔离 CLI `%TEMP%\weapp-nightly-audit-20260910\wechatide.cmd -c Codex polling_task_result --task-id <上述 taskId>` 查旧任务，不重复发起 auth。成功后再查版本、登录和 token 门禁，全部通过才进入 A/B。
- 只读复核选定 15 case × 10 轮：`launch home mine create lobbyGuide schedule ranking analytics matchIdle matchEditing matchLocked matchError waterV2Member24 waterV2Member24Game waterV2SheetError`，统一 390px。A/B 必须分别签名、隔离输出且比较相同 SDK/设备/registry；不得复用 Stable session 或放宽 PNG/fixture/provenance 校验。现有 focus probe 仅支持单例且不支持 storage fixture，不能直接当成批量 A/B runner。
- 本轮仅完成授权检查与 A/B 只读准备，未实施 Nightly 适配、未执行 Nightly 截图、未宣称 P2 全部通过。

## Latest Verification (2026-09-10)

- 当前 HEAD：`6827efa3cf00182f4edacaefc5d399d58f82f260`，仍在以下 exact worktree/branch，本次改动未提交。下面 2026-09-03 的实现与验证段落保留为历史，不覆盖本节。
- Stable 后台截图已恢复：显式 GUI 启动参数通过进程链校验；10/10 launch focus-check 成功，3511 次采样中 DevTools 前台命中 0、unknown 0，采样可靠。仅证明采样窗口内未观察到抢焦，不包括冷启动/最小化/锁屏。
- 最新完整 registry 为 30 case / 15 页面，已真实截图 30/30 通过并整批晋升；新增 matchError，覆盖 idle/editing/locked/error。nonce、截图前后数据 hash、动态 reveal/geometry settle 全部启用。
- `ui:doctor` 已拆成真正只读；实测文件回执和运行时 marker 均不变。源变化的双阶段 challenge 改用 `ui:session:refresh`，不是重复 doctor。
- 自动 Prompt/Edit/Stop hooks 已停用，新增显式 `test:affected`；pixelmatch 仅报告；CI analyseCode/质量检查仅低频手动调用；fairness 测试使用确定性操作时钟，生产 deadline 未改。
- 全量测试 1421 total / 1415 passed / 0 failed / 6 skipped；check 通过，lint 0 errors / 42 warnings。云 SDK 4.x 离线审计已完成，23 个函数仍为 2.6.3，未部署。
- 原 P0/P1 已闭合；P2 的 Nightly 10 轮 A/B 尚未完成：官方 Electron Nightly 2.02.2609082 安装诊断通过，但 CLI 本机授权两次超时。不得将 Stable 10 连截冒充 Nightly A/B，也不得据此升级控制层。
- 逐项证据、限制和后续入口见 `docs/tasks/weapp-background-screenshot-validation-2026-09-10.md`。

## Exact State (2026-09-03)

- 工作目录：`D:\projects(WIN)\badminton-miniapp`
- 分支：`codex/online-audit-optimizations-20260828`
- 起点：正式线上客户端源码 `55bfc4fa319ab74a33d406f05fbdab975ab8cfb7`（`6.1.2-e60d827-r3`）
- 当前改动未提交、未 push，未执行 preview、upload、云函数部署、正式发布或真实数据写入。
- `.playwright-cli/` 与 `preview-qrcodes/` 是切换分支前已有的未跟踪目录，本任务未修改。
- 用户已批准持续推进后台截图链路优化，首要目标是日常截图不抢占桌面；实施方案见 `docs/tasks/weapp-background-screenshot-optimization-plan-2026-09-03.md`。
- 本阶段只授权本地截图工具、测试和文档改动；不授权产品 UI、commit、push、PR、preview、upload、发布、云部署或真实数据写入。

## Implemented Scope

1. 登录失败沿用现有动作级提示，失败请求释放后再次点击会直接重新登录，不增加全局兜底状态。
2. 首页缓存先显，按现有最多 20 条 recent IDs 一次读取，并阻止旧请求覆盖新结果。
3. 正式版未知错误保留操作名、重试建议和短诊断号，不暴露内部异常。
4. 关键按钮、chip、同步操作和高频裸点击区域使用至少 `44×44px` 命中区域。
5. “清除本地缓存”准确改名为“重置本地数据”，保持原 `wx.clearStorageSync()` 行为并列明影响。
6. 排名排序、复盘样本数和“我的战绩”本机口径明确展示。
7. 大厅状态区只保留唯一主 CTA，完整管理能力仍在后续原入口；同步删除清单对应的死字段、方法、样式和旧断言。
8. 录分页把锁、草稿、提交和重试状态集中到底部操作区。
9. 赛程仅在页面首次渲染时自动定位当前轮次，后续实时更新和刷新不再强制滚动。
10. 首页本地记录操作明确显示“从本机移除 / 已从本机移除”，不改变本地清理行为。
11. 完赛场次把实际提交者显示为“录分：姓名”，不再误称“本场裁判”。
12. launch 与 create 的资料门禁回跳保留已选赛制和预设。
13. 首页草稿复用现有 `draftStartReadiness`，不再把未分队、未组队或人数不符合预设的赛事误报为可开赛。
14. 资料页保存时先重传 pending 头像，再校验并保存新的 cloud fileID。
15. 资料页云端资料晚返回时，不覆盖用户已经开始编辑的字段，也不在离页后回写。
16. 批量录分页的占用跳转复用现有可清理导航计时器，离页后不再触发幽灵跳转。
17. 小队转和固搭循环赛的排名/复盘分享卡定位当前用户所属队伍，非参赛者仍保持原榜首卡片行为。
18. App 在异步登录前初始化并下发网络状态，页面的早期网络订阅不再被登录完成后的重置清空。
19. 大厅对无效固搭队伍或非法小队名单继续显示现有组队/分队任务，不再误报可以开赛。
20. “保存并开赛”仅在参数保存明确成功后调用开赛，保存失败时立即停止。
21. 网络异常后确认比分其实已提交成功时，继续执行既有批量下一场、自动下一场或返回赛程行为。
22. 批量跳过被占用场次首次同步失败时清除当前去重键，后续状态更新可以重新尝试。
23. 完赛页每次明确点击分享海报都能自动打开生成流程，不再受赛事级永久 storage 标记限制。
24. ranking/analytics 复用现有合并登录并在活动页面回填身份；自动海报等待身份结果后再生成。
25. `addPlayers` 对同一 `clientRequestId` 重放首次导入的完整计数，成功结果统一为既有云合同且保留旧客户端根级字段；赛事文档只保存 7 个数值统计，不保存被拒绝的原始姓名。
26. `submitScore` 成功后等待条件删除本次校验的锁代次，不再可能误删同场次后来取得或续期的锁。
27. `submitScore` 乐观更新失败时只重读一次赛事；同场同比分返回既有 `SCORE_SUBMIT_DEDUPED`，不同比分仍返回 `VERSION_CONFLICT`，赛事恰好删除则返回结构化 `TOURNAMENT_NOT_FOUND`。
28. 首页远端刷新成功后更新对应本地赛事缓存；远端缺失的 recent 赛事同步删除旧缓存和完赛快照。
29. 资料云同步在 resolve 或 reject 前若检测到本地保存时间已变化，返回最新本地资料且不写入旧云响应。
30. 批量录分占用跳转在离页时清除去重键，并以页面生命周期代次阻止 hide→show 后旧异步任务恢复导航。
31. `scoreLock` 使用可选 `lockSessionId` 隔离新客户端锁代次；旧代 heartbeat 返回 `LOCK_EXPIRED` 且不续期，旧代 release 不删除新锁，提交临时态和页面生命周期不会丢失或恢复过时代次。旧客户端不带字段时保持原合同。
32. 赛事读取仅在确认文档不存在时清除缓存和完赛快照；集合、环境或网络错误继续保留缓存。
33. 页面同步忽略同版本、同更新时间的重复文档，只有 `createdAt` 的旧文档仍可正常应用。
34. 首页离页时使旧 recent 请求失效，隐藏期间网络重连不会启动新刷新。
35. `deleteTournament` 在事务内重新确认草稿状态，避免确认后开赛仍被删除。
36. 移除成员、调整分队和固搭队伍兼容现有 `id`、`playerId`、`_id` 成员标识。
37. `removePlayer` 用既有请求日志保存成功和成功空操作，阻止移除、重加后旧请求重放。
38. 加入赛事按赛事和动作复用真实在途 Promise，不再返回伪成功，也不互相阻塞不同动作。
39. 资料门禁回到同一来源页面时使用返回栈，其他来源保持原重定向。
40. 设置、大厅保存与开赛流程统一使用现有生命周期代次和页面计时器，离页旧任务不再导航或覆盖当前表单。
41. 实时监听确认赛事删除后向全部订阅者发送终态、清空页面旧赛事并立即释放旧 channel；迟到初始化结果不会复活赛事。
42. 大厅 pending intent 在页面隐藏时清除，并在当前赛事已加载时直接消费，不再依赖重复文档更新。
43. Launch 的资料门禁使用单一入口锁和生命周期代次，双击或旧门禁返回不会重复叠加页面。
44. Create 在资料门禁前保存赛制、预设和名称；成功创建即记录 recent，离页后不再提示或跳转。
45. Share Entry 保留成功加入的持久化结果，离页后的旧成功或失败不再提示、刷新或导航。
46. 大厅导入、移除、分队、组队、取消、加入和资料保存全部接入同一生命周期代次；确认回调写入前和云请求返回后均会截断旧页面副作用。
47. Analytics 复制与 Feedback 提交在离页后只保留已完成的持久结果，不再修改旧页面 UI。
48. Home 全页同时只允许一个复制流程；成功导航前持续防重复，导航失败会释放；“赛事已移除”卡片不再进入不存在的赛事。
49. Home、Lobby 的复制以及 Lobby 加入流程均阻止 hide→show 后的旧成功、旧失败、二次资料写入和幽灵导航。
50. 后台截图链路拆成显式 `ui:prewarm` 与日常 connect-only runner；只有 prewarm 可能激活 DevTools，doctor/capture/focus probe 不包含窗口聚焦、移动或输入模拟；focus probe 使用单 case/no-storage/no-publish 模式，不触碰已验收 final。
51. launch-signed session 绑定 exact worktree、loopback listener PID/启动时间、DevTools 安装、SDK、viewport、AppService marker 与 Git manifest；源码变化必须通过“两次 doctor + 中间明确编译/重载”的 challenge，marker 首次缺失也不能自签。
52. 截图 registry 现有 29 个 case，覆盖 15/15 页面与录分 idle/editing/locked；本地 fixture 会隔离异步、临时资料门禁 storage 并在 finally 原样恢复，应用中途失败的 emergency rollback 也会阻止后续 case。
53. 每轮 PNG、per-case receipt 与 run manifest 采用整批 all-or-nothing 事务；PNG 校验 chunk/CRC/IDAT，回滚逐目标验证旧 SHA-256，无法证明时使用 indeterminate 三态，不会误报 final 未变。
54. prewarm/doctor/capture 共用 session 锁且 session receipt 在锁内读取；doctor/capture 拒绝 stale 锁，只有 prewarm 可用 token-bound claim 安全恢复。搬锁前持久写 recovery barrier，普通 acquire 前后与 focus child 启动前均检查，rename 窗口或搬锁后崩溃仍 fail closed，只有成功的新 prewarm 能清除。storage fixture 恢复后逐键复验，整轮 `finally` 通过 `reLaunch` 证明只剩一个中性 launch 页；selector 数量/非零尺寸在 500ms reveal settle 前后均需通过。
55. focus probe 动态追溯目标 DevTools 进程 ancestry，并把焦点采样绑定到具体 capture run/session/listener/Git；CIM/ancestry unknown 与采样间隔不可靠均 fail closed。超时只有在 poison 回读身份验证通过后才终止 child；poison 无法验证则不强杀并让存活 session 锁阻止复用，poison 文件存在即拒绝会话且只有新 prewarm 可解除。该静态合同后的现场结果与暴露的分类缺口见第 58 项。
56. 真实 Windows 预热暴露并修复三项本机兼容问题：Node 24 不直接 spawn `.bat` 且全局 Node 不能代替 DevTools bundled Node；automation listener 实际绑定 `::`；Windows PowerShell 默认代码页会破坏中文安装路径和 UTF-8 JSON。预热现经官方 `cli.bat` wrapper 启动，listener 查询强制 UTF-8 并接受 wildcard bind，focus JSON 使用严格 UTF-8 读取。
57. `miniprogram-ci` 已精确锁定为 `2.1.31`；新增旧 Home receipt 的专门严格合同回归，缺 project provenance/source snapshot 时明确拒绝。
58. 2026-09-03 现场验收已执行但失败：本机 DevTools `2.01.2510290`、基础库 `3.14.2`、390px、exact worktree 的 prewarm 成功；窗口 visible/restored/not minimized 且 ChatGPT 保持前台时，`launch` route/selector/settle 成功，但 `App.captureScreenshot` 45 秒超时。第二次原始协议调用也在后台 30 秒超时；没有生成 PNG。首轮 probe 虽为 0 次 DevTools 前台命中，但 48 次 ChatGPT 样本均因已退出父进程被分类为 unknown，采样也不可靠，因此不能宣称三连截或零抢焦验收通过。
59. 安装包调用链已把超时收敛到顶层 NW.js `global.Win.capturePage(callback)` 不回调；`onceWebviewStable` 最多 5 秒且会主动 resolve，不是 45 秒挂起来源。当前 NW.js 0.54.1/Chromium 91 进程没有 `--disable-backgrounding-occluded-windows`，与 Chromium Windows Native Window Occlusion 行为高度吻合。prewarm 现只对其子进程注入 `NW_PRE_ARGS=--disable-backgrounding-occluded-windows`，并从 listener 进程链命令行验证开关；旧单实例未继承时直接拒绝签发 session，不修改 DevTools 安装目录。
60. focus probe 不再向上追溯可能早已退出的普通应用父进程，而是按签名 DevTools 安装根和前台进程实际可执行路径做快速保守分类；同安装根的任何 DevTools 窗口都计为 target，路径不可读仍为 unknown。现场辅助调用已把 ChatGPT 判为 `non-target`、DevTools 判为 `target`，首次 ChatGPT 分类约 42ms 且进入缓存；完整 probe 仍需新的有效会话复验。

## Verification

- 各项聚焦测试均通过；最终首页/同步 5/5、大厅 24/24、列表与说明文案 9/9，通过 `git diff --check`。
- 阶段 2 聚焦验证：home/schedule 直接行为 10/10、schedule stale/UI 5/5。
- 阶段 3 聚焦验证：create/home 9/9、profile 42/42、match timer/sync/smoke 6/6、ranking/analytics/share-card 15/15，合计 72/72。
- 阶段 3 定点 ESLint 通过，最终只读差异审查无必须修复项，`git diff --check` 通过。
- 阶段 4 聚焦验证：App/sync 10/10、lobby 21/21、match/sync/smoke 97/97、ranking/analytics 44/44；自动海报身份等待调整后的直接验证 15/15。
- 阶段 4 定点 ESLint 0 errors，最终两轮只读交叉审查均无必须修复项，`git diff --check` 通过。
- 阶段 5 直接云合同测试 18/18；大厅导入、score lock、submit logic/幂等/比分边界及跨链路 smoke 38/38。
- 阶段 5 四个修改文件定点 ESLint 0 errors；共享模板检查通过且没有模板或派生公共库差异，最终只读复核无必须修复项，`git diff --check` 通过。
- 阶段 6 首页、资料、match 生命周期、score lock 及提交恢复的直接聚焦验证 69/69；云响应合同、权限矩阵、跨链路 smoke 与首页删除邻接验证 9/9。
- 阶段 6 定点 ESLint 0 errors（5 个既有 warning）；共享云模板检查通过，两轮只读交叉复核均无必须修复项，`git diff --check` 通过。
- 阶段 7 同步聚焦验证 49/49；阶段 8 云写入合同 20/20，云共享模板检查通过。
- 阶段 9 入口与设置生命周期独立验证 26/26；阶段 10 实时删除主验证 32/32、独立复核 25/25；阶段 11 入口流程 22/22。
- 阶段 12 写操作生命周期直接验证 24/24、邻接合同 34/34；独立复核发现的 Lobby 加入和复制遗漏已补齐并复核通过。
- 阶段 13 Home 复制与缺失记录验证 6/6；导航失败释放经独立复核通过。
- 阶段 12–13 最终合并聚焦验证 53/53；定点 ESLint 0 errors（14 个既有 warning），`npm run check` 与 `git diff --check` 通过。
- `npm run check` 通过。
- `npm run lint`：0 errors、42 个仓库既有 warning；本次新增 runner 不再产生 lint error。
- 全量测试首次运行：1356 total，1349 passed，1 个大厅旧数量断言失败，6 个 Windows 跳过；该唯一断言已按唯一主 CTA 更新并定点复跑 5/5 通过。按“避免冗余测试”要求未再次重复全量运行。
- 阶段 14 截图工具原聚焦验证为 66/66；本轮新增 Windows CLI wrapper、wildcard listener、UTF-8 JSON/进程路径、精确 `miniprogram-ci`、旧 Home receipt 拒绝和 occlusion/focus 分类回归后，合并聚焦验证为 69/69。静态通过不能替代 live acceptance。
- 本轮最终全量：1420 total、1414 passed、0 failed、6 个 Windows legacy WSL runtime skipped；`npm run check`、`git diff --check` 全部通过，`npm run lint` 为 0 errors / 42 个仓库既有 warnings。`ui:screenshot -- --list` 输出 29 case。
- 真实 prewarm 与后台截图已经执行；当前 `App.captureScreenshot` 在 visible/restored 后台窗口中连续超时。occlusion mitigation 与快速焦点分类已经实现并通过聚焦/辅助验证，但必须在完整退出旧顶层 DevTools 后由全新进程继承开关，才能做因果 A/B。诊断又切换了 listener，随后 tracked 文件继续变化，磁盘旧 session receipt 已失效；下次现场测试需新端口 prewarm。P0、P1、P2 原清单均未全部完成，逐项矩阵见 `docs/tasks/weapp-background-screenshot-optimization-plan-2026-09-03.md` 3.5。

## Stage 5 Implemented Boundary

阶段 5 只处理了当前线上源码实际调用链中的 3 个云合同问题：

1. `addPlayers` 对同一 `clientRequestId` 的重试重放首次完整导入计数，并把成功结果统一为既有 `okResult` 合同；根级计数字段继续保留，兼容旧客户端。
2. `submitScore` 成功后只删除本次校验过的锁，并等待删除完成，避免误删同场次后来取得的新锁。
3. `submitScore` 乐观更新失败时仅重读一次赛事；目标场次已经是同一比分则返回既有 `SCORE_SUBMIT_DEDUPED`，否则仍返回 `VERSION_CONFLICT`。

共享模板与所有派生公共库已核对一致。历史 `resetTournament` 在当前线上源码中没有调用入口，本阶段不为该死路径新增幂等体系或前端能力。

## Stage 6 Implemented Boundary

阶段 6 只处理当前线上链路中的 4 个竞态，没有改变页面文案、CTA、权限或排名规则：

1. 首页远端刷新成功后同步更新本地赛事缓存；远端已不存在的赛事同时删除对应缓存，避免下次进入或离线时重新显示旧数据。
2. 资料云同步返回前若本地资料已被保存更新，则丢弃该旧响应的 storage 写入，避免覆盖刚保存的新资料。
3. 录分页离开时同时清除批量占用去重键；异步刷新完成后、执行跳转前再次检查页面是否仍活动，避免回页后卡死或离页后幽灵跳转。
4. 录分锁增加向后兼容的可选会话代次；新客户端的 heartbeat/release 只作用于同一代锁，旧客户端不带代次时保持原合同。源码和直接合同已验证，云函数未部署。

## Stage 7–13 Implemented Boundary

阶段 7–13 只收口当前线上源码中的同步终态、云写入竞态、入口重复操作和离页旧任务：

1. 同步层只把明确的文档删除作为终态，重复版本不再覆盖页面，隐藏页不再被旧请求或重连刷新唤醒。
2. 云写入只补当前调用链必需的事务校验、成员 ID 兼容和移除幂等；未新增集合、迁移、开关或公共框架。
3. Launch、Create、Share Entry、Home、Lobby、Analytics、Feedback 复用现有 guard、timer 和生命周期代次，不新增兜底状态机。
4. 所有新增测试只覆盖对应竞态、重复写和终态合同；未重复运行全量测试，未进行视觉验收或任何线上动作。

## Next Action

日常使用已验证的 Stable 热会话截图链；源码变化按 `ui:session:refresh` → 明确编译/重载 → `ui:session:refresh` 更新签名，进程/端口变化才重新 prewarm。Nightly 授权/登录已通过，不需要用户再确认；下一步是先对齐真实 SDK 和截图内容区，再证明来源/fixture 合同不退化，才执行 15 case × 10 轮 A/B。未通过准入前不替换 Stable。当前持续批准不包含 commit、push、PR、preview、upload、云函数部署、发布或真实数据写入。
