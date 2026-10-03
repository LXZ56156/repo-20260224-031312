# 0607 备份大整数/Decimal 精确范围检查（2026-10-03）

## 范围与校验

只读取 0607 备份的 `database/manifest.json` 与清单为每集合选中的 raw pass 页面。每集合仅读 `selectedPass=2`，不读取或计入另一遍；Python 以原生 `int` 精确解析 JSON 整数字面量，以 `Decimal` 解析十进制/指数数字，并识别 Extended JSON `$numberLong`、`$numberDecimal`、`$numberDouble` 及非有限值。没有输出文档 ID、数值、动态字段名、集合真实名称、身份或业务内容。

manifest 的选中 pass 合计 **13 集合、13,925 文档、259 页**，与扫描到的页数和文档数一致。依照 `scripts/backup-cloud-database.js` 的 `rawDocumentStringsSha256` 合同，对每集合所选页内的原始 JSON 文档字符串按 `_id` 排序后计算 pass 级聚合 SHA-256，**13/13 与 manifest 声明值匹配**。`database/manifest.json` 没有逐页期望 digest，因此只确认选中页集合的完整计数与 pass 级聚合 hash；不声称单页 hash 逐一匹配。哈希比对仅验证这些所选 raw 字符串与该 manifest 的一致性。

## 匿名计数

阈值为超出 JavaScript safe integer 区间，即整数 `> 9007199254740991` 或 `< -9007199254740991`。各项为出现次数；文档数只表示该匿名集合的文档总数。

| 匿名集合 | 选中页 | 文档 | 超安全 JSON 整数 | 超安全 `$numberLong` | JSON decimal/exponent | `$numberDecimal` | 非有限/转换溢出 |
|---|---:|---:|---:|---:|---:|---:|---:|
| collection-01 | 86 | 8599 | 0 | 0 | 0 | 0 | 0 |
| collection-02 | 1 | 20 | 0 | 0 | 0 | 0 | 0 |
| collection-03 | 1 | 7 | 0 | 0 | 0 | 0 | 0 |
| collection-04 | 1 | 27 | 0 | 0 | 0 | 0 | 0 |
| collection-05 | 139 | 2764 | 0 | 0 | 0 | 0 | 0 |
| collection-06 | 21 | 2093 | 0 | 0 | 0 | 0 | 0 |
| collection-07 | 1 | 12 | 0 | 0 | 0 | 0 | 0 |
| collection-08 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| collection-09 | 2 | 129 | 0 | 0 | 0 | 0 | 0 |
| collection-10 | 2 | 128 | 0 | 0 | 0 | 0 | 0 |
| collection-11 | 2 | 129 | 0 | 0 | 0 | 0 | 0 |
| collection-12 | 1 | 15 | 0 | 0 | 0 | 0 | 0 |
| collection-13 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| **合计** | **259** | **13925** | **0** | **0** | **0** | **0** | **0** |

`JSON decimal/exponent` 与 `$numberDecimal` 是潜在 decimal 表示计数，不能单独证明实际 BSON Decimal128 类型。当前快照未发现超安全整数，不代表 SDK 的 int64 默认 Number codec 没有精度风险，也不证明未来数据或其他 SDK/API 路径安全；已有真实 codec 验证风险仍需按其独立结论处理。

匿名逐集合收据及扫描脚本保存在 ignored tmp：`tmp/backup-large-int-scope-20261003/receipt.json`、`tmp/backup-large-int-scope-20261003/scan.py`。未启动 Mongo、读取生产、修改备份或源码，未运行测试。
