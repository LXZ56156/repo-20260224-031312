# Current Task

> AI session handoff. Keep this file concise; detailed evidence belongs in the linked session log.

## Status: standalone_water_and_launch_alignment_accepted

## Exact State (2026-08-08)

- Online/product baseline remains `master` = `origin/master` = `5813ffc79f94c180fa5573eb25fb0d57f53b85df`.
- Active development worktree: `D:\projects(WIN)\badminton-miniapp-worktrees\water-court-vant-spike-20260807` on `codex/water-court-vant-spike-20260807`.
- Current product implementation is `c2f438a922f3bd17dfd697e70efac33c1d06acd0`; the branch has no upstream and has not been pushed.
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

## Acceptance and Delivery Facts

- User accepted the launch alignment and authorized its commit. Real DevTools geometry was `left=136.0969px`, `width=184px` for both CTAs; focused tests are 11/11 and `git diff --check` passes.
- `waterSession` was deployed once under explicit authorization and its remote hash was verified. This does not authorize another deployment.
- A preview QR was generated before the final `c2f438a` alignment; it is not current launch acceptance or a formal release. No `mp:upload`, formal release, push or PR has occurred, and no real business data was written.
- Full-suite runs after `c2f438a` were not green because `tests/squad.fairness.test.js` reproduced pre-existing wall-clock deadline variance; do not report the suite as passed. Exact evidence and screenshot limitations are in the session log.

## Next Action

Documentation is synchronized. Wait for the user's next single UI point; follow browser direction approval → tests first → minimal native implementation → current-source DevTools image → user confirmation → necessary size/state checks → separate commit.

## Authority

- Product spec: `docs/specs/standalone-water-ledger.md`
- Route and boundaries: `docs/tasks/incremental-ui-optimization-plan.md`
- Detailed evidence: `docs/tasks/session-logs/2026-08-08-standalone-water-launch-acceptance.md`
- Screenshot procedure: `docs/tools/weapp-ui-screenshot-workflow.md`
