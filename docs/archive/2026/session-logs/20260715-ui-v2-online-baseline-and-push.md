# UI v2 Online Baseline And Git Push Handoff

## Confirmed Version State

- The user confirmed on 2026-07-15 that the online mini-program corresponds to `master` = `origin/master` = `5813ffc`.
- The active development branch is `codex/ui-optimization-v2`. At the start of this task its worktree was clean and five local commits were ahead of master; there were no uncommitted changes to preserve or commit.
- Those five commits, ending at `06922a6`, were pushed to `origin/codex/ui-optimization-v2` with upstream tracking enabled. No PR or merge was created.
- Git push transferred source history only. It did not run mini-program preview/upload, publish a release, deploy cloud functions, or change the online version.

## Development Scope

- Relative to master, product code differs only in `miniprogram/pages/schedule/index.wxml` and `miniprogram/pages/schedule/index.wxss`: pending `VS` and finished score sit between both teams so long names retain space.
- `cloudfunctions/` has no difference from master. The rejected `feature/core-flow-simplification` UI/flow direction remains closed; its points 4 and 5 are cancelled.
- Windows-native tooling, workflow records, hooks, regression tests, and handoff documentation are non-product development changes on the pushed branch.

## Screenshot Evidence Boundary

- The current `ui-screenshot-latest.json` is the successful current-branch smoke captured from the authoritative Windows worktree.
- Its capture-time provenance is `git.head=5813ffc` and `dirty=true`. It is a pre-commit acceptance snapshot proving the captured worktree's visual result, not a clean `06922a6` snapshot and not Git-push, upload, or online-release evidence.
- Machine-written JSONL/latest records were not rewritten. A future clean-head screenshot, if needed for a separate gate, must append a new qualifying smoke record.

## Documentation Synchronization

- Active agent entrypoints, README, architecture, current task, incremental plan, tooling guides, screenshot-record semantics, learning notes, and adjacent growth specification now separate online, Git, and deployment state.
- Historical core-flow documents retain their evidence but mark pending/blocked/gate wording and old remote-action requests as superseded historical checkpoints.
- Pre-commit gate passed on 2026-07-15: `npm run verify:full` completed 1165 tests (1159 passed, 6 skipped, 0 failed), deprecated API and 22-function cloud-common checks passed, lint reported 0 errors with 64 existing warnings, and `git diff --check` passed. The 38-file Markdown link/npm-script audit found zero missing references; final exact diff review remains mandatory immediately before commit.
