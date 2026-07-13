# WeChat DevTools UI Screenshot Workflow

> 用于小程序 UI 改动后的真实视觉检查。Windows 工具链于 2026-07-12 在带括号的主路径完成迁移；`codex/ui-optimization-v2` 于 2026-07-14 完成 master fixture 的真实三页 smoke 与人工视觉复验。

## 当前链路

- 主源码：`D:\projects(WIN)\badminton-miniapp`
- 主 launcher：`D:\weapp-mcp-launcher\weapp-main-dev.cmd`
- preview/upload 镜像：`D:\projects(WIN)\badminton-miniapp-preview`
- preview launcher：`D:\weapp-mcp-launcher\weapp-mcp.cmd`
- 自动化：`ws://127.0.0.1:39420`
- 本地依赖：`miniprogram-automator@0.12.1`

日常截图只能使用主源码。preview 镜像只属于显式 preview/upload；WSL mirror 只有设置 `WEAPP_CODEX_DEV_MODE=wsl-mirror` 才启用。不要使用 `9420` 或元数据空壳 `D:\projects\badminton-miniapp`。

## 标准流程

```powershell
Set-Location -LiteralPath 'D:\projects(WIN)\badminton-miniapp'

# launcher 会 warm reuse；必要时才做 port-aware cold restart
& 'D:\weapp-mcp-launcher\weapp-main-dev.cmd'

# 必须是真实协议响应，不以 TCP listener 代替
npm run weapp:probe

# case 清单与频繁 UI 迭代用的三页 smoke
npm run ui:screenshot -- --list
npm run screenshot:smoke

# 单页与故障诊断
npm run screenshot:schedule
npm run screenshot:diagnose -- scheduleRunning
```

`screenshot:smoke` 固定覆盖：

1. `launch`
2. `scheduleRunning`
3. `home`

默认每 case 独立控制连接但不重启 DevTools；截图 surface 瞬时失败时最多重连重试一次。需要实验共享连接时显式传 `--reuse-connection`。整轮开始时脚本从 schema-v3 session record 绑定 39420 对应的 main PID/CreationDate 与 AppService runtime token，再从该 PID 的可见顶层窗口中选取带 DevTools 标题的真实主窗口，避免 `.NET MainWindowHandle` 被同进程空标题窗口替换。脚本保存原句柄、窗口状态和原前台窗口，临时最大化以保持 Chromium/NW.js surface 可绘制；恢复时验证原句柄仍有效且仍归属同一 PID。原来最小化就立即最小化，并精确恢复 restore 时刻仍有效的最新用户前台。截图期间不要手动最小化。

## 成功契约

脚本不能只看 DOM 或文件大小。每个正式 PNG 必须依次满足：

- PNG header、宽高和字节数合理；
- route、selector、期望文字与禁用文字检查通过；
- 指定 selector 的 DOM offset/size 能映射到真实 PNG；
- 对应图片区域有足够颜色与亮度变化，拒绝“顶部正常、下半空白”的 stale surface；
- 自动化把可见 fixture 文本临时改成同类型探针值，抓 `probe`，再恢复目标数据并连续抓 `candidate`、`confirmation`；探针帧必须显著不同，恢复后的两帧必须稳定一致；
- viewport 宽度由最宽页面容器推导，不能被靠右窄元素放大；
- 全部 case 先留在 staging，整组校验通过后才事务性替换正式图；后续 case 失败时前面 case 也不会覆盖旧图。

失败、超时、部分成功、空白或 stale-looking 图片不得覆盖旧文件，也不得追加 `docs/records/ui-screenshot.jsonl`。窗口状态未恢复、DevTools 仍占前台或假的 fixture 云同步错误同样 fail closed。只有 `--smoke` 固定整组或无参数 full matrix 全部通过才更新 `ui-screenshot-latest.json`；显式单 case/子集成功可以替换对应正式 PNG，但不覆盖 canonical latest record。记录包含 `runKind`、完整请求 case/argv、三帧耗时与 coherence、`windowRestore` 和 runtime diagnostic 指标。

## 当前内置用例

| Case | 页面 | 覆盖点 |
|------|------|--------|
| `launch` | `pages/launch/index` | master 赛制入口、规则说明与“发起” CTA |
| `create` | `pages/create/index` | master 创建确认页；名称输入、赛制确认、创建后流程与“创建并进入” |
| `home` | `pages/home/index` | master 首页引导、完赛提示、“查看战绩”与“再办一场” |
| `shareDraft` / `shareRunning` / `shareFinished` | `pages/share-entry/index` | master 分享落地完整信息与三态 CTA |
| `lobbyGuide` | `pages/lobby/index` | master Hero 数据、赛事导航、新人三步引导与比赛信息 |
| `ranking` | `pages/ranking/index` | master 最终排名、战绩卡/朋友圈/群分享及行内分享 |
| `scheduleRunning` | `pages/schedule/index` | 待录分 `VS`、完赛比分 |
| `schedule` | `pages/schedule/index` | master 完赛 Hero、最终排名与分享战绩 CTA |
| `analytics` | `pages/analytics/index` | master 赛后战报、分享、复制摘要/完整战报 |

`home` 使用 `switchTab`，其他 case 按配置使用 `reLaunch` 或 `switchTab`。fixture 路由不携带假的 `tournamentId=demo`，避免页面 `onLoad` 对真实云库启动无意义的 fetch/watch；页面稳定后再用 `setData` 注入本地数据。2026-07-13 的 master fixture 契约测试与 2026-07-14 的真实 smoke 均已通过；后续 UI 改动仍需重新逐图验收。

## 人工视觉检查

真实图片仍需逐图查看，至少检查：

- 信息层级、CTA 主次、文字换行、横向溢出、首屏密度；
- 卡片边界、重叠、裁切、模拟器下半区是否真实渲染；
- `scheduleRunning` 待录分双方中间是 `VS`；
- 完赛双方中间是 `21:17`，不挤入任意一侧；
- 长名字在卡内可读。

截图发现产品视觉问题时只报告；没有用户单点批准不得修改 UI、文案、CTA、导航或操作语义。

## 故障分型

`npm run screenshot:diagnose -- <case>` 先检查 route/DOM，再写 `*.diagnostic.png`，强校验通过才 promote。报告中的主要类型：

- `automation-port-or-connection`
- `navigation`
- `dom-selectors`
- `dom-text`
- `devtools-screenshot-surface`
- `blank-or-stale-visual`
- `timeout`

处理顺序：

1. `npm run weapp:probe` 同时验证 `Tool.getInfo` 与 `App.getCurrentPage`；
2. 重跑主 launcher，确认 audit 指向主源码；
3. 不要在截图尚未完成时手动最小化；脚本会临时最大化，并在整轮结束后恢复原状态和原焦点；
4. 跑单 case diagnose；
5. 仍失败时保留上张好图和 diagnostic JSON，不得用 DOM、layout 图或 mock 图代替实图。

## 2026-07-14 当前分支验收记录

- 冷启动只执行一次 `auto --project`，同一 AppService 最多等待 75 秒；本次真实 cold start 在 `65.524s` 完成，随后 `weapp:probe` 约 `184ms`。
- `launch`、`scheduleRunning`、`home` 三页 smoke 总时长 `58.369s`；窗口准备 `10.473s`，恢复 `5.280s`，从/to 最小化 `showCmd=2`，原前台焦点恢复成功。
- 三页分别为 `183353 / 229254 / 52898` bytes；每页探针帧有变化，恢复后的两帧完全稳定，`deprecatedFileApiWarningCount=0`、`fakeFixtureSyncErrorCount=0`。
- 人工检查确认 master 的 launch/home 视觉未被旧分支替换；`scheduleRunning` 的 `VS` 与 `21:17` 位于双方头像和姓名之间，长中英文姓名完整可读，无重叠或裁切。
- canonical evidence：`docs/records/ui-screenshot-latest.json`，分支为 `codex/ui-optimization-v2`，来源为 `D:\projects(WIN)\badminton-miniapp`。

## 2026-07-12 历史工具链验收记录

> 以下数字来自当时的 `feature/core-flow-simplification` 页面，只保留作迁移历史；当前分支结果以上一节为准。

- 初始迁移验收使用 schema v2；提交前复审已升到 schema v3，在 main PID/CreationDate、exact CLI `39421` 与 automation `39420` listener 之外，增加 exact `auto --project` 后写入的 AppService runtime token。任何 compile/reload/project-switch 导致的 token 缺失都会 fail closed。当前 runtime-bound warm 实测 `12.598s`；历史首次 cold 约 `43.4s`。
- `Tool.getInfo` 返回 DevTools `2.01.2510290`、SDK `3.14.2`；`weapp:probe` 同时取得 `App.getCurrentPage`，最终复审约 `199ms`。
- 首次故障注入中 `launch` screenshot 超时：旧 `scheduleRunning.png` SHA256 保持不变，记录仍为 0 行。
- Chromium/NW.js 在主窗口 `showCmd=2`（最小化）时会失去可靠 surface；脚本现在整轮临时最大化，结束后恢复最小化和原前台焦点。中途手动最小化会让整轮失败关闭。
- 增强 smoke 使用每 case 三帧 coherence 校验；schema-v3 与精确焦点恢复后的最新记录总时长 `60.521s`（外层约 `65.2s`）：`launch 17.011s`、`scheduleRunning 13.640s`、`home 13.282s`；窗口准备 `10.912s`、恢复 `5.639s`。此前 schema-v2 记录为 `54.003s`，未做完整窗口证明的更早记录为 `47.156s`。
- 图片分别约 `122KB / 182KB / 158KB`；来源记录为 `D:\projects(WIN)\badminton-miniapp`。`scheduleRunning` 的 `17→88` 探针检测到目标区域变化，恢复两帧像素稳定一致。
- fixture 路由和顶层 `data.tournamentId` 均保持空值；最终 smoke 记录 `fakeFixtureSyncErrorCount=0`，网络重连不会重新启动 `_id=demo` 的 fetch/watch。
- 人工确认 `scheduleRunning` 的 `VS` 与 `21:17` 均在双方中间，无重叠或裁切。

调试器中每 case 三组 `wx.saveFile/removeSavedFile 即将废弃` 与三次 `App.captureScreenshot` 数量一致，强推断来自 DevTools 内部实现；仓库 `npm run check:deprecated-wx-api` 为 0 调用。旧的 `document.get ... _id demo` 是 fixture 假 ID 触发的轮询错误，已通过无假 ID 路由消除；两者都不是最小化 surface 超时的根因。

## 历史基线（仅审计，不是当前命令）

- 2026-07-03 曾以 `D:\projects\badminton-miniapp` 作为当时主项目，验证 UI 点 3；目录后来再次迁移，该路径现已废弃。
- 2026-06-28 曾以 `D:\projects\badminton-miniapp-preview` 运行旧镜像长跑；该目录后来迁移到带 `(WIN)` 的新位置。
- 2026-06-22 的 13-case 结果属于当时路径与 DevTools 版本的历史证据。

历史记录保留原路径用于审计，不能复制为当前操作步骤。
