# Badminton Mini Program Agent Instructions

This repository is a native WeChat Mini Program using WXML, WXSS, JavaScript, and WeChat Cloud Development.

## Read First

- `AGENTS.md`
- `docs/tasks/current.md`
- `docs/context/architecture.md`
- `docs/tools/windows-dev-environment.md`
- `docs/tools/weapp-ui-screenshot-workflow.md`

## Local Development

- Primary Windows project: `D:\projects\badminton-miniapp`
- WeChat DevTools launcher: `D:\weapp-mcp-launcher\weapp-main-dev.cmd`
- Automation endpoint: `ws://127.0.0.1:39420`
- Legacy preview/upload mirror: `D:\projects\badminton-miniapp-preview`

Daily development and screenshots use the primary Windows project. The preview mirror is retained only for preview/upload workflows.

## Validation

Use the narrowest validation that matches the change:

```bash
npm run verify:light
npm run verify:full
npm run verify:windows-env
npm run screenshot:diagnose -- scheduleRunning
```

For cloud shared libraries, edit `scripts/*-common.template.js`, run the sync script, then check sync status.

## Boundaries

- Do not upload the mini program.
- Do not deploy cloud functions.
- Do not run preview upload.
- Do not print `.env.local`, private keys, app secrets, MCP secrets, or tokens.
- Do not change user-visible UI, navigation, copy, CTAs, or action semantics without explicit approval.

## Testing Notes

- Tests use `node:test` and `node:assert/strict`.
- Windows npm scripts should run shell scripts through Git Bash, configured as `D:\Soft\Git\bin\bash.exe`.
- `squad.fairness.test.js` uses a test-only deterministic search mode. Do not relax fairness assertions to make platform differences pass.
