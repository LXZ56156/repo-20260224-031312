# Core Flow Simplification UI Fix Plan

> Status: cancelled on 2026-07-13. Historical point 3 is extracted separately; points 4 and 5 will not continue.
> Reading rule: all approval, pending, blocked, and next-gate wording below is a historical checkpoint superseded by the 2026-07-13 cancellation. Current authority lives in `docs/status/project-state.md` and `docs/specs/incremental-ui-optimization.md`.

## Baseline

- Date: 2026-06-22
- Branch: `feature/core-flow-simplification`
- Commit: `ab4c131`
- Initial worktree: clean
- Constraints: one UI point at a time; no cloud deploy, preview upload, remote push, or destructive Git commands
- Baseline verification: `1108/1108` tests passed; `npm run check` passed; `npm run lint` passed with 59 existing warnings and 0 errors

## Feedback Audit

1. Information removed too aggressively: lobby hero lost points per game, roster quota, total matches, and courts even though the view model still derives them. Ranking also lost result context; create kept obsolete UI after launch became canonical.
2. Layout risks: lobby summary can wrap around long names; schedule uses a fixed right column on 375px screens; ranking ad placement is too deep; create can expose stale form content.
3. Features that must stay removed: onboarding prose, preparation checklist, repeated CTAs, KPI card grids, analytics report prose, copy-report actions, frequent partner/opponent sections, and nested cards.
4. Likely files: lobby hero/viewModel/styles/tests/screenshot fixtures first; later create/launch, schedule match card, and ranking result page only after approval of the preceding point.
5. Tests needed: centralized lobby summary formatting for all modes, create compatibility navigation without auto-create, schedule small-screen structure, ranking summary/ad order, and existing sync/stale-response suites for each touched page.
6. Screenshot checks needed: semantic text assertions for lobby metadata, schedule matchup/status, ranking final context/ad order, and negative legacy-copy assertions for create compatibility.
7. Repair order: lobby hero -> create compatibility -> schedule small-screen card -> ranking summary/ad -> optional home/share-entry audit.

## Approval Matrix

| UI point | Visible change | Navigation/CTA/default impact | Status | Screenshot | User confirmation |
| --- | --- | --- | --- | --- | --- |
| 1. Lobby hero | Add one compact mode/points/people/matches/courts line | None | Confirmed | `tmp/ui-screenshots-actual/lobby*.png` | Passed |
| 2. Create compatibility | Replace obsolete form with safe launch redirect | Navigation changes; no auto-create | Confirmed | `tmp/ui-screenshots-actual/createCompat.png`, `launchCreating.png` | Passed |
| 3. Schedule small screen | Reflow match card at 375px | None | Historical checkpoint: technical acceptance was complete; later retained as the sole accepted extraction | `tmp\ui-screenshots-actual\scheduleRunning.png` (refreshed 2026-07-12) | Accepted extraction on 2026-07-13 |
| 4. Ranking result/ad | Add short result context and move existing ad slot | CTA/default unchanged | Historical checkpoint: was blocked; cancelled on 2026-07-13 | Not produced | Cancelled |
| 5. Home/share-entry | Audit only; change only if objective defect exists | To be assessed | Historical checkpoint: was blocked; cancelled on 2026-07-13 | Not produced | Cancelled |

## UI Point 1 Scope

- Generate `heroMetaLine` centrally in `lobbyViewModel.js`.
- Render it outside the collapsible admin panel as a single restrained text block.
- Keep the current title, status tag, role line, roster, and single next action.
- Do not restore KPI cards, checklists, guidance copy, or management actions.
- Add screenshot text checks for `lobbyEmpty`, `lobbyWaiting`, and `lobbyReady`.

## Remaining Risks

- Real DevTools font metrics may wrap the metadata differently from static structure tests.
- Long tournament names and the status tag require screenshot inspection on the actual 375px viewport.
- At this historical checkpoint, later UI points remained intentionally untouched pending explicit confirmation; points 4 and 5 were subsequently cancelled.

## UI Point 1 Verification

- Focused tests: 24 passed, 0 failed.
- Full suite: 1108 passed, 0 failed.
- `npm run check`: passed.
- `npm run lint`: 0 errors, 59 existing warnings.
- Screenshots: `lobbyEmpty`, `lobbyWaiting` with a long tournament name, and `lobbyReady` all passed DOM text checks and manual image inspection.
- Visual judgment: metadata is readable without chips or extra cards; the long title keeps the status tag intact; the primary action remains dominant; the collapsed management row remains secondary.
- Follow-up: admins now see the weak hint `可在下方「管理」中修改比赛参数`; participants do not see it. The refreshed `lobbyReady` image was inspected successfully.

## UI Point 2 Verification

- `pages/create/index` remains registered but only renders a minimal redirect/fallback surface.
- Old `mode` / `presetKey` values become a one-shot in-memory launch intent; launch highlights and scrolls to that card without calling `createTournament`.
- Profile gate, write guard, retry, and `clientRequestId` coverage now points to launch as the only create implementation.
- Focused compatibility/write tests: 49 passed, 0 failed.
- Full suite: 1113 passed, 0 failed; check passed; lint has 0 errors and 59 existing warnings.
- Screenshot: `createCompat.png` passed expected/forbidden text checks and manual inspection. Direct redirect screenshot is not stable because source `reLaunch` is interrupted by immediate `switchTab`; unit tests cover the actual route and the screenshot covers its final visible launch state.
- Follow-up busy-state fix: only the selected create button is disabled/loading; all other create buttons retain their normal green appearance while `actionGuard` still blocks a second request. Verified in `launchCreating.png`.

## UI Point 3 Verification

- Removed the fixed right-side rail from schedule match cards and split the card into a compact header plus a centered matchup body.
- Pending matches keep the status pill in the header and show `VS` between the two teams.
- Finished matches render the score in the center column between teams instead of the header/right side.
- Long team names are centered and capped at two lines; avatar tap filtering, whole-card navigation, status filtering, scorer notes, and score data semantics are unchanged.
- Focused schedule tests: 23 passed, 0 failed.
- Full suite: 1113 passed, 0 failed; `npm run check` passed; `npm run lint` passed with 0 errors and 59 existing warnings; `git diff --check` passed.
- Screenshot fixture now requires `.match-center-score` and expected score text `21:17`. Windows main project produced a valid `tmp\ui-screenshots-actual\scheduleRunning.png`; manual inspection confirmed pending cards keep `VS` centered and finished score `21:17` sits between both teams.
- 2026-07-12 refresh: the canonical source project regenerated `scheduleRunning.png`; the three-case screenshot smoke completed with coherent probe/recovery frames and `fakeFixtureSyncErrorCount=0`. At that checkpoint, the user-visible point still awaited final product confirmation; the 2026-07-13 closure retained it as the sole accepted extraction.

## Windows Migration Checkpoint And 2026-07-12 Resolution

- Current Windows main development project: `D:\projects(WIN)\badminton-miniapp`; main launcher: `D:\weapp-mcp-launcher\weapp-main-dev.cmd`; stable endpoint: `ws://127.0.0.1:39420`.
- Preview/upload mirror remains available at `D:\weapp-mcp-launcher\weapp-mcp.cmd` + `D:\projects(WIN)\badminton-miniapp-preview`, but it is not part of daily development or screenshot acceptance.
- Codex daily hooks now use cross-platform Node wrappers: Windows calls the main-project preflight/stop scripts, non-Windows defaults to no-op, and the legacy WSL mirror flow only runs when `WEAPP_CODEX_DEV_MODE=wsl-mirror` is set explicitly.
- `install-cloud-deploy-hook.sh` is Windows-compatible only through Git Bash: `D:\Soft\Git\bin\bash.exe scripts/install-cloud-deploy-hook.sh`. The Windows local `.git/hooks/post-commit` hook is installed and has passed `SKIP_CLOUD_POST_COMMIT_DEPLOY=1` skip verification; do not use it as a deployment test, and no cloud function deploy is required.
- At this checkpoint, squad fairness tests used a test-only deterministic search option. The accepted current test mechanism instead advances an operation clock by `0.002ms` per deadline read for exact beam-quality regression cases; the separate performance suite and production scheduling retain real wall time, original deadlines, and unchanged fairness assertions.
- Historical 2026-06/07 stress evidence passed single capture, repeated capture, reconnect, rapid-switch, same-surface, and long-running scenarios; its output directories under `D:\weapp-mcp-launcher\tmp-screenshots\` remain historical artifacts, not the current acceptance source.
- Historical fixture routes once included fake `tournamentId=demo` values. Current fixtures intentionally omit fake tournament IDs in both routes and top-level page data so reconnect cannot trigger real cloud fetch/watch calls.
- The later `App.captureScreenshot` timeout was resolved on 2026-07-12: minimized DevTools windows can stop or stale the Chromium/NW.js surface, so the current script targets the session-bound window, temporarily maximizes it, validates coherent frames, and restores the original window/foreground state.
- 2026-07-12 initial migration acceptance checkpoint: `npm run verify:light` = 74 tests / 68 pass / 6 skip / 0 fail; forced-`cmd.exe` `npm run verify:full` = 1157 tests / 1151 pass / 6 skip / 0 fail; `git diff --check` passed. Current submission-review counts live in `docs/tasks/current.md`.
- Historical next gate (superseded on 2026-07-13): point 3 confirmation was to precede point 4. The closure below accepted only the point 3 extraction and cancelled points 4 and 5; this plan grants no current implementation, commit, push, upload, or release authority.

## Cancellation (2026-07-13)

- Status: **cancelled / superseded**. The user rejected the overall simplified visual and flow direction after reviewing the branch.
- UI points 4 and 5 are cancelled rather than deferred. Continuing them would repair pages on top of a product baseline that is no longer accepted.
- UI point 3 is the only accepted extraction: the schedule card keeps pending `VS` and finished score between both teams so names receive more width. It is reimplemented as a focused two-file change on `codex/ui-optimization-v2`; this does not approve any other change from the old branch.
- The successor product boundary is `docs/specs/incremental-ui-optimization.md`.
