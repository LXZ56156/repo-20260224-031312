# Current Task

> AI session handoff file. Keep it short enough for the next session to continue without re-investigation.

## Status: migration_checkpoint_before_windows_handoff

## Active Task (2026-06-22)

“core-flow-simplification 后续修复”正在按单 UI 点验收推进。

- 分支：`feature/core-flow-simplification`
- 当前阶段：UI 点 1、2 已确认通过；UI 点 3 对阵卡小屏布局已实现并通过本地测试，视觉确认迁到 Windows 端继续
- 计划：`docs/tasks/core-flow-simplification-ui-fix-plan.md`
- 日志：`docs/tasks/session-logs/20260622-core-flow-simplification-ui-fix.md`
- 约束：本次按用户要求提交并推送；不部署、不上传；保留 `create` / `analytics` 旧路由兼容

UI 点 3 结果：移除四栏硬挤和 132rpx 右侧栏，改为顶部场次/状态、下方双方对阵；已完赛比分放在双方中间，待录分仍显示 `VS`。点击整卡、头像筛选、比分语义和筛选逻辑不变。WSL 侧自动截图刷新失败；Windows 侧 `D:\weapp-mcp-launcher` 已验证 `ws://127.0.0.1:39420` 可稳定连续截图，后续真实 UI 验收迁到 Windows。

迁移前验证：UI 点 1-3 相关代码已通过 focused tests、全量 `node --test tests/*.test.js`、`npm run check`、`npm run lint`、`git diff --check`。提交后下一步从 UI 点 3 的 Windows 实图确认开始，确认后再进入 UI 点 4（Ranking result/ad）。

## Previous Task

增长飞轮 Phase 1 已完成并推送；Phase 2 等待线上数据后再排期。详见 `docs/tasks/session-logs/2026-06-15-growth-flywheel-phase1.md` 和 `docs/specs/growth-flywheel-optimization.md`。
