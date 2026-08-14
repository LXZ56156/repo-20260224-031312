# Architecture Reference

## Layers

```
miniprogram/pages/        UI pages (WXML/WXSS/JS), 14 pages, tabBar: home/launch/mine
miniprogram/core/         Business logic shared across pages
miniprogram/core/storage/ Local storage with TTL caching
miniprogram/permission/   Permission checks (isAdmin, isParticipant, canEditScore)
miniprogram/config/env.js Cloud environment config (develop/trial/release)
cloudfunctions/           22 cloud functions, each: index.js entry + lib/ shared code
scripts/                  Build tooling; *-common.template.js = source of truth for cloud libs
tests/                    node:test + node:assert/strict; count from the live tree when needed
```

## Cloud Function Shared Libraries

Template files in `scripts/*-common.template.js` are the source of truth. `npm run sync:cloud-common` copies them to each cloud function's `lib/`. Never edit `cloudfunctions/*/lib/` directly.

Shared modules: `common.js`, `mode.js`, `permission.js`, `player.js`, `rankingCore.js`, `score.js`, `schedule.js`, `fixedPair.js`.

## Key Patterns

- **Error classification** (`core/cloud.js`): Cloud call errors parsed into `isConflict`, `isNetwork`, `isInvalidWriteShape`, `isPermission`, `isParam` for targeted recovery.
- **Action guard** (`core/actionGuard.js`): Page-level busy state preventing concurrent duplicate operations.
- **Tournament sync** (`core/tournamentSync.js`): Polling with backoff, cleanup on hide, restart on show, stale-response detection with cache fallback.
- **Page module composition**: Complex pages split into modules mixed via spread into `Page({})` (e.g. settings: `settingsSyncController`, `settingsActions`, `settingsViewModel`).
- **Normalize on read** (`core/normalize.js`): Tournament data normalized after fetch for consistent shape.
- **Navigation & flow** (`core/nav.js`, `core/matchFlow.js`, `core/uxFlow.js`): State-driven navigation by tournament status (draft/running/finished).
- **Retry action** (`core/retryAction.js`): Reusable retry method factory, mixable into pages.
- **Sync status** (`core/syncStatus.js`): Sync state machine (loading/stale/offline) for UI indicators.

## Current Product Baseline

The user confirmed on 2026-07-15 that the online mini-program corresponds to `master` = `origin/master` = `5813ffc`. The historical `codex/ui-optimization-v2` branch later accumulated several unrelated product and cloud experiments; it remains neither the online version nor the 2026-07-29 incremental UI baseline.

The current target baseline must be reconstructed in a new isolated worktree from `master@5813ffc`, then receive only commit `38d6ea4`. It preserves the full create/configure/start/score/rank/review-share flow. The retired `feature/core-flow-simplification`, expanded `codex/ui-optimization-v2`, and all next-gen UI branches are historical evidence only; their additional flows, features and global visual systems are not part of this architecture baseline.

The only approved product overlay is commit `38d6ea4`, local to `pages/schedule/index.wxml` and `index.wxss` plus its focused test: pending `VS` and completed score sit between both teams, while names may use two lines. It must not change routing, scoring, filters, permissions, cloud contracts, or any other page.

## Game Modes

| Constant | Label | Description |
|----------|-------|-------------|
| `multi_rotate` | multi_rotate | Individual rotation, ranked per player |
| `squad_doubles` | squad_doubles | Squad A vs B doubles with target wins |
| `fixed_pair_rr` | fixed_pair_rr | Fixed pair round-robin, single game decides |

`mode.js` handles mode normalization and detection. `doubles` and `mixed_fallback` both normalize to `multi_rotate`.

## Ranking Sort Order

Wins > point differential > points scored > name (alphabetical).

## Tournament States

`draft` > `running` > `finished`. Deleted tournaments marked as `missing`.
