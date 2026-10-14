# 下一步待修清单与任务交接

状态：2026-10-14 完成审计问题文档整合；以下 UI 交接基于 2026-10-13，用户明确“暂停，更新文档”，实现、验收与工具恢复已暂停。UI06/UI12/UI13及UI03 fixture已随46eb249推送master并核远端；正常屏UI04未复现，UI15不采纳新增常驻区。续做新增UI14最小源码修复及218项关联通过，两个文件仍未提交；新全量未完成且已出现1项失败，不满足交付门禁。保留所有既有修改，未部署、发布或写入真实业务数据。

## 新任务从这里开始

1. 读取[项目规则](../../AGENTS.md)与[current](current.md)，核对实际checkout、branch、HEAD及dirty。原用户电脑源码/Git/npm工作目录为`D:/projects/badminton-miniapp/main`；保留既有配置、单打候选、浏览器/QR、备份及私有文件。
2. 等用户继续后，先核UI14未提交diff、诊断新全量失败并完成其check/lint；再恢复真实DevTools窗口与正确绑定，核当前源码签名后完成402的UI14、大屏及原生控件检查。不重复无变化的旧回归，不恢复旧业务计划；所有隔离/缓存已恢复，无未结束native audit。
3. 先测16 Pro等正常机型普通字号，再测更大屏幕。小屏及小屏大字暂缓；正常机型大字按相关性后排。以实际设备/SDK记录机型、宽度、字体和safe-area，已有390/430图不是16 Pro实测。详见[尺寸验收顺序](../tools/weapp-ui-acceptance.md#机型与尺寸测试顺序)。

## 具体待修清单

P1/P2保留原问题级别。以下是本轮处置及残余门禁；未验不等于通过。

| 顺序 / 编号 | 问题与证据范围 | 代码入口 / 下一步 | 完成标准 |
| --- | --- | --- | --- |
| 1 · UI06 · P1 | 已修共用动画：leave 链去重，按 Promise 身份清理，完成后重放最新 show；不靠延时掩盖缺陷 | [transition](../../miniprogram/miniprogram_npm/@vant/weapp/mixins/transition.js)、[持久补丁](../../scripts/patch-vant-transition.js)、[本地构建](../../scripts/build-miniprogram-npm.js)；Vant 固定 1.11.7 | 9 项真实 bundle 受控回归通过；实际 npm ci、npm 重建保留补丁通过。402 SDK game/manual 约183/121ms重开可见、名单输入通过；物理快速命中、遮罩拦截与大屏仍未验 |
| 2 · UI12 · P2 | 已修：idle 说明与开始/修改动作同源派生 | [matchViewModel](../../miniprogram/pages/match/matchViewModel.js)；其他锁/权限提示不覆盖 | 185 项关联测试通过；402真实 applyTournament 完赛说明/按钮一致，点击进入编辑通过（受控锁响应）。未完赛说明直接回归通过，大屏/真实锁未验 |
| 3 · UI13 · P2 | 已修：以 QR 实际 drawImage 成功决定页脚；无码覆盖奖牌素材烧入的码圈/扫码字；异常恢复 clip | [sharePoster](../../miniprogram/core/sharePoster.js)、[shareCard](../../miniprogram/core/shareCard.js) | 47项关联测试含缺 URL、加载/绘制失败、金银铜、并列冠军。402真实Canvas普通/金牌、阿杰与小林两位冠军无码预览完整；有图码绘制页脚完整。关闭/复制按钮通过，保存仅触发，系统保存结果/大屏未验 |
| 4 · UI03 · P2 | 当前生产投影已有数量单位绑定；旧详情 fixture 注入普通空格绕过投影，已纠正并补 fixture 回归 | [fixture](../../scripts/dev/water-v2-screenshot-fixtures.js)；未重复修改生产格式器 | 101项关联检查通过；402实际详情按钮→getEntry受控响应→decorateFeedEntries链路通过，2水成组换行，原描述/ARIA保留。大屏未验 |
| 5 · UI04 · P2优化 | 402普通字号未复现：末行完整“重试”，两名评审均可接受；本轮未增加文案或结构 | 保持历史错误提示；重试真实按钮可清错误并返回空历史（受控响应） | 正常屏已看/重试通过；大屏孤字复看未验，仍保留原问题，不称全尺寸关闭 |
| 6 · UI15 · P2建议 | 评估后不采纳新增常驻原因区：已有Toast、冲突Modal、比分保留和重试入口，暂无消失提示阻碍恢复的新证据 | [matchSubmitService](../../miniprogram/pages/match/matchSubmitService.js)、[writeErrorUi](../../miniprogram/core/writeErrorUi.js)保持既有行为 | 不新增需另行设计的状态/清理规则，不恢复重复草稿提示。真实云失败与手机提示仍未验 |
| 7 · UI14 · P2 · 未提交 | 源码确认page-meta仅锁历史弹层、漏掉gameSheetOpen；各屏宽共用。已最小加入gameSheetOpen条件，无新增JS状态或触摸拦截 | 工作区[water WXML](../../miniprogram/pages/water/index.wxml)、[直接测试](../../tests/waterSession.ui-copy.test.js)；四种开关组合证明任一打开锁定、全关恢复，关联218通过 | 原320背景约33px证据保留，小屏仍跳过。新全量未完成/1项失败待查，check/lint未跑；新增修复未取得当前源码实图或正常/大屏物理边界滚动、关闭恢复证明，不计完成 |

## 远端审计待修与优化清单

状态：2026-10-14，用户授权整合此前检查发现、更新相关文档并推送；仅文档，不恢复业务修复、工具恢复或原生/生产验收。同步前远端 master 仍为 `1363d0dfccca52d47419d96941ce15f3180f5893`，与本轮检查版本一致。

[10-14 检查正文](../reports/2026-10-14-source-offline-audit.md)保留范围、复现、建议、测试结果及线上限制；[10-09 审计](../reports/2026-10-09-remote-comprehensive-audit.md)保留旧编号、原始公开证据包及历史结论。本表是统一待办，复用 BIZ/FA/EFF/TEL/UI-01 编号，不把旧问题当新增；UI14 只引用上方原条目。ENG/ENV/DEP 为原有工程风险显式跟踪，OBS 为待补证口径，EFF-08/09 为本轮新增观察。

25 个报告条目已全部映射；缺陷、优化、产品目标取舍、风险及待补证分别标注，不把它们统称 25 个新 bug，也不改写旧报告的 18 项历史计数。UI06/UI12/UI13、UI03 fixture 等已修事项不重复登记为新缺陷，其残余原生验收继续保留。

| 统一编号 | 10-14 对应 | 优先级 / 状态 | 问题与证据 | 下一步 / 验收 |
| --- | --- | --- | --- | --- |
| BIZ-04 | A1 | P1 · 待修 | 5 个事务条件更新未带 transactionId；版本条件仍存在 | 同事务文档更新并保留权限/版本/幂等；精确 SDK 请求一致，再在隔离云验证失败回滚 |
| BIZ-01 | A2 | P1 · 待修 | 旧 V1 创建交错覆盖已记账数据，仅兼容写路径 | 原子创建；并发创建/记账交错后记录与版本不倒退 |
| BIZ-05 | B1 | P2 · 待修 | 客户端补偿把较新权威比分覆盖为旧提交意图，不改云数据 | 较新权威版本优先；交错更正、迟到响应、刷新失败回归 |
| BIZ-02 | B2 | P2 · 待修 | 普通加入自动绑定同名 guest，与现行规格冲突 | 按现行不自动绑定合同修正并同步测试；显式认领产品动作须确认设计 |
| BIZ-03 | B3 | P2 · 待修 | 单场幂等完成误报赛事 finished，污染完赛事件 | 统一首次/重试赛事级语义；另有待录场次时不得上报完赛 |
| FA-01 | C1 | P2 · 目标取舍 | 8 人 17 场搭档/对手仅 12/12；对照 28/28，连打 1→2 | 明确覆盖与休息优先级；同预算多 seed 比较，不称无条件更优 |
| FA-02 | C2 | P2 · 待优化 | 12v10、5 场地、24 场强制降级，队内出场 5/3 可改善为人人 4 | 增加降级质量底线/轻量交换；不将强制复现当生产超时率 |
| FA-03 | C3 | P2 · 目标取舍 | 8v8 模板搭档/对手 24/32；对照 32/64，连打 1→2 | 与 FA-01 合并决策覆盖/休息目标，保持出场均衡 |
| FA-04 | C4 | P2 · 待修 | 固定搭档实际每轮 2 人轮空，restPlayers 却为空 | 全量名单减当轮参赛集合；验证奇数对数/多场地/末轮 |
| EFF-01 | D1 | P2 · 待优化 | 历史账本每页全扫描：100 账本 205 次读取方法调用，第二页相同 | 减少串行往返，正确时间游标/摘要；兼顾排序与摘要写放大，不当计费读数 |
| EFF-02 | D2 | P2 · 待优化 | 无变化 game/direct 筛选仍重复 get/listEntries | 版本/序号/筛选水位去重；更正、权限变化、缺页不能漏更新 |
| EFF-03 | D3 | P2 · 待优化 | 锁 status 与 heartbeat 未完成仍继续发新请求 | 按动作在途去重或完成后调度，保留会话清理与 45 秒 TTL 安全余量 |
| EFF-04 | D4 | P2 · 待优化 | 最近赛事 20 条，但访问 125 个赛事后完整缓存仍为 125 份 | 独立数量/字节预算与 LRU；保护草稿、当前赛事、本地战绩 |
| EFF-05 | D5 | P3 · 待优化 | 首页三次排序触发三次远端查询 | 完整持有列表才本地排序，分页和刷新语义不变 |
| EFF-06 | D6 | P3 · 待优化 | DevTools 轮询初始化后重复读一次 | 复用首读结果/promise；不泛化为所有手机频率 |
| EFF-07 | D7 | P3 · 待优化 | 同头像 fileID 三次冷态并发产生三次 SDK 请求 | 按 ID 合并在途请求，保留已有成功/失败缓存 |
| EFF-08 | D8 | P3 · 新观察 | 三次 heartbeat 各做集合检查、赛事/锁读写 | 先量测集合准备和 watch 成本；scoreLockRevision 参与收赛冲突，不可直接删除 |
| EFF-09 | D9 | P3 · 新观察 | 同一赛事/环境两次服务端调用重复生成码并上传 | 权限验证后复用，明确并发去重、失效和环境隔离；费用未实测 |
| TEL-01 | E1 | P2 · 待修 | 3 条 null 耗时被算作覆盖 3、P95 0ms | 仅接受有效数值，missing/invalid 单列；空白/布尔/null 回归 |
| OBS-01 | E2 | 待补证/口径 | 17 字段 activity 与 7 字段 growth 无可靠统一漏斗 | 先核配置与实收，关联/去重/测试隔离/规模维度；合并原 1/3/6 待验，不造新七日通过 |
| UI14 | F1 | P2 · 已有草稿未验 | 远端 page-meta 缺 gameSheetOpen；原电脑有未提交修复 | 只沿上方 UI14 条目续做，不另建修复；远端回归不覆盖本机草稿/物理滚动 |
| UI-01 | F2 | P3 · 待修 | 资料页畸形 returnUrl 触发 URIError，中断初始化 | 安全解码/默认内部路径；覆盖 % 与非法 UTF-8，不扩大跳转范围 |
| ENG-01 | F3 | P2 · 环境待完善 | 新 checkout 缓存/canvas/tmp/shell 前提；6 项 WSL 工具测试失败 | 提供 preflight，区分业务与平台验收；不得删测试或伪装平台全绿 |
| ENV-01 | F4 | P2 · 隔离风险 | develop/trial/release 默认同一云环境 | 真实数据测试前核隔离；当前不改配置/创建环境，不推断已有生产误写 |
| DEP-01 | F5 | P2 · 依赖待评估 | 根扫描 97 条；独立云函数解析树 17 条；26 函数缺函数级 lock | 核实际安装/可达路径，隔离构建凭据并规划升级；非 97 个可利用漏洞，不 audit fix --force |

### 保留观察与验证边界

- TEL-02：继续保留旧输入/人工水位不一致的 **P3 输入防护观察**，不计已确认缺陷。本轮未重新复现；合成显式零不证明真实未成熟 D7 为零，缺 key 仍未知。详见[旧报告](../reports/2026-10-09-remote-comprehensive-audit.md#六tel-02旧输入与人工水位不一致的-p3-防护观察)。后续可加采集时间/完整水位一致性检查，不推翻旧历史固定水位结果。
- 10-14 受控全量 1860 项：1846 通过、6 失败、8 跳过，退出码 1；6 项均为 weapp-preview-workflow.test.js 缺 rsync/wslpath。check 通过，lint 0 错误/35 警告。首轮依赖未就绪失败和排阵超时保留在报告，不称全量全绿。
- 固定远端的 config-only timeout 测试通过，不关闭电脑 UI14 未提交工作区那次未完成全量及未知原因失败。原电脑窗口/源码绑定、手机和大屏门禁未复验。
- 精确 SDK 请求捕获及离线复现不证明生产安装包、真实回滚、实际发生率或费用；真实云规则/索引、事件实收、七日窗口、备份恢复、手机 P95 等沿下方外部未验项保留。
- 后续推荐顺序：先确认 ENV-01 的真实验证隔离前提；业务先 BIZ-04/01/05/03，再 FA-01～04；随后 EFF-01～04 与 TEL-01/OBS-01；BIZ-02 按现行规格修正；UI14 沿现有草稿续做；其他 P3/工程依赖项按风险处理。这是排期建议，不是本次修复授权。

## 本轮验证与证据

- 实际设备回读：DevTools **iPhone 17，402×874，字号16，SDK 3.17.3**，safeArea top54/bottom840；不是16 Pro或手机实测。当前菜单无独立16 Pro项。先验正常屏；430等大屏尚未执行，小屏及小屏大字按要求跳过，正常机型大字/键盘仍未验。
- 正常屏5张正式fixture图及11张native-action图已主控亲看；两名隔离评审均无共同P0/P1或阻断P2。评审认可数量单位/历史错误/完赛说明/扫码降级；无码奖牌下方留白较多可接受，不扩展视觉重做。静态图不证明物理点击/滚动归属。
- UI06直接测试9通过，实际`npm ci --prefix miniprogram`与`npm run mp:npm:build`通过并保留补丁；独立代码复核无阻断发现。关联测试UI12 185、UI13 47、fixture 101均通过。
- `npm test`首次1875通过/6跳过/0失败。lint新增测试常量循环1错误已修，9项直接复跑通过。之后全量复跑41失败，`npm test -- --test-concurrency=4`复跑8失败：含deploy配置Git子进程失败、privacy-api-package、scheduler.scenarios、squad.beam.performance/end-condition/fairness、startTournament.index/logic文件进程失败，日志有spawn ENOMEM/UNKNOWN及V8 Zone Allocation OOM；未称既有波动。相同全套以`node --test --test-concurrency=1 tests/*.test.js`串行1875通过/6跳过/0失败。check通过，最终`npm.cmd run lint`0错误/35原警告。失败文件和计数在下述JSON，保留全部失败日志。
- 原始证据：`tmp/ui-fixes-20261013/`（prewarm/iterate/test/check/lint、`test-failures.json`）；交互图/回执在`tmp/ui-audit-20261011-unlocked/native-actions/fixes13-402-*`，恢复回执`summary-1791868928878.json`、`summary-1791869521824.json`。两次scope的10键/保护缓存/SDK恢复通过，0运行时异常；探针计数不等于真实云调用。图片均来自当前源码DevTools实际Canvas/页面，不是合成画面。目录ignored，跨电脑需先确认原文件可用。
- 有QR只用已有本地码作为隔离绘制素材，未生成真实云码/验当前扫码；完整Canvas PNG本地导出通过。复制文案有原生Toast；保存按钮已触发，系统保存结果未证明，不能计手机相册保存通过。
- 新工具阻断：第二次prewarm后Windows窗口控制返回DevTools标题却显示其他应用像素；fresh selection、NodeREPL重建后activation仍报`failed to activate captured window`，已停止旧坐标。官方项目窗口close未明确成功、open桥接超时/失败，未反复重试/自动auth；窗口恢复和设备切换API不足，已请求用户手动恢复。产品修改后的签名实图已取得；仅交接文档更新后最后一次`ui:iterate`在compile阶段失败（run `2026-10-13T05-49-55-726Z-27320-b5fa9a44`，约31.2秒），未刷新/采集或覆盖final，source challenge保留，最新全文签名尚未完成。新成功不倒验旧工具失败。恢复后先核真实窗口/设备，再按会话协议完成大屏、遮罩、取消、picker和UI14动态滚动。

### 续做后暂停回执

- UI14两个未提交文件仅改背景锁条件及最小直接测试。新断言先红1项，再审阅`test:affected`计划并`--run`：218通过/0失败/0跳过，范围diff检查通过。先前实图/双评审未覆盖这一新改动。
- 启动`npm test -- --test-concurrency=1`后用户要求暂停；暂停后无该执行会话或测试进程，日志停在中途，无最终计数/退出回执。已观察`tests/deploy-changed-cloudfunctions.test.js`中的“configuration-only timeout changes select only their function for commit, range and explicit file baselines”1项失败；未获完整错误详情，原因未知，不称旧波动或资源失败。未继续诊断/复跑，未跑新版本check/lint。日志`tmp/ui-fixes-20261013/continue-npm-test-serial.log`。曾尝试NODE_OPTIONS串行选项，被Node拒绝，未启动该次测试；随后使用上述显式npm参数。
- 一次只读doctor回执`continue-doctor.log`：session/marker/listener/SDK/viewport/route/项目通过，sourceSnapshot=false。脱敏现有bridge诊断`continue-ide-status.json`为initialize-read超时，未获登录/版本状态，不推断Token错误、不auth。官方连接器期间反复不可用。
- Windows控制读到全灰DevTools窗，但下一次项目菜单点击实际落到Codex菜单，已停止该控制路径；没有更改其他项目内容。一次官方CLI项目close/open返回0（`continue-cli-close.log`/`continue-cli-open.log`），随后窗口ID与39452监听PID仍相同，不能证明重开/编译完成。未反复关闭、未强杀DevTools，已请求用户手动“项目→重新打开此项目”。目前暂停，后续需继续指令。
- 本次仅提交暂停交接文档；UI14源码/测试留作工作区草稿，未混入提交。原既有dirty完整保留。无新增fixture隔离、云写入、部署或发布。上述日志均位于`tmp/ui-fixes-20261013/`，ignored本机证据，跨电脑须确认原文件可用。

## 已完成历史基线

- UI07比分对齐、UI11完整picker触达，以及头像忙态、赛程空态、对比度、主流水单位、短屏首行、单打完整数据校验和重复草稿提示均已修并验，不再作为待修重复开展。
- 10-11历史完整测试：1862通过/6旧WSL跳过/0失败；check通过、lint0错误35原警告。网络分层合同39通过；不是实际断网/手机云watch。390八图、430九图主控亲看并双评审，最终两scope的10键/SDK/保护缓存恢复通过。
- 本机原始证据根：`tmp/ui-audit-20261011-unlocked/`。UI06读`water-popup-rapid-reopen-analysis.md`；UI14读`native-actions/water320-correction-physical-layout-actions.result.json`；其余按`viewport-review-*`与`native-actions/`检索。文件在本机ignored目录，跨电脑接续需先确认可用，不能把准备计划当执行结果。
- 工具问题独立跟踪：TOOL14/15/16旧批总恢复未验证，TOOL17 SDK错选，TOOL18未响应/错窗根因未知。新会话成功不倒验旧失败；不要把工具错选当产品缺陷。UI采集使用[日常循环](../tools/agent-development-workflow.md)，失败按[故障手册](../tools/weapp-ui-troubleshooting.md)对应阶段处理。

## 外部未验与动作边界

这些是待验条件，不是本次已确认的产品缺陷；小屏暂缓不关闭它们：

- 原1/6：完整七日、≥100来源/版本可靠的开赛调用；真实首次记账、排除测试后的新账本七日首笔率。原截止不顺延、不制造调用凑数。
- 原3/4：后台事件配置/实收、逐ID去重与查询权限；实际断网/慢网、手机首次watch错误与实时恢复。Node合同与静态图不代替事件实收。
- 原5/7/8/11：可信WX身份/角色、真实数组/组合索引、事务冲突与回滚、锁查询/权限撤销竞争、双机与跨设备找回及耗时。收赛相关函数需成组验证，不能单独部署finish。
- 原9/10/12：云runtime/SDK真实日期数值与错误合同；低端Android/iPhone同场景改前改后P95；单打真实云/比赛/手机与当前发布包。正常机型键盘、安全区和相关大字仍未验。
- 原2：续费仍暂不付款；历史空函数代码与线上整环境恢复未验。完整12项标准见[归档清单](paused-plan-status-history-2026-10-13.md#收尾待验清单保留原12项标准)。

完成且通过相称验证后，按AGENTS持续授权提交/推送并核远端。部署、上传/发布、PR/preview/QR、付款、生产规则与真实业务写入需该动作的当前授权；不恢复automation-3，不auth/兑换，不从历史快照扩大授权。10-09/10-14 审计发现已登记到本页统一待修清单；实施仍暂停，文档整合不代表修复。

## 历史入口

[完整历史归档](paused-plan-status-history-2026-10-13.md)保留原文、失败和证据。以下六个标题仅兼容旧文档锚点，按需追溯，不是新任务待执行清单。

### 10-04按顺序续做：第1项手动观察

见[原观察记录](paused-plan-status-history-2026-10-13.md#10-04按顺序续做第1项手动观察)。

### 10-04依序续做：第2项本机资产恢复

见[原恢复记录](paused-plan-status-history-2026-10-13.md#10-04依序续做第2项本机资产恢复)。

### 10-04第3项本地配置与客户端验收准备

见[原事件准备](paused-plan-status-history-2026-10-13.md#10-04第3项本地配置与客户端验收准备)。

### 10-04依序续做：第5项当前候选

见[原权限事务候选](paused-plan-status-history-2026-10-13.md#10-04依序续做第5项当前候选)。

### 10-04依序续做：第6项首次记账诊断

见[原首笔诊断](paused-plan-status-history-2026-10-13.md#10-04依序续做第6项首次记账诊断)。

### 10-04依序续做：第7项提前收赛

见[原收赛记录](paused-plan-status-history-2026-10-13.md#10-04依序续做第7项提前收赛)。
