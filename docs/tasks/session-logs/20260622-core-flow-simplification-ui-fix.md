# Core Flow Simplification UI Fix Session

> Historical session log started on 2026-06-22. Current paths, verification, and next-action authority are maintained in `docs/tasks/current.md`; the 2026-07-12 resolution addendum below supersedes operational statements from the original migration checkpoints without rewriting their history.

## Start State

- Date: 2026-06-22
- Branch: `feature/core-flow-simplification`
- HEAD: `ab4c131`
- Worktree before changes: clean
- User feedback: preserve the simplification, restore decision information, repair broken layouts, and require screenshot plus user confirmation for every UI point.
- Scope this session: audit all requested points, then implement and verify UI point 1 only.

## Baseline

- `node --test tests/*.test.js`: 1108 passed, 0 failed
- `npm run check`: passed
- `npm run lint`: passed with 59 existing warnings, 0 errors

## UI Point Status

| Point | Status | Screenshot | User confirmation | Verification |
| --- | --- | --- | --- | --- |
| Lobby hero information | Confirmed | `tmp/ui-screenshots-actual/lobbyEmpty.png`, `lobbyWaiting.png`, `lobbyReady.png` | Passed on 2026-06-23 | 1108 tests + check + lint passed |
| Create compatibility | Confirmed | `tmp/ui-screenshots-actual/createCompat.png`, `launchCreating.png` | Passed on 2026-06-23 | 1113 tests + check + lint passed |
| Schedule small-screen card | Technical acceptance complete; awaiting final product confirmation | `tmp\ui-screenshots-actual\scheduleRunning.png` (refreshed 2026-07-12) | Pending | Original session 1115 tests; current migration/full verification passed |
| Ranking summary/ad | Not started | Pending | Pending | Not authorized; blocked by explicit approval after point 3 |
| Home/share-entry audit | Not started | Pending | Pending | Blocked by point 4 |

## Constraints And Risks

- No cloud function changes or deployment.
- No preview upload or remote push.
- Do not restore removed low-value guidance or duplicate CTAs.
- Real screenshot inspection is required before asking for user confirmation.

## UI Point 1 Result

- Added centralized `heroMetaLine`: mode, points, roster count, total matches, and courts.
- Rendered the line in the public hero; no KPI cards, checklist, guide copy, CTA, navigation, or business behavior was restored or changed.
- Screenshot assertions now require points, people, matches, and courts in all three lobby cases.
- `lobbyWaiting` uses a long tournament name to cover title/status pressure at the real screenshot width.
- Final screenshots were manually inspected and show real page content. Two earlier captures exposed an intermittent DevTools screenshot-surface blank/timeout; those files were rejected and recaptured.
- No cloud function files changed; no deploy, upload, commit, or push performed.
- User follow-up: changed launch button disabling from global `createBusy` to the selected `createBusyKey` only. Cross-card repeated taps remain deduplicated by `launch:createTournament`.
- `launchCreating.png` confirms only the 8-player button is gray/loading while the other create buttons stay green.
- Follow-up verification: focused tests 35/35; final full suite 1113/1113; check passed; lint 0 errors with 59 existing warnings.
- User follow-up added an admin-only hint below the role: `可在下方「管理」中修改比赛参数`.
- Follow-up verification: focused lobby tests 24/24; final independent full suite 1108/1108; check passed; lint 0 errors with 59 existing warnings.
- Follow-up screenshot: `lobbyReady.png` is valid and manually inspected; `lobbyWaiting.png` confirms non-admin users do not see the hint. The `lobbyEmpty` DOM text assertion passed, but repeated DevTools screenshot calls timed out or captured a blank simulator surface, so the stale/blank PNG was not counted as visual evidence.

## UI Point 2 Result

- Replaced the create form and duplicate cloud-write path with a compatibility redirect and visible fallback button.
- Added one-shot launch intent handling for old mode/preset links; the selected card is highlighted but never auto-created.
- Moved legacy create write-contract tests to launch so profile gating, structured failures, retry request IDs, and timeout guards remain covered on the canonical path.
- `createCompat` screenshot validates the final launch surface, the 8-player selection highlight, explicit create buttons, and absence of legacy create copy.
- Initial full suite hit unrelated scheduler timing failures; isolated rerun passed, and the final independent full suite passed 1113/1113. No scheduler code changed.
- No cloud function files changed; no deploy, upload, commit, or push performed.

## UI Point 3 Result

- Removed the schedule card's fixed right rail and moved match metadata into a small header.
- Reworked the matchup body to keep teams left/right and place finished scores in the center; pending matches still show `VS` in the same center position.
- Long pair names now wrap to two centered lines instead of being forced into one truncated line.
- Kept interaction semantics unchanged: whole card opens the match, avatar taps still filter, status filter values are unchanged, scorer note remains below the matchup.
- Added screenshot fixture coverage for long names, `优先录分`, `21:17`, and the `.match-center-score` selector.
- Verification: focused schedule suite 23/23; final full suite 1113/1113; `npm run check` passed; `npm run lint` passed with 0 errors and 59 existing warnings; `git diff --check` passed.
- Historical screenshot note: the original WSL refresh failed because DevTools automation was not reachable. This was superseded by the successful 2026-07-12 Windows canonical-source capture described in the resolution addendum; final user product confirmation is still required before UI point 4.

## Migration Checkpoint

- User requested committing and pushing all pending work before moving development to Windows.
- Windows screenshot validation completed outside this repo:
  - Launcher: `D:\weapp-mcp-launcher`
  - Preview project at that historical checkpoint: `D:\projects\badminton-miniapp-preview` (later moved; not a current path)
  - Endpoint: `ws://127.0.0.1:39420`
  - Single screenshot, 10 consecutive screenshots, 9-case sequential navigation, 5 reconnect-per-case rounds, 20 rapid switches, 30 same-surface screenshots, and 18 long-running screenshots all passed.
  - Valid Windows output directories: `D:\weapp-mcp-launcher\tmp-screenshots\multi-page-orchestrated`, `D:\weapp-mcp-launcher\tmp-screenshots\long-running`.
- Documented the new screenshot workflow in `docs/tools/weapp-ui-screenshot-workflow.md` and `docs/notes/learnings.md`.
- Migration handoff state: UI points 1 and 2 are confirmed; UI point 3 code/test work is complete and should receive Windows real-screenshot visual confirmation next; UI point 4 remains blocked until that confirmation.

## Historical Windows Main Development Finalization (superseded 2026-07-12)

- At the 2026-07-03 checkpoint the daily Windows project was `D:\projects\badminton-miniapp`; that location is now a metadata-only shell and must not be used as source.
- At the same checkpoint the preview mirror was `D:\projects\badminton-miniapp-preview`; it has since moved to the sibling `(WIN)` path.
- Codex project hooks now use cross-platform Node wrappers: Windows calls the main-project preflight/stop scripts, non-Windows defaults to no-op, and the legacy WSL mirror flow only runs when `WEAPP_CODEX_DEV_MODE=wsl-mirror` is set explicitly.
- `install-cloud-deploy-hook.sh` can run on Windows only through Git Bash: `D:\Soft\Git\bin\bash.exe scripts/install-cloud-deploy-hook.sh`. The Windows local `.git/hooks/post-commit` hook is installed and has passed `SKIP_CLOUD_POST_COMMIT_DEPLOY=1` skip verification; it was not used to deploy cloud functions.
- Squad fairness regression tests now use a test-only deterministic search option for exact quality assertions. Production squad scheduling still defaults to the original wall-clock soft/hard budget, and the 7v7/9v9 fairness assertions were not relaxed.
- UI point 3 has a valid Windows main-project screenshot at `tmp\ui-screenshots-actual\scheduleRunning.png`; manual inspection confirmed pending cards keep `VS` centered and finished score `21:17` appears between teams.
- Historical follow-up: later reruns of `scheduleRunning` hit `App.captureScreenshot` timeout while DevTools port, page stack, selectors, and text assertions were healthy. The 2026-07-12 resolution below closes this issue.

## 2026-07-12 Resolution Addendum

- Canonical Windows source: `D:\projects(WIN)\badminton-miniapp`; preview/upload mirror: `D:\projects(WIN)\badminton-miniapp-preview`; WSL fallback: `/home/lizixuan/projects(WSL)/badminton-miniapp`. `D:\projects\badminton-miniapp` is a metadata-only shell.
- The window lifecycle fix binds the session PID/CreationDate/window handle, temporarily maximizes only the target DevTools window for capture, verifies coherent probe/recovery frames, and restores the original minimized state and exact restore-time user foreground on both success and failure.
- `npm run screenshot:smoke` passed from canonical source for `launch`, `scheduleRunning`, and `home`; the promoted `scheduleRunning.png` confirms centered `VS` and `21:17`, with no fake fixture sync errors.
- 2026-07-12 initial migration acceptance checkpoint: `npm run verify:light` = 74 total / 68 pass / 6 skip / 0 fail; forced-`cmd.exe` `npm run verify:full` = 1157 total / 1151 pass / 6 skip / 0 fail; `git diff --check` passed. Current submission-review counts live in `docs/tasks/current.md`.
- UI point 3 is technically accepted and awaits the user's final product confirmation. UI point 4 remains a user-visible change and must not start without explicit approval.

## 2026-07-13 Closure Addendum

- This log remains an unchanged historical account of the follow-up work on `feature/core-flow-simplification`.
- The user rejected the overall simplified UI/flow direction. UI points 4 and 5 are cancelled and the old branch will not be repaired further.
- UI point 3 is the sole accepted extraction: on the new `master`-based branch, pending `VS` and finished score stay centered between both teams to give names more room.
- All other launch/create/lobby/match/ranking/analytics/home/share-entry behavior and visual structure return to the `master@5813ffc` baseline.
- New work is governed by `docs/tasks/incremental-ui-optimization-plan.md`; this addendum does not alter the historical verification statements above.
