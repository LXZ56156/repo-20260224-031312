# AGENTS.md

## Project Overview

微信小程序羽毛球赛事管理项目，使用原生微信框架（WXML / WXSS / JS）和微信云开发。核心赛事链路：创建 > 配置 > 开赛 > 录分 > 排名 > 复盘；当前另有一个不依附比赛的独立打水账本。

## Session Authority

开始工作先完整读取：

1. `docs/tasks/current.md`
2. `docs/tasks/incremental-ui-restart-handoff-2026-07-29.md`
3. `docs/tasks/incremental-ui-optimization-plan.md`

按任务再读取：

- `docs/specs/standalone-water-ledger.md` — 独立打水产品、权限和数据合同
- `docs/context/architecture.md` — 当前架构与线上/开发状态分层
- `docs/notes/learnings.md` — 活跃规则与已知风险
- `docs/tools/windows-dev-environment.md` — Windows 路径、命令和端口合同
- `docs/tools/weapp-ui-screenshot-workflow.md` — 当前分支真实 DevTools 截图能力与限制
- `docs/tools/we-analysis-local-script.md` — we分析数据拉取规则

`docs/tasks/current.md` 是当前状态入口；历史 task、截图、QR、records 和分支名不能覆盖它。

## Frontend Design and Regression Skills

- 新 UI 或明显视觉重做必须加载 `frontend-design`，并同时遵守 `weapp-regression-guard`。
- 涉及浏览器近似稿时再加载 `browser-router`；浏览器只用于方向选择，不能作为小程序最终验收。
- web 原则要翻译为原生 WXML/WXSS/JS、系统字体、低端机、44px 触达、reduced motion 和无远程视觉依赖；不得照搬 hover、Web 字体或浏览器专属 CSS。
- 暖米色+酸绿、暗底+荧光绿、报纸规则线及被用户判退的 Next-Gen/C3/Home 全面重做只能作反例，不得继续微调复用。

## Current Product Route (2026-08-08)

- 线上/主分支事实仍是 `master` = `origin/master` = `5813ffc`。
- 2026-07-29 的 master + `38d6ea4` schedule overlay 建基线已经完成；当前树中的等价 cherry-pick 是 `178e5dd`。
- 独立打水及逐点优化已批准并实现至产品提交 `c2f438a`。继续工作不得重新从 master 起步，否则会丢失已批准增量；精确 branch/worktree 以 `current.md` 为准。
- `codex/ui-optimization-v2`、`nextgen-integration`、`nextgen-ui-redesign-20260724` 和其他 next-gen worktree 仍是历史证据，不得整体复用、合并或迁移。
- 独立打水没有用户可见结束选项；云端 `finish` 兼容分支不是 UI 授权。

## Current Commands

```powershell
npm test
npm run check
npm run lint
npm run check:cloud-common
npm run check:deprecated-wx-api
npm run ui:screenshot -- --list
npm run ui:screenshot -- <case>
```

当前 `package.json` 没有后续旧工具链的 `verify:*`、`screenshot:smoke`、`screenshot:diagnose`、`weapp:probe` 或 `records:latest`。不得把其他分支文档中的 alias 当成当前能力。

Windows 主入口是 `D:\projects(WIN)\badminton-miniapp`，但当前 UI 工作必须在 `current.md` 指定的独立 worktree 完成；不要切换 canonical 工作区分支。`D:\projects\badminton-miniapp` 是元数据空壳，禁止使用。preview mirror 只属于明确授权的 preview/upload，不是源码权威。

截图 endpoint 是会话派生值，不是固定 `39420`。正式截图必须验证 exact worktree 的 `Tool.getInfo` / `App.getCurrentPage`，再通过 `WEAPP_WS_ENDPOINT` 显式传入。

## Architecture Summary

- `miniprogram/pages/`：15 个页面，tabBar 为 home/launch/mine；`pages/water` 是非 tabBar 独立账本页
- `miniprogram/core/`：跨页面业务逻辑；`waterLedger.js` 与 `waterSession.js` 为打水客户端模块
- `cloudfunctions/`：23 个云函数；`waterSession` 使用 `waterSessions` 集合
- 云函数共享代码以 `scripts/*-common.template.js` 为准，不直接修改 `cloudfunctions/*/lib/*`
- Tournament states: `draft` > `running` > `finished`
- Water session server states: `active` / compatibility `finished`；当前 UI 只使用 active
- Ranking: wins > point diff > points scored > name
- Game modes: `multi_rotate`, `squad_doubles`, `fixed_pair_rr`

## Testing Conventions

- Framework: `node:test` + `node:assert/strict`；测试通过 stub global wx/cloud API 隔离运行。
- 文件约定：`*.test.js`、`*.consistency.test.js`、`*.smoke.test.js`、`*.async-stale-response.test.js`。
- 测试先行；实现前先增加或确认直接覆盖。完成前按风险运行聚焦测试、全量测试、`npm run check`、`npm run lint` 和 `git diff --check`。
- 全量失败只有在 pre-change/未改依赖闭包可重复出现时才能称既有波动；必须记录测试文件、失败数、复跑方式和结果。既有波动不等于通过，提交例外需要用户看到事实后明确授权。
- 当前已知 `tests/squad.fairness.test.js` 有墙钟 beam deadline 波动；不得因此把失败隐藏成“全量绿色”。

## Deprecated APIs

- `wx.saveFile` / `wx.removeSavedFile` → `wx.getFileSystemManager().*`
- `wx.getSystemInfo` / `wx.getSystemInfoSync` → `miniprogram/core/systemInfo.js`
- 检查：`npm run check:deprecated-wx-api`

## Execution and Approval

- 非功能改动（稳定性、测试、重构、配置、文档）可直接执行并验证。
- 用户可见的页面结构、文案、CTA、导航、流程或动作语义必须实现前明确批准。
- CTA、导航、文案、权限、业务流程、云写入和发布语义变化逐项确认，不能从相邻授权推导。
- 每个 UI 点严格按：一个页面/问题 → 保留/调整边界 → 浏览器方案 → 用户选择 → 测试先行 → 最小原生实现 → 当前源码真实 DevTools 图 → 用户确认 → 必要尺寸/状态 → 单独提交。
- 不自动恢复 Next-Gen/C3、全面 Home 重做、全局设计系统或跨页面统一。

## UI Completion Gate

向用户汇报 UI 完成前，主控必须亲自检查当前源码的真实微信 DevTools 图；自动量测、结构快照、浏览器稿和旧图都不够。至少检查：

- 操作显著性与主次层级；
- 44px 触达、文字基线/换行和图文间距；
- 对齐、边界、圆角、阴影、裁剪、遮挡和横向溢出；
- 与任务相关的输入、清空、空结果、选中、禁用、加载和大名单状态；
- 需要响应式证据时覆盖 320/390/430，并明确区分真实截图与结构/数学检查。

发现肉眼问题先修复并重跑，不把基础检查留给用户指出。详细门禁见 `docs/notes/learnings.md`。

## Cloud and Windows Rules

- 修改共享云代码必须改 `scripts/*-common.template.js`，再运行同步和检查；不要手改各函数 `lib/`。
- 普通 npm、测试和 hooks 不得依赖裸 `bash`；Windows 统一通过 `scripts/run-bash-script.js` / `scripts/lib/git-bash.js` 解析 Git Bash。
- 涉及云函数时按 `weapp-cloud-contract-audit` 检查返回 shape、错误码、权限、模板同步和聚焦测试。
- `waterSession` 曾在一次明确授权下部署；该授权已用完。后续部署仍需新授权。

## Delivery Boundaries

local commit、Git push、PR、preview QR、preview、`mp:upload`、正式发布、云函数部署和真实数据写入是八个不同动作。除非用户在当前任务明确授权对应动作，否则不得执行；一种授权不覆盖其他动作。

2026-08-07 的 preview QR 早于最终 `c2f438a`，不能作为当前 launch、正式 upload 或线上版本证据。禁止擅自 push、建 PR、再次生成 QR/preview、upload、正式发布、部署云函数或写真实数据。

## Style and Commit

- 回复使用中文，技术名词和代码标识保持原文。
- 提交信息使用 conventional commits 风格。
- 提交前审查全部 staged diff，运行与风险相称的验证，并如实报告所有失败、跳过和例外。
