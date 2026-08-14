# 项目文档导航

本目录按“当前事实、稳定规则、任务过程、历史证据”分层。新会话不再遍历全部文档。

## 会话入口

1. 先读仓库根目录 `AGENTS.md`，了解稳定治理规则。
2. 再读 `docs/tasks/current.md`，了解当前分支正在进行的工作。
3. 涉及版本、发布、分支或 worktree 时，以 `control/PROJECT.md`、`control/worktrees.json` 和 `control/release-ledger.jsonl` 为准；`docs/status/` 只提供解释与历史快照。
4. 仅按任务需要进入下列专项目录。

## 文档分区

| 目录 | 用途 | 生命周期 |
|---|---|---|
| `status/` | 控制面解释、迁移报告和历史保护快照 | 不复制机器可读控制面 |
| `decisions/` | 已接受的全局产品、部署和治理决策 | 新决策追加，不覆盖历史 |
| `context/` | 稳定架构和领域模型 | 架构变化时更新 |
| `specs/` | 产品规格、设计方案和实施边界 | 完成后保留，废弃时归档 |
| `tasks/` | 当前分支任务与短期交接 | 完成后移出顶层 active 区 |
| `tools/` | Windows、DevTools、截图、分析和交付 runbook | 工具链变化时更新 |
| `reports/` | 一次性审计和分析报告 | 只追加或明确标记过期 |
| `records/` | 机器生成的工作流证据 | 不作为当前状态源 |
| `archive/` | 已关闭计划和历史交接 | 只读，按年份整理 |

## 当前权威文件

- 全项目状态：`control/PROJECT.md`
- worktree 注册表：`control/worktrees.json`
- 发布事实账本：`control/release-ledger.jsonl`
- 历史 worktree 归档清单：`control/archives/`
- 整理前保护快照：`docs/status/worktree-inventory.md`
- worktree 清理候选：`docs/status/cleanup-candidates.md`
- worktree 单一控制面方案：`docs/status/worktree-control-plane.md`
- 产品主线比较：`docs/status/product-priority-options.md`
- 发布账本说明：`docs/status/release-ledger.md`
- 维护节奏：`docs/status/maintenance-policy.md`
- 决策记录：`docs/decisions/`
- 当前分支任务：`docs/tasks/current.md`
- 架构：`docs/context/architecture.md`
- 临时经验：`docs/notes/learnings.md`
- 公共命令：`docs/tools/command-reference.md`

## 维护规则

- 产品、发布与 worktree 当前事实只在 `control/` 维护一次，其他文档使用链接，不复制易漂移状态。
- `current.md` 只描述当前分支，保持在 40 行左右；详细证据进入 session log 或 report。
- 完成、取消或暂停且不再执行的计划移入 `archive/`，不继续留在 active task 入口。
- dirty worktree 未完成备份、归属确认和用户批准前不得删除或 prune。
- `latest` record 只是最近一次成功证据，不等于当前源码、上传状态或线上状态。
