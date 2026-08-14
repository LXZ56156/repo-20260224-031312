# 增量 UI 产品边界

> 状态：score-only 基线已于 2026-07-29 建立；本文保留已批准的 UI 产品边界，不再提供 worktree 启动操作
> 决策日期：2026-07-13
> 历史实现提交：`38d6ea4`（从 master 精确 cherry-pick；不得使用现有 `codex/ui-optimization-v2` head 作为新基线）
> 产品基线：`master@5813ffc`
> 线上版本：用户于 2026-07-15 确认 `master` = `origin/master` = `5813ffc`
> 当前 branch、release 和 worktree 状态：见 `docs/status/project-state.md`

## 2026-07-29 重启边界

- 下一代全面升级、C3/Home 全面重做以及 next-gen ROADMAP 已暂停；不把其代码、资产、浏览器稿或截图迁入本计划。
- 该隔离基线现已存在于 `codex/incremental-ui-score-baseline-20260729@51fe6dc`；不得重复创建或把本节当作新任务启动提示。
- 当前主工作区的 `codex/ui-optimization-v2@d0435f6` 已叠加其他功能与云改动，只保留为历史研发分支，不能直接 preview 或作为增量 UI 起点。
- 历史恢复步骤和证据见 `docs/archive/2026/handoffs/incremental-ui-restart-2026-07-29.md`。

## 决策背景

`feature/core-flow-simplification` 虽完成过代码、测试与截图技术验收，但用户复审后明确否定其整体产品方向：页面信息、确认步骤、赛后复盘、分享语境和原有视觉层级被删除过多，最终界面过平、过空。继续完成其 UI 点 4/5 只会在错误基线上追加修补，因此旧计划已关闭。

新分支从 master 正向构建，不做大规模反向恢复，也不整体 cherry-pick 旧 UI 提交。

## 已批准的产品范围

相对 master，唯一批准的用户可见改动是 schedule 对阵卡中央比分布局：

- 待录分比赛在双方头像和姓名之间显示 `VS`；
- 已完赛比赛在相同中央位置显示比分，例如 `21:17`；
- 移除挤占姓名空间的固定右侧比分栏；
- 双方名称允许在各自区域内居中显示两行，长中文名和长英文名不得相互覆盖；
- 场次标题与未完赛状态移至卡片顶部，只为支撑上述布局，不改变信息或操作语义。

产品代码白名单：

- `miniprogram/pages/schedule/index.wxml`
- `miniprogram/pages/schedule/index.wxss`

不得修改 `schedule/index.js`、录分逻辑、路由、筛选值、头像点击筛选、整卡跳转、权限、计分、赛程、云函数或数据契约。

## 必须保持 master 的内容

以下页面与流程必须保持 `master@5813ffc`，不携带旧简化分支变化：

| 范围 | 必须保留 |
|---|---|
| launch / create | 原创建确认页、赛事名称输入、创建前确认和原有视觉 |
| lobby | 原 Hero、准备/说明、赛事信息、管理参数与明确开赛步骤 |
| 赛事导航 | 原导航文本、顺序、路径和状态跳转 |
| match | 原录分页结构与全部录分行为 |
| ranking / analytics | 原排名、复盘、广告位置、分享入口和旧路由行为 |
| home / share-entry | 原信息密度、结果语境、筛选、CTA 和分享落地内容 |
| 全局样式 | 原渐变、阴影、卡片层级、token 和赛事氛围 |

验收时，除两个 schedule 文件外，`miniprogram/` 应与 master 零差异；`cloudfunctions/` 应与 master 零差异。

## 新路线工具链边界

建立新基线时只允许从 master 精确 cherry-pick `38d6ea4`，不得同时迁入旧分支的 workflow records、Windows tooling、hooks、截图记录或公平性测试。master 若缺少后来新增的 command alias，不得为了方便重放整批工具链提交。

只有在当前源码真实 `scheduleRunning` 截图确实受阻时，才先审查 master 已有脚本，再对必要工具做最小、独立且可审计的本地适配；它不能混入产品基线，不能复制历史截图记录，也不能绕过用户可见变更审批。

2026-07-12/14 的旧截图记录、selector/fixture 适配与 `git.head=5813ffc`、`dirty=true` pre-commit acceptance snapshot 仅是历史工具链证据，不是新分支输入，也不证明干净 commit、Git push 或线上发布。

## 2026-07-13/15 历史提交批次（不得重放）

1. `chore(records): port workflow record infrastructure`
2. `fix(tooling): port Windows-native development workflow`
3. `fix(schedule): center score between teams`
4. `docs: retire core-flow experiment and start incremental UI plan`
5. `test(squad): stabilize fairness quality regressions`

以上五批只记录 `codex/ui-optimization-v2` 的历史执行，不是新路线待办。新路线首批只能是 `38d6ea4`；不得重放其余四批。历史 Git push 不代表小程序发布；仍未执行正式 upload、发布或云函数部署。

## 新路线基线验收

- `git diff master -- miniprogram` 只列出 schedule 的 WXML/WXSS；
- `git diff master -- cloudfunctions` 为空；
- schedule 聚焦结构/样式测试覆盖中央 `VS`、中央比分、两行长名称和无固定右侧栏；
- `node --test tests/schedule.ui-copy.test.js` 与 `git diff --check` 通过；其他命令以 master 实际脚本为准，不为补 alias 引入历史工具链；
- 真实 `scheduleRunning` 截图同时覆盖待录分、已完赛、长中文名和长英文名，并人工检查无重叠、裁切或信息丢失；
- 截图必须标记新 worktree、当前 HEAD 与 dirty provenance；历史 canonical record 和旧图不能替代当前源码证据；
- 不执行小程序 upload/preview、发布、云函数部署或真实云数据写入。
- 完成以上基线验收后停止，等待用户指定第一个微调点。

## 后续逐点 UI 工作规则

基线建立后不自动扩展到其他页面。后续每个 UI 点采用以下闭环：

```text
选择一个页面/问题
  -> 列出保留、调整、删除内容
  -> 浏览器给出近似方案
  -> 用户选择并批准可见变化
  -> 测试先行并实现
  -> 原生微信当前源码真实 DevTools 截图与人工检查
  -> 用户确认
  -> 单独提交
```

硬规则：

- 视觉调整和流程调整不得混在同一批；
- 默认不删除信息、入口、确认步骤或复盘能力；
- 每次只处理一个页面或一个明确 UI 点；
- 未经批准不得用“精简”“统一”作为跨页面重构授权；
- 旧 core-flow 计划和 UI-fix 计划只供复盘，不再提供待办或产品方向。
