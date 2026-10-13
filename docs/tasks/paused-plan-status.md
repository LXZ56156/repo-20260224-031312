# 下一步待修清单与任务交接

状态：2026-10-13。下列七项待处理（含建议与暂缓项）；本文件是新任务接续入口。10-11已验修复在`master/5d61bb2`，10-12测试优先级在`a1fbc59`，均已推送核远端。本次仅整理文档，不增加产品修复或机型实测。

## 新任务从这里开始

1. 读取[项目规则](../../AGENTS.md)与[current](current.md)，核对实际checkout、branch、HEAD及dirty。实际源码/Git/npm工作目录为`D:/projects/badminton-miniapp/main`；保留既有配置、单打候选、浏览器/QR、备份及私有文件。
2. 从UI06开始，一次处理一个问题；先确认复现范围、直接回归和受影响状态，再做最小修改。不要重跑已通过的全套历史检查或恢复旧业务计划。
3. 先测16 Pro等正常机型普通字号，再测更大屏幕。小屏及小屏大字暂缓；正常机型大字按相关性后排。以实际设备/SDK记录机型、宽度、字体和safe-area，已有390/430图不是16 Pro实测。详见[尺寸验收顺序](../tools/weapp-ui-acceptance.md#机型与尺寸测试顺序)。

## 具体待修清单

P1/P2是问题级别，以下顺序是下一步执行顺序；建议项、待复现项与已确认问题分别标明。

| 顺序 / 编号 | 问题与证据范围 | 代码入口 / 下一步 | 完成标准 |
| --- | --- | --- | --- |
| 1 · UI06 · P1 | 水弹层退出动画中SDK快速重开，data已开但内容持续离屏；430普通物理关闭重开已通过。300ms物理命中未验，不能断言用户/线上必现 | [water/index.js](../../miniprogram/pages/water/index.js)的openGameSheet/openManualSheet/closeSheets与[Vant transition](../../miniprogram/miniprogram_npm/@vant/weapp/mixins/transition.js)；核正常/大屏可达性，同时以受控事件定位时序，物理证据不足不阻断独立回归；共用改动需覆盖popup/overlay及npm重建后的补丁保留 | 受控快速重开回归不再持续离屏；普通关闭/重开、遮罩与取消通过。物理快速时序无法可靠取得时单列未验，不用SDK穿遮罩事件冒充物理点击 |
| 2 · UI12 · P2 | 已完赛说明仍称“开始录分”，按钮却是“修改比分” | [matchViewModel.js](../../miniprogram/pages/match/matchViewModel.js)：buildLockHint与lockActionText；同步当前动作说明 | 未完赛仍为开始录分，已完赛说明/按钮一致；权限、锁与操作语义不变 |
| 3 · UI13 · P2 | 无QR降级海报仍显示码区和“扫码查看完整战绩”；隔离拒绝已复现，不等于线上云故障 | [sharePoster.js](../../miniprogram/core/sharePoster.js)、[shareCard.js](../../miniprogram/core/shareCard.js)及金牌背景素材；核实际QR绘制结果，含已烧入素材的扫码区 | 有QR时页脚正确；无QR时没有误导扫码文字/空码区；普通/金牌及并列冠军导出完整 |
| 4 · UI03 · P2 | 修订历史的“更正为2”与“水”仍拆行；主流水数量+单位已修 | [water/index.wxml](../../miniprogram/pages/water/index.wxml)修订历史与[index.wxss](../../miniprogram/pages/water/index.wxss)；保护数量/单位语义原子 | 正常/大屏长历史文案自然换行，数量单位不拆，完整值及ARIA保留 |
| 5 · UI04 · P2优化 | 历史错误提示末尾“试”成为孤字；信息和重试完整，评审有分歧 | 同水页历史错误提示布局；先在正常/大屏复看，优先局部排版调整 | 原因/下一步可读，无裁剪或孤字，重试入口保留；不为换行添加冗余文案 |
| 6 · UI15 · P2建议 | 提交失败原因无法在常驻区持续回看；生产已有Toast/冲突Modal，不是错误原因丢失 | [matchSubmitService.js](../../miniprogram/pages/match/matchSubmitService.js)、[writeErrorUi.js](../../miniprogram/core/writeErrorUi.js)与录分底栏；先评估持久原因是否必要 | 若采纳，原因与重试关系清楚、敏感内部信息不外露；新增产品状态/结构按AGENTS批准边界处理。不恢复“本机草稿已保留”等重复提示；可记为不采纳并说明理由 |
| 暂缓 · UI14 · P2 | 仅320长摘要更正滚到底后再滚，背景被带动约33px；正常/大屏同症状未证明 | 水页game更正弹层滚动归属；不为小屏单独开新批次，若正常/大屏复现再处理 | 复现范围内只有一个滚动owner，背景不动、两侧首行与固定CTA/关闭完整 |

## 已完成基线与必要证据

- UI07比分对齐、UI11完整picker触达，以及头像忙态、赛程空态、对比度、主流水单位、短屏首行、单打完整数据校验和重复草稿提示均已修并验，不再作为待修重复开展。
- 最近完整测试：1862通过/6旧WSL跳过/0失败；check通过、lint0错误35原警告。网络分层合同39通过；不是实际断网/手机云watch。390八图、430九图主控亲看并双评审，最终两scope的10键/SDK/保护缓存恢复通过。
- 本机原始证据根：`tmp/ui-audit-20261011-unlocked/`。UI06读`water-popup-rapid-reopen-analysis.md`；UI14读`native-actions/water320-correction-physical-layout-actions.result.json`；其余按`viewport-review-*`与`native-actions/`检索。文件在本机ignored目录，跨电脑接续需先确认可用，不能把准备计划当执行结果。
- 工具问题独立跟踪：TOOL14/15/16旧批总恢复未验证，TOOL17 SDK错选，TOOL18未响应/错窗根因未知。新会话成功不倒验旧失败；不要把工具错选当产品缺陷。UI采集使用[日常循环](../tools/agent-development-workflow.md)，失败按[故障手册](../tools/weapp-ui-troubleshooting.md)对应阶段处理。

## 外部未验与动作边界

这些是待验条件，不是本次已确认的产品缺陷；小屏暂缓不关闭它们：

- 原1/6：完整七日、≥100来源/版本可靠的开赛调用；真实首次记账、排除测试后的新账本七日首笔率。原截止不顺延、不制造调用凑数。
- 原3/4：后台事件配置/实收、逐ID去重与查询权限；实际断网/慢网、手机首次watch错误与实时恢复。Node合同与静态图不代替事件实收。
- 原5/7/8/11：可信WX身份/角色、真实数组/组合索引、事务冲突与回滚、锁查询/权限撤销竞争、双机与跨设备找回及耗时。收赛相关函数需成组验证，不能单独部署finish。
- 原9/10/12：云runtime/SDK真实日期数值与错误合同；低端Android/iPhone同场景改前改后P95；单打真实云/比赛/手机与当前发布包。正常机型键盘、安全区和相关大字仍未验。
- 原2：续费仍暂不付款；历史空函数代码与线上整环境恢复未验。完整12项标准见[归档清单](paused-plan-status-history-2026-10-13.md#收尾待验清单保留原12项标准)。

完成且通过相称验证后，按AGENTS持续授权提交/推送并核远端。部署、上传/发布、PR/preview/QR、付款、生产规则与真实业务写入需该动作的当前授权；不恢复automation-3，不auth/兑换，不从历史快照扩大授权。10-09远端审计报告结论继续暂不处理。

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
