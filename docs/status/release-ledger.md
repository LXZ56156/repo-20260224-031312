# 发布事实账本

> 本文件只记录可区分的 Git、preview/upload、云部署和线上事实。证据不足时明确写“声明”或“待核验”。

| 日期 | 类型 | 版本/提交 | 状态 | 证据与边界 |
|---|---|---|---|---|
| 2026-07-15 | 历史正式线上基线 | `master@5813ffc` | 已被取代 | 当时由用户确认；Git push 不等于小程序发布 |
| 2026-07-18 | preview delivery | `codex/ui-optimization-v2@e267088`，dirty | 成功记录 | `docs/records/miniapp-ci-latest.json`；preview-only，不是 upload/正式发布 |
| 2026-08-13 | 小程序 upload | `6.1.2-e60d827-r3` / `55bfc4f` | 成功 receipt | Robot 1；633 个 `miniprogram` 文件 byte-manifest 匹配；upload 当时不等于发布 |
| 2026-08-14 | 正式线上版本 | `6.1.2-e60d827-r3` / client source `55bfc4f` | 用户确认 | 当前产品基准；云函数与数据 rollout 状态仍需单独记账 |
| 2026-08-14 | 云函数部署 | `joinTournament`、`reportOpsActivityEvents` | share activity 分支声明已部署 | 双端开关默认关闭；需补部署记录或控制台证据 |
| 2026-08-14 | 部署政策 | 向后兼容云函数变更 | 自动部署 | 用户确认；精确合同见 `docs/decisions/0001-compatible-cloud-auto-deploy.md`，本行不是一次远程部署记录 |
| 2026-08-14 | 产品基准决策 | `6.1.2-e60d827-r3` / `55bfc4f` | 当前有效 | 后续产品从该源码身份建立干净隔离 worktree；见 decision 0003 |
| 2026-08-25 | Git 远端备份 | `origin/codex/production-baseline-20260814` / tag `online/6.1.2-e60d827-r3` | push 后回读核验通过 | branch 与 tag 均指向正式线上客户端源码；本动作不等于新的 preview/upload、审核、正式发布或云部署 |
| 2026-08-13 至今 | 协作打水 V2 客户端/云端边界 | 正式线上客户端源码包含 V2 客户端提交链 | 客户端已随正式版本上线；完整云端与数据 rollout 未完成 | 不能把客户端上线解释为 V2 云函数、集合/索引/config、迁移、canary 或开关已经完成 |

## 追加规则

- 每次远程动作一行，不回写旧行制造“最新状态”。
- 必须注明 source branch、HEAD、dirty、动作类型、目标环境和证据位置。
- preview、upload、review、release、cloud deploy 分开记录。
- 失败发生在远程动作前后必须区分；未知时不得重试真实远程动作。
