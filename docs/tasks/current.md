# Current Task

> AI session handoff. Keep this file concise; detailed evidence belongs in the linked session log.

## Status: collaborative_water_v2_local_release_candidate_committed

## Exact State (2026-08-13)

- Online/product baseline remains `master` = `origin/master` = `5813ffc79f94c180fa5573eb25fb0d57f53b85df`.
- Active development worktree: `C:\Users\LIZIXUAN\.codex\worktrees\ba45\badminton-miniapp` on `codex/collaborative-water-v2-20260809`.
- V2 implementation parent is `9b3f94aafc3217062c30b5c49f14b3f102ec3df6`. The local release candidate is the current branch tip after the approved commit series; resolve its exact identity with `git rev-parse HEAD`. The branch has no upstream and has not been pushed.
- The last uploaded mini-program remains `6.1.2-911a9c7`; the deployed `waterSession` remains the pre-V2 compatible production version.
- Original overlay `38d6ea4` was applied as cherry-pick `178e5dd`; both have patch-id `2cf91c83878e94c9b39fb57694c5b2cf09c4028d`.

## Approved Increment Chain

| Commit | Approved scope |
|---|---|
| `178e5dd` | schedule central `VS` / score overlay |
| `34193f1` | standalone water ledger, launch entry and `waterSession` |
| `ce73118` | approved water controls and scoped Vant Weapp build |
| `6da0cc5` | compact equal-side game selection, including 1v1 |
| `6939688` | relay import and roster search |
| `ab1e6c5` | minimal Windows shell/tooling hardening |
| `7c6ba81` | refresh, polling and stale-response protection |
| `3449cad` | repeated-write idempotency and conflict recovery |
| `c2f438a` | align quick-water CTA with tournament CTAs |

## Product Boundary

- Quick water works without creating a tournament. The owner may add names manually or from relay text, invite/claim participants, record one equal-side game from 1v1 upward, directly add/subtract 1–99 water with a native picker (default 1), search large rosters and undo the latest entry.
- There is no user-visible “结束 / 完成 / 另开账本” action. The cloud `finish` branch is compatibility code and must not be exposed or removed without separate approval.
- Next-gen/C3/Home redesign, a global design system and cross-page visual unification remain out of scope.

## Collaborative V2 Implementation

- User approved rebuilding standalone water as a stable shared room with independent rounds and an append-only, attributable event ledger.
- Joined members may record games and direct water, view the complete feed, and correct/reverse their own records; the owner may handle any current-round record.
- The target page uses `总账 / 流水 / 球友` with persistent `记一局 / 单独记水` actions. It removes user-facing balance-difference output and the ambiguous global `撤销上一条`.
- `新一轮` archives the current round, retains the roster, claimed identities and stable invite link, and does not expose an end action.
- The client, page, backward-compatible cloud function, migration library and regression coverage now exist in this worktree. Full behavior, cloud contract, migration and rollout requirements remain in `docs/specs/collaborative-water-ledger-v2.md`.
- Production tests no longer depend on DevTools screenshot fixtures. Screenshot tooling remains dev-only evidence and is not part of the runtime deployment set.

## Acceptance and Delivery Facts

- Current-source 390px real WeChat DevTools images cover visitor long feed, 24-player member, owner empty state, game sheet, entry detail and archived round. Two isolated UI reviews and the main agent found P0=0/P1=0.
- Final image evidence is under `C:\Users\LIZIXUAN\.codex\visualizations\2026\08\13\019ff4d8-3761-7262-9d8b-5cfcc4915554\water-v2-approved-fix-final-r4`.
- Frozen local release-prep verification: focused release tests 159/159; `npm run check` passed; lint has 0 errors and 64 existing warnings; syntax and `git diff --check` passed. A pre-commit glob run hit the documented `squad.fairness` wall-clock fluctuation; its file rerun passed 17/17. The exact committed candidate was then tested from 262 tracked test files: 1350 total, 1344 passed, 0 failed and 6 Windows-only skips.
- 320px and 430px remain structural/browser-approximation evidence rather than separately captured real DevTools images. Capture them or record an explicit release exception before client upload.
- The V2 candidate is committed locally but not pushed. No V2 cloud collection/index/config write, cloud deployment, real migration, canary, preview, upload, review submission or formal release has occurred.

## Next Action

Finish the local release candidate and follow `docs/tasks/collaborative-water-v2-release-handoff-2026-08-13.md`. The next external gate is not client upload: first create the private collections, indexes and fully disabled feature config, then deploy only the backward-compatible `waterSession`, run V1 remote smoke, and run the zero-write migration dry-run. Each external write/deploy/migration/flag/preview/upload/release action remains separately authorized. The private-Desktop/plan/lock/network-proof route is historical only.

## Authority

- Product spec: `docs/specs/standalone-water-ledger.md`
- Approved V2 target: `docs/specs/collaborative-water-ledger-v2.md`
- Route and boundaries: `docs/tasks/incremental-ui-optimization-plan.md`
- Detailed evidence: `docs/tasks/session-logs/2026-08-08-standalone-water-launch-acceptance.md`
- Screenshot procedure: `docs/tools/weapp-ui-screenshot-workflow.md`
- Release handoff: `docs/tasks/collaborative-water-v2-release-handoff-2026-08-13.md`
- Completed screenshot handoff (historical): `docs/tasks/weapp-real-devtools-screenshot-simplified-handoff-2026-08-12.md`
