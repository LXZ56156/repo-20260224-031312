# Collaborative Water V2 Release Handoff

> Purpose: hand off the current local release candidate without replaying UI or private-Desktop history. This document authorizes no remote mutation by itself.

## Current candidate

- Worktree: `C:\Users\LIZIXUAN\.codex\worktrees\ba45\badminton-miniapp`
- Branch: `codex/collaborative-water-v2-20260809`
- Implementation parent: `9b3f94aafc3217062c30b5c49f14b3f102ec3df6`
- Candidate identity: the current branch tip after the approved local commit series; use `git rev-parse HEAD` rather than embedding a self-referential hash in this document.
- State: V2 product, compatible cloud function, migration library, tests, documentation and dev-only screenshot evidence are committed locally. The branch has not been pushed.
- Last uploaded client: `6.1.2-911a9c7`; it does not contain V2.
- Cloud environment: develop/trial/release currently resolve to the same production CloudBase environment. There is no staging environment.

## Runtime release scope

Production runtime files are limited to:

- `cloudfunctions/waterSession/index.js`
- `cloudfunctions/waterSession/waterLogic.js`
- `miniprogram/core/waterLedger.js`
- `miniprogram/core/waterSession.js`
- `miniprogram/pages/water/index.js`
- `miniprogram/pages/water/index.json`
- `miniprogram/pages/water/index.wxml`
- `miniprogram/pages/water/index.wxss`

Migration is a separate controlled tool scope: `cloudfunctions/waterSession/waterMigration.js` plus its dry-run/audit entry point. Screenshot and Win32 bridge files under `scripts/dev/` are development evidence only and must not be described as production runtime.

Do not include these abandoned private/background-desktop helpers in the release candidate: `scripts/dev/weapp-background-desktop-bridge.ps1`, `scripts/dev/weapp-transparent-unocclude.ps1` and their matching tests. Preserve them in the worktree until the user separately approves cleanup; simply leave them unstaged. The main screenshot tool, fixture, Win32 capture helper and screenshot tests may be kept only as a separate dev-tooling commit.

## Evidence already closed

- Current-source 390px real WeChat DevTools captures: visitor long feed, 24-player member, owner empty state, 12v12 game sheet, entry detail and archived round.
- Evidence directory: `C:\Users\LIZIXUAN\.codex\visualizations\2026\08\13\019ff4d8-3761-7262-9d8b-5cfcc4915554\water-v2-approved-fix-final-r4`.
- Two isolated UI reviews: P0=0, P1=0.
- Frozen local release-prep validation: focused release tests 159/159; `npm run check` pass; lint 0 errors/64 existing warnings; syntax and diff checks pass. A pre-commit glob run hit the documented `squad.fairness` wall-clock fluctuation and its isolated file rerun passed 17/17. The exact committed candidate was then tested from 262 tracked test files: 1350 total, 1344 passed, 0 failed and 6 Windows-only skips.
- Production water tests have a boundary test preventing dependencies on `scripts/dev` screenshot tooling.

The 320px and 430px states have structural/browser-approximation evidence, not separate real DevTools captures. Before client upload, either capture the two widths or obtain an explicit release exception that records this limitation.

## Local release-prep artifacts

- `scripts/water-v2-cloud-bootstrap.manifest.json` declares the seven private collections, four required composite indexes and the fully disabled initial `water_feature_flags/collaborative_v2` document.
- `scripts/validate-water-v2-cloud-bootstrap.js` is declaration-only and cannot connect to or mutate CloudBase.
- The migration dry-run audit is zero-write by default and must reject adapters exposing write capability. A real CloudBase read adapter is still an external prerequisite.
- No local CloudBase CLI, login or CI private key is currently available in this worktree environment.

## Mandatory external sequence

Every numbered mutation is a separate authorization gate. Do not skip ahead.

1. **Cloud bootstrap authorization**: explicitly bind the production environment; create/verify the seven private collections, four indexes and disabled feature config. Preserve `waterSessions`. Record environment ID, before/after state, index definitions, config revision and operator.
2. **Compatible cloud deploy authorization**: deploy only `waterSession` while every V2 flag remains false. Record local source hash, remote function detail and deployed hash/package identity.
3. **V1 remote-smoke authorization**: with test data/accounts only, verify create/get/getMineActive/join/addParticipants/owner game/direct/undo/finish. Stop on any incompatible result.
4. **Zero-write dry-run authorization**: read all legacy `waterSessions`, write nothing, and produce room/participant/entry counts, source/target hashes, conservation results and anomalies. Stop after the report; do not migrate.
5. **Canary migration authorization**: migrate only named test rooms. This authorization does not include production rooms or feature flags.
6. **Per-stage flag authorization**: separately enable canary V2 read, owner write, member write, correct/reverse and createRound. Each stage must include authorization to set `emergencyReadOnly=true` automatically on the spec's zero-tolerance conditions, and must record revision/before/after/operator.
7. **Real multi-account acceptance**: owner/member/visitor across at least three rooms, using test data only.
8. **Preview authorization**: generate a current-candidate preview after cloud compatibility and canary acceptance.
9. **Upload authorization**: upload the committed current candidate with a unique version and exact commit hash. Dirty-worktree upload is forbidden.
10. **Review submission and formal release authorization**: each remains a separate action after observation gates pass.

## Stop conditions

- Feature config missing/malformed; any V1 write becomes disabled; any V1 smoke mismatch.
- Any dry-run write, unknown participant, duplicate entry ID, invalid units, conservation failure, or source hash/version change.
- Any migration checksum/count mismatch, seq gap, permission leak, unexpected real-data write, or missing audit receipt.
- Any command targets an environment other than the explicitly reviewed production environment.
- Any release build comes from a dirty worktree, a different path/branch, or lacks an exact commit identity.

On the first stop condition, perform no retry or next-stage mutation. Preserve the fixed, sensitive-free receipt and request a new decision.

## Focused verification before the first external gate

```powershell
npm run check:water-v2-cloud-bootstrap
node --test tests/water-v2-cloud-bootstrap.test.js tests/waterSession.v2-cloud.test.js tests/waterSession.v2-migration.test.js tests/waterSession.v2-migration-runner.test.js tests/waterSession.v2-migration-dry-run.test.js
npm run check
npm run lint
npm test
git diff --check
```

The local candidate commit series was created under explicit authorization. Before the first external gate, verify the exact branch tip with `git rev-parse HEAD`, confirm only the four documented abandoned helper paths remain untracked, and re-run the same gate against the committed candidate. Do not push, deploy, migrate, preview or upload merely because this handoff exists.
