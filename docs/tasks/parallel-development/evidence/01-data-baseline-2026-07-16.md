# 工作线 01 数据基线执行报告（2026-07-16）

> 结论：`partial_source_coverage`。已取得并双遍校验当前 `tournaments` 客户端可见快照，完成 90/180 天赛事漏斗、留存 proxy、周有效完赛和组合 Pareto；We 分析仍因当前独立 worktree 缺少本地凭据而不可用。数据库结果可用于方向性判断，但不能冒充管理员全量快照。

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

- 预期最近完整日：`2026-07-15`，预期覆盖最近 90/180 天。
- 当前 worktree 无 `.env.local`、token 缓存和 `WX_APPID/WX_APPSECRET` 进程凭据。
- 本次 We 分析 API 请求数为 0，缓存文件数为 0；所有当前 We 指标保持 `null/unavailable`，不填成 0。
- 未读取主工作区配置，也未要求在聊天中提供 secret。

## 2. 90 天赛事漏斗

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

## 3. 留存、复办与耗时 proxy

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

## 4. 赛事组合 Pareto

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

## 5. 数据质量与结构限制

- 1065 条截止日前赛事中：draft 518、running 357、finished 190；190 条 finished 均满足本报告的严格有效完赛口径。
- 主表 `startedAt` / `finishedAt` 覆盖均为 0；创建到开赛、开赛到首分耗时无法计算。
- 180 天内合法比分 2611 场，其中 2586 场有 scoredAt；改分会覆盖 scoredAt，仍不能证明首次比分时间。
- 150 条赛事存在计划/物化场数差异；其中 draft 配置和未生成赛程会自然贡献差异，不能一概解释为故障。
- reset 会清 rounds/rankings/scheduler 元数据，delete 会物理删除；当前快照存在历史丢失和 survivor bias。
- 旧数据缺少 mode/scheduler 元数据；started 赛事七维核心分类率仍达到 97.6%，超过 95% 退出门槛。
- `shareActivity*` 不是实际分享行为；不得与 We 平台分享入口或会话来源混为同一指标。

## 6. 下游结论

### 当前事实支持

- 工作线 02 可以把 6/7/5/8 人单场地 `multi_rotate` 作为模板研究优先级，但精确组合分散，不能只实现一个固定场数模板。
- 名单就绪和开赛后首分是当前两个最大可审计掉点；由于快照缺少事件时间和失败原因，不能直接归因于 UI。
- 工作线 04 应优先持久化 start/join/first-score/finish/share/clone 的幂等时间戳和送达证据。

### 仍不可做的结论

- 当前没有 We 访问、页面、来源、分享和留存数据，不能排序增长入口或声称增长功能效果。
- 未核对管理员集合总数，不能把客户端可见 1070 条称为绝对全量。
- 当前证据不授权页面结构、CTA、导航或用户流程调整；任何用户可见改动仍需单独批准和实图验收。

## 7. 可复跑命令

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

## 8. 交付与远程操作声明

- 指标字典：`01-metric-dictionary.json`
- 数据质量：`01-data-quality-2026-07-16.json`
- 机器摘要：`01-product-data-summary-2026-07-16.json`
- We 分析状态：`01-we-analysis-summary-2026-07-16.json`
- Pareto：`01-tournament-combination-pareto-2026-07-16.json/.csv`
- 来源清单：`01-source-manifest-2026-07-16.json`
- 验证记录：`01-validation-2026-07-16.md`

本次只执行云数据库读取；未执行真实云数据写入、集合创建、云函数部署、preview/upload、正式发布、push、PR 或 merge。
