# Architecture Reference

状态：现行结构参考，2026-10-04 核对。仅在跨模块或数据边界任务中按节读取；文档路由见 [总索引](../README.md)，操作见 [默认工作流](../tools/agent-development-workflow.md)。页面/函数注册随源码变化，以 [app.json](../../miniprogram/app.json) 和 [cloudbaserc.json](../../cloudbaserc.json) 为准；发布、部署与授权由 [current](../tasks/current.md) 单独记录。

## Release and Source Layers

| Layer | Current fact |
|---|---|
| Online/product baseline | Latest verified client release: [current task](../tasks/current.md); historical `6.1.2-702625a` release evidence: [2026-09-23 confirmation](../tasks/session-logs/2026-09-23-online-release-confirmed.md) |
| Current development | Exact branch, HEAD and uncommitted changes: [current task](../tasks/current.md) |
| Cloud | Committed baseline: 23 registered functions; paused local worktree: 26. Historically managed/deployed functions are a separate layer. Latest deployment receipts: [current task](../tasks/current.md). Local fixes/V2 code do not prove production availability |
| Preview | Historical QR images are not current-source or online evidence |
| Git remote | Tracking refs are source history, not client release or cloud deployment evidence |

Never infer one layer from another. The current task state is in `docs/tasks/current.md`.

The prepared Huawei Flexus host is documented in the [historical preparation record](huawei-flexus-migration-prep.md). It is infrastructure readiness only; the mini-program still runs on WeChat CloudBase and no migration or cutover is implied.

## Layers

```text
miniprogram/pages/        15 committed native pages (16 in paused local worktree); tabBar: home/launch/mine
miniprogram/core/         Shared client business logic and cloud wrappers
miniprogram/core/storage/ Local storage with TTL caching
miniprogram/permission/   Permission checks
miniprogram/config/env.js Cloud environment config (develop/trial/release)
cloudfunctions/           23 committed functions (26 in paused local worktree), not deployment receipts
scripts/                  Tooling; *-common.template.js is source of truth for shared cloud libs
tests/                    node:test + node:assert/strict; count from the live tree
```

## Tournament Domain

Core route: create → configure → start → score → rank → review/share.

- Tournament states: `draft` → `running` → `finished`; deleted tournaments are `missing`.
- Game modes: `multi_rotate`, `squad_doubles`, `fixed_pair_rr`; legacy `doubles` and `mixed_fallback` normalize to `multi_rotate`.
- Ranking sort: wins (descending) → point differential (descending) → points scored (descending) → name (`localeCompare`); source: `core/rankingCore.js` and `scripts/rankingCore-common.template.js`.
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

The history query scans the caller's memberships, validates room access and sorts summaries by update time. Its `waterRoomMembers(openid ASC, _id ASC)` index was verified present remotely during the [2026-10-03 read-only audit](../reports/2026-10-03-backend-audit.md). Unmigrated V1 discovery includes the owner's stable ledger; V1 member history still requires the original invitation link. There is no implicit migration. Source presence does not prove production availability or UI acceptance. Contracts: [approved independent-ledger increment](../specs/independent-water-ledgers.md), [V1](../specs/standalone-water-ledger.md), [V2](../specs/collaborative-water-ledger-v2.md).

## Page and Component Boundary

- `pages/water` is non-tabBar; launch remains a tabBar page.
- Vant Weapp 1.11.7 compiled components are present under `miniprogram/miniprogram_npm/@vant/weapp`; water currently declares button, popup and tag components.
- The dependency is scoped implementation infrastructure, not authorization to rewrite every page with a component library.

## Cloud Function Shared Libraries

Template files in `scripts/*-common.template.js` are the source of truth. Use the repository sync/check commands and never edit `cloudfunctions/*/lib/*` directly for shared changes. Windows shell/sync commands and the authorized CloudBase CLI deployment entry are in [Windows environment](../tools/windows-dev-environment.md).

Shared modules include `common.js`, `mode.js`, `permission.js`, `player.js`, `rankingCore.js`, `score.js`, `schedule.js` and `fixed-pair.js`/`fixedPair.js` variants as required by each function.

## Key Reliability Patterns

- **Error classification** (`core/cloud.js`): classifies conflicts, network, invalid write shape, permission and parameter failures.
- **Action guard** (`core/actionGuard.js`): prevents duplicate page actions across profile gates, confirmation waits and network writes.
- **Versioned refresh**: tournament and water pages reject stale async responses and refresh after version conflicts.
- **Client request idempotency**: water mutations reuse request IDs for an unchanged retry intent; cloud dedupes already-applied requests.
- **Normalize on read** (`core/normalize.js`): normalizes tournament data after fetch.
- **Page module composition**: complex pages may mix controller/action/view-model modules into `Page({})`.
