# Badminton Mini Program Agent Instructions

This repository is a native WeChat Mini Program using WXML, WXSS, JavaScript, and WeChat Cloud Development.

## Read First

- `AGENTS.md`
- `docs/tasks/current.md`
- `docs/tasks/incremental-ui-optimization-plan.md`
- `docs/tasks/windows-native-toolchain-migration-handoff.md`
- `docs/context/architecture.md`
- `docs/tools/windows-dev-environment.md`
- `docs/tools/weapp-ui-screenshot-workflow.md`

## Local Development

- Primary Windows project: `D:\projects(WIN)\badminton-miniapp`
- WeChat DevTools launcher: `D:\weapp-mcp-launcher\weapp-main-dev.cmd`
- Automation endpoint: `ws://127.0.0.1:39420`
- Preview/upload mirror: `D:\projects(WIN)\badminton-miniapp-preview`
- Explicit WSL fallback: `/home/lizixuan/projects(WSL)/badminton-miniapp`

Daily development and screenshots use the primary Windows project. Never use the metadata-only `D:\projects\badminton-miniapp` directory as source. Preview/upload and WSL mirror flows require explicit authorization/mode selection.

## Validation

```powershell
npm run verify:light
npm run verify:full
npm run verify:windows-env
npm run weapp:probe
npm run screenshot:smoke
npm run screenshot:diagnose -- scheduleRunning
```

For cloud shared libraries, edit `scripts/*-common.template.js`, run `npm run sync:cloud-common`, then `npm run check:cloud-common`.

## Current Product Boundary

`codex/ui-optimization-v2` preserves the `master@5813ffc` product flow. The sole approved visible delta is the schedule card's centered pending `VS` / finished score layout in `pages/schedule/index.wxml` and `index.wxss`. Do not carry over any other UI or flow change from `feature/core-flow-simplification`.

## Boundaries

- Do not upload the mini program, run preview upload, or release without explicit authorization.
- Do not deploy cloud functions or write real cloud data without explicit authorization.
- Do not print `.env.local`, private keys, app secrets, MCP secrets, or tokens.
- Do not change user-visible UI, navigation, copy, CTAs, or action semantics without explicit point-by-point approval.
- Ordinary Windows npm scripts must not rely on global `script-shell` or bare `bash`.
