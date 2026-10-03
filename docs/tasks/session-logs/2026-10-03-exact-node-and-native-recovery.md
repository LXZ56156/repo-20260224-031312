# Node 24.11 离线加载与原生工具恢复

**2026-10-04：用户明确暂停，goal已确认paused、同聊天七日只读观察已改为PAUSED；完整交接见[暂停记录](2026-10-04-plan-paused-handoff.md)。本文以下为10-03执行历史，原active/no progress和下一步条件不自动恢复任务。** 10-03最后后续回合在任何新编辑前读到goal paused，立即结束；当时current未回写，现已补齐。该暂停介入回合不追加为no progress第2回合，也未达到新一轮blocked阈值。

上回合新增18个完整ZIP的实际Node 24.11.0加载及390px重新连接烟测，属于progress；本回合继续核验、落档。实际goal状态为active，保留完整1–12目标。历史blocked记录不删除，也不覆盖恢复后的状态。上一回合末Computer Use收到用户物理Escape停止信号，主控立即停止原生操作并结束回合；本阶段未再次操作原生窗口。

工作目录`D:\projects\badminton-miniapp\main`，master，HEAD `b571c68754e964e1a73800645f68a49d99f40f41`；本阶段开始239条未提交状态。全部既有改动、旧partial、备份和私有配置保留，未commit/push/PR/preview/QR。新增运行工具及证据只在ignored tmp和任务专用WSL目录；应用源码、项目依赖和云配置未改。

## 18个完整ZIP的实际运行

实施代理6.1 Sol high与只读冷核6 Luna max并行，根目录`tmp/isolation-node24110-zip-load-20261003/`；Linux任务目录`/home/lizixuan/tmp/badminton-isolation-node24110-20261003`，新建且不覆盖旧24.13.1证据。真实运行时来自官方Linux x64 Node v24.11.0归档，版本进程和外层验证退出码均为数值0。

| 核验 | 实际结果 |
| --- | --- |
| 完整ZIP | 18/18实际解包并require；114,872成员、657,443,233解包字节 |
| 逐Node进程 | 18份`*-node-process.json`均保存数值exitCode=0及stdout/stderr摘要 |
| SDK与运行时 | 真实wx-server-sdk 2.6.3；Linux x64 Node v24.11.0 |
| 当前源码 | 223个源码成员与当前源码、manifest和原ZIP逐项匹配 |
| 探针范围 | main调用0、网络尝试0、探针内子进程/worker尝试0 |
| 旧材料保全 | 340个原证据/源码/ZIP/manifest前后及当前大小/hash一致 |
| 本阶段工具 | 11个工具前后及当前hash一致，Node二进制前后相同 |

函数为addPlayers、cloneTournament、createTournament、deleteTournament、finishTournament、getMyTournaments、joinTournament、login、manageCoManagers、managePairTeams、removePlayer、resetTournament、scoreLock、setPlayerSquad、setReferee、startTournament、submitScore、updateSettings。复制探针的JavaScript变化只有版本断言；Python参数、路径、数值退出码和保全输出适配另存，原工具不改。

权威证据为该根`handoff.json`、`all-summary.json`、`execution-terminal.json`、18组receipt/node-process/stdout/stderr、`protected-before.json`/`protected-after.json`及工具前后摘要；Luna的`cold-review.json`和`cold-review-summary.md`逐项冷核通过，主控直接读取终态和关键摘要。

- `all-summary.json` SHA256：`8d2b8dca2e7f698dec943d8192561308720db66e04a7ea16324d44163e3fc7b7`。
- 官方归档32,077,964 bytes，SHA256：`46da9a098973ab7ba4fca76945581ecb2eaf468de347173897044382f10e0a0a`。
- 实际Node二进制SHA256：`d918479037f14dc30c8d21df3767a010fe710685373baec7edf680ca8c3edbee`。

18份stderr实际均为0字节。探针清空NODE_OPTIONS，但运行时继承的NODE_NO_WARNINGS没有记录，保持未知；不据此声称DEP0040已修复或没有弃用警告。历史24.13.1警告及旧Windows构建前工具SHA缺口仍保留。

这关闭的是本机官方上游精确版本的离线加载缺口。`cloudPlatformRuntimeOrDeploymentVerified=false`：CloudBase定制引擎、真实身份、权限规则、事务/竞争、索引、wire date/int64、超时和云部署均未验证；不将同版本号视为平台验收，不升级生产依赖。

## 冷核发现的P2回执错误与派生修正

原`prepare-exact-node.py`在写入流的with块内读取stat/hash，文件尚未flush/close；原`official-download.json`错误记录SHASUMS256.txt为0字节和空文件SHA。原记录与原脚本均保留。实际文件为2,967字节、SHA256 `ee1afe484a32496fd72c22f02acc80e28e6af559491b46cdfbd1c7a3922c42bd`，其中归档条目与上表实际tar摘要相同；原脚本的tar断言发生在关闭流之后。

实施代理另存`official-download-corrected.json`与`official-download-correction.json`，明确标为运行后的派生修正、说明原始错误和HTTP状态来自旧记录；不是再次下载的回执。修正前后原100个证据文件逐hash不变，11工具清单亦不变。另名`prepare-exact-node-future-fixed.py`将采样移至close后，仅语法编译通过、未执行。没有重新下载，也没有重跑18包；Luna复核实际文件和条目匹配。修正回执SHA256 `a12652a6c36673747a45858d79bda8f839be7c524939d3187eabef612775b9a3`。

## 开发者工具恢复与390连接烟测

当前Computer Use插件26.930.31730的官方`@oai/sky`初始化成功，旧asset写入失败成为历史故障。原生实际窗口出现欢迎页/项目页两个窗口，截图像素与所选窗口的可访问控件树不一致；一次坐标动作在输入前被工具拒绝，未点击ChatGPT窗口。点击设备文本未证实展开或切换设备。没有手改systemInfo、缓存或签名，没有关闭/杀掉开发者工具。320/430仍未取得，不能以控件树或旧图补验。

开始时旧automator及HTTP监听均不在；官方预热依次留下三个独立证据：

1. `prewarm-390.log`，40400：终态exit1，HTTP端口未就绪；未生成签名。
2. 官方只读状态`official-status.json`实际exit0/ok、loginExpired=false，HTTP监听随后就绪。`prewarm-390-ready.log`，40401：终态exit1，automator响应超时，原生仍显示欢迎页；不把超时当仍在运行，也不因观察超时盲目启动新任务。
3. 官方已有`simulator_refresh`对exact main执行，`official-explicit-refresh.json`实际exit0/ok/success，AppService项目内容已加载。之后`prewarm-390-compiled.log`，40402：实际exit0，签名`session-390-compiled.json`，main/master/上述HEAD、SDK3.17.3、window390×671。

三个启动只在实际外部就绪状态改变或明确终态失败后推进；失败日志/未生成会话事实保留。环境变量在命令finally清理，endpoint由签名派生，未手填。证据根`tmp/authorized-ui-native-20261003/`。

该签名下仅运行`tournamentListLoading`一个连接恢复烟测，使用新`finals-connection-smoke`/`runs-connection-smoke`输出根。主控直接write_stdin原执行句柄60757，权威工具返回chunk_id926c64/数值exit_code=0、`captureExit=0`。稍后另存`capture-terminal-root-observation.json`明确派生/来源/非同时原始回执；manifest与capture日志自身没有数值退出码，不把其ok字段当OS退出码。PNG 37,533bytes、476×1026、SHA256 `9bb94b1960760959cf7c49f97af67e0fce741e6a3bb4b62b25c1a9cae547cfca`；14项receipt checks全部true，capture/evidence/machine/fixture cleanup/storage cleanup通过，runtimeExceptions为空，horizontalOverflow=0，promotion committed。主控打开原PNG，确认标题、找回说明与“正在查找比赛…”加载态正常显示。

原机器receipt的reviewStatus=pending保持不变；人工结论写在本文。frame的pageGeometryVerified=false、systemChromeNoise=true，像素尺寸不能冒充页面宽度或真机证据。实际pageSize390×753与window390×671分别记录；此次证明已恢复的390连接/截图路径，不是整套UI通过。旧各轮图片、receipt及partial未覆盖。

Luna另核唯一manifest、final/candidate字节及来源绑定，`connection-smoke-cold-review.json`通过上述受限范围；不能把机器通过解释为没有日志错误。runtimeConsole实际保留1条getMyTournaments错误（-501000/FUNCTION_NOT_FOUND）和1条wx.getSystemInfoSync弃用warning，runtimeExceptions为空是另一项计数。当前调用找不到找回函数，找回云链路未验；未核环境部署原因，不据此部署或隐去错误。

只读诊断`connection-console-diagnosis.json`定位当前源码onLoad→loadList→tournamentRecovery.getPage→cloud.call('getMyTournaments')，与自动初始列表读取报错一致。记录中无fixture method调用/错误和storage写入，状态hash不变且清理成功，但没有逐阶段时间，不能断言异步错误发生于fixture哪个子步骤。前一轮`finals-png-gate`同route/390回执已有相同缺函数代码及弃用warning，不把复现当成新增源码回归。当前`core/systemInfo.js`包装使用getWindowInfo及静态fallback、没有getSystemInfoSync；仓库Vant生成依赖有直接调用，但本route不引用Vant、运行日志无warning stack，具体运行调用者未知。未改生成依赖或伪造云成功，未新调用云。

## 阶段验收与仍未完成项

运行时及连接烟测为新证据；本阶段没有应用源码或项目依赖变更，不重复已通过的1648项全量（1642通过、6跳过、0失败）。future fixed准备脚本仅语法检查，真实云和手机测试未执行。文档核验另在本日志末记录，文档变化后当前sourceSnapshot签名需按[工作流](../../tools/weapp-ui-screenshot-workflow.md)challenge/编译/refresh，不能手改旧签名。

按[总计划完成性审计](2026-10-03-plan-completion-audit.md)保留原1–12验收：第1七日/至少100调用；第2暂不付款及整云/异地恢复；第3后台实收与7日首笔；第4/7/8/10/11真机和必要尺寸/交互；第5/9真实隔离身份/规则/引擎；第12真实需求与全链路仍未闭合。未付款、云部署、客户端上传/发布或写真实业务数据；这些动作须具体证据后逐项授权。

阶段文档冷核：6份文档100个相对本地Markdown链接均存在，current为33行；最新active/12项未完成与历史blocked区分，CloudBase/320/430/真机未被误称通过。证据`tmp/authorized-ui-native-20261003/stage-docs-link-check.json`。主控git diff --check退出0；Git另提示三个既有文件CRLF未来转换，未因此改文件。阶段开始239项、本轮新增本日志后240项未提交，分支/HEAD不变，原部分/备份不覆盖。

## 后续安全入口复核：no progress 第1回合

上一goal回合完成证据落档、console来源/旧回执比较及文档核验，为progress。本回合重新读取current、master/上述HEAD、240项未提交；没有新EnvId、免费资格、微信身份、真机、单打场景或付款决定。按原12项审计保留全部缺口；不存在真实后台/设备证据时不以再跑离线测试关闭它们。

在新的继续回合，仅按已批准的前台恢复范围检查官方sky实际窗口。库存仍有项目窗口24578902和旧窗口2822978；两个get_window_state均明确返回minimized。未恢复旧窗口，按工具提示只activate项目窗口、get_window刷新对象、再get_window_state；可访问树标题/菜单属开发者工具，但返回截图是另一个应用，不能据其像素确定设备入口。主控未点击菜单/设备/坐标、未关闭窗口、未使用该其他应用内容、未保存或加工这张错误来源截图。此前物理Escape在其发生回合已立即停止，本回合并未重复收到停止信号。

仅恢复前台并未获得320/430或任何新验收通过；这次是故障复核，按no progress第1回合记录，goal工具仍active。没有把签名文件或计划中的未来heartbeat当作当前存活执行；旧截图任务已terminal，不重启捕获。当前文档已变化，后续合法capture仍需工作流刷新。免费环境/身份、正确原生来源与真机、真实需求/七日观察、付款及生产动作的原条件没有解除，未变更目标或执行外部后果动作。

6 Luna max按current和逐项完成性审计窄审，未发现尚未准备且可直接关闭原剩余门槛的已授权本地动作，12项缺口逐项保留；只读结果`tmp/authorized-ui-native-20261003/remaining-safe-action-audit.json`。第1项未来heartbeat继续按既有安排收集真实日志，但尚未首跑，不称当前verified wait。子代理goal返回null仅限子代理范围；主控已直接get_goal确认active，不把该null解释为根目标丢失。当前无应用变更，未重复npm测试；文档diff检查通过、current仍33行。
