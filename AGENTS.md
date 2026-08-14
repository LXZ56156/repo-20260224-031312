# AGENTS.md

## Project Overview

微信原生小程序羽毛球赛事管理项目，使用 WXML / WXSS / JavaScript 和微信云开发。核心链路：创建 > 配置 > 开赛 > 录分 > 排名 > 复盘。

## Session Entry

每次会话先读：

1. `docs/tasks/current.md` — 当前分支任务、边界和下一步。
2. `docs/status/project-state.md` — 跨分支产品、发布和授权事实。

再按任务选择：

- `docs/README.md` — 文档总导航和生命周期规则。
- `docs/context/architecture.md` — 架构、领域状态和关键 pattern。
- `docs/specs/` — 产品规格与批准边界。
- `docs/tools/` — Windows、DevTools、截图、分析和交付 runbook。
- `docs/status/worktree-inventory.md` — branch/worktree 保护台账。
- `docs/notes/learnings.md` — 尚未提升为稳定规则的临时经验。

历史 task、handoff、截图、QR 和 workflow record 不能覆盖 `docs/status/` 的当前事实。

## Product and UI Governance

- 当前产品基准固定为用户已确认的线上版本；精确提交以 `docs/status/project-state.md` 和 `docs/decisions/0002-online-version-product-baseline.md` 为准。新产品工作必须从该基准创建隔离 `codex/` branch/worktree；其他本地 RC、overlay、运营能力和暂停路线都不是默认集成基线。
- 已暂停或被否定的 Next-Gen/C3/Home 全面重做只作历史证据，不得整体复用、合并或迁移。
- 用户可见变化必须先明确批准：页面结构、文案、CTA、导航、流程、默认行为、权限和操作语义均包含在内。
- UI 工作一次只处理一个页面或一个明确问题；先给浏览器近似方向，用户选定后再实现原生 WXML/WXSS，并用当前源码的真实微信 DevTools 截图验收。
- 浏览器稿不能代替小程序验收；未经批准不得以“精简”“统一”为由删除信息、入口、确认或复盘能力。
- 新 UI 或明显视觉重做必须加载 `frontend-design`，并同时遵守 `weapp-regression-guard`；web 原则必须翻译为原生小程序、低端机、系统字体、44px 触达、reduced motion 和无远程视觉依赖。

## Safety and External Actions

- Git push、preview/upload、正式发布、云函数部署、集合/索引/权限/secret/开关、真实数据写入和不可恢复删除是不同动作，不能相互推断授权。
- 向后兼容云函数变更提交后允许受保护的 post-commit hook 自动部署；必须满足 `docs/decisions/0001-compatible-cloud-auto-deploy.md` 的旧客户端、旧参数、旧数据、返回 shape、权限、幂等和默认关闭合同。
- 不兼容云变更、集合/索引/权限/secret/开关、迁移和真实数据写入仍需明确授权。
- 不执行 `npm run mp:preview`、`npm run mp:preview:deliver`、`npm run mp:upload` 或正式发布，除非当前任务得到明确授权。
- dirty worktree 未备份、未确认归属、未获用户批准前不得删除、移动或 prune。
- 不打印 `.env.local`、`.mcp.json`、`project.private.config.json`、私钥路径、token 或 secret。

## Development Environment

- Windows 权威主工作区：`D:\projects(WIN)\badminton-miniapp`。
- preview/upload 镜像：`D:\projects(WIN)\badminton-miniapp-preview`，不是源码权威。
- `D:\projects\badminton-miniapp` 是元数据空壳，禁止作为源码。
- WSL 只在显式兼容任务中使用；普通 npm、hooks、DevTools 和截图走 Windows 原生入口。
- 端口、launcher 和当前 worktree 能力以 `docs/tools/windows-dev-environment.md`、当前 `package.json` 和真实 probe 为准，不从历史 handoff 复制。

## Architecture and Cloud Contracts

- `miniprogram/pages/`：页面；`miniprogram/core/`：跨页面业务逻辑；`cloudfunctions/`：云函数。数量必须查询当前树，不写入稳定规则。
- Tournament states: `draft` > `running` > `finished`。
- Ranking: wins > point diff > points scored > name。
- Game modes: `multi_rotate`, `squad_doubles`, `fixed_pair_rr`。
- `scripts/*-common.template.js` 是云函数共享代码唯一源；不要直接编辑 `cloudfunctions/*/lib/*`。
- 修改共享模板后运行 `npm run sync:cloud-common` 和 `npm run check:cloud-common`。
- 涉及云函数时使用 `weapp-cloud-contract-audit` 检查返回 shape、错误码、权限、模板同步和聚焦测试。

## Testing and Verification

- 测试使用 `node:test` + `node:assert/strict`，通过 stub global wx/cloud API 隔离运行。
- 实现或修复前先增加或确认直接覆盖；完成前先跑聚焦测试，再按风险运行全量测试、`npm run check`、`npm run lint` 和 `git diff --check`。
- 当前分支的公共命令以 `package.json` 为准；不要假设其他 worktree 拥有相同 alias。
- 微信 API 先查当前官方文档；禁止引入 `wx.saveFile`、`wx.removeSavedFile`、`wx.getSystemInfo`、`wx.getSystemInfoSync`，使用仓库替代封装。
- 修改云函数后在最终汇报中列出兼容证据、受影响函数和实际部署结果；无法证明兼容时使用停止开关并先申请迁移授权。

## Execution and Style

- 非功能性修改（测试、重构、稳定性、性能、配置、文档）默认直接执行并报告。
- 歧义、破坏性后果、生产动作、外部凭据或真实数据写入必须暂停确认。
- 回复使用中文，技术名词和代码标识保持原文。
- 提交信息使用 conventional commits；提交前审查全部差异并运行与风险匹配的完整验证。
