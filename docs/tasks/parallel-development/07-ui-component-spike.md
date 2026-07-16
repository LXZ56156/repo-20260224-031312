# P07：小程序 UI 组件库 discovery

> 状态：`discovery_complete_pending_explicit_pilot_approval`
> 任务类型：官方资料调研、选型评分与单页试点审批包；禁止生产实现
> 文档所有者：P07 独立对话

## 完成记录（2026-07-16）

- 完整报告：[`docs/reports/ui-component-library-discovery-2026-07-16.md`](../../reports/ui-component-library-discovery-2026-07-16.md)。
- 唯一推荐：WeUI Miniprogram，且只采用微信官方 `useExtendedLib` 路径；TDesign 与 Vant 的 stable quickstart 均要求移除本项目现有 `style:v2`，不满足单页隔离门槛。
- 未来试点提案：仅 `pages/feedback/index`，只用 `mp-form`、`mp-cells`、`mp-cell` 三个组件；删除项为“无”，文案、CTA、导航、分享与默认行为保持不变。
- 当前只完成 discovery。报告审批矩阵内的页面、保留/调整/删除、文案/CTA、导航/分享、默认行为、组件清单、`useExtendedLib`、视觉变化、包体预算、截图和回滚均待用户逐点批准；批准后必须另开实现任务。
- 本轮未安装依赖、未改生产文件、未 preview/upload、未发布或部署。

## 统一基线

- 权威源码：`D:\projects(WIN)\badminton-miniapp`。
- 路径中的 `(WIN)` 是目录名的一部分；不得写成 `D:\projects\WIN\badminton-miniapp`。
- 开发起点：由 `codex/ui-optimization-v2@743b016` 建立的统一 docs checkpoint；实际 SHA 以 `docs/tasks/current.md` 和 `docs/tasks/parallel-development-roadmap.md` 为准。
- 产品差异基线：`master@5813ffc`，也是用户确认的当前线上正式版。
- 当前唯一已批准的 UI 差异仍是 schedule 中央 `VS`/比分布局；其他页面不得借组件调研改变。
- `feature/core-flow-simplification` 已关闭，其扁平化和删减信息方向不能作为试点目标。
- 本任务只拥有本文件、自己的 session log，以及后续明确约定的调研报告；不得修改总路线图或其他并行任务文档。

## 目标

用同一评分框架核对 TDesign Miniprogram、WeUI Miniprogram、Vant Weapp 的官方一手资料，给出一个唯一推荐，并形成一个只覆盖单页、3–5 个组件的试点审批矩阵。

本轮只做 discovery。不得安装依赖、创建 demo 页、修改生产文件或把“推荐”解释为全量 UI 重构授权。

## 依赖与后续门槛

- 可与 P01、P02、P04、P06 立即并行，无代码依赖。
- P01 后续指出的漏斗问题决定真实 UI 优化优先级；组件库不能反向驱动产品需求。
- 试点实现必须等待用户批准具体页面、保留/调整/删除内容、组件清单、文案/CTA、导航/分享、默认行为、包体预算和回滚方式。
- 批准后也只能另开实现任务；本 discovery 对话不安装或接入组件库。

## 必读本地事实

- `docs/tasks/current.md`
- `docs/tasks/incremental-ui-optimization-plan.md`
- `docs/context/architecture.md`
- `docs/tools/weapp-ui-screenshot-workflow.md`
- `miniprogram/app.json`
- `miniprogram/app.wxss`
- `project.config.json`
- `package.json`
- 当前页面 JSON、组件目录和截图 case 配置

必须先证明当前仓库是否已有 UI 组件依赖、`usingComponents`、分包或主题 token，再讨论引入成本；不得凭印象描述本地状态。

## 官方资料要求

仅使用并优先引用以下一手来源：

- 项目官方 GitHub 仓库、release/tag、官方文档站。
- npm 官方包页面及其发布元数据。
- 微信开放文档中与自定义组件、npm 构建、分包和包体限制有关的页面。

每个关键结论记录访问日期、版本/tag 或 commit、直接链接。社区文章、聚合榜单和搜索摘要只能作为线索，不能支撑最终评分。若需要交互式网页控制，遵循 `browser-router`，由其选择 `agent-browser` 或 `playwright-cli`。

## 候选与统一评分

必须对以下三个候选使用同一证据窗口：

1. TDesign Miniprogram
2. WeUI Miniprogram
3. Vant Weapp

建议采用 100 分制，并在报告开始前冻结权重：

| 维度 | 权重 | 核对内容 |
|---|---:|---|
| 原生小程序兼容性 | 20 | 基础库、组件模型、npm 构建、开发者工具支持 |
| 包体与按需引入 | 20 | 依赖体积、按需声明、tree-shaking/复制策略、分包适配 |
| 维护与升级风险 | 15 | 最近 release、issue/PR 活跃度、破坏性升级和迁移说明 |
| 主题与现有视觉融合 | 15 | token、暗色/字体/圆角、样式隔离、全局 WXSS 冲突 |
| 组件覆盖 | 10 | 表单、弹层、列表、空态、反馈等项目真实需要 |
| 文档、测试与可访问性 | 10 | 示例、类型/测试、无障碍、错误恢复说明 |
| 团队接入与回滚成本 | 10 | 学习成本、包装层、退出组件库的难度 |

评分必须附证据和不确定性，不能只给主观形容词。最终必须给一个唯一推荐；若证据不足，明确写出缺口和补证方法，但仍需给当前条件下的暂定唯一选择。

## 包体与技术试点要求

报告至少包含：

- 当前生产包的可复算基线估算方法，不执行 preview/upload。
- 候选库仅引入目标 3–5 个组件时的估算方法和上限预算。
- `usingComponents`、组件包装层、样式隔离、主题 token 和移除依赖的回滚设计。
- 不在全局 `app.wxss` 做实验性覆盖；不允许一次迁移多个页面。
- 说明组件库解决的是技术一致性还是具体体验问题，避免把换组件当作产品优化结果。

## 单页试点审批矩阵

调研报告必须推荐一个且仅一个低耦合页面作为未来试点，并限定 3–5 个组件。不得在本轮实现。审批矩阵至少包括：

| 审批项 | 必须说明 |
|---|---|
| 保留 | 原页面哪些信息、确认步骤、入口和视觉层级完全保留 |
| 调整 | 组件替换后的具体结构/样式变化 |
| 删除 | 默认应为“无”；确需删除必须单独说明理由 |
| 文案与 CTA | 是否改变文字、主次、可点击区域或反馈方式 |
| 导航与分享 | 是否改变路径、参数、分享落地或返回行为 |
| 默认行为 | 弹层、表单、校验、加载、错误和禁用态是否改变 |
| 组件清单 | 3–5 个组件及每个组件的用途 |
| 包体预算 | 估算增量、测量方法和不可接受上限 |
| 截图验收 | 新增或复用的真实截图 case 与人工检查点 |
| 回滚 | 删除依赖、恢复原组件和清理样式的精确步骤 |

任何用户可见结构、视觉、文案、CTA、导航、分享或默认行为都必须等用户逐点批准。技术推荐本身不是产品批准。

## 允许

- 只读检查本地依赖、页面配置、现有样式和截图体系。
- 浏览并引用候选项目及微信官方一手资料。
- 在本任务自己的报告中编写评分表、包体估算、试点审批矩阵和后续测试计划。
- 使用临时计算结果做体积估算，但不得写入生产目录或安装依赖。

## 禁止

- 运行 `npm install`、`npm add` 或手动复制候选组件代码。
- 修改 `package.json`、lockfile、`miniprogram/app.json`、`app.wxss`、页面 JSON/WXML/WXSS/JS、生产组件、脚本或测试。
- 新增可访问 demo 页、路由、分包或 `usingComponents`。
- 执行 preview/upload、正式发布或云函数部署。
- 创建/切换 worktree、提交、push、PR 或 merge，除非用户当次明确授权。

## 交付

1. 本地现状与约束清单。
2. 三个候选的官方来源表，包含版本、日期和直接链接。
3. 同权重评分表、敏感性/不确定性说明和唯一推荐。
4. 目标 3–5 个组件的包体增量估算、包装层和回滚方案。
5. 一个单页试点的完整用户可见审批矩阵。
6. 获批后才可执行的测试先行方案：结构/样式契约、包体门槛、页面聚焦回归、真实截图与人工检查。
7. 按“调研结果、验证、未验证、残余风险”报告，并明确声明未安装依赖、未改生产文件、未上传未部署。

## 验证

- 每项评分至少有一条直接一手证据；维护状态必须核对当前 release/tag 和日期。
- 三个候选使用相同权重、相同观察窗口和相同包体估算口径。
- 唯一推荐能追溯到评分和项目实际约束，而不是组件数量或流行度。
- 试点严格为一个页面、3–5 个组件，且审批矩阵默认不删除现有信息或步骤。
- 检查 git 差异只包含获授权的 discovery 文档，运行 `git diff --check`。
- 不因调研运行 `npm run mp:preview`、`npm run mp:upload` 或任何 deploy 命令。

## 可复制启动提示词

```text
你负责 P07「小程序 UI 组件库 discovery」。权威仓库是 D:\projects(WIN)\badminton-miniapp。先只读检查 git 状态，并完整阅读 AGENTS.md、docs/tasks/current.md、docs/tasks/incremental-ui-optimization-plan.md、docs/tasks/parallel-development-roadmap.md、docs/tasks/parallel-development/07-ui-component-spike.md、docs/context/architecture.md、docs/tools/weapp-ui-screenshot-workflow.md、miniprogram/app.json、miniprogram/app.wxss、project.config.json 和 package.json。

本轮只做 discovery。请从官方 GitHub/release、官方文档、npm 和微信开放文档的一手资料，对 TDesign Miniprogram、WeUI Miniprogram、Vant Weapp 按同一 100 分框架评分，记录版本、日期、直接链接和不确定性，最后给一个唯一推荐。输出当前本地基线、按需引入与包体估算、包装层/主题/样式隔离/回滚方案，并为一个低耦合页面设计仅含 3–5 个组件的试点审批矩阵。

禁止安装依赖，禁止修改 package.json、lockfile、miniprogram/app.json、app.wxss、任何页面/组件/脚本/测试，禁止新增 demo 页。用户未逐点批准页面结构、视觉、文案、CTA、导航、分享、默认行为、组件清单和包体预算前，不得实现试点。若需要交互式网页控制，先使用 browser-router。最终按“调研结果、验证、未验证、残余风险”报告，并明确未安装依赖、未改生产文件、未上传、未部署。不要创建 worktree、提交、push、PR 或 merge，除非我另行明确授权。
```
