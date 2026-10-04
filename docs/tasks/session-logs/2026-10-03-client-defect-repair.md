# 2026-10-03 三项客户端缺陷本地修复

第4项的设置草稿/重试、赛程迟到身份和错误页返回首页已完成本地实现与离线回归。页面结构、WXML/WXSS、文案和视觉未修改；尚未获得真实 DevTools 图或手机慢网/页面切换验收，不能宣称完整 UI 验收或线上修复完成。

## 改动与边界

- `settings/index.js` 按名称、场次、场地、分制、结束类型/目标与最近远端表单基线比较，保留同一草稿赛事下真正修改过的字段；未修改字段继续接收远端变化。名单、权限、赛事状态、人数门禁、容量和选择约束始终来自新远端赛事。状态变为非草稿或赛事/模式/预设切换时展示对应远端表单。
- `settingsViewModel.js` 基于可选草稿值重建现有选择、推荐与索引状态；不会用本地草稿冒充远端 settingsConfigured/checkStartReady。首次保存前的自定义场次也不会被默认推荐覆盖。
- `settingsActions.js` 在单次保存入口固定 payload 与 clientRequestId；失败后的重试使用该完整快照，普通赛事同步不再清除重试。用户主动点击新保存时捕获新输入并生成新 ID。每次重试仍核对当前管理员权限、草稿状态、人数/最大场次门禁，不能靠旧快照绕过权限。
- `schedule/index.js` 使用现有 auth.login 恢复迟到身份，身份变化重新计算当前赛事权限/录分入口。onHide/onUnload 及 hide/show 之间通过活动标识与代次拒绝旧身份响应。补 `goHome()` 调用共享 nav.goHome。
- 未修改共享 cloud/growth、未写生产业务数据、未部署/upload/发布或 commit，保留其他代理与用户既有修改。

## 验证

- 直接测试先行：最初9项中6项复现失败、3项通过；最小实现后9项通过。复核发现“首次保存前自定义场次被默认推荐覆盖”，新增直接用例先复现9→2的失败，再补一行默认推荐条件。最终新增直接覆盖共10项通过。
- 先运行 `npm run test:affected -- <4个实现路径>` 审阅计划，再 `--run` 带4个实现路径及2个直接测试路径执行：215通过、0失败、0跳过；其中包含共享同步合同与既有settings/schedule覆盖。此批次早于最后一行默认推荐条件修复。
- 最后一行修复后，直接新回归、settings ViewModel/快捷选择、幂等请求ID及保存后开赛聚焦的6文件聚焦复跑：41通过、0失败、0跳过。
- 保存防重/幂等ID/超时不重入/保存后开赛聚焦既有4文件：41通过、0失败、0跳过；直接证明重试内容修复未破坏现有写入守卫。
- 最终针对4个实现文件与2个新测试文件ESLint：0错误/0警告；`git diff --check`通过。新测试初次lint有3处structuredClone全局声明错误，改为globalThis.structuredClone后已通过。
- 测试输出中的缺少wx storage/cloud mock、avatar API不可用等诊断不代表真实生产调用；测试使用本地 stub，相关测试结果均通过。
- 未跑本阶段独立业务全量测试（主控统筹其他并行实现后的最终全量）；未真实DevTools截图、真机慢网、用户人工验收，未上传/发布。

## 后续验收

已完整读取 `docs/tools/weapp-ui-acceptance.md`。需在当前源码真实小程序中验证：编辑期间成员变动/切后台回来不吞草稿；失败后改输入再点重试仍提交原操作，主动保存提交新输入；慢网冷启动迟到登录恢复录分权限，离页不迟到更新；错误态返回首页可用。真实身份及业务写入测试仍须主控按用户授权边界准备具体方案后取得该项授权。

## 2026-10-04 第4项继续与用户同步提示反馈

本阶段起始main/master/HEAD `94912202a1eb33dc832f00d05d9578fee6cb4105`、index空，保留既有private配置、候选、QR、备份与partial。唯一进度正文仍为[12项详细状态](../paused-plan-status.md)，本页保存第4项新增证据。

- 原设置草稿/固定重试、赛程迟到身份与返回首页修复仍在。Luna只读发现协管撤权后旧重试按钮仍显示、点击静默返回；Sol加两条直接红绿，只在applyTournament获撤权时清重试、失败刷新后仍可管理才登记重试。保留新草稿及原payload/request ID，恢复权限不会复活旧重试，主动保存使用新输入/ID。RED7通过/2失败，GREEN9/9；审31文件full=false计划后affected151/151、目标lint/diff exit0。证据 `tmp/client-four-revoked-retry-20261004-fix/`。
- 默认签名会话旧PID/监听已消失，原回执SHA保全。现有包装CLI只读status exit0/loginExpired=false、版本比较skip_check；不据此宣称版本门禁通过。按已有同范围前台预热授权，仅一次官方ui:prewarm新根 `tmp/client-four-native-next-20261004-1930/`：实际上海19:06:19开始、19:07:30终态，exit1/Wait timed out after60000ms，无新session、旧回执不变；目录后缀不是实际时点。另一次MCP携0.3.11版本status真实tools/call120s超时，不是已证登录失效或401，不重登/重试。Sol同包装cli.bat --help353ms/exit0证auto注册；失败CLI仍挂起、AUTO等待回调且新automation端口无监听，与尚未完成的AUTO RPC一致，具体IDE内部原因未证。只读诊断 `tmp/client-four-cli-diagnosis-20261004/`；未关闭用户窗口/进程、改安全设置、提高timeout、换图源或手造签名。原生/手机验收未完成，保存后完整退出DevTools再新预热的恢复动作尚未执行。
- 用户追加iPhone照片反馈，要求正常使用时轮询/降级警告不暴露，同时查明频繁降级。照片证明该状态曾显示，不证明网络链路、错误码或安装版本；版本已提问，实施不依赖答复。Sol仅改syncStatus与两直接测试：8页线上同步实现状态静默，真实离线保留业务提示/刷新；内部fallback标记、诊断及数据应用保留。RED43项38通过/5预期失败；GREEN43/43、lint/diff exit0。affected full=true，最终组合全量见下段，子代理未重复。证据 `tmp/silent-sync-status-20261004/`；稳定规则见[错误规范](../../specs/user-facing-errors.md#后台同步状态)。
- Luna只读核与Sol直接RED确认监听两缺陷：API名含realtime/reportRealtimeAction的网络错误被当永久不支持、停止既有恢复；底层源缺代次，旧/同步回调可覆盖新监听或轮询及恢复计时器。9条新直接用例原实现全失败，最小修复后9/9、watch及消费9文件47/47，目标lint/diff0；新文件no-index检查1/零诊断只表示新增差异。原件 `tmp/watch-fallback-repair-20261004-fix/` 保留，最终组合全量见下段。只读报告 `tmp/frequent-watch-fallback-20261004/readonly-root-cause-20261004.md` 如实保留曾广搜tmp的检索偏差；匹配只为合成network夹具，未再扩大检索。不把可复现本地原因冒称照片首次错误的已证根因；无对应iPhone原始错误码，线上客户端仍未改变。

最终组合共享验证已完成：8文件/303测试的affected计划full=true/cloudCommon=false/uncovered0（`tmp/client-four-final-affected-20261004.json`），主控亲读新collector再执行一次npm test，上海19:30:10.597–19:31:08.290；1713项1707通过/6跳过/0失败取消todo，npm child及collector outer均0，唯一spec摘要。8源、HEAD及全dirty前后SHA保持，stdout261138B/SHA55fbbf468bd81e582c88f48228695caf3f43c31997451b3645c34ae94088b068、stderr0B。新 `tmp/client-four-sync-root-20261004/` 保留脚本/计划/原日志/完整回执；只读冷核 `tmp/client-four-sync-cold-20261004/cold-review.md` 绑定各阶段源码与log/receipt，无新可达P0/P1。未重复全量、check或无关测试，未升级依赖、部署、上传发布或写真实业务。第4手机/原生验收及照片首次SDK错误码仍未完成；线上客户端未改变。


## 10-05 截图复核接续

本轮实图、合同修复、全部失败、测试回执及当前未验项统一见 [原生截图复核](2026-10-05-native-screenshot-review.md)。本节仅补接续入口，不改写上方历史结果或本项业务/验收合同；唯一逐项状态仍见paused-plan-status正文。
