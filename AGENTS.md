# AGENTS.md

## Project Overview

微信小程序羽毛球赛事管理项目，使用原生微信框架（WXML / WXSS / JS）和微信云开发。核心链路：创建 > 配置 > 开赛 > 录分 > 排名 > 复盘。

## Reference Files

- `docs/context/architecture.md` — 完整架构参考（层级、模式、关键 pattern）
- `docs/tasks/current.md` — 当前任务状态，会话开始时先读
- `docs/tasks/incremental-ui-optimization-plan.md` — 当前增量 UI 优化边界与验收门槛
- `docs/tasks/incremental-ui-restart-handoff-2026-07-29.md` — master + 唯一比分 overlay 的新对话恢复合同
- `docs/tasks/windows-native-toolchain-migration-handoff.md` — Windows 原生工具链迁移事实与历史验收
- `docs/specs/` — 功能设计文档和实现计划
- `docs/notes/learnings.md` — 临时规则与经验积累
- `docs/tools/windows-dev-environment.md` — Windows 主开发环境与本地配置契约
- `docs/tools/we-analysis-local-script.md` — we分析数据拉取脚本使用说明
- `docs/tools/weapp-ui-screenshot-workflow.md` — 微信开发者工具真实截图流程

## Frontend Design Skill

- 2026-07-24 起，下一代 UI 新建或重做必须加载个人 skill `frontend-design`，并同时遵守 `weapp-regression-guard`。
- 安装位置：`C:\Users\LIZIXUAN\.codex\skills\frontend-design`；官方来源与校验记录见 next-gen 集成树的 `docs/next-gen/FRONTEND-DESIGN-SKILL.md`。
- skill 的 web 设计原则要翻译为原生微信小程序约束：WXML/WXSS/JS、包体、低端机、系统字体、44px 触达、reduced motion、无远程视觉依赖；不得照搬 hover、Web 字体或浏览器专属 CSS。
- 旧的暖米色+酸绿、暗底+荧光绿、报纸规则线三种方案均已被用户判退，也正是该 skill 警示的常见 AI 默认风格；只能作为反例，不能继续微调复用。

## Current UI Route (2026-07-29)

- 下一代全面升级与 C3/Home 重设计已暂停；`nextgen-ui-redesign-20260724` 及其代码、资产、截图、浏览器稿只作历史证据，不得作为当前产品基线。
- 当前路线是 `master@5813ffc` 加唯一批准的 `38d6ea4` schedule 中央 `VS`/比分位置 overlay，再逐点微调。
- 新任务必须先读 `docs/tasks/incremental-ui-restart-handoff-2026-07-29.md`；从 master 创建新的隔离 `codex/` branch/worktree 并精确 cherry-pick `38d6ea4`。不要切换主工作区分支，也不要从当前 `codex/ui-optimization-v2` head 或 next-gen worktree 起步。
- 每个新 UI 点先用浏览器近似稿取得用户选择，再做原生实现和真实 DevTools 实图；浏览器渲染不能代替小程序验收。

## Commands

```powershell
npm run verify:light                 # 常用轻量回归
npm run verify:full                  # 全量测试 + check + lint + diff check
npm run verify:windows-env           # Windows 本地配置/launcher 审计，不打印 secret
npm run ui:screenshot -- --list      # 列出真实截图 case
npm run screenshot:smoke             # launch + scheduleRunning + home 实图验收
npm run screenshot:schedule          # scheduleRunning 单页实图
npm run screenshot:diagnose -- scheduleRunning
npm run weapp:probe                   # 验证 39420 的真实 Tool.getInfo/App.getCurrentPage
npm run records:latest               # 查看上传/部署/截图成功记录
npm test                             # 全量测试
npm run sync:cloud-common            # 同步云函数共享库
npm run check:cloud-common           # 检查共享库同步状态
```

Windows 主开发路径为 `D:\projects(WIN)\badminton-miniapp`，preview/upload 镜像为 `D:\projects(WIN)\badminton-miniapp-preview`，WSL fallback 为 `/home/lizixuan/projects(WSL)/badminton-miniapp`。`D:\projects\badminton-miniapp` 只是元数据空壳，禁止使用。日常 npm、hooks、DevTools 和截图走 Windows 原生入口；WSL mirror 只有显式设置 `WEAPP_CODEX_DEV_MODE=wsl-mirror` 才启用。自动化端口为 `ws://127.0.0.1:39420`。

用户于 2026-07-15 确认：当前线上正式版对应 `master` = `origin/master` = `5813ffc`。历史 `codex/ui-optimization-v2` 后来已叠加 schedule 中央比分、Windows 工具链、打水、事件管道、clone 等多批本地/已推送研发成果，但均未因此进入小程序线上；Git push 不等于小程序发布。2026-07-29 的新增量路线不得直接复用该分支 head。

云函数部署通过微信开发者工具完成。不要执行 `npm run mp:upload`、`npm run mp:preview`、云函数 deploy、preview upload 或真实发布，除非用户明确要求。

## Architecture (Summary)

- `miniprogram/pages/`：14 个页面，tabBar: home/launch/mine
- `miniprogram/core/`：跨页面业务逻辑
- `cloudfunctions/`：22 个云函数
- 云函数共享代码以 `scripts/*-common.template.js` 为准，不直接修改 `cloudfunctions/*/lib/*`
- Tournament states: `draft` > `running` > `finished`
- Ranking: wins > point diff > points scored > name
- Game modes: `multi_rotate`, `squad_doubles`, `fixed_pair_rr`

## Testing Conventions

- Framework: `node:test` + `node:assert/strict` (no external dependencies)
- Tests mock wx APIs and cloud calls by stubbing globals — follow existing patterns
- File naming: `*.test.js` (unit/integration), `*.consistency.test.js` (client-cloud parity), `*.smoke.test.js` (e2e), `*.async-stale-response.test.js` (weak network)

## Deprecated APIs

- `wx.saveFile` / `wx.removeSavedFile` > use `wx.getFileSystemManager().*`
- `wx.getSystemInfo` / `wx.getSystemInfoSync` > use `miniprogram/core/systemInfo.js`
- Check: `npm run check:deprecated-wx-api`

## Execution Mode

- Default: execute directly for non-functional changes (refactor, test, fix, config). No extra confirmation.
- Pause and confirm when: ambiguity, destructive consequences, production deploy, external credentials, real data writes.
- User-visible changes require explicit approval before implementation:
  - Page structure, copy, CTAs, navigation paths, user flows, action semantics
  - Even small changes to what users see or how they operate must be reviewed first.
- Non-functional changes (stability fix, test, refactor, perf, config): execute and report.

## Methodology

1. **测试先行**：实现/修复前，先写或确认测试覆盖
2. **验证后完成**：宣称完成前按风险运行 `npm run verify:light` 或 `npm run verify:full`
3. **微信 API**：查文档再写代码，避免废弃 API
4. **云函数模板**：改 `scripts/*-common.template.js`，改完运行 `npm run sync:cloud-common`
5. **云函数上传提醒**：完成改动后检查是否涉及 `cloudfunctions/`；如有需要通过微信开发者工具上传的云函数，在最终汇报中提醒一次具体函数名，不反复提醒
6. **Windows shell**：普通 npm 开发/验证不得依赖全局 `script-shell` 或裸 `bash`；guarded deploy/hook 与显式 compatibility flow 统一通过 `scripts/run-bash-script.js`。
7. **增量 UI**：目标产品基线固定为 `master@5813ffc` + `38d6ea4` 的 schedule 中央 `VS`/比分布局；任何其他页面结构、视觉或流程调整都必须先经浏览器方案选择，再做原生实现、真实 DevTools 实图验收和单独提交。

## Style & Commit

- 回复使用中文，技术名词和代码标识保持原文
- 提交信息使用 conventional commits 风格（feat/fix/refactor/chore）
- Before commit: review all changes, run full test suite, confirm all pass
