# 工作线 02：排阵观测与模板覆盖审计

> 状态：`audit_complete_waiting_p01_pareto`
> 类型：logic-only 审计、测试与本地观测证据
> 统一开发基线：`codex/ui-optimization-v2@743b016`
> 线上产品基线：`master@5813ffc`
> 建议分支：`codex/roadmap-scheduler-observability`
> 建议 worktree：`D:\projects(WIN)\badminton-miniapp-worktrees\scheduler-observability`

## 1. 目标

对当前排阵系统做可复现的观测、覆盖和性能审计，确认现有模板、fallback、排阵质量与耗时证据，为后续按真实使用量补齐高频模板提供决策输入。

本阶段不根据主观猜测批量新增模板，不改变排阵算法、质量阈值或用户可见行为。模板实施必须等待工作线 01 的最新组合 Pareto。

## 2. 依赖与输入

审计阶段前置依赖：无，可与工作线 01 并行。

实施阶段前置依赖：

- 工作线 01 输出可核验的 `mode × playersCount × courts × totalMatches` 组合和累计覆盖率。
- 高频模板目标、fallback 政策及任何用户可见约束获得单独确认。

开始前必须阅读：

- `AGENTS.md`
- `docs/tasks/current.md`
- `docs/tasks/parallel-development-roadmap.md`
- `docs/tasks/parallel-development/02-scheduler-observability.md`
- `docs/context/architecture.md`
- 现有 scheduler/rotation 审计脚本和对应测试

## 3. 审计问题

### 3.1 模板与 fallback

- 从当前代码实时枚举模板键及其支持的场数变体，不引用过期手工数量。
- 记录 `playersCount`、requested/effective courts、totalMatches、`engine`、`engineVersion`、`templateKey`、execution profile 和 fallback 原因。
- 列出哪些场景强命中模板、哪些进入 beam/legacy 等动态路径、哪些无合法结果。
- 核对场地降级、长尾自定义和 seed 是否影响模板命中及可复现性。

### 3.2 公平性与完整性

- 每场必须有 4 个唯一有效成员，不得重复或缺失。
- 记录每人参赛次数、最大场次差、搭档/对手重复、连续上场和轮空分布。
- 对“每人场次完全一致”使用必要条件 `4 × totalMatches % playersCount == 0`，不能对不满足条件的组合宣称绝对等场。
- 区分等场、公平性质量和性能，不能只用单一 fairness score 代替全部约束。

### 3.3 性能与观测字段

盘点并验证当前路径能够提供的字段，包括但不限于：

- `scheduleMs`
- `materializeMs`
- `writeMs`
- `totalMs`
- `engine` / `engineVersion`
- `templateKey`
- `requestedCourts` / `effectiveCourts`
- `playersCount` / `totalMatches`

本地算法 benchmark 与云函数端到端耗时必须分开。真实性能测试使用真实时钟并记录运行环境、重复次数、中位数和 P95；公平性确定性测试不得因桌面负载改变业务结论。

## 4. 允许修改范围

- 本任务文档：`docs/tasks/parallel-development/02-scheduler-observability.md`
- 本任务独立证据：`docs/tasks/parallel-development/evidence/02-*`
- 现有本地排阵审计工具：
  - `scripts/audit-scheduler-scenarios.js`
  - `scripts/generate-scheduler-full-audit.js`
  - `scripts/scheduler-scenario-common.js`
  - 唯一命名的新 scheduler audit 脚本
- 与观测、覆盖、性能审计直接对应的 `tests/rotation.*`、`tests/scheduler.*` 测试或唯一命名新测试

以下生产文件在本阶段只读，用于审计，不得修改：

- `cloudfunctions/startTournament/index.js`
- `cloudfunctions/startTournament/rotation.js`
- `cloudfunctions/startTournament/rotationDoublesEngine.js`
- `cloudfunctions/startTournament/rotation.templates.js`
- `cloudfunctions/startTournament/scheduleModes.js`

如果审计证明现有字段无法得到必要证据，只在报告中提出最小观测改动建议，等待集成对话另行批准，不在本任务顺手修改生产代码。

## 5. 禁止范围

- 不新增、重写或批量刷新排阵模板。
- 不改变 scheduler policy、搜索预算、质量阈值、fallback 次序、seed、排名或赛事规则。
- 不修改 `miniprogram/**`、页面 UI、文案、CTA、导航或用户操作。
- 不修改 `docs/tasks/current.md`、总路线图或其他工作线文档。
- 不读取或写入真实赛事数据；真实组合由工作线 01 提供脱敏聚合结果。
- 不部署 `startTournament` 或其他云函数，不执行小程序远程操作。
- 不 commit、不 push、不创建 PR、不 upload/preview upload、不发布、不写真实云数据。

## 6. 实施步骤

1. 核对 worktree、branch、HEAD 和工作区状态。
2. 枚举当前模板注册表、场数变体、选择策略和 fallback 路径。
3. 先补齐审计工具/测试的失败用例，再做本地工具修正。
4. 生成全模板覆盖矩阵和典型长尾 fallback 场景。
5. 对完整性、等场条件、搭档/对手重复、连场和轮空分别审计。
6. 对模板路径和动态路径分组 benchmark，记录环境、重复次数、中位数、P95 和异常值。
7. 审核现有 timing/meta 字段是否足以在未来生产日志中计算模板命中率和耗时分布。
8. 等工作线 01 完成后，只把高频组合映射到现有覆盖/缺口；本阶段仍不实现新模板。
9. 输出事实、风险、建议实施批次和所需后续审批，运行聚焦测试及 `git diff --check`。

## 7. 测试与验证

至少运行与实际修改匹配的以下聚焦测试：

- `tests/rotation.templates.test.js`
- `tests/rotation.performance.test.js`
- `tests/rotation.policy.test.js`
- `tests/rotation.coverage.test.js`
- `tests/scheduler.scenarios.test.js`
- `tests/scheduler.multidimensional-audit.test.js`

若调整公共审计脚本，再运行：

- `npm run verify:light`
- `git diff --check`

验证要求：

- 审计脚本相同输入的覆盖结论必须确定一致。
- 性能数据至少重复多次，不能用单次墙钟结果宣称优化或退化。
- 模板计数、测试场景计数、成功/fallback/错误分类总数必须守恒。
- 当前阶段 Git diff 不得包含生产排阵文件、模板库或用户可见文件。

## 8. 交付物

- 当前模板键和场数变体的机器可读覆盖矩阵。
- template / beam / legacy / error 等路径的场景清单。
- 排阵完整性与多维公平性报告。
- 模板路径和动态路径的本地性能基线。
- 当前 timing/meta 字段清单及观测缺口建议。
- 将工作线 01 高频组合映射到“已覆盖 / 需新增 / 不满足绝对等场 / 需受控 fallback”的对照表。
- 后续模板实施的分批建议；不得包含未经数据支持的批量模板代码。

## 9. 退出门槛

- 从当前代码实时枚举并审计全部模板键及支持变体。
- 明确所有被测场景的命中路径、fallback 或失败原因。
- 完整性错误为 0；公平性各维度有独立结果，等场声明符合数学条件。
- 性能基线可复跑，并区分算法、materialize、write 和端到端耗时。
- 观测字段足以支持后续计算模板命中率和耗时分布，或形成明确的最小缺口清单。
- 收到工作线 01 结果后完成高频组合映射，但未提前新增模板。
- Git diff 不包含生产排阵行为、模板库、用户可见页面或远程操作。

## 10. 可直接复制的启动提示词

```text
你现在负责 badminton-miniapp 的“工作线 02：排阵观测与模板覆盖审计”。不要只给计划；在严格不改变生产排阵行为的前提下，持续完成模板枚举、fallback 分型、公平性审计、性能基线、观测字段核对、必要的本地审计脚本/测试和证据报告。

预期 worktree：D:\projects(WIN)\badminton-miniapp-worktrees\scheduler-observability
预期分支：codex/roadmap-scheduler-observability
统一开发基线：codex/ui-optimization-v2@743b016
线上产品基线：master@5813ffc

开始前完整阅读 AGENTS.md、docs/tasks/current.md、docs/tasks/parallel-development-roadmap.md、docs/tasks/parallel-development/02-scheduler-observability.md 和 docs/context/architecture.md，并盘点现有 scheduler/rotation 审计脚本与测试。先核对绝对路径、branch、HEAD 和 git status；若不是该独立 worktree，或存在不属于本任务的改动，不要 checkout/reset/clean，先报告。

本阶段只做观测与覆盖审计。允许修改 02 任务文档、02-* 独立证据、本地 scheduler audit 脚本和对应聚焦测试。cloudfunctions/startTournament/index.js、rotation.js、rotationDoublesEngine.js、rotation.templates.js、scheduleModes.js 全部只读。不要新增或刷新模板，不要改变算法、搜索预算、阈值、fallback、seed、排名、赛事规则或任何 UI。

从当前树实时枚举模板和场数变体；分别审计完整性、每人场次、搭档/对手重复、连场和轮空；对绝对等场使用 4 × totalMatches % playersCount == 0 的必要条件。模板和动态路径分组 benchmark，记录环境、重复次数、中位数和 P95，不能用单次墙钟结果下结论。核对 scheduleMs、materializeMs、writeMs、totalMs、engine、engineVersion、templateKey、requested/effective courts、playersCount 和 totalMatches 等观测字段。

工作线 01 数据尚未完成时，先完成现状审计；收到其脱敏组合 Pareto 后只做覆盖映射，不在本任务批量新增模板。先写或确认失败测试，再调整本地审计工具。运行相关 rotation/scheduler 聚焦测试，必要时 npm run verify:light，并运行 git diff --check。

本任务不 commit、不 push、不创建 PR，不 upload/preview upload、不发布、不部署云函数、不读取或写入真实赛事数据。结束时用中文汇报：模板覆盖、fallback、完整性与公平性、性能、观测缺口、工作线 01 依赖、产物路径、测试结果、确认未执行的远程操作。不要更新全局 current.md。
```

## 11. 2026-07-16 审计交付

本轮在 `codex/roadmap-scheduler-observability@70845c1` 上完成现状审计，未修改生产排阵文件、模板库或用户可见文件。

交付物：

- `scripts/audit-scheduler-observability.js`：实时模板枚举、结构完整性、多维公平性、路径分型、重复性能采样与 timing/meta 字段审计。
- `tests/scheduler.observability-audit.test.js`：覆盖矩阵守恒、畸形排阵检测、绝对等场必要条件、场地归一、runtime budget、真实 timing 源、按 mode 的 meta 可用性、路径分类与稳定性统计。
- `docs/tasks/parallel-development/evidence/02-scheduler-observability-audit.json`：机器可读的逐模板、逐场数、逐人场次/轮空、fallback、benchmark 和观测字段证据。
- `docs/tasks/parallel-development/evidence/02-scheduler-observability-audit.md`：可读审计摘要。

当前事实：

- 实时枚举 `60` 个模板键、`283` 个 variant、`941` 个连续场数前缀；注册表与模板路径问题均为 `0`。
- `941` 个模板前缀的四人唯一性、合法成员、同轮冲突与 `Σplays = 4 × matches` 错误均为 `0`。
- `114` 个数学上可绝对等场组合全部达成；`827` 个不满足 `4 × totalMatches % playersCount == 0` 的组合没有被误报为绝对等场。
- 模板同 seed 与跨 seed 路由审计均稳定；动态路径受真实时钟 deadline 影响，同一输入可能在 beam、legacy 与 error 间变化，证据中保留重复运行计数。
- 本地性能只测算法，使用 `performance.now()`、`2` 次 warmup、`20` 次原始样本并记录 median/P95；没有把本地结果冒充 materialize/write/云函数端到端耗时。
- 生产 done timing 已有 `scheduleMs/materializeMs/writeMs/totalMs` 等字段，但缺 `engineVersion/fallbackReason/searchElapsedMs/mode/scheduledMatches`；squad/fixed 的部分 meta 字段还存在“键或值不可用”缺口。本轮只报告建议，未修改生产代码。
- 工作线 01 的脱敏组合 Pareto 尚未提供，因此 `mode × playersCount × courts × totalMatches` 高频映射仍为 pending；本轮没有新增或刷新模板。
