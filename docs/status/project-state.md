# 项目状态事实源

> 更新时间：2026-08-14
> 范围：跨分支产品边界的说明页。实时 worktree 与发布事实以 `control/` 为唯一权威源；分支局部任务见 `docs/tasks/current.md`。
> 安全规则：兼容云函数变更按决策记录自动部署；其他远程或破坏性动作仍采用逐次授权。

## 已确认事实

| 维度 | 当前事实 | 证据等级 |
|---|---|---|
| 已确认正式线上版本 | `6.1.2-e60d827-r3`；线上客户端源码身份为 `55bfc4fa319ab74a33d406f05fbdab975ab8cfb7` | 用户于 2026-08-14 明确确认；upload receipt 与 byte-manifest 证据见 ba45 worktree；决策见 `docs/decisions/0003-online-release-6.1.2-e60d827-r3.md` |
| 历史线上基线 | `master` = `origin/master` = `5813ffc79f94c180fa5573eb25fb0d57f53b85df` | 2026-07-15 曾确认，已被 `6.1.2-e60d827-r3` 取代 |
| 当前产品决策 | 需求、回归和后续产品分支从线上客户端源码 `55bfc4f` 建立干净隔离 worktree；不直接使用 dirty ba45 worktree | 用户于 2026-08-14 确认 |
| schedule 单点基线 | `codex/incremental-ui-score-baseline-20260729@51fe6dc`，相对 master 仅改 schedule WXML/WXSS 和聚焦测试 | 2026-08-14 重新核对 clean worktree、3 文件 diff、2/2 聚焦测试和 `git diff --check` |
| 主 Git 元数据根 | `D:\projects(WIN)\badminton-miniapp` / `codex/ui-optimization-v2@0157c66`，clean、只读；CONTROL 与 PRODUCTION 的 linked worktree 共用其 `.git` | `control/worktrees.json` 与 `npm run worktree:status` |
| 协作打水 V2 | worktree 已归档；branch、bundle、patch、私密证据归档与逐文件恢复结果均保留 | `control/archives/online-source-evidence-ba45.json` |
| share activity | worktree 已归档；branch 与 bundle 恢复副本保留，代码默认关闭 | `control/archives/share-activity-collection.json` |
| worktree 安全 | 初始 20 个 worktree 已收敛为 CONTROL、PRODUCTION、METADATA_ROOT 共 3 个；15 个历史 worktree 完成恢复验证后卸载，`archive_pending` 为 0 | `control/worktrees.json` 与 `control/archives/` |

## 发布事实分层

- “Git commit/push”“preview/upload”“云函数部署”“正式线上版本”是四种独立状态，不得相互推断。
- `6.1.2-e60d827-r3` 已由用户确认为正式线上版本；其客户端源码与 `55bfc4f` 的 633 个 `miniprogram` 文件一致。
- 协作打水 V2 的归档文档记录：尚未执行 V2 collection/index/config 写入、V2 云部署、迁移、canary、preview、upload、审核或正式发布。
- share activity 历史分支记录的云函数部署与关闭开关属于历史证据；后续若启用，必须新增发布账本记录。

## 云函数部署授权

用户于 2026-08-14 统一选择“兼容变更自动部署”。完整兼容定义、fail-closed 门槛、停止开关和仍需单独授权的范围见 `docs/decisions/0001-compatible-cloud-auto-deploy.md`。

该决策不授权 preview/upload、正式发布、集合/索引/权限/secret/开关、不兼容迁移、删除或真实数据写入。

## 当前产品基准与候选

详细角色见 `docs/status/product-priority-options.md`。当前已确认：

- `6.1.2-e60d827-r3` / client source `55bfc4f`：唯一产品基准；新工作必须从该提交建立干净隔离 worktree；
- `score-only UI`：已批准但尚未成为线上基准的单点候选；
- `协作打水 V2`、`share activity + local ops`：受保护候选能力，不默认并入；
- Next-Gen：继续暂停，仅保留历史证据。

本次事实修正没有触发分支切换、合并、部署或发布。

## 状态更新合同

任何修改本文件的任务必须同时给出：日期、branch、HEAD、dirty 状态、证据来源，以及是否发生 push、preview/upload、云部署或正式发布。不能只写“已上线”“已完成”或“最新”。
