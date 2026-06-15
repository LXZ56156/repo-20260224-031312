# 2026-06-15 Growth Flywheel Phase 1 Verification

## Scope

- Source spec: `docs/specs/growth-flywheel-optimization.md` v1.2.
- Implemented first phase: Task 1 through Task 6.
- Left as backlog: Task 7.
- No cloud functions added.
- No database collections added.

## Implemented

- `share-entry` now renders draft / running / finished states differently.
- Draft share landing participant list can show real avatars and resolves `cloud://` avatars through the existing avatar display cache.
- New joiners get a lightweight lobby guide stored in local `wx.Storage`.
- Ranking, schedule, analytics, and home finished-state surfaces now expose clearer post-match share and review actions.
- Added `growthTracker` with `console.info` and `wx.reportEvent` best-effort reporting.
- Screenshot workflow is documented in `docs/tools/weapp-ui-screenshot-workflow.md` and exposed as `npm run ui:screenshot`.

## UI Screenshot Check

Command:

```bash
npm run ui:screenshot -- home shareDraft shareRunning shareFinished lobbyGuide ranking schedule analytics
```

Result:

- `home`: ok
- `shareDraft`: ok
- `shareRunning`: ok
- `shareFinished`: ok
- `lobbyGuide`: ok
- `ranking`: ok
- `schedule`: ok
- `analytics`: ok

Screenshot output directory:

```text
tmp/ui-screenshots-actual/
```

Notes:

- DevTools automation endpoint: `ws://127.0.0.1:39420`.
- `home` is a tabBar page and should be opened with `switchTab` in the screenshot script.
- If a screenshot is blank or times out, run `./scripts/dev/weapp-dev.sh preview` and retry the single case.

## Regression Checks

```bash
node --test tests/*.test.js
```

Final result: 1096 / 1096 pass.

```bash
npm run check
```

Final result: pass.

Details:

- Deprecated wx API check passed.
- Cloud common sync check passed.

## Commits

Pushed to `origin/master`:

- `03fb80e chore(growth): add analysis and screenshot tooling`
- `5f0aa67 feat(growth): wire lightweight flywheel tracking`
- `08fa322 feat(growth): polish flywheel UI surfaces`

## Residual Follow-Up

- User should do product acceptance on the generated screenshots or real device.
- Task 7 remains a second-phase backlog item.
