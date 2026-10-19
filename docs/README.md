# 文档索引

状态：现行。先读 [AGENTS](../AGENTS.md) → [当前状态](tasks/current.md)，再选择下列一处相关正文；索引不是全文加载清单。

## 按需入口

| 目的 | 入口 |
|---|---|
| 环境分工、项目路径、任务与上下文交接 | [开发工作流](tools/agent-development-workflow.md#环境与任务边界) |
| 当前缺陷、暂停项与下一步 | [统一待修清单](tasks/paused-plan-status.md) |
| 产品规则：缓存、排程、成员认领 | [已确认规格](specs/cache-fairness-and-member-claim-policy.md) |
| UI 截图与交互验收 | [验收门禁](tools/weapp-ui-acceptance.md) → [原生隔离流程](tools/weapp-ui-native-acceptance.md) |
| 编译、连接、截图异常 | [故障手册](tools/weapp-ui-troubleshooting.md#按失败阶段恢复)；参数按需查[工具参考](tools/weapp-ui-screenshot-workflow.md) |
| 云端测试与 Windows 专属环境 | [跨平台测试](tools/cross-platform-tests.md)、[Windows 环境](tools/windows-dev-environment.md) |
| 打水及其他业务合同 | [打水入口](specs/independent-water-ledgers.md)；其他业务从[待修清单](tasks/paused-plan-status.md)对应条目进入 |
| 埋点与用户分析 | [留痕合同](specs/activity-observability.md)、[聚合取数](tools/we-analysis-local-script.md) |
| 产品增长与候选新功能 | [中期计划](tasks/medium-term-growth-plan-2026-10-14.md)（计划不等于实施授权） |
| 架构与错误约定 | [架构](context/architecture.md)、[用户错误规范](specs/user-facing-errors.md) |
| 时点审计或历史依据 | [10-14 源码审计](reports/2026-10-14-source-offline-audit.md)；按日期/关键词搜索 reports、tasks、archive，先读命中章节 |

## 记录与维护

- 稳定规则只维护一个权威正文；AGENTS/索引保留短规则和链接，专题按需读取。报告是时点结论，不代替当前线上数据。
- 一个完整目标维护一份任务正文：目标/边界、结果、验证证据、未完成项、下一步；不同目标分开，同目标续做更新原文，不为每次截图再建总结。
- current 只放当前状态、边界、下一步及入口，目标 800–1500 字符；详细过程、计数和哈希留专题或原证据。原始日志与历史决定保留，不批量重写。
- 整理优先复用既有文档、去重和修链接；核对命令、相对路径/锚点、权威关系和历史完整性。文档变化不机械触发应用全量测试或 DevTools。
- 按 [交付规则](../AGENTS.md#交付与文档) 审查差异、提交推送并核远端；不得把文档归档当作实施、部署或发布完成。
