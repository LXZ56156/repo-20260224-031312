# 2026-10-03 离线微信分析报表口径修复

结论：总计划第3项中的旧报表口径遗留已完成本地修复。现成manifest的164份成功JSON可按明确日期窗口重算；30日和7日报表共178个聚合值逐项等于本轮已核查的 `tmp/audit-20261003-data/summary.json`。10月2日未完成日输出missing/null，未写成0。未请求API、取token、覆盖原始数据或既有报告，未commit/push。

工作位置 `D:\projects\badminton-miniapp\main`；branch `master`，HEAD `b571c68754e964e1a73800645f68a49d99f40f41`。开始读取main/AGENTS.md、current、使用分析报告、总计划与工具文档；既有多人脏树全部保留，仅修改本任务归属文件。

## 实现与兼容决定

- 新 `scripts/we-analysis-report.js` 仅接受精确manifest或精确JSON文件列表，以及begin/endExclusive/latestComplete；无目录扫描、联网、secret读取或业务数据库处理。
- 旧 `scripts/analyze-we-data.js` 保留文件名作为新CLI的薄别名。无参数退出1并说明需显式输入；旧CSV扫描、错误经营结论和自动输出行为停止，不提供会继续误算的兼容模式。用法正文集中在 `docs/tools/we-analysis-local-script.md` 尾部。
- manifest使用results/retries/additional的成功请求；失败后成功重试有resolved记录；重复成功项/重复文件/同type重叠请求失败。每日只允许单日，月必须完整自然月，周必须七日；metadata或raw日期/列表错配失败。画像不同窗口可重叠但独立保留，绝不相加。
- 日UV/页面UV/分享UV均为人天；UV、session和pagePV各按对应分母加权。D1/D7/D14只收成熟且key0/目标key均有数值的队列，汇总人数后求比率；missing与immature分开，无分母rate为null。
- 页面分享与dailySummary全局分享分开。周期去重访问、画像和周期留存独立放periods；周期留存标maturity_not_evaluated，不由原始未成熟0推导结论。
- 总体/指标status、逐日值/权重、留存队列分子分母、输入SHA-256和窗口日原始聚合支持复算。缺失字段不补0；partial值仅为已知子集。输出目录必须新建，不覆盖已有目录。

## 真实数据复算

输入：`data/we-analysis/audit-20261003/fetch-manifest.json`。manifest SHA-256：`6e1d7e1b97fbbddf83d1111f4afe6169dda1f400125b368cbb69b3acbca60598`。清单171个attempt（results169+retry1+additional1），164个成功文件、7个失败attempt；其中9/9的61504已有同请求成功重试，5个10/2日指标61503和1个无效画像窗口61501仍单列。未从目录发现额外文件。

| 项目 | 30日9/2–10/1 | 7日9/25–10/1 |
| --- | --- | --- |
| status | complete | complete |
| PV | 45505 | 12258 |
| UVdays | 2586 | 682 |
| sessions | 10116 | 3074 |
| 全局sharePV | 402 | 110 |
| 新客D1 | 141/1397，29队列 | 41/330，6队列 |
| 新客D7 | 40/1067，23队列 | rate=null，0成熟队列 |
| 新客D14 | 23/733，16队列 | rate=null，0成熟队列 |

178项对齐包括每窗口9个访问/加权/分享指标、两类留存各3个lag的numerator/denominator/rate/matureCohorts、14个页面各4个PV/UVdays/加权停留/分享字段。10/2单日另验：status=missing，PV/UVdays/shares=null。

新产物（ignored tmp，旧报表保留）：

- `tmp/analytics-report-repair-final-last30/report.json`，SHA-256 `4138c6cf146fd054fb0a18d8b89b6e19673f9aa54aefc51a4bd23396de5ccba3`
- `tmp/analytics-report-repair-final-last7/report.json`，SHA-256 `2e09571198b3c9168ceb09291e08a47880e44e1199f5dc9b42e282a5d9abda48`
- `tmp/analytics-report-repair-final-incompleteDay/report.json`，SHA-256 `e0a955c08a0b343b7c2703304ffb355f8aef328d0b25db5ae376404e79b70569`

前两份latestComplete=20261001/endExclusive=20261002；第三份begin=20261002/endExclusive=20261003。各产物含生成时间，因此重跑内容hash可不同；所有输入hash与逐项证据保持可审。

## 验证与边界

- 测试先行：直接测试先因新模块尚不存在而失败，随后实现。`tests/we-analysis-report.test.js` 7项覆盖目录旧文件不参与、UV/session/pagePV加权、成熟/缺key队列、61503/缺字段、成功重试/重复、日期错配/重叠、已有输出目录拒绝和旧入口无参数拒绝。
- `npm run test:affected -- scripts/analyze-we-data.js scripts/we-analysis-report.js tests/we-analysis-report.test.js docs/tools/we-analysis-local-script.md` 计划为full=true（新脚本未映射）。该全量选择由主控最终整合全量承担；不是宣称本子任务已经执行全量。
- 再按直接测试文件先计划后 `npm run test:affected -- --run tests/we-analysis-report.test.js`：7通过，0失败/跳过。
- `node scripts/run-eslint.js scripts/analyze-we-data.js scripts/we-analysis-report.js tests/we-analysis-report.test.js` 实际runner忽略路径参数、执行全树：0错误35警告，均非本任务文件。`git diff --check` 通过，仅提示既有文件及旧入口的CRLF转LF。
- 不触及current/总计划、线上配置、前端/云函数；本工具不验证自定义事件后台配置/实收，不完成第3项线上留痕闭环。latestComplete须由操作者提供已核实值；周/月留存成熟计算、趋势/因果解释和业务转化不在本次实现范围。
