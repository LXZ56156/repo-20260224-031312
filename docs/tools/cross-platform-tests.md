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

## 离线包隐私回归

`privacy-api-package.test.js` 使用锁定版本 miniprogram-ci 导出的静态 `MiniProgramWhiteList` 与真实 Project 文件枚举/ignore 规则，检查未用 uploader 被排除、使用中的组件保留、候选文件无禁止隐私 API。普通 `npm test` 不请求微信在线扩展名白名单，不需要上传凭据或网络。此为本地打包候选回归，不宣称微信服务端最新白名单或正式上传已验证；获准上传时仍按实际平台结果检查。

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

用户 2026-10-18 17:32（UTC+08）明确不需要 GitHub Actions，新增配置已移除，不通过推送触发自动测试。此工具改造最初在助手 Linux 云电脑验证；Windows 专属进程/CLI 测试在 Linux 上明确跳过。后续 VM 实测结果见[当前状态](../tasks/current.md)，不把某次实测扩展为所有后续版本均通过。以后如需验证，在获准的 Windows 环境手动运行相同命令，不通过模拟 process.platform 冒充 Windows。

2026-10-18 工具改造时用户要求截图暂不验收；该历史边界不代表后续截图仍未执行。后续隔离原生验收与真机/真实云未验边界以[VM 记录](../tasks/vm-migration-and-ui-acceptance-2026-10-18.md)为准，不因本工具改造自动关闭。此次执行证据见[实施记录](../tasks/cache-fairness-claim-implementation-2026-10-18.md)。

## 2026-10-20 云端复核

基线 19c007c，加本节所述离线白名单测试调整；未修改业务或运行工具代码。Linux / Node 24.19.0：首次全量因测试主动请求微信在线白名单被环境网络规则阻断，未绕过该限制；改用锁定依赖的静态白名单后专项 2/2 通过。第一次完整运行 2035 项：2026 通过、1 失败、8 Windows 专属跳过；失败为 scheduler-full-audit-report 的默认预设质量用例出现排阵超时。该依赖闭包未改，原样单文件复跑 16/16 通过；随后原样全量复跑 **2027 通过、0 失败、8 跳过**（2035 项、215.8 秒）。保留首轮失败，不将单次重跑成功解释为耗时风险已消除；未放宽预算或更改断言。

check 通过，lint 0 错误/35 既有警告，diff 检查通过。原运行日志按 tests、tests-offline、scheduler-audit-recheck、tests-offline-rerun 的阶段保留；当前版本 Windows 专属项仍未执行，不用旧 VM 全量结果替代。线上打包、云事务和 UI 验收未因本次离线复核改变状态。
