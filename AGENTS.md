# AGENTS.md

## Project Overview

微信小程序羽毛球赛事管理项目，使用原生微信框架（WXML / WXSS / JS）和微信云开发。核心赛事链路：创建 > 配置 > 开赛 > 录分 > 排名 > 复盘；当前另有一个不依附比赛的独立打水账本。

## Session Authority

开始工作先读取 `docs/tasks/current.md` 并核对实际 cwd、branch、HEAD 和未提交改动。当前状态与工具能力以该文件及当前源码为准。

按任务再读取：

- `docs/tasks/incremental-ui-restart-handoff-2026-07-29.md`、`docs/tasks/incremental-ui-optimization-plan.md` — 增量 UI 历史决定与批准边界；仅在相关 UI 工作时读取，历史进度不覆盖 current。
- `docs/specs/standalone-water-ledger.md` — 独立打水产品、权限和数据合同
- `docs/context/architecture.md` — 当前架构与线上/开发状态分层
- `docs/notes/learnings.md` — 未被规范吸收的局部经验（按需）
- `docs/tools/windows-dev-environment.md` — Windows 路径、命令和端口合同
- `docs/tools/weapp-ui-screenshot-workflow.md` — 当前分支真实 DevTools 截图能力与限制
- `docs/tools/we-analysis-local-script.md` — we分析数据拉取规则

`docs/tasks/current.md` 是当前状态入口；历史 task、截图、QR、records 和分支名不能覆盖它。

## Frontend Design and Regression Skills

- 新 UI 或明显视觉重做必须加载 `frontend-design`；回归按本文件 Testing Conventions，不强制额外加载通用回归技能。
- `weapp-regression-guard` 仅用于跨链路依赖或覆盖范围不明确时的风险索引；普通局部修复、样式、截图和文档任务不把它当成前置流程。
- 涉及浏览器近似稿时再加载 `browser-router`；浏览器只用于方向选择，不能作为小程序最终验收。
- web 原则要翻译为原生 WXML/WXSS/JS、系统字体、低端机、44px 触达、reduced motion 和无远程视觉依赖；不得照搬 hover、Web 字体或浏览器专属 CSS。
- 暖米色+酸绿、暗底+荧光绿、报纸规则线及被用户判退的 Next-Gen/C3/Home 全面重做只能作反例，不得继续微调复用。

## Product Route

- 线上版本、当前提交、branch/worktree 和已批准增量以 `docs/tasks/current.md` 为入口；不得依据历史提交重新从 master 起步或覆盖已有改动。
- `codex/ui-optimization-v2`、`nextgen-integration`、`nextgen-ui-redesign-20260724` 和其他 next-gen worktree 仍是历史证据，不得整体复用、合并或迁移。
- 独立打水没有用户可见结束选项；云端 `finish` 兼容分支不是 UI 授权。

## Current Commands

```powershell
npm test
npm run test:affected -- <本任务的仓库相对路径>
npm run test:affected -- --run <本任务的仓库相对路径>
npm run check
npm run lint
npm run check:cloud-common
npm run check:deprecated-wx-api
npm run ui:doctor
npm run ui:session:refresh
npm run ui:screenshot -- --list
npm run ui:screenshot -- <case>
```

当前 `package.json` 没有后续旧工具链的 `verify:*`、`screenshot:smoke`、`screenshot:diagnose`、`weapp:probe` 或 `records:latest`。不得把其他分支文档中的 alias 当成当前能力。

Windows 主入口是 `D:\projects(WIN)\badminton-miniapp`；实际工作位置以 `current.md` 为准，不预设必须另建 worktree，不擅自切换 canonical 工作区分支。`D:\projects\badminton-miniapp` 是元数据空壳，禁止使用。preview mirror 只属于明确授权的 preview/upload，不是源码权威。

截图 endpoint 由已验证的 launch-signed session 派生，不是固定端口。通过 `WEAPP_UI_SESSION_FILE` 选择会话；runner 验证 exact worktree 的 `Tool.getInfo` / `App.getCurrentPage`。不手填 endpoint 绕过签名；模式、预热与刷新按截图工作流。

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
- 行为实现前先增加或确认直接覆盖。规则/文档改动验证引用、命令入口和差异；局部实现先运行直接相关测试；共享业务逻辑、跨独立领域、依赖/测试基础设施变更或明确全量要求时运行 `npm test`。按实现与交付风险选择 `npm run check`、`npm run lint`，并执行 `git diff --check`。已有通过结果只在新增改动、失败或未解决疑点时重跑。
- `test:affected` 不带 `--run` 只输出计划；审阅后再执行。多人共用脏树时传本任务路径；它不是完整依赖图，可能选全量，零测试也不代表已验证。
- 全量失败只有在 pre-change/未改依赖闭包可重复出现时才能称既有波动；必须记录测试文件、失败数、复跑方式和结果。既有波动不等于通过，提交例外需要用户看到事实后明确授权。
- 已知测试问题及其修复状态按需查 `current.md` 和对应验证记录，不把历史失败当成当前事实。

## Deprecated APIs

- `wx.saveFile` / `wx.removeSavedFile` → `wx.getFileSystemManager().*`
- `wx.getSystemInfo` / `wx.getSystemInfoSync` → `miniprogram/core/systemInfo.js`
- 检查：`npm run check:deprecated-wx-api`

## Execution and Approval

- 非功能改动（稳定性、测试、重构、配置、文档）可直接执行并验证。
- 这是个人项目，默认选择满足当前需求的最短直接实现；不为假设场景新增框架、抽象层、兼容层、重试链路或兜底分支。
- 测试只保留能够直接证明本次行为或防止明确回归的最小集合；不新增重复覆盖、纯实现细节测试或与改动无关的扩展矩阵。
- 不以“健壮性”“未来扩展”为由扩大范围；已有业务合同、数据安全和并发保护不得擅自删除，确需新增保护时必须有当前故障证据或明确需求。
- 缓存先显和后台刷新属于内部读取实现；在线使用缓存时必须静默，不得通过顶部横幅、Toast、弹窗或改名后的类似提示告知“当前/正在展示缓存数据”。真实离线、写入失败和数据冲突仍按现有业务合同就近提示。
- 用户侧错误只显示简洁业务提示，不展示 SDK 堆栈、内部路径或追踪信息；统一入口及诊断边界见 [错误呈现规范](docs/specs/user-facing-errors.md)。
- 用户明确要求实现或修复的具体范围视为该范围的批准，无需重复确认；用户可见的页面结构、文案、CTA、导航、权限、流程或动作语义超出已批准范围时，先明确新增变化再取得批准，不能从相邻授权推导。
- 每个 UI 点严格按：一个页面/问题 → 保留/调整边界 → 浏览器方案 → 用户选择 → 测试先行 → 最小原生实现 → 当前源码真实 DevTools 图 → 用户确认 → 必要尺寸/状态 → 单独提交。
- 已明确选定或授权的方案不重复走方案审批；真实截图及人工验收仍适用。流程中的“单独提交”不自动授予 commit 权限，仍遵守 Delivery Boundaries。
- 不自动恢复 Next-Gen/C3、全面 Home 重做、全局设计系统或跨页面统一。

## UI Completion Gate

UI 完成前必须由主控亲自检查当前源码真实 DevTools 图；浏览器稿、数学量测和旧图不能替代。所有 UI 实现/视觉验收任务必须读取并遵守 `docs/tools/weapp-ui-acceptance.md` 的完整门禁。

明显视觉重做、高密度弹层或用户指出难用/拥挤时仍须两名隔离评审；共同 P0/P1 未关闭不能宣称完成。详细尺寸、状态、对比度与记录要求集中在上述文件，不在其他文档复制一份。

## Cloud and Windows Rules

- 修改共享云代码必须改 `scripts/*-common.template.js`，再运行同步和检查；不要手改各函数 `lib/`。
- 普通 npm、测试和 hooks 不得依赖裸 `bash`；Windows 统一通过 `scripts/run-bash-script.js` / `scripts/lib/git-bash.js` 解析 Git Bash。
- 云返回/错误/权限/幂等/锁合同变化或后端回归时使用 `weapp-cloud-contract-audit`；仅修改云文件注释、文档或无关配置不触发整套云审计。共享模板同步与聚焦测试要求保持。
- `waterSession` 曾在一次明确授权下部署；该授权已用完。后续部署仍需新授权。

## Delivery Boundaries

local commit、Git push、PR、preview QR、preview、`mp:upload`、正式发布、云函数部署和真实数据写入是相互独立的动作。除非用户在当前任务明确授权对应动作，否则不得执行；一种授权不覆盖其他动作。

2026-08-07 的 preview QR 早于最终 `c2f438a`，不能作为当前 launch、正式 upload 或线上版本证据。禁止擅自 push、建 PR、再次生成 QR/preview、upload、正式发布、部署云函数或写真实数据。

## Documentation Maintenance

- `current.md` 只保留当前状态、证据链接和下一步，目标不超过50行；过程记录放 `docs/tasks/session-logs/`，不追加多轮互相冲突的“当前”结论。
- 工具操作只维护在对应 `docs/tools/`；规则只有一个权威正文，其余用链接引用。历史材料不得覆盖当前入口，也不默认整篇加载。
- 文档整理不隐含改变产品/安全/验收规则；需要放宽门禁时明确列为提案。已批准的技能精简及验证见 `docs/reports/2026-09-11-workflow-skill-audit.md`。

## Style and Commit

- 回复使用中文，技术名词和代码标识保持原文。
- 提交信息使用 conventional commits 风格。
- 提交前审查全部 staged diff，运行与风险相称的验证，并如实报告所有失败、跳过和例外。
