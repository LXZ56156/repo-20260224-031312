# Windows 开发环境

路径与命令以实际cwd、[current.md](../tasks/current.md)、当前package.json为准；本页不存放历史测试失败或会话端口。

## 路径

| 路径 | 角色 |
|---|---|
| `D:\projects(WIN)\badminton-miniapp` | 当前工作区；保留dirty改动 |
| `D:\projects(WIN)\badminton-miniapp-worktrees\water-court-vant-spike-20260807` | 历史worktree，不是当前源码入口 |
| `D:\projects(WIN)\badminton-miniapp-preview` | 仅明确授权preview/upload时使用的镜像 |
| `D:\projects\badminton-miniapp` | 元数据空壳，禁止使用 |
| `D:\Soft\微信web开发者工具\cli.bat` | 已安装DevTools传统CLI |
| `D:\Soft\微信web开发者工具\wechatide.cmd` | 同一安装的官方MCP CLI |

不从preview/旧WSL/worktree复制源码覆盖当前工作区，不依据安装路径推断版本。2026-09-11已验证安装2.02.2609102；后续仍以实际返回为准。

## 命令与Shell

基础测试命令见 [AGENTS.md](../../AGENTS.md)；按影响范围选测，无需每次全量。截图、doctor、refresh、focus-check、diff的唯一操作说明在 [截图工作流](weapp-ui-screenshot-workflow.md)。

普通npm、测试、hooks不依赖裸 `bash` 或全局script-shell；仓库.sh经 `node scripts/run-bash-script.js <仓库脚本>`，Node代码使用 `scripts/lib/git-bash.js`。不要永久修改用户npm配置来修单个任务。旧工具链的verify、records等命令不能从历史文档推断为当前可用。

## DevTools

- 热会话由 `WEAPP_UI_SESSION_FILE` 显式选择；endpoint来自签名回执，不扫描/猜端口，不把CDP/HTTP端口当automation。
- 日常截图connect-only，不抬起/移动窗口、不模拟输入。保持restored-but-background；最小化/锁屏不在支持范围。
- source/Git变化（包括本轮文档）需两阶段refresh及中间明确编译；进程/端口/设备等变化按工作流重新prewarm，冷启动可能打扰桌面。
- MCP连接此前已配置成功。遇到新故障先核验当前状态，不按旧报告重复安装或索取Token；不输出凭据。
- 本地MCP状态检查/明确编译统一走下面的包装入口，从 `$CODEX_HOME/config.toml` 的原 `mcp_servers.wechatide` 提取命令、客户端名和Token；未设置CODEX_HOME时优先现有 `D:/Relocated/LIZIXUAN/Codex/config.toml`，再用用户 `.codex/config.toml`。客户端名大小写属于授权身份：已配置为 `Codex`，禁止手输或改为 `codex`。缺Token、重复或不支持的配置直接失败，不fallback到auth，不重试申请授权。

```powershell
node scripts/dev/wechatide-local.js check_wechatide_status
# 仅在截图流程明确要求编译时执行；不要与其他代理的截图并行。
node scripts/dev/wechatide-local.js simulator_refresh 'D:/projects(WIN)/badminton-miniapp'
```

包装器仅允许这两个本地动作；Token不落库、不进入包装器命令行或输出日志。它不授予upload、部署、预览或真实云写入权限。

## 云部署入口

- 用户已授权的云部署优先使用 CloudBase CLI，沿用现有登录态；不要切到 DevTools 云写接口导致逐函数确认。当前 CLI 3.7.3 支持 `--force` 非交互覆盖与 `--install-dependency true`，目标环境取已核对的 `cloudbaserc.json`。
- 登录过期时运行 `tcb login --flow device --json`，完成一次账户登录后复用；不能承诺凭据永不过期。不输出或提交登录凭据。
- 当前 DevTools 2.02.2609102 的云写确认没有可用的持续授权设置，客户端 `Codex`/Token 授权只解决连接身份，不消除云写确认。不要修改内部许可状态或重发pending请求；切换入口前先查询原请求结果，避免重复部署。
- 本机可用单函数入口：`npm run deploy:cloud -- --force <functionName>`。部署后核验 `Active / Available` 和依赖安装状态；批量只操作本次已授权函数，失败时记录成功范围与待处理项。

## 测试、隐私与交付

- `npm test` 使用node:test；当前测试结果见current及其证据。旧fairness墙钟失败已修复，不再作为当前失败事实。
- 不输出.env.local、MCP/IDE/编辑器私有配置中的凭据或秘密；诊断只提取必要非敏感字段。
- commit、push、PR、preview/QR、upload、发布、云部署、真实数据写入的独立授权边界以AGENTS为准；旧waterSession部署和旧QR不授予新外部动作。
