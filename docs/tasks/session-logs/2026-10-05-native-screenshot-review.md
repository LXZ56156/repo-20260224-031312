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

## 首阶段停止时的收尾与未验证项（历史）

六图是补充合同之前的正式证据，后续三份截图源/工具hash已变化；不能称它们是补门禁后的最终24图。当前产品源码未因本次截图修改，签名仍按完整工作树严格核验，不跳过source drift。截图工具当前状态及原失败可由上述ignored根追溯。

当时记录需要手动只保留main项目窗口、关闭引用旧路径的窗口，在main点编译并看到应用首页；之后从已核服务状态建立新签名会话，再拍24状态。320/390当前源码、字体放大、完整CTA尺寸、native picker/modal/键盘、真实断网/监听、Android+iPhone、云身份/事务与用户验收仍未验证。此前历史390图不能替代本次单打新增状态；不宣称整个UI或12项计划完成。不恢复定时任务或CloudBase登录。


## 10-05 用户要求自主恢复后的接续

接续HEAD为f85c19e。重新核验main/master和dirty；兼容旧路径为Junction同源，miniprogramRoot正确。正常CLI quit后旧GUI PID24692及39516监听均已消失，再official open明确main退出0。原生真实编译后子进程约1.4–1.9秒就绪；先看到AppService通用错误，后实际首页恢复，并关闭过期模拟器提示。没有清storage/auth/session、登录、重装、部署或真实写入，也没有需要用户手动恢复。旧窗口控制失败仍保留，不改写。

安装日志给出更具体故障：页面资源请求出现EMFILE（too many open files），图标读取失败，instanceframe请求超时/500；AppService文案是安装源码catch返回的通用错误，并非项目业务文案。巨大全仓扫描是负载因素候选，不能单凭关联断言唯一因果。主控只读完整递归计数tmp317222文件/38218目录、根node_modules23592文件，miniprogram642文件；原件和诊断位于全新`tmp/devtools-recovery-20261005-01/`，独立Luna源核位于`tmp/devtools-runtime-repair-20261005-readonly/`及`tmp/devtools-appservice-cause-20261005/`。Luna的tmp56326只为不同遍历口径，未拿该数替代主控完整计数。

安装包的projectconfig/projectprivateconfig schema明确支持顶层watchOptions.ignore:string[]；_initProjectWatcher将其传给FileUtils，glob扫描和watcher忽略规则都使用这份清单。本轮仅在project.config.json新增该键，排除根tmp/**、node_modules/**、.git/**；不排miniprogram或miniprogram_npm，不改变打包合同。原配置字节先另存，移除新键后全部原字段相等，原EOF样式保留，private配置另存核SHA。后续重启实查新ignore是否载入，再签会话拍图；新措施尚未以线上或真机验证。


### 当前24状态及启动修复验证

新根`tmp/devtools-recovery-20261005-04/`已取得24张正式430×752图；此批是在补hidden/CTA合同、watch配置之后，冷启等待代码落地之前采集。主控逐张亲看：单打设置/大厅参数/奇数轮空/22:20录分/共同名次/分享、在线静默与离线、收赛ready/busy/双打终态/单打终态及保留分数/取消卡、协管owner/busy/member/revoked/settings、找回列表/空/错误/加载和0/1人草稿；无可见技术横幅、关键遮挡或横向溢出。忙态灰置、撤权后管理员入口消失，长昵称换行不遮邻列；单打终态结果锚点图实际验证保留录分人与下一张取消卡，不是收赛动作首屏。部分视图为既定滚动锚点，不宣称未展示区域可达或原生点击已验。

首三图底层runner summary退出0、机器/发布/cleanup通过；PowerShell外层记账退出1，原件保留，不当作外层成功。后续Node排他输出队列数值exit0；中间一次doctor只有marker=false，支持入口明确refresh全项通过后另名运行，不覆盖失败。所有机器receipt仍reviewStatus=pending，人工结论另记本节。独立回执审计另存本根，不据事后prewarm源码变化否定当时签名，也不冒称旧会话绑定新代码。

watchOptions实际载入三个排除项，旧扫描46739ms、新扫描3303ms；同一运行日志迄完成24图无新EMFILE，仍是本机负载修复证据，不证明原通用AppService提示全部由此唯一引起。冷启服务可稍后响应而原launch已超时，故仅新增Windows GUI spawn后的官方.ide/On、所选安装owner、127.0.0.1纯读GET /upgrade有界等待，再唯一launch；不猜端口、不登录、不延长截图预算。6.1 Sol high实现，Luna独立诊断，主控源码复核；关联99/99与原保护8/8通过，定向ESLint无错误、diff检查通过。工具基础设施改变后串行全量1793项：1787通过、6旧runtime跳过、0失败、numeric exit0/stderr空，原始流及SHA在`tmp/devtools-recovery-20261005-05/full-test.*`。接着执行一次真正关闭后的冷启实证；不与全量/截图并行。

前节“需要手动恢复”属于已结束的历史阶段，当前无需用户承担恢复操作。320/390、大字、原生picker/modal/键盘、真实断网监听、云与手机仍未验；24图使用合成展示数据，不证明真实权限/事务/写入。原raw、private、partial与历史失败不覆盖。


### 完整冷启、当前图复拍与最终收口

`tmp/devtools-recovery-20261005-05/cold-verify.cjs`先正常CLI quit，数值exit0；old GUI进程与IDE/39519监听全部消失，39520空闲，确认stdout/receipt保存。只进行一次新prewarm：53.05秒exit0，IDE service ready耗时13348ms，AppService ready32ms，所有8项checks=true、源码稳定且签会话成功。新日志实际仍载入3项ignore，首次扫描3296ms；旧24图运行和新冷启运行的实际backend日志截至本轮核查EMFILE均0，见本根`watch-runtime-verified.json`。较早latest-log自动选到了972字节CLI日志、不能证明GUI载入，该初版原件保留；最终明确两份backend日志复核，不覆盖原件。首次inline Node审计命令因PowerShell引号解析SyntaxError未执行采集，改为独立ignored脚本成功。

随后同新签名会话采集scheduleCachedPollingSilent、singlesMatch21、lobbyCoManagerOwnerBusy三图：外层/runner/doctor/capture数值exit全0，35.83秒完成；主控再次亲看，在线无技术横幅、22:20单人录分与忙态禁用正常。raw/receipt/PNG在本根`png/simulator-frame/`，与旧24图根分开。用户Esc中断仅发生在完成三图后的Windows窗口清单调用，未在测试或采集中；停止本轮后用户明确允许继续控制。重新选择唯一返回的DevTools项目窗口，实际首页与pages/home/index可见，无模拟器无响应弹框，不需要用户恢复。

独立Luna审计24个唯一case与24回执、PNG SHA/字节/来源签名/8批session和listener、清理/运行异常闭合：runtimeExceptions=0。两张在线静默与ready图字节相同，是预期无提示的同画面，不当24种唯一视觉内容。原console仍包含合成赛事只读查询及watch/systemInfo警告，不将其当真实云错误或宣称云验证通过。按钮CSS合同为height/min-height44px；SDK原始量测最小43.996601px，保留这个亚像素值，不声称浮点严格≥44；实际交互、320/390与字体放大仍未验。本轮不为亚像素舍入改产品样式，不把模拟器整框像素映射成CSS尺寸。

最终任务提交限watchOptions、prewarm等待及直接测试、current/详细状态/本日志；项目原EOF差异单独保留在工作树，原私有配置与候选/QR/partial不混入。完整测试在代码稳定后已通过，不因只改进度文字再重复全量。计划剩余云/手机/原生/七日标准不变，未登录、付款、部署、上传或写真实业务。

## 2026-10-08 文档交接

用户本轮要求整理文档，将在新任务继续；本轮不启动开发者工具、编译、云查询、部署或业务操作。核main/master/HEAD为d2f719e、index空及原dirty，保留17份配置/候选/QR等保护输入的SHA基线。仅补齐原10-05最后证据与新任务导航，不改写历史失败或把历史测试当10-08新跑。

最后交付为d2f719e（6个任务文件），10-05远端闭合记录在`tmp/devtools-recovery-20261005-06/delivery.json`。提交后的重新签名不能跳过源码门禁：本根refresh退出2写source challenge，之后official ui:iterate在锁内编到launch，compile、refresh-after-compile、capture均退出0，总42.43秒；`png/simulator-frame/scheduleCachedPollingSilent.png`绑定d2f719e、主控亲看、实际SHA/长度和清理/异常核通过。这是24张不同状态、冷启后3张以外的第4张复拍，原图/回执/marker资料均未覆盖。

当时Computer Use坐标因非目标ChatGPT窗口被拒绝，激活后画面仍错配，停止输入；没有点击Codex或将错配图当编译证明。接续通过官方入口完成，不需要用户承担恢复。图与应用运行证明来自已签名DevTools和上述回执，不来自控制工具错配画面。独立Luna回执审计在`tmp/devtools-recovery-20261005-04/receipt-audit.md`，原reviewStatus与严格尺寸边界保持原值。

新任务按AGENTS→current→paused-plan-status交接节定位目标；用实际main、保留dirty，查看相应12项日志后再实施。本轮文档修改/提交会改变Git快照，10-05会话及端口不得视为跨日仍有效；先核来源/身份/SDK/宽度，Git变化按challenge→明确官方编译→refresh，不手改回执，失败按[故障手册](../../tools/weapp-ui-troubleshooting.md)定位并保存全新ignored证据。最新历史入口是recovery-06会话，04/05只留证据，不能原样重跑写死日期/目录的旧采集器。

DevTools恢复、24状态及4张复拍不闭合整个计划。完整七日/≥100合格调用与来源版本、后台事件实收、真实权限/事务、320/390/字体/原生交互与手机、低端性能、实际部署/发布仍按[12项详细状态](../paused-plan-status.md)保留；第1截至10-10 02:32:05上海的门槛不顺延，定时任务不恢复，续费仍暂缓。新任务的动作授权以用户与现行规则为准，不从历史一次性部署或旧工具快照扩大边界。
