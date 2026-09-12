# 羽毛球赛事与独立打水小程序（CloudBase）

原生微信小程序，包含完整羽毛球赛事管理链路和无需创建比赛的独立打水账本。Agent/开发者开始前先读 `AGENTS.md` 与 `docs/tasks/current.md`。

## 功能概览

- 赛事：创建、配置、开赛、录分、排名、赛后复盘与分享；
- 模式：多人轮转、团队双打、固定搭档循环；
- 独立打水：手动/接龙/邀请添加球友，1v1 起记一局、单独记水和名单搜索；源码包含 V2 多人记账、修改/撤销、完整流水与往期，云能力不可用时兼容 V1 发起人记账。
- 独立打水不创建 tournament、不提供结束入口；每次打水新建独立账本、名单和邀请链接，新建不清空旧账本，可从最近/历史或旧链接继续。

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

在当前 worktree 的PowerShell中按改动风险选择命令，不是每次全部执行：

```powershell
npm run test:affected -- <本任务的仓库相对路径>
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

不要直接编辑 `cloudfunctions/*/lib/*`，不要调用裸 `bash`。Windows环境见 `docs/tools/windows-dev-environment.md`；当前验证结果见 `docs/tasks/current.md`。

## 典型赛事流程

1. launch 选择赛制并发起；
2. 创建/确认赛事后进入大厅；
3. 添加或邀请参赛者，配置场地和规则；
4. 开赛后进入赛程，录入或修正比分；
5. 查看排名与赛后分析，按现有入口分享。

## 独立打水流程

1. launch 点击“开始记水”；
2. 新建本次独立账本，或继续最近/历史账本；
3. 手动添加、粘贴接龙或分享邀请；
4. 选择等人数胜负方记一局，或点名单 `＋/−` 直接记账；
5. 按权限查看流水、修改或撤销；旧账本保留，UI 不使用新轮次模型。V1 兼容模式保留发起人撤销上一条。

最新批准增量见 [每次独立打水账本](docs/specs/independent-water-ledgers.md)，基础合同见 [V1 兼容规格](docs/specs/standalone-water-ledger.md)和 [V2 多人账本规格](docs/specs/collaborative-water-ledger-v2.md)。V1 成员历史仍通过旧链接进入；新增成员查询索引与23个云函数已部署核验；客户端尚未upload/发布，完整UI人工验收边界见当前任务记录。

## 云函数部署

仓库当前有 23 个云函数。只部署本次实际受影响且已获授权的函数：先同步/检查共享库，再通过微信开发者工具选择正确环境并“上传并部署：云端安装依赖”。不要默认“部署所有云函数”。

`waterSession` 曾在一次性授权下部署；该事实不授权再次部署，也不代表小程序客户端已经发布。

## 发布边界

local commit、push、PR、preview QR、preview、`mp:upload`、正式发布、云函数部署和真实数据写入是独立动作。除非当前任务明确授权对应动作，否则不得执行。Git push 或二维码都不等于线上正式版。

## 常见问题

- `FUNCTION_NOT_FOUND`：目标环境没有部署所需云函数，或 DevTools 选择了错误环境；先核对环境和函数名，不要直接全量部署。
- `database collection not exists`：目标环境缺少集合或初始化权限；真实环境操作前先确认授权。
- 截图连接失败：通过 `WEAPP_UI_SESSION_FILE` 选择已签名会话，执行 `ui:doctor`；按截图工作流区分源码刷新与会话重建，不手填或猜测endpoint。
- 截图超时：DevTools 最小化可能没有可靠 surface；保持 restored-but-background，详见 `docs/tools/weapp-ui-screenshot-workflow.md`。
