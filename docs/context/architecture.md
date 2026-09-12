# Architecture Reference

## Release and Source Layers

| Layer | Current fact |
|---|---|
| Online/product baseline | Recorded client `55bfc4f` / `6.1.2-e60d827-r3`; actual deployment is not inferred from Git |
| Current development | Exact branch, HEAD and uncommitted changes: [current task](../tasks/current.md) |
| Cloud | Local cloud fixes and V2 capabilities do not prove deployed functions or enabled flags |
| Preview | Historical QR images are not current-source or online evidence |
| Git remote | Tracking refs are source history, not client release or cloud deployment evidence |

Never infer one layer from another. The current task state is in `docs/tasks/current.md`.

The prepared Huawei Flexus host is documented in `docs/context/huawei-flexus-migration-prep.md`. It is infrastructure readiness only; the mini-program still runs on WeChat CloudBase and no migration or cutover is implied.

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
  → create an independent ledger or continue a recent/history ledger
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

The above limits describe the V1 compatibility backend. Current source also includes V2 member writes, paginated audit history and corrections/reversals. The approved product model is one independent ledger, roster and invitation link per gathering: creating another ledger does not clear or close previous ledgers. `createLedger` derives a room ID from the caller and request ID; `listLedgers` returns the caller's valid owner/member ledgers. V2 still uses room/round/entry storage and retains old APIs for compatibility, but the UI exposes no new-round or finish action.

The history query scans the caller's memberships, validates room access and sorts summaries by update time. Its new `waterRoomMembers(openid ASC, _id ASC)` index is declared but not deployed. Unmigrated V1 discovery includes the owner's stable ledger; V1 member history still requires the original invitation link. There is no implicit migration. Source presence does not prove production availability or UI acceptance. Contracts: [approved independent-ledger increment](../specs/independent-water-ledgers.md), [V1](../specs/standalone-water-ledger.md), [V2](../specs/collaborative-water-ledger-v2.md).

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
