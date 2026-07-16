# 2026-07-16 并行产品路线图整理

## 用户目标

把后续产品规划拆成可在不同对话独立启动的任务，明确先后依赖、冲突边界、验收门槛和启动提示词，以支持高效并行开发。

## 本次交付

- 新增总路线图 `docs/tasks/parallel-development-roadmap.md`。
- 新增 `docs/tasks/parallel-development/01-07` 七份独立任务文档及启动提示词。
- 更新 `docs/tasks/current.md`，将并行路线设为当前入口并恢复到 50 行以内。
- 更新 `docs/notes/learnings.md`，固化 worktree、文档所有权和用户可见审批约束。

## 基线与边界

- 开发基线：`codex/ui-optimization-v2@743b016`。
- 线上基线：`master@5813ffc`。
- 本次仅修改文档，没有改产品代码、拉取或写入真实数据、创建分支/worktree、提交、推送、preview/upload、发布或部署云函数。

## 验证

- 检查所有路线图链接和任务文件存在。
- 检查 `docs/tasks/current.md` 行数不超过 50。
- 执行 `git diff --check`，确认文档差异无空白错误。
- 并行写文档时曾因 `(WIN)` 路径漏写而产生两个临时错误目录；已逐文件核对并清理，`D:\projects\WIN\badminton-miniapp` 与 `D:\projects\WIN)\badminton-miniapp` 均不存在，正确仓库未受影响。
