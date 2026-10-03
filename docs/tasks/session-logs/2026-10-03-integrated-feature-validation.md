# 第7/8/11与离线单打候选整合验证

实际工作区 main/master、HEAD b571c68754e964e1a73800645f68a49d99f40f41；保留全部既有脏树、partial、旧候选和失败回执，未提交、部署或上传。

## 完整测试发现与修复

首次完整运行 `tmp/authorized-stage-20261003-coadmin-tests.log`：1630项，1621通过、3失败、6跳过。不能称为通过或既有波动。3失败分别为云handler烟测清单缺新增函数、共享模板dry-run固定23函数预期、新找回页没有截图registry用例。

主控同步 `scripts/cloud-runtime-smoke.js` 的三项本地handler：finish缺ID、manageCoManagers缺请求参数、getMyTournaments非法cursor；均在读取/写入前返回，无云端调用。清单测试改核对当前本地/配置函数，不能称26函数已部署。部署测试与当前配置逐项比较并保留dry-run，不靠固定数量或旧顺序。第一次直接复跑仍有“首项必须addPlayers”的旧排序断言失败；修正后两文件13/13通过。第3失败由6.1 Sol high代理补截图用例与真实隔离执行测试，详细见其独立日志。

新列表读取使用 `_requestSeq`，旧截图隔离遗漏该序号，晚到读取可覆盖fixture。主控加入序号隔离并暴露真实隔离函数供执行测试；不改业务权限，不把fixture或测试当实际DevTools图。

本轮check已通过，回执 `tmp/authorized-stage-20261003-coadmin-check.log`；lint为0错误35警告，回执同前缀lint.log。完整修复后测试终态另行记录，不能用初次结果替代。

## 最新录分完整包

首次新包构建的外层120秒期限终止子进程，`tmp/submit-score-full-candidate-20261003-coadmin` 留下bundle和不完整ZIP，没有最终manifest；原样保全，不能使用。此前构建脚本复制还曾因换行匹配错误而未创建新脚本，后续缺文件执行失败，也没有覆盖旧目录。

在新目录 `tmp/submit-score-full-candidate-20261003-coadmin-retry` 直接运行新builder，ZIP核验给出6381文件、36,445,153文件字节、37,595,955 ZIP字节，所有成员hash/CRC/固定排序与时间通过，重复生成字节相同。源码13文件SHA256为 `18f42b6b3f79901c0071b20899792bbe3a954394afc15f1b35c3ce86ad8f4d4c`；ZIP SHA256为 `f04eddc6d1df3ea969b75e941f697d03280849d9f8490838498eb50e30e939fa`。与旧候选变化恰为logic和permission；原0238备份6381文件和旧候选重新核验未变。

真实已备份依赖wx-server-sdk2.6.3→node-sdk2.9.1→database1.4.1，6368依赖文件复用且没有fresh install；Node24.18离线加载通过，所有模块限制在包内，网络尝试0，未调用main。配置中的生产env仅沿用来源元数据，未执行部署，也不构成新生产授权。

## 本地Node16.13实际检查

从官方 `https://nodejs.org/dist/v16.13.0/` 下载win-x64/node.exe到新tmp目录；与同站SHASUMS256.txt匹配，SHA256 `7fca04f83b0e2169e41b2e1845e8da0f07d66cf9c3a1b4150767bf3ffddccf62`，实际版本v16.13.0。初次直接复用Node24验证器因Module.isBuiltin未提供而失败，这是验证器API兼容问题，尚未加载业务入口，不称应用失败或通过。

新独立验证器改用builtinModules列表识别内建模块，保留旧文件与失败receipt。最新录分包在Windows Node16.13实际加载、真实SDK和module confinement通过、网络尝试0，回执 `tmp/node16-local-20261003/submitScore-offline-retry.json`。

另以真实SDK及明确限定的源码/已验证依赖两组目录加载finishTournament、manageCoManagers、getMyTournaments、scoreLock、submitScore；只执行缺参/非法cursor返回，使用显式虚构离线身份，不是微信身份验收。getMyTournaments还实际执行base64url、HMAC、timingSafeEqual与版本拒绝路径。6项receipt全部符合预期，网络尝试0、已加载源hash前后相同；`tmp/node16-local-20261003/new-handlers-offline.json`包含一行submitScore诊断及末行JSON。

这是Windows本机Node16检查；不能代替CloudBase Linux运行时、函数上传、真实身份/数据库规则/索引、事务与回放、wire日期/数值、双手机和3秒余量验收。未安装全局Node、未更换生产SDK或runtime。


主控修复烟测/配置测试与runner后执行run-eslint（该入口忽略文件参数，实际全量），终态0错误35警告；diff检查通过，仅既有CRLF转换提示。没有把该调用说成定向检查。


## 最终整合门禁（13:35）

首次3项清单修复后完整1635项仍有1628通过、1失败、6跳过；原回执 tmp/authorized-stage-20261003-coadmin-rerun-tests.log 保留。失败为weapp-ui-screenshot-tool.test.js的missing runtime marker场景：它读取真实共享Git快照，却断言稳定源码下必须产生pendingSession。完整运行13:32:07–13:32:48，代理新增用例日志13:32:30，与测试窗口重叠；源码无进一步修改时，修复前该单例实跑1/1通过。未保存该失败的完整checks，不能声称已证实唯一原因或称为既有波动。

把该case的Git快照固定在隔离加载的真实工具模块中，与相邻两项doctor fixture一致；保留缺marker不得初次证明编译、pendingSession必须生成，并新增sourceStableDuringDoctor=true断言。生产签名/源码稳定护栏未放宽。两个真实截图工具测试文件81/81通过；修改测试定向lint0错误0警告。

最终完整 npm test：**1635项，1629通过、0失败、6跳过**，回执 tmp/authorized-stage-20261003-coadmin-final-tests.log；6跳过为Windows旧WSL预览测试，不是真机/云引擎验收。之前check通过后没有更改其覆盖的公共云lib/微信API/bootstrap声明；完整lint复跑0错误35警告（tmp/authorized-stage-20261003-coadmin-rerun-lint.log），之后只修上述测试且定向lint0/0。diff检查通过。无需为了记录更新重复应用测试。

[协管冷审](2026-10-03-coadmin-cold-review.md)补查create/join/guest认领/add/clone/remove实际writer，没有仅清playerIds的可达解绑或已证实P1；旧/手工身份形状与唯一同名认领仍保留合同条件风险。已备[隔离测试清单](2026-10-03-new-cloud-isolation-checklist.md)，当前本地cloudbaserc仍指生产，隔离目标需显式CLI环境选择，不能用打印环境变量当已改部署目标。

[最新开赛只读窗口](2026-10-03-start-observation-latest.md)由Luna取得8页776行，报告complete=true/issues=[]，主控读取原报告完整性与新包manifest字段复核；4非缺参业务/平台成功，硬超时0，但来源未知/样本不足，未关闭原7日100调用要求。


## 接续：26个当前入口的Node16加载（接续实测）

上一轮为实质progress（代码、完整测试、最新ZIP和Node16局部加载）。本次重新核对 main/master/原HEAD，221项Git短状态保留；安装器53524与旧exe54148仍真实存活、39465/29558无监听，不能假定安装已完成。旧exe执行路径已读到固定安装路径，但授权session没有54148/35820匹配，父进程布尔特征未证明属于任务预热；没有强杀或操作安装器。

使用已验证bundle的真实wx2.6.3，在官方Windows Node16.13实际加载全部26个配置/本地handler。每个入口均导出main；依赖读取hash逐项匹配已验证bundle manifest，加载源码前后hash相同，所有模块限制在源码/依赖两组目录，网络尝试0，没有调用任何handler。回执 tmp/node16-local-20261003/all-handlers-load.json；程序同目录all-handlers-load.cjs。比上一轮5入口检查补齐其余21入口的真实SDK加载缺口，但不证明业务/引擎/云Linux平台兼容或包上传。没有更改应用/生产源码，不因此重复已通过的1635项回归。

同一26入口程序在本机Node24.18运行亦全部加载通过、hash稳定、真实SDK2.6.3、网络尝试0；独立新receipt all-handlers-load-node24.json。两个Windows版本入口加载并不代替CloudBase Linux/配置中的24.11运行时执行。


用户告知安装完成后，固定路径exe/官方cli.bat已核为9月29日构建；原安装器/54148不再存在，新顶层进程56380由安装器启动。通过现有Codex身份/原Token的官方status确认success=true/loginExpired=false，再官方quit success=true/canceled=false，29558关闭，没有强杀。准备新39467签名会话；在此后至截图批次结束冻结仓库全部文档与源码，代理只写ignored tmp。不能凭用户完成安装或status通过直接认定截图可用。

真实SDK codec双Node回执和CLI实际优先级已由主控读取；CLI全局-e高于生产config，部署策略沿用该envId。最新上海env list仍只有生产NORMAL、无非生产，raw留tmp/isolation-env-recheck-20261003-1350.json。codec出现超safe int64精度损失/Long写对象/BigInt拒绝与无效Date静默epoch，SDK4对照一致；当前备份范围由Luna只读检查中，尚不推断实际业务损坏，也不升级SDK试图解决。


安装后第一次预热失败为HTTP未就绪，29558随后真实监听；官方open main/29558成功。两次独立39469/39471预热nonce绑定getApp unavailable，无有效session。官方simulator_refresh success=true也未直接使下一次即时绑定成功。只读连接实际owned39471：Tool版本2.02.2609292/SDK3.17.3，官方Tool.getInfo只提供版本和SDK（无projectPath），App当前页home且应用标题正确；typeof getApp/getCurrentPages/App/Page均function、wx为object。第一次诊断误将空projectPath标为mismatch，未查询进一步数据；改为明确区分缺字段和实际路径不符，第二次只读诊断完成，不签名/不capture。依据这个startup竞态证据，暂解除Git冻结，6.1代理仅修prewarm就绪等待；待稳定重新冻结，不盲重启或弱化nonce来源。

## 安装后预热工具修复门禁

代理已补同一AppService的限时只读就绪检查，要求getApp函数与实际非空app对象均可用；原错误不能区分当时函数未定义或app为空，不把诊断说成已确知唯一原因。原nonce、项目、进程、SDK、viewport和源码门禁保留，89工具测试通过、定向lint0/0。主控按工具基础设施变更要求再跑完整npm test：1642项，1636通过、0失败、6跳过，exit0；原始回执tmp/authorized-ui-after-install-20261003/prewarm-repair-full-tests.log。应用源码未再更改，真实签名和像素仍待下一阶段验收。
