# 羽毛球小程序并行开发路线图

> 状态：`ready_for_parallel_execution`
> 规划日期：2026-07-16
> 统一开发基线：`codex/ui-optimization-v2@743b016`
> 线上产品基线：`master@5813ffc`
> 远程操作：未授权

## 1. 目标与边界

本路线图把后续产品发展拆成可在不同对话、不同 Git worktree 中独立推进的工作线。目标是先形成可信数据和稳定技术契约，再分批实现模板化排阵、打水、复办、监控后台和轻量组局，避免多个任务同时修改同一业务热区。

必须始终区分两条基线：

- `master@5813ffc` 是用户于 2026-07-15 确认的线上正式版产品基线。
- `codex/ui-optimization-v2@743b016` 是本轮所有并行任务的统一开发基线；其中 schedule 中央 `VS` / 比分布局已获批准但尚未上传或发布。

所有工作线共同遵守：

- 每个对话使用独立 branch 和独立 worktree，禁止多个对话共用主工作区切分支。
- 开始前核对绝对路径、当前 branch、HEAD 和 `git status`；发现不符立即停止，不能自行 checkout 覆盖。
- 保留既有改动，禁止 `reset`、`clean`、覆盖式 checkout 或从旧仓库回灌。
- 本轮不 commit、不 push、不创建 PR、不执行小程序 upload/preview upload/发布、不部署云函数、不写真实云数据。
- 可以读取已在范围内的 We 分析和云数据库数据，并可以写本地脱敏分析产物；不得输出 secret、openid、昵称、头像、精确位置等个人信息。
- 页面结构、文案、CTA、导航、默认行为、操作语义等任何用户可见变化，必须先提交审批矩阵并取得明确批准，批准前只允许研究、规格、测试设计和非产品行为工作。
- worker 只维护自己的任务文档和唯一命名的证据文件；`docs/tasks/current.md` 与本路线图只由集成对话维护。

## 2. Worktree 与分支约定

建议使用以下布局；实际创建前由集成对话记录准确路径和 HEAD：

| 工作线 | 建议分支 | 建议 worktree |
|---|---|---|
| 01 数据基线 | `codex/roadmap-data-baseline` | `D:\projects(WIN)\badminton-miniapp-worktrees\data-baseline` |
| 02 排阵观测 | `codex/roadmap-scheduler-observability` | `D:\projects(WIN)\badminton-miniapp-worktrees\scheduler-observability` |
| 03 打水 MVP | `codex/roadmap-water-mvp` | `D:\projects(WIN)\badminton-miniapp-worktrees\water-mvp` |
| 04 产品事件管道 | `codex/roadmap-product-events` | `D:\projects(WIN)\badminton-miniapp-worktrees\product-events` |
| 05 复制与复办 | `codex/roadmap-clone-retention` | `D:\projects(WIN)\badminton-miniapp-worktrees\clone-retention` |
| 06 轻量组局规格 | `codex/roadmap-group-session-lite` | `D:\projects(WIN)\badminton-miniapp-worktrees\group-session-lite` |
| 07 UI 组件调研 | `codex/roadmap-ui-component-spike` | `D:\projects(WIN)\badminton-miniapp-worktrees\ui-component-spike` |

worktree 建立前应先有一个包含本路线图和所有工作线文档的稳定 checkpoint。未获得 commit 授权时，不要为了并行擅自创建提交；由集成对话明确后续启动方式。

## 3. 工作线与依赖

| 序号 | 工作线 | 当前可并行范围 | 后续依赖 | 第一退出门槛 |
|---|---|---|---|---|
| 01 | 数据基线 | 刷新 We 分析、只读数据库审计、漏斗与组合 Pareto | 无 | 最近完整日；至少 95% 赛事可分类；给出覆盖 80% / 90% / 95% 使用量的组合 |
| 02 | 排阵观测与覆盖审计 | 盘点现有模板、fallback、耗时和公平性；完善本地审计证据 | 批量新增模板必须等待 01 | 当前树全部模板键可审计；fallback 清单完整；审计阶段无生产排阵行为差异 |
| 03 | 打水 MVP | PRD、数据契约、兼容性与审批矩阵 | 实现等待明确用户批准 | 默认开关、单局账目、比分修改/重置/幂等、榜单派生和排名隔离全部明确 |
| 04 | 产品事件管道 Phase A | 默认关闭的事件协议、客户端队列、独立接收云函数与测试 | 业务热函数接线和事件启用等待 01 及单独集成 | 无 PII；幂等；稳定云契约；不接入现有业务热函数、不创建真实集合或部署 |
| 05 | 复制与复办 | 先提交审批矩阵；获批后修复 `cloneTournament` 配置复制 | 常用名单 UI 需另行审批 | 三种 mode 契约、去重、返回结构和 allowlist 配置复制均有回归测试 |
| 06 | 轻量组局规格 | 领域模型、报名状态机、分享、AA 和合规边界；仅 discovery | 实现等待第一阶段稳定及审批 | 首版排除附近、匹配、聊天、支付；金额使用整数分；隐私字段最小化 |
| 07 | UI 组件调研 | TDesign、WeUI、Vant 一手资料评分与单页试点审批包；仅 discovery | 安装或试点等待明确审批 | 唯一推荐、包体预算、3–5 组件试点和回滚边界完整；生产文件零差异 |

依赖关系：

```text
01 数据基线
  -> 02 高频模板实施阶段
  -> 04 最终事件字典和运营看板
  -> 第一个漏斗 UI 优化点

02 观测审计 + 01 组合 Pareto
  -> 高频模板强命中与受控 fallback

03 审批矩阵 + 用户明确批准
  -> 打水后端/核心逻辑
  -> 打水 UI 与真实截图

05 clone 契约稳定
  -> 常用球友名单和一键复办

06 规格验证 + 第一阶段指标稳定
  -> 轻量组局实现

07 官方证据 + 单页试点审批
  -> 低耦合页面技术试点
  -> 业务稳定后再评估全量 UI 重构
```

## 4. 第二批及长期队列

以下事项已进入总计划，但当前不应另开生产实现对话：

| 顺序 | 后续事项 | 必须等待 | 启动条件 |
|---|---|---|---|
| 08 | 高频排阵模板实施 | 01 数据基线 + 02 审计 | 高频组合、目标覆盖率、fallback 与排阵变化获得确认 |
| 09 | 自建运营监控后台 | 01 指标字典 + 04 可靠事件管道 | 事件契约稳定并积累可验证样本；先做最小内部看板，不先做复杂权限系统 |
| 10 | 常用球友名单 / 一键复办 | 05 clone 契约 | 用户资产权限、删除、去重和导入流程逐点审批 |
| 11 | 单点漏斗体验优化 | 01 最大掉点 + 04 可观测能力 | 每次只解决一个漏斗问题，先审批再实图验收 |
| 12 | 打水 MVP 实现与灰度 | 03 审批矩阵 | 默认关闭、数据兼容、排名隔离及页面文案全部获批 |
| 13 | 组局 Lite 实现 | 06 规格 + 04 事件契约 + 核心链路稳定 | 首版范围、分享入口、成员转赛事与 AA 规则获批 |
| 14 | 新玩法模板 | 01 需求证据 + 排阵模板体系稳定 | 单玩法独立规格；继续遵守每人场次一致与排名公平，不恢复实时算法依赖 |
| 15 | 附近局 / 搭子匹配 | 组局 Lite 有留存和转化证据 | 个人主体、位置隐私、内容治理和安全成本重新评估后再决策 |

## 5. 文件所有权与冲突控制

以下文件仅由集成对话维护，worker 不得修改：

- `docs/tasks/current.md`
- `docs/tasks/parallel-development-roadmap.md`
- `AGENTS.md`
- `package.json`
- `miniprogram/app.json`

高冲突区域：

- `miniprogram/pages/match/*` 与 `cloudfunctions/submitScore/*` 未来可能同时被打水和事件接线触及；先稳定事件基础设施，再由打水工作线 rebase 后接线。
- `scripts/*-common.template.js` 及生成的 `cloudfunctions/*/lib/*` 同一阶段只能由一条工作线修改；必须修改模板源并在 rebase 后统一 sync/check。
- `miniprogram/pages/schedule/index.wxml` 与 `index.wxss` 当前只承载已批准的中央比分布局，不属于排阵观测任务，也不得被其他工作线顺手调整。
- 各工作线测试、报告和 session log 必须使用唯一文件名，避免并行新增同名文件。

## 6. 推荐集成顺序

1. 路线图和工作线文档 checkpoint。
2. 并行启动 01、02、04、06、07；03 和 05 先只提交审批矩阵。
3. 集成 01 数据结论、02 审计报告、06 组局规格、07 UI 选型报告。
4. 05 获批后集成 `cloneTournament` 契约修复。
5. 根据 01 定稿事件字典，再集成 04 基础设施。
6. 根据 01 的组合 Pareto 和 02 的覆盖证据，单独实现高频模板。
7. 03 获得明确批准后，rebase 到最新基线并实现打水 MVP。
8. clone 契约稳定后实现常用名单与一键复办。
9. 根据数据只选择一个最大漏斗问题做 UI 审批和实图闭环。
10. 最后进入轻量组局实现；新玩法、附近局和自动匹配继续后置。

每批集成均应先做聚焦测试，再根据跨域风险选择 `npm run verify:light` 或 `npm run verify:full`，并运行 `git diff --check`。任何云函数变更在最终报告中列出未来需要部署的具体函数名，但不得在本轮部署。

## 7. 发布边界

集成、Git push 和小程序发布是三件不同的事。本路线图不授权其中任何远程操作。

未来建议按以下顺序独立验收和发布：

1. `cloneTournament` 契约修复。
2. `startTournament` 高频模板。
3. 产品事件管道。
4. 打水灰度。
5. 常用名单和一键复办。
6. 轻量组局。

第一次从 `codex/ui-optimization-v2` 上传小程序时，会同时包含尚未上线的 schedule 中央比分 UI。执行前必须明确选择“先单独发布 schedule UI”或“明确批准与下一功能捆绑”，不得默认夹带。

## 8. 工作线索引

- [01 数据基线](parallel-development/01-data-baseline.md)
- [02 排阵观测与覆盖审计](parallel-development/02-scheduler-observability.md)
- [03 打水 MVP](parallel-development/03-water-scoring-mvp.md)
- [04 产品事件管道 Phase A](parallel-development/04-product-event-pipeline.md)
- [05 clone 复办基础](parallel-development/05-repeat-organizer-foundation.md)
- [06 组局 Lite 规格](parallel-development/06-game-session-lite-spec.md)
- [07 UI 组件调研](parallel-development/07-ui-component-spike.md)
