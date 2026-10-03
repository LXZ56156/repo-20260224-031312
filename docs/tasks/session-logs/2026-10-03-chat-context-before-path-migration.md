# 目录迁移前的聊天背景与接续索引（2026-10-03）

本记录在迁移前整理，用于新路径、新聊天接续。当前源码、分支、未提交改动、线上状态与未完成项仍以 [current.md](../current.md) 及其证据为准；这里的聊天摘要不覆盖当前入口，也不延续历史授权。

## 本次迁移的目录决定

- 总目录：`D:\projects\badminton-miniapp`，用于收纳主仓库、worktree、preview 和证据；总目录不是 Git 根。
- 新主仓库：`D:\projects\badminton-miniapp\main`。Codex 的主要文件夹应设置为此目录。
- 旧主路径：`D:\projects(WIN)\badminton-miniapp`。保留指向新主仓库的 Junction，使旧聊天保存的 cwd 继续访问同一份源码；旧路径只是兼容入口。
- worktree 的数量、路径、branch、HEAD、dirty 状态以本次实际 Git 盘点与迁移回执为准。历史聊天中的“26 个 worktree”“6 个 node_modules Junction”等数字不作为 2026-10-03 的事实。
- 当前任务只授权目录与相关文档迁移；commit、push、PR、preview/QR、upload、正式发布、云部署和真实数据写入仍按 [AGENTS.md](../../../AGENTS.md) 独立授权。

## 聊天索引与已核验背景

下列 `codex://threads/…` 链接只用于定位原聊天；是否可打开取决于本机应用和聊天访问状态。摘要只保留接续所需的项目事实，不保存凭据、原始私密长对话或账户订单内容。

| 聊天 | ID | 与本次任务相关的事实 |
|---|---|---|
| [迁移项目到指定目录](codex://threads/01a0fd78-4c06-7431-9e28-0ad7d14a3032) | `01a0fd78-4c06-7431-9e28-0ad7d14a3032` | 本次请求要求先盘点、更新接续文档，再把完整项目和 worktree 统一收纳到指定总目录。开始时此聊天 cwd 仍是旧主路径。 |
| [规划项目迁移至D:\projects](codex://threads/019fd6a5-b519-7611-b5d9-2124a164ec91) | `019fd6a5-b519-7611-b5d9-2124a164ec91` | 2026-08 的计划已讨论保留同一个 Codex 项目、添加新文件夹、设为主要、验证后移除旧入口；建议通过旧路径 Junction 保持旧聊天 cwd 可访问，并用 `git worktree repair` 修复迁移后的连接。旧盘点数及其他项目的迁移范围不沿用。 |
| [确认羽毛球主项目目录](codex://threads/01a0fc0f-06be-7259-b20d-f1ad0e07b0df) | `01a0fc0f-06be-7259-b20d-f1ad0e07b0df` | 近期只读检查确认旧主路径拥有真实 `.git` 目录，`control` 和 `production` 的 Git 指针指向该主仓库。该聊天执行环境曾有 ownership 限制，不能用它替代本次 branch/HEAD/status 核验。 |
| [历史聊天：接口未返回标题](codex://threads/01a08fbd-4388-7c61-b86d-db3375b49366) | `01a08fbd-4388-7c61-b86d-db3375b49366` | 最近两轮消息讨论云费用与华为云迁移背景。用户随后要求先归档、暂缓商榷云迁移并继续开发；对应 [2026-09-11 开发接续](2026-09-11-migration-paused-development-handoff.md)。本次磁盘目录迁移不等同于云平台迁移。 |
| [历史聊天：接口未返回标题](codex://threads/01a0897c-25b0-7a31-bc45-b3b79c4309e2) | `01a0897c-25b0-7a31-bc45-b3b79c4309e2` | 近期工具/技能对齐曾移除失效 `verify:*`、`screenshot:diagnose` 推荐，并修正 Windows 选测辅助脚本；交付时未提交、未部署。当前命令入口继续以 package.json 和 [技能对齐记录](../weapp-skill-toolchain-alignment-2026-09-10.md) 为准。 |

## Codex 聊天与源码路径的关系

2026-10-03 只读核验：同一已有项目 ID 为 `local-b62ceb7c8df8710cd049297cf35d3aa2`，名称 `badminton-miniapp`；`list_projects` 返回的主要路径仍是旧主路径。本机项目元数据已记录旧主目录与新总目录两个 rootPaths，但新总目录此前是空壳，不能把它当作迁移完成或 Git 主仓库证据。

`CODEX_HOME` 为 `D:\Relocated\LIZIXUAN\Codex`；`C:\Users\LIZIXUAN\.codex` 是指向该目录的 Junction。聊天状态位于独立的 `sessions`、`archived_sessions` 和应用状态存储，不随项目源码目录移动。本次不移动、批量替换或直接修改 Codex JSONL、SQLite、凭据及应用内部状态。

官方 [Projects and chats](https://learn.chatgpt.com/docs/projects) 明确：编辑项目可添加多个文件夹，并把其中一个设为主要；新聊天、默认 Git 操作及 `AGENTS.md`、skills、`config.toml` 的自动发现使用主要文件夹。该文档 CLI 部分说明聊天保留 transcript 和 recorded working directory；本次桌面 `list_threads` 也实测旧聊天保留旧 cwd。因此不能假定切换 primary 会改写所有旧聊天的 cwd。

同一个已有项目的切换顺序：

1. 源码和 worktree 迁移、Git 连接修复、旧主路径 Junction 验证完成后，打开该项目的 **Edit project**。
2. **Add folder** 添加 `D:\projects\badminton-miniapp\main`，对它选择 **Make primary** 并保存。
3. 保留项目 ID 和历史聊天，抽查重要旧聊天；确认新聊天 cwd、Git 根及读取的 AGENTS 都指向 `main`。
4. 移除旧文件夹的项目入口前确认兼容 Junction 仍可访问；不要用“移除项目”代替“移除文件夹”。总目录可作为辅助文件夹保留，但不是 Git 主要文件夹。

本次可用工具没有更新项目 folders/primary 或当前聊天 cwd 的专用接口。旧路径 Junction 提供不中断文件访问的兼容；应用内 Make primary 是否已经完成，须以迁移回执的实际验证为准，不能从文档或磁盘移动推定。

## 迁移前的项目状态快照

以下来自迁移前读取的 [current.md](../current.md)（当时标记 2026-09-23），仅记录接续背景；如后续有变化，以 current 与最终迁移回执为准。

- 线上客户端记录为 `6.1.2-702625a`，源码基线 `702625a3afeeffb4254a4d2c155ef7df28a9a2d8`，2026-09-14 正式发布；见 [线上版本确认](2026-09-23-online-release-confirmed.md)。本次迁移不重新上传或发布。
- 当前工作分支记录为 `codex/online-audit-optimizations-20260828`，HEAD 另含交付文档；最终 branch/HEAD 与 dirty 保留情况须看本次盘点。
- 云开发原环境记录已续至 `2026-10-12 23:59:59`；在线非原子备份、费用与云迁移讨论保留为背景。云平台迁移、域名购买/备案与迁移部署未进行，见 [背景接续](2026-09-11-migration-paused-development-handoff.md)。
- UI 已有 390px 主控和双隔离评审证据；430px、完整交互及最终人工验收仍未完成。正式发布不替代这些验收。
- 截图偶发响应超时、同页面连续 case 失样式仍有未闭合问题；原 Stable/Nightly 同 SDK 的完整 A/B 未完成。
- 截图签名绑定具体源码/worktree。路径与本轮文档变化后不能直接复用旧 session；后续截图按 [截图工作流](../../tools/weapp-ui-screenshot-workflow.md) 重新绑定。前台预热及其他外部动作仍遵守现有授权边界。

迁移后的日常路径、命令与工具限制见 [Windows 开发环境](../../tools/windows-dev-environment.md)。
