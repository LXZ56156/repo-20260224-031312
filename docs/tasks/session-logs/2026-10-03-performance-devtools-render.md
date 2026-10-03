# 660场真实DevTools渲染复核

主控使用当前main/master/b571c687、已验证的2.02.2609292/SDK3.17.3/390px签名会话实际执行；只运行本地合成fixture的Page方法，不部署、不上传、不写真实业务数据。第10项真实DevTools数组数据路径已取得证据，手机性能整项仍未完成。

## 原计量探针失败保留

`tmp/authorized-ui-after-install-20261003/performance-devtools-real-20261003/receipt.json`记录首次失败：安装setData包装后函数引用比较不相等，恢复比较也失败，尚未执行applyTournament。原脚本SHA256 `9136dc451aacf983e229f95e3680e53de607834ef4eec95bc12dedd5b997a899`及逐字节备份保留。中性launch页面重建、断开及释锁均成功，不宣称原方法恢复比较通过。初版receipt预填的applyTournamentCalls不能作为已调用证据。

后续只读检查显示当前真实Page的setData连续两次读取也不是同一引用，且无自有descriptor；这解释了引用相等检查不适用于该对象，但不据此断言原生实现细节。停止包装/defineProperty路线，没有继续扩展兼容器。

## 独立render-only实际执行

新脚本`tmp/authorized-ui-after-install-20261003/performance-devtools-render-only.cjs` SHA256 `4435a9833a000c5d2f5977f5896cf7d1009ad05e806384c70dbf5083a2e08fc7`，无setData替换；主控先读完整脚本，再实际运行--run。新目录拒绝覆盖已有回执；原失败receipt不变。终态exit0、ok=true，收据在`performance-devtools-render-only-real-20261003/receipt.json`，执行日志`performance-devtools-render-only-real.log`，均位于上述ignored根。

每场先验证真实已有身份缓存新鲜、App一致且非合成，才打开无tournamentId的新schedule页面；暂停生命周期与watch，实际断言inactive、syncPaused、watcherAbsent和无ID。既有Page身份只在内存hash比较，未记录原文或伪造身份。真实调用applyTournament每场一次，普通与20字中文姓名均24人、12对、10循环、660场。

| 场景 | callMethod返回 ms | source/data与WXML660计数观察 ms | 含首尾文字完整DOM观察 ms |
| --- | ---: | ---: | ---: |
| 普通姓名 | 238.94 | 1282.09 | 1308.00 |
| 20字中文姓名 | 429.82 | 1532.81 | 1561.74 |

两场实际source及roundsUi的全部660 keys与fixture逐项相同；source/UI首尾队伍文本相同。真实WXML匹配660张match-card，首场round0/match0、末场round109/match659，实际data属性及两个队伍文字分别相同。新长姓名场景真实通过数组路径分批后的完整渲染；这不是只读取stub数据。

前后8项session/source/listener/SDK/viewport/route检查全true，session文件hash保持；两场及最终中性launch重建单页栈成功、断开及释锁成功、runtimeExceptions为0。没有调用业务变更方法，原生setData未替换，身份保持。

## 证据边界与后续

计时为本机Node墙钟，含DevTools自动化传输、轮询及读取，各场仅一个样本，不是手机首屏、读写或渲染P95，不证明改前后提速。这里只检查660节点数量和首尾WXML文本，未逐个比对中间所有WXML文本或验证可见区域布局；全部660 source/UI keys已逐项验证。

逐patch精确字节仍来自独立prepare-only：普通953115bytes；长姓名1054/1044467/399297bytes，每次小于1048576；receipt明确actualPerPatchByteMeasurementVerified=false、nativeSetDataCallbacksVerified=false。与旧基线953030/969的少量差别来自本次fixture结构，不能混写成同一输入。真实原生回调计量、初始滚动/头像回流/筛选完整实图、低端Android+iPhone同场景改前后/P95仍未验证。

此阶段仅新增ignored探针和文档；应用源码未改，沿用最近完整1648项1642通过/6跳过/0失败及定向lint0/0，不重复全量测试。后续仓库文档更新会使截图源码快照过期，下一次捕获仍须challenge→官方编译→refresh，不手改session。

## 真实筛选、缩短与恢复

为关闭仍有价值的数组缩短/筛选门禁，6.1 Sol high准备独立`performance-devtools-filter.cjs`（SHA256 `a79507ae5c5370b56ea8fbde7b40272ea8838ce8de12fe70a32e1de34b88f771`），主控阅读后实际执行。文档更新导致旧绑定过期，先refresh生成challenge（该直接入口exit1、ok=false，属于要求重编译，不冒称通过），官方simulator_refresh status0/result.success=true，再refresh exit0/11checks全true、changedSourceCompileProven=true。日志分别为refresh-filter-challenge.log、official-compile-filter.json和refresh-filter-after-compile.log，均在同ignored根。

真实run终态exit0/ok=true，新回执`performance-filter-real-20261003/receipt.json`保留；只对20字姓名fixture调用一次applyTournament及已有纯本地筛选handler，不替换setData、不制造滚动timer、不访问云头像、不调用业务写入。每步验证原始source660/24人12对、全部source/UI keys、筛选状态、UI轮数和首尾，并等待真实WXML场数/轮数/首尾文本位置吻合。

| 步骤 | UI/WXML场数 | UI/WXML轮数 | 完整DOM观察墙钟ms |
| --- | ---: | ---: | ---: |
| 初始全部 | 660 | 110 | 1597.20 |
| 选首位球员 | 110 | 110 | 591.50 |
| 同球员已结束 | 55 | 55 | 256.57 |
| 清除球员，仅已结束 | 330 | 55 | 653.99 |
| 恢复全部 | 660 | 110 | 1688.87 |

实际既有handler为onMatchPlayerAvatarTap、onPickStatusFilter/confirmStatusFilterSheet、onClearSelectedPlayers；不是模拟物理点击或验证原生弹层。五步source均660，数组缩短后没有多余尾卡，恢复后660/110完整。真实缓存身份保持，inactive/syncPaused/watcherAbsent/noID始终成立，currentRoundFocus timer absent、initialFocusHandled=false。初末8checks全true、sessionhash不变、异常0、中性launch单页栈/断连/释锁均成功。各步骤一个样本，墙钟含自动化读取，不声称P95。

Luna此前独立冷核两场render-only的脚本/helper/fixture/prep/会话hash与660 keys、首尾和清理相符；没有再连工具或输出身份。原生逐patch/回调、自动初始滚动、云头像回流、筛选实际弹层/可见布局以及真机性能仍未验证。当前已关闭的具体范围为真实DevTools分批数组完整、筛选缩短和恢复数据/节点合同。
