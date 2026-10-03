# 第二物理盘恢复输入与结果冷审（2026-10-03）

## 范围

只读核对主仓库 `D:/projects/badminton-miniapp/main` 的 `AGENTS.md`、`docs/tasks/current.md`，0607 原 `verification/restore-local-mongo.py`、`database/manifest.json`，E 盘第二副本的 `source-manifest.json` 与 `verification.json`，以及新提取脚本、adapter 和新恢复报告汇总。未读取恢复文档正文，未执行恢复、生产操作或删除。

仓库为 `master` / `b571c68754e964e1a73800645f68a49d99f40f41`；工作树已有多项用户改动，均保留。

## 输入边界

原恢复脚本实际消费的最小恢复输入为：0607 `database/manifest.json`；每集合 `selectedPass` 指向的 raw API 页（此清单 13 集合均为 pass 2）；清单 `files` 列出的 `documents.json` 与 `documents.ndjson`（脚本逐份验证字节数和 SHA，但文档导入以 raw API 字符串为准）；以及 13 个 `cloud/database/<集合名>/table.json` 索引定义。脚本从 raw 计算集合字符串哈希、数量和页数；manifest 中的 `rawPassesVerified` / `rawPassesMatch` 标记用于确认双遍一致，但本次恢复代码没有重新读取 pass 1 的 raw 页。因此，pass 1 页属于完整保留双遍证据的输入，非此脚本导入回合直接消费的数据。13 集合合计 13,925 文档。

主控提取脚本 `tmp/restore-e-backup-20261003.py` 选择整个 `0607/database/`、整个 `0607/cloud/database/` 和原 `0607/verification/restore-local-mongo.py`，未提取 storage、cloud functions 或原 `verification/local-mongo` 输出。新提取根为 `D:/Relocated/LIZIXUAN/Codex/backups/badminton-cloudbase/2026-10-03-second-disk-restore`。回执汇总 733 文件、182,573,646 字节，各成员字节数与 SHA 均匹配 E 盘 source manifest；原 D 盘副本未作为恢复输入。

E 盘 `verification.json` 记载归档完整验证为 251,040 文件、3,061,841,920 字节，archive SHA-256 为 `b9ac90b610f6a12570cf62574235a9713a32bc3c9883049a0734579e8079488e`。本次抽取逐成员校验选中输入，但没有重新计算整个 tar 的 SHA；抽取回执也明确记录这一点。该副本与源码在同一主机，仍不构成离线/异地主备份或 CloudBase 环境恢复。

## Adapter 与路径

新 adapter `0607/verification/restore-local-mongo-from-e.py` 将 ROOT/EXPECTED_ROOT 指向新提取根下的 0607，报告继续写入该新根的 `verification/restore-report.json`，dbpath 与日志写在该新根 `verification/local-mongo/`。DB 名改为 `badminton_restore_from_e_20261003`，仅绑定 `127.0.0.1:27029`，并在端口已有监听时拒绝；URI 同为 loopback 27029。索引来源只接受新提取的 `0607/cloud`，缺少任一集合 table.json 即拒绝，不再回退到旧 D 盘副本。adapter 保留原恢复脚本，其余恢复、哈希、类型、索引、关联检查与停机逻辑未改。工具链路径仍指向 main 下 `tmp/restore-tools-20261003`；本轮回执另记 MongoDB 8.0.32 执行文件来源校验。

## 冷审结果

新根 `verification/restore-report.json` 汇总为 `complete`：13/13 集合通过，期望/恢复总数均为 13,925；所有文档规范化 BSON hash 与类型计数匹配。索引共 33 个，其中 13 个差异均为 CloudBase 的 `_id_` `Unique=false` 与 MongoDB 固有唯一约束的已知平台差异；无意外索引差异，因此报告的 `indexesExactlyEqual=false` 是准确记录。4 项账本引用检查缺失与孤儿均为 0。MongoDB 版本 8.0.32，端口 27029，进程退出码 0，`shutdownVerified=true`；远端写入为 false。数据库读取汇总包含赛事状态、含局的赛事数、用户资料、旧打水会话、账本条目与房间计数；未输出任何文档内容。

本机 MongoDB 回环验证范围有限：线上导出不是跨集合原子快照；该回环不模拟 CloudBase 权限、SDK 事务、身份、存储权限与 OpenAPI；源 API 可能没有保留全部 BSON 类型元信息；MongoDB `_id_` 与 CloudBase `Unique=false` 存在已知平台差异。端口关闭及既有输出拒绝/回执不变已由主控后续验收摘要确认通过；本冷审只读回执，未重新执行这些动作。

## 主控后续独立验收补充

新根 `acceptance-summary.json` 记录 `verified`：13 集合 / 13,925 文档的 hash 与类型匹配、33 索引中 13 个已知 `_id_` 差异、4 个关联无孤儿；27029 监听关闭，恢复结果与原本机恢复相同。重复 `--preflight` 对已有 report 正确拒绝，之后 report 字节未变；SHA-256 为 `462f7186cde07624385ffe8a38709ce9e2648b9526fb2ebe2d98abbd43b71601`。因此上一节等待主控确认的端口关闭与输出保护门禁现已关闭。

`tool-verification.json` 确认归档哈希匹配原官方回执、MongoDB 可执行文件匹配已验证归档、无网络访问；可执行文件 SHA-256 为 `38f8e6dfbc496ae4089f15b8235f15287adfbd8c09eafa4f384a2e5361625522`。该验证仅佐证本机恢复工具来源，不扩大数据或 CloudBase 语义覆盖范围。
