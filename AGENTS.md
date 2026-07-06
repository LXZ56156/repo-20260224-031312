# AGENTS.md

## Project Overview

微信小程序羽毛球赛事管理项目，使用原生微信框架（WXML / WXSS / JS）和微信云开发。核心链路：创建 > 配置 > 开赛 > 录分 > 排名 > 复盘。

## Reference Files

- `docs/context/architecture.md` — 完整架构参考（层级、模式、关键 pattern）
- `docs/tasks/current.md` — 当前任务状态，会话开始时先读
- `docs/specs/` — 功能设计文档和实现计划
- `docs/notes/learnings.md` — 临时规则与经验积累
- `docs/tools/windows-dev-environment.md` — Windows 主开发环境、Codex hooks、MCP/Claude/DevTools 本地配置
- `docs/tools/we-analysis-local-script.md` — we分析数据拉取脚本使用说明
- `docs/tools/weapp-ui-screenshot-workflow.md` — 微信开发者工具真实截图流程与故障分型

## Commands

```bash
npm run verify:light                 # 常用轻量回归：hooks + squad + UI matrix
npm run verify:full                  # 全量测试 + check + lint + diff check
npm run verify:windows-env           # Windows 本地私有配置/工具链审计，不打印 secret
npm run ui:screenshot -- --list      # 列出真实截图 case
npm run screenshot:schedule          # 跑 scheduleRunning 真实截图
npm run screenshot:diagnose -- scheduleRunning # 截图链路诊断，失败时输出分型
node --test tests/*.test.js          # 全量测试
bash scripts/sync-cloud-common.sh    # 同步云函数共享库
bash scripts/check-cloud-common.sh   # 检查共享库同步状态
```

Windows 主开发路径为 `D:\projects\badminton-miniapp`，微信开发者工具 launcher 为 `D:\weapp-mcp-launcher\weapp-main-dev.cmd`，自动化端口为 `ws://127.0.0.1:39420`。旧 `D:\weapp-mcp-launcher\weapp-mcp.cmd` + `D:\projects\badminton-miniapp-preview` 只保留给 preview/upload 镜像用途。

云函数部署通过微信开发者工具完成。不要执行 `npm run mp:upload`、`npm run mp:preview`、云函数 deploy、preview upload 或真实发布，除非用户明确要求。

## Architecture (Summary)

- `miniprogram/pages/`：14 个页面，tabBar: home/launch/mine
- `miniprogram/core/`：跨页面业务逻辑
- `cloudfunctions/`：20 个云函数
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
- Check: `scripts/check-deprecated-wx-api.sh`

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
4. **云函数模板**：改 `scripts/*-common.template.js`，改完运行 sync 脚本
5. **云函数上传提醒**：完成改动后检查是否涉及 `cloudfunctions/`；如有需要通过微信开发者工具上传的云函数，在最终汇报中提醒一次具体函数名，不反复提醒
6. **Windows shell**：项目 npm scripts 通过 `D:\Soft\Git\bin\bash.exe` 执行 shell 脚本；PowerShell 里手动运行 bash 脚本时优先使用该绝对路径，避免命中 WSL bash。

## Style & Commit

- 回复使用中文，技术名词和代码标识保持原文
- 提交信息使用 conventional commits 风格（feat/fix/refactor/chore）
- Before commit: review all changes, run full test suite, confirm all pass
