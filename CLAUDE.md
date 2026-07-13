# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AI Collaboration Files

| File | Purpose | When to read |
|------|---------|-------------|
| `docs/context/architecture.md` | Stable architecture reference (layers, patterns, modes) | When touching unfamiliar modules or cross-cutting changes |
| `docs/tasks/current.md` | Current task state and next steps | At session start, to continue prior work |
| `docs/tasks/incremental-ui-optimization-plan.md` | Current product/UI whitelist and approval gates | Before any user-visible work |
| `docs/tasks/windows-native-toolchain-migration-handoff.md` | Canonical Windows/WSL/preview paths and migration history | When paths, launchers, hooks, DevTools, or screenshots are involved |
| `docs/tasks/session-logs/` | Detailed verification logs from completed sessions | When investigating past test results or deployment history |
| `docs/specs/` | Feature design docs and implementation plans | When starting new feature work |
| `docs/notes/learnings.md` | Temporary rules, gotchas, accumulated discoveries | Before making assumptions about edge cases |
| `docs/tools/windows-dev-environment.md` | Windows-native development and private config contracts | Before changing local tooling or hooks |
| `docs/tools/weapp-ui-screenshot-workflow.md` | Real DevTools screenshot workflow and failure classification | Before visual acceptance work |
| `docs/tools/we-analysis-local-script.md` | 微信 we分析 datacube 本地拉取脚本使用说明 | 当需要拉取小程序访问数据/用户画像/留存等分析数据时 |

Update `docs/tasks/current.md` when starting or completing significant work. Record temporary discoveries in `docs/notes/learnings.md`, not here.

## Project Overview

WeChat Mini Program for badminton round-robin tournament management. Native WeChat framework (WXML/WXSS/JS) + CloudBase backend. Full lifecycle: create > configure > start > score > rank > analytics.

## Commands

```bash
# Run all tests (Node.js native test runner)
npm test

# Run a single test
node --test tests/ranking-core.consistency.test.js

# Sync shared libraries to cloud functions (required before deploying)
npm run sync:cloud-common

# Check if cloud common libs are in sync
npm run check:cloud-common

# Windows-native environment and real screenshot loop
npm run verify:windows-env
npm run screenshot:smoke

# Pull WeChat official analytics data (we分析 / datacube)
node scripts/fetch-we-analysis.js <type> <begin_date> <end_date>
# See docs/tools/we-analysis-local-script.md for supported types and usage
# Data saved to data/we-analysis/ (check existing files before re-pulling)
```

Deploy cloud functions via WeChat DevTools: right-click `cloudfunctions/` > upload and deploy. Do not upload the mini program, preview upload, release, or deploy cloud functions unless the user explicitly authorizes it.

## Architecture (Summary)

> Full details: `docs/context/architecture.md`

- `miniprogram/pages/` — 14 UI pages, tabBar: home/launch/mine
- `miniprogram/core/` — Shared business logic
- `cloudfunctions/` — 22 cloud functions, shared code via `scripts/*-common.template.js` (source of truth, never edit `lib/` directly)
- `tests/` — `node:test` + `node:assert/strict`; query the live tree rather than copying historical counts
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

## MCP Configuration

- Verify working directory matches `.mcp.json` location. After config changes, restart Claude Code before testing.
- Windows source: `D:\projects(WIN)\badminton-miniapp`; preview mirror: `D:\projects(WIN)\badminton-miniapp-preview`; WSL fallback requires `WEAPP_CODEX_DEV_MODE=wsl-mirror`.
- `weapp_dev` uses `ws://127.0.0.1:39420`; launcher readiness requires real Tool/App protocol responses.

## Style & Commit

- Respond in Chinese; keep technical terms and code identifiers in original form
- Commit: conventional commits (feat/fix/refactor/chore), Chinese messages
- Before commit: review all changes, run full test suite, confirm all pass

## Tool Usage

- Wx API / third-party / Node.js usage > query context7 docs first
- PR / Issue / CI / branch management > use github MCP, don't manually construct URLs
- Changes to state flow (draft/running/finished), scoring, ranking, schedule generation, share entry > list affected pages and cloud functions before coding

## Execution Mode

- Default: execute directly for non-functional changes (refactor, test, fix, config). No extra confirmation.
- Pause and confirm when: ambiguity, destructive consequences, production deploy, external credentials, real data writes.
- User-visible changes require explicit approval before implementation:
  - Page structure, copy, CTAs, navigation paths, user flows, action semantics
  - Even small changes to what users see or how they operate must be reviewed first.
- Non-functional changes (stability fix, test, refactor, perf, config): execute and report.

## Skill Policy

Follow the active host and repository skill instructions for the current session. A historical skill allowlist must not override current repository instructions.
