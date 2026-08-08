# 羽毛球赛事与独立打水小程序（CloudBase）

原生微信小程序，包含完整羽毛球赛事管理链路和无需创建比赛的独立打水账本。Agent/开发者开始前先读 `AGENTS.md` 与 `docs/tasks/current.md`。

## 功能概览

- 赛事：创建、配置、开赛、录分、排名、赛后复盘与分享；
- 模式：多人轮转、团队双打、固定搭档循环；
- 独立打水：手动/接龙/邀请添加球友，1v1 起记一局，直接加减水，搜索大名单和撤销上一条；
- 独立打水不创建 tournament，当前没有用户可见的结束/另开账本入口。

线上、开发、云部署和 preview 状态请看 `docs/tasks/current.md`，不要从本地 Git HEAD 推导线上版本。

## 导入项目

1. 微信开发者工具选择“导入项目”；
2. 选择包含 `project.config.json` 的 checkout/worktree 根目录；
3. 确认 `miniprogramRoot=miniprogram/`、`cloudbaseRoot=./`、`cloudfunctionRoot=cloudfunctions/`；
4. 在云开发中选择与 `miniprogram/config/env.js` 对应的环境。

当前 Windows 路径和 DevTools endpoint 规则见 `docs/tools/windows-dev-environment.md`。不要使用元数据空壳 `D:\projects\badminton-miniapp`，也不要把 preview mirror 当成源码。

## 数据库

主要集合：

- `tournaments`：赛事、名单、赛程和比分；
- `waterSessions`：独立打水名单、entries、version 和幂等请求记录。

建议客户端只读、所有写入走云函数。任何真实环境初始化/写入必须先获明确授权。

## 开发检查

在当前 worktree 的 PowerShell 中运行：

```powershell
npm test
npm run test:ranking
npm run check
npm run lint
npm run ui:screenshot -- --list
```

云共享库的源是 `scripts/*-common.template.js`。需要同步时使用 Windows guard：

```powershell
node scripts/run-bash-script.js scripts/sync-cloud-common.sh
npm run check:cloud-common
```

不要直接编辑 `cloudfunctions/*/lib/*`，不要调用裸 `bash`。当前精确命令及已知测试波动见 `docs/tools/windows-dev-environment.md`。

## 典型赛事流程

1. launch 选择赛制并发起；
2. 创建/确认赛事后进入大厅；
3. 添加或邀请参赛者，配置场地和规则；
4. 开赛后进入赛程，录入或修正比分；
5. 查看排名与赛后分析，按现有入口分享。

## 独立打水流程

1. launch 点击“开始记水”；
2. 创建或继续发起人的 active 账本；
3. 手动添加、粘贴接龙或分享邀请；
4. 选择等人数胜负方记一局，或点名单 `＋/−` 直接记账；
5. 查看净水和最近 4 条记录，必要时撤销上一条。

完整合同见 `docs/specs/standalone-water-ledger.md`。

## 云函数部署

仓库当前有 23 个云函数。只部署本次实际受影响且已获授权的函数：先同步/检查共享库，再通过微信开发者工具选择正确环境并“上传并部署：云端安装依赖”。不要默认“部署所有云函数”。

`waterSession` 曾在一次性授权下部署；该事实不授权再次部署，也不代表小程序客户端已经发布。

## 发布边界

local commit、push、PR、preview QR、preview、`mp:upload`、正式发布、云函数部署和真实数据写入是独立动作。除非当前任务明确授权对应动作，否则不得执行。Git push 或二维码都不等于线上正式版。

## 常见问题

- `FUNCTION_NOT_FOUND`：目标环境没有部署所需云函数，或 DevTools 选择了错误环境；先核对环境和函数名，不要直接全量部署。
- `database collection not exists`：目标环境缺少集合或初始化权限；真实环境操作前先确认授权。
- 截图连接失败：端口角色是会话动态值，验证 exact worktree 的 automation endpoint 后设置 `WEAPP_WS_ENDPOINT`；不要盲信脚本默认 `39420`。
- 截图超时：DevTools 最小化可能没有可靠 surface；保持 restored-but-background，详见 `docs/tools/weapp-ui-screenshot-workflow.md`。
