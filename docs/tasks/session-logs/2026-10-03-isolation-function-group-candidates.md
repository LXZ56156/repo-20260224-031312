# 必要隔离函数组本地候选

最新已补[Linux实际完整ZIP解包加载](2026-10-03-isolation-linux-zip-load.md)：18/18通过，114872成员/657443233解包字节，Node24.13.1/SDK2.6.3、main/网络/子进程0，工具前后SHA稳定；保留下面Windows阶段来源及工具SHA缺口。Linux本机不是CloudBase24.11或真实云身份/事务验收。

第5/7/8/11隔离清单此前只固化submitScore完整依赖包；本阶段关闭其它配套函数的本地候选准备缺口，不关闭真实云验收。6.1 Sol high在ignored tmp构建、主控抽核；无应用源码/配置改动、依赖安装、环境创建、部署、远程调用或业务写入。main/master/HEAD b571c687，全部既有脏树、备份、partial和submitScore候选保留。

## 范围与产物

最终18函数union：addPlayers、cloneTournament、createTournament、deleteTournament、finishTournament、getMyTournaments、joinTournament、login、manageCoManagers、managePairTeams、removePlayer、resetTournament、scoreLock、setPlayerSquad、setReferee、startTournament、submitScore、updateSettings。锁/收赛/录分同组、协管七入口及主办专属边界、找回与真实身份fixture按[隔离清单](2026-10-03-new-cloud-isolation-checklist.md)配套。新增login来自真实客户端`miniprogram/core/auth.js:17`：无新鲜身份缓存时调用login；不凭已有缓存假定新A/B/C身份无需该函数。

`tmp/isolation-function-groups-20261003/combined-summary.json`是最终核验入口，`handoff.json`记录逐包路径/SHA；login在独立新根`tmp/isolation-function-groups-20261003-login`。既有submitScore根`tmp/submit-score-full-candidate-20261003-coadmin-retry`不重建、不覆盖；旧失败候选也保留。

| 本地证据 | 结果 |
| --- | --- |
| 当前18函数源码快照 | 223文件逐项相同；union SHA256 `1d0d6bc8a7bb849a51a0628a01579953d26b25bf42b809c4536170c0d04d615c` |
| 生成共享文件 | 162文件与9个模板逐字节相同 |
| 17个新ZIP | 108491成员、640564938bytes；逐成员SHA/CRC、路径排序、固定时间1980及重复构建字节均通过 |
| 真实Windows Node16.13加载 | 17新入口passed，exports main、未调用main、真实SDK、网络0、模块路径受限且加载hash对应候选；已有submitScore同源Node16回执引用验证通过 |
| 来源保全 | 14个现有函数自身备份完整文件posthash保持；既有submitScore候选posthash保持 |

每包均保留source快照、manifest.json、bundle-files.json、package.zip、zip-verification.json和offline-node16-require.json。为避免16份node_modules重复复制，Windows离线加载实际使用候选source快照与声明的依赖根两处路径；ZIP自身包含完整源码和依赖，未执行解压后的物理ZIP或云端包。不把两根本地加载说成云部署成功。

## 来源差异、失败与工具证据边界

现有函数使用各自已备份依赖，不统一替换：例如scoreLock/login与submitScore的node_modules/.package-lock.json字节不同；startTournament实际依赖文件6393，其余新包6368。三个从未部署的新函数使用已核submitScore依赖闭包，manifest明确来源。直接package均pin wx-server-sdk2.6.3，不宣称全部传递树相同或执行过fresh install。

两次建根前预检失败保留：Windows反斜线路径导致Git输出引号，以及自身依赖整树与submitScore比较不相等；分别使用明确POSIX相对路径、保留自身依赖来源后完成。没有覆盖旧证据，也未据package相同跳过差异。

主组脚本运行前工具SHA未记录；主进程已加载16函数范围后，同文件增加独立--login入口。该文件后来版本仅为参考实现，不能冒称当时逐字节工具证据；combined-summary.toolEvidence明确记录。候选源码/依赖/ZIP本身均有逐文件及归档实际核验，未为缺失工具SHA重跑已验证产物。

主控直接核finishTournament完整13源文件与当前仓库逐字节相同，实际ZIP SHA256 `a5a63052b5e60e9d7df445e8852c847f00588aefbdac82ac14b455d8385949e4`匹配；原Node16和6381成员CRC/hash/重复字节回执通过。Luna已独立核login的11源文件、ZIP实际SHA/目录6379成员与原Node16收据相符；其余全组冷核随后追加，不预填结论。

全组Luna冷核已封口，ignored `tmp/isolation-function-groups-20261003/cold-review.json`保留：17个新ZIP实际SHA、中央目录成员数和未压缩总长匹配三份原始记录；总640564938bytes/108491成员。18函数223源文件按manifest与当前仓库逐项hash相同，162共享文件对应模板相同；17份原Node16真实SDK收据均exports main/未调用/网络0。既有submitScore实际ZIP SHA和6381成员/36445153未压缩字节与原记录相符。冷核未inflate、未重复计算全部成员CRC/hash，也未重读全部备份依赖树；这些分别依构建者原执行回执。工具运行前SHA缺失，构建者所述已加载范围未受后来login入口影响是过程说明，不是独立不可变工具证据。主控另核汇总18/17计数、网络/入口/云动作/targetEnv空值边界通过。

阶段最终Markdown本地链接核验通过、git diff --check通过（已有CRLF提示，不是差异失败），current保持33行；master/HEAD不变。没有因该文档/tmp阶段追加应用全量测试。

## 未验证与下一步

没有确认非生产EnvId、绑定/兑换码或真实WX身份，targetEnv=null；生产配置保持原样，不能调用默认项目部署脚本。Windows16和最新Linux24.13.1仅证明本机离线模块加载，不证明CloudBase exact runtime、WXContext、规则、事务、索引、实际错误、平台上传接受或超时。未生成隔离端既有版本前镜像，当前dirty源码候选不等于HEAD或生产回退版本；各来源原备份不变，不以新候选替换旧回退。

下一步先获得明确非生产环境及绑定/身份，在原已批准隔离测试范围内核其实际Runtime/目标，按清单显式全局-e成组部署和验收；实际生产部署/付款/客户端上传发布/真实业务数据写入仍须具体证据后逐项授权。阶段仅tmp产物/文档，无新应用源码，沿用最近全量1648项1642通过/6跳过/0失败，不重复应用全量；文档链接/差异由主控复核。
