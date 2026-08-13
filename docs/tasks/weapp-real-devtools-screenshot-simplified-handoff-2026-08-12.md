# 真实微信 DevTools 截图简化交接（2026-08-12）

> 目标：用最少代码、最少门禁和最短链路取得本任务当前源码的真实微信 DevTools 截图，并完成 UI 验收。本文件只取代今晚为截图搭建的复杂诊断路线，不改变产品合同、用户可见改动审批或发布边界。

## 1. 当前事实

- 截图目标源码位于 `C:\Users\LIZIXUAN\.codex\worktrees\ba45\badminton-miniapp`；新任务必须让 DevTools 的 `Tool.getInfo` 返回该 exact project path，不能用 canonical 工作区、preview mirror、旧 QR 或旧截图代替。
- 今晚两次真实启动尝试均已消费：`94f` 在 controller 的 lock 时间窗前置检查处停止；`7f96` 启动了真实 DevTools，但 automation service 未就绪，未产生可验收 PNG。两者不得重放。
- 复杂链仍有两个已知 P1：cleanup 未透传 `stickyObservedTcpListenersClosed`；stability 跨轮使用下一次 STATUS 归属旧 listener 样本，可能漏记已退出进程的 wildcard listener。它们只阻断复杂诊断路线，不阻断本文的人工会话直连路线。
- 当前没有完成真实截图验收、主控逐图检查或最终双盲 UI 评审；没有因此提交、push、PR、preview、upload、发布、云部署或真实数据写入。

## 2. 直接废弃或绕过的组件

为完成本次截图，不再继续或依赖：

- private Desktop、managed launcher、native bootstrap、runner、controller、transaction；
- plan/lock/authority/suffix、短时授权 token、分层 receipt/schema、listener milestone；
- `NODE_OPTIONS` loopback shim、wildcard TCP/UDP/outbound 证明、全量网络隔离或端口归属审计；
- 自动启动/重启微信 DevTools、端口盲扫、端口轮换、失败后自动重试；
- 对同一技术链的重复双审、反例矩阵和全套静态审计。

`tmp/diagnostics/weapp-private-desktop-cdp-20260811/` 及今晚产生的 plan、lock、fixture、receipt 只作历史取证，保持原样，不删除、不修复、不作为新任务输入。

## 3. 保留的最小硬边界

- 不抢前台、不切换用户桌面、不调用 OS 输入或模拟鼠标键盘；DevTools 由用户手动打开、编译并保持为已恢复但可在后台的窗口。
- 不执行 preview、`mp:upload`、正式发布、Git push/PR、云函数部署或真实业务数据写入。
- 不扫描端口；只接受用户或当前会话明确提供的 `ws://127.0.0.1:<port>` automation endpoint。
- 只连接 loopback endpoint；连接前后不访问其他网络地址。
- fixture 仅使用仓库已有本地截图 fixture；若临时切换页面状态，必须由现有脚本完成并在进程退出后结束，不操作真实云数据。
- 用户可见 UI 若需要修改，仍须先得到该具体改动的明确批准；本交接本身只授权截图与验收。

局域网暴露、wildcard TCP listener、UDP/outbound 和“全量网络隔离证明”不再是本目标的阻断项，也不在结果中宣称已证明。

## 4. 最短执行链

必要输入只有三个：

1. 用户已用微信 DevTools 打开并编译上述 exact worktree；
2. 一个已明确给出的 loopback mini-program automation WebSocket endpoint；
3. 本次要验收的现有 `npm run ui:screenshot -- --list` case，优先复用仓库已有 fixture。

执行顺序固定为：

1. 读取 `AGENTS.md`、`docs/tasks/current.md`、本文和 `docs/tools/weapp-ui-screenshot-workflow.md`，确认 Git/worktree 状态，但不清理或改写现有 WIP。
2. 检查 endpoint 为显式 loopback 值；不得通过监听表或范围扫描猜测。
3. 对该 endpoint 做一次有界身份探针：`Tool.getInfo` 的 project path 必须精确等于目标 worktree；`App.getCurrentPage` 必须能返回实际 route/query。任一不符立即停止。
4. 运行一次 `npm run ui:screenshot -- --list`，选择最少且直接覆盖本次页面/状态的 case。
5. 临时设置 `WEAPP_WS_ENDPOINT` 和新的 `WEAPP_SCREENSHOT_DIR`，每个必要 case 只执行一次 `npm run ui:screenshot -- <case>`；结束后清除本进程环境变量。
6. 主控直接查看每张 PNG，核对非空、尺寸、当前页面、主次层级、44px 触达、文字换行/截断、对齐、边界、裁剪、遮挡和溢出。
7. 仅在当前高密度 UI 确实相关时，以现有 fixture 覆盖最小状态集：320/390/430、24 人与长昵称、搜索空结果及 ≥44px 清除入口、字体放大、键盘/safe-area。没有真实截图的档位必须明确写成结构检查，不能冒充实图。
8. 全部图固定后，只做一次最终双盲 UI 评审；两位评审拿到同一组当前源码实图和产品合同，互不引用。主控汇总共同结论、分歧和采纳理由，不再做重复技术双审。

## 5. 成功判据

同时满足以下条件才可称“真实 DevTools 截图与 UI 验收完成”：

- endpoint 为显式 loopback，`Tool.getInfo.projectPath` 精确命中目标 worktree；
- `App.getCurrentPage` 的 route/query 与 case 预期一致；
- 每个必要 PNG 是本次新生成、可读取、尺寸合理且肉眼非空；
- 主控逐图完成 AGENTS.md 要求的视觉检查；
- 最终双盲评审共同 P0/P1 已关闭，或不存在共同 P0/P1；
- 如实区分真实截图、结构检查和未覆盖状态；
- 没有发生发布、部署、真实数据写入或前台/输入操纵。

## 6. 单次停止条件

- endpoint 缺失时只向用户索取，不猜端口、不启动 DevTools。
- 身份探针、页面路由或首次 capture 任一失败，立即保留输出并停止；不得自动重连、换端口、重启或再次运行同一 case。
- 图像暴露 UI P0/P1 时，先把问题和最小改动提交用户批准。获批后只做一次 tests-first 最小修复和一次重新抓图；未获批不改产品。
- 同一会话出现 stale compile、非目标 project、空白/超时或无法证明图像新鲜度时，本轮结论为未完成，不用旧图、浏览器稿或 DOM 代替。

## 7. 现有改动的取舍

继续保留并使用：

- 当前 worktree 的产品源码和已经批准的 WIP；
- `scripts/dev/weapp-ui-screenshot.js`、`scripts/dev/water-v2-screenshot-fixtures.js` 及已有聚焦截图 case，前提是新任务先读取实际 diff 并确认它们没有引入发布或真实数据副作用；
- 已有测试、真实图片和诊断 artifact 作为历史证据，不删除。

不应继续：

- `tmp/diagnostics/weapp-private-desktop-cdp-20260811/` 内的复杂链修复；
- private Desktop/后台透明遮挡/Win32 自动启动路线及其 plan/lock/native/controller 级联；
- `NODE_OPTIONS` shim、全量 listener confinement、receipt/schema 扩张和为它们追加的技术审计。

本交接不要求回滚或删除这些中间稿；新任务只是不再以它们为执行依赖。任何清理应另开任务并单独授权。

## 8. 新任务的起点与最小验证

新任务从这里开始：

1. 核对当前 worktree、dirty diff 和可用 screenshot cases；
2. 确认用户是否已经在 DevTools 打开 exact worktree，并取得明确 automation endpoint；
3. 若前置齐备，直接做一次身份探针和最小 case capture；若不齐备，只报告缺少的单一输入并等待。

验证范围：

- 仅抓图且不改代码：只需 endpoint/project/page 身份探针、PNG 检查、主控视觉检查和一次最终双盲 UI 评审。
- 若只改截图 helper/fixture：运行对应聚焦测试、`node --check`、一次真实 capture 和 `git diff --check`；不运行 private Desktop/transaction/controller/native 套件。
- 若用户批准产品 UI 修复：按改动运行页面聚焦测试、`npm run check`、`npm run lint` 与 `git diff --check`，再做一次真实 capture；全量测试仅在改动风险确实需要时运行并如实记录既有 flake。

不得为证明“稳妥”自行扩回今晚的复杂链。后续 commit、push、PR、preview、upload、发布、云部署和真实数据写入仍分别需要用户的新授权。
