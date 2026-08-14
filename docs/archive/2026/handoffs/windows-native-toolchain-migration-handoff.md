# Windows Native Toolchain Migration Handoff

> Prepared on 2026-07-12 for a fresh AI development session. This is the authoritative handoff for the second path migration and Windows-native tooling work.

## 2026-07-13 Branch Supersession

- The Windows-native tooling was ported, validated, committed, and later pushed on `codex/ui-optimization-v2`, which starts from `master@5813ffc`.
- User-confirmed release boundary on 2026-07-15: the online mini-program still corresponds to `master` = `origin/master` = `5813ffc`. Pushing the development branch did not upload/preview, publish a mini-program release, deploy cloud functions, or change production.
- The former `feature/core-flow-simplification` product direction is retired. Its launch/create/lobby/match/ranking/analytics/home/share changes are not part of the new branch.
- The only approved product extraction is the two-file schedule-card layout with pending `VS` / finished score centered between both teams. Screenshot selectors and fixtures were adapted to the master product structure on 2026-07-13; fresh current-branch smoke and manual image acceptance completed on 2026-07-14, so the 2026-07-12 old-branch images are now historical only.
- The 2026-07-14 cold-start/final review fixed four additional non-functional gaps: empty process collections after CLI quit, a premature second `auto` that could race a slow AppService compile, unstable DevTools top-level window selection/foreground restoration, and squad-quality regressions varying with wall-clock CPU contention. A single-auto cold start completed in `65.524s`; the final runner serializes files and gives fairness-only tests a deterministic operation clock, while the separate performance suite retains real time. Production scheduling and fairness thresholds are unchanged.
- The current `launch + scheduleRunning + home` smoke completed in `58.369s`, wrote the canonical current-branch record, restored minimized `showCmd=2` and the original foreground, and reported zero deprecated-file API warnings and fake-fixture sync errors.
- Final current-branch verification passed 1165 tests (1159 passed, 6 skipped, 0 failed), deprecated API and cloud-common checks, lint with 0 errors, and `git diff --check`.
- Current task authority lives in `docs/tasks/current.md`, `docs/status/project-state.md` and `docs/specs/incremental-ui-optimization.md`. The original prompt and branch details below remain historical and must not be executed as current instructions.

## Completion Update (2026-07-12)

The migration and screenshot acceptance described below are complete. At the 2026-07-12 acceptance checkpoint they still lived in an uncommitted worktree; the user later authorized local batch commits and, separately on 2026-07-15, a Git push of the development branch. The `Pre-execution Migration Gaps` section and `Prompt for the New AI Session` are retained as the pre-execution baseline and no longer describe outstanding work. Use `docs/tasks/current.md`, `git log`, and `git status` for current commit state.

- Active Windows source, preview, WSL fallback, external launcher, repo audit, hooks, and docs now use the intended path boundaries. Ordinary npm development commands use Node or PowerShell and were proven under a forced `cmd.exe` npm script shell; Git Bash remains optional only for guarded legacy wrappers.
- External and tracked launchers expose strict audit data and fail closed on source/preview/CLI-port mismatches. The initial schema-v2 acceptance bound one DevTools process tree; submission review upgraded this to schema v3 with a 128-bit AppService runtime token written after exact `auto --project`, so warm reuse also proves runtime continuity. Current warm reuse measured `12.598s`, the historical first cold start was about `43.4s`, and the final standalone Tool+App probe was `199ms`.
- Local `miniprogram-automator` is pinned to `0.12.1`. At the 2026-07-12 migration checkpoint, enhanced screenshot smoke succeeded for `launch`, `scheduleRunning`, and `home` from `D:\projects(WIN)\badminton-miniapp`; that historical schema-v3/focus-bound record took `60.521s`. Each case proves a visible fixture transition plus two stable restored frames; promotion is transactional across the requested set, the exact session window must be restored from/to minimized `showCmd=2` with the current user foreground restored before success, fake fixture sync errors must remain zero, and only smoke/full sets update the canonical record. The current-branch `58.369s` evidence is recorded in the supersession section above.
- Representative images were inspected manually. `scheduleRunning` shows pending `VS` and completed `21:17` centered between both sides without overlap or clipping. No visible UI or business behavior was changed.
- Initial migration acceptance passed `npm run verify:light` (74 total, 68 passed, 6 skipped) and forced-`cmd.exe` `npm run verify:full` (1157 total, 1151 passed, 6 skipped). Submission review then passed `npm run verify:windows-env`, updated `verify:light` (80 total, 74 passed, 6 skipped), full `npm test` (1163 total, 1157 passed, 6 skipped), `npm run verify:full`, and `git diff --check`, all with 0 failures.
- At that acceptance checkpoint, all pre-existing uncommitted work was preserved and no commit, push, mini-program upload/preview upload, release, cloud-function deployment, or real cloud-data write was performed. This is historical execution evidence, not a claim about later authorized local commits.

## Goal

Make Windows the fast, reliable default environment for daily development, validation, WeChat DevTools automation, and real UI screenshots after the project directories were renamed. Keep WSL as an explicit fallback only. Do not change mini-program business behavior or visible UI as part of this tooling task.

## Confirmed Repository State at Migration Start (Historical Snapshot)

- Canonical Windows source: `D:\projects(WIN)\badminton-miniapp`
- Windows preview/upload mirror: `D:\projects(WIN)\badminton-miniapp-preview`
- WSL source: `/home/lizixuan/projects(WSL)/badminton-miniapp`
- Obsolete path: `D:\projects\badminton-miniapp`; on 2026-07-12 it only contained `.git`, `.codex`, and `.agents`, with no project source.
- Branch: `feature/core-flow-simplification`
- Windows HEAD and tracked remote at migration start: `43a06ee98c099419c5abdbc447d45c096723d439`
- `master` and `origin/master`: `5813ffc79f94c180fa5573eb25fb0d57f53b85df`
- WSL checkout was clean but stale at `f5ba9ec`; do not copy it over the newer Windows repository. Fetch before comparing.
- The Windows worktree was intentionally dirty at migration start and contained uncommitted workflow-record changes for mini-program CI, cloud deploy, and screenshots. Those changes had to be preserved without reset, clean, checkout, or overwrite; current commit state belongs in `docs/tasks/current.md` and Git.

At this historical snapshot, the product work was the `core-flow-simplification` UI follow-up: points 1 and 2 were accepted, point 3 was technically implemented, and point 4 was blocked. The user superseded that direction on 2026-07-13 as recorded above; do not treat those old point statuses as current work.

## Existing Background and Sources of Truth

- Architecture and business rules: `docs/context/architecture.md`
- Current product progress and confirmed online-version state: `docs/tasks/current.md`
- Previous Windows setup: `docs/tools/windows-dev-environment.md`
- Screenshot cases and failure classification: `docs/tools/weapp-ui-screenshot-workflow.md`
- Durable operational evidence: `docs/records/*.jsonl` and `docs/records/*-latest.json`
- Project constraints and commands: `AGENTS.md`

Successful uploads, cloud function deploys, and full requested screenshot runs now write machine-readable records. Keep that mechanism intact. No upload, preview upload, release, cloud deploy, or real cloud-data write is authorized by this handoff.

## Pre-execution Migration Gaps (Resolved on 2026-07-12)

The following ten items are retained as the audited pre-execution baseline. They were addressed by the completion update above and are not current gaps.

1. `D:\weapp-mcp-launcher\weapp-main-dev.ps1` still opens `D:\projects\badminton-miniapp`.
2. `D:\weapp-mcp-launcher\weapp-mcp.cmd` still opens `D:\projects\badminton-miniapp-preview`.
3. `scripts/dev/check-windows-env.js` expects both old Windows paths. It currently reports warnings but still exits successfully, so it does not fail closed on a broken launcher/project pairing.
4. `scripts/dev/start-weapp-preview.ps1`, `scripts/deploy-preview.ps1`, `.env.local.example`, `scripts/mp-ci.js`, docs, and path-contract tests contain old preview defaults.
5. `.codex/config.toml`, `scripts/dev/weapp-dev.sh`, and `scripts/dev/weapp-sync-preview.sh` contain the old WSL source path. The old preview manifest also records old source and destination paths and is stale from 2026-06-28.
6. npm still relies on global `script-shell=D:\Soft\Git\bin\bash.exe`, and daily checks plus deployment/hook tooling call `.sh` scripts. Bare `bash` may resolve to WSL and lose Windows Node/PATH behavior.
7. The new directory names contain parentheses. Every process invocation and path conversion must be tested with spaces/parentheses-safe argument arrays and literal paths; string-built shell commands are not acceptable.
8. Screenshot scripts exist and protect the last good PNG, but the launcher is currently pointed at the obsolete project. The `39420` port and `App.captureScreenshot` surface need a fresh end-to-end validation after migration.
9. `miniprogram-automator` should be available without repeated transient downloads. Review whether it should be pinned as a local dev dependency and make startup diagnostics actionable.
10. External launcher files under `D:\weapp-mcp-launcher` are outside Git. If changed, document their final content/config and ensure the repo can audit them without exposing secrets.

## Recommended Implementation Shape

- Introduce one path resolver/config layer. Derive the source root from the running script or `git rev-parse --show-toplevel`; use environment overrides for preview dir, launcher, CLI, and endpoint. Avoid another set of machine-specific literals spread across scripts.
- Prefer cross-platform Node for file copying, checks, Git inspection, JSON, process orchestration, and record writing. Use PowerShell only for Windows integration such as DevTools process/CLI management. Keep legacy WSL `.sh` entrypoints only behind explicit `WEAPP_CODEX_DEV_MODE=wsl-mirror` or compatibility wrappers.
- Migrate daily commands first: environment audit, deprecated API check, cloud-common sync/check, hooks, launcher/preflight, screenshot smoke/diagnose. Treat upload and cloud deploy wrappers as a separate guarded phase and test only dry-run/static paths unless the user explicitly authorizes remote actions.
- Remove reliance on npm global `script-shell` for normal local verification. npm commands should invoke `node` or `powershell.exe -File` explicitly. Git Bash can remain an optional compatibility dependency for legacy scripts.
- Make `verify:windows-env` verify the actual repo root, launcher target, preview target, CLI availability, endpoint configuration, hook paths, required packages, and safe private config keys. A launcher pointing at a missing/obsolete project should be a failure, not a warning.
- Add tests that run from a temporary path containing spaces and parentheses. Cover Node `spawnSync/execFileSync`, PowerShell `-LiteralPath`, Git Bash conversion where retained, npm commands, and generated hook scripts.
- Preserve the split between source development and preview/upload mirror. Daily DevTools and screenshots open the canonical source; preview/upload uses the mirror only when explicitly invoked.
- Keep secrets local and redacted. Never print `.env.local`, `.mcp.json` secret values, private key contents, AppSecret, tokens, or CloudBase credentials.

## Screenshot Acceptance

After the launcher and paths are fixed, prove the visual loop is usable from the canonical Windows source:

1. Start/reuse DevTools through the Windows launcher and verify a real WebSocket `Tool.getInfo` response on `ws://127.0.0.1:39420`, not just an open TCP port.
2. Run `npm run ui:screenshot -- --list` and a fast smoke command covering at least `launch`, `scheduleRunning`, and `home`.
3. Verify every PNG exists, is nonblank, has plausible dimensions/byte size, and was rendered from the canonical source project. Preserve the previous good file if a diagnostic capture fails.
4. Run `npm run screenshot:diagnose -- scheduleRunning` if the screenshot surface times out. Distinguish launcher/project errors, WebSocket errors, route/selector errors, blank images, and `App.captureScreenshot` surface errors.
5. Inspect representative images visually. Confirm there is no overlap/clipping and that `scheduleRunning` still shows `VS` for pending matches and centered `21:17` for completed matches. Do not fix UI without separate user approval.
6. Measure cold start, warm reuse, and per-case duration. Avoid restarting DevTools for every case; reconnect per case only when needed for stability. Add a short `screenshot:smoke` command suitable for every UI iteration.
7. Confirm a successful requested run writes `docs/records/ui-screenshot.jsonl` and `ui-screenshot-latest.json`; failed/partial runs must not claim success.

## Required Verification and Exit Criteria

- Run focused tests while iterating, then `npm run verify:windows-env`, `npm run verify:light`, and finally `npm run verify:full` when the migration is complete.
- Run `git diff --check` and review the complete diff, including pre-existing changes.
- Search tracked and relevant local config for obsolete paths. Historical archive/session records may retain old paths when clearly labeled historical; active scripts, launchers, examples, agent instructions, and current docs may not.
- Demonstrate that ordinary Windows development no longer needs WSL or a globally configured npm Git Bash shell.
- Demonstrate that WSL fallback remains explicit and does not overwrite the Windows source or preview mirror.
- Update `AGENTS.md`, `docs/tasks/current.md`, both tool workflow docs, `.github/copilot-instructions.md`, and tests to match the final behavior.
- Do not commit or push unless the user explicitly asks. Do not upload, preview upload, release, or deploy cloud functions.

## Original Prompt for the New AI Session (Executed on 2026-07-12)

The original execution prompt is retained below for audit history; it is not an outstanding next-session task.

```text
你现在要在 D:\projects(WIN)\badminton-miniapp 中执行一次“Windows 原生开发工具链迁移与截图闭环验收”。不要只给计划，要持续完成盘点、实现、故障注入、测试、复审和修正，直到验收项完成；但不要 commit/push，也不要上传小程序、执行 preview upload、发布、部署云函数或写真实云数据。

开始前必须完整阅读：
1. AGENTS.md
2. docs/archive/2026/handoffs/windows-native-toolchain-migration-handoff.md
3. docs/tasks/current.md
4. docs/context/architecture.md
5. docs/tools/windows-dev-environment.md
6. docs/tools/weapp-ui-screenshot-workflow.md

先核对 git status 和真实路径。Windows 权威源码是 D:\projects(WIN)\badminton-miniapp，preview/upload 镜像是 D:\projects(WIN)\badminton-miniapp-preview，WSL 仓库是 /home/lizixuan/projects(WSL)/badminton-miniapp。D:\projects\badminton-miniapp 是不含业务源码的空壳，禁止使用。当前 Windows 分支 feature/core-flow-simplification / 43a06ee，工作区已有未提交改动，尤其包括 workflow-records 相关实现；这些都属于既有工作，必须保留，严禁 reset、clean、checkout 覆盖或用 WSL 旧副本回灌。

目标是让日常开发、检查、Codex hooks、微信开发者工具启动和真实 UI 截图以 Windows 原生链路为默认，并让 WSL 只作为显式 fallback。先做全量路径与 shell 依赖清单，再按 handoff 中的 Recommended Implementation Shape 执行。优先用 Node 做跨平台文件/检查/进程编排，用 PowerShell 处理 Windows DevTools；逐步消除普通 npm 开发命令对全局 Git Bash script-shell 和裸 bash 的依赖。不要只机械替换路径，新目录含 (WIN) / (WSL) 括号，必须加入带空格和括号路径的参数转义测试。

需要同时检查并修正仓库外的 D:\weapp-mcp-launcher\weapp-main-dev.ps1 和 weapp-mcp.cmd，但改动前先读取现状，保留 39420 自动化端口与 source/preview 边界。路径应尽量由 repo root、环境变量或单一配置解析，避免再次散落硬编码。verify:windows-env 必须能够发现 launcher 指向错误项目，不能只 warning 后成功。

截图链路必须做真实验收：从 Windows 权威源码启动/复用 DevTools，验证 ws://127.0.0.1:39420 的 Tool.getInfo，运行截图 case 列表以及 launch、scheduleRunning、home 的快速 smoke；检查 PNG 非空、尺寸/字节合理并人工查看代表图。scheduleRunning 要确认待录分 VS、完赛 21:17 居中且无重叠。截图失败先用 screenshot:diagnose 分型并保护上一张好图，不允许用 DOM 正常代替真实视觉验收。优化冷启动、热复用和单 case 时长，并提供适合频繁 UI 迭代的一条短命令。成功记录必须由脚本写入 docs/records，失败不能记成功。

这是工具链任务，不得顺手修改用户可见 UI、文案、CTA、导航或业务逻辑；如截图发现视觉问题，只报告并等待用户批准。迭代时跑聚焦测试，最后跑 verify:windows-env、verify:light、verify:full、git diff --check，并审查所有 diff。更新当前文档和 agent instructions，清楚区分当前路径、历史路径和显式 WSL fallback。最终用中文汇报：改了什么、Windows 开发/截图耗时与结果、测试结果、未执行的远程操作、残余风险和仍需用户决定的事项。
```
