# 2026-10-03 备份执行暂停记录

**历史快照说明：以下保留02:50的首次备份暂停位置及当时未解释的计数。之后用户已授权恢复，[对账](2026-10-03-backup-reconciliation.md)确认13,925、14,025为本快照汇总错数；旧0238仍partial，新0607已完成导出及本机恢复，见[完整性核验](2026-10-03-backup-integrity-verification.md)。2026-10-04用户再次暂停的是完整总计划，当前goal paused，最新进度和恢复条件见[暂停交接](2026-10-04-plan-paused-handoff.md)。不得按下文旧“未开始/待导出/未恢复”覆盖后续实际成果，也不改变旧备份原件。**

用户明确要求“先暂停并记录进度”。暂停状态文件记录时间为北京时间2026-10-03 02:50:45。远端备份已停止，本轮不再自动继续下载、导出、验证、部署或续费；后续由用户新开的任务接续。

## 暂停位置

- 第1项云端修复已于02:32仅部署 `startTournament`：Timeout=10、远端源码与配置核验、缺参烟测通过。客户端恢复修复尚未上传/发布，见[部署记录](2026-10-03-start-timeout-repair.md)。
- 当前在第2项“近期完整备份和恢复核验”，尚未开始第3项留痕实施。
- 本轮新备份根：`D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-0238`。旧9月11日备份未覆盖。本轮远端仅只读，没有业务数据写入、额外部署或付款。

## 已保存与未完成

| 部分 | 暂停时已保存 | 尚未完成 |
| --- | --- | --- |
| 数据库 | 现场13集合，inventory计数合计14025；4集合完成两遍读取及解析内容hash/计数一致：client_request_logs 8599、delete_tournament_requests 20、feedbacks 7、score_locks 27，共8653文档 | tournaments第一遍完成、第二遍中断；后8集合尚未读取。全量manifest为paused；原始字符串hash独立复核未做，不能宣称完整数据库备份 |
| 云存储 | 空Marker/空Prefix、无Delimiter取得完整分页：2735文件、28,481,879字节；下载时大小、ETag/适用MD5、SHA-256通过；前后清单各3页，零增删改 | 暂停后的独立本地重读验算和数据库cloud://引用交叉核验尚未开始 |
| 云配置与函数 | 环境、账单及13集合规则/索引已保存；首批20函数完整包已保存，127870文件、804181970字节，首批无失败 | 已知线上全量39函数目标未完成。首批manifest的success只代表20项范围，不能作为全环境完成依据；以cloud/pause-status.json中的暂停范围为准 |
| 本地恢复 | 下载官方MongoDB 8.0.32 ZIP并核对官方SHA-256；PyMongo安装在本任务tmp目录；临时MongoDB仅绑定127.0.0.1:27028，启动/ping/dbpath核验成功；恢复脚本已保存 | **尚未执行导入或恢复核验**。用户暂停后已正常关闭临时MongoDB，没有系统服务或监听残留 |
| 续费 | CLI可读取账单，原记录到期2026-10-12 23:59:59、自动续费关闭；Edge续费控制台需要重新登录 | 当前价格、付款与新到期时间未核实。登录页已保留，用户尚未回复已登录；不因暂停继续催问或操作 |

与约01:42业务投影13,925文档相比，后续现场清单14,025相差100；两次读取时间不同且不是原子快照，尚未做集合级差额对账，不能判定差额原因，也不能据此宣称数据丢失或完整。下次接续先按集合复核现场清单及partial，不要按总数直接重跑。

## 文件与进程

- 数据库导出进程PID7360已停止；`database/manifest.json` 为paused，细节见该目录 `PAUSED.md`。
- 存储下载进程已正常结束，确认无对应后台进程；`storage/manifest.json` 保留 `COMPLETE_VERIFIED` 的下载范围，`storage/pause-status.json` 记录后续核验暂停。
- 云元数据/函数下载停止后由 `cloud/pause-status.json` 记录范围；不重启任何下载。
- 本地MongoDB PID49268已通过匹配dbpath后正常shutdown；主控复核27028无监听、本任务导出/下载脚本无匹配运行进程。
- 本轮只新增备份工具 `scripts/backup-cloud-database.js`、`tests/backup-cloud-database.test.js`。4项直接测试通过；另有4项lint待修（fetch/AbortSignal全局声明及2处while(true)），暂停后不再修复或跑检查。没有重跑业务全量测试，也不将上轮1496通过当作新工具最终验收。
- 存储/云备份执行脚本位于 `tmp/backup-storage-20261003.cjs`、`tmp/backup-cloud-metadata-20261003.cjs`；临时恢复工具在 `tmp/restore-tools-20261003/`，恢复脚本在备份根 `verification/restore-local-mongo.py`。当前恢复脚本仅准备，未经实际数据执行验收。
- 全部原有脏树、未跟踪产物、备份与本轮partial原样保留；未commit/push。

## 用户恢复后的顺序

1. 先读取本记录、三份分项暂停文件及当前进程状态，不启动旧残留任务。
2. 修正数据库工具4项lint并复核原始字符串精度校验。现工具拒绝既有输出目录；使用新兄弟目录重跑，或先明确实现不会覆盖现有证据的断点恢复。不要直接重跑到当前partial目录。
3. 补齐39函数全量备份，保留首批20项回执；重新核对清单范围。
4. 完成数据库全部集合后，对存储做本地重读及全部cloud://引用核对，再在仅本机的临时MongoDB做实际导入、日期/数值类型、逐文档hash、读取和索引核验。导入前脚本必须确认backup complete且目标dbpath/监听为本任务，拒绝覆盖已有恢复库。
5. 汇总完整性/缺口后再处理续费本人登录及付款决定；继续第3项留痕与监控。已用完的startTournament部署授权不覆盖新的函数部署或客户端上传/发布。

恢复工具来源：[MongoDB官方下载](https://www.mongodb.com/try/download/community-edition/releases)、[Windows ZIP运行说明](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-windows-zip/)。仅说明工具来源，不代表已完成恢复。
