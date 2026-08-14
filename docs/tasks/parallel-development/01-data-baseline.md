# 工作线 01：全量数据基线与产品漏斗复盘

> 状态：`complete_with_scope_limitations`（We 分析已刷新；赛事数据库为稳定客户端可见快照，非管理员全量）
> 类型：只读线上审计 + 本地脱敏分析产物
> 统一开发基线：`codex/ui-optimization-v2@743b016`
> 线上产品基线：`master@5813ffc`
> 建议分支：`codex/roadmap-data-baseline`
> 建议 worktree：`D:\projects(WIN)\badminton-miniapp-worktrees\data-baseline`

## 1. 目标

刷新当前 We 分析与云数据库只读证据，建立未来排阵模板、事件管道、复办和 UI 优化共用的可信数据基线。核心不是重复旧快照，而是形成可复跑的指标字典、业务漏斗和赛事组合 Pareto。

本任务不修改小程序产品行为，不写真实云数据，不以旧结论代替当前数据。

## 2. 依赖与输入

前置依赖：无，可立即独立执行。

开始前必须阅读：

- `AGENTS.md`
- `docs/tasks/current.md`
- `docs/archive/2026/plans/parallel-development-roadmap.md`
- `docs/tools/we-analysis-local-script.md`
- `docs/context/architecture.md`
- `docs/specs/growth-flywheel-optimization.md`，仅作为历史基线，不视为当前结论

允许使用本机已有 `.env.local` 或其他既有安全配置，但不得打印、复制或写入报告。若缺少凭据，只报告缺失项；不得要求用户在聊天中粘贴 secret。

## 3. 分析范围

### 3.1 We 分析

优先覆盖最近 90 天和 180 天，并记录实际可获得的最近完整日期：

- 日趋势、访问人数、访问次数、停留和访问深度
- 页面访问、入口/来源、分享相关数据
- 新老用户与用户画像中可合法获取的聚合维度
- D1、W1、W4 或平台实际支持的留存数据
- 历史增长功能上线前后可比窗口；不能比较时明确说明缺口

### 3.2 赛事数据库

至少建立以下业务链路：

```text
创建
  -> 名单达到可开赛条件
  -> 成功开赛
  -> 首个比分
  -> 50% 比分完成
  -> 全部比分完成
  -> finished 且排名存在
  -> 分享或复办
```

赛事组合至少按以下维度统计数量、完成率和耗时；字段缺失必须作为单独类别，不得静默填充：

```text
mode × playersCount × courts × totalMatches × presetKey × templateKey × engine
```

同时区分：

- 创建者、主动加入参与者和管理员导入游客，避免把游客计作独立获客用户。
- 首次主理人、复办主理人和参与者转主理人。
- `custom` 的真实人数、场地和场数组合。
- `draft`、`running`、`finished` 及“形式 finished 但比分或排名不完整”的记录。

### 3.3 核心指标

至少输出：

- 4 周移动平均“周有效完赛赛事数”。
- 主理人 28 日复办率。
- 参与者 28 日再次加入率。
- 参与者 28 日转主理人率。
- 创建到开赛、开赛到首分、首分到完赛的分段转化。
- 覆盖真实赛事量 80%、90%、95% 的人数/场地/场数组合 Pareto。

“有效完赛”定义必须在报告中固定，至少包含：成功开赛、全部计划比赛有合法比分、状态为 `finished`、排名存在；样本量和数据质量限制应同时披露。

## 4. 允许修改范围

- 本任务文档：`docs/tasks/parallel-development/01-data-baseline.md`
- 本任务独立证据：`docs/tasks/parallel-development/evidence/01-*`
- 本地数据缓存和脱敏分析产物：`data/we-analysis/**`
- `scripts/fetch-we-analysis.js`，仅在当前 API 拉取确有必要且测试覆盖时修改
- 唯一命名的新分析脚本：`scripts/audit-product-data*` 或 `scripts/analysis/data-baseline-*`
- 与上述脚本对应的唯一命名测试文件

## 5. 禁止范围

- 不修改 `docs/tasks/current.md`、总路线图或其他工作线文档。
- 不修改 `miniprogram/**`、`cloudfunctions/**`、页面 UI、业务 core 或云数据契约。
- 不写真实云数据库，不创建集合，不调用修改类 API。
- 不上传含 openid、昵称、头像、手机号、精确位置或其他可识别信息的原始明细。
- 不改 `.env.local`、不输出 token/AppSecret、不把秘密写入命令回显或报告。
- 不 commit、不 push、不创建 PR、不 upload/preview upload、不发布、不部署。

## 6. 实施步骤

1. 核对 worktree、branch、HEAD 和工作区状态。
2. 盘点现有拉取脚本、缓存日期、接口能力和历史数据缺口。
3. 先写或确认分析口径测试，再扩展拉取/分析脚本。
4. 拉取到最近完整日；原始缓存与可提交的脱敏证据分离。
5. 对 We 分析和数据库分别做质量校验，再进行交叉解释。
6. 输出漏斗、用户分层、模式使用、组合 Pareto 和留存/复办基线。
7. 将事实、推断、数据缺口和建议明确分栏；不得用过期快照冒充当前事实。
8. 审查输出是否含隐私或 secret，运行聚焦验证和 `git diff --check`。

## 7. 测试与验证

- 对任何新增/修改的数据归一化、日期窗口、分类和漏斗计算先写 `node:test`。
- 运行与实际改动文件对应的聚焦测试；若修改现有公共脚本，再运行 `npm run verify:light`。
- 对同一输入重复运行，核心聚合结果必须确定一致。
- 随机抽查若干赛事，人工验证状态、比分完整性、模式和组合分类。
- 验证原始记录数、分类后记录数、未知类别数能够守恒。
- 运行 `git diff --check`，并确认 Git diff 中无 secret 和个人明细。

本任务不要求 UI 截图或云函数测试，因为禁止修改产品代码和云函数。

## 8. 交付物

- 一份带数据截止日期的脱敏基线报告。
- 一份赛事组合 Pareto CSV/JSON，包含累计覆盖率。
- 一份指标字典，写清分母、分子、时间窗口、去重规则和数据来源。
- 一份数据质量报告，列出字段缺失、无法分类和样本偏差。
- 一份供 02/04/UI 后续工作使用的机器可读摘要。
- 本任务验证记录以及明确的“未执行远程写操作”声明。

## 9. 退出门槛

- 数据截止到实际可获得的最近完整日，并清楚记录 90/180 天实际覆盖范围。
- 至少 95% 的赛事记录可归入明确模式、人数、场地和场数组合；达不到时给出可复现的缺口清单，不能伪造达标。
- 输出覆盖真实使用量 80%、90%、95% 的组合清单。
- 建立创建到有效完赛的完整漏斗和主理人/参与者留存基线。
- 所有可提交产物均脱敏，无 secret、openid、昵称、头像等个人明细。
- 未修改产品代码，未执行任何真实云写入或远程发布操作。

## 10. 可直接复制的启动提示词

```text
你现在负责 badminton-miniapp 的“工作线 01：全量数据基线与产品漏斗复盘”。这是一条只读线上审计工作线，不要只给计划；在安全边界内持续完成数据盘点、必要脚本/测试、拉取、质量校验、分析和脱敏报告，直到退出门槛完成或遇到真实凭据阻塞。

预期 worktree：D:\projects(WIN)\badminton-miniapp-worktrees\data-baseline
预期分支：codex/roadmap-data-baseline
统一开发基线：codex/ui-optimization-v2@743b016
线上产品基线：master@5813ffc

历史启动上下文现位于 docs/archive/2026/plans/parallel-development-roadmap.md；本页不再是当前启动提示。若复查证据，仍应先核对绝对路径、branch、HEAD 与 git status，且不得覆盖既有改动。

允许只读调用 We 分析和云数据库，允许写本地脱敏缓存、独立分析脚本、聚焦测试及 01-* 证据。禁止修改 miniprogram/**、cloudfunctions/**、docs/tasks/current.md、总路线图和其他工作线文档。不得打印或提交 secret、openid、昵称、头像、手机号、精确位置等信息；凭据缺失时只报告安全配置缺口，不要让我在聊天中粘贴 secret。

以最近完整日为截止，覆盖实际可获得的 90/180 天数据；建立创建→名单就绪→开赛→首分→50%比分→全部比分→有效完赛→分享/复办漏斗，按 mode × playersCount × courts × totalMatches × presetKey × templateKey × engine 输出组合 Pareto，并建立主理人和参与者的复办/转化基线。先写或确认测试，再改分析代码；事实、推断和数据缺口分开写。

本任务不 commit、不 push、不创建 PR，不 upload/preview upload、不发布、不部署云函数、不创建集合、不写真实云数据。结束时用中文汇报：数据截止日和覆盖、关键结论、产物路径、测试结果、未完成项、数据局限、确认未执行的远程操作。不要更新全局 current.md。
```

## 11. 2026-07-16 执行结果

- 独立 worktree、分支和起始 HEAD 已核对：`codex/roadmap-data-baseline@70845c1`。
- DevTools 已通过 project path、进程身份和 runtime binding 绑定当前 worktree；使用只读客户端上下文双遍导出 1070 条可见赛事，前后 count 与规范化 SHA-256 一致，未写云数据。
- 截止 `2026-07-15`：90 天纳入 944 条赛事、482 条已开赛、165 条严格有效完赛；180 天纳入 1065 条、547 条已开赛、190 条严格有效完赛。
- 已计算单调漏斗、28 日 cohort proxy、组合 Pareto、4 周均线、耗时覆盖、守恒和数据质量；180 天 started 核心组合分类率为 97.6%。
- 当前客户端上下文的 `client_request_logs` 返回 0，但 1012 条赛事带 request ID；管理员集合可见性未验证，因此不把 0 当服务端空集合，也不把赛事快照称为管理员全量。
- 仅在进程内读取主工作区既有本地配置，完成截至 `2026-07-15` 的 931 个 We datacube 数据请求：931 成功、0 失败；凭据未打印、未复制到 worktree，token 未持久化。官方 stable_token/datacube 协议要求 HTTPS POST，但本次仅调用只读查询语义接口，远端写入为 0。
- 日汇总与日趋势覆盖 180/180 个请求日，其中 153 日有指标行；`2026-01-17..2026-02-12` 的 27 日为成功空响应，按 unavailable 处理、不补 0。最近 90 日为 90/90 日有指标行。
- 90 天 We 基线：UV person-days 2689、PV 46450、新 UV person-days 占比 60.0%、sessions 8300；新用户 D1/W1/W4 留存分别为 8.5%/11.8%/6.4%。person-days 不是窗口去重用户，不同留存粒度也不是同一 cohort 的连续衰减。
- `share-entry` 是 90 天最大的记录入口（entry PV 5408），但页面停留、入口、退出和来源聚合不能直接解释为转化或因果。仓库缺少可验证的线上发布时间与旧 raw，因此不做增长功能前后因果归因。
- 脱敏报告、指标字典、数据质量、机器摘要、We 状态、Pareto JSON/CSV、来源清单与验证记录位于 `docs/tasks/parallel-development/evidence/01-*`。
- 本次用户明确授权当前任务分支创建本地提交；该授权只覆盖 local commit，不覆盖 push、PR、preview/upload、发布、部署或真实数据写入。
- 收口时已先证明 `project.config.json` 仅有非语义行尾差异，再精确恢复为 HEAD 字节；未使用 reset/clean。受保护的 `tests/data-baseline-analysis.test.js` 七项均为互补覆盖，原样纳入测试体系与本地提交。
