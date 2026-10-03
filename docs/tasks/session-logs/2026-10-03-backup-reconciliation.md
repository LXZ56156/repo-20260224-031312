# 2026-10-03 备份清单差额对账

## 结论

对旧 partial 的现存结构化证据逐集合重算后，线上投影和备份 inventory 均为 **13,925**，每集合差额均为 0。暂停记录所写的 **14,025** 与任何已保存的 inventory 响应、manifest 清单或投影计数不符；因此“相差100”是暂停文档中的汇总错误，现有材料无法追溯错误数字的计算来源。

没有证据表明少读了100条，也没有证据表明两次 inventory 之间发生了净增100条。`databasecollectionget` 的20份已保存 inventory 响应均列出相同的13个集合及计数；审查投影读取前后清单也相同。投影清单时间为 `2026-10-02T17:41:39Z`，旧备份开始于 `2026-10-02T18:45:30Z`、暂停于 `2026-10-02T18:49:17Z`，相隔约64分钟且均为在线非原子读取，故这些相同计数不能证明逐文档集合是同一快照；但非原子性不能解释一个在源 inventory 中不存在的100条计数差。

此结论只纠正计数口径，不改变旧备份的部分状态：旧 partial 只有4个集合（8,653条）完成两遍解析内容 hash 与计数核对；`tournaments` 第一遍读完、第二遍中断；其余8个集合未导出。inventory 是集合计数清单，不能替代完整文档导出或恢复验证。

## 逐集合对账

“审查清单前→后”来自 `tmp/audit-20261003-data/inventory.json` 与 `inventory-after.json`；“旧 partial 数据库清单”来自备份根的 `database/inventory-before.json`；“旧 partial 云清单”来自 `cloud/database/inventory.json`。投影页数和唯一ID数来自 `db-fetch-manifest.json`。差额按“旧 partial 数据库清单 − 投影读取数”计算。

| 集合 | 投影读取数（页数；唯一ID） | 审查清单前→后 | 旧 partial 数据库清单 | 旧 partial 云清单 | 差额 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `client_request_logs` | 8,599（86；8,599） | 8,599 → 8,599 | 8,599 | 8,599 | 0 |
| `delete_tournament_requests` | 20（1；20） | 20 → 20 | 20 | 20 | 0 |
| `feedbacks` | 7（1；7） | 7 → 7 | 7 | 7 | 0 |
| `score_locks` | 27（1；27） | 27 → 27 | 27 | 27 | 0 |
| `tournaments` | 2,764（28；2,764） | 2,764 → 2,764 | 2,764 | 2,764 | 0 |
| `user_profiles` | 2,093（21；2,093） | 2,093 → 2,093 | 2,093 | 2,093 | 0 |
| `waterEntries` | 12（1；12） | 12 → 12 | 12 | 12 | 0 |
| `waterMigrations` | 1（1；1） | 1 → 1 | 1 | 1 | 0 |
| `waterRoomMembers` | 129（2；129） | 129 → 129 | 129 | 129 | 0 |
| `waterRooms` | 128（2；128） | 128 → 128 | 128 | 128 | 0 |
| `waterRounds` | 129（2；129） | 129 → 129 | 129 | 129 | 0 |
| `waterSessions` | 15（1；15） | 15 → 15 | 15 | 15 | 0 |
| `water_feature_flags` | 1（1；1） | 1 → 1 | 1 | 1 | 0 |
| **合计** | **13,925（148；13,925）** | **13,925 → 13,925** | **13,925** | **13,925** | **0** |

## 分页与 partial 读取证据

- 投影脚本 `tmp/audit-20261003-db-metadata.cjs` 对每个集合按 `_id` 升序执行 `.skip(offset).limit(100)`，每次按实际返回条数增加 offset，并在返回不足100条时结束。`db-fetch-manifest.json` 中13个集合均满足 `count = listed = unique`；读取前、后的 inventory 计数相同。记录页数合计148页，与13,925条读取数相符。
- 备份工具 `scripts/backup-cloud-database.js` 的 inventory 调用对集合列表使用 `limit:100`。列表只有13个集合，故每次响应均一次返回全表；该参数不是文档导出页大小。旧 partial 的 `raw-inventories/001` 至 `raw-inventories/020` 各有一份响应，每份都是13个集合。按集合名排序后仅保留 `name=count` 并计算 SHA-256，20份响应有同一个签名：`45bda3b4fc8367cd039bfe6e5a1788fcb10014421da2ff62cfabf297d759eb23`。
- 备份文档读取也按稳定 `_id` 顺序分页并把 offset 增加实际返回条数；普通集合每页100条，`tournaments` 每页20条。`database/manifest.json` 记载4个完成集合两遍的数量、ID唯一性、前后清单计数和解析内容 hash 一致；其数量分别为8,599、20、7、27。`tournaments` 第一遍为2,764条、139页，数量与前后 inventory 相符；第二遍未完成。其余8个集合没有导出页可核对。

所以，在已完成的投影读取中没有观察到100条分页遗漏；旧备份中也没有任何结构化计数报告14,025。不过，旧 partial 本身仍然不完整，不能据此宣称全部13,925条文档都已下载、核验或可恢复。

## 可重复核验

在 `D:\projects\badminton-miniapp\main` 的 PowerShell 中，下面的只读步骤仅输出各 inventory 的集合名和计数：

```powershell
$sources = [ordered]@{
  projectionBefore = 'tmp/audit-20261003-data/inventory.json'
  projectionAfter  = 'tmp/audit-20261003-data/inventory-after.json'
  backupDatabase   = 'D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-0238\database\inventory-before.json'
  backupCloud      = 'D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-0238\cloud\database\inventory.json'
}
$rows = foreach ($source in $sources.GetEnumerator()) {
  $inventory = Get-Content -Raw -LiteralPath $source.Value | ConvertFrom-Json
  foreach ($collection in $inventory.collections) {
    [pscustomobject]@{
      Source = $source.Key
      Collection = $collection.name
      Count = [long]$collection.count
    }
  }
}
$rows | Sort-Object Collection, Source | Format-Table -AutoSize

$fetch = Get-Content -Raw -LiteralPath 'tmp/audit-20261003-data/db-fetch-manifest.json' | ConvertFrom-Json
$fetch.results | Select-Object collection, count, listed, pages, unique | Format-Table -AutoSize
```

复核旧备份范围时，另读 `database/manifest.json` 和 `database/PAUSED.md`。不要将旧 partial 的 inventory 清单计数误作已成功导出的文档数；原始页与旧暂停文件保持原样。

## 证据入口

- `docs/reports/2026-10-03-usage-analytics.md`：说明投影时间、13集合计数与非原子口径。
- `tmp/audit-20261003-data/db-fetch-manifest.json`、`inventory.json`、`inventory-after.json`：投影计数、页数、唯一性及读取前后清单。
- `tmp/audit-20261003-db-metadata.cjs`：投影分页实现。
- `D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-0238\cloud\database\inventory.json`、`database\inventory-before.json`、`database\raw-inventories\001` 至 `020`：旧 partial 的库存清单响应。
- `D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-0238\database\manifest.json`：实际文档导出各 pass 的状态与计数。
- `docs/tasks/session-logs/2026-10-03-backup-paused.md` 与旧 partial 的 `PAUSED.md`：记录过14,025的文字来源；与上述结构化证据冲突，本次不改写旧暂停记录。

