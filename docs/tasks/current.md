# Current Task

> AI session handoff. Keep this file concise; detailed evidence belongs in session logs.

## Status: next_gen_resumed_in_new_blank_task_frontend_design_first

## Next-Gen Resume Pointer (2026-07-24)

- 用户已恢复“下一代羽毛球小程序全面升级计划”，并要求先使用 Anthropic 官方 `frontend-design` skill 全面重做此前被判退的 UI，再继续剩余路线图。
- 本文件以下旧 preview/并行路线图内容仍是 `codex/ui-optimization-v2` 的历史基线；next-gen 当前权威文档位于 `D:\projects(WIN)\badminton-miniapp-worktrees\nextgen-integration\docs\next-gen`。
- 新任务必须先读 `RESUME-HANDOFF-2026-07-24.md`、`FRONTEND-DESIGN-SKILL.md`、`PAUSE-HANDOFF-2026-07-20.md`、`DECISIONS.md` 与 `INTEGRATION-BOARD.md`，不得把本主工作区当作下一代实现工作树。
- 当前任务只负责 skill 安装、文档同步和创建全新非 fork 任务；UI 实现由该新任务在隔离 worktree 中承接。

## Version and Release Boundary

- 当前线上正式版：`master` = `origin/master` = `5813ffc`。
- 稳定开发基线：`codex/ui-optimization-v2@3220d0c` = `origin/codex/ui-optimization-v2@3220d0c`；Git push 与本地 preview 均不等于线上版本。
- next-gen 中央集成树：`D:\projects(WIN)\badminton-miniapp-worktrees\nextgen-integration` / `codex/next-gen-badminton@17f444f`（加本轮文档更新）。
- 所有 next-gen 代码和已推送开发分支均尚未进入小程序正式发布；禁止新的 preview upload、upload、云部署或真实数据写入。

## Active Work State

- NG-001、NG-002、NG-013 已集成；旧 Home/UI 与 typography 草稿被判退或未验收，只作反例。
- NG-007 草稿曾获 review GO，但最新 `verify:full` 被暂停中断，未提交、未集成；待 UI 阶段完成后恢复审计。
- 2026-07-20 暂停事实见 `PAUSE-HANDOFF-2026-07-20.md`；2026-07-24 恢复决定 D-012 是当前最新授权。

## Execution Contract

- 新空白任务加载 `$frontend-design` 与 `weapp-regression-guard`，从中央事实建立新隔离 worktree；不 fork 当前任务，不续写旧 dirty UI worktree。
- 用户已批准本次全面视觉重做；CTA、导航、权限、业务流程和云行为仍需单独批准。
- 禁止 push、PR、preview/upload、正式发布、云函数部署、真实数据写入和不可恢复删除，除非用户另行明确授权。
- Windows 工具链、历史并行路线图与产品边界继续查阅本目录已有专项文档，不在本文件重复展开。
