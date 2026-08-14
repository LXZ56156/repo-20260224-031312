# 羽毛球小程序并行开发路线图

> 状态：`paused_reference_only`（2026-07-29；不得进入新的 master + score-only UI 基线）
> 规划日期：2026-07-16
> 统一开发 checkpoint：`codex/ui-optimization-v2@70845c1`
> 本地功能集成 head：`codex/ui-optimization-v2@530ecae`
> 远端开发分支：`origin/codex/ui-optimization-v2@743b016`
> 线上产品基线：`master@5813ffc`
> 远程操作：未授权、未执行

> 最新覆盖规则：本路线图及 P03/P04/P05 等本地集成结果只保留为历史研发证据。用户当前只授权从 `master@5813ffc` 加 `38d6ea4` 中央比分布局后逐点微调 UI；不得整体复用本路线图的 checkpoint、分支或产品实现。

## 1. 目标与边界

本路线图把后续产品发展拆成可在不同对话、不同 Git worktree 中独立推进的工作线。目标是先形成可信数据和稳定技术契约，再分批实现模板化排阵、打水、复办、监控后台和轻量组局，避免多个任务同时修改同一业务热区。

必须始终区分两条基线：

- `master@5813ffc` 是用户于 2026-07-15 确认的线上正式版产品基线。
- `codex/ui-optimization-v2@70845c1` 是 7 条工作线共同使用的 docs checkpoint，由远端开发基线 `743b016` 追加路线图文档形成；本地功能集成已推进到 `530ecae`，但均未 push、上传或发布。

所有工作线共同遵守：

- 每个对话使用独立 branch 和独立 worktree，禁止多个对话共用主工作区切分支。
- 开始前核对绝对路径、当前 branch、HEAD 和 `git status`；发现不符立即停止，不能自行 checkout 覆盖。
- 保留既有改动，禁止 `reset`、`clean`、覆盖式 checkout 或从旧仓库回灌。
- 用户已明确授权本轮 docs checkpoint、7 个 worktree、本地提交与本地集成；这些动作已经完成。仍禁止 push、创建 PR、小程序 upload/preview upload/发布、云函数部署和真实云数据写入。
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

7 个 worktree 均从稳定 checkpoint `70845c1` 建立，所有收口提交由原任务对话完成，再由总控按固定顺序 cherry-pick；每次本地提交均设置 `SKIP_CLOUD_POST_COMMIT_DEPLOY=1`。

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

### 3.1 本地集成状态

| 工作线 | 状态 | 当前结论 |
|---|---|---|
| P01 数据基线 | `complete_integrated_local` | We 分析截至 2026-07-15；931/931 只读请求成功，公开 evidence 已脱敏 |
| P02 排阵观测 | `complete_integrated_local` | 仅审计；未改模板/算法。高频 424 场中 406 场已覆盖，18 场超过 horizon |
| P03 打水 MVP | `approved_implemented_integrated_local_verified` | 9 项矩阵已批准；`multi_rotate` 专属、默认关闭、排名隔离；真实 DevTools 三图通过 |
| P04 事件管道 Phase A | `phase_a_integrated_local_disabled` | 客户端/服务端双端关闭；未部署、未建集合、未写事件 |
| P05 clone 复办基础 | `approved_implemented_integrated_local` | preset/config 复制契约已修复；未部署 `cloneTournament` |
| P06 组局 Lite | `discovery_complete_pending_product_approval` | 仅规格，无生产实现 |
| P07 UI 组件调研 | `discovery_complete_pending_explicit_pilot_approval` | 仅调研，无依赖或生产实现 |

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
| 08 | 高频排阵 horizon 扩展 | 01 数据基线 + 02 审计 | 当前无缺失 key；只评审 6 个满足等场必要条件的既有 key 扩展，逐项批准公平性、fallback 与行为变化；排除 `13p-2c@30m` |
| 09 | 自建运营监控后台 | 01 指标字典 + 04 安全加固后的事件管道 | 先修复弱假名、持久标识、调用者绑定/限流、保留删除与成本熔断；再做隔离数据验证和最小内部看板 |
| 10 | 常用球友名单 / 一键复办 | 05 clone 契约 | 用户资产权限、删除、去重和导入流程逐点审批 |
| 11 | 单点漏斗体验优化 | 01 最大掉点 + 04 可观测能力 | 每次只解决一个漏斗问题，先审批再实图验收 |
| 12 | 打水 MVP 发布与灰度 | 03 本地实现与集成验证已完成 | 制定独立发布包；发布时单独部署 `updateSettings` / `submitScore`，默认仍关闭，并补真机/真实云 smoke |
| 13 | 组局 Lite 实现 | 06 规格 + 04 事件契约 + 核心链路稳定 | 首版范围、分享入口、成员转赛事与 AA 规则获批 |
| 14 | 新玩法模板 | 01 需求证据 + 排阵模板体系稳定 | 单玩法独立规格；继续遵守每人场次一致与排名公平，不恢复实时算法依赖 |
| 15 | 附近局 / 搭子匹配 | 组局 Lite 有留存和转化证据 | 个人主体、位置隐私、内容治理和安全成本重新评估后再决策 |

## 5. 文件所有权与冲突控制

以下文件仅由集成对话维护，worker 不得修改：

- `docs/tasks/current.md`
- `docs/archive/2026/plans/parallel-development-roadmap.md`
- `AGENTS.md`
- `package.json`
- `miniprogram/app.json`

高冲突区域：

- P04 Phase A 与 P03 已按“默认关闭事件基础设施 → 打水 MVP”完成本地集成；未来 Phase B 若触及 `miniprogram/pages/match/*` 或 `cloudfunctions/submitScore/*`，必须基于当前集成 head 重新审计并单独审批。
- `scripts/*-common.template.js` 及生成的 `cloudfunctions/*/lib/*` 同一阶段只能由一条工作线修改；必须修改模板源并在 rebase 后统一 sync/check。
- `miniprogram/pages/schedule/index.wxml` 与 `index.wxss` 当前只承载已批准的中央比分布局，不属于排阵观测任务，也不得被其他工作线顺手调整。
- 各工作线测试、报告和 session log 必须使用唯一文件名，避免并行新增同名文件。

## 6. 本地集成顺序与下一步

本轮实际顺序已经完成：

1. docs checkpoint `70845c1`。
2. P06 组局规格。
3. P07 UI 组件调研。
4. P01 数据基线。
5. P02 排阵覆盖审计。
6. P05 clone preset/config 契约。
7. P04 默认关闭事件基础设施。
8. P03 打水 MVP；人工合并唯一的 clone 测试冲突，并追加 preset × water 组合回归。

下一步按以下门槛启动，不再把“本地已集成”误写成“已上线”：

1. 主集成树云契约、`verify:full` 和 P03 三张真实 DevTools 截图已完成；真机与真实云 smoke 留在发布前门槛。
2. 由用户评审 P02 的 6 个可行 horizon 扩展；每项另开任务，测试先行，不批量新增 key。
3. P04 先做隐私与抗滥用安全加固；在服务端关闭态部署、零写入验证和隔离数据验证完成前，不得启用客户端。
4. 单独制定发布包：明确 schedule UI、打水 UI 与未来云函数是否分批，禁止把 Git 集成当作小程序发布。
5. P06/P07 继续等待逐点产品/试点审批；常用名单、单点漏斗 UI 和组局生产实现继续后置。

每批后续实施均应先做聚焦测试，再根据跨域风险运行 `npm run verify:light` 或 `npm run verify:full` 和 `git diff --check`。任何云函数变更在报告中列出未来需要部署的具体函数名，但未经授权不得部署。

## 7. 发布边界

集成、Git push 和小程序发布是三件不同的事。本路线图不授权其中任何远程操作。

当前本地分支已同时包含未上线的 schedule 中央比分、P03 打水 UI、P05/P03/P04 云函数源码和默认关闭的事件客户端。未来任何 preview/upload 都必须先审阅实际打包差异；云函数部署必须逐个函数单独授权，不能因小程序代码上传而默认执行。

未来建议按以下顺序独立验收和发布：

1. 单独确认 schedule 中央比分 UI 的发布批次。
2. `cloneTournament` 契约修复。
3. 打水 UI + `updateSettings` / `submitScore` 灰度。
4. 安全加固后的产品事件服务端关闭态验证；客户端启用另行审批。
5. 经逐项批准的排阵 horizon 扩展。
6. 常用名单、一键复办与轻量组局。

第一次从 `codex/ui-optimization-v2` 上传小程序时，会同时包含尚未上线的 schedule 中央比分 UI 与 P03 打水 UI。执行前必须明确选择分批方案或明确批准捆绑，不能默认夹带；云函数部署仍须逐个授权。

## 8. 工作线索引

- [01 数据基线](../../../tasks/parallel-development/01-data-baseline.md)
- [02 排阵观测与覆盖审计](../../../tasks/parallel-development/02-scheduler-observability.md)
- [03 打水 MVP](../../../tasks/parallel-development/03-water-scoring-mvp.md)
- [04 产品事件管道 Phase A](../../../tasks/parallel-development/04-product-event-pipeline.md)
- [05 clone 复办基础](../../../tasks/parallel-development/05-repeat-organizer-foundation.md)
- [06 组局 Lite 规格](../../../tasks/parallel-development/06-game-session-lite-spec.md)
- [07 UI 组件调研](../../../tasks/parallel-development/07-ui-component-spike.md)
