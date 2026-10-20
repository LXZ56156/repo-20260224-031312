# 当前状态

更新：2026-10-20（北京时间）。源码已推 master：产品与跨平台工具 e0b4bdf、VM 验收工具 2904cd4、启动门禁 209b43d；这些提交不代表线上已发布。

## 工作方式

dot 在云电脑直接拉最新仓库、实现代码并完成非 GUI 测试，不为代码/测试/文档开 Codex 任务。同一待验版本再到 VM 的 `C:\Projects\badminton\badminton-vm` 做 DevTools 截图、UI/真实交互验收；新建 VM 任务须获准且明确项目/cwd。不同目标分开，详见[工作流](../tools/agent-development-workflow.md#环境与任务边界)。

## 已有结果

- 缓存双软预算、三档排程默认均衡、成员显式认领已实现，规则见[产品正文](../specs/cache-fairness-and-member-claim-policy.md)，覆盖与风险见[实施记录](cache-fairness-claim-implementation-2026-10-18.md)。
- 390/430 隔离原生保存、最终认领、普通加入通过；测试数据完整恢复。Windows 全量 2032/2032 属此前基线，启动门禁另有 175 项关联回归；不能合并称最新全量通过。详见[VM 记录](vm-migration-and-ui-acceptance-2026-10-18.md)。
- VM 固定副本已复制并校验；旧证据保留。固定目录已有可复用的本地会话中转，消息往返通过且 idle；主控直接读取仍报 placement v3。原 local 正常接口已核实 VM master/277bf86、工作区干净，无需改 Git trust；旧路径任务不再使用。

## 未完成与下一步

277bf86 的云端复跑通过，但 VM 同版全量 2034通过/1排程超时失败。现已补确定性反例，将原完整 fallback 准备提前到可选搜索前，保持原预算及公平性规则；修复后云端全量2037项：2029通过、8 Windows跳过、0失败，check/lint通过。VM修复版复验待执行，失败历史及细节见[跨平台记录](../tools/cross-platform-tests.md#同版-windows-复现与完成结果前置修复)。

1. 启动曾错误接受双页栈，已加单页与异常拒签门禁。现场复测遇基础库空页；一次官方编译已恢复单页首页，但正式续签及固定目录的新会话尚未完成。旧签名不覆盖新路径或文档。
2. durable 原生入口未挂载；现有官方 local 接续可截图点击。真机、独立测试云和真实云事务未验，不以 fixture 或截图代替。
3. 用户行为留痕已有代码，后台配置、真实客户端实收/对账和每日统计闭环仍待补证（OBS-01）。旧报表不是近期用户数据，见[留痕合同](../specs/activity-observability.md)。
4. 其他缺陷/暂停项只从[统一待修清单](paused-plan-status.md)接续；[中期增长计划](medium-term-growth-plan-2026-10-14.md)仍需按范围确认。

验收按[覆盖清单](../tools/weapp-ui-acceptance.md#覆盖清单与通过标准)逐项记录已验/未验/阻塞，问题修后复验；不承诺穷尽所有输入或绝无缺陷。未部署、预览上传或写入生产；GitHub Actions 按用户要求不启用。
