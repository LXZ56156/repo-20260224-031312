# 增量 UI 重启交接（2026-07-29）

> 当前权威结论：暂停下一代全面升级及 C3/Home 全面重设计；后续从 `master@5813ffc` 加唯一 schedule 中央比分位置 overlay 开始，按单点审批、单点实现、真实截图确认的方式微调。

## 1. 用户最新决定

用户要求：

1. 暂停当前“前沿、高级、全面重做”的 UI 路线，不继续 C3，也不把它翻译为原生小程序。
2. 回到主分支产品和流程，只加已经确认过的 schedule 对阵卡中央 `VS`/比分位置调整。
3. 后续在新对话逐步微调；每个设计先用浏览器近似展示，用户选定后再尽量用原生微信小程序逼近。
4. 本任务只做文档与证据收尾，不替新对话提前改 UI。

这项决定覆盖 2026-07-24 的 D-012 全面 next-gen 重启授权。next-gen 研究、代码、测试和截图可以继续作为历史参考，但不再授权实施、集成、preview 或发布。

## 2. 精确产品起点

| 项目 | 权威事实 |
|---|---|
| 线上/主分支 | `master` = `origin/master` = `5813ffc79f94c180fa5573eb25fb0d57f53b85df` |
| 唯一批准 overlay | `38d6ea4e716ac3ffad6213fd21f1f6301a1dffd8` |
| 提交标题 | `fix(schedule): center score between teams` |
| overlay 的 parent | `f6871903c3f14b6d5105e54923f2f6a2af430b2c` |
| patch-id | `2cf91c83878e94c9b39fb57694c5b2cf09c4028d` |
| 产品差异 | 仅 schedule `index.wxml` / `index.wxss` |
| 测试差异 | `tests/schedule.ui-copy.test.js` |

已核对 `38d6ea4` 的三个被修改文件：其 parent blob 与 `master@5813ffc` 的对应 blob 完全一致，因此该提交可以精确 cherry-pick 到 master 基线，不依赖 parent 中的其他历史。不要直接从 `38d6ea4` 建分支，因为它的祖先还包含 records 和 Windows tooling 提交。

overlay 的可见语义只有：

- 待录分比赛在双方之间显示 `VS`；
- 已完赛比赛在相同位置显示比分，例如 `21:17`；
- 移除固定右侧比分栏，为双方名称释放空间；
- 双方名称在各自区域居中，最多两行；
- 场次标题和未完赛状态移动到卡片顶部以支撑布局。

它不改变 `schedule/index.js`、整卡跳转、头像筛选、状态筛选、录分、排名、权限、云函数、数据或任何其他页面。

## 3. 新对话不得直接使用的分支

### 主工作区现状

`D:\projects(WIN)\badminton-miniapp` 当前仍位于：

```text
codex/ui-optimization-v2@d0435f6
```

本地 `codex/ui-optimization-v2` 比 `origin/codex/ui-optimization-v2@3220d0c` 多一个文档提交，且整个分支在 `38d6ea4` 之后又集成了打水、clone、事件管道、分析、match/settings/cloud 等后续工作。它不符合“master + 仅比分位置”的新产品边界，不能直接作为新分支起点，也不能直接打 preview 包。

### 下一代 UI 工作树

```text
D:\projects(WIN)\badminton-miniapp-worktrees\nextgen-ui-redesign-20260724
codex/nextgen-ui-redesign-20260724@f792b75
```

文档收尾开始前，它包含完整 next-gen 本地提交链，以及冻结入口的 15 个 implementation/evidence tracked modified 和 1 个 untracked `.playwright-cli/`。其中包括 Home、tabBar 图标、截图脚本、测试与记录改动；`tmp/design-decisions/` 下还有浏览器方向稿。本轮文档体系收尾又产生 28 个 tracked 文档/文档合同测试变更和 1 个 untracked 暂停交接文件，因此收尾审计状态是 43 tracked modified + 2 个顶层 untracked 项；原 15 个实现/证据变更没有被清理或吸收到新路线。所有这些均原样保留为审计证据：

- 不 reset、clean、覆盖或不可恢复删除；
- 不整体 cherry-pick、merge 或复制到新微调分支；
- C3「羽冠控制舱」及其前序 A/B/C 稿均未获最终产品批准；
- next-gen 的 local preflight、preview-only QR 和截图全绿不等于视觉接受、发布许可或线上事实。

## 4. 新对话的第一组操作

新主控应先完整读取 `AGENTS.md`、`docs/tasks/current.md`、本文和 `docs/tasks/incremental-ui-optimization-plan.md`，随后：

1. 只读确认 `master` 与 `origin/master` 仍指向 `5813ffc`；若远端已变化，先报告，不擅自改基线。
2. 不切换 `D:\projects(WIN)\badminton-miniapp` 的当前分支；从 `master@5813ffc` 创建新的隔离 `codex/` branch 与 worktree。建议名：

   ```text
   codex/incremental-ui-score-baseline-20260729
   D:\projects(WIN)\badminton-miniapp-worktrees\incremental-ui-score-baseline-20260729
   ```

3. 在新 worktree 精确 cherry-pick `38d6ea4`。不要 cherry-pick `codex/ui-optimization-v2` 的其他提交。
4. 在任何新设计前先证明：

   ```powershell
   git diff --name-only master -- miniprogram
   # 只能得到：
   # miniprogram/pages/schedule/index.wxml
   # miniprogram/pages/schedule/index.wxss

   git diff --name-only master -- cloudfunctions
   # 必须为空

   node --test tests/schedule.ui-copy.test.js
   ```

5. master 本身没有后来新增的全部 `verify:light` / `screenshot:schedule` alias；不要为方便而整体移植工具链。需要实图时先审可用脚本，使用 Windows 权威 DevTools 链路并记录 worktree/HEAD/dirty provenance。
6. 基线验证完成后停止，等待用户指出第一个微调点。

## 5. 后续每个 UI 点的审批闭环

```text
用户指定一个问题
  → 列清保留/调整/不动项
  → 浏览器给少量高质量近似方案
  → 用户选择
  → 先补/更新视觉合同测试
  → 只实现该点
  → 390px 当前源码真实 DevTools 实图
  → 用户确认
  → 再扩必要的 320/430 与状态矩阵
  → 单独提交
```

硬边界：

- 浏览器稿只是方向选择，不是原生验收。
- 视觉与流程不得混在同一批。
- 不默认删除信息、入口、确认步骤、复盘能力或现有状态。
- 不自动建立全局设计系统，不跨页面统一，不恢复 next-gen ROADMAP。
- 新的 CTA、导航、文案、权限、业务流程、云写入或发布语义必须逐项获得明确批准。
- push、PR、preview/upload、正式发布、云函数部署、真实数据写入仍未授权。

## 6. 本轮收尾事实

- 本轮只更新文档体系及其文档合同守卫测试；没有切换主工作区分支，没有实现新的 WXML/WXSS/JS，没有修改云函数。
- 未 push、未建 PR、未生成新的 preview QR、未 upload、未发布、未部署、未写真实数据。
- 最新 next-gen 暂停事实同步记录在：

  ```text
  D:\projects(WIN)\badminton-miniapp-worktrees\nextgen-ui-redesign-20260724\docs\next-gen\PAUSE-HANDOFF-2026-07-29.md
  D:\projects(WIN)\badminton-miniapp-worktrees\nextgen-integration\docs\next-gen\PAUSE-HANDOFF-2026-07-29.md
  ```
