# Current Task

> AI session handoff file. Keep it short enough for the next session to continue without re-investigation.

## Status: windows_main_dev_ready_for_review

## Active Task (2026-07-03)

“core-flow-simplification 后续修复”正在按单 UI 点验收推进。

- 分支：`feature/core-flow-simplification`
- 当前阶段：UI 点 1、2 已确认通过；UI 点 3 对阵卡小屏布局已实现、测试通过，Windows 有效实图已确认比分在中间
- 计划：`docs/tasks/core-flow-simplification-ui-fix-plan.md`
- 日志：`docs/tasks/session-logs/20260622-core-flow-simplification-ui-fix.md`
- 约束：本次按用户要求提交并推送；不部署、不上传；保留 `create` / `analytics` 旧路由兼容；不安装 `.git/hooks/post-commit`

UI 点 3 结果：移除四栏硬挤和 132rpx 右侧栏，改为顶部场次/状态、下方双方对阵；已完赛比分放在双方中间，待录分仍显示 `VS`。点击整卡、头像筛选、比分语义和筛选逻辑不变。Windows 主项目 `D:\projects\badminton-miniapp` 下的 `tmp\ui-screenshots-actual\scheduleRunning.png` 已确认非空白，`21:17` 位于双方中间；是否进入 UI 点 4 仍等用户最终确认。

Windows 迁移结果：日常开发项目为 `D:\projects\badminton-miniapp`，主 launcher 为 `D:\weapp-mcp-launcher\weapp-main-dev.cmd`，自动化端口 `ws://127.0.0.1:39420`。旧 `D:\weapp-mcp-launcher\weapp-mcp.cmd` + `D:\projects\badminton-miniapp-preview` 仅保留给 preview/upload 镜像用途。Codex hooks 已改为 Windows 主项目 preflight，不再触发 WSL mirror sync。

调度测试稳定性：squad fairness 增加仅测试使用的 deterministic search 选项，生产默认路径仍走原 wall-clock soft/hard budget，公平性断言未放宽。后续重跑 DevTools `App.captureScreenshot` 出现超时，但端口、页栈和 DOM 正常，作为 DevTools surface 运维问题单独排查，不阻塞迁移提交。

## Previous Task

增长飞轮 Phase 1 已完成并推送；Phase 2 等待线上数据后再排期。详见 `docs/tasks/session-logs/2026-06-15-growth-flywheel-phase1.md` 和 `docs/specs/growth-flywheel-optimization.md`。
