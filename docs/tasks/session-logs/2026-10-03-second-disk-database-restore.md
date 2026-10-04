# 2026-10-03 从第二物理盘副本实际恢复数据库

10-04用户明确备份存在本机即可，异地/离线不再本轮门槛；新增从E恢复存储和函数文件树的阶段统一见[第2项详细状态](../paused-plan-status.md#10-04依序续做第2项本机资产恢复)。工具`tmp/second-disk-assets-restore-20261004/`，原D/E/数据库恢复根保留。首轮提取11788成员后Windows260字符边界失败、exit1，新partial保留；另名长路径版已核最长278、实际318字符I/O通过，实际新`-longpaths`目标已完成246398成员提取、2735对象/38函数文件树重读及13072引用全匹配。子进程/outer均exit0、双摘要一致，5份新metadata另核E来源和实际receipt绑定；本机文件恢复通过。下方13/13925数据库已恢复结果仍有效，不覆盖旧DB/首轮失败证据，也不混称整云服务已恢复。下方旧“本次未从E恢复存储/函数”仅说明10-03数据库阶段，10-04新增结果以上方和正文为准。

10-04实际上海17:28:07–18:25:39完成资产核验；`unified-exec-terminal-receipt.json`记录统一exec79279、child/outer均0，主恢复独立stderr为0bytes。`postrun-execution-receipt.json`记录新metadata绑定实际命令exit0及工具/结果/合并输出SHA；该调用未分离stderr，bytes为null，不把无可见诊断说成独立stderr0。没有重放运行覆盖证据。本阶段仅离线新工具/恢复和文档，无业务源码改动，不重复已有应用全量。

Luna实际终态只读冷核通过、未发现P1，记录新ignored `postrun-cold-review.txt`；双摘要bytes/SHA、outer/preflight/sourceManifest及postrun工具/结果/合并输出SHA均绑定匹配。主控审本阶段全部staged范围，80个文档本地引用有效、current1493字符、diff检查通过；只提交5份文档，既有配置与单打候选逐hash保持。

主控北京时间07:59:19–07:59:26实际运行从E盘归档取得输入的新本机隔离恢复：13集合、13,925文档逐文档BSON canonical hash及类型一致，33索引恢复、13个 `_id_` unique平台固有差异单列。四类账本关联missingField/orphan均0。MongoDB8.0.32退出code0、shutdownVerified=true，主控另核对27029无监听。

## 输入来源与保全

- 唯一备份输入来自`E:\CodexBackups\badminton-cloudbase\2026-10-03-second-disk\backup-sources.tar`及封口source-manifest/verification。脚本`main/tmp/restore-e-backup-20261003.py`不从原D数据库/索引读取恢复输入。
- 全新目标`D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-second-disk-restore`，已有目标即拒绝。选取0607/database全部文件、cloud/database全部文件及原恢复脚本，共733文件/182,573,646bytes；每项路径、大小、SHA256与E源清单一致，没有使用tar.extractall，没有提取原local-mongo/dbpath。
- 本次不重新全量hash整个tar；逐选中成员hash验证、tar前后size/mtime相同。完整tar hash使用前一步已封口证据；与本次选中内容验证区分记录。
- 原D两份快照和E归档只读，恢复只写新目录。恢复后仅为结果对照读取原D restore-report，未复制它代替新实际报告。

## 映射、执行与验收

E中原`verification/restore-local-mongo.py`按封口hash原样提取保留；新建`restore-local-mongo-from-e.py`，六处明确单次替换：EXPECTED_ROOT新目录、数据库名`badminton_restore_from_e_20261003`、端口27029、URI端口、端口报错文案、索引缺任一新table.json即拒绝而非回退旧D。解析、类型、索引、关联与进程所有权检查未变。

工具仍取main/tmp/restore-tools-20261003，不在E归档内。重新hash MongoZIP与原官方校验回执一致，mongod.exe与该ZIP对应成员SHA256一致（`38f8e6dfbc496ae4089f15b8235f15287adfbd8c09eafa4f384a2e5361625522`）；本阶段无网络请求。

实际py_compile和`--preflight`通过（mongoStarted=false、13/13925、新索引输入），再`--run`退出0。主控读取新报告，核对全部collection pass/hash/types、33索引accepted及13已知差异、四关联、正常退出和27029关闭；赛事/资料/账本计数、类型、raw hash、索引结果与原D演练一致。再次`--preflight`拒绝既有输出，报告bytes不变，不重新启动或覆盖恢复库。

## 证据与限制

- 新目标顶层`extraction-verification.json`（733输入路径及来源hash）、`tool-verification.json`、`acceptance-summary.json`。
- E盘另以独占新建保存`database-restore-receipt-20261003.json`，附新恢复报告、提取与工具核验hash；原tar、source-manifest及verification均不改写，原README中的未恢复说明为复制封口当时状态，以本新阶段回执为准。
- 新目标0607/verification下原脚本、新adapter、restore-report.json及local-mongo日志/库；新实际报告SHA256=`462f7186cde07624385ffe8a38709ce9e2648b9526fb2ebe2d98abbd43b71601`。
- [Luna只读冷审](2026-10-03-second-disk-restore-review.md)独立核对adapter及实际报告，范围不同于主控实际导入。
- 输入含两遍raw，本次恢复仍使用selectedPass2；逐成员hash覆盖提取的两遍，没有重新线上双读。
- 本次未解包/运行38函数包、未从E重新恢复2735存储文件或服务、未验证CloudBase身份/规则/事务或整环境恢复；原存储引用完整性见[备份完整性核验](2026-10-03-backup-integrity-verification.md)。在线快照非跨集合原子，同机第二物理盘非异地/离线灾备，历史空代码函数缺口未消除。
- 业务源码没有变化，仅新增离线任务脚本和记录，不重跑已通过的1564项应用测试。
