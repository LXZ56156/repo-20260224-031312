# 2026-10-03 第10项本地性能基线

结论：已交付真实页面构建基线，并完成赛程setData超限的本地最小内部修复。同一24人/660场合法fixture，普通姓名单次提交由 **1,319,491降为953,030 UTF-8字节（减少27.77%）**，完整660场仍可用；20字中文导入姓名场景分3次提交，每次低于1024×1024字节。精确字节计数增加Node JS耗时，不能称手机性能改善。WXML/WXSS、页面结构、CTA、导航和业务语义未改；真实DevTools/手机验收未完成。

## 真实入口与数据

- 工作目录 `D:\projects\badminton-miniapp\main`，branch `master`，HEAD `b571c68754e964e1a73800645f68a49d99f40f41`；现有脏树保留。基线阶段新增脚本、2个直接测试、本日志和忽略的tmp证据；确认超限后扩展为schedule内部修复及直接回归，未改current。
- 脚本：[benchmark-tournament-views.js](../../../scripts/benchmark-tournament-views.js)。捕获当前源码注册的 Page，直接调用 `schedule.applyTournament` 和 `home.loadRecents`；后者包含真实缓存读取、整文档读取后的normalize、缓存写入、sortItems、refreshVisibleState及英雄卡构建。没有复制或镜像view实现。
- fixture由真实 `startTournament/scheduleModes.buildFixedPairSchedule` 生成；参数经真实 `validateBeforeGenerate`、`updateSettings.validateSettings`校验。固定搭档上限为10循环；当前`getRotationPlayerLimit`只限制6/7/8人轮转preset，固定搭档返回0。本基线选8/16/24人，均低于单次导入60人的限制。每队2名唯一球员，同轮球员不重复，半数场次有合法21:15比分，其余pending。
- 少/中/大：8人、1循环、6场、3轮、2场地、1最近赛事；16人、3循环、84场、21轮、4场地、5最近赛事；24人、10循环、660场、110轮、6场地、20最近赛事。大场景为合同允许的合成上限压力，**没有证据表明真实用户使用此规模**。首页赛事ID唯一，20条符合现有recent上限；其余赛事结构相同。
- 所有姓名、ID、时间均固定匿名合成；未读取生产身份、业务文本、备份或线上赛事。wx数据库只返回fixture；头像无URL，真实头像构建走本地initial fallback；存储在内存Map中，request/downloadFile/callFunction/getTempFileURL明确拒绝外部请求。未调用onLoad、watch、login或真实云API。

## 口径与复现

本机为Node `v24.18.0`、Windows x64、AMD Ryzen 7 7840H、16逻辑CPU。每个场景/页面10次预热，随后100次采样；每次新建Page data及空内存缓存，首页为无缓存首次加载路径。模块加载、fixture生成和Page初始化在计时外；没有强制GC或手机CPU节流，耗时会受JIT/GC/后台负载影响。

正式报告schemaVersion=2：`jsMs = instrumentedMs - setDataCpuMs - ioStubCpuMs`。使用performance.now的墙钟时间，扣除setData替身序列化/赋值及数据库/存储替身JSON克隆；各项原始耗时逐样本保留。首页仍包含真实业务函数和立即返回的数据库Promise调度。它不是CPU占用率，也不是纯设备JS引擎耗时。P50/P95使用nearest rank：升序第ceil(N*p)项。

字节口径为所有setData patch的`JSON.stringify` UTF-8字节之和，重复字段每次计入；报告另列每个patch与字段字节。不是网络实测、实际微信桥编码、IPC、WXML渲染、头像下载、真机存储或手机首屏P95。报告inputUtf8Bytes是fixture JSON输入体量，不能叫网络流量。

```powershell
node scripts/benchmark-tournament-views.js --out tmp/performance-baseline-20261003/round-3 --samples 100 --warmup 10
node scripts/benchmark-tournament-views.js --out tmp/performance-baseline-20261003/round-4 --samples 100 --warmup 10
```

两个目录已经存在，复现时改用新的目录名。脚本拒绝覆盖已存在目录；重用round-4检查返回EEXIST/exit1，原证据保留。每轮含完整匿名`fixtures.json`和`report.json`（逐样本、源码依赖hash、fixture hash、环境、HEAD）。

- 正式两轮：`tmp/performance-baseline-20261003/round-3/`、`round-4/`。
- fixture SHA256均为`ce70f6c878ff5bbfeee922fc275f756bbdd4f180394a35efc3cc9bbb1251d51a`；每场景也记录共同fixtureHash，以及该页面具体inputHash。
- 已加载当前源码+基准脚本hash均为`1d540245c406f9bb047f4c9a2c9f32bb6cad6259e0ee629e7420e9070ce349a1`。JSON报告内保留全部对应文件hash，不靠HEAD代表脏树源码。
- 探索round-1/2为schemaVersion=1，包含替身存储/数据库JSON克隆成本，首页大场景P95约69ms；发现口径混入替身成本后修正并在新目录重跑。旧证据原样保留，不能与正式schema2混读或把69ms当业务构建成本。fixture相同，脚本sourceHash因口径修正不同。

## 正式结果

下表耗时单位ms，前后分别为round-3/round-4；调用次数和字节在两轮100个样本均一致。

| 场景/页面 | JS P50 第1/2轮 | JS P95 第1/2轮 | setData次数 | UTF-8总字节 |
| --- | ---: | ---: | ---: | ---: |
| 少/赛程 | 0.0606 / 0.0670 | 0.1502 / 0.1428 | 1 | 14,788 |
| 少/首页 | 0.0367 / 0.0347 | 0.0822 / 0.0778 | 5 | 1,832 |
| 中/赛程 | 0.3980 / 0.3868 | 0.6035 / 0.6176 | 1 | 171,282 |
| 中/首页 | 0.2583 / 0.2480 | 0.4303 / 0.4434 | 5 | 3,522 |
| 大/赛程 | 3.0937 / 3.2230 | 5.8235 / 6.3869 | 1 | 1,319,491 |
| 大/首页 | 7.0453 / 6.7266 | 9.1947 / 9.0304 | 5 | 9,839 |

大赛程提交中`tournament`字段值366,489字节、`roundsUi`字段值952,063字节（字段名和分隔符另计）。首页大场景输入JSON4,636,721字节，提交列表items值8,401字节；因此只看setData调用数或首页输出字节，会遗漏输入构建规模。

微信[官方api-typings的setData定义](https://raw.githubusercontent.com/wechat-miniprogram/api-typings/master/types/wx/lib.wx.component.d.ts)第250–258行声明“单次设置的数据不能超过1024kB”（2026-10-03读取）。本次JSON1,319,491字节即便按1024×1024=1,048,576字节，也超270,915字节。这是合成合法大赛触及接口合同的直接体量证据，值得最小内部修复；还没有DevTools/真机复现失败，不能称已确认手机卡顿或渲染失败。Node替身刻意不施加平台上限，以保留完整patch测量。

## 已实施的最小内部修复

`schedule.applyTournament`把完整normalize后的赛事存入现有`_latestTournament`；`data.tournament`明确仅为`{name}`渲染投影。迟到身份、筛选重apply、头像重apply、分享及growth改为读完整source。共享同步读取仍优先用`_latestTournament`，远端刷新会替换它，已有确认不存在分支会同时清空source及投影，不从投影复活赛事。

普通patch的精确JSON UTF-8字节低于1024×1024时一次提交；超过时先提交头部及`roundsUi:[]`，清除旧长数组尾部，再按原生`roundsUi[index]`路径分批提交全部轮次。没有分页按钮、截断可见场次或通用传输框架，也未用groupSetData合并规避限制。所有批次同步排队，最后一批原生render callback才安排初始定位及头像刷新，并检查view代次、完整source引用和页面active状态；旧刷新回调、确认缺失、hide/unload都不能启动旧定位/头像工作。

## 改后同fixture两轮与单call证据

```powershell
node scripts/benchmark-tournament-views.js --out tmp/performance-baseline-20261003/after-round-1 --samples 100 --warmup 10
node scripts/benchmark-tournament-views.js --out tmp/performance-baseline-20261003/after-round-2 --samples 100 --warmup 10
```

改前round-3/4完整保留；改后两轮也在新目录。fixtureHash仍为`ce70f6c878ff5bbfeee922fc275f756bbdd4f180394a35efc3cc9bbb1251d51a`，两轮构建修复sourceHash均`121e8257f145babaa8542a7ebe92cfad99c66aa2242f6b0b1ddaf9f6b7c9fd7e`。改后schemaVersion=3保留同一JS扣除口径，增加每样本及摘要`maxSetDataUtf8Bytes`，每个patch仍单列体量，不以总量掩盖单call超限。

两轮完成后，按第3项联调要求在`schedule.onShareAppMessage`首行调用`activityTracker.tournamentShare()`；只记录实际分享hook的paired attempt/result unknown，不声称送达或后台实收。最终源指纹保存为`tmp/performance-baseline-20261003/final-source-manifest.json`，final sourceHash=`8b312efe0d62023c6c33d131e04dba91f7b11353012a854e194211687ccaca91`，与两轮benchmark source相比只有`miniprogram/core/activityTracker.js`和`schedule/index.js`改变。基准测量的applyTournament/loadRecents没有调用分享hook，模块加载本来就在计时外；依此未重复100样本两轮。最终指纹是源码留痕及一次小fixture执行，不是新两轮性能回执；不把benchmark_source冒称最终源码hash。

| 赛程场景 | 改前单call/总字节 | 改后单call最大/总字节 | 改后calls | 改后JS P50 第1/2轮ms | 改后JS P95 第1/2轮ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 少 | 14,788 / 14,788 | 9,713 / 9,713 | 1 | 0.1218 / 0.1078 | 0.2193 / 0.2093 |
| 中 | 171,282 / 171,282 | 122,302 / 122,302 | 1 | 0.9950 / 0.9242 | 2.4184 / 1.4923 |
| 大 | 1,319,491 / 1,319,491 | 953,030 / 953,030 | 1 | 7.0953 / 7.4972 | 9.9971 / 10.1691 |

首页源码未改：少/中/大仍分别5次，总1,832/3,522/9,839字节，每call最大701/2,380/8,690字节。大首页改后P50 6.8242/7.0036ms、P95 9.1653/10.9054ms，波动不代表首页实现变化。

精确JSON序列化及UTF-8计数属于新增真实JS工作，本机大赛程P95由5.8235/6.3869升为9.9971/10.1691ms。这次修复目的为遵守原生单call体量合同，**不是已验证的首屏提速**；不能省略该代价。

额外长姓名直接场景使用24个唯一20字中文名称（addPlayers导入合同按JS length最多20），半数已录比分的scorerName同步为长姓名；没有声称saveUserProfile或所有历史昵称的绝对最大长度为20。输入及回执保存于`after-long-names/fixture.json`、`receipt.json`，inputHash=`c4caefdbe4a809e802e0c1082eff27dffbb37dc9bb95ac8ca5572854e90b77d3`，660场全部保留。3次patch分别969、1,044,467、399,297字节，单call最大1,044,467 < 1,048,576，总1,444,733字节；这是分批安全验证，不能把总量写成已下降到1MiB以下。

## 未完成门禁

真实低端Android+iPhone还需对同一匿名fixture采样启动、构建、桥传输与渲染，并验证该合成上限和常见规模；真实DevTools还需验证数组路径批量提交、初始滚动、头像回流和筛选完整视图。本轮没有前台预热、截图、手机样本、部署或发布。未分解真机网络/存储/渲染成本，不能据此宣布最贵用户路径；首页先测整文档读取与缓存成本，不拆包、投影数据库字段、换同步架构或重做UI。

## 验证与边界

先增加直接测试，再执行affected计划。包含新增scripts路径的计划保守选择全量；经审阅，脚本未接入应用或npm测试基础设施，且主控已有1529通过/6跳过全量结果，本任务按直接测试路径重新出计划后运行：`npm run test:affected -- --run tests/benchmark-tournament-views.test.js`，2通过/0失败/0跳过。测试包装真实Page方法证明runner调用当前链路，验证匿名合法排程、实际setData patch字节/次数及耗时扣除口径；另验证nearest-rank百分位，未用镜像算法替代页面。

定向ESLint检查新脚本/测试无错误无警告，`git diff --check`通过。本任务未重复全量、未执行部署/preview/upload、未写业务、未commit/push；源码lint/check与现有全量状态由主控统一登记。本日志不替代第10项真机性能门禁。

修复阶段新增`tests/schedule.setdata-budget.test.js`真实Page回归，先affected计划再run。改前4项1通过/3失败，其中明确普通660场patch超过1024kB，另两项等待分批/渲染回调实现；不是既有波动。修复后同新回归4项通过，覆盖普通/20字姓名每次实际UTF-8 byte预算、660场完整source/view、长数组缩短与筛选、旧render callback代次、迟到身份、远端version2刷新、分享完整source、头像重apply、确认缺失及hide。

schedule路径affected计划选40文件、181项，首次179通过/2失败：旧头像fixture的setData未执行callback，旧分享fixture直接伪造完整data.tournament。修改这两处最小stub，分别按原生render callback和真实applyTournament初始化；包含新工具/新预算/头像/分享4文件的复跑17项通过/0失败/0跳过。增强远端刷新断言后新预算4项再通过。其余已通过的179项未重复运行；主控负责必要最终全量。修复相关6个JS文件定向ESLint无错误无警告，diff检查通过。

分享留痕接口可用后，先affected计划再复跑预算/基准/分享3文件，最后8项通过/0失败/0跳过；真实Page分享test验证apply无事件、实际分享hook采集paired attempt/result、相同operationId、unknown/DELIVERY_UNKNOWN、不带赛事名，以及report抛错不改变原分享title/path。相关6文件定向ESLint及diff再次通过。最终全量、check及生产门禁由主控登记。

后续留痕scope冷审修复后，主控将同一65文件清单再次计算为`final-integration-source-manifest.json`，sourceHash=`18dfe9feab08fb58e146650f0bf3ee18106ef68e2328df8c18fbebc28b89bf4c`。相对实际两轮测量仍仅activityTracker/schedule不同；这是源码指纹更新，没有新性能样本，不替代benchmark_source。新整合全量1558通过/6跳过/0失败及冷审关闭证据见[主控门禁](2026-10-03-local-stage-validation.md)。

## 10-05依序续做：当前源码本机补测

旧测量保留为旧源码证据。当前schedule JS SHA-256为`3eb333800d88ddd94d6a117172e6368533529e249e8e5748ee8a2440526f26ff`，WXML为`2d6a119680ae2827872774ee1b5d67087802ae7863fb2dcb214f15912a26f9c6`；收赛计数及六份运行闭包源码与旧采样不同。旧报告的Git HEAD对应blob也不同于当时实际采样工作字节，不能凭Git标签还原旧采样源码，不能把耗时变化归因于单一计数扫描。

本轮仅在全新ignored根`tmp/performance-ten-current-20261005/`补一次当前源码计量；原工具、样本及失败证据均保留，没有产品源码/依赖修改。主控全文审四个执行工具和计划，先核35份冻结输入/工具及71份源码SHA，再发root-GO；冻结SHA为`0de4c24bd3eda5870f420bec41c92f2b5e78a5481798affd8da77001ed318cd9`。实际HEAD为`b5523da97f24f2eb7412749cbf0dac945e0f1e29`，相对性能源码ref `136bfda`只有三份文档变化。Windows Node v24.18.0/x64、Ryzen 7 7840H/16逻辑CPU；上海10-05 00:53:04–00:53:12，外层及采样子进程数值exit均0。

复用原runtime/计量/nearest-rank实现及同一匿名fixture，普通660场输入SHA为`14c7094e439b7206ad5c8e1831abd88278e7cdd1f110cd32bb842e0fe5fb65c0`，20字姓名输入SHA为`c4caefdbe4a809e802e0c1082eff27dffbb37dc9bb95ac8ca5572854e90b77d3`。每场景10次预热、100次采样，各仅一轮：

| 当前赛程场景 | JS P50 ms | JS P95 ms | 各patch JSON UTF-8 bytes | 最大patch余量 bytes |
| --- | ---: | ---: | --- | ---: |
| 普通姓名660场 | 8.0142 | 12.1420 | 953115 | 95461 |
| 20字姓名660场 | 13.3977 | 17.1868 | 1054 / 1044467 / 399297 | 4109 |

冻结采样器对200样本实际执行660场source/view、唯一场次键、330已录/330待录及投影断言且进程成功退出；raw每样本记录660计数、公式及patch字节，未保存330/330或全部场次键，离线冷核不能独立复算这些未落盘值。每patch严格小于1048576bytes，长姓名三次合计1444818bytes，不能称总量小于1MiB。相对旧同fixture的头部增加85bytes，对应收赛三字段。JS按`instrumentedMs - setDataCpuMs - ioStubCpuMs`计算；模块加载、夹具解析、Page初始化和完整性断言在计时外，但新增检查仍可能影响后续GC，单轮结果不构成旧/新因果比较或手机提速证明。

raw报告`execution/benchmark-report.json` SHA为`5b3c69d9a1d79209b112688307b4929c9604d1a01d95f51336fa59b4451f6b84`。执行前后35份冻结输入、71份源码、四份旧证据及Node二进制hash相同，65份实际加载源码均在冻结闭包；16份原dirty保全。子进程stderr仅43bytes的`OFFLINE_GUARD`零尝试记录，外层stderr空；这只是Node拦截器范围的证据，不是操作系统断网证明。未调用云/真实业务。主控在`tmp/performance-ten-root-20261005/acceptance.json`独立从200样本重算P50/P95、扣除公式、patch预算及原始流SHA，实际exit0；Luna小报告冷核`tmp/performance-ten-current-readonly-20261005/result-cold.md/json`复算一致，区分执行断言与raw未落盘字段，未追加采样。

预备读取有一次PowerShell不支持Bash花括号的解析失败，改用显式路径后读取成功；没有执行该误写命令的业务代码，原失败保留。`test:affected`只生成两文件六项的计划，本轮未重跑旧测试/全量，也未重复采样、GUI、上传、发布或部署。mock回调同步，无真实微信桥、WXML渲染、滚动、头像网络或手机测量；必要原生及低端Android/iPhone、首屏/云读写/render P95仍未验证，第10整体未完成。
