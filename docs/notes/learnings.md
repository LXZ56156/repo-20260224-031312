# Learnings & Temporary Rules

> Accumulate discoveries, gotchas, and temporary constraints here.
> Periodically review: promote stable items to CLAUDE.md, delete resolved items.

## Active
<!-- Format: - [date] description. Why it matters. -->
- [2026-05-02] `scripts/*-common.template.js` 是云函数共享库唯一源；修改后先运行 `bash scripts/sync-cloud-common.sh`，再用 `bash scripts/check-cloud-common.sh` 校验，只部署实际受影响的云函数，避免手改 `cloudfunctions/*/lib/*` 造成漂移。

## Resolved / Archived
<!-- Move items here when no longer relevant, with resolution date. -->
