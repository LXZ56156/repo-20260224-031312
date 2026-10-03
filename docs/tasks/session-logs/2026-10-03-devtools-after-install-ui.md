# 新版DevTools真实验收接续

2026-10-04用户已暂停全部计划执行，goal paused、七日只读观察PAUSED；本日志仅保存10-03实际截图/失败/修复证据，不继续预热、切设备、capture或业务操作。[完整暂停交接](2026-10-04-plan-paused-handoff.md)。原生最后返回其他应用截图、320/430和手机仍未验；旧签名不能因文档更新继续沿用。

最新[原生控制与390连接恢复](2026-10-03-exact-node-and-native-recovery.md)：新版@oai/sky初始化成功，但多窗口像素与可访问控件树不一致，未切到320/430。官方状态和exact-main refresh后，新签名`session-390-compiled.json`预热exit0；单独加载态连接烟测实际终态exit0、37,533bytes/476×1026、14检查/清理/promotion通过，主控亲看正常。runtimeConsole另有getMyTournaments不存在错误及wx.getSystemInfoSync弃用warning，不声称云链路通过。机器reviewStatus=pending保留，frame像素geometry未校验，不替代整套尺寸/真机验收。用户Escape已停止上一回合原生操作，本阶段未再次操作；旧失败/图/签名不覆盖。文档改动后后续截图按工作流刷新源码签名。

最新用户要求“自己解决”后，frame压缩大小误拒已[正式修复及重拍](2026-10-03-self-resolved-gates.md)，工具50/50、全量通过；主控新加载态实际capture/evidence/machine/cleanup通过并亲看，37,676bytes/484×1042。小于20KB由直接测试覆盖，新图不冒称小图；window390×671，frame比例仍未校验。下文“提案待答/未应用”是此前阶段历史，不能覆盖新代码状态，旧失败图/receipt原样保留。

最新另取得[设置页实际输入保护](2026-10-03-settings-real-input-protection.md)：真实InputElement.input/bindinput、后台合成apply后草稿名称/11分保留，baseline15分/5人更新，初末来源绑定8/8、清理成功。没有保存、原生替换、截图或实际云身份验证；不替代下文视觉/必要尺寸/手机验收。

最新第10项已另取得[普通/20字姓名各660场真实Page与WXML渲染](2026-10-03-performance-devtools-render.md)回执；首次原生计量失败保留，render-only不替换setData，逐patch/原生回调及手机P95仍未验证。下文早期“待修复/待刷新”按阶段保留，最终布局结论以修复后真实复核段为准。

安装后的AppService等待修复已在真实工具中通过：版本2.02.2609292、SDK3.17.3、main/master/b571c687、390px。39473新端口预热只启动一次；就绪5次probe、3407ms，实际app对象可用后绑定nonce，八项来源/监听/SDK/宽度/源码检查全true。session在tmp/authorized-ui-after-install-20261003/session-390-readiness.json；启动和原失败日志保留。未付款、部署、上传、发布或写真实业务数据。

## 已取得的真实状态图

App.captureScreenshot原始simulator-frame，final在tmp/authorized-ui-after-install-20261003/finals-readiness/simulator-frame。批次唯一manifest在同根runs-readiness/simulator-frame。首轮1 settings、第二轮5 matchError/schedule/shareDraft/shareRunning/shareFinished、第三轮3 scheduleManualFinishReady/Busy/Finished、第四轮5 lobbyCoManagerOwner/OwnerBusy/Member/Revoked/settingsCoManager，均exit0、capture/evidence/machine=true、promotion committed；PNG现存hash匹配，runtimeExceptions=0、fixture和storage cleanup=true、cleanupError=null。

主控逐张打开原PNG：设置字段和只读状态可见；录分错误保留草稿并有重试；赛程/分享区无肉眼遮挡或横向溢出；提前收赛动作与busy禁用清楚，结束摘要明确“已完成1场，取消1场”，已录21:17保留、余场标已取消。manualFinish按钮真实geometry高度53.9966px，继续录分43.9966px（约44px渲染舍入）。协管授予/撤销不同角色和设置保存状态图已看，但协管按钮在首屏下方，不能据首屏证明按钮视觉通过。

Luna只读复核settings session/manifest/receipt一致、271源码快照文件hash和PNGhash匹配、14receipt checks全true；只写ignored settings-evidence-cold-review.json。工具receipt.reviewStatus仍pending，人工结论在本文，不手改机器receipt。frame pageGeometryVerified=false/systemChromeNoise=true，不能按页面比例换算截图，也不冒充390/320/430等比或真机。

## 两个实际布局问题与修复

协管owner的真实row/button均约347px，名单被全局button.btn的100%宽挤占，row高181/127px。代理已[局部修复](2026-10-03-coadmin-layout-real-fix.md)，不改权限、全局按钮或整页结构。runner补可声明的scrollToSelector，使用现有SDK.pageScrollTo，先证明页面滚动原点再测selector并滚动，要求唯一目标、有限几何、卡片可完整落入viewport、实际scrollTop与目标相符。没有tap/输入模拟或业务调用；3直接需求测试通过，与既有截图工具84项通过。修复后的滚动实图尚待重编译/刷新签名。

找回批次5状态因加载PNG大小拒绝而全批不promotion；其余4个case machine通过但只保留candidate。单独重跑tournamentList/Empty/Error/mine exit0并committed，主控已看4图及hash/清理；总计18唯一final。列表卡实际宽183.9966px居中、内容366.2075px，标题被迫多行；正在局部高优先级按钮宽度修复，修复图未验。空态与错误重试、mine找回入口可见，未验证真实云/跨设备打开。

## PNG大小门禁提案（待用户答复，未应用）

加载态PNG完整CRC/IDAT/尺寸/hash与来源/route/fixture/nonce/清理均通过，主控亲自看为完整正确加载页；17650bytes、282×607、SHA91e45557482245b636b090ada8b6027a9c10e2cf69385fcaf65968c3290f2f51。现有>20KB经验门禁在capture与evidence两处均拒绝，整个5图批次finalsTouched=false。失败记录2026-10-03T06-19-44-916Z-41048-06f279fa保留，不手动promotion。

Luna查历史确认20KB原意为经验判空，但没有校准保证；既有测试用全透明PNG加24KB文本填充也会通过，压缩大小不能可靠判空。已在ignored tmp准备仅frame取消该压缩下限、page不变的两处修改提案，并内存加载拟改模块验证真实frame通过、page不放宽、坏PNG/零尺寸/错误source/nonce拒绝。未将拟改模块覆盖正式脚本；PNG原件/receipt/session不变。依AGENTS“需要放宽门禁时明确列为提案”已异步请求明确批准，等待期间其余实现继续。

## 修复后本地门禁

两处局部布局和滚动工具合并后，完整npm test **1648项，1642通过、0失败、6跳过，exit0**；回执tmp/authorized-ui-after-install-20261003/scroll-layout-full-tests.log。6跳过仍为Windows旧WSL预览，不是云/设备实测。root定向ESLint0错误0警告；此前run-eslint调用会忽略所给文件参数、实际全量0错误35警告，回执scroll-layout-lint.log，不将其说成定向。diff检查通过。公共云代码/bootstrap/API未更改，之前check覆盖保持，接下来冻结全部仓库文件再刷新签名。

## challenge编译与修复后的真实复核

第一次refresh按设计exit2并生成source challenge；官方simulator_refresh实际status0/result.success=true。root最初自写输出摘要误按不存在的ok/exitCode/outer success字段判失败，该外层命令exit1不等于官方编译失败；原记录official-compile-layout.json保留，按真实status/result复核。随后第二次refresh exit0，11checks全true、changedSourceCompileProven=true，未改session JSON或跳过nonce。

新图独立保存在finals-layout/simulator-frame，不覆盖修复前图。owner/busy/member三张协管完整滚动图，以及列表普通/空/错误三图共6张均exit0、capture/evidence/machine/promotion committed=true，PNGhash匹配、runtimeExceptions0、fixture/storage cleanup=true、cleanupError=null。主控亲自view全部6图：协管姓名/绑定身份和操作按钮同一行，长昵称显示正常，guest与主办无授权按钮、busy禁用带图标可辨认，member卡不显示授予/撤销。按钮真实约103.9966×43.9966px（104×44渲染舍入），两行高度均59.983px，原181/127px挤占已关闭；卡高313.478px可完整落入671px viewport，实际scrollTop570.8844与目标570.6531相差0.2313px，卡顶约11.77px。列表三卡宽均366.2075px/left11.9983，与intro相同，标题不再因184px按钮宽被迫折行。不存在靠改变截图数据隐藏问题。

累计原18个唯一状态final与6张修复复核图均保留；加载态20KB门禁提案仍未应用，不将失败候选当正式final。必要320/430、真机和真实业务链路仍待验证。两项实际390布局问题已由主控关闭，不称整个计划或整个UI验收完成。

## 仍未完成

当前图为本地合成fixture状态，不证明真实身份、云函数写入、慢网/并发、native确认modal/键盘或设备体验。console有合成demo/__ui_*不存在的只读fetch/watch诊断与SDK getSystemInfoSync warning，runtimeExceptions为0，不把console说成零错误。320/430、大字、Android+iPhone、用户人工确认仍待实际验收。两项布局修复与滚动工具使旧session源码hash过期，必须按challenge→明确编译→再次refresh签名，不直接沿用旧图覆盖新源码。
