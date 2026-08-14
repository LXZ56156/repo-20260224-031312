# Worktree Cleanup Candidates

> 2026-08-14 评估与执行结果：没有 worktree 获得“自动清理”资格；用户明确批准的 4 个 clean worktree 已按备份门槛完成移除。

## A. 持续保留

- `D:/projects(WIN)/badminton-miniapp`：当前整理工作区。
- `incremental-ui-score-baseline-20260729`：唯一干净 score-only 产品基线。
- `collaborative-water-v2-20260809`：本地 RC 且有 10 项后续未提交变化。
- `share-activity-collection`：最新运营能力与部署规则证据。
- `local-ops-dashboard`：share activity 的祖先和独立运营工具入口。

## B. 先备份再决定

以下 worktree 全部 dirty，必须先确认归属并选择 commit、patch 或 bundle 级备份：

- 截图诊断：`07af/badminton-miniapp`。
- detached UI 文档收尾：`a6ba/badminton-miniapp`。
- 协作打水上传/反馈隔离树：`mp-upload-e60d827`、`upload-e60d827-feedback-r3-badminton-miniapp`。
- Next-Gen：`nextgen-design-system`、`nextgen-integration`、`nextgen-typography`、`nextgen-ui-redesign-20260724`。
- 独立打水与组件实验：`standalone-water-a-20260806`、`water-court-vant-spike-20260807`、`water-tdesign-spike-20260807`。

## C. clean worktree 已完成清理

以下 worktree 原本 clean，且当前提交只被各自分支包含。用户批准后，已为每个分支创建并验证独立 Git bundle，再移除 worktree；分支没有删除：

- `data-baseline@611207f`
- `scheduler-observability@d48d19d`
- `water-mvp@74cc333`
- `nextgen-game-mode-engine@5f1f674`

备份目录：`D:/projects(WIN)/badminton-miniapp-worktree-backups/2026-08-14`。当前 worktree 总数为 16；所有原有 dirty worktree 均未触碰。

## 执行门槛

每个路径必须依次满足：

1. 重新运行 `npm run repo:inventory -- --json`，确认状态未变化。
2. 明确提交是否已进入保留分支；未进入时创建可恢复备份。
3. dirty 文件为零；detached HEAD 已绑定分支或保存 patch。
4. 用户按具体绝对路径批准移除 worktree。
5. worktree 移除后单独决定是否保留、推送、tag 或删除分支；不得把两步合并授权。
