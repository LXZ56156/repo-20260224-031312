# 独立打水与 Launch 对齐验收记录（2026-08-08）

## Source Provenance

- Worktree: `D:\projects(WIN)\badminton-miniapp-worktrees\water-court-vant-spike-20260807`
- Branch: `codex/water-court-vant-spike-20260807`（无 upstream、未 push）
- Product implementation: `c2f438a922f3bd17dfd697e70efac33c1d06acd0`
- Baseline: `master` = `origin/master` = `5813ffc79f94c180fa5573eb25fb0d57f53b85df`
- Schedule overlay: source `38d6ea4`, equivalent cherry-pick `178e5dd`, stable patch-id `2cf91c83878e94c9b39fb57694c5b2cf09c4028d`

The approved implementation chain is `178e5dd` → `34193f1` → `ce73118` → `6da0cc5` → `6939688` → `ab1e6c5` → `7c6ba81` → `3449cad` → `c2f438a`. No next-gen branch, `codex/ui-optimization-v2` head or historical toolchain was merged wholesale.

## Launch Native Acceptance

The accepted source adds an invisible structural spacer to the quick-water action row so it has the same child structure as each tournament row. Both CTAs therefore use the same flex endpoint without changing visible copy, navigation or action semantics.

Current-source real WeChat DevTools image:

- File: `tmp/ui-screenshots-launch-align-20260807-final/launch.png` (ignored, local evidence)
- PNG: `717×1233`, `317391` bytes
- SHA-256: `30e2c54f7613ac2e4abb0d24de9740274e24e42c95c1b9bab0d77c386ef9c305`
- Capture-time DOM: quick-water and default tournament buttons were both `left=136.096939…px`, `width=184px`; deltas were `0px` with `1px` tolerance.
- The image was captured from the final source before it was committed as `c2f438a`; the commit contains that exact six-file patch. The user inspected the result, confirmed it and explicitly authorized the commit.

The geometry validator requires both configured selectors to match exactly once and checks only relative `left` and `width`. It does not prove absolute viewport containment, height, vertical alignment, touch size, pixel freshness or that two equally misplaced buttons are correct. Human inspection of the real image remains mandatory.

## 320 / 390 / 430 Evidence Vocabulary

- The accepted image and DOM offsets are one real DevTools simulator capture at the active simulator width (390 CSS px).
- The same WXML child structure and flex rules were checked for 320/390/430 equivalence; 320 and 430 were not separate real DevTools screenshots. They must be called structural/mathematical checks, never “three-width real images”.
- Shared `.btn-sm` height is `68rpx`, which converts to approximately `29.01 / 35.36 / 38.99px` at widths `320 / 390 / 430`. It is below the 44px touch recommendation at all three widths. This is pre-existing shared styling and was not expanded into the approved alignment patch; it remains an explicit follow-up risk requiring separate UI approval.

## Screenshot Tool Facts

- Capture-time session used an exact-worktree DevTools process. Observed roles were `39420` IDE HTTP, `39424` Chrome/CDP when present, and `39432` mini-program automation; these numbers are session-derived, not stable protocol assignments.
- The current script defaults incorrectly to `ws://127.0.0.1:39420`; the accepted run explicitly used `WEAPP_WS_ENDPOINT=ws://127.0.0.1:39432` after verifying the exact session.
- `scripts/dev/weapp-ui-screenshot.js` does not bind a Git/worktree receipt, manage windows, detect stale pixels, compare probe/restored frames or promote transactionally. Its success check is file size greater than 20KB plus optional launch relative geometry. Therefore endpoint/worktree/compile freshness and visual correctness were verified separately.
- A minimized DevTools surface can make `App.captureScreenshot` time out. The practical non-intrusive state is restored but behind the user's active window. The current script does not guarantee or prove focus preservation.

## Tests

- `node --test tests/waterSession.logic.test.js tests/waterSession.index.test.js tests/waterSession.page-lifecycle.test.js tests/waterSession.client-request.test.js tests/waterSession.ui-copy.test.js` → 49 pass, 0 fail.
- `getMineActive`, hidden `finish`, and the exact 24-participant/200-entry caps are currently source contracts rather than dedicated focused assertions; do not overstate the 49 tests as exhaustive.
- Latest focused command: `node --test tests/weapp-ui-screenshot-cases.test.js tests/list-density-motion.test.js` → 11 pass, 0 fail.
- `git diff --check` passed before `c2f438a` was committed.
- At `3449cad`, the then-current full suite recorded 1150 pass, 0 fail, 6 skip.
- Full-suite attempts after the launch/tool-only patch were not green: the parallel run recorded 1157 pass, 1 fail, 6 skip; the final serial run recorded 1157 pass, 3 fail, 6 skip. Failures were confined to `tests/squad.fairness.test.js`, varied with wall-clock beam-deadline seeds and reproduced outside the launch tests. The launch patch and its scheduler dependency closure were unchanged.
- This evidence supports a user-authorized commit exception; it does not permit claiming the full suite passed or silently ignoring future failures.

Documentation synchronization revalidation:

- authority-document link audit: 0 missing Markdown targets;
- `docs/tasks/current.md`: exactly 50 lines;
- live architecture count: 15 pages and 23 cloud functions;
- `npm run check:deprecated-wx-api`: passed;
- `npm run check:cloud-common`: passed with a process-scoped PowerShell npm script-shell override; the check took about 124 seconds;
- `npm run lint`: exit 0, 0 errors and 64 pre-existing warnings;
- final staged `git diff --check`: passed before the docs commit.

## Deployment and Preview State

- `waterSession` was deployed once after explicit user authorization and its remote content hash was checked against the local function. That authorization is exhausted and does not cover another deployment.
- `tmp/preview-qrcode.jpg` was generated on 2026-08-07 before the final launch alignment (`470×470`, `47537` bytes, SHA-256 `59fd815a83c6e649e1a54718c52a81b8c55df0fd3bb3e12cf5fdd74718d60931`). It is an ignored, ephemeral preview artifact and does not validate `c2f438a`.
- After explicit user authorization, `miniprogram-ci` uploaded version `6.1.2-10402ac` from this exact worktree on 2026-08-08 at about 12:01 CST using robot 1. The uploaded source marker was branch HEAD `10402ac1569dc9e6b2574d23c6fa25c2285b285d`; the product implementation inside it remains `c2f438a922f3bd17dfd697e70efac33c1d06acd0`.
- Upload description: `新增独立打水接龙搜索与记账；优化赛程比分和发起页对齐`.
- CI returned success for the full package (`__FULL__`, `1,018,647` bytes). Immediately before upload, the focused water suite was 49/49, launch/screenshot-tool suite 11/11, schedule UI-copy suite 2/2, and `git diff --check` passed.
- This action uploaded code only. It did not perform a formal mini-program release, regenerate a preview QR, push Git, create a PR, redeploy cloud functions or write real business data.

Privacy API package cleanup and replacement upload:

- Commit `911a9c76dff449215f28623682258eef5bd78b62` added one `packOptions.ignore` rule for the unused `miniprogram_npm/@vant/weapp/uploader/**` directory and a package-candidate regression test. No `miniprogram/` application file or `cloudfunctions/` file changed.
- The guard failed before the rule and passed afterward. The real `miniprogram-ci@2.1.31` candidate filter then reported 526 candidates, zero uploader files and zero `wx.getClipboardData` / `wx.chooseImage` / `wx.chooseMedia` / `wx.chooseVideo` / `wx.chooseMessageFile` hits; the used Vant button, popup and tag remained present.
- Focused verification recorded 111 pass, 0 fail and 6 Windows-only skips. Lint exited 0 with 64 pre-existing warnings, the deprecated WeChat API check passed and `git diff --check` passed. The full suite still reproduced the previously documented scheduler wall-clock failures; the isolated scheduler audit/beam/fairness rerun recorded 39 pass and 4 fail, with no dependency path from this upload-only change.
- At 2026-08-08 12:37 CST, `miniprogram-ci` robot 1 successfully uploaded replacement version `6.1.2-911a9c7` with description `移除未使用的文件与照片视频选择接口，保留现有功能`. The compiler included 428 code files; the returned full package size was `1,005,991` bytes.
- The replacement upload supersedes `6.1.2-10402ac` for review purposes but is still code upload only: no formal release, preview QR generation, Git push/PR, cloud deployment or real business data write occurred.
