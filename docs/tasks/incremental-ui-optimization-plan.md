# 增量 UI 优化计划

> 状态：本轮完成，等待下一项逐点批准
> 决策日期：2026-07-13
> 分支：`codex/ui-optimization-v2`
> 产品基线：`master@5813ffc`

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

## 非产品迁移范围

Windows 原生工具链、workflow records、hooks、DevTools session provenance、截图窗口恢复和故障分型可以从已验证实现中按白名单迁入。这些变更不得改变页面、业务逻辑或云端行为，并应与产品改动分批提交。

2026-07-12 在旧分支生成的截图只作为工具链历史证据。新分支已针对 master 页面结构重新适配 selector/fixture 并通过契约测试，但仍须重新生成验收图；旧分支的 canonical latest 不得冒充本分支产品验收。

## 本轮提交批次

1. `chore(records): port workflow record infrastructure`
2. `fix(tooling): port Windows-native development workflow`
3. `fix(schedule): center score between teams`
4. `docs: retire core-flow experiment and start incremental UI plan`

每批只使用精确文件清单，提交前审查完整差异；禁止 `git add .`、reset、clean 或 checkout 覆盖。提交与 push 分离，本轮没有远程 push、preview/upload、发布或云函数部署授权。

## 当前轮验收

- `git diff master -- miniprogram` 只列出 schedule 的 WXML/WXSS；
- `git diff master -- cloudfunctions` 为空；
- schedule 聚焦结构/样式测试覆盖中央 `VS`、中央比分、两行长名称和无固定右侧栏；
- `npm run verify:windows-env`、`npm run verify:light`、`npm run verify:full` 和 `git diff --check` 全部通过；
- 真实 `scheduleRunning` 截图同时覆盖待录分、已完赛、长中文名和长英文名，并人工检查无重叠、裁切或信息丢失；
- 截图脚本必须从 `D:\projects(WIN)\badminton-miniapp` 运行，成功证据在本分支重新写入，失败不得覆盖上一张好图；
- 不执行小程序 upload/preview、发布、云函数部署或真实云数据写入。

## 后续 UI 工作规则

本轮完成后不自动扩展到其他页面。后续每个 UI 点采用以下闭环：

```text
选择一个页面/问题
  -> 列出保留、调整、删除内容
  -> 用户批准可见变化
  -> 测试先行并实现
  -> 真实截图与人工检查
  -> 用户确认
  -> 单独提交
```

硬规则：

- 视觉调整和流程调整不得混在同一批；
- 默认不删除信息、入口、确认步骤或复盘能力；
- 每次只处理一个页面或一个明确 UI 点；
- 未经批准不得用“精简”“统一”作为跨页面重构授权；
- 旧 core-flow 计划和 UI-fix 计划只供复盘，不再提供待办或产品方向。
