# AGENTS.md

## Project Overview

微信小程序羽毛球赛事管理项目，使用原生微信框架（WXML / WXSS / JS）和微信云开发。核心链路：创建 > 配置 > 开赛 > 录分 > 排名 > 复盘。

## Reference Files

- `docs/context/architecture.md` — 完整架构参考（层级、模式、关键 pattern）
- `docs/tasks/current.md` — 当前任务状态，会话开始时先读
- `docs/specs/` — 功能设计文档和实现计划
- `docs/notes/learnings.md` — 临时规则与经验积累
- `docs/tools/we-analysis-local-script.md` — we分析数据拉取脚本使用说明
- `docs/tools/weapp-ui-screenshot-workflow.md` — 微信开发者工具真实截图流程

## Commands

```bash
node --test tests/*.test.js          # 全量测试
npm run check:cloud-common           # 检查共享库同步状态
npm run check:deprecated-wx-api      # 检查废弃微信 API
```

云函数部署通过微信开发者工具完成。

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
2. **验证后完成**：宣称完成前运行 `node --test tests/*.test.js` 和 `npm run check`
3. **微信 API**：查文档再写代码，避免废弃 API
4. **云函数模板**：改 `scripts/*-common.template.js`，改完运行 sync 脚本
5. **云函数上传提醒**：完成改动后检查是否涉及 `cloudfunctions/`；如有需要通过微信开发者工具上传的云函数，在最终汇报中提醒一次具体函数名，不反复提醒
6. **UI 完工自检门禁**：向用户汇报 UI 完成前，主控必须亲自检查当前源码生成的真实微信 DevTools 实图，不能只依赖自动量测或浏览器近似稿。至少检查操作显著性与主次层级、44px 触达、对齐与文字稳定、边界/裁剪/遮挡/溢出，以及任务相关的输入、清空、空结果、选中、禁用等状态；涉及响应式布局时覆盖 320/390/430。发现任何肉眼可见问题必须先修复并重跑实图，全部通过后才能向用户汇报。详细清单见 `docs/notes/learnings.md`。
7. **Windows shell**：npm、测试、hook 和部署守卫不得调用裸 `bash` 或直接执行 `.sh`；统一通过 `scripts/run-bash-script.js` 或 `scripts/lib/git-bash.js` 显式解析 Git Bash，避免误命中 Windows 的 WSL `bash.exe`。

## Style & Commit

- 回复使用中文，技术名词和代码标识保持原文
- 提交信息使用 conventional commits 风格（feat/fix/refactor/chore）
- Before commit: review all changes, run full test suite, confirm all pass
