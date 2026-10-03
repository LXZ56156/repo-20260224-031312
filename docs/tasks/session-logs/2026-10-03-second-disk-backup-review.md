# 2026-10-03 第二物理盘备份只读复核

## 结论与边界

复制脚本静态检查无源写入、旧目标覆盖或归档路径穿越问题；完成后的 source manifest 与 verification 元数据范围一致。本次只读取脚本、源清单和封口后的 metadata，没有读取/重算完整 tar、解包、恢复、部署或删改源。没有修改 `current.md`。

## 脚本检查

`tmp/copy-backup-second-disk-20261003.py` 固定读取 D 盘下 `2026-10-03-0238` 与 `2026-10-03-0607` 两个目录。目标已存在时立即拒绝，创建目标也要求目录原先不存在；归档和两份 metadata 写入均在该新目标内，其中 metadata 使用独占新建。源文件以只读方式打开，逐文件比较读取字节数和前后大小/mtime；归档验证逐成员要求普通文件、清单内路径、名称不重复、大小及 SHA-256 相符，并要求所有记录均出现。归档名由源根相对路径生成。脚本检查软链接及 junction；本机 Python 3.13.12 提供 `os.path.isjunction`。

## 清单与范围

用拒绝重复 JSON 属性的解析器读取 `source-manifest.json`；251,040 个文件名均唯一且为两个快照根下的相对路径，没有绝对路径或 `..`。逐根数量和大小如下：

| 源快照 | 文件数 | 源文件 bytes |
| --- | ---: | ---: |
| 2026-10-03-0238 | 133,759 | 1,167,986,356 |
| 2026-10-03-0607 | 117,281 | 1,437,783,371 |
| 合计 | 251,040 | 2,605,769,727 |

合计文件数与 `sourceFileCount`、`verification.filesVerified` 一致；合计 bytes 与 `sourceBytes` 一致，均为 2,605,769,727。归档文件本身大小为 3,061,841,920 bytes，与 `verification.archiveBytes` 相同。本次没有重复计算 tar SHA-256。

范围抽查结果：

- 数据库 manifest 声明的 13 个集合均选择 pass 2。按源目录文件名与归档清单逐项对照，259 个 selected-pass raw 页文件全部在清单内；集合文档总数为 13,925。
- `backup-index.json` 中 38 个函数包逐包与归档清单核对，代码文件数、bytes 及各自的 `files.json` 均匹配。
- 旧 partial 保全基线中的 6 个文件都在归档清单内；源 after 记录为 6 项 unchanged、0 项 changed/unreadable：`database/manifest.json`、`storage/manifest.json`、`cloud/manifest.json`、`cloud/pause-status.json`、`storage/pause-status.json`、`database/PAUSED.md`。

## 位置与限制

目标目录的 `disk-location.json` 将 D 映射到物理盘 0、E 映射到物理盘 1；因此这是同一台主机上的第二物理盘副本。它不提供离线、异地或不同主机灾备证明。

索引文件当前位于 `D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-0607\backup-index.json`。`verification.restoreNote` 要求把两个快照根一起解到新目录，并对原绝对路径做显式映射。本次没有执行恢复，也没有证明该副本可原地恢复。

索引状态仍为 `AVAILABLE_ASSETS_VERIFIED_WITH_ONE_UNAVAILABLE_FUNCTION`：38 个可用包之外有 1 个历史环境同名函数无法下载（UpdateFailed、CodeSize 0、无 DownloadURL）。源快照仍标为在线非原子读取；本复核不证明 CloudBase 环境恢复或跨集合原子快照。

## 证据入口

- 复制脚本：`main/tmp/copy-backup-second-disk-20261003.py`
- 目标清单：`E:\CodexBackups\badminton-cloudbase\2026-10-03-second-disk\source-manifest.json`
- 完成报告与盘符映射：`E:\CodexBackups\badminton-cloudbase\2026-10-03-second-disk\verification.json`、`disk-location.json`
- 范围索引：`D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-0607\backup-index.json`
