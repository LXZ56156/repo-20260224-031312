# Canonical Command Reference

> 目标：开发者只需要记住少量公共入口；底层脚本和兼容 alias 仍可存在，但不作为默认工作流。

## 日常验证

| 命令 | 用途 |
|---|---|
| `npm run docs:check` | 检查文档入口、生命周期、稳定指令中的易变事实和本地 Markdown 链接 |
| `npm run repo:inventory` | 只读输出 branch/worktree/dirty 状态；`-- --json` 输出机器格式 |
| `npm run verify:changed` | 按当前未提交差异选择 docs、light 或 full gate；`-- --plan` 可先查看计划 |
| `npm run verify:light` | 当前分支已有的轻量工具链与关键回归集合 |
| `npm run verify:full` | 全量测试、cloud/deprecated check、docs check、lint 和 diff check |
| `npm test` | 全部 Node 测试 |
| `npm run check` | deprecated 微信 API 与 cloud common 同步检查 |
| `npm run lint` | 全仓 JavaScript lint |

## UI 与本地工具

| 命令 | 用途 |
|---|---|
| `npm run ui:screenshot -- --list` | 查询当前分支支持的真实 DevTools case |
| `npm run ui:screenshot -- <case>` | 运行明确 case；执行前核对当前 worktree 和 endpoint |
| `npm run verify:windows-env` | 审计当前 Windows 工具链，不输出 secret |

## 外部动作

`mp:*` 和正式发布命令不是日常公共入口。只有当前任务得到对应远程动作授权、已核对 `docs/status/project-state.md` 和 release runbook 后才允许执行。

向后兼容云函数变更提交后允许由已安装的 post-commit hook 自动部署，合同见 `docs/decisions/0001-compatible-cloud-auto-deploy.md`。不兼容变更必须设置 `SKIP_CLOUD_POST_COMMIT_DEPLOY=1` 并先取得迁移授权。
