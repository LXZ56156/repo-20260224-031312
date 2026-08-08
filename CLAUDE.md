# CLAUDE.md

本仓库的 Agent 权威规则统一维护在 `AGENTS.md`。Claude Code 会话必须先完整读取并遵守它；不要在本文维护第二套页面数、云函数数、命令、端口、分支或发布状态。

## Session Entry

依次读取：

1. `AGENTS.md`
2. `docs/tasks/current.md`
3. `docs/tasks/incremental-ui-restart-handoff-2026-07-29.md`
4. `docs/tasks/incremental-ui-optimization-plan.md`

再按任务读取 `docs/specs/`、`docs/context/architecture.md`、`docs/tools/` 和 `docs/notes/learnings.md`。文档分层与生命周期规则见 `docs/notes/learnings.md`。

## Non-Negotiable Boundaries

- 当前工作必须使用 `docs/tasks/current.md` 指定的隔离 worktree；不得在 canonical 工作区切分支或覆盖用户 dirty 内容。
- 用户可见 UI/文案/CTA/导航/流程先审批；浏览器稿不能替代当前源码微信 DevTools 实图。
- commit、push、PR、preview QR、preview、upload、正式发布、云部署和真实数据写入分别授权。
- Windows 不调用裸 `bash`；命令以当前 `package.json` 和 `docs/tools/windows-dev-environment.md` 为准。
- 独立打水没有用户可见结束选项；Next-Gen/C3/Home 全面重做仍暂停。

使用当前宿主提供且与任务匹配的 skills；不要沿用旧的静态 skill whitelist。
