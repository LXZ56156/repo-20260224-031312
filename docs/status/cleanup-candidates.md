# Worktree Cleanup Candidates

> 2026-08-14 最终结果：本页保留迁移前分类依据，不再是待执行清单。实时状态见 `control/worktrees.json`；15 个历史 worktree 已按授权完成可恢复归档和卸载。

## A. 迁移前持续保留组（现已收敛）

- `D:/projects(WIN)/badminton-miniapp`：现为 clean、只读 `METADATA_ROOT`。
- `incremental-ui-score-baseline-20260729`：唯一干净 score-only 产品基线。
- `collaborative-water-v2-20260809`：本地 RC 且有 10 项后续未提交变化。
- `share-activity-collection`：最新运营能力与部署规则证据。
- `local-ops-dashboard`：share activity 的祖先和独立运营工具入口。

## B. 迁移前 dirty 组（现已完成归档）

以下 worktree 当时全部 dirty；现均已保存 bundle、binary patch、untracked archive、manifest 与恢复 clone：

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

备份目录：`D:/projects(WIN)/badminton-miniapp-worktree-backups/2026-08-14`。最终 Git worktree 总数为 3；恢复证据索引见 `control/archives/`。

## 已执行的安全门槛

每个路径必须依次满足：

1. 重新运行 `npm run repo:inventory -- --json`，确认状态未变化。
2. 明确提交是否已进入保留分支；未进入时创建可恢复备份。
3. dirty 文件为零；detached HEAD 已绑定分支或保存 patch。
4. 用户按具体绝对路径批准移除 worktree。
5. worktree 移除后单独决定是否保留、推送、tag 或删除分支；不得把两步合并授权。
