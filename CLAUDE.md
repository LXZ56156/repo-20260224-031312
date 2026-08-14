# CLAUDE.md

This repository uses `AGENTS.md` as the single source of stable agent governance. Do not duplicate product status, branch hashes, deployment policy, command lists, architecture counts, or approval rules here.

## Read First

1. `AGENTS.md`
2. `docs/tasks/current.md`
3. `docs/status/project-state.md`

Use `docs/README.md` to route to architecture, specs, runbooks, reports, records, and archived material.

## Claude-Specific Notes

- Verify the working directory before using local MCP configuration.
- The authoritative Windows source is `D:\projects(WIN)\badminton-miniapp`; the preview mirror and WSL checkout are not source-of-truth replacements.
- `weapp_dev` readiness requires real Tool/App protocol responses. Resolve the current endpoint and command support from the active worktree rather than copying a historical port.
- Query current official documentation before changing WeChat APIs or third-party integrations.
- Follow the active host skills and repository skills; historical skill allowlists do not override current instructions.

All safety, testing, user-visible approval, cloud contract, deployment, worktree, style, and commit rules live in `AGENTS.md`.
