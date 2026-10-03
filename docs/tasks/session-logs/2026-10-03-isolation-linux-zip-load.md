# 18函数实际ZIP的Linux离线加载

2026-10-04用户已暂停计划，goal paused；本文为历史离线加载证据，CloudBase平台/部署验收未完成，不继续运行或上传候选。[暂停交接及全部证据位置](2026-10-04-plan-paused-handoff.md)。

最新已另在官方Linux Node v24.11.0实际加载相同18完整ZIP，18份数值exit0、源码及旧材料保全冷核通过，关闭上游版本不一致及新轮退出码缺口；仍不是CloudBase平台验收。新证据、下载清单P2修正与警告限定见[精确版本接续](2026-10-03-exact-node-and-native-recovery.md)。本文24.13.1、原stderr及旧退出码/工具SHA缺口按历史保留，不补造。

第5/7/8/9/11必要函数候选已在Ubuntu WSL2/Linux x64/Node v24.13.1实际解包加载全部通过。此前Windows两根加载的历史证明保留，本阶段补上实际完整ZIP及本机Linux闭包；仍不是CloudBase验收。没有应用源码/配置修改、安装更新、部署、云调用或业务写入，全部旧候选/备份/partial保留。

## 环境和执行

Luna只读清点：既有Ubuntu WSL2、Python/unzip和`/home/lizixuan/.nvm/versions/node/v24.13.1/bin/node`可用；无Docker/Podman或已发现Node16，未安装。WSL原Stopped经非交互探针成为Running；未终止用户发行版。6.1 Sol high使用Python argv数组运行新任务根`/home/lizixuan/tmp/badminton-isolation-zip-linux-20261003`，拒绝覆盖，执行后保留。首次Windows引号探针失败有原记录，尚未执行Node/解包即失败，修正后成功。

18函数为addPlayers/cloneTournament/createTournament/deleteTournament/finishTournament/getMyTournaments/joinTournament/login/manageCoManagers/managePairTeams/removePlayer/resetTournament/scoreLock/setPlayerSquad/setReferee/startTournament/submitScore/updateSettings。17新ZIP和既有submitScore原包均逐路径、无symlink、SHA、CRC校验后物理解包，使用各自index及node_modules实际require，不是两根依赖映射或stub。

| 核验 | 结果 |
| --- | --- |
| 18实际完整ZIP | 114872成员、657443233解包字节；18/18 passed |
| 真实运行时/SDK | Linux x64 Node24.13.1；wx-server-sdk2.6.3 |
| 加载闭包 | 模块受限于各包且hash对应源码；解包后hash通过 |
| Node受测边界 | main调用0、network attempts0、subprocess/worker launches0 |
| 保全 | 归档/manifest前后hash不变；本阶段工具运行前后SHA稳定 |

汇总`tmp/isolation-linux-zip-load-20261003/all-summary.json` SHA256 `76a15b9f391f1ae71d569720e1d646c85c47ae208b873d0b7fdbe43dfa0e055b`；同根handoff.json索引18份原Linuxreceipt/stdout/stderr、工具和首阶段记录。Node二进制SHA256 `d95de52ccb76fb2c5775bf176f29f3025e4b19352c092aad51ce5d930717359f`。18次stderr都有DEP0040 punycode弃用警告；执行代理报告退出0，但逐子进程数值exitCode未保存在原receipt，独立冷核只可证实18份及nested require的passed=true。原警告保留，未升级SDK/audit fix。

主控核汇总18函数、总成员/字节、源码union、SDK与0调用计数；Luna按18份原receipt只读冷核，函数/三类SHA/成员/加载模块数逐项匹配、无缺失多余，总数相同；真实SDK非stub，入口导出main但调用/网络/进程0，cloudPlatformRuntimeOrDeploymentVerified=false。没有重复114872项解压/CRC。三工具当前SHA匹配before基线，summary/handoff声明前后稳定，但没有保留逐文件after SHA清单；后半不冒充独立不可变逐值证据。旧Windows构建阶段“工具运行前SHA未记录”仍有效，本阶段工具SHA不能补造旧证据。

## 未验证和下一步

本机24.13.1不同于控制台新建24.11，不能称exact CloudBase runtime验证。WXContext/身份/安全规则/事务回放冲突/索引/真实错误/wire类型/Timeout3、平台上传和服务执行均未验。非生产EnvId、绑定/兑换码、实际A/B/C身份仍待提供；在原已批准非生产范围内接续清单，生产部署仍逐项授权。

仅tmp/文档阶段，沿用最近1648项1642通过/6跳过/0失败；文档引用与diff由主控核验，无理由重复应用全量。候选原始构建范围见[函数组证据](2026-10-03-isolation-function-group-candidates.md)，后续动作见[隔离清单](2026-10-03-new-cloud-isolation-checklist.md)。
