# WeChat DevTools UI Screenshot Workflow

> 用于小程序 UI 改动后的真实视觉检查。

## 适用场景

- 任何 `miniprogram/pages/**` 的 WXML / WXSS / 用户可见文案 / CTA / 页面状态变更。
- 分享落地页、排名页、赛程页、首页赛事卡和 lobby 核心状态等用户链路 UI。
- 截图前需要确认页面真实渲染，而不是只看单元测试或 DOM 数据。

## 结论

后续真实 UI 截图优先在 Windows 主开发项目执行。当前日常开发链路：

- launcher：`D:\weapp-mcp-launcher`
- 主开发项目：`D:\projects\badminton-miniapp`
- 启动脚本：`D:\weapp-mcp-launcher\weapp-main-dev.cmd`
- DevTools CLI：`D:\Soft\微信web开发者工具\cli.bat`
- 自动化端口：

```bash
ws://127.0.0.1:39420
```

不要使用旧端口 `9420`。

旧镜像链路 `D:\weapp-mcp-launcher\weapp-mcp.cmd` + `D:\projects\badminton-miniapp-preview` 仅保留给 preview/upload 镜像用途，不再作为日常开发或截图验收项目。

Codex 日常 hooks 已切到跨平台 Node wrapper。Windows 下 wrapper 调用主项目 preflight，不再触发 WSL mirror sync；非 Windows 默认 no-op，只有显式设置 `WEAPP_CODEX_DEV_MODE=wsl-mirror` 才启用旧 preview/upload 镜像链路。`install-cloud-deploy-hook.sh` 在 Windows 可用，但必须通过 Git Bash 执行：`D:\Soft\Git\bin\bash.exe scripts/install-cloud-deploy-hook.sh`。当前 Windows 本机已安装 `.git/hooks/post-commit`，并通过 `SKIP_CLOUD_POST_COMMIT_DEPLOY=1` skip 验证；它只做 commit 后云函数变更检查，不应用作部署测试。

Windows 端曾通过单页、跨页、每 case 重连、快速切换、同页高频和 3 分钟长跑测试；截图文件均大于 20KB，未出现空白图、超时、连接断开或 DevTools 卡死。2026-07-03 主项目迁移验收中，`tmp\ui-screenshots-actual\scheduleRunning.png` 已生成有效实图并确认 finished score `21:17` 位于双方中间；同日后续重跑出现 `App.captureScreenshot` 超时，但端口、页栈和 DOM 正常，作为 DevTools surface 运维问题单独排查，不阻塞环境迁移。

`miniprogram-browser` 适合做运行态健康检查和结构快照；在 WSL + 微信开发者工具下，官方 page screenshot 通道可能超时或生成空白图。真实 UI 验收优先使用 Windows 端 `miniprogram-automator` / `scripts/dev/weapp-ui-screenshot.js` 链路。

## 标准流程

### Windows 端推荐流程

1. 在 Windows 端启动或恢复开发者工具自动化：

```powershell
cd D:\weapp-mcp-launcher
.\weapp-main-dev.cmd
Test-NetConnection 127.0.0.1 -Port 39420
```

2. 在主项目运行目标截图脚本或临时截图检查：

```powershell
cd D:\projects\badminton-miniapp
$env:WEAPP_WS_ENDPOINT="ws://127.0.0.1:39420"
$env:WEAPP_SCREENSHOT_DIR="tmp\ui-screenshots-actual"
node scripts/dev/weapp-ui-screenshot.js scheduleRunning
```

涉及 `create` 旧路由重定向的 case 可能需要 8 秒级等待，不要用过短的总超时包住多轮 case。多 case 压测时让 Node 进程显式退出，避免 `miniprogram-automator` 残留事件句柄导致测试 harness 等待超时。

如果截图失败或怀疑 DevTools surface 异常，先跑诊断脚本。诊断脚本会先检查路由、selector、期望文本和 DOM，再尝试截图；截图先写入 `*.diagnostic.png`，只有确认非空白后才覆盖正式 PNG：

```powershell
npm run screenshot:diagnose -- scheduleRunning
```

### Legacy Preview/Mirror 流程

仅在需要小程序 preview/upload 镜像时使用旧链路：

```powershell
cd D:\weapp-mcp-launcher
.\weapp-mcp.cmd
```

该链路打开 `D:\projects\badminton-miniapp-preview`，不要用于日常开发截图。

### WSL 侧辅助流程

1. 启动或恢复开发者工具自动化：

```bash
./scripts/dev/weapp-dev.sh preview
```

2. 确认自动化链路健康：

```bash
WECHAT_DEVTOOLS_CLI='/mnt/d/Soft/微信web开发者工具/cli.bat' \
npx --yes miniprogram-browser doctor \
  --session growth-ui \
  --project /home/lizixuan/projects/badminton-miniapp \
  --devtools-project 'D:\projects\badminton-miniapp-preview' \
  --project-map '/home/lizixuan/projects/badminton-miniapp=D:\projects\badminton-miniapp-preview' \
  --auto-port 39420 \
  --timeout 30000 \
  --json
```

如果 `39420` 已被 live session 绑定，先查看 session：

```bash
WECHAT_DEVTOOLS_CLI='/mnt/d/Soft/微信web开发者工具/cli.bat' \
npx --yes miniprogram-browser session list \
  --project /home/lizixuan/projects/badminton-miniapp \
  --json
```

然后复用列表里的 session 名称运行 `doctor`，不要重复用新 session 绑定同一个 `--auto-port`。

3. 先用结构快照确认页面节点和布局比例：

```bash
WECHAT_DEVTOOLS_CLI='/mnt/d/Soft/微信web开发者工具/cli.bat' \
npx --yes miniprogram-browser snapshot -i --layout \
  --session growth-ui \
  --project /home/lizixuan/projects/badminton-miniapp \
  -c --timeout 30000
```

4. 截真实 UI 图：

```bash
WEAPP_SCREENSHOT_DIR=tmp/ui-screenshots-actual \
WEAPP_SCREENSHOT_TIMEOUT_MS=45000 \
npm run ui:screenshot -- rankingRunning
```

不传 case 时会跑全部内置增长 UI 用例：

```bash
WEAPP_SCREENSHOT_DIR=tmp/ui-screenshots-actual \
WEAPP_SCREENSHOT_TIMEOUT_MS=45000 \
npm run ui:screenshot
```

脚本会对每个 case 独立连接和断开，避免一个 stale screenshot 通道拖垮整轮。

列出可用 case：

```bash
npm run ui:screenshot -- --list
```

## 当前内置用例

| Case | 页面 | 覆盖点 |
|------|------|--------|
| `launch` | `pages/launch/index` | 赛制选择与直接创建 |
| `lobbyEmpty` / `lobbyWaiting` / `lobbyReady` | `pages/lobby/index` | 空名单、等待、可开赛三态 |
| `scheduleRunning` | `pages/schedule/index` | 当前待录分与继续录分 |
| `matchIdle` / `matchEditing` | `pages/match/index` | 开始录分、编辑并提交 |
| `rankingRunning` / `rankingFinished` | `pages/ranking/index` | 实时排名、最终排名 |
| `home` | `pages/home/index` | 继续比赛、渐进筛选与完赛卡 |
| `shareDraft` / `shareRunning` / `shareFinished` | `pages/share-entry/index` | 加入、查看对阵、查看排名 |

## 最新验证记录

2026-07-03 Windows 主开发迁移：

- 日常项目改为 `D:\projects\badminton-miniapp`，launcher 改为 `D:\weapp-mcp-launcher\weapp-main-dev.cmd`，自动化端口仍为 `ws://127.0.0.1:39420`。
- 旧 `D:\weapp-mcp-launcher\weapp-mcp.cmd` 和 `D:\projects\badminton-miniapp-preview` 保留给 preview/upload 镜像用途。
- Codex hooks 改为 Windows 主项目 preflight/stop，不再执行 WSL -> Windows mirror sync。
- `scheduleRunning.png` 有效实图已确认：待录分卡中间为 `VS`，已完赛比分 `21:17` 位于双方中间，长名字两行内可读。
- 后续重跑 `scheduleRunning` 时 `App.captureScreenshot` 超时；`39420` 端口、page stack 和 DOM 均正常，记录为 DevTools screenshot surface 后续问题，不阻塞本次迁移。
- Codex preflight 已修正为空 prompt / 非小程序 prompt 跳过，避免刚打开 Codex 就自动启动 DevTools；可用 `"微信截图" | node .codex/hooks/weapp_preflight.js` 手动验证相关 prompt 才触发。

2026-06-28 Windows launcher 截图通道验证：

- `D:\weapp-mcp-launcher` 通过 `weapp-mcp.cmd` 打开 `D:\projects\badminton-miniapp-preview`，`ws://127.0.0.1:39420` 可稳定连接，`9420` 不可用。
- 单页截图成功，连续 10 张同页截图成功；页面切换截图 `/pages/launch/index`、`/pages/home/index` 成功。
- 多页面顺序切换 9/9 成功；每 case 重新连接 5 轮共 45/45 成功；快速切换 20/20 成功；同页面高频 30/30 成功；3 分钟长跑 18/18 成功。
- 有效截图目录 `D:\weapp-mcp-launcher\tmp-screenshots\multi-page-orchestrated` 和 `D:\weapp-mcp-launcher\tmp-screenshots\long-running` 中 PNG 均大于 20KB；未出现空白图、连接失败或 DevTools 卡死。
- `/pages/create/index?mode=multi_rotate&presetKey=rotation_8`、`/pages/schedule/index?tournamentId=demo`、`/pages/ranking/index?tournamentId=demo` 均截图成功。`create` 旧路由耗时约 7.5s，应单独给足等待时间。

2026-06-22 核心流程简化终验：13 个内置 case 全部 `ok=true`，每张 PNG 为 29–134KB，已完成两轮逐图检查。输出目录为 `tmp/ui-screenshots-actual/`，自动化端口为 `ws://127.0.0.1:39420`。

`home` 是 tabBar 页面，脚本使用 `switchTab`；其他 case 使用 `reLaunch`。详细记录见 `docs/tasks/session-logs/20260622-core-flow-simplification.md`。

## 判断标准

- 截图文件大小应明显大于 20KB；小于该值通常是空白或失败图。
- 同时查看脚本输出的 `dom`：重点看文本是否完整、元素尺寸是否异常、`offset` 是否明显重叠。
- 每个 UI 页面至少检查：信息层级、CTA 主次关系、文字换行、横向溢出、首屏密度、增长方案意图是否清楚。
- 涉及用户可见修改时，先输出优化方案给产品/用户确认，再实施。

## 故障处理

- `mcp__weapp_dev` 报 `Transport closed` 时，不要依赖 MCP 截图；改用 direct `miniprogram-automator` 脚本。
- `miniprogram-browser screenshot --mode page` 超时或空白时，不要连续硬试；先跑 `doctor` / `snapshot` 判断运行态，再用 `npm run ui:screenshot`。
- 如果 direct screenshot 也连续超时，先执行 `./scripts/dev/weapp-dev.sh preview` 重启开发者工具自动化，再单页重试。
- 如果 WSL/Linux 侧 direct screenshot 仍然卡在连接或输出空白图，不要继续硬试；切到 Windows 端 launcher 复测同一 case，并以 Windows 端真实截图作为 UI 验收依据。
- 新版开发者工具若 DOM 正常但 PNG 空白，同时 simulator 区域不可见，应先最大化工具窗口并确认“开发者工具: 模拟器”已显示；仍为空时检查 simulator webview 是否为零尺寸/隐藏 surface，再恢复真实 surface 后重试。不得用 layout 图或 mock 图替代。
- `screenshot --mode layout` 只作为结构/重叠辅助，不作为高保真视觉验收依据。
