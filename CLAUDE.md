# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AI Collaboration Files

| File | Purpose | When to read |
|------|---------|-------------|
| `docs/context/architecture.md` | Stable architecture reference (layers, patterns, modes) | When touching unfamiliar modules or cross-cutting changes |
| `docs/tasks/current.md` | Current task state and next steps | At session start, to continue prior work |
| `docs/notes/learnings.md` | Temporary rules, gotchas, accumulated discoveries | Before making assumptions about edge cases |

Update `docs/tasks/current.md` when starting or completing significant work. Record temporary discoveries in `docs/notes/learnings.md`, not here.

## Project Overview

WeChat Mini Program for badminton round-robin tournament management. Native WeChat framework (WXML/WXSS/JS) + CloudBase backend. Full lifecycle: create > configure > start > score > rank > analytics.

## Commands

```bash
# Run all tests (Node.js native test runner)
node --test tests/*.test.js

# Run a single test
node --test tests/ranking-core.consistency.test.js

# Sync shared libraries to cloud functions (required before deploying)
./scripts/sync-cloud-common.sh

# Check if cloud common libs are in sync
./scripts/check-cloud-common.sh
```

Deploy cloud functions via WeChat DevTools: right-click `cloudfunctions/` > upload and deploy.

## Architecture (Summary)

> Full details: `docs/context/architecture.md`

- `miniprogram/pages/` — 14 UI pages, tabBar: home/launch/mine
- `miniprogram/core/` — Shared business logic
- `cloudfunctions/` — 20 cloud functions, shared code via `scripts/*-common.template.js` (source of truth, never edit `lib/` directly)
- `tests/` — ~170 test files, `node:test` + `node:assert/strict`
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

## MCP Configuration

- Verify working directory matches `.mcp.json` location. After config changes, restart Claude Code before testing.
- weapp_dev MCP: auto-launch on connection failure before reporting errors.

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

Only use: `systematic-debugging`, `test-driven-development`, `verification-before-completion`, `brainstorming`, `simplify`. Do not invoke any other skills.
