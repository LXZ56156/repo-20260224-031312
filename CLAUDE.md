# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WeChat Mini Program for badminton round-robin tournament management. Built with native WeChat framework (WXML/WXSS/JS) + WeChat CloudBase backend. Covers the full lifecycle: create → configure → start → score → rank → analytics.

## Commands

```bash
# Run all tests (Node.js native test runner, no npm)
node --test tests/*.test.js

# Run a single test
node --test tests/ranking-core.consistency.test.js

# Sync shared libraries to cloud functions (required before deploying)
./scripts/sync-cloud-common.sh

# Check if cloud common libs are in sync
./scripts/check-cloud-common.sh
```

Deploy cloud functions via WeChat DevTools: right-click `cloudfunctions/` → upload and deploy.

## Architecture

### Layers

```
miniprogram/pages/     → UI pages (WXML/WXSS/JS), 14 pages with tabBar (home, launch, mine)
miniprogram/core/      → Business logic modules shared across pages
miniprogram/core/storage/ → Local storage abstraction with TTL caching
miniprogram/permission/   → Permission checks (isAdmin, isParticipant, canEditScore)
miniprogram/config/env.js → Cloud environment config (develop/trial/release)
cloudfunctions/        → 22 cloud functions, each with index.js entry + lib/ shared code
scripts/               → Build tooling; *-common.template.js are source-of-truth for cloud shared libs
tests/                 → ~130 tests using node:test + node:assert/strict
```

### Cloud Function Shared Libraries

Cloud functions share code via template files in `scripts/*-common.template.js`. Running `./scripts/sync-cloud-common.sh` copies these templates into each cloud function's `lib/` directory. The templates are the source of truth — never edit `cloudfunctions/*/lib/` files directly.

Shared modules: `common.js`, `mode.js`, `permission.js`, `player.js`, `rankingCore.js`, `score.js`, `cloud.js`.

### Key Patterns

- **Error classification** (`core/cloud.js`): Cloud call errors are parsed into categories — `isConflict`, `isNetwork`, `isInvalidWriteShape`, `isPermission`, `isParam` — enabling targeted recovery and user messaging.
- **Action guard** (`core/actionGuard.js`): Prevents concurrent duplicate operations with page-level busy state tracking.
- **Tournament sync** (`core/tournamentSync.js`): Polling-based real-time sync with backoff, cleanup on page hide, restart on page show, stale-response detection with cache fallback.
- **Page module composition**: Complex pages split logic into separate modules mixed into `Page({})` via spread — e.g. settings page uses `settingsSyncController`, `settingsActions`, `settingsViewModel`.
- **Normalize on read** (`core/normalize.js`): Tournament data is normalized after fetch to ensure consistent shape regardless of cloud document state.
- **Navigation & flow** (`core/nav.js`, `core/matchFlow.js`, `core/uxFlow.js`): 状态驱动的页面跳转，根据赛事状态（draft/running/finished）决定导航目标
- **Retry action** (`core/retryAction.js`): 可混入页面的通用重试方法工厂
- **Sync status** (`core/syncStatus.js`): 同步状态机（loading/stale/offline），供 UI 展示同步指示器

### Game Modes

| Constant | Label | Description |
|----------|-------|-------------|
| `multi_rotate` | 多人转 | Individual rotation, ranked per player |
| `squad_doubles` | 小队转 | Squad A vs B doubles with target wins |
| `fixed_pair_rr` | 固搭循环赛 | Fixed pair round-robin, single game decides |

`mode.js` (shared between client and cloud via template) handles mode normalization and detection. `doubles` and `mixed_fallback` both normalize to `multi_rotate`.

### Ranking Sort Order

Wins → point differential → points scored → name (alphabetical).

### Tournament States

`draft` → `running` → `finished`. Deleted tournaments marked as `missing`.

## Testing Conventions

- Framework: `node:test` + `node:assert/strict` (no external test dependencies)
- Tests mock wx APIs and cloud calls by stubbing globals — look at existing tests for patterns
- Test categories: unit, integration, resilience (async-stale-response), consistency, smoke (end-to-end flow), UI copy
- Multi-environment consistency tests verify that client and cloud-side logic (permissions, ranking, player utils) produce identical results
- File naming conventions:
  - `*.test.js` — 单元/集成测试
  - `*.consistency.test.js` — 客户端与云函数逻辑一致性验证
  - `*.smoke.test.js` — 端到端流程验证
  - `*.async-stale-response.test.js` — 弱网/过期响应场景

## Style

- Always respond in Chinese; keep technical terms and code identifiers in their original form
- Commit messages follow conventional commits format (feat/fix/refactor/chore)

## Tool Usage

- 涉及微信 API、第三方库、Node.js API 的用法或版本问题时，优先用 context7 查文档再写代码
- 涉及 PR、Issue、CI 状态、分支管理时，优先用 github MCP 操作，不手动拼 URL
- 改动比赛状态流转（draft/running/finished）、录分、排名、对阵生成、分享进入链路时，先列出受影响的页面和云函数，再动手改

## Execution Mode

- 默认直接执行代码修改、重构、测试、格式化、脚本运行与常规仓库维护，不为普通编辑与命令执行额外停下来确认。
- 仅在以下情况暂停并向用户确认：需求存在歧义、操作可能造成破坏性后果、涉及生产部署/外部凭据/真实数据写入。
- 涉及功能变更、界面 UI、交互流程、按钮/提示文案、导航路径、默认行为等用户可见改动时，必须先提出方案并获得用户明确审核，再开始实施。
- 稳定性修复、bug fix、异常恢复、测试补充、日志补强、代码重构、性能优化、工程配置调整等非功能性改动，默认直接实施并在完成后汇报结果。
