# Windows Main Development Environment

> Windows is the primary local development environment for this mini program. Keep this file focused on local tooling, private config, and repeatable agent workflows.

## Canonical Paths

- Main source project: `D:\projects\badminton-miniapp`
- DevTools main launcher: `D:\weapp-mcp-launcher\weapp-main-dev.cmd`
- DevTools CLI: `D:\Soft\微信web开发者工具\cli.bat`
- Automation endpoint: `ws://127.0.0.1:39420`
- Legacy preview/upload launcher: `D:\weapp-mcp-launcher\weapp-mcp.cmd`
- Legacy preview/upload mirror: `D:\projects\badminton-miniapp-preview`

Daily development, Codex hooks, and UI screenshots should use the main source project. The legacy mirror is retained only for preview/upload workflows.

## Required Local Tooling

```powershell
git --version
node -v
npm -v
where git
where node
where npm
where bash
git config --global --get core.autocrlf
git config --global --get core.longpaths
npm config get script-shell
```

Expected Windows settings:

- `core.autocrlf=false`
- `core.longpaths=true`
- `npm config get script-shell` points to `D:\Soft\Git\bin\bash.exe`

PowerShell's bare `bash` may resolve to WSL. For manual project shell scripts, prefer the absolute Git Bash path:

```powershell
& "D:\Soft\Git\bin\bash.exe" scripts/check-cloud-common.sh
```

## Private Local Files

These files are local-only and must not be printed with secret values:

- `.env.local`
- `.mcp.json`
- `.claude/settings.local.json`
- `project.private.config.json`
- `.vscode/settings.json`

`.env.local` should contain these keys:

- `WX_APPID`
- `WX_APPSECRET`
- `WX_PRIVATE_KEY_PATH`
- `MP_ROBOT`

Only print key names with `<redacted>` values. `WX_PRIVATE_KEY_PATH` should point to an existing file outside committed source.

`.mcp.json` should contain these MCP servers:

- `context7`
- `playwright`
- `cloudbase`
- `weapp_dev`

`weapp_dev.env.WEAPP_WS_ENDPOINT` should be `ws://127.0.0.1:39420`.

## Codex Hooks

Codex hooks are tracked under `.codex/` and now target the Windows main project:

- `.codex/hooks/windows_weapp_preflight.ps1`
- `.codex/hooks/windows_weapp_stop.ps1`

The preflight hook is keyword-gated. Empty prompts and unrelated prompts must not open WeChat DevTools. It only checks or starts DevTools for prompts related to WeChat, mini program, DevTools, screenshots, or UI work.

Useful manual checks:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\projects\badminton-miniapp\.codex\hooks\windows_weapp_preflight.ps1
"微信截图" | powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\projects\badminton-miniapp\.codex\hooks\windows_weapp_preflight.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\projects\badminton-miniapp\.codex\hooks\windows_weapp_stop.ps1
Test-NetConnection 127.0.0.1 -Port 39420
```

Environment switches:

- `WEAPP_PREFLIGHT_FORCE=1` forces the preflight.
- `WEAPP_PREFLIGHT_PORT` overrides the default `39420`.
- `WEAPP_PREFLIGHT_LAUNCHER` overrides `D:\weapp-mcp-launcher\weapp-main-dev.cmd`.

## Git Post-Commit Cloud Hook

The optional local hook is installed into `.git/hooks/post-commit` on this Windows machine. It checks cloud function changes after commit and skips when no cloud function changed.

Use the skip guard for manual verification:

```powershell
$env:SKIP_CLOUD_POST_COMMIT_DEPLOY="1"
& "D:\Soft\Git\bin\bash.exe" .git/hooks/post-commit
Remove-Item Env:\SKIP_CLOUD_POST_COMMIT_DEPLOY
```

Expected output includes:

```text
Skipping post-commit cloud function deployment because SKIP_CLOUD_POST_COMMIT_DEPLOY=1.
```

Do not use the hook as a deployment test. Do not deploy cloud functions unless the user explicitly requests it.

## Verification Shortcuts

```powershell
npm run verify:windows-env
npm run verify:light
npm run verify:full
```

Screenshot workflow:

```powershell
cd D:\weapp-mcp-launcher
.\weapp-main-dev.cmd
Test-NetConnection 127.0.0.1 -Port 39420

cd D:\projects\badminton-miniapp
$env:WEAPP_WS_ENDPOINT="ws://127.0.0.1:39420"
$env:WEAPP_SCREENSHOT_DIR="tmp\ui-screenshots-actual"
$env:WEAPP_SCREENSHOT_TIMEOUT_MS="60000"
npm run screenshot:schedule
npm run screenshot:diagnose -- scheduleRunning
```

The diagnostic command writes a separate diagnostic PNG first and only promotes it over the normal screenshot when the image is a valid non-blank PNG.

## Boundaries

- Do not upload the mini program.
- Do not run preview upload.
- Do not deploy cloud functions.
- Do not print secrets from `.env.local`, `.mcp.json`, or private keys.
- Do not use `D:\projects\badminton-miniapp-preview` for daily development or screenshot acceptance.
