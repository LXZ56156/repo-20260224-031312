# Windows Main Development Environment

> 本文记录当前 master-based 独立打水 worktree 的实际 Windows 合同。不要套用 `codex/ui-optimization-v2` 后续完整工具链的命令、records 或固定端口假设。

## 路径角色

| 路径 | 角色 |
|---|---|
| `D:\projects(WIN)\badminton-miniapp` | canonical Git 工作区；当前有用户自有 dirty 内容，不得在本任务切分支或覆盖 |
| `D:\projects(WIN)\badminton-miniapp-worktrees\water-court-vant-spike-20260807` | 当前开发源码与命令工作区 |
| `D:\projects(WIN)\badminton-miniapp-preview` | 只有明确 preview/upload 流程才可使用的镜像，不是源码权威 |
| `D:\projects\badminton-miniapp` | 元数据空壳，禁止作为源码或 DevTools 项目 |
| `D:\Soft\微信web开发者工具\cli.bat` | 本机微信开发者工具 CLI |

日常编辑、测试和截图都在 `docs/tasks/current.md` 指定的 active worktree 执行。Git 是 worktree/机器间的源码交接方式；不要把 preview 镜像或旧 WSL checkout 复制回当前源码。

## 当前可用命令

以下命令来自本 worktree 的 `package.json`：

```powershell
npm test
npm run check
npm run lint
npm run check:deprecated-wx-api
npm run check:cloud-common
npm run ui:screenshot -- --list
npm run ui:screenshot -- <case>
```

当前没有 `verify:light`、`verify:full`、`verify:windows-env`、`screenshot:smoke`、`screenshot:diagnose`、`weapp:probe` 或 `records:latest`。若确实受阻，只做最小、独立、可审计的工具适配；不得整体迁入旧分支工具链。

普通 Windows npm 脚本不得依赖全局 `script-shell` 或裸 `bash`。需要执行仓库 `.sh` 的脚本统一通过 `scripts/run-bash-script.js` 和 `scripts/lib/git-bash.js` 解析 Git Bash。`npm run check` 已使用该入口。

本机 2026-08-08 的全局 `npm config get script-shell` 仍是 `D:\Soft\Git\bin\bash.exe`。不要为单个任务永久修改用户配置；需要证明 Windows-native 外层时，仅在当前 PowerShell 进程覆盖：

```powershell
$env:npm_config_script_shell = (Get-Command powershell.exe).Source
try {
  npm run check:cloud-common
  npm run lint
} finally {
  Remove-Item Env:npm_config_script_shell -ErrorAction SilentlyContinue
}
```

仓库 Node guard 仍会为确需 `.sh` 的内层命令精确选择 Git Bash。当前 23 个云函数的 shared-lib 检查在本机约需 124 秒；短于该时长的外层 timeout 不能写成检查失败或通过。

## DevTools 会话与 endpoint

端口由具体 DevTools/CLI 会话分配，不是永久常量。2026-08-08 当前会话观察到 `39420` 为 IDE HTTP、`39432` 为 mini-program automation；截图验收时还曾出现 `39424` CDP，之后该 listener 已消失。

不要：

- 把“端口能监听”当成协议健康；
- 把 CDP 端口传给 `miniprogram-automator`；
- 因脚本默认写着 `39420` 就相信它是 automation；
- 扫到任意 DevTools 后直接截图，忽略 project path。

必须确认 endpoint 属于 exact worktree，并能响应 `Tool.getInfo` 与 `App.getCurrentPage`。截图时显式设置 `WEAPP_WS_ENDPOINT`；完整流程见 `docs/tools/weapp-ui-screenshot-workflow.md`。

## 后台窗口约束

用户不接受每次截图占用整个前台窗口。DevTools 可保持 restored 并置于其他窗口后方；不要依赖 minimized surface，因为 `App.captureScreenshot` 可能超时。当前轻量截图脚本不管理窗口或焦点，因此不能宣称自动恢复窗口成功。

若发现源码坐标未更新，优先判断 exact project 是否重新编译。必要时只对当前 worktree 做精确 CLI rebind；不得通过打开 preview project、切换 canonical 分支或复用旧图掩盖 stale compile。

## 测试说明

- `npm test` 当前使用 `node --test tests/*.test.js`，不是后续工具链的强制串行 runner。
- `3449cad` 阶段曾全量 1150 pass / 0 fail / 6 skip。
- `c2f438a` 后的全量尝试在 `tests/squad.fairness.test.js` 出现可独立复现、失败种子会漂移的 wall-clock deadline 波动；当前不能写成全量绿色。
- 只有在 pre-change/未改依赖闭包可复现时才可标记既有波动，仍需记录失败数、测试文件和复跑结果，并由用户明确接受提交例外。

## 私密文件

不得输出以下文件的值或密钥路径：

- `.env.local`
- `.mcp.json`
- `.claude/settings.local.json`
- `project.private.config.json`
- `.vscode/settings.json`

## 外部动作边界

以下动作互不等价，也不能互相推导授权：

- local commit
- Git push
- PR
- preview QR / preview
- `mp:upload`
- 微信后台正式发布
- 云函数部署
- 真实云数据写入

本轮 `waterSession` 曾在一次性明确授权下部署；2026-08-07 曾生成一次早于 `c2f438a` 的 preview QR。后续 push、PR、QR、preview/upload、正式发布、云函数部署或真实数据写入都必须重新获得明确授权。
