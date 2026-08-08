# Architecture Reference

## Release and Source Layers

| Layer | Current fact |
|---|---|
| Online/product baseline | `master` = `origin/master` = `5813ffc` |
| Current development product commit | `c2f438a` on isolated `codex/water-court-vant-spike-20260807` |
| Cloud | `waterSession` deployed once under explicit authorization; this does not release the client |
| Preview | One QR was generated before `c2f438a`; it is not current-source or online evidence |
| Git remote | Current branch has no upstream and has not been pushed |

Never infer one layer from another. The current task state is in `docs/tasks/current.md`.

## Layers

```text
miniprogram/pages/        15 native pages; tabBar: home/launch/mine
miniprogram/core/         Shared client business logic and cloud wrappers
miniprogram/core/storage/ Local storage with TTL caching
miniprogram/permission/   Permission checks
miniprogram/config/env.js Cloud environment config (develop/trial/release)
cloudfunctions/           23 cloud functions
scripts/                  Tooling; *-common.template.js is source of truth for shared cloud libs
tests/                    node:test + node:assert/strict; count from the live tree
```

## Tournament Domain

Core route: create → configure → start → score → rank → review/share.

- Tournament states: `draft` → `running` → `finished`; deleted tournaments are `missing`.
- Game modes: `multi_rotate`, `squad_doubles`, `fixed_pair_rr`; legacy `doubles` and `mixed_fallback` normalize to `multi_rotate`.
- Ranking sort: wins → point differential → points scored → name.
- Key modules: `core/cloud.js`, `actionGuard.js`, `tournamentSync.js`, `normalize.js`, `nav.js`, `matchFlow.js`, `uxFlow.js`, `retryAction.js`, `syncStatus.js`.

The only schedule overlay inherited from the 2026-07-29 restart is central pending `VS` / completed score positioning. It does not change scoring, routes, filters, permissions or cloud contracts.

## Standalone Water Domain

`pages/water/index` is a separate ledger, entered from the launch page and independent of tournament creation.

```text
launch “开始记水”
  → create or continue owner active session
  → add names manually / relay import / share invitation and claim
  → record equal-side game or direct transfer
  → derive ledger and recent entries
  → poll / refresh / optimistic conflict recovery
```

Client modules:

- `core/waterSession.js`: typed cloud wrapper and client request IDs;
- `core/waterLedger.js`: derive won/treat/net rows and descriptions;
- `pages/water/index.js`: profile gate, owner/viewer state, 8-second polling, stale-response rejection, roster/search/selection state and mutation guards.

Cloud/data:

- function `waterSession`, collection `waterSessions`;
- max 24 participants, max 200 entries, units 1–99;
- `expectedVersion` optimistic concurrency and last 20 `clientRequestId` values for dedupe;
- owner-only add/record/undo; authenticated visitor may join or claim an unbound manual participant;
- responses sanitize participant bindings and expose only `claimed`, `isViewer`, session-level `isOwner` and `viewerParticipantId`, never raw OpenID values.

The server recognizes `active` and a compatibility `finished` state, but the current client exposes no finish action or historical/new-ledger lifecycle. Do not surface or remove that compatibility branch without approval. Full contract: `docs/specs/standalone-water-ledger.md`.

## Page and Component Boundary

- `pages/water` is non-tabBar; launch remains a tabBar page.
- Vant Weapp 1.11.7 compiled components are present under `miniprogram/miniprogram_npm/@vant/weapp`; water currently declares button, popup and tag components.
- The dependency is scoped implementation infrastructure, not authorization to rewrite every page with a component library.

## Cloud Function Shared Libraries

Template files in `scripts/*-common.template.js` are the source of truth. Use the repository sync/check commands and never edit `cloudfunctions/*/lib/*` directly for shared changes.

Shared modules include `common.js`, `mode.js`, `permission.js`, `player.js`, `rankingCore.js`, `score.js`, `schedule.js` and `fixed-pair.js`/`fixedPair.js` variants as required by each function.

## Key Reliability Patterns

- **Error classification** (`core/cloud.js`): classifies conflicts, network, invalid write shape, permission and parameter failures.
- **Action guard** (`core/actionGuard.js`): prevents duplicate page actions across profile gates, confirmation waits and network writes.
- **Versioned refresh**: tournament and water pages reject stale async responses and refresh after version conflicts.
- **Client request idempotency**: water mutations reuse request IDs for an unchanged retry intent; cloud dedupes already-applied requests.
- **Normalize on read** (`core/normalize.js`): normalizes tournament data after fetch.
- **Page module composition**: complex pages may mix controller/action/view-model modules into `Page({})`.
