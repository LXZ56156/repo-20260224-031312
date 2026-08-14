# Branch / Worktree 保护台账

> 盘点时间：2026-08-14。下方 20 项表格是整理前保护快照，不是当前删除清单。
> 硬规则：dirty worktree 未备份、未确认归属、未获用户批准前不得删除、移动或 prune。

## 汇总

- 本地分支：36
- origin 远端引用：5
- 整理前 worktree：20，其中 dirty 12，主工作区 clean
- 整理后 worktree：16，其中 dirty 13；新增的 1 个 dirty 是当前文档治理修改
- 本轮只移除 4 个已批准且 clean 的 worktree；36 个本地分支数量未变

## 2026-08-14 已授权清理结果

以下 worktree 已在创建并验证 Git bundle 后移除，分支和原提交仍保留：

| 已移除路径 | 保留分支 | HEAD | 可恢复 bundle |
|---|---|---|---|
| `D:/projects(WIN)/badminton-miniapp-worktrees/data-baseline` | `codex/roadmap-data-baseline` | `611207f` | `D:/projects(WIN)/badminton-miniapp-worktree-backups/2026-08-14/codex-roadmap-data-baseline-611207f.bundle` |
| `D:/projects(WIN)/badminton-miniapp-worktrees/scheduler-observability` | `codex/roadmap-scheduler-observability` | `d48d19d` | `D:/projects(WIN)/badminton-miniapp-worktree-backups/2026-08-14/codex-roadmap-scheduler-observability-d48d19d.bundle` |
| `D:/projects(WIN)/badminton-miniapp-worktrees/water-mvp` | `codex/roadmap-water-mvp` | `74cc333` | `D:/projects(WIN)/badminton-miniapp-worktree-backups/2026-08-14/codex-roadmap-water-mvp-74cc333.bundle` |
| `D:/projects(WIN)/badminton-miniapp-worktrees/nextgen-game-mode-engine` | `codex/nextgen-game-mode-engine` | `5f1f674` | `D:/projects(WIN)/badminton-miniapp-worktree-backups/2026-08-14/codex-nextgen-game-mode-engine-5f1f674.bundle` |

四个 bundle 均已通过 `git bundle verify` 和分支 HEAD 校验。`nextgen-game-mode-engine` 注销后只残留一个 `node_modules` junction；已仅移除该 junction 与空目录，junction 指向的其他 worktree 未被修改。

## 整理前全部 worktree

| # | branch / mode | HEAD | dirty | 路径 | 初步分类 |
|---:|---|---|---:|---|---|
| 1 | `codex/ui-optimization-v2` | `5c2e563` | 0 | `D:/projects(WIN)/badminton-miniapp` | 当前整理工作区，保留 |
| 2 | `codex/weapp-devtools-screenshot-diagnostic-20260806` | `5813ffc` | 7 | `C:/Users/LIZIXUAN/.codex/worktrees/07af/badminton-miniapp` | 截图诊断成果，保护 |
| 3 | detached | `d0435f6` | 11 | `C:/Users/LIZIXUAN/.codex/worktrees/a6ba/badminton-miniapp` | 增量 UI 文档收尾，保护 |
| 4 | `codex/collaborative-water-v2-20260809` | `e60d827` | 10 | `C:/Users/LIZIXUAN/.codex/worktrees/ba45/badminton-miniapp` | 当前重要 RC + 后续修改，最高优先保护 |
| 5 | detached | `e60d827` | 1 | `C:/Users/LIZIXUAN/.codex/worktrees/mp-upload-e60d827` | 上传隔离树，待核验后处理 |
| 6 | detached | `e60d827` | 2 | `C:/Users/LIZIXUAN/.codex/worktrees/upload-e60d827-feedback-r3-badminton-miniapp` | 上传/反馈验收树，保护 |
| 7 | `codex/roadmap-data-baseline` | `611207f` | 0 | `D:/projects(WIN)/badminton-miniapp-worktrees/data-baseline` | 已完成研究线，候选归档 |
| 8 | `codex/incremental-ui-score-baseline-20260729` | `51fe6dc` | 0 | `D:/projects(WIN)/badminton-miniapp-worktrees/incremental-ui-score-baseline-20260729` | 已批准干净基线，保留 |
| 9 | `codex/local-ops-dashboard` | `006205c` | 0 | `D:/projects(WIN)/badminton-miniapp-worktrees/local-ops-dashboard` | 新运营能力，待产品归属确认 |
| 10 | `codex/nextgen-design-system` | `983837d` | 31 | `D:/projects(WIN)/badminton-miniapp-worktrees/nextgen-design-system` | 暂停路线，含大量未提交证据，保护 |
| 11 | `codex/nextgen-game-mode-engine` | `5f1f674` | 0 | `D:/projects(WIN)/badminton-miniapp-worktrees/nextgen-game-mode-engine` | 独立引擎成果，待归档/复用决定 |
| 12 | `codex/next-gen-badminton` | `ffe98aa` | 20 | `D:/projects(WIN)/badminton-miniapp-worktrees/nextgen-integration` | 暂停中央树，保护 |
| 13 | `codex/nextgen-typography` | `17f444f` | 22 | `D:/projects(WIN)/badminton-miniapp-worktrees/nextgen-typography` | 暂停实验，保护 |
| 14 | `codex/nextgen-ui-redesign-20260724` | `f792b75` | 45 | `D:/projects(WIN)/badminton-miniapp-worktrees/nextgen-ui-redesign-20260724` | 暂停 UI 证据，最高数量 dirty，保护 |
| 15 | `codex/roadmap-scheduler-observability` | `d48d19d` | 0 | `D:/projects(WIN)/badminton-miniapp-worktrees/scheduler-observability` | 已完成研究线，候选归档 |
| 16 | `codex/share-activity-collection` | `fb8ea52` | 0 | `D:/projects(WIN)/badminton-miniapp-worktrees/share-activity-collection` | 新运营能力，保留 |
| 17 | `codex/standalone-water-a-20260806` | `178e5dd` | 15 | `D:/projects(WIN)/badminton-miniapp-worktrees/standalone-water-a-20260806` | 独立打水早期实现，保护 |
| 18 | `codex/water-court-vant-spike-20260807` | `9b3f94a` | 3 | `D:/projects(WIN)/badminton-miniapp-worktrees/water-court-vant-spike-20260807` | 已上传候选相关文档，保护 |
| 19 | `codex/roadmap-water-mvp` | `74cc333` | 0 | `D:/projects(WIN)/badminton-miniapp-worktrees/water-mvp` | 已集成历史线，候选归档 |
| 20 | `codex/water-tdesign-spike-20260807` | `178e5dd` | 20 | `D:/projects(WIN)/badminton-miniapp-worktrees/water-tdesign-spike-20260807` | 组件实验，保护 |

## dirty 成果重点

- 协作打水 V2：feedback 联系方式、桌面截图桥接和对应测试尚未提交。
- Next-Gen：设计系统、integration、typography、UI redesign 共包含大量代码、资产、文档和截图证据。
- 独立打水/Vant/TDesign：包含 `waterSession` 云函数、water 页面、组件构建和产品规格差异。
- 截图诊断：包含 CDP/WGC 截图脚本和测试。
- detached 上传树：包含 `project.config.json` 或 feedback 页面差异，必须先核验是否只是验收环境修改。

## 无独立 worktree 的本地分支

以下分支也属于盘点范围，删除前必须核对是否已被其他分支完整包含：

- Next-Gen：`codex/nextgen-cloud-data`、`codex/nextgen-product-architecture`、`codex/nextgen-product-research`、`codex/nextgen-club-ops`、`codex/nextgen-component-platform`、`codex/nextgen-core-flow`、`codex/nextgen-growth`、`codex/nextgen-live-match`、`codex/nextgen-motion-system`、`codex/nextgen-performance`、`codex/nextgen-player-growth`、`codex/nextgen-release-readiness`、`codex/nextgen-scheduling-platform`。
- 并行路线：`codex/roadmap-clone-retention`、`codex/roadmap-product-events`、`codex/roadmap-group-session-lite`、`codex/roadmap-ui-component-spike`。
- 历史产品线：`feature/core-flow-simplification`。
- 基线：`master`。

## 后续处理门槛

1. dirty worktree 先生成 patch/commit/bundle 级备份方案，但不自动写入或上传。
2. clean 且已完成的研究 worktree，确认提交已被主候选包含后才可列入 prune 候选。
3. 无 upstream 的重要分支先决定本地 bundle、远端备份或保留，不直接删除。
4. detached worktree 必须确认其差异用途，不能因为“无分支”就视为临时目录。
5. 每次实际清理前重新运行盘点，用户按明确路径批准。
