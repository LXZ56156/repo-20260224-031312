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

## Approval Requirement

- 所有会影响用户可见行为的改动，都必须先向用户提出方案并获得明确审核，再开始实施。
- 这条规则覆盖但不限于：页面结构、交互入口、按钮文案、提示文案、跳转路径、用户步骤、默认行为、删除/取消/修改等动作语义。
- 即使改动很小，只要会改变用户看到的内容或操作方式，也不能跳过审核直接修改。
- 只有当用户明确指定某个改动时，才能视为该项已经审核通过。
