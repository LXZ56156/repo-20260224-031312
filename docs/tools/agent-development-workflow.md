# UI 日常开发循环

状态：现行。仅在 UI 实现/视觉验证时读取；后端或文档任务按 [总索引](../README.md) 选择所需资料。协作/验证/授权规则以 [AGENTS](../../AGENTS.md) 为准。

## 每轮迭代

1. 明确页面、问题、已批准边界和相关状态；行为变化先确认直接覆盖。方向明确则最小原生实现，需要新的设计方向时才制作浏览器方案。
2. 审阅影响测试计划，执行必要测试；测试结束后再截图。通常一轮选1–3个相关状态，同一模拟器只由主控串行编译/导航/注入/采集。

~~~powershell
Set-Location 'D:\projects\badminton-miniapp\main'
# 路径替换为本任务文件；不带 --run 只输出计划
npm run test:affected -- miniprogram/pages/water/index.js
npm run test:affected -- --run miniprogram/pages/water/index.js
# 不熟悉case时查清单，不必逐轮重复
npm run ui:screenshot -- --list
npm run ui:iterate -- waterV2Member24
~~~

3. 打开本轮返回的真实PNG，核对receipt，主控按 [完整验收门禁](weapp-ui-acceptance.md) 审图；有问题继续修改和采集受影响状态。必要尺寸、原生交互、云链路、真机未验时分别说明，fixture不替代实际链路。

## 工具行为与结果

`ui:iterate`只连接现有launch-signed热会话；必要时自动challenge → 官方明确编到launch → 签名刷新 → 截图。必须指定存在且不重复的case，不自动预热、切设备、操作窗口或循环重试。默认 `tmp/weapp-ui-background-session.json` 和 `simulator-frame`，显式环境配置以其为准；模式/会话维护见 [工具参考](weapp-ui-screenshot-workflow.md#1-当前入口)。

命令返回PNG/receipt、阶段耗时、数据/元素校验、异常/console计数、SDK与尺寸；完整日志在 `tmp/ui-iterate-runs/<id>/`。`ok=true` / `reviewStatus=pending`表示机器证据可供审图；console数量不是错误数，采集耗时不是手机性能，PNG尺寸不是逻辑viewport。结果/发布合同见 [输出说明](weapp-ui-screenshot-workflow.md#6-输出与成功合同)。

失败先看本轮failedStage，按 [故障手册](weapp-ui-troubleshooting.md) 处理；candidate和上轮final不作本轮验收证据。源码签名包括文档，集中修改结束后再采集，期间不要编辑文件。不要逐轮手工执行doctor/refresh/prewarm，也不削弱签名来减少编译。

交付只说明本次变化、通过/失败/未验项和最新实图证据；任务记录按 [记录规则](../README.md#记录与维护) 维护。固定方案的选择与已知automation限制见 [研究证据](../reports/2026-10-04-agent-ui-workflow-research.md)，日常不重复加载。
