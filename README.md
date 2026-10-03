# 羽毛球赛事与独立打水小程序（CloudBase）

原生微信小程序，使用 WXML / WXSS / JS 和微信云开发。支持创建、配置、开赛、录分、排名、复盘与分享；赛制包括多人轮转、团队双打和固定搭档循环。独立打水无需创建赛事，每次打水新建独立账本、名单和邀请链接，旧账本可继续使用，UI 不提供结束或新轮次动作。

## 从这里开始

开发前读 [AGENTS](AGENTS.md) 与 [当前状态](docs/tasks/current.md)，再用 [文档索引](docs/README.md) 按任务读取。产品和权限细节从 [当前打水规格入口](docs/specs/independent-water-ledgers.md) 找到对应合同，跨模块关系看 [架构](docs/context/architecture.md)。线上客户端、云部署与本地源码分别核验，以当前状态中的回执为准。

项目总目录 `D:\projects\badminton-miniapp` 不是 Git 根；主仓库在 `main`，其他 worktree 在 `worktrees`。2026-10-04 已提交基线为 **15 个页面、23 个云函数**；本机暂停业务的未提交工作树为16页/26函数，拉取远端不会包含这些未完成实现。具体checkout以 [app.json](miniprogram/app.json) 和 [cloudbaserc.json](cloudbaserc.json) 为准；线上部署单独看 [当前状态](docs/tasks/current.md)。

## 开发与 UI 迭代

验证范围按AGENTS选择；[UI日常循环](docs/tools/agent-development-workflow.md)默认复用已签热会话，关联测试完成后执行：

```powershell
Set-Location 'D:\projects\badminton-miniapp\main'
npm run ui:screenshot -- --list
npm run ui:iterate -- waterV2Member24
```

命令输出截图与指标，按 [UI 验收](docs/tools/weapp-ui-acceptance.md) 检查；连接、编译或截图失败按 [故障手册](docs/tools/weapp-ui-troubleshooting.md) 的对应阶段处理。参数和来源合同按需查 [截图参考](docs/tools/weapp-ui-screenshot-workflow.md)。

## 导入与云环境

在微信开发者工具导入包含 `project.config.json` 的具体 checkout 根目录；确认 `miniprogramRoot=miniprogram/`、`cloudbaseRoot=./`、`cloudfunctionRoot=cloudfunctions/`，云环境与 `miniprogram/config/env.js` 一致。路径、shell 和工具环境见 [Windows 环境](docs/tools/windows-dev-environment.md)。

主要数据集合为 `tournaments`（赛事、名单、赛程和比分）与 `waterSessions`（V1 打水兼容账本）；V2 数据与权限按当前规格读取。共享云代码来源是 `scripts/*-common.template.js`，同步/检查规则见 [架构](docs/context/architecture.md#cloud-function-shared-libraries)。

已经获准的云部署优先使用 [Windows CloudBase CLI 入口](docs/tools/windows-dev-environment.md#云部署入口)，核对环境与受影响函数后执行。任务完成后立即提交、推送，遵循 [AGENTS](AGENTS.md#交付与文档) 的持续授权；部署、上传与发布仍按独立授权执行，不从历史回执推导新授权。
