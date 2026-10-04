# 2026-10-05 原生截图复核

用户要求检查计划中的截图。实际仓库为 `D:\projects\badminton-miniapp\main`，master，开始 HEAD `f1c092e748d40d15cf700003df318a9b5f8b1e09`。本次修改限截图工具、显示夹具、直接测试和记录；原私有配置、旧候选、QR、备份和 partial 保留。未部署、上传、生成预览或写真实业务数据。逐项状态仍以 [详细状态](../paused-plan-status.md) 为准。

## 实际取得与人工复核的图

签名会话 `tmp/screenshot-review-20261005-05/session-430.json` 来自当前 main；DevTools 2.02.2609292、SDK 3.17.3，逻辑窗口430×752，模拟器整框PNG469×1013。整框含系统区域，receipt 的 pageGeometryVerified=false，不按图片像素推算按钮CSS尺寸。

六张正式图及原回执在 `tmp/screenshot-review-20261005-05/png/simulator-frame/`，主控逐张亲看：

| case | 人工复核结果 |
| --- | --- |
| singlesSettings6 | 单打循环、场地、规则及保存按钮可见，字段换行与边界正常。 |
| singlesLobby6 | 滚动到比赛参数，单打摘要、保存及导入区清楚；不是大厅开赛按钮首屏证据。 |
| singlesSchedule7 | 奇数名单轮空、同轮两个批次和暂休提示正确，无技术同步横幅；只展示夹具前两个批次，不证明完整云排程。 |
| singlesMatch21 | 两位单人选手、22:20及提交区域清晰；picker展开和真实提交未操作。 |
| singlesRankingTied | 四名个人排名1/1/3/3及胜负、净胜、总得分清楚；长名称未遮挡其他列。 |
| singlesShareTied | 前三名1/1/3、已结束和两条后续动作显示正确；没有真实分享或海报导出。 |

两批正式采集退出0，capture/evidence/machine/promotion均通过，PNG逐SHA匹配、数据前后hash一致、中性页和storage清理通过、runtimeExceptions为0。主控人工意见记录于本节，原机器receipt的reviewStatus=pending未改写。独立Luna核查见同根 `receipt-audit.md/json`。

Console不为零：四页有合成赛事不存在的只读查询error，另有8条对应watch警告和7条systemInfo弃用警告。夹具是在导航后的显示数据注入，不能用这些合成错误解释真实用户降级原因，也不能说云链路通过。排名主动作及分享两按钮实际高约43.9966 CSS px（44px渲染舍入）；录分仅测到外层tray，不能据此证明提交按钮44px。新增精确CTA selector尚需重拍补证。

## 已修复的截图合同

- Windows预热为vendor CLI保存唯一、会话邻近的诊断日志，保留官方batch参数和默认调用行为。不改安装、认证或全局配置；fake CLI实际验证空格路径、双流、非零退出和旧日志保全。
- 单打赛程和并列排名继承了计数合同却漏列对应selector；补回四个selector，保留2个批次及各2个并列名次门禁。直接回归先失败，再修复通过。
- 新增静默同步、离线显示夹具、0/1人草稿及单打提前结束两个视角的六个display-only case；均无业务方法、storage身份注入或伪造窗口尺寸。
- 原静默case错误要求display:none。真实DevTools的native hidden节点存在但尺寸归零，computed display仍为flex；不能删除隐藏门禁。新增可选expectedVisibleCount合同，静默case要求节点恰1、可见数量0，显示、缺节点或非法计数均拒绝；产品CSS和业务逻辑未改。
- 保留设置保存selector，补大厅参数保存、录分提交及赛程主动作的精确计数。当前待拍集合24状态，含权限/忙态/撤销、找回加载/空/错误和单打边界；“已准备”不等于已拍。

最终关联cases/tool测试87/87、0失败/0跳过，定向lint和diff检查退出0。旧失败和各阶段日志保留在 `tmp/screenshot-fixture-extension-20261005/` 与 `tmp/screenshot-launch-diagnosis-20261005/`。截图停止后主控串行完整npm test：1783项、1777通过/6旧runtime跳过/0失败，numeric exit0，stderr空；原始流、数值退出及SHA在 `tmp/screenshot-review-20261005-06/full-test.*`。本次新增截图工具合同触发这一轮完整检查，不重复旧全量。

## 恢复步骤及失败证据

1. 旧会话连接失败后正常退出并预热，未强杀DevTools、重装或重新认证。新CLI日志说明两次60秒首次预热时端口稍晚才就绪；依据实际时点仅用已有首次预热配置90秒，截图45秒预算和签名门禁未改。root05预热退出0、82.59秒并签会话；一次错误预期390宽实际430的root04记录也保留，未伪造宽度。
2. root05第一批赛程selector合同失败，全批未发布，另名修复批取得前三张正式图；后续录分/排名/分享取得后三张。同步及收赛批因静默display断言失败全批未发布；其中offline、manual-ready、manual-finished候选主控亲看，但不当作正式验收图。
3. 隐藏和CTA修复后另建root06，不覆盖root05。明确编译和签名刷新通过，三个导航却全部超时并停在launch。中性页/storage清理均通过；独占且只读doctor8项通过后，依手册唯一一次串行复测仍同样失败。两批无PNG、不发布，未无限重试。summary分别为 `tmp/ui-iterate-runs/2026-10-04T22-57-09-990Z-26132-38cdc787/summary.json`、`2026-10-04T22-59-35-027Z-61388-9ed11a73/summary.json`。
4. 官方打开无参数settings页退出1；此页空赛事ID不读DB、不监听。fresh stdio状态检查也退出1，白名单阶段诊断确认initialize timeout（15.63秒），未进入tools/call，没有登录或Token失效证据。原错误被包装器隐藏，不伪补更细根因。
5. 官方CLI正常quit退出0、日志明确quit、旧自动化监听消失。root06新预热失败，CLI记录等待IDE服务端口超时。随后同服务可回应且官方状态检查退出0，再据这条新证据用root07预热；CLI auto就绪，但automator响应超时、未签会话。两个失败根均保留，不把端口成功当应用成功。
6. 官方只读模拟器截图成功，`tmp/screenshot-review-20261005-07/diagnostic-frame.png`实际是开发者工具欢迎页，不是应用图。root08官方明确编到launch及关闭当前项目窗口均退出1。Computer Use返回两个同名项目窗口：当前main的lite窗口与引用旧路径的full窗口；只读文件系统随后确认该旧路径为指向main的Junction，两窗同源；当前窗口树有“模拟器长时间没有响应”，AppService为空。重新选择/绑定一次后，控件树与实际画面仍错配。首次菜单观察未执行编译、上传或业务点击；确认同源后重新绑定完整窗口并执行一次菜单已显示的Ctrl+R编译快捷键，立即复查仍为欢迎页；随后尝试点击顶部编译控件，再次只读取画面仍为欢迎页、页面路径为空，没有获得编译实际执行成功或应用运行证明；再尝试正常关闭额外窗口，窗口列表仍含两项目窗口并出现新无标题窗口。读取该返回窗口却显示非目标应用画面，关闭结果未知，立即停止所有原生输入，不继续点击或将其当确认框。没有确认任一窗口已关闭；不将兼容路径字符串当exact-main签名证据。

Computer Use技能的恢复规则要求：“Refresh the app/window selection and retry once; report the exact error if recovery fails.” 原输入错误为`element 45 is not available in cached app state`，恢复后的画面错配保留为实际限制，不推断项目有死循环；同源核实后的完整窗口编译尝试与首次错误分开记录。后续以本节实际错误和[项目故障手册](../../tools/weapp-ui-troubleshooting.md#按失败阶段恢复)为入口，不在公开记录保存个人插件安装路径。

## 收尾与未验证项

六图是补充合同之前的正式证据，后续三份截图源/工具hash已变化；不能称它们是补门禁后的最终24图。当前产品源码未因本次截图修改，签名仍按完整工作树严格核验，不跳过source drift。截图工具当前状态及原失败可由上述ignored根追溯。

需要手动只保留main项目窗口、关闭引用旧路径的窗口，在main点编译并看到应用首页；之后从已核服务状态建立新签名会话，再拍24状态。320/390当前源码、字体放大、完整CTA尺寸、native picker/modal/键盘、真实断网/监听、Android+iPhone、云身份/事务与用户验收仍未验证。此前历史390图不能替代本次单打新增状态；不宣称整个UI或12项计划完成。不恢复定时任务或CloudBase登录。
