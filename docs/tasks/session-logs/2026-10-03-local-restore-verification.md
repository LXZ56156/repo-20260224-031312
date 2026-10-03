# 2026-10-03 本机隔离 MongoDB 恢复验收

## 当前状态

主控已于北京时间2026-10-03 06:18:29–06:18:36执行新备份预检与本机隔离恢复：**13集合、13,925文档逐文档BSON canonical hash、计数与类型往返通过**。新快照33个索引已创建/核对，其中13个 `_id_` 存在已明确记录的平台固有unique差异；不能称索引完全相同。任务MongoDB正常退出、27028关闭，shutdownVerified=true。

- 新备份根：`D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-0607`。
- 脚本：新根 `verification/restore-local-mongo.py`。
- 目标：`verification/local-mongo/db`，`127.0.0.1:27028`，数据库名 `badminton_restore_20261003_0607`。
- 旧 `2026-10-03-0238` partial 仅只读参考，不改写；本阶段未请求生产 API、未写生产数据、未部署或提交。

## 执行门禁与证据

1. 先检查 fixed 新根、数据库 manifest complete/rawPassesVerified、每集合 complete/rawPassesMatch、selected raw 页数/计数/ID、raw hash 与 manifest 相符、导出文件大小/SHA-256、全量计数。
2. 优先使用新根 cloud/database 下全量 table.json；如新索引清单尚不完整则只读旧 partial 索引快照，并在结果记录 indexSourceIsNewBackup=false。主控拟等待新清单完成后执行。
3. 已有 report、local-mongo 目录或27028监听均拒绝复用。仅创建全新任务目录/数据库，MongoDB 由脚本以无窗口子进程启动；getCmdLineOpts 核对 dbpath、bindIp 和 port 后才能导入。
4. 恢复源使用 API 原始 JSON 字符串，PyMongo Extended JSON 解析。逐文档比较 canonical BSON JSON SHA-256；递归核对 date、int32、int64、double、bool 计数。
5. 创建与核对全部索引 keys、unique、sparse、partialFilterExpression 及索引总数。CloudBase `_id_` 的 Unique=false 与 MongoDB 固有 unique=true 分开记录为 knownPlatformDifference；不会将这些索引标为完全相同。
6. 本地读取赛事状态、matches结构、资料、legacy账本与新账本集合；核对 room/round/entry/member 引用，将缺失字段与孤儿引用作为源数据事实记录。
7. 最终再次匹配本任务 dbpath 后正常 shutdown，验证对应进程退出且27028无监听；不满足则报告失败。保留本机恢复库与日志，不删除证据。

## 已完成验证

- `python -m py_compile <新根>/verification/restore-local-mongo.py`：通过。
- 合成数据离线检查：7项通过，未启动 MongoDB。覆盖 Extended JSON 日期、大数9007199254740993不丢精度、显式Int64类型、BSON编码/解码后的 canonical hash与类型计数、索引方向/unique/sparse/partial规范化、合成complete备份预检、incomplete/raw篡改/既有目录拒绝。
- 首次合成文件检查因 Windows 文本换行转换与测试 fixture 的预期bytes不符失败；改为写入固定bytes的 fixture 后通过，恢复脚本保持按实际文件bytes核对。
- 下列命令已由主控实际执行；子代理随后只读核对新根restore-report.json，没有再次导入或运行：

```powershell
python 'D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-0607\verification\restore-local-mongo.py' --preflight
python 'D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-0607\verification\restore-local-mongo.py' --run
```

本机MongoDB导入/读取往返不能证明 CloudBase 安全规则、微信身份、SDK事务、存储权限、OpenAPI或整套云环境恢复。在线备份也不是跨集合原子快照；API未导出的BSON类型元数据不能由此证明。

## 实际恢复结果

- 证据：新根 `verification/restore-report.json`，status=complete，allDocumentHashesEqual=true，allTypesEqual=true，indexSourceIsNewBackup=true；MongoDB 8.0.32，mongoProcessExitCode=0、shutdownVerified=true。
- 实际恢复类型统计：date 28,550，int64 1,466，int32 172,653，bool 3,266；本次源数据double为0。合成数据另证明double及显式小值Int64可保持，不能将不存在的真实double样本计作已实测。
- 索引33个；普通索引keys/unique/sparse/partial一致。13个 `_id_` 的source Unique=false、MongoDB固有unique=true单独记录；indexesExactlyEqual=false、indexKnownPlatformDifferences=13。
- 读取赛事状态：finished 412、draft 1,251、running 1,101；带matches赛事1,513。资料2,093、legacy waterSessions 15、水流水12、waterRooms 128可读取。
- waterEntries→waterRooms、waterEntries→waterRounds、waterRounds→waterRooms、waterRoomMembers→waterRooms四种关联均missingField=0、orphanDocuments=0。
- 全量恢复使用新根selected pass的raw源及新根13集合table.json，未覆盖旧partial；恢复库、脚本与日志保留为本机证据。
