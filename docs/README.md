# 文档索引

状态：现行。开始读 [AGENTS](../AGENTS.md) 和 [current](tasks/current.md)，然后只按下表读取相关正文/章节；索引不是全文加载清单。

## 按任务读取

| 任务 | 首先读 | 触发时再读 |
|---|---|---|
| 缓存保留/排程偏好/成员认领与规则冲突 | [已确认产品规则](specs/cache-fairness-and-member-claim-policy.md) | 均衡缓存、三档排程默认 C+D、认领 B；源码候选与规则已同步；验证查[实施记录](tasks/cache-fairness-claim-implementation-2026-10-18.md)，状态查[待修清单](tasks/paused-plan-status.md) |
| 客户端行为/错误 | 对应业务规格；[错误规范](specs/user-facing-errors.md) | 跨模块边界看 [架构](context/architecture.md) |
| UI 实现/验收 | [日常循环](tools/agent-development-workflow.md)、[完整验收](tools/weapp-ui-acceptance.md) | 参数/来源维护看 [截图参考](tools/weapp-ui-screenshot-workflow.md) |
| 截图或编译故障 | [故障手册](tools/weapp-ui-troubleshooting.md#按失败阶段恢复)的对应阶段 | 首次建立会话、签名/设备变化再读其链接正文 |
| 打水产品/权限/云合同 | [当前打水入口](specs/independent-water-ledgers.md) | 按入口路由读 V1兼容、V2技术具体章节 |
| 赛事协管/提前收赛/找回/新赛制 | [协管与收赛](specs/tournament-early-finish-and-coadmin-proposal.md)、[找回](specs/cloud-tournament-recovery-proposal.md)、[单打需求](specs/singles-round-robin-requirements.md)中相关一份 | 接续看[待修与未验摘要](tasks/paused-plan-status.md)；实现/部署沿革按需查其历史归档，草案不等于实施授权 |
| 云代码/部署、Windows命令 | [架构](context/architecture.md#cloud-function-shared-libraries)、[环境](tools/windows-dev-environment.md)相关节 | 合同变化按AGENTS触发云审计；版本迁移审计不是升级授权 |
| 埋点/数据分析 | [留痕合同](specs/activity-observability.md)、[数据拉取](tools/we-analysis-local-script.md) | 报告/样本结论查 reports，不作为实时数据 |
| 全面远端检查/问题优先级 | [2026-10-14 源码/离线检查](reports/2026-10-14-source-offline-audit.md)与[统一待修清单](tasks/paused-plan-status.md#远端审计待修与优化清单) | 原始证据及旧编号查[10-09 完整审计](reports/2026-10-09-remote-comprehensive-audit.md)；原12项沿革查清单归档，报告入库不代表修复或全项验收 |
| 中期产品/增长规划、AA与组局候选 | [10-14 中期优化计划](tasks/medium-term-growth-plan-2026-10-14.md) | 含竞品/用户证据、优先级、12周路线图和验收门槛；研究完成不等于实施授权，缺陷状态仍查统一待修清单 |
| 分享/增长 | [分享设计](specs/share-optimization-design.md)、[增长记录](specs/growth-flywheel-optimization.md)的适用说明 | 历史实施计划只追溯，不执行旧技能/命令 |
| 恢复暂停任务/交接 | current → [下一步待修清单](tasks/paused-plan-status.md) | 只读相应条目的代码/证据；历史进度从清单的归档入口按需追溯，不默认全文加载 |
| 历史决定/局部经验 | 用 rg 搜索 tasks/reports/archive；[经验](notes/learnings.md) | 先看日期/状态，再读命中段落；迁移快照断链见 [旁注](tasks/session-logs/2026-10-03-before-path-migration-current.links.md) |

## 权威与记录

现行规则在AGENTS/对应指南，产品与技术合同在specs，结构解释在context；reports是时点结论，session-logs/archive是历史证据。文档头标明现行、草案、已取代或历史及适用范围；源码注册/命令以 app.json、cloudbaserc.json、package.json 核对，线上状态单独取回执。

## 记录与维护

- 一次任务维护一份正文：目标与授权范围、结果/决定、验证与必要证据链接、未完成项、下一步。续做更新同一正文，不为每轮截图或复测再建总结；独立失败证据只有需要长期追溯时另存。
- 完成正文和相称验证后，按 [交付规则](../AGENTS.md#交付与文档) 审查范围、立即提交并推送，核对远端同步；任务完成记录以实际Git结果为准。
- current只在状态/范围/下一步变化时更新，详细计数/hash/过程放任务正文。日志与快照保留当时内容和原路径，不作实时状态维护；历史链接失效用旁注导航，不改原证据。
- 稳定经验吸收到唯一规范，其他位置链接引用；更新行为/工具时同步相关规范与索引，避免追加相互冲突的补充结论。长文按标题搜索定位，不默认全文读取。
- 文档验收核对权威关系、命令、相对链接/锚点和历史完整性，不触发DevTools/全量应用测试。文档整理不授予业务实施、部署或发布权限。

- [Linux / Windows 共用测试工具](tools/cross-platform-tests.md)：统一 runner、Node 镜像与校验、平台适配与验证边界。
