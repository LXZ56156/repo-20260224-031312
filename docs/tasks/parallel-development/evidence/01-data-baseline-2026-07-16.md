# 工作线 01 数据基线执行报告（2026-07-16）

> 结论：`complete_with_scope_limitations`。截至 `2026-07-15` 的 We 分析只读请求与赛事数据库稳定客户端可见快照均已刷新，完成 90/180 天访问、页面、来源、留存、赛事漏斗和组合 Pareto。We 的成功空响应、person-days 口径与画像范围均已披露；数据库结果仍不能冒充管理员全量快照。

## 1. 数据范围与来源

### 当前赛事数据库事实

- 截止日：`2026-07-15`；90 天窗口：`2026-04-17..2026-07-15`；180 天窗口：`2026-01-17..2026-07-15`。
- DevTools session 已通过 project path、进程身份和 runtime binding 校验，确认绑定 `D:\projects(WIN)\badminton-miniapp-worktrees\data-baseline`。
- 使用 AppService 的 `wx.cloud.database()` 客户端只读上下文，以 `_id` 升序 keyset、每页 20 条导出 `tournaments`。
- 导出前、后 count 均为 1070；连续两遍均为 1070 条，规范化文档 SHA-256 均为 `e3bb1aed23e3d00a8545b3baea04550a7b1de04420b85ccdf180a3532605b65b`。
- 可见记录的 `createdAt` 范围为 `2026-02-10T15:32:35.621Z..2026-07-16T10:14:33.698Z`；截止日后 5 条已排除。
- 90 天纳入 944 条；180 天纳入 1065 条。输入、去重、窗口和 status 分类均守恒。
- `client_request_logs` 在同一客户端上下文连续两遍均返回 0 条，但 1012 条赛事带 `clientRequestId` 或 `lastClientRequestId`。因此本报告将该集合标记为“管理员可见性未验证”，不把 0 解释为服务端空集合。

客户端查询权限不等于云数据库管理员权限；仓库没有可复用的管理员全量 exporter，也没有安全凭据可核对控制台总数。因此本文使用“客户端可见快照”，不使用“数据库全量”表述。

### 当前 We 分析事实

- 最近完整日为 `2026-07-15`；请求范围为 `2026-01-17..2026-07-15`，同时输出 90/180 天窗口。
- 仅在进程内读取主工作区既有本地配置，未打印、未复制到 worktree、未写日志，access token 未持久化。官方 stable_token/datacube 协议要求 HTTPS POST；本次只调用查询语义接口，没有 mutation endpoint 或远端数据写入。
- 共执行 931 个 datacube 数据请求，931 成功、0 失败。原始响应、CSV 与 fetch manifest 均只在 ignored `data/we-analysis/**`，Git tracked 数为 0。
- `dailySummary` 与 `dailyVisitTrend` 均完成 180/180 日请求，其中 153 日有指标行；`2026-01-17..2026-02-12` 的 27 日为成功空响应，按 unavailable 排除，不补成业务 0。最近 90 日为 90/90 日有指标行。
- `visitPage` / `visitDistribution` 有指标的日期为 129/180；最近 90 日均为 90/90。`userPortrait` 仅取 `2026-07-15` 单日快照，省市被删除，小于 k=5 的 bucket 被抑制。

## 2. We 分析与产品复盘

### 90/180 天访问基线

| 指标 | 90 天 | 180 天 |
|---|---:|---:|
| 有指标日 / 请求日 | 90 / 90 | 153 / 180 |
| UV person-days | 2689 | 2845 |
| 有指标日日均 UV | 29.9 | 18.6 |
| PV | 46450 | 48936 |
| 新 UV person-days 占比 | 60.0% | 59.9% |
| sessions | 8300 | 8733 |
| 加权访客停留 | 328.6 秒 | 327.3 秒 |
| 加权单次会话停留 | 106.4 秒 | 106.6 秒 |
| 加权访问深度 | 2.81 | 2.81 |
| share PV / share UV person-days | 429 / 259 | 452 / 274 |

UV、新 UV 和 share UV 均为逐日 UV 的 person-days 之和，不是跨窗口去重用户。`dailySummary.visit_total` 是累计端点：90 天首末为 94→1704、端点差 1610；180 天首个有指标日 `2026-02-13` 到截止日为 2→1704、端点差 1702。端点差不能改写成窗口新增独立用户数。

90 天贡献约 95% 的 180 天 UV person-days、PV、sessions 和分享量，只能描述为“活动高度集中在最近 90 个日历日”。两个窗口互相包含，早期还有成功空响应；仓库也没有经验证的线上发布时间和旧 raw，因此不能把差异归因为某次产品改动。

### 页面、入口与来源

- 90 天 PV 前六页为 `schedule=11635`、`lobby=6139`、`share-entry=6134`、`match=5949`、`home=5036`、`ranking=4799`，合计占页面 PV 的 85.5%。赛事执行与结果查看仍是主要浏览区域。
- `share-entry` 的 entry PV 为 5408，占已发布页面 entry PV 的 68.7%，是当前主要记录入口；其加权单 PV 停留为 7.24 秒。入口、停留和 exit 不是 session 转化率，不能直接称为成功、跳失或漏斗断点。
- 90 天来源 session 数前三个 code 为 `3=5690 (68.6%)`、`29=1391 (16.8%)`、`2=945 (11.4%)`。当前 fetch evidence 不含版本化 code→渠道名称字典，因此公开证据保留数字 code，不擅自命名渠道。
- 平台日汇总明确返回 429 次分享、259 share UV person-days，但 `visitPage` 的页面分享字段聚合为显式 0；这是端点语义/归因差异，不能解释为“页面没有分享”，也不能建立分享→赛事的用户级因果链。

### 平台留存

| cohort | 新用户 90 天 | 全访客 90 天 | 新用户 180 天 | 全访客 180 天 |
|---|---:|---:|---:|---:|
| D1 | 8.5% | 13.2% | 9.0% | 13.6% |
| W1 | 11.8% | 19.7% | 11.8% | 19.9% |
| W4 | 6.4% | 11.9% | 7.6% | 13.0% |
| M1 | 10.1% | 13.9% | 14.7% | 18.2% |

90 天新用户 D1/W1/W4 的有效 cohort 分别为 89/11/8 个，分母为 1581/1294/779；最新 1 个日 cohort、1 个周 cohort 和 4 个 W4 cohort 因 offset 未成熟或缺失而排除，不填 0。M1 在 90 天仅 1 个成熟 cohort，方向性很弱。D1/W1/W4/M1 使用不同时间粒度与分母，不能当成同一批用户的连续衰减。

## 3. 90 天赛事漏斗

| 阶段 | 赛事数 | 相对上一阶段转化 |
|---|---:|---:|
| created | 944 | 100.0% |
| roster_ready | 529 | 56.0% |
| started | 482 | 91.1% |
| first_score | 251 | 52.1% |
| half_scores | 213 | 84.9% |
| all_scores | 165 | 77.5% |
| effective_completed | 165 | 100.0% |
| share_or_repeat_lower_bound | 17 | 10.3% |

严格有效完赛为 165 场，占创建赛事 17.5%，占已开赛赛事 34.2%。两个最大可审计绝对损失为：

- 创建到名单就绪：减少 415 场；
- 开赛到首个合法比分：减少 231 场。

`share_or_repeat_lower_bound` 主要来自可观察 clone 关联。快照内没有 `sharedAt` / 正数 `shareCount` 证据，`shareActivity*` 又只是动态消息状态，因此 10.3% 只能视为复办/分享可观察下界，不能解释为真实分享率。

## 4. 留存、复办与耗时 proxy

90 天窗口：

- 主理人 28 日复办：83 / 226，36.7%；
- 参与者 28 日再次出现：44 / 135，32.6%；
- 参与者 28 日转主理人：7 / 135，5.2%；
- 最近完整周 `2026-07-06` 的 4 周移动平均周有效完赛赛事数：12.25；
- 首分到有效完赛中位耗时：1.17 小时，样本 165。

180 天交叉校验：

- 主理人 28 日复办：92 / 250，36.8%；
- 参与者 28 日再次出现：47 / 142，33.1%；
- 参与者 28 日转主理人：8 / 142，5.6%；
- 创建到有效完赛：190 / 1065，17.8%；开赛到有效完赛：190 / 547，34.7%；
- 首分到有效完赛中位耗时：1.13 小时；182 场有完整 scoredAt，另 8 场无法恢复可靠完赛时间。

这些用户级指标使用最终赛事快照和赛事 `createdAt` 近似参与时点；无 `joinedAt`、认领/移除历史和删除记录，属于 survivor-based proxy，不是精确 cohort 事实。

## 5. 赛事组合 Pareto

### 精确七维组合

90 天已开赛 482 场全部可完成核心组合分类，共 145 个精确组合：

- 覆盖 80%：54 个组合 / 387 场；
- 覆盖 90%：97 个组合 / 434 场；
- 覆盖 95%：121 个组合 / 458 场。

180 天已开赛 547 场，534 场可完成核心分类，分类率 97.6%，共 182 个精确组合：

- 覆盖 80%：73 个组合 / 438 场；
- 覆盖 90%：128 个组合 / 493 场；
- 覆盖 95%：155 个组合 / 520 场。

90 天排名第一的精确组合为：`multi_rotate × 6 人 × 1 场地 × 9 场 × rotation_6 × 6p-1c × template`，48 场，占已开赛 10.0%，严格完成率 47.9%。精确组合高度分散，不能只用少数固定总场数组合覆盖绝大多数真实赛事。

### 聚合到模式 × 人数 × 场地

90 天前四类均为单场地 `multi_rotate`：

| 人数 | 场地 | 已开赛 | 占比 | 严格完成率 |
|---:|---:|---:|---:|---:|
| 6 | 1 | 133 | 27.6% | 36.1% |
| 7 | 1 | 58 | 12.0% | 36.2% |
| 5 | 1 | 47 | 9.8% | 51.1% |
| 8 | 1 | 42 | 8.7% | 31.0% |

180 天 mode 分布为：`multi_rotate=516`、`fixed_pair_rr=8`、`squad_doubles=10`、`unknown=13`。因此后续模板工作可优先研究 6/7/5/8 人单场地轮转族，但必须保留总场数和公平性配置的弹性；这只是方向性输入，不代表已批准产品改动。

## 6. 数据质量与结构限制

- 1065 条截止日前赛事中：draft 518、running 357、finished 190；190 条 finished 均满足本报告的严格有效完赛口径。
- 主表 `startedAt` / `finishedAt` 覆盖均为 0；创建到开赛、开赛到首分耗时无法计算。
- 180 天内合法比分 2611 场，其中 2586 场有 scoredAt；改分会覆盖 scoredAt，仍不能证明首次比分时间。
- 150 条赛事存在计划/物化场数差异；其中 draft 配置和未生成赛程会自然贡献差异，不能一概解释为故障。
- reset 会清 rounds/rankings/scheduler 元数据，delete 会物理删除；当前快照存在历史丢失和 survivor bias。
- 旧数据缺少 mode/scheduler 元数据；started 赛事七维核心分类率仍达到 97.6%，超过 95% 退出门槛。
- `shareActivity*` 不是实际分享行为；不得与 We 平台分享入口或会话来源混为同一指标。
- We 成功空响应、成熟 offset 缺口、单日画像和页面分享归因差异均保留为质量边界；没有任何 missing 值被填成 0。

## 7. 下游结论

### 当前事实支持

- 工作线 02 可以把 6/7/5/8 人单场地 `multi_rotate` 作为模板研究优先级，但精确组合分散，不能只实现一个固定场数模板。
- 名单就绪和开赛后首分是当前两个最大可审计掉点；由于快照缺少事件时间和失败原因，不能直接归因于 UI。
- 工作线 04 应优先持久化 start/join/first-score/finish/share/clone 的幂等时间戳和送达证据。
- `share-entry` 仍是主要入口，新用户 person-day 占比约 60%，新用户 D1/W4 留存为 8.5%/6.4%；应先补齐版本化来源字典、曝光→加入→开赛事件链和发布标记，再讨论增长入口优先级。

### 仍不可做的结论

- 当前 We 聚合支持描述入口、访问和留存现状，但不支持把 90/180 天差异或历史文档值归因于增长功能效果。
- 未核对管理员集合总数，不能把客户端可见 1070 条称为绝对全量。
- 当前证据不授权页面结构、CTA、导航或用户流程调整；任何用户可见改动仍需单独批准和实图验收。

## 8. 可复跑命令

在已由仓库启动器绑定当前 worktree 的 DevTools session 中：

```powershell
& .\scripts\analysis\data-baseline-export-readonly.ps1 `
  -Collection tournaments `
  -OutputPath data\we-analysis\raw-db\tournaments-client-visible-2026-07-16.json

node scripts/audit-product-data.js `
  --tournaments data/we-analysis/raw-db/tournaments-client-visible-2026-07-16.json `
  --cutoff 2026-07-15 `
  --window-days 90 `
  --output-dir data/we-analysis/data-baseline/90d

node scripts/audit-product-data.js `
  --tournaments data/we-analysis/raw-db/tournaments-client-visible-2026-07-16.json `
  --cutoff 2026-07-15 `
  --window-days 180 `
  --output-dir data/we-analysis/data-baseline/180d
```

原始导出和本地分析目录均由 `.gitignore` 隔离。公开证据只复制 allowlist 维度和聚合数，不包含 openid、昵称、头像、手机号、位置、赛事名或原始行。

已存在 ignored We raw 时，可确定性重建脱敏摘要：

```powershell
node scripts/audit-we-data.js `
  data/we-analysis/we-current `
  docs/tasks/parallel-development/evidence/01-we-analysis-summary-2026-07-16.json
```

批量拉取脚本只接受显式本地 env path 和 ignored 输出目录；凭据与 token 均不得进入命令回显或提交。其作业矩阵固定为 180 天日级五类、25 个完整周留存、5 个完整月留存和截止日单日画像，共 931 个只读 datacube 请求。

```powershell
node scripts/analysis/data-baseline-we-fetch-readonly.js `
  --cutoff-date 2026-07-15 `
  --output-dir data/we-analysis/we-current `
  --env-path <existing-local-env-file>
```

也可预先在进程环境提供 `WX_APPID` / `WX_APPSECRET` 并省略 `--env-path`；脚本不会打印值或写 token cache，输出目录不在仓库内或未命中 `.gitignore` 时会 fail closed。

## 9. 交付与远程操作声明

- 指标字典：`01-metric-dictionary.json`
- 数据质量：`01-data-quality-2026-07-16.json`
- 机器摘要：`01-product-data-summary-2026-07-16.json`
- We 分析状态：`01-we-analysis-summary-2026-07-16.json`
- Pareto：`01-tournament-combination-pareto-2026-07-16.json/.csv`
- 来源清单：`01-source-manifest-2026-07-16.json`
- 验证记录：`01-validation-2026-07-16.md`

本次只执行 We 分析与云数据库读取；未执行真实云数据写入、集合创建、云函数部署、preview/upload、正式发布、push、PR 或 merge。
