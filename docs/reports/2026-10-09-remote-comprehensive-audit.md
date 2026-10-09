# 羽球轮转助手｜远端全面检查汇总报告 · 10月9日补查版

> 状态：2026-10-09 审计时点报告。**远端源码、可取得历史资料及离线验证已完成；当前云实况核验仍受阻，全面检查的线上部分未完成。** 本页为本次审计的完整正文，包含主报告及附录 A—H；HTML 是同版导出，证据包保存原始记录与复现，不另立维护结论。

## 入库与阅读说明

- 审计源码固定为 [`a3fe96f25015892ac30ee7148f97a5b441b0cb24`](https://github.com/LXZ56156/repo-20260224-031312/commit/a3fe96f25015892ac30ee7148f97a5b441b0cb24)。2026-10-09 本次入库仅交付报告、证据附件和关联导航，未修复业务。正文中的“远端分支未修改”“源码保持不变”和“当前”均指审计时点，不能把后续文档提交当作业务变更或线上部署。
- [HTML 阅读版](assets/2026-10-09-remote-comprehensive-audit/badminton-audit-2026-10-08.html)保留已交付文件的原始字节，文件名沿用 10 月 8 日，内容为 10 月 9 日补查版。[公开入库证据包](assets/2026-10-09-remote-comprehensive-audit/badminton-audit-evidence-2026-10-09-public.zip)包含完整审计记录与离线复现所需运行依赖；[完整性与发布清单](assets/2026-10-09-remote-comprehensive-audit/publication-manifest.json)记录版本和 SHA-256。
- 公开证据包剔除了 3 个原始 npm 压缩包，以免重复分发上游测试密钥和与复现无关的测试内容；保留精确版本、原包 SHA-256、下载方法、必要源码、许可证和离线运行依赖。包内 `PUBLICATION.json` 逐项记录差异。除阅读说明与校验清单外，其余原始证据字节保持不变；正文提及的原始发布包可按该清单重新取得。
- 附录命令中的 `AUDIT_ROOT` 是审计工作区路径占位，使用前需替换为实际路径；公开证据包的 `README.md` 提供按解压目录执行的复跑命令和 `AUDIT_REPO` 设置方法。
- 主清单为 **18 项（2 P1 / 12 P2 / 4 P3）**，另有 **1 项 P3 输入防护观察 TEL-02**，分别计数。问题发现不等于生产事故，报告入库不等于修复或验收通过。
- 最新任务导航见 [current](../tasks/current.md)；原 12 项实施与验收进度继续见 [详细状态](../tasks/paused-plan-status.md)。历史计划、原失败、暂停点和线上未验证项保留，不由本次文档提交自动关闭。

---

# 1. 检查结论

**2026-10-09 补查版：远端源码、可用历史资料和独立可执行验证已完成，汇总报告已整理；全面检查的线上部分仍未完成。** 当前云部署、数据库规则和索引、真实费用与用量、事件实收、备份保留和恢复原件，因本会话缺少已认证只读入口或可读取原件而保留为未验证。此前将“检查与报告完成”概括为全面检查完成的表述不准确，本版明确更正。

最高优先级为两个 P1 问题：五个赛事写入口使用的条件更新没有携带事务标识，以及旧版 V1 账本创建竞态能够覆盖已成功写入的数据。两项均有实际代码或精确 SDK 请求证据，尚未取得其在当前生产部署中的发生记录。检查完成不要求先修复问题；本轮持续遵守“只检查”的范围。

你最关注的“搭档均衡、对手均衡”也有明确结论：现有排赛在模板与搜索分支之间采用了不一致的取舍，部分组合为了不连打，显著缩小搭档和对手覆盖；另一个自然超时降级案例存在可避免的同队上场次数差。单打循环覆盖、终局比分和排名算术在本次独立样例中表现稳定。

资源检查找到了历史账本分页全扫描、不变账本重复读取、锁请求重叠、完整缓存持续积累等具体路径。可以据此制定优化顺序；实际费用、用户场景分布和当前线上发生率仍需同一时间窗口的真实数据。用户提供的“日均约 90 人”保留原口径，没有换算成 DAU、并发人数或账单。

主清单登记 **18 个审计条目：2 项 P1、12 项 P2、4 项 P3**，包括可执行缺陷、目标取舍和资源优化项。另登记 **1 项 P3 输入防护观察 TEL-02**，没有合并进 18 项，也没有认定为已发生的真实统计错误。本次补齐云函数公共依赖树扫描，得到 17 个受影响依赖条目；它们是另一种扫描口径，不作为 17 个新增业务故障。业务源码和远端分支保持未修改。

## 固定版本与证据来源

| 项目 | 本次核实结果 |
|---|---|
| 仓库 | `LXZ56156/repo-20260224-031312` |
| 当前可见性 | 10-09 GitHub 元数据返回 public / private=false；不再沿用私有仓库的称谓 |
| 分支与提交 | `master` / `a3fe96f25015892ac30ee7148f97a5b441b0cb24` |
| 提交时间 | 2026-10-08 03:28:52 UTC；北京时间 10 月 8 日 11:28:52 |
| 源码树 | `5298c2afc36e3c74576912566749afae1761fb59` |
| 清点范围 | 1,638 个受 Git 跟踪文件；16 个注册页面；26 个登记云函数；307 个测试文件 |
| 执行环境 | 隔离 Linux，Node 24.19.0、npm 11.9.0、Python 3.12.14 |
| GitHub 检查记录 | 此提交 Actions 运行数 0；全仓库可见历史运行 6 条；commit statuses 与 rulesets 为空；master protected=false |
| 续查版本核验 | 10-09 再次只读查询 master，仍为同一固定提交；Git 版本不代表当前发布或云部署版本 |
| 本次工作方式 | 三个专项子 agent 并行，主控执行全量基线、独立复核、版本与证据对账 |

远端最新提交见 [固定提交](https://github.com/LXZ56156/repo-20260224-031312/commit/a3fe96f25015892ac30ee7148f97a5b441b0cb24)。原开发记录入口为 [`docs/tasks/current.md`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/tasks/current.md)，唯一进度正文为 [`docs/tasks/paused-plan-status.md`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/tasks/paused-plan-status.md)。旧报告和旧测试数字只作为历史记录，未代替本次实际运行。

# 2. 目标、方法与完成范围

| 检查目标 | 已完成的工作 | 证据边界 |
|---|---|---|
| 固定远端事实 | 固定 HEAD、完整源码清单、逐文件 SHA-256、远端分支与 CI 核对 | 没有把 Git HEAD 当作当前发布版或云部署版 |
| 判断核心排赛质量 | 单打/固搭/多人转/小队转；模板前缀、非模板、降级；独立关系矩阵与可行对照 | 受控参数集合和已支持模板覆盖；不宣称穷举所有大规模排法 |
| 核对业务与数据安全 | 创建、加入、身份、协管、开赛、录分锁、更正、收赛、找回、V1/V2 账本与迁移代码 | handler mock、真实 SDK 请求捕获；真实云冲突/回滚另列未验 |
| 判断留痕能否回答实际使用 | 两套事件链、字段、入口、报表、13 项指标缺口；真实 handler 到 tracker 复现 | 没有取得 reportEvent 平台配置与实收回执 |
| 查找资源浪费 | 单位动作读写、历史分页、轮询、重试、心跳、缓存、头像及保留策略 | 数据库方法调用次数不同于返回文档数或计费单位 |
| 核对 UI、配置和依赖 | 页面与组件完整性、静态导航、打包排除、配置边界、npm 依赖公告 | 没有进行原生画面、手机、实际上传包和云规则验收 |
| 对账历史 12 项开发计划 | 将每项分为本次新证据、历史记载和仍缺证据 | 仅作项目进度对账，不恢复历史修复授权，也不把设备验收扩张为本次远端检查 |

**当前完成度按范围记录：**以上源码和历史材料检查已完成；当前云平台实况核验受阻。第 11 节逐项列出余下证据需求。没有用一个整体百分比掩盖两种状态，也不把“存在未修复问题”当成“检查尚未做”。

源码来自远端，在本次隔离工作区运行。常规验证进程阻止外网 socket；需要本地 HTTP 测试夹具的全量基线使用仅允许 loopback 的 Node 守卫。真实业务入口的复现只替换 SDK、远端返回或平台出口，使用合成数据。SDK 事务探针加载精确发布包，仅替换网络请求出口。没有触碰用户电脑、手机、生产数据库或生产写接口。

主控对关键业务和资源复现再次执行，并用另一份 Python 实现独立重算排赛见证，未复用生产或子 agent 的公平性统计函数。该重算验证了成员合法性、同批互斥、休息补集、关系重复和连续上场/休息。

# 3. 测试基线与失败归因

| 验证 | 实际结果 |
|---|---|
| 全量 `node --test` | **1,777 项：1,768 通过、7 失败、2 跳过；退出码 1** |
| 全量耗时 | 约 109.4 秒；限制两个测试文件并发 |
| 环境前提针对性复核 | 两个测试文件共 **10/10 通过**，对应消除原始五项环境前提失败 |
| `npm run check` | 通过：V2 云初始化声明校验、旧微信 API 扫描、共享云库一致性 |
| `npm run lint` | 退出码 0；**0 错误、35 警告** |
| 源码保护 | 运行前后受跟踪文件与固定清单一致，Git 工作树干净 |

### 七项失败如何处理

| 原始失败数 | 原因 | 本次后续处理 |
|---:|---|---|
| 4 | 旧 API 扫描测试替换 PATH 后，Linux 上使用相对 `bash`，导致子进程找不到命令 | 显式设置已有 `/bin/bash` 后直接测试通过 |
| 1 | 身份只读测试假设忽略目录 `tmp` 已存在，干净检出缺少此目录 | 创建忽略目录后直接测试通过，未改业务或测试源码 |
| 2 | 微信预览/MCP 工作流依赖 WSL 的 `wslpath`，通用 Linux 环境没有该能力 | 保留原始失败，标为目标 WSL/Windows 运行环境未验证 |

另外两项平台专用用例由测试主动跳过。没有将它们补记为通过，也没有把针对性复核改写成“全量零失败”。建议后续让测试夹具明确声明运行平台、使用绝对 Bash 路径并自行准备临时目录，使干净检出的结果易于解释。

完整 TAP、退出回执、针对性复核与归因在证据包 `evidence/baseline/`。

# 4. 两个优先处理的 P1 问题

## BIZ-04：事务内条件更新没有携带事务标识

当前五个入口在事务回调中执行 `where({_id, version}).update(...)`：开赛、导入人员、移除人员、修改设置、设置裁判。精确依赖链为 `wx-server-sdk@2.6.3 → @cloudbase/node-sdk@2.9.1 → @cloudbase/database@1.4.1`。

实际 SDK 请求捕获显示：普通 `where().update()` 发出的 `database.modifyDocument` 不含 `transactionId`，同一事务内的 `doc().update()` 和 `doc().set()` 则携带事务标识。主动抛出错误后，abort 指向一个先前条件更新没有标明的事务。主控还检查了真实 DBRequest 的构造与发送代码，没有发现后续传输层补入该标识。

**影响是事务原子边界不符合代码意图。** 业务更新与请求日志、错误返回或后续回滚可能不同步。原来的 `_id/version` 条件仍然存在；当前生产实际安装包和云引擎结果尚未重新取证。

优先修复方向：在事务内读取权威文档，使用携带同一事务标识的文档更新，同时保留权限、版本语义和幂等日志。完成后既要用精确 SDK 捕获请求，也要在独立云环境验证冲突、日志失败及回滚。

源码：[`cloudfunctions/startTournament/index.js:293–306`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/index.js#L293-L306)；[`cloudfunctions/addPlayers/index.js:258`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/addPlayers/index.js#L258)；[`cloudfunctions/removePlayer/index.js:100`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/removePlayer/index.js#L100)；[`cloudfunctions/updateSettings/index.js:144`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/updateSettings/index.js#L144)；[`cloudfunctions/setReferee/index.js:63`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/setReferee/index.js#L63)。精确 SDK 发布包、哈希和请求序列见附录 A 及证据包。

## BIZ-01：旧版创建竞态能覆盖已成功记入的账本

V1 兼容创建按 owner 生成稳定账本 ID，先在事务外判断不存在，再无条件写入版本 1 的空账本。确定性异步调度复现为：慢创建完成“不存在”判断后暂停；快创建成功，再添加球友并记入一条记录；最后慢创建继续写入。

结果从 **2 人、1 条记录、版本 3** 变成 **1 人、0 条记录、版本 1**，所有相关请求都返回成功。这个现象限于未迁移、仍可走 V1 `create` 的旧兼容路径；V2 独立新建采用另一套事务合同。

优先修复方向：首次存在性判断与创建写入原子化，已存在时返回当前账本。保留旧链接的数据访问能力和当前“每次创建独立账本”的产品方向。

源码：[`cloudfunctions/waterSession/index.js:184–214`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/waterSession/index.js#L184-L214)。真实 handler 的合成调度和前后状态见 `evidence/business/reproduce-business.results.json`。

# 5. 搭档与对手均衡：有明确的质量差异

## FA-01：8 人、单场地，16 场与 17 场的分支边界

当前 16 场命中模板，搭档和对手关系各覆盖 28 种。改为 17 场进入搜索分支后，两种关系各只覆盖 12 种，17 场仅有 6 种完整对阵。保存 16 场模板并追加一个合法新对阵，就能得到以下对照。

| 指标 | 当前 17 场 | 合法 17 场对照 |
|---|---:|---:|
| 上场次数最大差 | 1 | 1 |
| 不同搭档关系 | 12 / 28 | **28 / 28** |
| 不同对手关系 | 12 / 28 | **28 / 28** |
| 搭档重复次数 | 22 | **6** |
| 对手重复次数 | 56 | **40** |
| 不同完整对阵 | 6 | **17** |
| 最大连续上场批数 | **1** | 2 |

这里存在清楚的取舍：当前比较器把连打和休息排在搭档、对手之前。8 人每批上 4 人，若绝对不连打，就会被固定成两组 4 人交替，因此关系覆盖受限。按你这次明确的均衡目标，应统一模板和搜索的目标顺序，并明确可接受的连续上场上限。仅增加搜索时间或调整旧权重参数不能解决目标顺序本身。

源码：[`cloudfunctions/startTournament/rotationDoublesEngine.js:121–140`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/rotationDoublesEngine.js#L121-L140)、[`cloudfunctions/startTournament/rotationDoublesEngine.js:885–895`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/rotationDoublesEngine.js#L885-L895)。完整排程、矩阵和主控独立重算见附录 B。

补充可达性检查已实际串联创建、导入、设置保存与开赛入口：8 人可以在“高级自定义”选择 17 场，保存后仍为 17；12v10 可以保存 5 场地、24 场。页面开赛条件均通过，真实生成器收到原值，没有裁到模板长度。这条串联只使用内存 SDK，算法包装器仅记录参数，没有强制降级或注入种子。

## FA-02：12 对 10 人、5 场地、24 场的降级质量缺陷

在 4,500 毫秒受控预算耗尽后，自然进入 greedy fallback。A 队一人打 5 场、一人打 3 场，其余各 4 场；对照经过少量调整即可让 A 队人人 4 场，B 队保持原样。

对照同时让对手重复从 **11 降为 10**，搭档重复保持 3，最大连打保持 5，24 种完整对阵不减少，最大连续休息也未变差。它是已核查指标下可严格改善的结果。自然超时输出与强制进入同一路径的输出一致，已排除只在不可达调试状态出现的解释。

源码：[`cloudfunctions/startTournament/scheduleModes.js:179–366`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/scheduleModes.js#L179-L366)、[`cloudfunctions/startTournament/scheduleModes.js:692–714`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/scheduleModes.js#L692-L714)。建议降级时保证同队最终上场次数上下界可达，或增加有预算限制的局部调整。

## FA-03：8v8、2 场地、16 场的产品取舍

当前模板每人打 4 场、最多连续上场 1 批，但只遇到对方 8 人中的 4 人；搭档重复 8、对手重复 32。独立合法对照在每人仍打 4 场的情况下，允许最多连打 2 批，即可搭档和对手均零重复，每人遇到对方全部 8 人。

此项登记为目标取舍。现有测试刻意固定了休息优先的结果；后续应先依据已明确的均衡偏好调整验收指标，再更改模板或算法。

源码：[`cloudfunctions/startTournament/scheduleModes.js:111–144`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/scheduleModes.js#L111-L144)；[`tests/squad.fairness.test.js:354–369`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/tests/squad.fairness.test.js#L354-L369)。

## FA-04：固定搭档轮空名单漏显示

固定搭档生成器把每批 `restPlayers` 恒设为空。三队六人、单场地、三场完整循环中，每批都有一队休息，实际页面投影却得到空 `restText`，从而隐藏休息区。对阵本身正确，信息显示不完整。

源码：[`cloudfunctions/startTournament/scheduleModes.js:817–821`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/scheduleModes.js#L817-L821)；[`miniprogram/pages/schedule/index.js:210–214`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/pages/schedule/index.js#L210-L214)；[`miniprogram/pages/schedule/index.wxml:124–125`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/pages/schedule/index.wxml#L124-L125)。

## 已通过的排赛、比分和排名检查

| 检查集合 | 本次结果 |
|---|---|
| 单打参数与名单顺序 | 28 组参数 × 3 种顺序，**84 例通过** |
| 固定搭档完整/部分循环 | **384 例核心约束通过**；其中 320 例的休息字段问题并入 FA-04 |
| 多人转模板 | **60 个模板、941 个有效前缀**；数量、同批互斥、休息、独立统计一致，上场次数差达到算术下界 |
| 单打终局比分 | 独立逐分状态探索，4,107 个比分对，客户端与云端共 **8,214 次断言通过** |
| 四赛制排名 | **200 组独立样例、400 次两端对照通过** |
| 单打完整纯逻辑流程 | **60 条流程、1,014 次提交/更正后的独立排名核验通过** |
| 小规模精确参照 | 穷举 46,656 个有序排法，确认 4v4/单场地/3 场现有结果处于可行取舍前沿 |
| 非模板和降级 | 31 例完整合法；公平质量问题按上述条目单列 |

不同层次的检查数没有合并成统一通过率。纯逻辑流程也没有替代真实云事务、原生 UI 或手机结果。

# 6. 其他业务正确性问题

| 条目 | 已复现结果 | 修复重点 |
|---|---|---|
| BIZ-05 / P2 并发更正显示 | A 提交 v2 的 21:18；刷新实际读到 B 更正的 v3、18:21；成功收尾又以 v3 显示旧 21:18、旧记分者，并标为最新 | 新于提交响应的权威版本优先；仅在权威结果缺失或明确较旧时使用本地补偿 |
| BIZ-02 / P2 同名自动绑定 | 单打草稿中，普通加入且没有明确认领字段，会把唯一同名 guest 替换为当前身份 | 按现行“同名不自动绑定”规格明确认领，同步调整与规格冲突的既有测试 |
| BIZ-03 / P2 完赛误报 | 目标场已完成、另有待录场次时，同比分重试返回 finished:true，真实 tracker 生成 FINISHED_CONFIRMED | 统一去重与首次提交的赛事级 finished 语义 |

BIZ-05 当前证据为客户端错误显示，云端更正保留正确；BIZ-02 未发现直接取得主办或协管；BIZ-03 当前直接影响为完赛留痕，未导致云赛事提前结束或直接错误跳转。

源码：[`miniprogram/pages/match/matchSubmitService.js:78–154`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/pages/match/matchSubmitService.js#L78-L154)；[`cloudfunctions/joinTournament/index.js:256–395`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/joinTournament/index.js#L256-L395)；[`cloudfunctions/submitScore/logic.js:106–119`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/submitScore/logic.js#L106-L119)；[`miniprogram/core/activityTracker.js:168–171`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/core/activityTracker.js#L168-L171)。完整事件、状态及边界见附录 A。

# 7. 留痕：已有代码，实际使用闭环仍未证实

当前存在两套客户端事件：新 activity 有 17 个字段，包含动作、attempt/result、operation、进程内匿名会话、版本与结果；旧 growth 有 7 个字段，**其中确实有赛制 mode**。两套通道没有共同的可靠关联键，不能直接拼成逐赛事的创建→开赛→完赛漏斗。

人数、场地、循环等规模维度没有统一进入当前链路。activity 会话在进程内随机生成，不能当跨重启人数或长期用户身份。平台事件定义、字段接受、实收/拒绝、查询或导出、受控测试排除没有取得本轮新证据。仓库里的微信分析脚本处理标准访问报表，CLS 脚本处理云调用日志，均不等同于当前自定义事件的完整接收报表。

另确认 **TEL-01 / P2**：运维报表把 `null`、空白或布尔耗时转换成 0。三条缺失耗时的合成完整窗口，实际输出耗时覆盖数 3、P95 0ms；正确结果应为覆盖数 0、P95 未知。应先修这个输入口径与 BIZ-03，再用报表判断是否稳定。

10-09 补充 **TEL-02 / P3 输入防护观察**：采集文件保存 fetched_at，但离线留存报表未核对它与人工 latestComplete 的一致性。合成旧快照明确含 key7=0，保持字节不变而后移水位，D7 子项可变为 complete/0；缺 key7 的独立对照仍为 unknown，整份窗口也没有变为完整。真实 API 是否会提供该未成熟占位形式、历史报告是否受影响均未证实，因此本项只列观察，不加入 18 项主清单，也不描述为脚本自动推进日期。

源码：[`scripts/cloud-ops-daily-report.js:161–204`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/scripts/cloud-ops-daily-report.js#L161-L204)；[`miniprogram/core/activityTracker.js`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/core/activityTracker.js)；[`miniprogram/core/growthTracker.js`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/core/growthTracker.js)。附录 C 给出了 13 项指标矩阵，包括赛制分布、规模、调用失败与最终恢复、新账本 7 日首笔率、分享参与、用户场景和资源成本。

建议后续留痕按以下顺序形成可验收闭环：先明确平台支持的字段和查询方式，再执行带明确测试标识的受控旅程，核对 attempt/result、重试、失败、去重与实收，最后形成完整窗口报表。若平台只能提供聚合，应按真实能力设计统计，保留无法逐条配对的限制。

调研弹窗保留为后续候选，用于补充组织者身份、主要使用场景和困扰。它应可跳过并限制出现频率；本轮没有实现或投放弹窗。

# 8. 资源效率：先处理已经量出的重复工作

## 历史账本分页成本

当本人有 M 个有效 V2 账本、没有额外稳定旧账本时，`listLedgers` 每页会遍历所有 membership，再逐个读取 room 和 round，最后在内存排序和分页。源码 DB 读取方法调用数为：

**每页约 `2M + floor(M / 100) + 4` 次。**

| 本人账本数 | 返回第一页条数 | 第一页 DB 读操作 | 第二页 DB 读操作 |
|---:|---:|---:|---:|
| 20 | 20 | 44 | 不适用 |
| 100 | 20 | 205 | 205 |
| 500 | 20 | 1,009 | 1,009 |
| 1,000 | 20 | 2,014 | 2,014 |

这是每页 O(M) 的读取，遍历全部页面时还会反复重扫。近期可评估批量读取减少往返；长期可评估有索引的本人历史摘要，同时核算写放大并保持现有更新时间排序和权限语义。当前人数信息不能证明多数用户已积累这么多账本。

源码：[`cloudfunctions/waterSession/index.js:1738–1822`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/waterSession/index.js#L1738-L1822)。

## 已确认的其他资源项

| 条目 | 实测或受控复现 | 建议方向 |
|---|---|---|
| EFF-02 / P2 不变筛选账本重复读取 | 普通刷新 1 次云调用、5 次 DB 读；game/direct 筛选不变时仍变为 2 次云调用、10 次 DB 读 | 以权威版本、流水序号及筛选水位决定是否需要第二轮增量查询 |
| EFF-03 / P2 慢锁请求重叠 | 前一请求未完成，4 个 status tick 产生 4 个未决调用，3 个 heartbeat tick 产生 3 个未决调用 | 每种动作只保留一个在途请求，保持续租和生命周期边界 |
| EFF-04 / P2 缓存累积 | 125 次不同赛事访问后，最近列表 20 条，完整缓存仍为 125 条 | 为完整缓存设独立大小/数量预算，保护当前赛事、草稿和战绩快照 |
| EFF-05 / P3 首页排序重查 | 三次排序切换产生三次远端列表查询 | 已有列表本地排序，数据刷新沿用明确刷新路径 |
| EFF-06 / P3 轮询初始化双读 | 开发工具轮询分支完成初次读取后立即再次读取 | 复用初始化读取结果或 promise |
| EFF-07 / P3 头像冷态并发 | 三次同 fileID 并发解析产生三次 SDK 请求 | 合并同 ID 的在途请求，保留既有成功/失败缓存边界 |

源码和完整方法计数见附录 C。锁离页清理、共享赛事 watch、成功头像缓存和幂等重放均已有相应保护，本次优化建议保留这些行为。

## 按查看端小时估算的名义模型

| 场景 | 当前代码节奏 | 忽略网络/处理时间的名义规模 |
|---|---|---|
| 赛事 fallback polling | 成功后约 1.5 秒，带 jitter | 约 2,400 次 get / 查看端小时；健康实时 watch 不适用此模型 |
| 打水普通可见页面 | 完成一轮后等待 8 秒 | 约 450 次云调用、2,250 次 DB 读 / 查看端小时 |
| 打水稳定筛选页面 | 同上，每轮两个读取入口 | 约 900 次云调用、4,500 次 DB 读 / 查看端小时 |
| 本人持续持锁 | 15 秒心跳 | 约 240 次心跳 / 编辑小时 |

真实请求量取决于活跃查看端数、停留时间、编辑时长、网络失败和实时监听占比。**这些是源码操作模型，不能直接换算账单，也不能把日均约 90 人代入并发人数。** 后续应按同一时间窗口取得调用、数据库读写、传输、存储和使用旅程，再决定具体优化投入。

请求日志 TTL、原始/聚合留痕保留、头像旧对象清理和实际存储增长均缺少当前平台证据。应先核引用与幂等期限，再制定保留策略，避免破坏重试或历史资料。

# 9. UI、配置、依赖与工程记录

静态检查确认：16 个注册页面四类文件齐全；可解析的 208 个可达文件、539 条本地引用没有缺失；94 条路由字面量全部已注册；5 个可达 Vant 组件闭包完整；本次可达依赖没有命中项目打包排除项。动态资源、外部字体、真实上传包大小与原生 UI 未验证。

**UI-01 / P3**：资料页对畸形 `returnUrl` 直接执行 `decodeURIComponent`。主控调用实际页面 onLoad，`%` 和非法 UTF-8 转义均在首次 setData 前以 URIError 退出。正常内部构造会编码参数，影响条件是畸形外部 query；建议保护解码并回退到有效内部目标。源码：[`miniprogram/pages/profile/index.js:32–36`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/pages/profile/index.js#L32-L36)。

源码中 develop、trial、release 共用同一个默认云环境；配置标签不能提供数据隔离。26 个云函数声明与目录一致，但其实际 Node、内存、并发、规则、索引和部署包未在本轮取证。当前检查没有输出凭据值；受控文件名扫描未发现跟踪的真实私钥文件，这不是完整 Git 历史密钥审计。

## 依赖扫描

本次对根目录 lockfile 执行 `npm audit --json`，得到 **97 个受影响依赖条目：critical 44、high 27、moderate 25、low 1**。逐项与 lockfile 安装路径核对，全部匹配路径均标记为开发依赖。直接涉及 `miniprogram-ci@2.1.31` 和 `miniprogram-automator@0.12.1`，属于构建、自动化工具链的维护风险。

97 是 npm 汇总的依赖条目数，传递影响会展开计数；它没有证明线上小程序存在 97 个可利用入口。构建环境通常有上传等权限，因此也应认真处理。`miniprogram-ci` 本次扫描未给出直接 fixAvailable；automator 给出的处理是跨版本降级，不适合自动强制采用。

官方公告表明，部分问题依赖处理不可信源码或压缩包等特定入口：例如 [Babel 构建期代码执行公告](https://github.com/advisories/GHSA-67hx-6x53-jw92) 和 [decompress 路径/链接写入公告](https://github.com/advisories/GHSA-mp2f-45pm-3cg9)。应按本项目实际调用链判断可达性，分批更新并验证打包/自动化，不只追求 audit 总数下降。

根目录 audit 未涵盖独立云函数安装树。10-09 已补查：26 个云函数均声明 wx-server-sdk@2.6.3，且均无独立 lockfile；在仓库外只解析一次公共依赖，生成 162 个依赖路径的新锁，npm audit 得到 **17 个受影响依赖条目：3 critical、7 high、7 moderate**。未安装依赖目录，未执行安装脚本，未改动仓库。精确数据库链仍为 node-sdk@2.9.1 / database@1.4.1。

这是当前公共注册表生成的候选安装树，不是当前生产实际包；17 不乘以 26，也不与根目录 97 相加成线上漏洞数。公告中 protobufjs 的代码执行问题要求可影响 schema/descriptor；axios 和 form-data 同样存在具体触发条件，本轮没有证明业务入口满足条件或已遭攻击。完整扫描、版本、哈希和维护者公告见补查附录。实际部署依赖与 CloudBase 运行兼容仍未核验。

GitHub 当前提交没有 Actions 运行和状态检查记录，源文件中有可运行的 test/check/lint 入口。可以后续将现有验证接入远端自动检查，并先修正跨平台测试前提。当前仓库说明中的旧页面/函数数量与最新源码不同，维护时应以本次清单为准。

# 10. 原来 12 项计划逐项对账

下表为仓库中历史 12 项开发计划的对账，区别于用户本次“只进行远端全面检查”的任务。历史手机、原生界面或本机恢复门槛仅保留项目状态；本次不会据此操作用户设备。表中“历史记载”来自固定提交，未重新取得原始本机或生产回执。表格对账完成，不表示这些产品事项已全部验收。

| 原序号与目标 | 本次新增检查证据 | 仍未闭合的原验收 |
|---|---|---|
| 1 开赛超时 | deadline、timeout 声明、算法预算与降级已查；新增 FA-02、BIZ-04 | 最新历史窗口 10-03 02:32:05–10-04 16:48:54，共 96 页、9,591 行、19 个非缺参成功样本，版本/来源未知；未取得满足连续 7 天、≥100、硬超时 0、平台失败低于 1% 的合格原始证据 |
| 2 续费、备份、恢复 | 读到 13,925 文档、2,735 对象、38 函数恢复及三历史集合补档记载；100 条差额是旧汇总错误；本次逐阶段核对来源 | 当前到期/续费、远端备份原件和保留策略未验；13/16 集合差因未知；三集合补档非统一时点完整快照；1 个历史空代码函数及整套 CloudBase 恢复仍缺证据 |
| 3 留痕和故障监控 | 两通道、13 指标矩阵、BIZ-03 完赛误报、TEL-01 缺失耗时报表缺陷 | 平台配置、实收/去重、查询或导出、测试排除与完整窗口报表 |
| 4 原前端缺陷与同步 | 当前相关全量回归、导航/缓存/生命周期代码核对；新增 BIZ-05 | 当前发布包、慢网真实行为、手机验收 |
| 5 录分并发和数据库权限 | 角色/锁/版本/事务代码核对、真实 SDK 事务标识捕获 | 真实多号双机、云事务冲突/回滚、当前生产规则和权限证据 |
| 6 打水首笔体验 | 首笔事件语义、进入/创建/记账链和资源路径已查 | 真实创建队列、匿名账本关联、完整 7 日首笔率与实际阻塞原因 |
| 7 提前收赛 | owner/running/有效比分/活跃锁限制；纯逻辑取消待赛和排名核验 | 真实云部署、原生确认交互与手机 |
| 8 协作管理 | 主办授予撤销、真实成员绑定、guest 排除、权限与版本回归核对 | 真实普通身份、跨会话撤销效果、云规则和手机交互 |
| 9 SDK 与依赖 | 根 lockfile 97 个开发依赖条目；公共云新锁另有 17 个受影响依赖；精确云数据库链与 BIZ-04 | 当前部署依赖、真实 CloudBase Node/错误/日期/事务兼容性与回退验收；候选新锁不代表线上安装树 |
| 10 首屏/同步/大赛事性能 | 单位动作成本、分页扫描、轮询/锁/缓存/头像重复请求可复现 | 低端机首屏、桥接与渲染 P95、真实 DB 读写/传输/账单 |
| 11 云端赛事找回 | 身份绑定 cursor、主办/参赛两路、权威名单二次过滤、静态入口核对 | 云查询实际索引和权限、普通账号跨设备结果 |
| 12 单打 | 84 调度例、8,214 比分断言、60 纯逻辑流程及四模式排名对照 | 最新 UI 像素/大字、原生交互、云部署/手机、当前正式发布版证据 |

源计划：[`docs/reports/2026-10-03-online-audit-and-roadmap.md:93–110`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/reports/2026-10-03-online-audit-and-roadmap.md#L93-L110)。最新对账入口：[`docs/tasks/current.md:19–28`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/tasks/current.md#L19-L28)。

# 11. 尚未完成的线上检查与具体证据需求

本轮已核对可用连接和插件目录，未取得这个项目的腾讯云、CloudBase、CLS、账单或微信统计已认证只读入口。仓库历史记录引用的原始导出多未入库。以下各项因此明确保留为受阻，而不是通过；它们需要的是读取条件或原始材料，不是修复授权。

| 待查项 | 当前可用证据 | 结案所需只读材料 |
|---|---|---|
| 当前发布与部署 | GitHub 当前 HEAD、历史客户端版本和单函数部署文字记录 | 当前客户端版本回执、26 函数及额外函数清单、全包/依赖哈希、运行时/超时/内存/状态 |
| 生产规则、索引与开关 | 期望声明、历史 13/16 集合叙述和有限临时 ACL 观察 | 当前全集合规则/ACL、完整索引及状态、water 功能开关脱敏元数据，附环境和采集时间 |
| 真实日志与开赛稳定性 | 最新历史 19 次成功样本摘要；源码预算和降级反例 | 完整分页的原始日志、窗口和时区、请求去重键、版本/来源、平台/业务结果与耗时；已有隔离事务回执 |
| 使用留痕实收 | 客户端两套代码、字段及报表缺口 | 当前事件定义和字段、实收/拒收、可导出粒度、版本/匿名关联、已有测试标记与完整观察窗口 |
| 资源与账单 | 已量化单位动作读取、轮询、锁和缓存路径 | 同窗口调用/计算、DB 读写/容量、存储/传输、计费分项与套餐；结合查看时长而非把日均人数当并发 |
| 到期、保留和恢复 | 历史备份、恢复及 10-12 到期文字记录 | 当前环境/到期/续费只读状态、远端备份清单和完整性、现有恢复结果、生命周期/TTL 实际配置 |

10 月 3 日记录曾写到期时间为北京时间 10 月 12 日 23:59:59、当时未开启自动续费；没有当前回执，不能据此断言今天仍未续费。备份第一步只需脱敏清单和验收结果，无须批量导出用户明文、头像或身份。若现有只读结果不足以证明云事务、角色竞争或整套恢复，继续标未验证，不改为生产写入试验。

各问题章节中的建议只用于说明目标行为和影响边界，本轮不安排实施工作包。后续是否修复由用户另行决定；本次检查不会提交、部署或发布业务变更。

# 12. 证据使用与最终状态

证据包包含固定源码清单、原始全量日志和回执、专项完整报告、结构化问题、合成输入/输出、全部复现脚本、SDK 发布包和小型离线 SDK 运行依赖、主控独立重算及最终完整性记录。业务仓库和其庞大的开发依赖树没有放进证据包。

要复跑主要问题，先准备固定提交的仓库，再设置 `AUDIT_REPO` 为该仓库绝对路径。运行环境建议与本次 Node 24.19.0 保持一致；具体命令见证据包的 `README.html`。完整全量测试需要先安装仓库依赖，WSL/Windows 专用项仍需相应环境。证据包中的 SDK 探针依赖是精确发布版本，已包含许可证文件。

问题复现脚本返回 0，表示它成功证明了报告所述现状；它不表示该缺陷已经修复。全量测试的原始通过/失败记录与这些问题探针分别保存。

**本版结束状态：可用远端资料和源码验证已完成，报告与证据包已交付；全面检查的当前云平台部分仍因缺少读取条件或原件而未完成。** 确认问题的检查结论已成立，其是否修复不影响检查完成度。原生界面和手机仅作为历史开发计划未验记录，不纳入此次远端操作。主清单 18 项与额外 1 项 P3 防护观察分别计数；未进行业务代码修复。

以下附录保留原专项与 10-09 补查的详细方法、来源时点、可复现输入、独立对照、证据缺口和范围审校。


# 附录 A：业务、身份与事务完整专项

## 赛事业务、身份权限与独立打水账本专项审计

### 结论与审计边界

审计对象为远端仓库 `LXZ56156/repo-20260224-031312` 的 `master` 固定提交 `a3fe96f25015892ac30ee7148f97a5b441b0cb24`。本专项确认 **5 项问题：2 项 P1、3 项 P2**。P1 指应优先修复、涉及数据保留或事务一致性的缺陷；P2 指有明确错误行为，但本次证据的影响限于身份合同、观测质量或客户端显示。

全部工作以远端源码的隔离副本、规格、现有测试及精确版本 SDK 发布包为依据。业务源码没有修改，没有调用生产云函数、查询真实数据库、执行迁移、登录或部署。离线脚本使用合成数据。报告中的“已复现”描述可执行代码在指定条件下的结果，**不等于已在生产发生，也不等于真实云引擎并发或回滚验收通过**。

| ID | 优先级 | 已确认问题 | 影响边界 |
| --- | --- | --- | --- |
| BIZ-04 | P1 | 指定 SDK 的事务内 `where().update()` 请求未携带 `transactionId` | 影响 5 个赛事写入口的事务边界；未调用真实云引擎 |
| BIZ-01 | P1 | 两次旧版 V1 创建交错时，较慢请求可覆盖已成功录入的账本 | 仅仍允许 V1 `create` 的未迁移兼容路径 |
| BIZ-02 | P2 | 普通加入按唯一同名 guest 自动绑定，违背当前“不自动绑定”规格 | 草稿赛事参赛身份归属；未发现因此直接取得主办或协管 |
| BIZ-03 | P2 | 已录场次同比分重试返回赛事 `finished:true`，导致完赛留痕误报 | 当前复现赛事仍运行；未导致云赛事提前结束或直接页面跳转 |
| BIZ-05 | P2 | 录分成功后的补偿投影覆盖较新的权威更正结果 | 当前客户端显示旧比分和记分者；不覆盖云端数据 |

这 5 项问题分别对应不同根因，不把留痕专项引用的 BIZ-03 另行重复计数。已撤回的新轮次、结束账本 UI 不属于修复建议；当前产品仍以“每次创建独立账本”为准。

### 最短离线复核

在当前证据目录可使用一个命令复核全部 5 项。脚本首先检查固定提交，然后串行运行 3 个独立脚本；无需账号和网络：

```bash
AUDIT_REPO=AUDIT_ROOT/repo node AUDIT_ROOT/evidence/business/verify-business.cjs
```

本次执行结果：3 个脚本均退出 `0`，`verification.results.json` 中 `verified:true`。BIZ-01/02/03 由同一脚本加载真实云函数入口；BIZ-03 额外经过真实客户端结果归一化和真实 `activityTracker`，上报出口只捕获到进程内存。BIZ-05 使用真实录分 service 和真实 view model。BIZ-04 使用真实发布的数据库 SDK，仅替换网络传输出口以捕获请求参数。

| 文件 | 内容 |
| --- | --- |
| `reproduce-business.cjs` / `reproduce-business.results.json` | BIZ-01、BIZ-02、BIZ-03 的合成数据、调度和结果 |
| `reproduce-client-score.cjs` / `reproduce-client-score.results.json` | BIZ-05 的两个记分者交错刷新复现 |
| `sdk-inspection/probe-transaction.cjs` / `sdk-inspection/probe-transaction.results.json` | BIZ-04 的真实 SDK 请求捕获 |
| `sdk-inspection/packages.json` | 3 个精确 SDK 发布包的版本、依赖和 SHA-256 |
| `verification.results.json` | 一次命令复核的逐脚本退出结果 |
| `findings.json` | 可供主报告合并的问题和覆盖数据 |

两个业务复现脚本均支持 `AUDIT_REPO`。SDK probe 默认从证据内 `sdk-inspection/runtime/node_modules/@cloudbase/database` 加载精确版本；移交时也可通过 `AUDIT_DATABASE_SDK` 指向独立安装的 `@cloudbase/database@1.4.1`。不要把探针替换传输出口的行为与真实云环境执行混淆。

### BIZ-04：指定版本的条件更新缺少事务标识

**优先级：P1。证据置信度：请求生成行为高；生产发生率与云引擎后果未验证。**

#### 位置和依赖链

以下入口在 `runTransaction` 回调内使用条件更新，且各自 `package.json:6` 固定 `wx-server-sdk: 2.6.3`：

| 入口 | 精确位置 |
| --- | --- |
| 开赛 | [`cloudfunctions/startTournament/index.js:293–306`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/index.js#L293-L306) |
| 导入人员 | [`cloudfunctions/addPlayers/index.js:258`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/addPlayers/index.js#L258) |
| 移除人员 | [`cloudfunctions/removePlayer/index.js:100`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/removePlayer/index.js#L100) |
| 修改设置 | [`cloudfunctions/updateSettings/index.js:144`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/updateSettings/index.js#L144) |
| 设置裁判 | [`cloudfunctions/setReferee/index.js:63`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/setReferee/index.js#L63) |

实际发布包的固定依赖为 `wx-server-sdk@2.6.3 → @cloudbase/node-sdk@2.9.1 → @cloudbase/database@1.4.1`。虽然 wx 包还声明了 `tcb-admin-node:latest`，其实际数据库实现导入的是 `@cloudbase/node-sdk`，不能用另一条未调用依赖链替代核验。

SDK 证据位于 `sdk-inspection/`：

- `wx-server-sdk-2.6.3/package/index.js:1500–1527`：wx `Query.update` 直接委托底层 `query.update(options.data)`。
- `cloudbase-database-1.4.1/package/src/transaction/index.ts:51–57`：事务 collection 会取得事务 ID。
- `cloudbase-database-1.4.1/package/src/query.ts:292–316`：`where` 构建 query 时保留内部事务 ID。
- **同文件 `392–444`：普通 `update` 构造的 `database.modifyDocument` 参数没有 `transactionId`。**
- `cloudbase-database-1.4.1/package/src/document.ts:244–259`：`doc.update` 的请求则明确包含 `transactionId`。

这不是“事务内没有 where 方法”的问题。方法存在，但普通 query update 的请求构造丢掉了事务标识。包内另有 `updateAndReturn` 实现，不能把它携带标识的代码当作普通 `update` 的证据。

#### 复现与实际结果

运行：

```bash
node AUDIT_ROOT/evidence/business/sdk-inspection/probe-transaction.cjs
```

探针加载精确发布的数据库包，仅将 `Db.reqClass` 替换为本地请求捕获器。第一组事务中，`where().update()`、`doc().update()`、`doc().set()` 连续执行；后两者含 `offline_tx_1`，第一条没有事务标识。第二组先 `where().update()`，随后主动抛出合成错误；捕获到的 `abortTransaction` 指向 `offline_tx_2`，此前条件更新请求没有该标识。

**预期：**事务中的赛事更新、请求日志写入和最终提交或回滚应属于同一个事务。

**已确认实际：**普通条件更新生成的请求没有加入事务标识；文档更新和文档写入有标识。源码中的 `where({_id, version})` 仍保留版本条件，这个问题不能表述为“完全没有并发控制”。

**影响：**这 5 个入口的赛事变更不能以现有离线 mock 的事务模型作为原子性证明。尤其开赛和移除人员还依赖同事务请求日志：若业务变更先发生、日志或后续提交失败，存在业务变更与错误返回/请求日志不同步的风险。此次没有调用云引擎，因此不宣称某次真实 rollback 已留下数据，亦不宣称生产所有开赛必定失败。实际部署所携带 SDK 包尚未取证。

#### 修复方向和验收条件

优先改为读取权威事务文档后，通过带事务 ID 的文档更新完成变更；权限、版本语义和请求日志仍保持在同一原子边界。参考当前录分、提前收赛所采用的文档事务写法。不要仅因 mock 支持 `where.update` 就视作完成。

验收至少需要两层证据：精确 SDK 请求捕获能证明赛事写入和日志携带同一事务 ID；在独立云环境中制造日志写失败、提交冲突和重复请求，验证业务/日志同时提交或回滚。后者本次没有执行。

### BIZ-01：旧版 V1 创建竞态可清空已成功写入的数据

**优先级：P1。证据置信度：高；限定旧版兼容入口。**

位置：[`cloudfunctions/waterSession/index.js:184–214`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/waterSession/index.js#L184-L214)。账本 ID 由 owner 的 OPENID 确定；`187–193` 先在事务外读取，`200–210` 构建版本 1 空账本，`213` 无条件 `doc.set`。从第一次读取到 `set` 之间没有事务重读或条件写入。

复现命令：

```bash
AUDIT_REPO=AUDIT_ROOT/repo node AUDIT_ROOT/evidence/business/reproduce-business.cjs
```

合成调度按真实 handler 的异步边界执行：慢创建先读取“不存在”，停在 `set` 前；同一用户的快创建成功；随后添加第 2 位球友、记入 1 条比赛记录，账本达到版本 3；最后恢复慢创建，让版本 1 的空账本 `set` 落下。

| 检查项 | 慢创建恢复前 | 慢创建恢复后 |
| --- | --- | --- |
| 人数 | 2 | 1 |
| 记录数 | 1 | 0 |
| 版本 | 3 | 1 |
| 请求结果 | 创建、添加、记账均成功 | 慢创建也返回成功 |

**预期：**重复或并发创建不能覆盖已经成功创建和记账的同一个账本。

**实际：**迟到的初始 `set` 覆盖了此后已确认成功的记录和球友；当前脚本是确定性合成调度，没有声称测出了云端真实发生率。

当前 `createLedger` 的独立 V2 账本使用不同的创建合同及事务重读，不能把此结果推广为“所有新独立账本会被清空”。但旧链接和 V1 兼容入口仍有代码路径，不能仅因新 UI 不再使用旧模式就忽略数据保留风险。

建议将旧版创建的存在性判断与首次写入放入同一原子边界，遇到已创建的有效账本则返回该账本，不重新初始化。加入上述真实异步交错的回归。修复保持当前“新建独立账本”的产品方向，不恢复已撤回的结束/新轮次按钮。

### BIZ-02：同名普通加入会自动认领 guest

**优先级：P2。证据置信度：行为高；属于现行规格与实现冲突。**

位置：[`cloudfunctions/joinTournament/index.js:256–260`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/joinTournament/index.js#L256-L260) 以昵称匹配唯一 guest；`366–395` 直接把该 guest 改写为当前 server OPENID 的 user，并返回 `claimed:true`。改写字段包含 players、playerIds、pairTeams、rounds、rankings。

当前 [`docs/specs/singles-round-robin-requirements.md:41`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/specs/singles-round-robin-requirements.md#L41) 明确要求“同名不自动绑定”。`docs/specs/cloud-tournament-recovery-proposal.md:9、19` 也将同名与真实绑定分开，要求 guest 明确认领后才具有实际归属。另一方面，现有 [`tests/joinTournament.claim.test.js`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/tests/joinTournament.claim.test.js) 刻意覆盖了自动认领行为，因此这是需要对齐的合同冲突，不能把已有测试通过当作需求已满足。

使用上述 `reproduce-business.cjs`，创建单打草稿赛事，已有 owner 和名为 `Same Name` 的 `guest_audit`。另一个合成真实身份 `audit_unrelated` 只执行普通加入，填相同昵称以及最小资料；请求中没有显式认领字段。

**预期：**按当前规格，单纯同名不能把 guest 自动绑定成此用户。

**实际：**返回 `JOINED`、`claimed:true`，`[audit_admin, guest_audit]` 变成 `[audit_admin, audit_unrelated]`。普通加入因此改变了既有名单中的身份，而非只添加一个独立人员。

影响限于可达的草稿加入/认领和随后基于真实 ID 的参赛归属。没有证据表明这个路径直接授予主办或协管，也没有把同名等同于可冒用任意微信 OPENID。

建议按现行“不自动绑定”规格改为明确的认领流程与冲突提示，并同步修改与该规格冲突的测试。不要通过仅改变规格文字来掩盖未取得确认的身份替换。

### BIZ-03：同比分幂等响应把单场完成当成整场赛事完成

**优先级：P2。证据置信度：高；影响为完赛留痕正确性。**

位置：[`cloudfunctions/submitScore/logic.js:106–119`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/submitScore/logic.js#L106-L119) 的 `buildIdempotentRetryResult` 只检查目标场次已 finished 且比分相同，却固定返回 `finished:true`。`cloudfunctions/submitScore/index.js:46–57、108–121` 包装并返回此结果。正常首次提交的 `index.js:198–205` 则用 `computed.finished` 表示整场赛事是否完成；两个响应路径对同一字段采用了不同粒度。

上述复现脚本使用真实 handler 构造赛事：赛事状态 `running`，目标场次已经 `21:18` 结束，另 1 场仍 `pending`。同比分再次提交得到 `SCORE_SUBMIT_DEDUPED`、`finished:true`，数据库写入次数为 0，赛事仍运行。

脚本随后把真实响应交给真实 `normalizeCloudResult` 和 `activityTracker.finish`，只把 `wx.reportEvent` 替换为内存捕获。捕获结果为 `action:tournament_complete`、`resultCode:FINISHED_CONFIRMED`。

**预期：**未结束的赛事不得上报为已确认完赛。

**实际：**[`miniprogram/core/activityTracker.js:168–171`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/core/activityTracker.js#L168-L171) 根据 `finished:true` 发出完赛确认，即使比赛仍有待录场次。此问题与“重复观察已完赛状态不能代表首次完赛”不同：这里连“已完赛状态”本身也不成立。

#### 客户端消费者范围

[`miniprogram/core/cloud.js:72–81`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/core/cloud.js#L72-L81) 的状态归一化也读取 `source.finished`，但显式 `state` 以及 `deduped` 分支先执行。当前生产去重响应保留 `state:deduped`，复现也断言了这一点。录分 service 的下一场选择、返回和赛事状态读取刷新后的赛程，不直接以该响应 flag 判定。

因此本次已确认影响限于错误的完赛事件；不报告为云赛事提前收赛、排名提前结算或该字段造成的直接导航错误。留痕专项应引用此 ID，避免重复列出同一根因。

建议使去重响应与首次成功响应保持相同的赛事级 `finished` 语义，并用“目标已完成、其他场待录”的真实 handler 到 tracker 回归覆盖。只在 tracker 中忽略去重事件会掩盖后端字段不一致，也会丢掉真实已完赛状态的合法观察。

### BIZ-05：提交后的本地补偿覆盖较新的权威比分

**优先级：P2。证据置信度：高；仅客户端投影错误。**

位置：[`miniprogram/pages/match/matchSubmitService.js:142–154`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/pages/match/matchSubmitService.js#L142-L154)。提交成功后刷新，如果刷新结果不等于本次尝试的比分，就调用 `buildLocalSubmittedTournament`。该函数在 `78–108` 克隆当前最新赛事，将本次旧比分及记分者覆盖上去，再用 `Math.max(currentVersion, resultVersion)` 保留较新版本号。`111–125` 将投影作为最新视图，并设置 `syncUsingCache:false`、`showStaleSyncHint:false`。

复现命令：

```bash
AUDIT_REPO=AUDIT_ROOT/repo node AUDIT_ROOT/evidence/business/reproduce-client-score.cjs
```

脚本加载真实 service 和真实 `buildTournamentViewState`，只以确定性响应替换远端及原生 UI：

1. 用户 A 提交 `21:18`，服务端成功响应版本 2。
2. 刷新发生前，合法用户 B 已更正为 `18:21`，版本 3。
3. `fetchTournament` 实际返回并应用了权威版本 3。
4. 提交成功收尾因为“分数不同”而补偿，再把旧 `21:18` 和 A 的记分者身份放回本地版本 3。

| 数据 | 版本 | 比分 | 记分者 |
| --- | --- | --- | --- |
| A 的成功响应 | 2 | 21:18 | A |
| 权威刷新 | 3 | 18:21 | B |
| 收尾后的本地视图 | 3 | 21:18 | A |

**预期：**已读取到比提交响应更新的权威版本，应尊重其中的合法更正。

**实际：**客户端显示旧比分和旧记分者，显示“已提交”，并清除过期数据提示。脚本没有产生第二次云写入，云端仍是 B 的正确更正。未验证真机显示持续时长，也没有证据宣称错误投影被写入永久缓存；新的刷新可能恢复正确结果。

建议比较刷新文档与成功响应的版本：只有远端缺失或能证明比已提交版本旧，才使用本地提交投影；当读到更新权威文档时直接保留。该回归需要覆盖“提交成功后他人更正、然后本客户端刷新”，只测网络失败的本地兜底不足以覆盖这个条件。

### 完成的检查面与保留的验证边界

下表描述本专项实际阅读和跟踪的范围；“存在约束”表示在代码中找到了相应校验，不等于真实云环境验收通过。

| 检查面 | 已检查内容与结论 | 对应入口或证据 |
| --- | --- | --- |
| 赛事创建/复制/重置/删除 | 请求去重、主办权限、复制与重置清理手动完赛元数据；未新确认问题 | `createTournament`、`cloneTournament`、`resetTournament`、`deleteTournament` |
| 草稿人员和设置 | 加入/导入/移除、guest 认领、固定队伍、分队、裁判、版本更新；确认 BIZ-02、BIZ-04 | `joinTournament`、`addPlayers`、`removePlayer`、`managePairTeams`、`setPlayerSquad`、`setReferee`、`updateSettings` |
| 开赛 | 事务入口、请求日志、草稿与权限检查、提交后结果；确认 BIZ-04，排阵质量由公平性专项覆盖 | `startTournament` |
| 录分与锁 | 服务端身份、比分边界、session/owner/expiry、锁消耗、事务冲突、旧分数字段与旧 session 兼容；确认 BIZ-03、BIZ-05 | `submitScore`、`scoreLock`、match submit/view model |
| 提前收赛 | 主办且 running、至少 1 个有效结果、活跃锁拒绝、仅取消待录场次、手动终止不复活、复制/重置清元数据 | `finishTournament`、`submitScore/logic.js`、相关合同测试 |
| 协管 | 仅主办授予/撤销、绑定 roster 交集、guest 排除、管理能力不等于主办；撤销/移除与版本冲突检查 | `manageCoManagers`、共享 permission、管理入口 |
| 云端找回 | server OPENID、主办和参赛两路、权威 roster 二次过滤、身份绑定 cursor、分页与错误不能伪装为空成功 | `getMyTournaments`、找回规格及测试 |
| V1 账本兼容 | owner 写权限、版本、有限旧 request ID 去重、活动投影上限、迁移门槛与旧链接；确认 BIZ-01 | `waterSession/index.js` V1 路由 |
| V2 独立账本 | 每次独立 `createLedger`、请求 ID/载荷冲突、事务重读、owner/member 历史列表、当前与历史访问范围 | `waterSession/index.js` V2 创建、列表和查询 |
| V2 多人账本 | 成员身份文档、最大 24 人、姓名冲突、明确认领、功能开关、只读降级、公开字段白名单 | V2 roster、member、capability 入口 |
| 更正和撤销 | root/room/round 一致性、当前记录链、owner/原操作者权限、不可变事件、差额聚合、回放先于状态拒绝 | V2 record/correct/reverse/getEntry；`waterLogic.js` |
| 旧数据迁移 | 重点复核计划与源 hash、确定性目标、人数/记录/每人账务核对、staging/checkpoint、激活前源版本与 hash 重验；未执行任何真实迁移 | `waterMigration.js` 核心计划、写入与激活路径；相关测试 |
| SDK 与 mock 边界 | 精确依赖包读取、query/doc 写请求对比、合成 abort 参数捕获；确认 BIZ-04 | `sdk-inspection` 完整证据 |

`waterLogic.js` 的赢水/请水变化使用整数校验、净额等于赢水减请水、总赢水等于总请水及净额总和为零的约束；更正应用新旧 effect 差额，撤销应用相反 effect。代码层面未在此次检查中发现新增的账务守恒缺陷。

已检视的现有回归入口包括 `coManagers.contract.test.js`、`finishTournament.contract.test.js`、`submitScore.index.test.js`、`submitScore.idempotent-retry.test.js`、`scoreLock.*.test.js`、`waterSession.v2-cloud.test.js`、`waterSession.v2-migration*.test.js` 等。全量基线由主控执行并在总报告汇总，本专项没有重复全量测试。包含“20 并发写入”等字样的现有用例采用进程内事务替身，不能据其名称宣称真实云事务并发通过。

真实部署版本、云端数据库规则/索引实际生效状态、真实 OPENID 与多设备行为、云引擎冲突/回滚、生产使用频次和真机 UI 仍属未验证。本专项没有用模拟测试替代这些证据，也没有因没有发现更多问题而将其标为通过。SDK 依赖包和所有复现文件均保存在证据目录；源码工作区在复核后保持干净。

# 附录 B：排赛、比分与排名完整专项

## 排赛公平性、循环覆盖与比分排名专项审计

基准：`LXZ56156/repo-20260224-031312`，`master`，`a3fe96f25015892ac30ee7148f97a5b441b0cb24`。本专项仅读取远端取得的固定源码，在隔离环境中执行纯逻辑、页面投影及离线模拟云函数入口验证，没有修改业务代码、调用真实云 SDK、访问真实数据或进行部署。完成日期：2026-10-09（上海）。

### 结论

本次检查覆盖四种赛制。已验证的赛程数量、人员合法性、同批互斥、固定组合保持和完整循环逐对覆盖均通过；单打终局规则与客户端/云端排名算术也通过独立验证。**合法赛程不自动等于均衡质量符合当前目标。** 已确认四项需要分别处理的发现：

| 编号 | 发现 | 性质 | 建议优先级 |
|---|---|---|---|
| FA-01 | 8 人单场地从 16 场增到 17 场，跨模板上限后搭档/对手覆盖由 28 种降至 12 种，17 场只有 6 种完整对阵 | 当前均衡目标下的质量断崖；有休息取舍，不是成员/场次非法 | P2，优先调整目标 |
| FA-02 | 12v10、5 场地、24 场的真实超时降级结果，A 队有人 5 场、有人 3 场，存在各方面不更差的人人 4 场排法 | 可严格改善的排赛质量缺陷 | P2，修复降级路径 |
| FA-03 | 8v8、2 场地、16 场模板每人仅遇到对方 4/8 人；允许最多连打 2 批即可搭档与对手均无重复 | 已证实的产品目标取舍 | P2，按本轮偏好调整；不计硬错误 |
| FA-04 | 固定搭档排程把休息名单恒置空，页面漏掉实际轮空球员 | 已复现的信息显示缺陷 | P2 |

前两项和第三项有关，但证据与适用条件不同，不能合并后笼统称为“排赛算法有错”。FA-01 是模板与运行时目标不一致形成的突变；FA-03 是固定模板刻意采用的休息优先取舍；FA-02 在连打与重复指标不恶化的条件下仍然可以改善，因此不是不可避免的取舍。

### 一、独立验证范围与结果

| 范围 | 本次执行 | 结果与证据 |
|---|---|---|
| 单打循环 | 2–8 人 × 1/2 场地 × 1/2 循环 = 28 组，每组正序、倒序、循环移位 3 种名单，共 84 例 | 逐循环每对恰好一次、上场次数、逻辑轮互斥、同批互斥、唯一坐标、奇数每人每循环一次轮空、输入不变均通过；`independent-results.json` |
| 固搭循环 | 2–12 队，1/2/3/10 场地，1/2/3/5/10 完整循环及不整除场数边界，共 384 例 | 场数、固定成员、同批互斥、每队对阵次数 floor/ceil 分布和完整循环上场次数通过；320 例存在应有休息者而名单为空，单独列为 FA-04 |
| 多人转模板 | 60 个模板，全部 941 个支持场数前缀，经实际模板实例化路径 | 全部数量与成员检查通过；没有完全重复对阵；每个前缀的上场次数差达到算术下界 0 或 1；独立统计与生产 fairness 字段无差异；`template-results.json` |
| 单打终局比分 | 独立逐分探索合法可达终局，然后检查每种分制 -1…35 的全部双方比分 | 11/15/21 分共 4,107 个输入对，客户端与云端共 8,214 次断言通过；21 分包含 20 平追分、30 封顶 |
| 四赛制排名 | 4 赛制 × 50 组完赛/未赛/取消组合，共 200 组，独立算术与两端核心对照 | 400 次两端结果对照通过；沿用旧三模式自由比分合同，不误报其保留的小数取整行为 |
| 单打完整逻辑流程 | 2/3/4/6/8 人 × 1/2 场地 × 1/2 循环 × 11/15/21 分，共 60 条流程 | 生成、部分录分、更正、提前收赛分支、继续全赛程、重置通过；1,014 次提交或更正均核对独立排名；过期排赛截止参数拒绝为 START_TIMEOUT |
| 小规模穷举参照 | 4v4、单场地、3 场，穷举 36³ = 46,656 个有序排法，其中 8,100 个达到上场次数差 1 | 当前结果处于帕累托前沿；见下节，不把必要的一次重复当成缺陷 |
| 非模板与降级 | 15 例多人转、12 例普通小队转/自然超时、4 例强制降级，共 31 例 | 所有样例场数完整、人员及批次合法、两队边界正确、休息名单一致、独立指标与生产字段吻合；公平质量问题另列 |
| 关键参数入口可达性 | 仅追加 FA-01 与 FA-02 两条创建→导入→分队（小队转）→设置页选择与保存→开赛流程 | 实际源函数与真实生成器执行，SDK/数据库/页面视觉副作用离线模拟；17 场和 24 场均原值保存并生成，未被模板上限截断；`reachability-results.json` |

以上是不同层次的覆盖数量，不能相加包装成统一的“通过率”。模板 941 例验证的是模板实例化路径；外层 `generateSchedule` 的小场数轮序优化只在相关样例与仓库基线中验证，不把它说成 941 次外层完整运行。真实计时的 27 例自然路径样本耗时约 14–4,503 ms，另 4 例强制降级约 0–1 ms。它们是当前审计机器上的观测，不能当作真实云端 P95、手机时延或线上成功率。

### 二、FA-01：跨模板上限后的均衡质量断崖

#### 触发与结果

8 人、1 场地，人数不变，仅把总场数从 16 改为 17。前者使用模板，后者超出 `horizonMatches` 后进入限时搜索。固定种子 1，本次运行时与独立复核均重现：

| 指标 | 当前 16 场模板 | 当前 17 场运行时 | 可行 17 场对照 |
|---|---:|---:|---:|
| 实际场数 | 16 | 17 | 17 |
| 上场次数差 | 0 | 1 | 1 |
| 不同搭档组合 | 28/28 | **12/28** | **28/28** |
| 不同对手组合 | 28/28 | **12/28** | **28/28** |
| 搭档重复次数 | 4 | **22** | 6 |
| 对手重复次数 | 36 | **56** | 40 |
| 不同完整对阵 | 16 | **6** | **17** |
| 最大连续上场批数 | 2 | **1** | **2** |

对照不是搜索器自行给自己评分：审计将当前 16 场模板保留，再独立枚举追加一场，找出仍满足人数/场地/同批互斥、最大连打不超过 2 且不重复完整对阵的排法。完整排程和独立矩阵均保留在 `quality-counterexamples.json`。

#### 参数确实可从产品入口到达

这不是只能绕过页面校验调用内部函数的参数。8 人单场地的选项定义同时写明模板长度 16 和 `supportsAdvancedCustom: true`，见 [`multiRotateMatchOptions.js:681–692`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/core/ux/multiRotateMatchOptions.js#L681-L692)。设置页确实提供“高级自定义”数字选择器，见 [`settings/index.wxml:56–79`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/pages/settings/index.wxml#L56-L79)。这里的配置上限是 `3 × C(8,4) = 210`，不是 16。

补充脚本执行真实 `createTournament` 与 `addPlayers` 源入口生成 8 人自定义赛，再调用真实设置页的高级入口、数字选择事件（`017`）与保存方法。保存载荷、离线数据库、重新打开的表单、`validateBeforeGenerate` 均保留 `17/1`；`checkStartReady=true`。实际 `startTournament.main` 向 `generateSchedule` 传入 8 人、17 场、1 场地、4,500 ms 预算，最终 `scheduledMatches=17`，使用 `beam-guarded`。记录见 `reachability-results.json`。

字段传递与限制分别位于 [`settingsActions.js:139–153`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/pages/settings/settingsActions.js#L139-L153) 与 [`281–308`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/pages/settings/settingsActions.js#L281-L308)、[`updateSettings/index.js:94–127`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/updateSettings/index.js#L94-L127)、[`startTournament/logic.js:95–138`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/logic.js#L95-L138) 和 [`startTournament/index.js:143–190`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/index.js#L143-L190)。16 是模板命中边界；超过它会改走运行时路径，不会把需求改成 16。

#### 原因与适用边界

[`rotationDoublesEngine.js:885–895`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/rotationDoublesEngine.js#L885-L895) 在超过模板上限时返回无模板。运行时比较器在 [`121–140`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/rotationDoublesEngine.js#L121-L140) 先比较上场差、连打和休息，之后才比较完整对阵、搭档与对手。这样会优先选择“最大连打 1”的方案。

在 8 人单场地、每批 4 人上场且不允许连续上场时，相邻两批必须是互补的两组 4 人，因此两组成员始终不交叉。每组只有 6 种球员两两关系、3 种完整双打对阵，合计上限恰好为 12 种关系、6 种完整对阵。这解释了观察到的结果：仅增加搜索时间不能消除这个限制，必须改变目标优先级或允许最多连打 2 批。

**性质：赛程本体合法，但不符合本轮强调搭档与对手均衡的目标，且存在用户难以预期的参数边界突变。** 没有把“更均衡但连打略增”的对照说成无代价全面优于当前结果。

#### 建议与验收

将硬合法性和人数上场均衡作为底线；明确搭档与对手的联合目标，再把连续上场作为约束或次级指标。模板与实时搜索采用相同目标，增加模板上限两侧成对比较。不要只改 `beta/gamma`：现代路径的主比较器是显式的优先级排序。修后至少复核 8 人单场地 14/16/17 场，以及其他模板上限前后一场，报告覆盖、重复、连打三者。

### 三、FA-02：小队转降级产生可避免的上场次数差

#### 触发与结果

12 人 A 队、10 人 B 队、5 场地、24 场。该参数通过当前开赛参数验证。本次真实时钟运行预算为 4,500 ms，搜索未完成后自然进入 `greedy-fallback`，赛程完整，但 A01 打 5 场、A12 打 3 场，其余 A 队成员各 4 场。A 队总上场人次 48，12 人各 4 场是可行目标。

补充入口验证从真实 `createTournament` 创建自定义小队转，导入至 22 人，再经真实 `setPlayerSquad` 分为 12/10。页面与开赛云函数都仅要求 A/B 各至少 2 人，没有两队人数必须相等的限制，见 [`draftStartReadiness.js:37–41`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/core/draftStartReadiness.js#L37-L41) 与 [`startTournament/logic.js:119–138`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/logic.js#L119-L138)。设置页可选 1–10 场地、数字总场数；此时当前实现的总场数上限为 `3 × C(22,4) = 21,945`，见 [`settingsViewModel.js:239–317`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/pages/settings/settingsViewModel.js#L239-L317)。

真实设置页事件选择 5 场地、`00024`，保存结束条件为“打满总场数”。保存、重新读取、开赛校验与实际 `buildSquadSchedule` 实收均为 24 场、5 场地。有效场地是 `min(5, floor(12/2), floor(10/2))=5`；“总场数”路径保留 24，不会向上取成 25，也不会截为模板长度，见 [`scheduleModes.js:554–568`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/scheduleModes.js#L554-L568)。这次真实源入口的离线完整流程再次自然进入 `greedy-fallback`，最终生成 24 场。补充流程没有注入种子或强制降级标记，质量见证仍以原固定种子证据为准；不据此推断线上触发率。

针对最初保存的固定种子自然超时样本，直接调用同一降级路径，验证输出与原样本赛程逐项相等。审计仅修改对照样本中的一次上场替换和同批队内成员交换，找到 13 份严格改善见证，所选见证为：

| 指标 | 当前降级结果 | 独立对照 |
|---|---:|---:|
| A 队上场次数 | 3–5 | **全部 4** |
| B 队上场次数 | 4–5 | 4–5，原样保留 |
| 全员上场次数差 | 2 | **1** |
| 搭档重复 | 3 | 3 |
| 对手重复 | 11 | **10** |
| 最大连续上场批数 | 5 | 5 |
| 不同完整对阵 | 24 | 24 |
| 总场数/批数 | 24/5 | 24/5 |

因此这里不是“人员数不同导致平均上场数不同”的必然情况，也不需要以更差搭档、对手、连打或场地使用来交换上场均衡。

#### 源码原因与修复方向

[`scheduleModes.js:179–244`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/scheduleModes.js#L179-L244) 虽然先按上场数选第一人，但第二人通过加权代价选取，次数差只乘以 2，没有保证最终每队的上下界可达。降级主循环位于 [`250–366`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/scheduleModes.js#L250-L366)，正常搜索失败后的调用位于 [`692–714`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/scheduleModes.js#L692-L714)。

修复宜为降级路径补足同队上场配额约束或有界局部调整，不能用“已生成足够场数”代替均衡验收。回归应分别统计 A、B 队；大小队人数不等时，不要求两队所有人都打相同场数。本项不包含真实云上的超时发生频率结论。

### 四、FA-03：8v8 模板的明确休息取舍

8v8、2 场地、16 场走 [`scheduleModes.js:111–144`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/scheduleModes.js#L111-L144) 的固定模板，命中条件为 [`586–597`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/scheduleModes.js#L586-L597)。现有 [`squad.fairness.test.js:354–369`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/tests/squad.fairness.test.js#L354-L369) 明确锁定最大连打 1、搭档重复 8、对手重复 32，故它不是本次新增的偶发现象。

每人 4 场，但只和同队 3 名不同搭档合作、只面对对方 4 名不同球员。独立对照把二进制异或差值 0…7 分成四组，构造 16 个互不重复的 2×2 对阵块，使每个 A–B 球员对恰好相遇一次；四轮不同配对也保证搭档不重复。再把每轮分成 2 个场地批次：

| 指标 | 当前模板 | 独立对照 |
|---|---:|---:|
| 每人场数 | 4 | 4 |
| 每人不同搭档 | 3 | **4** |
| 每人不同对手 | 4 | **8** |
| 搭档重复总次数 | 8 | **0** |
| 对手重复总次数 | 32 | **0** |
| 最大连续上场批数 | 1 | **2** |
| 场数/批数 | 16/8 | 16/8 |

与 FA-01 类似，坚持“不连打”会把双方各自固定成两组 4 人，上述覆盖限制随之产生。当前模板在这个限制下并非明显失误；本轮用户强调搭档与对手均衡，应把允许最大连打 2 的方案列为优先候选。**该项单独记录为目标取舍，不计为硬规则错误。** 完整两套排法在 `independent-results.json` 的 `squadCounterexample`。

### 五、FA-04：固搭轮空名单丢失

最小完整例：3 支固定队伍、1 场地、一循环共 3 场。每轮有一支 2 人队伍休息。

[`scheduleModes.js:817–821`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/startTournament/scheduleModes.js#L817-L821) 恒写入 `restPlayers: []`。[`schedule/index.js:156`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/pages/schedule/index.js#L156) 与 [`210–214`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/pages/schedule/index.js#L210-L214) 用该数组生成轮空文本；[`index.wxml:124–125`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/pages/schedule/index.wxml#L124-L125) 在文本为空时不显示此区。

审计实际调用生成器、标准化函数和页面 `decorateRounds`：三轮预期休息名单依次为 P01/P02、P03/P04、P05/P06，实际存储都为空，页面文本也都为 `''`。这是源码到页面投影的完整复现，不是仅凭字段名猜测；没有宣称已经在微信原生屏幕上看过。

修复时按本批次实际活跃成员的补集计算休息名单，并明确是已组队参赛者还是全部名单参与补集；存在未组队成员时遵守原有产品语义。至少验收奇数队轮空和场地不足导致同轮分批两个场景。详情 `fixed-rest-results.json`。

### 六、不应误报的情况与证据边界

1. 4v4、1 场地、3 场当前“搭档重复 0、对手重复 1、最多连打 2”处于本次穷举得到的帕累托前沿。另有“搭档重复 1、对手重复 0、最多连打 2”；不存在上场均衡相同、两项都为 0 的排法。不能因为出现一次重复就认定错误。
2. 旧三个模式的自由比分、小数取整和按显示顺序分配名次是现有明确保留的合同，本轮没有擅自套用单打终局或并列名次规则。
3. 单打 4 人两场地没有候补时，每批全部上场，连打不可避免；单打规格本就不承诺人人隔批休息。
4. 固搭部分循环对阵次数可以是 floor/ceil，并非必须整循环；本次验证按当前支持任意合法总场数的行为进行。
5. 部分质量测试使用确定性操作时钟，证明的是算法质量路径，不等于真实超时环境。本次另行运行真实时钟路径并保留实际排程，但不能推断云端复现概率。
6. 没有线上活动日志，无法判断这些参数被多少用户使用。不能用本次合成案例推算日均约 90 人中的受影响比例。
7. 原生微信界面、云事务、发布版本、实机桥接时延仍由总报告列为独立验证边界。这里的排名、提前收赛与重置验证是纯逻辑，不替代真实事务与权限验收。

### 七、复现与证据文件

所有脚本通过公共 helper 支持 `AUDIT_REPO`，默认取证据目录的 `../../repo`。需要 Node.js 22+；不需要安装业务依赖，使用 Node 内置模块与仓库纯逻辑。请针对上述固定提交复跑。

最快复核四个发现的命令（本机约 2 秒）：

```bash
AUDIT_REPO=AUDIT_ROOT/repo node AUDIT_ROOT/evidence/fairness/reproduce-findings.cjs
```

此命令重新执行 17 场实际运行时、12v10 的同一降级逻辑、8v8 固定模板、固搭生成器和页面投影，同时独立重算已保存的对照排法。12v10 的自然超时路径及其与强制降级的等同性由 `runtime-results.json` 和 `quality-counterexamples.cjs` 保留；需要重演真实超时过程时再运行 `runtime-audit.cjs`。

仅复核上述两组参数的产品入口可达性（本机约 6.3 秒）：

```bash
AUDIT_REPO=AUDIT_ROOT/repo node AUDIT_ROOT/evidence/fairness/reachability-audit.cjs
```

此脚本执行实际云函数源入口、实际设置页选择/保存代码和真实生成器，仅替换 SDK、内存数据库、页面视觉与传输副作用。它证明该提交中的正常参数路径可达，不能替代微信实机、真实云数据库或发布版本验收。实际算法参数在不改写的包装器中记录；补充运行未改种子和预算。

| 脚本 | 对应证据 | 用途 |
|---|---|---|
| `independent-audit.cjs` | `independent-results.json` | 单打、固搭、终局比分、独立排名与 8v8 对照 |
| `template-audit.cjs` | `template-results.json` | 全部 60 个模板、941 个前缀 |
| `small-reference-audit.cjs` | `small-reference-results.json` | 小规模完整穷举参照 |
| `fixed-rest-repro.cjs` | `fixed-rest-results.json` | 固搭生成到页面投影复现 |
| `runtime-audit.cjs` | `runtime-results.json`、`runtime-run.log` | 31 个限时搜索/降级样例和完整排程 |
| `quality-counterexamples.cjs` | `quality-counterexamples.json` | 17 场追加排法与 12v10 严格改善见证；先有 runtime 证据 |
| `singles-lifecycle-audit.cjs` | `singles-lifecycle-results.json` | 60 条单打纯逻辑流程、1,014 次独立排名状态核对 |
| `reproduce-findings.cjs` | 标准输出 | 四发现最短复核，不重跑全部审计 |
| `reachability-audit.cjs` | `reachability-results.json` | 仅两组关键参数经真实创建/配置/开赛源入口后保持原值并进入相应算法 |

本专项已完成计划内的源码、独立参照、合法性、均衡和排名验证；未实施上述修复或调整。

# 附录 C：使用留痕与资源效率完整专项

## 使用留痕与资源效率专项审计

### 基准、范围和结论

- 仓库：`LXZ56156/repo-20260224-031312`。
- 固定版本：`a3fe96f25015892ac30ee7148f97a5b441b0cb24`（`master`）。
- 审计日期：2026-10-09，北京时间。
- 方法：读取固定远端源码与合同，在隔离环境直接加载未修改的生产模块，用内存数据库、合成微信接口和受控计时器进行定向复现；未读取或写入真实业务数据库，未运行原生微信客户端、部署、上传或发布。
- 用户给定背景：用户提供的日均约 90 人，人数口径未核实；自然增长，实际用途和使用路径未知。该人数没有作为同时在线人数或账单依据。

**当前已有客户端事件采集代码，但缺少平台配置、实收、逐条查询/导出和可用业务报表的闭环证据。资源方面，已证实历史账本每页全扫描、筛选状态下不变账本重复查询、慢锁请求重叠、赛事完整缓存不随最近列表淘汰；还有首页排序、轮询初始化和头像冷缓存并发等较低优先级的重复请求。**

本报告将已复现问题、现行设计的成本、尚未实现的分析能力和缺少线上证据的风险分别记录。没有把所有轮询都认定为浪费，也没有将源代码中的数据库方法调用次数换算成计费文档数或费用。

### 证据与复跑

| 脚本 | 输出 | 直接验证的内容 |
|---|---|---|
| `resource-probes.cjs` | `resource-results.json` | 实际 waterSession handler 的数据库读写数量；历史第一页/第二页成本；赛事轮询不变数据与初始化双读；锁请求未决重叠与计时器清理 |
| `telemetry-probes.cjs` | `telemetry-results.json` | 实际 activity/growth 字段；固定业务码折叠；finished 观察的重复语义；CLS 缺失耗时被记为零的反例 |
| `frontend-resource-probes.cjs` | `frontend-resource-results.json` | 实际 water 页面不变刷新调用；完整缓存滞留；首页排序远端查询；头像冷态请求缺少跨调用合并 |

三个脚本均无需安装真实微信 SDK，不访问网络，结果中的身份与数据均为合成数据。复跑目录可以任意，脚本按自身位置寻找 `../../repo`：

```bash
node evidence/telemetry/resource-probes.cjs
node evidence/telemetry/telemetry-probes.cjs
node evidence/telemetry/frontend-resource-probes.cjs
```

上述是独立问题复现，不替代根任务的全量测试。它们证明对应源码路径的行为，不能证明云端执行时间、SDK 事务行为、原生生命周期调度或后台接收成功。

### 一、两套事件与两个报表入口

#### 1. 新 activity 通道

代码链路为：页面或业务封装 → `core/cloud.call` → `activityTracker.begin` → `wx.reportEvent('activity_attempt', data)`；云调用返回或最终 SDK 异常 → `activityTracker.finish` → `activity_result`。独立打水入口另外发送 `activity_view`；分享入口与赛事分享回调直接调用 tracker。

实际 17 个字段为：`schemaVersion`、`eventId`、`operationId`、`intentId`、`attemptIndex`、`eventTime`、`phase`、`action`、`anonymousSessionId`、`traceId`、`appVersion`、`envVersion`、`result`、`resultCode`、`durationMs`、`retryCount`、`firstEntry`。

采样验证：向真实 `cloud.call` 传入 `mode/playerCount/courtCount/cycleCount/tournamentId` 后，这些字段均不进入 activity 事件。该剔除符合当前隐私合同，说明这些业务维度尚未纳入本通道，不是字段意外丢失。

实现中的合理边界已经确认：

- 单次 `cloud.call` 只有一对 attempt/result；内部网络自动重试仍是同一 operation，最多两次自动重试。
- 手动重试只在同进程、同函数及原始 action、同合法 clientRequestId 的条件下关联 intent；最多 100 组、从首次调用起 30 分钟过期。
- `anonymousSessionId` 是进程内随机值，不能表示跨重启的同一用户。
- 不采读取、锁心跳和锁释放，避免高频后台刷新直接放大新埋点量。
- reportEvent 缺失或抛错不阻塞业务，当前没有持久化队列、独立云接收调用或埋点重发。
- firstEntry 仅在原始记账返回权威 `seq=1` 时为 yes；重放为 replayed，未知不伪造 yes。
- 分享回调结果为 `DELIVERY_UNKNOWN`，没有将按钮调用当成送达。

来源：[`miniprogram/core/activityTracker.js:1–210`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/core/activityTracker.js#L1-L210)；[`miniprogram/core/cloud.js:471–558`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/core/cloud.js#L471-L558)；[`miniprogram/core/waterSession.js:18–45`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/core/waterSession.js#L18-L45)；[`miniprogram/pages/water/index.js:541–560`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/pages/water/index.js#L541-L560)。

#### 2. 旧 growth 通道

页面/分享/录分成功等特定路径 → `growthTracker.track` → 控制台诊断与 `wx.reportEvent(原事件名, data)`。字段只有 `t/s/m/src/a/r/ts`。

其中 `m` 支持现有四种赛制，`s` 支持 draft/running/finished，`t` 为 32 位赛事 hash。**因此不能说完全没有赛制数据**；在平台确有实收的前提下，可以观察现有事件覆盖页面的赛制分布。但它没有 operation/session/version/env 字段，与 activity 没有共同的可靠关联键，不能把两个通道拼成逐赛事、逐意图的完整转化漏斗。32 位赛事 hash 也不应升级为长期身份或防碰撞标识。

覆盖位置包括：ranking、analytics、share-entry、match_open、score_submit_success、部分首页复制/回顾、赛事引导与分享入口；创建和开赛的统一请求结果由新 activity 通道覆盖。名单规模、场地数、循环数没有在这两套通道形成统一统计字段。

来源：[`miniprogram/core/growthTracker.js:1–68`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/core/growthTracker.js#L1-L68)；[`miniprogram/pages/match/matchSubmitService.js:390–425`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/pages/match/matchSubmitService.js#L390-L425)；各页面 `growthTracker.track` 调用点。

#### 3. 平台访问报表和 CLS 运维报表

- [`scripts/fetch-we-analysis.js`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/scripts/fetch-we-analysis.js) 读取微信 datacube 的标准访问、页面、画像、留存等接口；[`scripts/we-analysis-report.js`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/scripts/we-analysis-report.js) 对显式 manifest 的已有响应离线汇总。它们不是自定义 activity 事件接收/查询器。日 UV 累加为人日，不是周期内独立人数；页面 UV 不能直接组成跨页漏斗。
- [`scripts/cloud-ops-daily-report.js`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/scripts/cloud-ops-daily-report.js) 读取显式 manifest 中的 CLS 原始/聚合 JSON，按 function/request 去重，核对查询窗口和分页，区分平台成功与业务成功，并报告耗时覆盖。它没有解析或保留 activity 的 action/eventId/operationId，也不提供 reportEvent 的逐条实收对账。
- 本轮远端源码不含合同提到的独立 `reportOpsActivityEvents` 接收包原件；既有合同明确该包与当前字段/ID/事件枚举不兼容。不能把旧包描述或 `ENABLE` 开关当成当前通道可直接启用的证据。

来源：[`scripts/fetch-we-analysis.js:14–24`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/scripts/fetch-we-analysis.js#L14-L24)；[`scripts/we-analysis-report.js:118–171`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/scripts/we-analysis-report.js#L118-L171)；`scripts/cloud-ops-daily-report.js:29–42,74–220`；[`docs/specs/activity-observability.md`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/specs/activity-observability.md)。

### 二、指标可用性与缺口矩阵

下表中的“可统计”均以平台实际接收、字段保留和查询能力得到验证为前提；本轮没有取得该前提的线上回执。

| 需要回答的问题 | 当前可利用的源码能力 | 当前无法证明或缺少的环节 | 最小补齐方向 |
|---|---|---|---|
| 每天多少人、多少新用户、哪些页面有访问 | 标准 datacube 访问/页面/留存入口 | 本轮无新完整日期窗口原始响应；activity session 不能替代人数 | 使用标准统计的明确口径，保留日期和完整性，不重造身份统计 |
| 哪些赛制实际常用 | growth 的部分页面与成功事件含 m | 创建/开赛结果不含 mode；现有页面选择偏差；后台实收未知 | 在获批匿名合同中对关键业务动作加入固定 mode 枚举，再核实接收 |
| 活动人数、场地、循环数通常是多少 | 两通道无统一规模字段 | 无可靠规模分布 | 使用整数或明确分桶；字段从已验证业务状态取值，禁止自由文本 |
| 创建后没有开赛的比例 | activity 有 create/start 的独立操作 | 缺少同一赛事匿名关联键、创建队列、观察期及取消定义 | 先定义赛事级匿名关联和窗口，不用同一进程的事件先后关系强行配对 |
| 开赛、录分、更正分别失败在哪里 | activity 的 attempt/result、retryCount、固定结果码；CLS 有函数级失败 | 没有平台实收；部分码折叠；调用失败之后的恢复读取没有关联结果 | 保留调用结果与最终恢复结果的区别，添加窄范围权威恢复事件；补已知固定码 |
| 真实赛事完赛率 | score_submit 可派生 finished 状态观察；手动结束有独立 action | 无创建/开赛队列关联；不能由状态观察证明首次完赛；另有后端 finished 语义缺陷需先修复 | 先修正后端字段，再定义完成状态转换/观察去重与队列关联 |
| 打水到底有没有被使用 | water_enter、create、add、recordGame/recordDirect 等事件存在 | 页面进入可能只是打开；实收未知；没有打开成功的完整统一漏斗 | 以成功原始记账作为使用证据之一，分别统计访问、创建、加入、首笔和失败 |
| 新账本 7 日首笔率 | firstEntry 能区分权威 seq=1、普通后续、重放、未知 | 缺少账本创建队列与匿名账本关联、完整 7 日窗口、导入历史排除 | 定义匿名账本键与创建时点；原始记账只计首次；更正/重试不扩大分子 |
| 分享入口打开后是否参与 | share_enter 有目标确认/缺失/失败/离开；join 有结果 | activity 无目标关联；旧 growth 不可可靠拼接到新 activity | 同一获批匿名目标关联；确认身份门控和恢复结果的具体口径 |
| 分享是否送达、取消、被谁接收 | 仅实际分享 hook 调用计数；结果明确 unknown | 无送达回执，不能从发起分享调用推导 | 保留 unknown；接收端真实入口行为独立统计，不捏造发送成功 |
| 用户是群主、球友、俱乐部还是比赛组织者 | 行为事件无法直接回答 | 没有真实画像调查 | 后续少量可跳过问题，出现频率受限；本轮不实施弹窗 |
| 每个功能耗费多少云资源 | 代码可建立单位动作模型；CLS 可给调用与耗时 | 没有真实业务动作数、查看时长、数据库读写明细及账单 | 获取同窗口调用、动作、查看端时长、数据库读写/传输再核算 |
| 测试流量是否被排除 | activity 有 envVersion；运维报告有缺参烟测候选 | growth 无版本/环境；共用云环境历史请求可能缺版本；候选不等于测试 | 明确版本/环境和受控测试旅程标识，不将缺参请求一律判测试 |

完成留痕闭环所需证据顺序：明确平台接受的事件定义和字段 → 真实受控旅程 → 平台接收/拒绝/去重计数 → 可读取查询或导出 → 同事件 ID 对账 → 窗口完整性与报表。若平台只给聚合而不给逐 ID 查询，应明确无法做精确运输去重/配对，再按真实能力设计统计，不臆造导出 schema。

### 三、已复现问题

#### TEL-01 / P2：缺失耗时被当作 0，导致运维 P95 与覆盖率虚假

- 位置：`scripts/cloud-ops-daily-report.js:161–162,194,202–204`。
- 触发：合法窗口和分页元数据的原始 CLS 记录，其 duration 为 JSON `null`、空白字符串或布尔 `false`。
- 实际：代码先 `Number(duration)`，再只排除空字符串和非有限数；null/空白/false 均成为 0。三条 null 得到 `complete:true`、`durationCoverage:3`、`requestP95Ms:0`。
- 预期：三条没有数值耗时的数据应保持 `durationCoverage:0`、`requestP95Ms:null`；必要时单列非法/缺失耗时数量。不能用虚构的零值参与百分位。
- 影响：在实际导出包含上述值时，会低估耗时并高估测量覆盖；没有证据表明历史线上报告已经受影响。
- 建议：先做类型/非空白检查，再接受有限非负数值；保留缺失与真实 0 的区别。增加直接反例回归即可。
- 证据：`telemetry-results.json.nullDurationCounterexample`。

#### EFF-01 / P2：历史账本“分页”每一页都重新全量读取所有账本

- 位置：[`cloudfunctions/waterSession/index.js:1738–1822`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/waterSession/index.js#L1738-L1822)，特别是 `1755–1790` 的全量成员扫描、逐个 room/round 读取以及 `1810–1819` 的内存排序后分页。
- 触发：调用者有 M 个有效 V2 账本，打开第一页或继续翻页；测试中没有额外稳定旧账本。
- 实际：每页数据库读取方法调用次数为 `2M + floor(M/100) + 4`。其中 membership 分页查询 `floor(M/100)+1` 次、每账本 room+round 各一次、功能配置一次、旧账本发现两次。返回文档数与调用次数不同，不能作为同一计费单位。

| 本人账本数 M | 第 1 页返回项 | 第 1 页 DB 读操作 | 第 2 页 DB 读操作 |
|---:|---:|---:|---:|
| 0 | 0 | 4 | 不适用 |
| 1 | 1 | 6 | 不适用 |
| 20 | 20 | 44 | 不适用 |
| 100 | 20 | 205 | 205 |
| 500 | 20 | 1,009 | 1,009 |
| 1,000 | 20 | 2,014 | 2,014 |

- 影响：单页 O(M) 读取与 O(M log M) 排序，完整翻阅约 O(M²/20) 读取；逐条顺序 await 又放大往返延迟。用户提供的日均约 90 人，人数口径未核实，不能证明 M 已很大，严重程度按增长风险处理。
- 建议：近期可批量读取 room/round 并保留逐项权限检查，减少往返但不能声称消除线性数据量；长期再评估可索引的本人历史摘要。若为每次记账同步更新所有成员摘要，会增加写放大，必须连同成员数测算。不能用只按 membership 游标分页而改变现行按更新时间排序的语义。
- 证据：`resource-results.json.waterHistory`，生产 handler 的第一页/第二页均已运行。

#### EFF-02 / P2：筛选后的账本无变化也执行第二轮完整读取

- 位置：`miniprogram/pages/water/index.js:824–865,889–904`；云端 `waterSession/index.js:1825–1851`。
- 触发：V2 打水页使用 game 或 direct 筛选，room/round 版本与流水序号均未变化。
- 实际：每次 loadRoom 先 getV2，再 listEntries(afterSeq)。getV2 和 listEntries 各为 4 次单文档读取加 1 次查询；三次不变刷新分别产生 3+3 次云调用。all 筛选是 3+0。每次已成功投影还重写相同最近账本。
- 影响：稳定筛选场景每轮 2 次云调用、10 次 DB 读操作；额外流水查询在没有变化时仍重读 room、配置、member、round。
- 建议：在权威的版本/流水序号与已完成筛选同步水位均不变时，跳过第二次查询；出现缺页、未知水位、更正、切筛选或版本变化时仍按合同补齐。不能只比较 UI 项数，也不能跳过权限与功能开关更新。
- 证据：`frontend-resource-results.json.waterUnchangedRefresh`；对应云成本见 `resource-results.json.waterActions`。

#### EFF-03 / P2：锁状态与心跳请求未完成时，定时器继续发新请求

- 位置：`miniprogram/pages/match/matchLockController.js:93–110,168–196`。
- 触发：占用状态查询超过 5 秒，或心跳超过 15 秒尚未返回。
- 实际：setInterval 不等待 promise，且没有对应 inflight 标志。受控计时器的 4 次状态轮询产生 4 个未决调用；3 次心跳产生 3 个未决调用。状态调用还可能在 cloud 层发生最多两次网络重试。
- 影响：慢网/服务拥堵期间出现重叠请求、重复读写和更多结果乱序机会；复现没有据此断言错误数据已经发生。
- 建议：每种动作限制一个在途请求，完成后再调度；保留 session/version 校验、离开停止以及必要的心跳续租时间边界。不要简单延长到超过锁 TTL。
- 已通过部分：teardown 后计时器全部清理，源代码还会丢弃部分过期 session/lifecycle 响应；本问题不等于计时器永不释放。
- 证据：`resource-results.json.lockOutstandingCalls`。

#### EFF-04 / P2：最近列表虽只有 20 项，完整赛事缓存持续积累

- 位置：`miniprogram/core/storage/tournament.js:21–25,192–223`。
- 触发：长期访问更多不同赛事。
- 实际：recent ID 保留 20 个，completed snapshot 另限 100 个，但完整赛事 cache 与 cachedAt 各自按赛事 ID 写入，不随 recent 淘汰，也无 TTL/容量控制。访问 125 个合成赛事后 recent=20、完整缓存=125。
- 影响：本地持久存储与序列化负担随历史访问增长。当前 API 会捕获存储写入失败，可能表现为缓存/草稿等其他持久化结果不可用；本轮没有模拟平台存储额度或认定已发生事故。
- 建议：为完整赛事缓存设独立容量/大小预算和淘汰索引，保护当前赛事、必要恢复数据与已有“我的战绩”快照合同；不能直接清空用户历史记录或把快照数量限制误当完整缓存限制。
- 证据：`frontend-resource-results.json.cacheRetention`。

#### EFF-05 / P3：首页纯排序变更重新查询远端列表

- 位置：`miniprogram/pages/home/index.js:308–313,373–470`。
- 实际：每次改排序都调用 loadRecents，远端重新读取最近赛事完整文档；三次排序变更产生三次查询。
- 建议：对现有 items 本地排序并刷新显示；需要数据刷新时沿用页面进入、手动刷新或网络恢复路径。若产品要求排序同时刷新，应明确该要求后再决定。
- 证据：`frontend-resource-results.json.homeSort`。

#### EFF-06 / P3：轮询通道初始化重复读取相同赛事

- 位置：[`miniprogram/sync/watch.js:318–353`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/sync/watch.js#L318-L353) 的 init fetch 与立即启动的 polling，`createPollingController` 的首次 0ms 调度。
- 实际：开发工具静默轮询的新通道，init_fetch 完成后，0ms 首次 poll 再读取一遍相同文档；离线计数从 1 变 2。实时不支持而立即 fallback 时也存在相同结构，但本次动态复现使用确定的开发工具分支。
- 建议：用同一初次读取 promise/结果为轮询初始化，或避免已经有权威初次读取的通道再立即 fetch；仍保留首屏失败与 watch 恢复语义。
- 证据：`resource-results.json.pollingInitialization`。

#### EFF-07 / P3：头像冷缓存并发请求缺少跨调用合并

- 位置：[`miniprogram/core/avatarDisplay.js:293–311`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/core/avatarDisplay.js#L293-L311)；schedule/ranking/lobby 的头像解析入口。
- 实际：单次调用会去重并分批 50 个，成功后缓存命中；但同一 fileID 在第一次解析返回前被并行调用三次，会发送三个相同 SDK 请求。
- 建议：用 fileID 对应的在途 promise 合并，完成/失败后清除；保留 50 分钟缓存、失败回退和 60 秒失败重试边界。
- 证据：`frontend-resource-results.json.avatarParallelResolution`。

### 四、跨专项完赛字段问题

业务安全专项 BIZ-03 已直接调用未改动的 `submitScore.main` 复现：存储仍为 running，第一场 finished 21:18、第二场 pending，同分重试响应 `SCORE_SUBMIT_DEDUPED + finished:true`，数据库零写入。证据为 `../business/reproduce-business.cjs` 与 `../business/reproduce-business.results.json` 的结果 3。[`cloudfunctions/submitScore/logic.js`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/cloudfunctions/submitScore/logic.js) 的同分幂等响应把“此比赛场次已结束”返回为 `finished:true`，而首次提交响应的 finished 表示整场赛事完成。activityTracker 在 `168–171` 行把任何成功 `finished:true` 派生为 `tournament_complete/FINISHED_CONFIRMED`。

这与文档已声明的“不能证明首次完成”是两件事：前者连整场赛事 finished 状态都不成立。最终报告应与业务专项的生产 handler 反例合并为同一问题，不按两个缺陷重复计数。修复要统一服务端字段语义，并验证存在其他 pending 场次的同分重试不会触发整场完成观察。业务专项对消费者的扫描未发现主流程直接用该 flag 提前收赛，赛程/下一场依赖真实 rounds；不得扩大为本轮已证实提前终止赛事。

本专项另确认：即使后端语义正确，同一意图的两次 finished 响应也会生成两个独立 eventId 的状态观察；当前代码和合同已经明确该事件不是首次完赛计数，这属于统计边界，不能单独认定为新增业务缺陷。

### 五、单位动作资源模型

#### 1. 已量测的源码操作数

下面的“读”是单文档 get 或 query get 方法调用次数，查询可以返回多份文档；“写”是 set/update 调用次数。不包含真实 SDK 事务冲突重试、网络传输或平台额外计费。

| 动作 | 云函数调用 | 源码 DB 读操作 | 源码写入/删除 | 说明 |
|---|---:|---:|---:|---|
| 打开/正常刷新 V2 当前账本 | 1 | 5 | 0 | room、配置、round、member 各 1，最近流水 query 1 |
| 无变化但保留 game/direct 筛选刷新 | 2 | 10 | 0 | getV2 后再 listEntries |
| 新建独立账本 | 1 | 11 | 4 | 此外每次尝试 createCollection 5 次；不是 5 份新集合 |
| 新增手工成员 | 1 | 5 | 3 | round、room、幂等日志；具体载荷/权限不同会改变分支 |
| 原始记账一次 | 1 | 5 | 4 | entry、round、room、幂等日志 |
| 同请求 ID 成功记账重试 | 1 | 5 | 0 | 返回幂等结果，不重复记账 |
| 读取某类流水的增量页 | 1 | 5 | 0 | 即使增量页为空，仍核对 room/config/member/round |
| 打水历史任意一页 | 1 | `2M + floor(M/100) + 4` | 0 | 上表模型条件成立时 |
| 新 activity 写操作埋点 | 0 个额外业务云函数 | 0 个业务库操作 | 0 | 向微信 reportEvent 发送 2 条；平台成本和实际接收另验 |
| 首页排序一次 | 0 个云函数 | 1 个客户端 query | 0 | 当前会重新读取最近最多 20 项的完整赛事数据 |

新建账本的 5 次 `createCollection` 尝试来自每次调用 ensureV2Collections，已有正式 bootstrap 声明；可以评估将预备步骤移到受控部署/初始化阶段，但不能因此删除现有缺集合错误处理而使新环境失效。当前只是明确可避免的控制面调用来源，没有假设其具体时延或费用。

#### 2. 持续观看与错误恢复

| 场景 | 代码节奏 | 名义请求规模 | 限制与解释 |
|---|---|---|---|
| 真机健康实时 watch | 共享一个赛事通道；事件驱动 | 随实际变更推送 | 本轮无真实 watch 流量/推送计费证据 |
| 赛事 fallback 或开发工具静默 polling | 成功后 1.5 秒，±15% jitter；错误逐步到 8 秒 | 持续成功且忽略延迟，约 2,400 次 get/查看端小时 | 不是所有真机的默认开销；即使版本不变也维持该频率 |
| 打水普通可见页面 | 完成一轮后再等 8 秒 | 忽略耗时约 450 轮/查看端小时 | all 约 450 云调用/2,250 DB 读操作；game/direct 稳定场景约 900/4,500 |
| 打水成功写入之后 | 3 秒间隔，成功 5 次后回到普通周期 | 每次触发最多 5 轮 burst | 失败会退回 16/30 秒；连续新写可能重置 burst，不能无条件将每次 burst 当额外 5 次独立于普通周期累加 |
| 本人保持录分锁 | 15 秒心跳 | 名义约 240 次心跳/小时 | 应按实际编辑时长估算，不能按全天运行 |
| 等待他人录分锁 | 5 秒状态查询 | 名义约 720 次查询/小时 | 实际过期/结束/离页会停止；慢请求目前可能重叠 |
| 网络错误的 cloud 重试 | 最多 2 次，300/900ms 延迟 | 每次业务调用最多 3 次 SDK 发起 | 只有符合条件的只读/带请求ID写入；业务 ok:false 不自动重试 |

轮询同一版本时，生产 createPollingController 动态验证为 10 次 get、1 次 onData、10 次下一周期均 1,500ms。前端减少重复渲染，不等于减少云端读取。优化需要先确定同步体验与数据新鲜度要求，再考虑无变化时退避、页面/状态自适应或更轻的版本响应。

按总查看端小时 H、其中赛事 polling 小时 Ht、打水 all 小时 Hw、打水筛选小时 Hf，源码名义持续查询规模可写为：赛事 get 约 `2400×Ht`；打水云调用约 `450×Hw+900×Hf`。这些公式用于敏感性分析，用户提供的日均约 90 人（人数口径未核实）不能直接代入 H，也不能等同于真实账单。应单独取得每次活动的查看端数、停留时长、录分次数、重连次数。

#### 3. 其他增长与保留风险

| 路径 | 源码事实 | 评估与改进边界 |
|---|---|---|
| 幂等日志 | [`scripts/cloud-common.template.js:161–189`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/scripts/cloud-common.template.js#L161-L189) 与 waterSession `467–485` 持久化每个成功请求，无代码层 TTL/删除；bootstrap 也未声明生命周期 | 不能将缺少远端 TTL 证据写成确认永不清理。需要查实际保留/备份；删日志可能破坏跨期幂等，必须先定义重放期限和业务记录防重合同 |
| 头像对象 | `core/profile.js:89–122` 每次上传用时间戳新路径；客户端没有对象删除逻辑 | 失败保存、取消或重复上传可能遗留对象；旧头像可能被历史赛事引用，不能直接批删。先做引用清单、文件年龄/体积核算 |
| 分享码 | 客户端 shareCode 按赛事/环境缓存且合并在途请求；服务端每次调用生成后上传到确定路径 | 当前能减少单进程重复，但跨进程仍生成。若流量证据显示占比高，再做服务端复用；仍需每次授权验证 |
| 个人战绩分析函数 | `getMyPerformanceStats/index.js:9–111` 每次读取本人 finished、所有缺 playerIds 的 legacy finished，必要时回退全部 finished；每路 cap 4,000 | 是备用分析入口，当前“我的战绩”主流程用本地快照，不应列为日常最大开销。若要推广此入口，应观测/索引/迁移旧数据并把时间窗口尽量下推 |
| 历史流水详情 | `waterSession/index.js:849–878` 读取同 rootEntryId 的完整更正历史，按 100 条批次 | 与当前页面一次至多 20 条的普通流水页不同；是否需要分页由更正历史增长决定，不恢复 V1 的 200 条上限 |
| 客户端日志 | 新 activity 无 payload 日志；旧 growth 每个事件 console.info，头像警告和云调用错误有诊断日志 | 不能把 console 日志直接等同 CLS 入库。保留/权限/采样需查实际平台；不为了节省日志删除必要错误证据 |

### 六、留痕的其他待补环节

1. **操作异常后的恢复未形成同一意图的最终状态。** `lobbyLifecycleActions.js:79–91,151–158` 可能在超时后读到已开赛并正常结束；`matchSubmitService.js:411–425` 可能恢复已提交比分并另发旧 growth success。新 activity 已经结束为 exception/failure，之后没有关联 recovered 事件。可以统计“调用返回异常”，但不能把它直接解释成用户最终业务失败。下一步应保留原调用事实，再追加有证据的恢复结果。
2. **少数关键固定业务码被折叠。** `CLIENT_REQUEST_ID_REUSED`、`WATER_JOIN_REQUIRED` 动态捕获为 BUSINESS_REJECTED；WATER_ROOM_FORBIDDEN 和 WATER_WRITES_DISABLED 能原样保留。固定枚举扩充可提高首笔失败原因的可解释性，仍禁止任意错误文本。
3. **没有真实运输丢弃计数。** 当前 reportEvent 失败被忽略是业务保护，但没有 received/dropped 的可审对账。客户端不阻塞和平台完整接收是不同验收条件。
4. **字段、保留期和额度仍待平台核实。** 文档中的 14 天原始、90 天日聚合、全局每日 1,000 等是未来建议，不能当现已执行。若以后启用 1,000 条日额度，若以用户提供的日均约 90 人作为纯假设（人数口径未核实），人均约 5.6 个成对追踪调用就已耗尽额度，尚未包含 view/share/complete；这里只是预算约束示例，不是实际使用量估计。
5. **受控实收必须区分环境。** activity 有 envVersion，旧 growth 无；CLS appVersion 常无来源保证。不能从“同一云环境”自动恢复哪个请求来自发布版，也不能把缺参请求全部划成测试。

### 七、优先级与本轮完成状态

建议后续实施顺序：先修跨专项的 finished 语义与 TEL-01 报表输入错误；再为 EFF-03 锁请求合并、EFF-02 无变化筛选读取、EFF-04 缓存上限做最小修复；EFF-01 历史账本按实际账本数与 P95 决定批量读取/摘要方案；最后处理排序、初始化与头像的小型重复请求。留痕平台闭环需要单独的受控实收条件，已有本地代码不能替代。

本轮已经完成：两套事件与报表入口代码核对、关键指标缺口矩阵、数据库/轮询/缓存/重试/头像/日志保留路径审查、三个独立脚本的轻量复现、结果文件。未声称完成：平台事件实收、真实云 DB/事务/网络性能、真实月费、实际用户画像、原生手机验证、任何修复的上线交付。

调研弹窗保留为后续候选：用途身份、主要使用赛制、最大困扰三类问题足够先补画像；应在适当时点可跳过并限制频率。其实现、文案和采集不属于本轮检查动作。


补充消费者边界：`core/cloud.js:72–81` 也会读取 finished 推断结果状态，但该真实去重响应的显式 state/deduped 优先，仍保留 deduped；本复现中直接错误生成 FINISHED_CONFIRMED 的是 activityTracker。

三个离线复现脚本支持 `AUDIT_REPO=/absolute/path/to/repo` 覆盖源码根目录；未设置时使用证据目录旁的 `../../repo`。

# 附录 D：页面、导航、权限与打包静态收口

## 注册页面、导航与配置静态收口

基线：`a3fe96f25015892ac30ee7148f97a5b441b0cb24`。本检查只读取隔离的远端源码；没有连接 GUI、开发者工具、用户设备或真实云服务，没有调用预览、上传、部署命令。检查产物位于业务仓库外，源码树保持 clean。

### 结论

16 个注册页面的 `.js/.json/.wxml/.wxss` 文件全部齐全；可解析的 208 个入口、组件、模块、模板、样式及本地资源文件依赖未发现缺失；解析到的页面路径字面量全部已注册。打包忽略规则没有命中本次可达依赖闭包。这里的“通过”只指静态完整性，不代表页面已通过真机显示、交互或像素验收。

另有一个低优先级的外部参数边界：资料页对 `returnUrl` 无保护解码，畸形百分号转义会提前中断 `onLoad`。开发、体验、正式三种环境共用源码中的同一云环境，且云函数运行时没有在已检查配置中显式固定；这些属于配置边界，不能据此推定真实生产权限或部署状态。

### 1. 页面覆盖

依据 [`miniprogram/app.json`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/app.json)。三项 tabBar 与公共导航 `core/nav.js:5–9` 保持一致。

| 注册路由 | 原生 tabBar | 页面文件 |
|---|---|---|
| `/pages/home/index` | 是 | 4/4 |
| `/pages/launch/index` | 是 | 4/4 |
| `/pages/mine/index` | 是 | 4/4 |
| `/pages/tournament-list/index` | 否 | 4/4 |
| `/pages/profile/index` | 否 | 4/4 |
| `/pages/feedback/index` | 否 | 4/4 |
| `/pages/share-entry/index` | 否 | 4/4 |
| `/pages/water/index` | 否 | 4/4 |
| `/pages/create/index` | 否 | 4/4 |
| `/pages/lobby/index` | 否 | 4/4 |
| `/pages/schedule/index` | 否 | 4/4 |
| `/pages/match/index` | 否 | 4/4 |
| `/pages/ranking/index` | 否 | 4/4 |
| `/pages/analytics/index` | 否 | 4/4 |
| `/pages/settings/index` | 否 | 4/4 |
| `/pages/preferences/index` | 否 | 4/4 |

应用入口 `app.js/app.json/app.wxss`、`sitemap.json`、6 个 tab 图标均存在。没有注册分包。本次并未因为源码文件完整就推定每个空态、长列表或弹窗都能正确显示。

### 2. 本地组件与资源

唯一业务页面组件声明为 `pages/water/index.json` 的 `van-popup`；递归可达依赖为 Vant 的 popup、icon、overlay、transition、info，共 5 个组件，四类组件文件与进一步 WXML include/import、WXS、WXSS import 和本地 JS require/import 均能解析到文件。仓库实际跟踪 466 个 Vant 构建文件；组件依赖完整不代表这 466 个文件全部进入最终发布包。

扫描以 16 页、应用入口与 tab 图标为起点，取得 208 个可达文件，缺失为 0；在模板/样式依赖处理中遇到 12 个动态引用和 2 个外部引用，不把它们计为已经验证可用的本地文件。JS 中的数据驱动头像、云存储资源等仍需运行时证据。

`project.config.json` 的排除项为 node_modules、三张本地分享底图模式及 Vant uploader。依赖闭包与排除项交集为 0。`core/shareCard.js` 的底图来源实际为云存储，排除本地同名图片不构成已证实的缺文件错误；本次没有请求这些云对象。Vant icon 使用的外部字体同样没有做联网可用性验收。

### 3. 导航覆盖与一个输入边界

扫描自身 JS/JSON/WXML 中可解析的 `pages/...` 路径，全部对应注册页面。人工核对了公共 `core/nav.js`、`core/matchPrimaryNav.js`、`core/profile.js`、`pages/share-entry/flow.js`，以及 launch/create/profile/share-entry/water/schedule 的关键跳转调用。

公共 `nav.js:196–247` 会将三个 tab 目标转给 `switchTab`，并在切换 tab 时去掉 query/hash；普通赛事页通过 `buildTournamentUrl` 对 query 编码。主要路径包括发起→资料完善→创建→大厅，分享入口→大厅/对阵/复盘，赛事内比赛/排名/对阵互转，以及打水新建/历史/最近账本；这些静态目标都有注册。没有将 `matchPrimaryNav` 的“比赛”指向大厅当成漏注册页错误，因为这是现有主导航映射。

#### UI-01：畸形 returnUrl 解码可能中断资料页初始化（P3）

[`miniprogram/pages/profile/index.js:32–36`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/pages/profile/index.js#L32-L36) 在读取本地资料和同步云资料之前直接执行 `decodeURIComponent(options.returnUrl)`，没有 try/catch。非空裸百分号或非法 UTF-8 转义会触发 `URIError`，导致这个 onLoad 提前退出。正常内部 URL 构造会编码参数，因此影响条件是外部传入的畸形 query。该结论来自明确代码路径和 JS 解码语义，没有进行真机复现，也不应扩大为任意外部跳转或账号安全漏洞。

建议保护解码异常并回退到空或已注册的内部目标。对所有数据依赖跳转、页面栈极限、快速连点和异常恢复没有在本轮追加逐页测试。

### 4. 敏感配置与权限边界

只记录文件位置和类别，不包含密钥、环境标识或应用标识值。

| 文件/位置 | 类别 | 静态事实及实际边界 |
|---|---|---|
| `miniprogram/config/env.js:1–18,21–40`；`app.js:25–31` | 运行环境标识 | develop/trial/release 共用同一默认云环境；DEV/TRIAL/PROD 标签不隔离数据。环境版本取值未知时回退 release。实际发布包与服务端运行环境未验证。 |
| `project.config.json`；`.cloudbaserc.json`；`cloudbaserc.json` | 应用、云环境配置标识 | 均有配置；两份 CloudBase 配置的环境标识相同。标识属于连接配置，不把它们当作密钥值输出。 |
| `.env.local.example:2–14`；`.gitignore:31–41`；[`scripts/mp-ci.js:182–201`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/scripts/mp-ci.js#L182-L201) | CI 密钥、私钥路径、云凭据 | 例子中的密钥字段为占位值；按受控文件名扫描未发现已跟踪的真实 env/private/pem/key 文件。此结论不是完整历史密钥扫描，也没有读取本机实际凭据。 |
| [`miniprogram/app.json`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/app.json)；profile/lobby 头像按钮；`core/sharePoster.js:504–520` | 个人资料、相册功能 | app 配置没有 permission、requiredPrivateInfos、plugin 或后台定位声明；业务代码存在用户选择头像、保存相册入口，未见一方定位/手机号/支付调用。微信后台隐私声明和实际同意状态未取证。 |
| `sync/watch.js:98,180,359`；`core/tournamentSync.js:79`；`pages/home/index.js:416` | 客户端直读数据库 | 客户端直接读取/监听 tournaments，是否允许及范围必须由实际云规则控制；不能用界面按钮权限替代云规则。当前线上规则未知。 |
| `cloudfunctions/*/config.json` | 云 OpenAPI 权限 | 10 个声明文件：8 个更新动态消息、1 个创建消息活动 ID、1 个生成小程序码权限。仅证明代码声明，未证明平台实际授权。 |
| [`miniprogram/sitemap.json`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/sitemap.json) | 搜索可见性 | 9 个 allow 规则，5 个具体 disallow 和末尾 wildcard disallow；用户资料等私有页明确排除，部分赛事页允许索引。搜索索引设置不是数据库授权。 |

### 5. 打包与运行配置

应用根为 `miniprogram/`，云函数根为 `cloudfunctions/`。项目配置基础库 `3.14.2`，启用 URL 检查、ES6、代码与 WXML/WXSS 压缩；手工 NPM 构建关系指向 [`miniprogram/package.json`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/miniprogram/package.json)，前端 Vant 固定 `1.11.7`，构建产物已存在。项目设置 `uploadWithSourceMap:true`，并不能单凭这一项断定源码对用户公开；本轮没有读取实际上传包或源码映射访问控制。

`cloudbaserc.json` 声明的 26 个函数与 26 个含 package.json 的目录名称完全一致，均要求安装依赖，SDK 固定为 `2.6.3`。startTournament 显式 timeout=10；其余运行时、内存、并发、网络和超时实值没有由当前清单完整固定。26 个函数配置没有 runtime 声明，package 也未用 engines 固定 Node；不能从本地运行成功推出实际云端 Node 一致。

`mp-ci.js:195–210` 使用环境变量中的应用标识和私钥路径创建 CI Project，显式忽略 node_modules 并启用压缩。最终 CI 打包是否完整遵循项目忽略项、包体大小、正式版本是否为当前 SHA，需要实际预览/上传清单；本检查没有运行这些写入步骤。

### 6. 本轮未做

真机像素、不同屏幕/字体大小、触控和无障碍、长数据排版；真实云对象/CDN 下载；实际数据库和存储权限、隐私后台配置；云函数运行时/内存/超时；最终发布包内容/大小；所有动态或畸形 URL 的逐页验证。以上项目不标为已通过。

机器证据见同目录 `ui-config-coverage.json`，逐页文件状态、每条本地依赖和静态路由均已保留。扫描仅证明可解析引用集合，未使用它推断真实活跃用户、云成本或线上可用性。

# 附录 E：10月9日远端补查、公共云依赖与访问缺口

## 2026-10-09 远端补查与证据状态

本次续查继续执行“只检查”的边界。远端源码、GitHub 当前元数据、仓库中的历史云证据、公共依赖信息，以及可独立执行的合成验证已经检查；当前生产部署、真实用量和费用、事件实收、实际规则索引与备份保留仍缺少可读取的原始证据。**汇总报告完成，不代表全面检查的线上部分已经完成。**

这里把“存在问题”“检查完成”“生产尚未验证”分开记录。已经复现的问题无需先修复，检查结论即可成立；缺少线上证据的事项也不会因为代码测试通过而转为通过。

### 1. 本次实际读取的远端状态

| 项目 | 2026-10-09 实际读取结果 | 可支持的结论 |
|---|---|---|
| master | a3fe96f25015892ac30ee7148f97a5b441b0cb24 | 与上一轮固定源码一致，无须重复已经充分完成的整套回归 |
| 提交时间 | 2026-10-08 03:28:52 UTC | 提交时间是版本时间，不是云部署或客户端发布时间 |
| 仓库可见性 | private=false、visibility=public | 当前仓库为公开可见；公开本身没有被登记为漏洞，也没有推定用户希望改变它 |
| 分支与规则 | master protected=false；rulesets 返回空列表 | 本次读到的分支保护和规则集状态；不是 GitHub 管理权限全面审计 |
| Actions | 全仓库共 6 条可见历史运行，全部位于 8 月 25 日或 9 月 1 日，固定 HEAD 对应 0 条 | 不把旧分支的成功导出任务当作当前版本 CI 通过；也不再笼统称全仓库没有 Actions |
| 当前提交状态 | statuses=[] | 没有从该接口取得当前提交的状态检查回执 |
| Releases | 返回空列表 | 没有 GitHub Release 记录；这不能证明微信客户端未发布 |

上述来源为 GitHub 只读接口： [仓库元数据](https://api.github.com/repos/LXZ56156/repo-20260224-031312)、[master](https://api.github.com/repos/LXZ56156/repo-20260224-031312/branches/master)、[Actions](https://api.github.com/repos/LXZ56156/repo-20260224-031312/actions/runs?per_page=20)、[规则集](https://api.github.com/repos/LXZ56156/repo-20260224-031312/rulesets?includes_parents=true) 和 [Releases](https://api.github.com/repos/LXZ56156/repo-20260224-031312/releases?per_page=30)。精简返回、查询时间和完整运行列表保存在 `remote-access-and-github.json`。

### 2. 云端取证入口核对

本会话已可读取 GitHub。已检索当前可调用连接和插件目录中的腾讯云、CloudBase、微信分析相关能力；精确 CloudBase 搜索没有匹配结果，其他搜索没有返回能读取这个项目的相应服务。当前执行环境也没有 tcb、cloudbase、tccli 命令。既有访问线索检索没有取回可复用路径。

这说明**本会话没有可直接使用的已认证云端只读入口**，并不证明相关服务或历史授权不存在。插件目录检索也不是穷尽清单；其他连接可能仍在 [插件目录](https://chatgpt.com/plugins) 中。本次没有探查用户设备、浏览器登录状态或凭据，也没有为取得证据而更改平台设置。因而没有产生新的腾讯云、CLS、账单或微信统计真实返回。

仓库内有取证脚本和操作记录，但脚本可用不等于当前账户可用，也不等于脚本已经在当前生产环境成功执行。取证原件未保存于固定远端树的项目，保留为“原始证据未取得”。

### 3. 云函数依赖补查：原根目录扫描以外的一套公共依赖树

26 个云函数的直接依赖都声明 `wx-server-sdk: 2.6.3`，均无各自的 package-lock。为避免重复解析 26 次，本轮在仓库外只生成一套公共依赖锁，并禁止安装脚本，不安装运行依赖目录。该动作没有改动云函数或仓库中的依赖。

| 扫描范围 | 解析和扫描结果 | 边界 |
|---|---|---|
| 原根目录工具链锁文件 | 97 个受影响依赖条目：44 critical、27 high、25 moderate、1 low | 已核匹配路径为开发依赖，属于构建与自动化工具链 |
| 本轮公共云依赖新锁 | 162 个解析后的依赖包路径；17 个受影响依赖条目：3 critical、7 high、7 moderate | 依据当前公共注册表解析的候选安装树，尚未取得生产安装包 |

两套数量不相加为“线上漏洞数”，17 也不乘以 26。npm 对父依赖的传递影响会展开统计，等级属于扫描器口径，不等同于本报告的 P1/P2/P3 业务优先级。首次扫描早于锁生成返回 ENOLOCK 的记录保留在证据中，最终数字取自锁生成成功后的有效扫描。

新锁包括 `@cloudbase/node-sdk@2.9.1`、`@cloudbase/database@1.4.1`、`protobufjs@6.11.6`、`form-data@2.3.3`、`axios@0.21.4`，以及历史兼容的 tcb-admin-node 依赖分支。锁文件 SHA-256 为 `3d3bfaaef328183aa01c6744f60320f18c2a16d244cc835e8f29bd868a6a7a06`。该精确数据库版本与 BIZ-04 的请求探针一致。

检查了维护者公告中的触发条件：protobufjs 的相关代码执行问题要求攻击者能影响被加载的 schema/descriptor；只使用可信固定 schema 解码并不直接满足该入口。axios 的绝对 URL 问题涉及把不可信地址交给请求构造。form-data 的边界注入还需要可观察随机输出并控制相应请求字段。当前证据没有证明业务入口满足这些利用条件，也没有证明已发生攻击。公告来源：[protobufjs](https://github.com/protobufjs/protobuf.js/security/advisories/GHSA-xq3m-2v4x-88gg)、[axios](https://github.com/axios/axios/security/advisories/GHSA-jr5f-v2jv-69x6)、[form-data](https://github.com/advisories/GHSA-fjxv-7rqg-78g4)。扫描等级按 npm 原始 JSON 保留，维护者页面的评级可能不同。

完整输入、解析日志、锁文件和有效扫描结果保存在 `cloud-dependency-audit/`。实际部署包是否包含同样版本、哪些代码路径会加载它们，仍属于线上待核事项。本次没有按扫描建议自动升级、降级或强制修复。

### 4. 留存旧输入的新鲜度边界

新增独立验证使用真实 `we-analysis-report.js` CLI，完全离线，输入为合成文件。采集脚本会保存 fetched_at，但报表仅依据操作者提供的 latestComplete 判断队列成熟，不交叉核对采集时间。

| 同一队列的输入和水位 | D7 结果 | 说明 |
|---|---|---|
| 10 月 2 日保存的 10 月 1 日快照，内含 key7=0；水位 10 月 1 日 | null、未成熟 | 尚未达到第 7 天 |
| 同一字节文件，同一 SHA；仅把人工水位改为 10 月 8 日 | 0、complete、1 个成熟队列 | 未重新取到该队列的后续数据，旧输入仍被接纳 |
| 去掉 key7 后，水位同为 10 月 8 日 | null、missing | 缺少 key 时现有代码会保持未知，并非任意缺失数据都补 0 |

准确结论是：**显式旧输入与后移人工水位之间缺少新鲜度校验**。只有 D7 子指标出现 complete，整份 window.status 仍为 missing。本轮没有证实微信真实接口会在未成熟时返回该合成占位形式，没有证实历史真实报表受影响，也没有把人工改变水位描述成脚本自动推进。独立审校因此将 TEL-02 归为 P3 输入防护观察，不纳入原 18 项主清单，不判为已确认的真实统计缺陷。

真实 CLI 和缺失 key 对照输出保存在 `retention-independent-check.json` 及相邻输入/输出。源码为 [`scripts/we-analysis-report.js:64–140`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/scripts/we-analysis-report.js#L64-L140)、[`scripts/we-analysis-report.js:177–193`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/scripts/we-analysis-report.js#L177-L193)；采集时间字段见 [`scripts/fetch-we-analysis.js:367–372`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/scripts/fetch-we-analysis.js#L367-L372)；输入合同见 [`docs/tools/we-analysis-local-script.md:105–125`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/tools/we-analysis-local-script.md#L105-L125)。

### 5. 尚不能结案的线上检查及最小原始证据

| 检查事项 | 当前缺口 | 满足只读复核需要的材料 |
|---|---|---|
| 当前客户端与云函数对应关系 | Git 版本无法代表线上包；只有历史版本自述 | 当前正式/体验版本回执、完整云函数清单、更新时间、代码包或文件哈希、运行时/内存/超时/并发/触发器；敏感配置只核名称或脱敏摘要 |
| 当前数据库规则与索引 | 仓库提供期望声明与历史叙述，没有本次实际快照 | 集合名、ACL/自定义规则、完整索引字段顺序/唯一性/状态、采集时间和环境；不需要用户明文业务内容 |
| 真实失败、延迟和开赛稳定性 | 最新历史窗口只有 19 个非缺参成功调用，版本/来源未知 | 同一完整时间窗的分页日志、窗口起止与时区、请求去重键、函数/版本/来源、结果码、耗时、超时；业务拒绝与平台失败分开 |
| 留痕实际接收和使用路径 | 存在客户端代码，未取得平台定义和接收记录 | 当前事件/字段定义、可查询或导出的实收结果、拒收情况、时间范围、匿名关联与版本、已有测试标记；按平台实际支持粒度验收 |
| 费用和资源浪费的线上占比 | 已得到单位动作成本模型，缺当前真实用量与账单 | 同一时间窗的函数调用/计算、数据库读写/容量、存储/传输、计费分项、套餐抵扣；按查看时长或业务动作归因，不能把约90人代入并发 |
| 当前套餐状态 | 10 月 3 日记录曾写 10 月 12 日到期，今天是否续费未知 | 当前环境状态、到期时间、自动续费状态和已有付款回执；仅查看，不涉及付款或修改 |
| 备份、保留与恢复 | 历史 13 集合与另补 3 集合不是统一时点完整快照；原始恢复材料未取得 | 可读取的远端备份清单、时间/完整性哈希、规则索引导出、对象引用校验、原有恢复验收结果、当前保留/生命周期配置 |

日志建议先读取已有最近完整窗口，以实际记录数量判断是否满足原项目观察标准。原“连续 7 天、至少 100 次、硬超时 0、平台失败低于 1%”是历史开发验收目标，本次不会用不满窗口或缺版本的记录宣布它通过。新账本 7 日首笔率还需要真正的创建队列和足够观察期。

这些是证据需求，不是待执行修复。真实云事务冲突或权限效果优先核对已有隔离验收原始回执；现有只读检查不会改成生产写入试验。原手机、原生交互和 Windows 专用门槛仅在历史开发计划对账中保留，不作为违反“只检查远端”要求的理由。

### 6. 本次续查的交付状态

可用远端资料的检查、补充合成验证及报告编制可以完成；当前平台实况与原始备份证据因访问条件不足仍未验证。报告明确保留这些开放项，不给出虚假的整体完成率，不把“发现未修复”当作“检查没做”，也不再把“报告已经交付”写成“全部线上检查通过”。

# 附录 F：部署、权限、索引与备份历史证据的20条对账

## 2026-10-09 云端部署、权限索引和备份恢复证据补查

本轮已完成指定仓库范围的补查。**仓库保留了详细的历史执行记录、预期配置和工具源码，但本次未找到可独立重算的完整云端导出、部署回执、规则/索引响应或恢复结果原件。**这些原件主要被文档引用到未入库的 `tmp/` 或用户机器的备份目录。本轮没有访问那些设备，也没有将历史自述升级为当前云环境验证。

审计固定于 `a3fe96f25015892ac30ee7148f97a5b441b0cb24`。开始和结束时 `git status --porcelain` 均为空；当前 Git 树共 1,638 个已跟踪文件，本地配置登记 26 个云函数。没有修改业务源码、重跑先前反例、执行部署/恢复、访问云 API 或检索凭据。仓库可见性及最新远端 HEAD 由主控另行核对，本报告不将仓库称为私有。

结构化结果见 evidence-matrix.json（证据包：`evidence/remote-followup-20261009/business/evidence-matrix.json`），共 **20 条证据记录**。每条包含准确来源文件和行范围、正文记载的事件时间、覆盖环境、证据类型、原件引用位置、仓库内可用性及结论边界。另保存来源 SHA-256 和当前可观察提交时间。此次 clone 经核实为 shallow，无法据边界 HEAD 判定文件真正的最后改动日期，矩阵将其明确标为未知，没有为此下载历史。**Git 提交时间、文件名日期都不当作云端采集时间**。

### 部署与版本：可以追溯历史，尚不能对齐今天的云端

| 矩阵 ID | 仓库中确实存在的来源 | 正文事件时间与覆盖环境 | 可用结论和缺口 |
| --- | --- | --- | --- |
| REM-01 | [`docs/tasks/session-logs/2026-09-23-online-release-confirmed.md:3–18`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/tasks/session-logs/2026-09-23-online-release-confirmed.md#L3-L18) | 9-23 查看客户端版本；记录发布时间 9-14 12:32 | 记载正式版 `6.1.2-702625a` 及源码映射。用户提供的平台截图原件未在本次仓库盘点中找到；`current.md` 明确本轮未实时重核。只属于客户端发布记录。 |
| REM-02 | [`docs/reports/2026-10-03-backend-audit.md:6–22`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/reports/2026-10-03-backend-audit.md#L6-L22) | 10-03 01:34–01:49，上海生产环境 | 记载当时 39 个函数、23 个受管函数 Active/Available、23 个 `index.js` 一致。原始 `detail-*.json` 等位于未入库目录。这个比对只覆盖入口，不覆盖全包和依赖。 |
| REM-03 | [`docs/tasks/session-logs/2026-10-03-start-timeout-repair.md:29–49`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/tasks/session-logs/2026-10-03-start-timeout-repair.md#L29-L49) | 10-03 02:32:05，生产 `startTournament` 单函数 | 记载已部署、Timeout 3→10、20 个非依赖源码校验及缺参烟测；完整包的间接依赖也有变化。`deploy.log`、`detail-after.json`、`verification.json`、重新下载的代码均未入库。不能说另外函数也已同步部署。 |
| REM-04 | `cloudbaserc.json` | 本次固定提交的配置；没有云采集时间 | 当前登记 26 函数，全部 `installDependency:true`，仅开赛显式 `timeout:10`。这是配置，不是平台状态或部署回执。 |
| REM-17 | [`docs/tasks/session-logs/2026-10-03-dependency-inventory.md:60–93`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/tasks/session-logs/2026-10-03-dependency-inventory.md#L60-L93) | 10-04/05，Windows/Linux 本地完整依赖包 | 先有 26 组旧源，再有单打 9 函数新包。文档明确 `targetEnv:null`、`isolationOnly:true`、只加载 SDK、未调用 main。包和原始回执未入库；本地 Linux 加载不能证明 CloudBase 接受或业务执行。 |

`startTournament` 的 10-03 部署发生在同日 23 个入口一致检查之后；当前提交还包含后续协管、提前收赛、找回和单打等变化。必须保留这些先后关系，不能拼接成“当前 26 个函数均已部署且与本次源码一致”。

可优先复用的历史原件入口是：

- `tmp/online-audit-2026-10-03/backend/`：当时函数清单、详情、规则、索引摘要。
- `tmp/audit-2026-10-03/startTournament-deploy/`：单函数实际部署及后验原件。
- `tmp/audit-2026-10-03/startTournament-rollback/manifest.json`：旧回退包的文件清单。文档明确当时没有单独保留原 ZIP，而是保留解压文件及逐文件 SHA。
- `tmp/singles-cloud-packages-20261005/`：后续单打本地候选，只可用于候选来源核对。

上述路径在固定 Git 树中均无对应产物；本报告仅标明来源，不尝试访问用户 Windows 设备。

### 权限、索引与真实身份：已有有限历史观察，范围不能扩大

| 矩阵 ID | 来源 | 日期/环境 | 已记录内容与限制 |
| --- | --- | --- | --- |
| REM-05 | [`scripts/water-v2-cloud-bootstrap.manifest.json`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/scripts/water-v2-cloud-bootstrap.manifest.json) | 无环境绑定的初始化声明 | 7 个集合、5 个索引、初始 revision 1、V2 默认关闭。文件明确 `declaration-only / remoteAccess:false / applySupported:false`；不能作为真实云配置。 |
| REM-06 | [`docs/tasks/session-logs/2026-10-03-database-permission-preparation.md:3–17`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/tasks/session-logs/2026-10-03-database-permission-preparation.md#L3-L17) | 10-03，当时 13 个生产集合 | 记录赛事 `CUSTOM`、登录可读、写入依据 `doc._openid`；其余按 `ADMINONLY`、`PRIVATE` 分组。原 `rule.json`/`rules-*.json` 不在仓库。预设 ACL 的空 Rule 不能解释为任意访问。 |
| REM-07 | [`docs/reports/2026-10-03-backend-audit.md:80–92`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/reports/2026-10-03-backend-audit.md#L80-L92) | 10-03，当时生产索引 | 记录 5 个 water 索引字段方向一致，以及赛事 `playerIds ASC + status ASC`。缺今天完整索引定义及构建状态；旧 membership 索引不证明新增找回接口的双路排序/数组查询已经验收。 |
| REM-08 | 同上 `90–92` | 10-03，water 功能配置 | 记录 revision 11、V2 开关 true、紧急只读 false、灰度列表空。引用的脱敏 metadata 未入库；不能把源码默认 false 或历史 true 当今天实际值。 |
| REM-09 | 权限准备日志 `88–96` | 10-05 03:15:36，现有环境、单账号、DevTools SDK 3.17.2 | 记录一次真实 `login` 返回身份非空和 AppID 匹配。原始脱敏回执和图未入库；只覆盖这一次身份链路，不覆盖手机、其他账号、赛事角色或事务。 |
| REM-10 | 权限准备日志 `118–134` | 10-05 04:08:01，现有环境中专用临时集合 | 记录候选 `write:false` 下 2 读成功、8 写拒绝、4 合成文档不变、原 16 规则不变；04:14:40 观察到临时集合清理。原件未入库，驱动也保留 `engineOriginVerified/engineValidationPassed:false`。生产赛事规则未因此更改。 |

权限日志已经明确指出：**单账号临时集合候选规则观察，没有闭合现有业务函数兼容、角色矩阵、事务冲突/回滚、双账号双机或生产赛事新增路径。**本轮保留这一限定结论，不再用既有业务模拟用例替代它。

[`docs/tasks/session-logs/2026-10-03-new-cloud-isolation-checklist.md`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/tasks/session-logs/2026-10-03-new-cloud-isolation-checklist.md) 是可复用的验收计划：规定提前收赛、锁、录分的配套版本，协管的多个权限消费者，以及真实 A/B/C、guest 和未登录状态。它是计划，当前的只检查任务没有执行其中部署或测试写入的授权。

### 备份恢复：历史记录分层完整，原件仍待只读交接

| 矩阵 ID | 来源及正文日期 | 文档记载的结果 | 本轮保留的边界 |
| --- | --- | --- | --- |
| REM-11 | `2026-10-03-backup-reconciliation.md:3–13、78–88`；补记 10-05 | 13,925/14,025 为汇总文字错数；13/16 集合差因仍未知。另三历史集合做两遍 JSON 观察和双盘补档。 | 三集合补档不是 16 集合新原子快照，不等于这三集合完成 BSON 恢复。不能推断它们是新建或原备份漏页。 |
| REM-12 | `2026-10-03-backup-integrity-verification.md:3–24` | 选定 raw pass 2：259 页、13,925 文档；2,735 对象重读一致；13,072 引用匹配；38 可用函数包核验。 | 原始 manifest、raw、完整性 JSON 未入库。历史另 1 函数无可下载代码，不得写成 39/39 完整。在线两遍一致不证明跨集合原子性。 |
| REM-13 | `2026-10-03-local-restore-verification.md:5–43` | 10-03 06:18:29–06:18:36，本机 MongoDB 恢复 13 集合/13,925 文档，hash、类型往返一致；33 索引。 | 13 个 `_id_` 的 unique 属性有平台差异，原报告明确 `indexesExactlyEqual:false`。这是本机数据库恢复，不是整套 CloudBase 服务恢复。 |
| REM-14 | `2026-10-03-second-disk-backup-review.md:5–42` | 第二物理盘归档的清单和封口 metadata 校验。 | 该阶段没有重新计算整个 tar 或执行恢复；后续实际恢复要引用下一阶段。用户已明确异地/离线不作为此次门槛，不能再据此扩张任务。 |
| REM-15 | `2026-10-03-second-disk-database-restore.md:9–34` | 10-03 07:59:19–07:59:26，从第二盘归档提取 733 文件，在新本机库实际恢复，结果与原演练一致。 | 仓库只保留叙述和结果 SHA，没有报告原件可核对；恢复工具本体取自原任务目录，未包含在该归档内。 |
| REM-16 | 同一日志 `3–7` 的后续补记 | 10-04 17:28:07–18:25:39，长路径版提取 246,398 成员，重读 2,735 对象/38 函数，引用匹配。 | 应记录后续已恢复文件资产，不能继续沿用早阶段“存储/函数未恢复”；仍未证明云服务启动、业务运行和整体恢复。 |

以上会话日志均位于 `docs/tasks/session-logs/`。它们引用了可望复用的原件：

- `2026-10-03-0607/database/manifest.json`、各集合 selected raw pass、`cloud/database/<集合>/rule.json` 和 `table.json`。
- 同备份根的 `verification/storage-reread-and-references.json`、`cloud-package-integrity.json`、`restore-report.json`、`backup-index.json`。
- 第二盘的 `source-manifest.json`、`verification.json`、`database-restore-receipt-20261003.json`，以及从该盘恢复后的 `extraction-verification.json`、`acceptance-summary.json`。
- `tmp/second-disk-assets-restore-20261004/` 的实际退出回执、恢复结果和独立复核文件。
- `2026-10-05-legacy-observed/` 的 manifest、SHA256SUMS 和 `tmp/legacy-collection-archive-20261005/` 的补档核验结果。

完整外部根位置已由原会话日志记载。这里保留相对后缀，避免再复制个人机器路径或业务内容。本轮没有打开这些备份，也没有生成新的云备份或执行恢复。

仓库中的 [`scripts/backup-cloud-database.js`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/scripts/backup-cloud-database.js) 可作为工具实现证据：限制为读取端点、保存 raw JSON 字符串、检查多遍内容，并主动声明 `ONLINE_NON_ATOMIC_NOT_FINAL_SNAPSHOT`。**工具存在不等于导出原件存在或恢复已通过。**本轮未运行该工具；其中 `verifyRawPasses` 会写回本地 manifest，也没有拿它修改既有证据。

### 当前仍未验证的项目与最小只读取证

以下补充仅需要既有结果或读取接口，无需生产业务写入。采集时保存实际时间、统一环境代号、完整分页及原件/脱敏副本关联；敏感原件可继续保留在受控位置，审计只接收所需字段。

| 目的 | 最小需要的只读材料 | 材料到位后能确认什么 |
| --- | --- | --- |
| 当前环境和近期可用性 | 区域、环境状态、服务状态、当前套餐到期/续费状态、采集时间 | 排除把旧环境状态当今天状态。10-03 文档记载到期为 10-12 23:59:59；没有当前回执，不能断言今天仍未续费。 |
| 当前函数/源码对应 | 完整函数列表；名称、Status/CodeStatus、Runtime、Timeout、Memory、Handler、InstallDependency、修改时间、包摘要；相关函数完整源码/依赖文件 SHA 清单 | 确认哪一版实际部署，尤其本次 BIZ-04 涉及的 5 个入口及新增收赛/协管/找回函数。只比 `index.js` 不够。无需环境变量值或下载签名 URL。 |
| 当前规则和索引 | 完整集合清单与分页；每集合的 AclTag/Rule；索引名称、字段顺序、方向、unique/sparse/partial、构建状态 | 可确认当前静态配置，比较历史 13/16 集合差别，检查预期索引是否存在。仍不能单靠配置判真实事务/权限执行通过。 |
| 当前 water 开关 | revision、布尔开关、灰度名单数量、采集时间 | 确认当前是否开放及只读状态，不需要任何名单身份或账本内容。 |
| 历史备份/恢复可复核性 | 脱敏 manifest：集合数、文档/页数、selected pass、hash；存储/函数完整性摘要；恢复报告、源绑定、runtime/退出结果、索引差异；三历史集合补档 manifest | 核对先前结果、来源和范围。第一阶段无需下载 13,925 条用户文档、头像或整个归档。若要重新计算内容 hash，再单独限定受控原件访问。 |
| 单号权限历史证据 | 脱敏身份布尔、十类 ACL 操作结果、前后聚合 hash、规则对比、清理观察回执 | 能复核那一次临时测试的限定结论，不扩展成原生产赛事规则或多角色验收。 |
| 当前客户端发布版 | 脱敏平台版本详情及源码映射、发布时间 | 区分远端仓库、云函数和已发布客户端三条版本线。 |

**仅靠只读取证仍不能新增证明**真实云引擎的竞争回放/回滚、多角色双设备行为或整套 CloudBase 恢复。这些项目若没有已有且完整的真实执行回执，应继续记为未验证；本轮不会为了补齐状态而运行生产测试或恢复演练。

本轮没有新增业务缺陷编号；原业务专项 5 项问题报告（证据包：`evidence/business/report.md`） 保持独立，不重复运行已经充分验证的反例。补查的新增价值是明确 **20 条证据的来源与时点、原件缺口及最小补证范围**，使总报告能够准确区分“代码已检查”“历史记录可追溯”和“当前云端已验证”。

# 附录 G：日志、留痕、资源和保留策略的补查

## 2026-10-09 远端审计续查：日志、留痕接收、资源及保留证据

本专项的仓库检查已完成；当前线上实收、账单、资源量和保留执行仍未核实。本轮没有取得新的真实云返回。新增 TEL-02，归类为 P3 输入防护观察，不计入原 18 项已确认主发现。合成旧输入含显式 key7=0，只后移人工水位时，D7 子项变为 complete/0%；这证明矛盾输入未被拦截，但未证明真实 API 产生该种未成熟 D7 响应，也未证明统计实现违反现行合同或历史报表算错。

固定源码为 `LXZ56156/repo-20260224-031312` / `a3fe96f25015892ac30ee7148f97a5b441b0cb24`。只读源码及仓库中已保存的历史材料；必要的新增验证仅使用合成文件和未经修改的公开 CLI。未运行真实业务调用、云端负载、登录、部署、上传、规则修改或清理操作。旧 TEL/EFF/UI 证据复用，未重跑全量测试。所有产物在仓库外，源码 clean。

人数背景始终为“用户提供的日均约 90 人，人数口径未核实”。不把它写成已经验证的 DAU、同时在线人数或计费分母。

### 一、原始证据在哪里，以及本轮实际拿到了什么

当前 HEAD 中，排除依赖包清单及 vendor 后有 57 个 JSON/CSV/日志/压缩包等候选文件，主要为配置、UI 验收回执和声明性 manifest。没有跟踪 `tmp/` 或 `data/we-analysis/` 文件。对下列明确历史证据目录的可用 Git 历史查询也没有返回提交：

- `tmp/online-audit-2026-10-03/backend/`：函数详情、环境、账单、配额、CLS 汇总及失败关联日志。
- `tmp/audit-20261003-data/`：业务投影、清单、脱敏汇总。
- `data/we-analysis/audit-20261003/`：164 份微信原始响应和 fetch manifest。
- `tmp/online-followup-20261004-manual1649/`：最近一次有明确窗口的 CLS 分页、独立核验及退出回执。

这些目录在本轮 checkout 中也不存在。当前检出为 shallow，以上历史查询仅覆盖本次可见边界，不能证明完整 Git 历史从未保存过这些材料。历史文档明确说明原始响应含环境、请求或业务细节，保存于 Git 忽略的受限本地目录；这不是要求把原始日志上传到公开仓库。正确的后续做法是取得原持有者保存的受限原件，或受控脱敏清单/汇总，再核对窗口、哈希和完整性。

本报告分为四类证据：① 本轮直接读取的源码；② 仓库中的历史线上检查文字；③ 本轮合成 CLI 复现；④ 新真实云返回。第四类本轮为零。历史文档给出一个 SHA，并不等于本轮已经拿到对应文件并核验成功。

完整逐项矩阵在 `evidence-matrix.json`，共 20 项，每项包含文件/行号、文档窗口、原件路径是否存在、证明范围和局限。已对本轮直接读取的 20 个主要源文件另存 SHA-256。

### 二、日志与使用统计的时间范围重新核对

| 材料 | 历史窗口/读取时间 | 文档记载的内容 | 本轮结论 |
|---|---|---|---|
| `2026-10-03-usage-analytics.md:12–18,22–42` | 上海 09-02–10-01；最近 7 日为 09-25–10-01；10-03 01:38–01:47 拉取 | 164 成功 JSON、10 类接口；30 日 UV 人天 2,586/PV 45,505，7 日 UV 人天 682；9 月去重 MAU 1,714 | 历史汇总可读，原始响应不可复算；不报告为当前规模。 |
| `2026-10-03-analytics-report-repair.md:18–39` | 同上，latestComplete 固定 20261001 | 171 个 attempt、164 成功、7 失败；178 个聚合值对齐；列出输入/输出哈希 | 回执文字与哈希可读，被哈希文件缺席；不称本轮对齐通过。 |
| `2026-10-03-backend-audit.md:26–45` | 09-03 00:00–10-03 01:42；子窗口 09-26 起 | 全函数 27,378/近 7 日 6,787 去重调用；近 7 日 start 113，平台失败 14 | 这是 10-03 02:32 开赛部署之前的旧窗口，不能说当前仍有 12.39% 平台失败。 |
| `2026-10-03-backend-audit.md:49–65` | 09-26–10-03 01:42 | 延迟使用日志行加权近似百分位；scoreLock 3,037、submitScore 565 | 旧 P95 不是已核实请求级百分位；不能与新请求级 P95 直接做效果比较。 |
| `paused-plan-status.md:59–60`；`start-observation-latest.md:3` | 10-03 02:32:05–10-04 16:48:54 | 96 页、9,591 行；19 次非缺参 start 平台/业务成功，硬超时 0；19 条全缺版本，来源未知；P95 3,993ms | 最新留存的观察文字是 19 次，早先 9 次/4 次是子窗口，不能相加。仍无完整七日/至少 100 合格真实调用证据。 |

原七日观察截止为上海 **2026-10-10 02:32:05**；本次没有采集新窗口，也没有延后原截止或重建已删除的观察任务。若缺失时间段已超日志保留范围，必须保留“无法证明连续窗口”，不能靠重复小窗口或制造调用补足。

业务使用也需要保持快照边界：历史 `client_request_logs` 为 8,599 条、15 个 scope、全为 succeeded，覆盖文档所述 04-17 至 10-02。源码确认它是幂等成功记录，因此“全 succeeded”不能当作 100% 成功率。历史 89 本打水新账本/5 本有记账，后续按 06:07 备份得到 69 个成熟队列/2 个七日首笔；128 本房间均缺可靠测试/环境标记，2/69 仍不是已排除测试使用的生产转化率。首次和较晚快照的参与者人数变化，不应直接报成数据矛盾。

### 三、接收闭环没有新的线上证明

当前源码的两条 `wx.reportEvent` 通道仍按首轮报告的字段矩阵理解：新 activity 通道 17 字段，有匿名进程会话、操作/意图关联及尝试/结果；旧 growth 通道有模式字段。不能把它们概括成完全没有埋点，也不能因为函数调用没有抛异常就认定后台已接收。

历史标准微信 datacube 的 164 份成功响应是访问/页面/留存等聚合接口，**不证明自定义事件已配置、接受或可逐 ID 导出**。当前 `cloud-ops-daily-report` 仍只处理 CLS，不构成事件接收器；`we-analysis-report` 也不处理 activity/growth 的逐事件回执。

旧 `reportOpsActivityEvents` 的三个时点须区分：

1. 10-03 后端历史报告称它已部署、环境变量为空、约 30 天没有调用；原始详情不在仓库。
2. 10-04 合同称从旧备份完整读取过入口/logic/retention，并保存源码哈希；完整包和详细协议报告仍不在本轮可读仓库中。
3. 当前云端开关、密钥是否配置、调用量、访问规则及 TTL 没有新回执。

因此，本轮可以确认历史记录认为旧包与现行事件名、17 字段及 ID 格式不兼容，不能直接开启；不能声称本轮重新审查了完整接收包，也不能断言今天仍处于 disabled。当前字段能力、接收/拒绝/丢弃计数、逐 ID 配对和保留权限仍须实际平台证据。

### 四、资源与账单：哪些可以推导，哪些不能

| 证据 | 可以保留的历史事实 | 不成立的推论 |
|---|---|---|
| 09-11 优惠核验报告 `:13–16` | 文档记录既有订单实付 ¥19.90、延至 10-12；周期调用约 15.17 万/20 万、容量 44MB、流量 59.76MB | 不是当前价格/账期/余额；不据此承诺迁移省多少钱。 |
| 10-03 后端报告 `:15,22` | 历史账单快照为到期 10-12 23:59:59、IsAutoRenew=false、PREPAYMENT | 没有新账单，不能宣布当前未续费或已经断服。该日期值得优先只读复核。 |
| 同报告 `:111–127` | 文档配额原值含 FunctionInvocationpkg 19,258、FunctionGBspkg 1,772,748,800、DbReadpkg 202、DbWritepkg 0、DbSizepkg 36、StorageSizepkg 27 等 | 指标单位/周期未完全核实；DbWritepkg=0 不能证明零写入；不能据数字直接折算 GB·s、账单或超额率。 |
| 旧近 7 日函数计数 | scoreLock 3,037/全函数 6,787≈44.7% 的历史请求量占比 | 不是费用占比；也不能分离 status、heartbeat、acquire 或认定锁功能应删除。 |
| 首轮 EFF-01 至 07 | 可重复的代码级调用放大、缓存累积与重复解析条件仍成立 | DB 方法调用数不是计费文档数；合成场景不是当前真实活动人数、停留时间或账单。 |

资源效率排序仍应以已经证实的请求放大为候选，再用相同账期的实际数据决定投入。锁的历史调用占比较高，支持优先核实 EFF-03 的当前影响；过滤页重复读取及历史全扫描也应按真实停留小时/本人账本量测量。当前没有证据支持“已经发生高额浪费”或给出节约金额。

15 个非受管历史函数的责任人、调用者和现时用量仍未知。主线代码不调用某函数，不等于其他客户端不调用；没有费用分项前也不能将函数存在本身算成主要开销。此次没有删除或停用任何资源。

### 五、保留策略仍需证明“实际执行”

- **新事件建议**：`activity-observability.md:86` 的原始 14 天、聚合 90 天及每日 1,000 等明确为未启用建议，不是线上 TTL。
- **旧接收包**：`:94–95` 的历史协议摘要记载 180 天 `expiresAtMs`，retention 仅列候选而未删除；未接受项的 dropped 计数也并不完整。没有原包或新配置回执，不推定今天自动清理正常，也不把 dropped 缺失解释为 0。
- **幂等日志**：当前 `cloud-common.template.js:156–187` 与 `waterSession/index.js:467–485` 写入 createdAt/updatedAt，无 expiresAt。bootstrap manifest 为声明模式，未声明 TTL/清理调度。可以说受管源码没有实现到期清理，但不能排除云端另有配置；更不能为了省存储直接删除仍参与幂等重放的记录。
- **CLS**：历史能查到 09-03 日志，只说明当时有该段数据，不等于保留设置恰好是 30 天。本轮没有 Topic 保留配置。
- **对象与备份**：没有当前对象生命周期、过期回收结果、备份自动到期策略的原始受限回执。数据库与第二盘备份成功的历史说明，不证明过期事件同步从备份中删除，也不证明独立故障域或完整线上恢复。

保留核查应包含策略版本、生效时间、字段类型、最近任务结果、过期计数和备份覆盖。仅看文档天数或 expiresAt 字段不够；本轮不通过删除样本来验证。

### 六、TEL-02：旧输入与人工水位不一致的 P3 防护观察

经主控独立审校，降为 **P3 输入防护观察**，`countedInConfirmedFindings:false`，不并入原 18 项主发现。条件为操作者给出旧采集时间、显式 key7=0 和较新的人工 latestComplete；不是脚本自行推进日期。现行文档本来就要求操作者核实水位，零只来自显式数值，代码按这一合同工作。

`fetch-we-analysis.js:367–372` 会保存 `fetched_at`。但 `we-analysis-report.js:69–95` 只核 type/date/ref_date、重叠及文件 SHA，不核采集时间，也没有把 fetched_at 保留到输入摘要。`:127–140` 只根据 `队列首日+lag <= latestComplete` 判断成熟。公开 CLI `:177–193` 接收同一文件和新的日期，不会刷新数据。

公开入口的可达性已经核实，但不等于证明真实数据路径会产生错误：工具手册 `we-analysis-local-script.md:105` 明确读取现成 JSON，`:112` 允许人工根据已核实接口状态指定 latestComplete，`:114` 允许精确文件或 manifest；源码没有要求或实现先重新获取每个成熟队列的快照。另行核实今天的接口已产出，并不能更新旧目录里的同一份文件。

合成输入是 10-01 队列，`fetched_at=2026-10-02T00:00:00.000Z`，key0=100、key7=0。目标 D7 为 10-08；这个 wrapper 的采集时间与显式未来 D7 数值构成合成矛盾输入。没有取得真实微信未成熟 D7 会带 key7=0 的原始响应。使用同一 SHA 的文件：

| CLI/函数使用的 latestComplete | D7 输出 | 成熟数/状态 |
|---|---|---|
| 20261001 | null | immature 包含 10-01 |
| 20261008 | 0 | matureCohorts=1、status=complete |

公开 CLI 的固定复现形状为：

```bash
node scripts/we-analysis-report.js \
  --file <审计目录>/synthetic-dailyRetain-20261001.json \
  --begin 20261001 --end-exclusive 20261002 \
  --latest-complete 20261008
```

实际 CLI 退出码为 0、stderr 为空，输出已保存。**只有 D7 子项 complete，整体 `window.status` 仍为 missing**。主控独立对照及本轮补充的公开 CLI 缺 key 对照均仍输出 unknown/null；因此不能称所有缺失都会被补成零。`retention-freshness-probe.cjs` 同时验证原水位/后移水位和真实 CLI，支持 `AUDIT_REPO=/absolute/repo`，不联网、不修改源码。原 18 项清单保持不变；机器附录 `findings-addendum.json` 使用 observations 数组，并明确 priority=P3、countedInConfirmedFindings=false。

可选防护建议供后续授权考虑：给每份原始输入绑定采集时间及实际完整水位；至少拒绝或标 unknown 那些 fetched_at 早于目标日的队列。采集时间晚于目标日也只是一项必要检查，仍须处理平台延迟出数；成熟后取得新响应再纳入。保留旧水位复算历史快照是正常用法，不应被迫覆盖旧文件。此次只检查，没有修改工具。

降格原因：合成显式零未证明来自真实未成熟 D7 响应，调用方违反了快照与人工水位应一致的合理前提，缺 key 控制仍保留未知，整体完整性也未变成通过。这是一项可以加固的输入一致性防护观察，不能表述为已确认真实统计缺陷。当前没有证据说明 10-03 的 164 份历史复算受影响；当时固定 latestComplete=20261001 的口径不能被此反例推翻。

### 七、最小只读补证要求

主控已反馈本轮没有找到可用云连接，因此下列内容是尚未执行的查询要求，不是新返回的状态，也不要求提供密码、验证码、密钥或 OpenID。

| 次序 | 最小读取范围 | 必须保留的验收信息 |
|---|---|---|
| 1 | 当前环境/套餐/到期/自动续费与关联订单状态摘要 | 服务端读取时间、环境别名、周期、到期/状态；不提交订单或获取付款凭据全文。 |
| 2 | CLS 保留设置；原起点至实际读取时刻或原截止（取较早者）的 startTournament 完整有界日志 | 时区/环境/查询、每页 context/listOver/returnCount、原始哈希、request_id 去重、平台/业务结果、耗时和来源未知；不能造调用或累计重叠窗口。 |
| 3 | 已有自定义事件定义、允许字段、有限历史窗口实收及导出能力；旧接收器元数据 | 实际客户端版本、accepted/deduped/rejected/dropped、eventId/operationId 是否可查、访问/保留/额度；不发测试事件、不读密钥值。只有聚合时仍保留逐 ID 验证缺口。 |
| 4 | 当前账期配额与同周期按函数调用/执行资源/网络/存储摘要 | 原始指标名、单位、粒度、账期、套餐内/超额归因；未知单位不算钱，未知 action 不拆分锁操作。 |
| 5 | TTL/生命周期/清理任务/备份策略元数据及最近执行摘要 | 生效时间、字段类型、任务结果、过期计数、访问权限；不删除样本，幂等安全窗口先定清。 |
| 6 | 先找回指定历史输入清单；需要当前留存时再读取已成熟队列的新版响应 | 每输入 fetched_at、请求日期、errcode、完整水位和 SHA；不能用后移的全局日期让旧快照自动成熟。 |

若只能取得脱敏汇总，能够闭合的是趋势/总量口径；不能声称逐 ID 去重、原始分页或完整事件旅程已验证。若没有已有接收样本，纯只读检查不能制造首次端到端实收证据，需留待另行授权的受控客户端验收。

本专项到此完成仓库与离线可证明范围。线上状态仍未验证是清楚列出的证据边界，不以文档自述、测试通过或工具存在替代。

# 附录 H：独立范围完成度与证据审校

## 全面远端检查的完成度与结论独立审校

固定提交：`a3fe96f25015892ac30ee7148f97a5b441b0cb24`。本专项读取既有报告、原始结果、实际源码入口及历史计划，未重跑公平性实例、未改源码、未提交部署、未接触用户设备或生产数据。开始和收口时 checkout 均为 `master`、工作树干净。

**审校结论：原有 18 条发现及 2 P1 / 12 P2 / 4 P3 计数正确；没有发现必须撤回的原条目或把线上未知判为通过的结论。固定 HEAD 的源码检查和已执行离线核验可以收口，发现尚未修复不影响“检查完成”。历史 12 项开发计划仍未通过完整产品验收，其剩余开发、设备和云验收不是这次检查的实施清单。**

主控已完成当前云端入口线索、插件及CLI可用性核验，未取得可用的已认证云端只读入口。因此本次可读取的远端源码、GitHub、公共依赖和合成验证完成；全面检查中涉及当前平台实况的部分仍受阻未完成。最新日期的补查 `../root/report.md` 与最终总报告优先，不能用旧报告“检查与报告完成”的结束句覆盖这些开放项。

TEL-02 独立复核后不支持 P2 缺陷分级，主控已采纳，保留为单独的 P3 输入防护观察，不增加主发现数。主发现仍为18条、2 P1 / 12 P2 / 4 P3。

未取得本次获批检查计划的独立原文文件。按主控确认，以当前可见用户六点及根报告七类目标作本次范围依据；[`docs/tasks/current.md`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/tasks/current.md) 指向的是历史开发 12 项，不能声称已逐字取回本次原计划，也不能把历史授权自动恢复。

### 已独立核实的数字与重要结论

| 核验 | 结果与边界 |
|---|---|
| 原发现登记 | 18 个唯一 ID；业务 5、公平性 4、留痕/效率 8、UI 1；BIZ-03 的跨专项引用只计一次。17 个分专项结构化条目与合并版逐字段一致（仅新增 owner）；UI-01 另有根 onLoad 复现。 |
| 优先级 | P1 为 BIZ-01 旧 V1 数据覆盖与 BIZ-04 指定 SDK 请求事务标识缺失；P2 12 项、P3 4 项。CVE 的 critical/high 分类没有混入本项目 P1 数量。 |
| 全量范围 | 实际运行的 307 个测试文件与官方 `tests/*.test.js` 完全相同，没有以过滤后的子集冒充全量。原 TAP 为 1777 / 1768 pass / 7 fail / 2 skip、退出1；10/10 定向复核独立记录，不能算全量零失败。 |
| 公平性和排名 | 84 单打例、384 固搭核心例/320 休息字段反例、60模板/941前缀、4107比分对/8214两端断言、200排名样例/400两端对照、60流程/1014排名状态、31运行时例均与原JSON吻合。它们没有统一可加总的分母。 |
| FA-01 / FA-03 | 明确以最大连打1→2换取搭档/对手覆盖改善，属于当前用户偏好下的质量断崖/产品取舍，不是硬赛程非法，也不是无代价严格支配。 |
| FA-02 | 同队3–5场可改为人人4场；搭档重复不增、对手11→10、连打及最大连续休息不变差。根Python独立重算通过，只能称已核查指标下严格改善。 |
| FA-04 | 实际生成器到页面投影的休息名单缺失，不是原生屏幕验收，亦不代表对阵和排名错误。 |
| 两个重点参数可达性 | 8人1场地17场与12v10/5场地/24场经实际创建、设置与开赛源入口保留原值；前者不是被页面截到16的不可达内部例。 |
| 业务影响边界 | BIZ-04精确请求无transactionId不等于已看到生产回滚事故；BIZ-01限V1兼容；BIZ-02未证明取得主办/协管；BIZ-03赛事仍running且零写；BIZ-05云端更正仍正确、仅本地投影旧。 |
| 资源与依赖 | 账本读取公式逐样本吻合；DB方法数不等于账单。根npm快照97条目对应102个lock路径，均标dev；主控本轮补查公共云候选锁162路径/17条目，本专项只复核摘要与锁哈希，未重新执行扫描。两树数量不相加、不乘26，也不代表部署包漏洞实况。 |

### 本次七类检查的客观状态

| 检查目标 | 本次检查状态 | 尚不能证明 |
|---|---|---|
| 固定远端事实与工程记录 | 固定提交、1638跟踪文件、16页、26受管函数与307测试文件均有证据；10月9日HEAD仍相同，公开仓库有6条历史Actions，此HEAD为0；当前checkout仍clean。 | 发布客户端、部署包与源码同版性属于本轮远端待核事项；未取得可用已认证云端只读入口，受阻未验证。 |
| 四赛制、搭档与对手均衡、比分排名 | 核心合法性样例通过；FA-01/03为有休息代价的取舍，FA-02为已统计指标可严格改善，FA-04为显示字段缺失。 | 不涵盖所有大规模排法或线上参数分布；不将941模板前缀说成941次外层完整运行。 |
| 业务与数据安全 | 5条不同根因已复现或精确SDK请求确认，2P1/3P2；BIZ-03仅错报事件，BIZ-05仅错误本地投影。 | 真实云规则、实际SDK部署、冲突重试/回滚、真实身份及双机未验证；无事故频率结论。 |
| 实际使用留痕和指标闭环 | 已有17字段activity与7字段growth代码，growth含mode；13问题矩阵和TEL-01已查；不能说留痕代码全无。TEL-02经独立分级仅保留P3输入防护观察，不加主发现数。 | 平台配置、实收、查询、测试排除、真实用户用途和7日队列属于本轮远端范围；无当前可读入口/原始返回，受阻未完成。 |
| 资源浪费与效率 | EFF-01至07有源码操作或受控请求计数；历史分页公式与数表吻合。 | 方法调用数不是计费文档数，日均90人口径不明且不等于并发；实际账单、调用结构和存储增长属于远端待核，因访问不足受阻。 |
| UI静态完整性、配置与依赖 | 页面/引用/路由静态扫描与畸形query源onLoad复现；根97依赖条目102路径全部在lock标dev。另补公共云候选树162路径/17受影响条目，未取得部署包，不能相加为生产漏洞数。 | 实际包、云runtime/规则/索引、隐私后台证据未取得，受阻。原生尺寸/大字/交互与用户手机不在本轮仅远端操作范围，但保留历史产品验收门槛。 |
| 历史12项开发计划逐项对账 | 12行齐全，当前记录明确原计划未完成；本轮检查不恢复历史实施/部署/付款。第1平台失败阈值、第2历史空函数和整环境恢复缺口均已补入最终叙事。 | 历史备份介质、恢复产物和线上回执没有本轮重新取得；历史产品验收仍未闭合。 |

“源码检查已完成”描述限定范围的审计产出；“存在缺陷”描述被检查对象；“线上部分受阻未完成”描述本次整体检查仍缺的证据。三者可以同时成立，不能互相替代。主控已保存本轮实际入口核验，不能只引用历史失效会话当作本次结果，也无需为此操作用户设备。

### 根报告更正记录：三项均已应用

以下保留首次读取时的原句和位置，作为审校输入。已逐句核读10月9日最终叙事，COV-01、COV-02、COV-03均为applied；最终位置与实际采用文本记录在coverage-matrix.json。未保存首次读取的完整叙事文件，以下摘录不能冒充原文全量快照。

#### COV-01：已应用（原位置 root/audit-narrative.txt:245）

原句：本轮无新连续 7 天、≥100 合格真实调用记录

原因：历史原总计划第99行还有硬超时0和平台失败<1%的明确验收；表格未完整列出。没有误判通过，但对账不应漏门槛。

当时建议：本轮未取得带可靠来源/版本的连续7天、至少100次合格真实调用证据，不能核定硬超时0、平台失败率低于1%；平台与业务失败分开统计。历史观察截止另按 current.md 保留。

最终核验：第255行已载明“平台失败低于 1%”。

依据：`repo:docs/reports/2026-10-03-online-audit-and-roadmap.md:99`；`repo:docs/tasks/current.md:21`。

#### COV-02：已应用（原位置 root/audit-narrative.txt:246）

原句：未重新读取原 D/E 介质、恢复产物或当前账单/到期回执；13/16 集合历史差异原因仍未知

原因：最新详细状态的收尾表仍明确一历史空函数代码及在线整环境恢复未验，应在“仍未闭合原验收”保留。

当时建议：未重新核原介质/恢复产物、当前账单和到期回执；一历史空函数代码、在线整环境恢复及13/16集合历史差异仍未闭合。原计划要求10月12日前复核续费，当前是否续费/有效期仍待新回执。

最终核验：第256行已载明“1 个历史空代码函数及整套 CloudBase 恢复仍缺证据”。

依据：`repo:docs/tasks/paused-plan-status.md:42`；`repo:docs/reports/2026-10-03-online-audit-and-roadmap.md:100`。

#### COV-03：已应用（原位置 root/audit-narrative.txt:260-273）

原句：后续实施顺序与验收目标；下面是具体修复工作包，便于后续直接实施

原因：用户本轮再次明确检查不是修复；发现优先级和验收参考可以保留，但不应把修复包装成本轮接续工作。

当时建议：改为“审计发现优先级与后续验证参考”。说明：本节仅记录发现的处理建议，不属于本轮实施任务；本次检查是否完成以证据核验和报告交付为准，不以缺陷是否修复为准。

最终核验：第285行已载明“本轮不安排实施工作包”。

依据：`visible_user_instruction:检查，不是修复`；`visible_user_instruction:继续检查做完汇总报告`。

这些是报告范围和历史验收完整性的更正，不新增业务漏洞，不改变原18条优先级。

### 必须保留的表述边界

- `root/audit-narrative.txt:3,283`：旧结束句不能覆盖10月9日最新状态。最新补查 root/report.md 已明确：可用源码、GitHub、公共依赖和合成验证完成，全面检查中的线上部分因缺少已认证只读入口仍受阻未完成；报告交付不等于线上检查已完成。
- `root/audit-narrative.txt:21`：“此提交Actions运行数0”正确。主控新查有6条仓库历史Actions，不能改述为全仓库没有Actions或从未运行CI。
- `root/audit-narrative.txt:24`：“远端最新提交”建议附核验时间；主控本轮重读仍a3fe96f，仅凭旧回执不能长期保证最新。
- `root/audit-narrative.txt:139-144`：所有计数核对通过；941是模板实例化前缀，200/400是合成排名算术样例，均不是线上通过率或所有参数穷举。
- `root/audit-narrative.txt:9 and combined-findings.json`：原18唯一条目及2/12/4正确，包含取舍及优化。TEL-02虽有真实CLI合成入口证据，尚无真实未成熟API响应或实际损害，独立审校建议P3防护观察；主控已采纳，主发现仍18，不改成19个已确认问题。

### TEL-02 的独立分级意见

**建议 P3 输入防护观察，单列而不计入18项主发现；不支持原提议的 P2 缺陷。主控已经采纳。**

已确认的行为是：公开CLI接受早于目标日的 `fetched_at`、fixture主动提供的 `key7=0`，以及操作者后移的 `latestComplete`，使D7子项变为0/complete；逐输入的新鲜度没有交叉校验。并非只有内部函数可达。

但文档112行要求人工根据已核实接口状态指定水位，120–121行要求目标key确有数值且零仅来自明确0。当前证据没有证明真实未成熟接口会返回fixture那种占位，尚不能证明真实正常约定用法产生错误留存率。root独立对照删除key7后仍为null/missing；合成报告的整体 `window.status` 也是missing，不能说整份报表变成完整经营报告。

建议报告措辞：合成旧快照与后移人工水位可形成未被拒绝的矛盾输入，建议增加逐输入新鲜度校验；真实API是否存在该形状及历史损害均未证实。不能写脚本自动推进水位、任意旧输入补0或历史报表已错。将来若取得受支持采集链实际返回和成熟后权威数据，可以重新评估；本轮不为此制造调用或修改统计代码。


### 历史12项：对账完成，产品验收未闭合

| 项 | 历史验收目标 | 本次新证据 | 仍缺的证据 |
|---|---|---|---|
| 1 开赛超时 | 连续7天、至少100次合格真实调用，硬超时0、平台失败率<1%；可靠来源/版本，平台与业务失败分开。 | 源码deadline/预算、算法样例及SDK边界有新证据。 | 只有截至上海10-04 16:48:54的19次非缺参成功历史记载；上海10-10 02:32:05为历史观察截止，不自动延后或恢复调度。 |
| 2 续费、备份和恢复 | 当前有效期/续费回执；赛事、资料、账本和文件引用能隔离恢复；补齐资产缺口。 | 仅核对13925文档、2735对象、38函数恢复及三集合补档的历史记载。 | 一历史空函数代码、在线整环境恢复、13/16集合差异原因仍缺；原计划10/12前复核续费不是当前已确认到期或付款事实。 |
| 3 留痕与故障监控 | 关键动作attempt/result可关联，失败入统计；实收、去重、脱敏、每日简报和异常查询。 | 字段、行为链、报表及TEL-01/BIZ-03有新证据。 | 平台配置/接收、查询权限、受控测试排除及完整窗口未知。 |
| 4 原前端三缺陷及同步 | 直接回归与真实手机慢网、切页、首次watch等实际验收。 | 官方全测试集合已覆盖相关源回归；新增BIZ-05。 | 当前发布包及原生/手机慢网验收未取得；历史本地修复不等于已发布。 |
| 5 录分并发和数据库权限 | 真实身份/规则公开字段/客户端新增权限；隔离锁接管、冲突、回滚及多号双机。 | 角色/锁/版本代码、BIZ-04精确SDK请求有证据。 | 真实云引擎及当前有效规则、隔离角色/双机仍未验证。 |
| 6 打水首次记账 | 真实首次场景，进入→成员→首笔，测试排除及完整7日新账本首笔率。 | 事件语义、handler及资源路径已查。 | 真实用途、匿名账本关联、成熟创建队列与实际阻塞未知；不得凭猜测改界面。 |
| 7 提前收赛 | 保留已录比分，待赛标取消，统计范围明确；不改变独立打水无结束按钮合同。 | 纯逻辑/权限/活跃锁约束与相关回归已查。 | 新函数与客户端实际部署、原生确认/分享、手机并发未驗。 |
| 8 协作管理 | 主办授撤、真实成员绑定、最小权限、审计与撤权效果。 | 权限/版本/guest排除等源合同已查。 | 真实授权审计、跨会话撤权并发、云规则、原生双机未验。 |
| 9 运行时SDK与依赖 | 工具链/云依赖分离，真实身份/事务/错误/日期数值/幂等/回退验证后维护。 | 根audit97个dev条目与精确云数据库链有新证据；主控补查公共云候选树162路径/17条目，本专项仅复核摘要与锁哈希，未重新扫描。 | 当前部署依赖、CloudBase实际runtime与回退未核；本轮未升级。 |
| 10 首屏同步大赛事性能 | 低端Android与iPhone同场景首屏/读写/桥接/渲染P95及改前后比较。 | 源码单位动作和重复请求、受控算法耗时已查。 | 没有真实设备或同窗口调用/传输/存储/账单，不把Node计时当手机P95。 |
| 11 赛事找回与跨设备 | 真实参赛身份/guest明确绑定、主办参与找回、权限/索引和跨设备结果。 | server身份、cursor绑定、权威名单过滤及静态入口已查。 | 实际微信/数组索引/云查询成本/普通用户跨设备未验。 |
| 12 单打循环 | 已采用2–8人/1–2场/1–2循环、分制/并列名次合同及全链路；原生/云/真实比赛验收。 | 独立排赛、终局、排名和60流程验证通过。 | 当前像素/尺寸/大字、原生交互、云部署和手机/发布版未知；历史图与离线测试不替代。 |

原计划出处：[`docs/reports/2026-10-03-online-audit-and-roadmap.md:93–112`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/reports/2026-10-03-online-audit-and-roadmap.md#L93-L112)；当前状态出处：[`docs/tasks/current.md:19–32`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/tasks/current.md#L19-L32) 和 [`docs/tasks/paused-plan-status.md:35–54`](https://github.com/LXZ56156/repo-20260224-031312/blob/a3fe96f25015892ac30ee7148f97a5b441b0cb24/docs/tasks/paused-plan-status.md#L35-L54)。其中历史“38函数已恢复”和本次“26受管函数”属于不同清单，不能相减得出12函数丢失。原快照1793测试和本次1777也分别保留，未重新运行历史未跟踪候选来凑数。

### 证据与收口

`coverage-matrix.json` 保存七类范围、十二项历史验收、原18条对账、精确数字、原句及已应用更正、读取文件SHA-256，以及最终finalVerification。`review-evidence.py` 只读取本地证据并核对内容，不运行应用、不请求外网；原算法与业务复现没有重跑。

复核命令：

```bash
AUDIT_REPO=AUDIT_ROOT/repo python3 AUDIT_ROOT/evidence/remote-followup-20261009/coverage/review-evidence.py
```

最终核读的总叙事SHA-256：`3cdccd147f65f5658d69fd3677bb376c22475f4dc5987151199c3d6b8bd09ff7`（32665字节）。主控最后一次远端HEAD核验为2026-10-09 09:11:42 UTC，仍为固定提交；本专项未另发远端请求。

本专项收口状态：完成度/结论审校完成；三处范围/验收更正全部应用，最终条目数为18项主发现加1项单列P3观察。主控的本轮远端访问核验与公共云依赖补查已纳入，线上实况仍因读取条件不足而受阻未完成。没有要求以修复所有问题、恢复设备或完成历史产品计划作为本次检查交付的前置条件。
