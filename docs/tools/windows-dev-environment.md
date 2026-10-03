# Windows 开发环境

路径与命令以实际cwd、[current.md](../tasks/current.md)、当前package.json为准；本页不存放历史测试失败或会话端口。

## 路径

| 路径 | 角色 |
|---|---|
| `D:\projects\badminton-miniapp` | 项目总目录、用户选定的Codex主要文件夹；在其中选择具体源码工作区 |
| `D:\projects\badminton-miniapp\main` | 当前主仓库；保留dirty改动 |
| `D:\projects\badminton-miniapp\worktrees\control` | `codex/project-control` worktree |
| `D:\projects\badminton-miniapp\worktrees\production` | `codex/production-baseline-20260814` worktree；分支名不代表线上版本 |
| `D:\projects\badminton-miniapp\worktrees\historical` | 保留的历史目录；不作为当前源码入口 |
| `D:\projects\badminton-miniapp\preview` | 仅明确授权preview时使用的镜像；upload使用Git源码工作区 |
| `D:\projects\badminton-miniapp\evidence` | 项目视觉证据 |
| `D:\projects\badminton-miniapp\backups\worktrees` | 历史worktree备份 |
| `D:\projects(WIN)\badminton-miniapp` | 指向新main的Junction，仅供旧聊天cwd接续；实际文件已迁走 |
| `D:\Soft\微信web开发者工具\cli.bat` | 已安装DevTools传统CLI |
| `D:\Soft\微信web开发者工具\wechatide.cmd` | 同一安装的官方MCP CLI |

不从preview/旧WSL/worktree复制源码覆盖当前工作区，不依据安装路径推断版本。2026-09-11已验证安装2.02.2609102；后续仍以实际返回为准。

2026-10-03用户将总目录设为Codex主要文件夹，list_projects已确认原项目ID保持不变。源码开发、Git/npm/测试仍使用main作为workdir（或Git显式 `git -C main ...`）。总目录没有.git，应用返回isGitRepository=false；[官方项目说明](https://learn.chatgpt.com/docs/projects)的默认Git与PR/worktree动作定位主要仓库，不能假定自动定位嵌套main。此次选择与迁移验证见[迁移记录](../tasks/session-logs/2026-10-03-project-path-migration.md)。旧聊天可能仍记录旧cwd，通过上述Junction访问同一份源码。DevTools需要重新导入新main，旧签名session不能改字符串复用。

## 命令与Shell

日常入口见 [开发工作流](agent-development-workflow.md)，基础测试规则见 [AGENTS.md](../../AGENTS.md)；按影响范围选测，无需每次全量。截图命令与来源合同见 [截图工作流](weapp-ui-screenshot-workflow.md)，错误恢复集中在 [故障手册](weapp-ui-troubleshooting.md)。

普通npm、测试、hooks不依赖裸 `bash` 或全局script-shell；仓库.sh经 `node scripts/run-bash-script.js <仓库脚本>`，Node代码使用 `scripts/lib/git-bash.js`。不要永久修改用户npm配置来修单个任务。旧工具链的verify、records等命令不能从历史文档推断为当前可用。

## DevTools

- 热会话由 `WEAPP_UI_SESSION_FILE` 显式选择；endpoint来自签名回执，不扫描/猜端口，不把CDP/HTTP端口当automation。
- 日常截图connect-only，不抬起/移动窗口、不模拟输入。保持restored-but-background；最小化/锁屏不在支持范围。
- source/Git变化（包括文档）默认由 `ui:iterate` 自动编排两阶段refresh及中间明确页面编译；不要求逐轮手工执行。进程/端口/设备等变化按工作流处理，冷启动可能打扰桌面。
- 路径迁移后，旧launch-signed session只作为历史证据保留；其exact worktree绑定不能通过替换路径复用，后续截图须按工作流重新绑定新路径。
- MCP连接此前已配置成功。遇到新故障先核验当前状态，不按旧报告重复安装或索取Token；不输出凭据。
- 本地MCP状态检查/明确编译统一走下面的包装入口，从 `$CODEX_HOME/config.toml` 的原 `mcp_servers.wechatide` 提取命令、客户端名和Token；未设置CODEX_HOME时优先现有 `D:/Relocated/LIZIXUAN/Codex/config.toml`，再用用户 `.codex/config.toml`。客户端名大小写属于授权身份：已配置为 `Codex`，禁止手输或改为 `codex`。缺Token、重复或不支持的配置直接失败，不fallback到auth，不重试申请授权。

```powershell
node scripts/dev/wechatide-local.js check_wechatide_status
# 日常源码编译由 ui:iterate 自动完成；以下只供故障手册要求的诊断。
node scripts/dev/wechatide-local.js simulator_open_page 'D:/projects/badminton-miniapp/main' pages/launch/index
```

包装器仅允许 `check_wechatide_status`、`simulator_refresh` 和 `simulator_open_page [项目绝对路径] [页面路径]`（默认 `pages/launch/index`，不接受 query）。已观察到 refresh 成功但导航不可用，因此日常编译采用明确页面入口，不能仅以 refresh 返回成功认定可运行。Token不落库、不进入包装器命令行或输出日志。它不授予upload、部署、预览或真实云写入权限。

## 云部署入口

- 用户已授权的云部署优先使用 CloudBase CLI，沿用现有登录态；不要切到 DevTools 云写接口导致逐函数确认。已验证的 CLI 3.7.3 支持 `--force` 非交互覆盖与 `--install-dependency true`，使用前以实际安装为准，目标环境取已核对的 `cloudbaserc.json`。
- 登录过期时运行 `tcb login --flow device --json`，完成一次账户登录后复用；不能承诺凭据永不过期。不输出或提交登录凭据。
- 历史 DevTools 2.02.2609102 实测没有可用的持续云写确认设置；它不是当前安装版本证明。客户端 `Codex`/Token 授权只解决连接身份，不消除云写确认。不要修改内部许可状态或重发pending请求；切换入口前先查询原请求结果，避免重复部署。
- 本机可用单函数入口：`npm run deploy:cloud -- --force <functionName>`。默认先核验 `Active / Available` 和依赖安装状态，再执行 `scripts/cloud-runtime-smoke.js` 的无业务写入调用。必须核对实际 `RetMsg`，不能以 CLI exit 0、InvokeResult 0 或 Active 单独认定运行成功；`--no-verify` 不能作为已验证交付。批量只操作本次已授权函数，失败时记录成功范围与待处理项。
- Windows DevTools云部署存在ZIP目录分隔符风险：本轮waterSession经IDE部署后Active但运行时报找不到`./lib/common`，改CLI部署后实际调用恢复。故障诊断需保留原调用结果，必要时下载云端原ZIP核验POSIX目录名与相对依赖；本地Windows解压后文件存在不能证明云端Linux可加载。

## 测试、隐私与交付

- `npm test` 使用node:test + node:assert/strict，测试stub wx/cloud；文件包含 `*.test.js`、`*.consistency.test.js`、`*.smoke.test.js`、`*.async-stale-response.test.js`。按AGENTS影响范围选测，结果见对应任务，不以历史失败推断当前状态。
- API检查：`wx.saveFile` / `wx.removeSavedFile` 使用 `wx.getFileSystemManager().*`；`wx.getSystemInfo` / `wx.getSystemInfoSync` 使用 `miniprogram/core/systemInfo.js`。`npm run check:deprecated-wx-api`核对；旧工具alias以当前package.json验证，不从历史分支推断。
- 不输出.env.local、MCP/IDE/编辑器私有配置中的凭据或秘密；诊断只提取必要非敏感字段。
- 完成任务后立即commit/push，遵循 [持续授权与交付规则](../../AGENTS.md#交付与文档)；PR、preview/QR、upload、发布、云部署、真实数据写入仍需各自授权。旧waterSession部署和旧QR不授予新外部动作。
