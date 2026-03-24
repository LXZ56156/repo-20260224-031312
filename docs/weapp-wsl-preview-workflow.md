# 微信小程序 WSL + Windows 预览镜像工作流

## 用途

这套工作流用于把 WSL 里的主开发仓库与 Windows 本地预览目录解耦：

- 主开发目录固定为 `/home/lizixuan/projects/badminton-miniapp`
- 微信开发者工具只打开 `D:\projects\badminton-miniapp-preview`
- WSL 中的源码变更通过 `rsync` 自动镜像到 Windows 预览目录
- 不让微信开发者工具直接读取 `\\wsl.localhost\Ubuntu\home\lizixuan\projects\badminton-miniapp`

> 必须坚持这一条：微信开发者工具只能打开 `D:\projects\badminton-miniapp-preview`，不要直接打开 `\\wsl.localhost\...`

## 目录与脚本

- WSL 主仓库：`/home/lizixuan/projects/badminton-miniapp`
- Windows 预览目录（WSL 路径）：`/mnt/d/projects/badminton-miniapp-preview`
- Windows 预览目录（Windows 路径）：`D:\projects\badminton-miniapp-preview`
- 微信开发者工具 CLI：`D:\Soft\微信web开发者工具\cli.bat`
- WSL 一键启动：`scripts/dev/weapp-dev.sh`
- 预览同步脚本：`scripts/dev/weapp-sync-preview.sh`
- Windows 启动脚本：`scripts/dev/start-weapp-preview.ps1`
- Windows 双击脚本：`scripts/dev/start-weapp-preview.bat`
- 微信 MCP 启动器：`D:\weapp-mcp-launcher\weapp-mcp.cmd`
- 同步日志：`tmp/weapp-preview/weapp-sync-preview.log`
- 同步 PID 文件：`tmp/weapp-preview/weapp-sync-preview.pid`

## 同步范围

同步保留：

- `project.config.json`
- `project.private.config.json`
- `miniprogram/`
- `cloudfunctions/`
- `miniprogram_npm/`（存在时）

同步排除：

- `.git`
- `node_modules`
- `.idea`
- `.vscode`
- `dist`
- `coverage`
- `tmp`
- 常见缓存与临时文件：`*.tmp`、`*.swp`、`*.swo`、`*.cache`、`*.log`、`.DS_Store`

说明：

- 之所以保留 `cloudfunctions/`，是因为 `project.config.json` 已声明 `cloudfunctionRoot`，微信开发者工具打开预览目录时需要完整项目结构。
- 同步脚本只会对 `/mnt/d/projects/badminton-miniapp-preview` 执行 `rsync --delete`，不会删除其他目录内容。

## 启动顺序

推荐顺序：

1. 在 WSL 项目根目录执行：

```bash
./scripts/dev/weapp-dev.sh
```

这个命令现在默认执行微信 MCP 自动链路：

1. 启动或复用预览同步脚本
2. 先尝试连接现有微信开发者工具 MCP 端口 `ws://127.0.0.1:9420`
3. 如果连接失败，自动执行 `D:\weapp-mcp-launcher\weapp-mcp.cmd`
4. 等待 MCP 连接就绪后退出

也就是说，平时要用微信 MCP 时，只需要运行这一条命令，不需要再手动启动镜像脚本或手动点 `weapp-mcp.cmd`。

如果你只想打开微信开发者工具预览，不做 MCP 连接检查，可执行：

```bash
./scripts/dev/weapp-dev.sh preview
```

`preview` 模式会调用 Windows PowerShell 启动微信开发者工具：

```powershell
D:\Soft\微信web开发者工具\cli.bat auto --project D:\projects\badminton-miniapp-preview --auto-port 9420
```

如果只想看同步状态和当前 MCP 是否 ready：

```bash
./scripts/dev/weapp-dev.sh status
```

如果只想停止后台同步：

```bash
./scripts/dev/weapp-dev.sh stop
```

如果你已经在 Windows 侧，想直接双击启动开发者工具，可运行：

- `scripts/dev/start-weapp-preview.bat`

## 验证方法

### 验证预览目录是否正确

确认微信开发者工具当前项目目录是：

- `D:\projects\badminton-miniapp-preview`

不要是：

- `\\wsl.localhost\Ubuntu\home\lizixuan\projects\badminton-miniapp`

### 验证自动同步是否正常

1. 先执行 `./scripts/dev/weapp-dev.sh`
2. 在 WSL 中修改任意一个会被同步的文件，例如 `miniprogram/` 或 `cloudfunctions/` 下已有文件
3. 观察 `D:\projects\badminton-miniapp-preview` 中对应文件的修改时间是否在约 0.4 秒防抖后更新
4. 运行 `./scripts/dev/weapp-dev.sh status`，确认 `MCP 状态：ready`
5. 如微信开发者工具已打开，确认它加载的是 `D:\projects\badminton-miniapp-preview` 中的最新内容

查看同步日志：

```bash
tail -f tmp/weapp-preview/weapp-sync-preview.log
```

## 停止方法

优先使用：

```bash
./scripts/dev/weapp-dev.sh stop
```

如果需要手动停止：

```bash
kill "$(cat tmp/weapp-preview/weapp-sync-preview.pid)"
```

微信开发者工具本身仍按 Windows 常规方式关闭。

## 常见问题

### 1. 启动时提示预览目录不存在

先运行：

```bash
./scripts/dev/weapp-dev.sh
```

同步脚本会先创建并填充 `/mnt/d/projects/badminton-miniapp-preview`，随后脚本会自动尝试连接 MCP；连接失败时会自动调用 `weapp-mcp.cmd`。

### 2. 修改后没有及时同步

当前脚本在缺少 `inotifywait` 时会回退到 0.4 秒轮询监听，这是预期行为。先检查：

```bash
./scripts/dev/weapp-dev.sh status
tail -n 50 tmp/weapp-preview/weapp-sync-preview.log
```

### 3. Windows CLI 路径不对

检查 `scripts/dev/start-weapp-preview.ps1` 顶部变量：

- `$CliPath`
- `$PreviewDir`
- `$AutoPort`

### 4. MCP 连接始终起不来

先检查：

```bash
./scripts/dev/weapp-dev.sh status
tail -n 50 tmp/weapp-preview/weapp-sync-preview.log
```

再确认：

- `D:\weapp-mcp-launcher\weapp-mcp.cmd` 存在
- `D:\Soft\微信web开发者工具\cli.bat` 存在
- 端口 `9420` 没有被其他程序占用

### 5. 微信开发者工具误开了 WSL UNC 路径

关闭当前项目，重新用下面命令启动：

```bash
./scripts/dev/weapp-dev.sh
```

并确认项目路径回到：

- `D:\projects\badminton-miniapp-preview`
