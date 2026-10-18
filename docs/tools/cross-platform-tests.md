# Linux / Windows 共用测试工具

## 同一入口

在具体 checkout 中安装锁定依赖后，两平台使用相同命令：

```text
npm ci
node -e "require('fs').mkdirSync('tmp', {recursive:true})"
npm test
npm test -- --test-concurrency=1
npm test -- tests/weapp-preview-workflow.test.js
npm run check
npm run lint
```

`run-tests.js` 在 Node 内枚举并排序测试文件，不依赖 CMD/PowerShell/Bash 对 `*.test.js` 的不同展开行为；默认串行，避免此前并行内存不足。显式参数使用 `--name=value` 形式。找不到文件或空套件直接失败，不把“未运行”当成功。`test:affected --run` 使用相同 runner。

代码废弃 API 扫描与共享云库逐字节检查均为 Node 实现，不需要 ripgrep、cmp、diff 或 shell。目录缺失/不可读是失败；生成的第三方小程序包排除，旧 API 命中仍退出 1，扫描异常退出 2。旧 `.sh` 检查入口仅转调 Node，避免两套规则漂移。

全量仍含已存在的部署 Shell 合同测试；Linux 使用 Bash，Windows 使用 Git for Windows 的 Git Bash，经 `scripts/lib/git-bash.js` 定位，必要时显式 `WEAPP_GIT_BASH`。这些测试使用隔离 fake CLI，不会真实部署。没有要求安装 WSL、rsync、inotify、wslpath。不要把“共用入口”误写成“仓库中所有部署 Shell 都已改写”。

## 镜像流程

```text
node scripts/dev/weapp-sync-preview.js sync-once
node scripts/dev/weapp-sync-preview.js signature
node scripts/dev/weapp-dev.js mirror
node scripts/dev/weapp-dev.js status
node scripts/dev/weapp-dev.js stop
```

这些是开发操作，不是自动验收或默认授权。测试只在临时 fixture 操作；实际 mirror/preview 仍须遵守项目授权。

- SOURCE_DIR 默认当前脚本所在 checkout，PREVIEW_DIR 默认其同级 preview，可用环境变量显式指定；不再硬编码某个 D 盘/WSL 路径。
- Node 同步实现仅复制两份 project 配置和 miniprogram/cloudfunctions/miniprogram_npm；排除依赖、缓存、日志、临时文件，删除已拥有镜像中的过期文件，空目录不影响内容摘要。
- SHA-256 内容摘要同时验证源和目标，能发现目标被修改。后台轮询高精度 size/mtime/ctime 元数据以减少重复读文件；变化经防抖再复制并发布内容清单，同长度修改有回归。
- 拒绝源/目标重叠、根目录、Git checkout、非本源拥有的非空目标，以及源符号链接/根路径链接。清理目标中的链接只删除链接，不跟随外部目录。镜像首次使用空目录，之后校验所有者记录。
- 后台 Node worker 使用独占 token 锁及合作式 stop 文件；不根据裸 PID 杀进程。旧脚本裸 PID/过期锁要先人工核实原进程，工具拒绝自动删除锁或杀死可能复用的 PID。
- 旧 weapp-dev.sh / weapp-sync-preview.sh 只是兼容转发。新的 Windows 调用优先使用上面的原生 Node 命令，不通过 WSL/Git Bash 路径转译。
- 原 inotify/rsync 分支已被共用轮询引擎替代；SYNC_WATCH_MODE 不再选择原实现，DEBOUNCE_MILLISECONDS/POLL_INTERVAL_SECONDS 保留。不要将老 SHA-1 清单直接视为新 SHA-256 已同步；执行同步重建。

## 平台适配与验收边界

DevTools/MCP 启动顺序提取为同一个 `orchestrate`，测试用显式适配器验证“工具不存在先启动、已存在不重复启动、MCP 不就绪才启动、启动失败传播”。这是平台调用合同测试，不冒充真实微信进程。

`weapp-dev.js mcp/start/preview` 的真实启动适配器仅支持 Windows/WSL；Linux 没有原生微信 DevTools 时明确失败，不创建假成功。只有这个 WSL 原生启动分支才用 wslpath。Windows 直接用 PowerShell 原生路径；MCP 启动器路径必须显式提供 `WEAPP_MCP_WINDOWS_CMD` / `WEAPP_MCP_WINDOWS_DIR`。status 仅报告镜像，不把未探测 MCP 标成 ready。网络探测只做 Tool.getInfo；不登录、授权、部署或业务写入。

用户 2026-10-18 17:32（UTC+08）明确不需要 GitHub Actions，新增配置已移除，不通过推送触发自动测试。当前验证在助手 Linux 云电脑执行；Windows 专属进程/CLI 测试在 Linux 上继续明确跳过，Windows 实机验证仍未完成。以后如需验证，在获准的 Windows 环境手动运行相同命令，不通过模拟 process.platform 冒充 Windows。

用户 2026-10-18 明确本轮截图先不验收；原生截图、实际 DevTools、真机和真实云验收保留未验，不因本工具改造自动关闭。此次执行证据见[实施记录](../tasks/cache-fairness-claim-implementation-2026-10-18.md)。
