# Core Flow Simplification UI Fix Plan

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
| 3. Schedule small screen | Reflow match card at 375px | None | Windows screenshot captured; awaiting final user confirmation | `tmp\ui-screenshots-actual\scheduleRunning.png` | Pending |
| 4. Ranking result/ad | Add short result context and move existing ad slot | CTA/default unchanged | Blocked by point 3 | Pending | Pending |
| 5. Home/share-entry | Audit only; change only if objective defect exists | To be assessed | Blocked by point 4 | Pending | Pending |

## UI Point 1 Scope

- Generate `heroMetaLine` centrally in `lobbyViewModel.js`.
- Render it outside the collapsible admin panel as a single restrained text block.
- Keep the current title, status tag, role line, roster, and single next action.
- Do not restore KPI cards, checklists, guidance copy, or management actions.
- Add screenshot text checks for `lobbyEmpty`, `lobbyWaiting`, and `lobbyReady`.

## Remaining Risks

- Real DevTools font metrics may wrap the metadata differently from static structure tests.
- Long tournament names and the status tag require screenshot inspection on the actual 375px viewport.
- Later UI points remain intentionally untouched until explicit confirmation.

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

## Windows Migration Checkpoint

- Windows main development project: `D:\projects\badminton-miniapp`; main launcher: `D:\weapp-mcp-launcher\weapp-main-dev.cmd`; stable endpoint: `ws://127.0.0.1:39420`.
- Legacy preview/upload mirror remains available at `D:\weapp-mcp-launcher\weapp-mcp.cmd` + `D:\projects\badminton-miniapp-preview`, but it is no longer part of daily development or screenshot acceptance.
- Codex daily hooks now use Windows main-project preflight and no-op stop; WSL mirror sync hooks remain as legacy files only.
- `install-cloud-deploy-hook.sh` is Windows-compatible only through Git Bash: `D:\Soft\Git\bin\bash.exe scripts/install-cloud-deploy-hook.sh`. Do not install `.git/hooks/post-commit` during migration; no cloud function deploy is required.
- Squad fairness tests now pass a test-only deterministic search option for exact beam-quality regression cases. Production scheduling still uses the original wall-clock soft/hard budget by default and fairness assertions were not relaxed.
- Windows screenshot tests passed: single screenshot, 10 consecutive screenshots, 9-case sequential navigation, 5 rounds of reconnect-per-case, 20 rapid switches, 30 same-surface captures, and 3-minute long-running captures.
- Valid output directories on Windows: `D:\weapp-mcp-launcher\tmp-screenshots\multi-page-orchestrated` and `D:\weapp-mcp-launcher\tmp-screenshots\long-running`.
- `/pages/create/index?mode=multi_rotate&presetKey=rotation_8`, `/pages/schedule/index?tournamentId=demo`, and `/pages/ranking/index?tournamentId=demo` all produced non-blank PNGs on Windows. `create` legacy redirect needs about 7.5s and should be given explicit wait time.
- Main-project `tmp\ui-screenshots-actual\scheduleRunning.png` is valid and confirms the UI point 3 score placement. A later rerun hit `App.captureScreenshot` timeout while `39420`, page stack, and DOM remained healthy; track that as a DevTools screenshot surface issue and do not block this migration commit on it.
- Next handoff point: after this commit/push, ask for final UI point 3 confirmation, then continue to UI point 4 only after user approval.
