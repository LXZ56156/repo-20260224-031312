# Windows Main Development Environment

> Windows is the primary local development environment. The tooling was migrated on 2026-07-12 and revalidated on the master-based `codex/ui-optimization-v2` branch on 2026-07-14.

## Canonical Paths

- Main source project: `D:\projects(WIN)\badminton-miniapp`
- Preview/upload mirror: `D:\projects(WIN)\badminton-miniapp-preview`
- Explicit WSL fallback: `/home/lizixuan/projects(WSL)/badminton-miniapp`
- DevTools main launcher: `D:\weapp-mcp-launcher\weapp-main-dev.cmd`
- DevTools preview launcher: `D:\weapp-mcp-launcher\weapp-mcp.cmd`
- DevTools CLI: `D:\Soft\微信web开发者工具\cli.bat`
- Automation endpoint: `ws://127.0.0.1:39420`

`D:\projects\badminton-miniapp` is a metadata-only shell and must never be used as source. Daily development, checks, hooks, DevTools, and screenshots use the canonical source project. The preview mirror is used only by an explicitly requested preview/upload flow.

## Single Local Configuration Layer

Repository scripts resolve paths through `scripts/lib/weapp-local-config.js`:

- source comes from the running repository root;
- preview defaults to the sibling `badminton-miniapp-preview` directory;
- launcher, CLI, endpoint, Git Bash compatibility path, and WSL paths have environment overrides;
- path comparison is case-insensitive on Windows and preserves spaces/parentheses as argument values.

Supported overrides:

- `WEAPP_PREVIEW_DIR`
- `WEAPP_MAIN_LAUNCHER` / `WEAPP_MAIN_LAUNCHER_SCRIPT`
- `WEAPP_PREVIEW_LAUNCHER` / `WEAPP_PREVIEW_LAUNCHER_SCRIPT`
- `WEAPP_DEVTOOLS_CLI`
- `WEAPP_WS_ENDPOINT`
- `WEAPP_GIT_BASH`
- `WEAPP_WSL_SOURCE_DIR` / `WEAPP_WSL_PREVIEW_DIR`

## Windows-Native Commands

```powershell
npm test
npm run check
npm run lint
npm run verify:windows-env
npm run verify:light
npm run verify:full
npm run sync:cloud-common
npm run check:cloud-common
```

These ordinary workflows use Node or PowerShell directly. They do not require a global npm `script-shell`, WSL, or bare `bash`. A configured Git Bash remains optional and is used only by `scripts/run-bash-script.js` for guarded deploy/hook commands and explicit compatibility work.

The test runner keeps test files at `--test-concurrency=1`. Squad fairness quality regressions use a test-only operation clock (`0.002ms` per deadline read), so identical inputs receive an identical search-operation budget even under transient desktop load. `tests/squad.beam.performance.test.js` remains on the real clock for runtime limits; every fairness assertion and the production algorithm/default deadlines remain unchanged.

## DevTools Launcher Contract

External files under `D:\weapp-mcp-launcher` are thin wrappers:

- `weapp-main-dev.cmd` forwards to `weapp-main-dev.ps1` with `%*`;
- `weapp-main-dev.ps1` resolves `WEAPP_SOURCE_DIR` or defaults to the canonical Windows source, then calls tracked `scripts/dev/start-weapp-main.ps1`;
- `weapp-mcp.cmd` forwards to `weapp-mcp.ps1`;
- `weapp-mcp.ps1` calls tracked `scripts/dev/start-weapp-preview.ps1` and preserves the source/preview boundary.

Both PowerShell wrappers support side-effect-free `-Audit` JSON. `npm run verify:windows-env` invokes the `.ps1` files directly with argument arrays and fails closed if role, source, project, CLI, endpoint, schema, exit status, or JSON output is wrong. It also rejects a directory that exists but lacks the required mini-program layout.

The main launcher:

1. reuses a healthy source session only when a schema-v3 record still matches the main process PID/CreationDate, exact CLI `39421` owner, automation `39420` owner, project/role, freshness, and a 128-bit non-enumerable AppService runtime binding written immediately after the last exact `auto --project`;
2. otherwise requires the exact expected CLI port, quits only the uniquely proven DevTools process tree, waits for exit, then opens the canonical project on CLI port `39421`;
3. enables automation on `39420` with one exact `auto --project`, refuses ambiguous/mismatched listener ownership, and waits up to 75 seconds for the same AppService instead of rebinding during a slow cold compile;
4. restores the DevTools window without stealing focus for ordinary launcher/hook use;
5. reports ready only after the runtime binding, `Tool.getInfo`, and `App.getCurrentPage` all match; binding loss after compile/reload/project switching fails closed and falls back to an exact cold rebind.

Verified on 2026-07-12:

- historical first schema-v2 cold source start after port-aware recovery: about `43.4s`;
- current schema-v3 PID/port/runtime-bound warm source reuse: `12.598s` end-to-end;
- standalone Tool + App probe: `199ms` in the final review.

Revalidated on 2026-07-14 after a real login-expiry recovery:

- schema-v3 cold source start completed in `65.524s`; `Tool.getInfo` returned DevTools `2.01.2510290` / SDK `3.14.2`, and `App.getCurrentPage` returned `pages/home/index`;
- an empty process list after CLI quit is accepted as successful target-tree exit;
- a slow AppService cold compile keeps one automation context instead of issuing a premature second `auto`.

Manual commands:

```powershell
& 'D:\weapp-mcp-launcher\weapp-main-dev.cmd'
npm run weapp:probe
& 'D:\weapp-mcp-launcher\weapp-main-dev.ps1' -Audit
& 'D:\weapp-mcp-launcher\weapp-mcp.ps1' -Audit
```

## Private Local Files

Never print values from:

- `.env.local`
- `.mcp.json`
- `.claude/settings.local.json`
- `project.private.config.json`
- `.vscode/settings.json`

`verify:windows-env` prints only required key names and redacted existence results. `.mcp.json` is checked for `context7`, `playwright`, `cloudbase`, `weapp_dev`, and the exact endpoint without printing other values.

## Codex and Claude Hooks

Tracked Codex hooks remain cross-platform Node wrappers:

- `.codex/hooks/weapp_preflight.js`
- `.codex/hooks/weapp_stop.js`

On Windows, related prompts call `.codex/hooks/windows_weapp_preflight.ps1`, which delegates to the audited main launcher and then probes `Tool.getInfo`. Empty or unrelated prompts remain a no-op. Stop does not close DevTools or sync a mirror.

Claude hooks use `scripts/dev/weapp-hook-ensure.js` and `scripts/dev/weapp-post-edit.js`; they no longer run bare shell commands on Windows. On non-Windows systems the mirror path remains disabled unless `WEAPP_CODEX_DEV_MODE=wsl-mirror` is explicitly set.

## Windows / WSL Handoff

Git is the source handoff mechanism. Never copy the WSL checkout over Windows or use the preview mirror as a source sync channel.

Windows to WSL:

```powershell
Set-Location -LiteralPath 'D:\projects(WIN)\badminton-miniapp'
npm run verify:light
git status --short --branch
# push only when explicitly requested
```

```bash
cd '/home/lizixuan/projects(WSL)/badminton-miniapp'
git fetch origin
git checkout codex/ui-optimization-v2
git pull --ff-only
npm install
npm run verify:light
```

WSL to Windows uses the same Git flow in reverse. WSL mirror automation requires:

```bash
WEAPP_CODEX_DEV_MODE=wsl-mirror node .codex/hooks/weapp_preflight.js
```

The preview manifest currently records the renamed WSL/preview paths but is explicitly marked stale because its content signature predates the move. Run an explicitly authorized mirror sync before any preview/upload use; the stale manifest is not success evidence. Even after a valid sync, `mp-ci` recomputes the same SHA1 tree contract for both the preview and the authoritative repo source; either side drifting from the manifest blocks preview/upload before `miniprogram-ci` is loaded.

## Screenshot and Workflow Records

```powershell
npm run ui:screenshot -- --list
npm run screenshot:smoke
npm run screenshot:diagnose -- scheduleRunning
npm run records:latest
```

`screenshot:smoke` captures `launch`, `scheduleRunning`, and `home` with one control connection per case. The script binds the schema-v3 session to the titled DevTools top-level window rather than trusting the unstable `.NET MainWindowHandle`, temporarily maximizes it for the whole run, then verifies that the original handle still belongs to the same PID and restores the original state and exact current user foreground before promotion; do not manually minimize mid-capture. Each case captures a visible fixture probe plus two restored frames. PNG dimensions/bytes, selector-correlated visual regions, a nonzero probe transition, stable restored frames, zero fake-fixture sync errors, and verified window restoration must all pass. Promotion is transactional across the requested set, so a late failure replaces no prior output. A failed, partial, blank, stale, or non-restored run writes no success record.

Successful workflows write under `docs/records/`:

- mini-program CI: `miniapp-ci.jsonl` / `miniapp-ci-latest.json`;
- cloud deployment: `cloudfunctions-deploy.jsonl` / latest;
- requested screenshot sets: `ui-screenshot.jsonl` / `ui-screenshot-latest.json`.

The 2026-07-12 record belongs to the retired product branch. The current `codex/ui-optimization-v2` smoke was accepted on 2026-07-14: three coherent three-frame captures, zero deprecated-file warnings and fake-fixture sync errors, exact restoration from/to minimized `showCmd=2`, restored foreground focus, and total script time `58.369s` (including `10.473s` preparation and `5.280s` restoration). The canonical latest record now names the current branch and authoritative source path.

## Post-Commit Hook and Boundaries

The optional `.git/hooks/post-commit` is installed but must only be tested through `SKIP_CLOUD_POST_COMMIT_DEPLOY=1`. Guarded deploy/hook npm commands may use Git Bash through the explicit wrapper; they are not part of ordinary verification.

- Do not upload the mini program.
- Do not run preview upload.
- Do not deploy cloud functions.
- Do not write real cloud data.
- Do not print secrets or private-key paths.
