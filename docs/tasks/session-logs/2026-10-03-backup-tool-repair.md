# 2026-10-03 数据库备份工具修复与离线验证

本阶段完成暂停记录中的数据库工具 4 项 lint 修复，以及原始字符串/解析内容/便利用导出文件的完整性检查。仅修改本地工具、直接测试和本记录；未启动远端导出，未修改既有 partial、current、生产数据或云函数。

## 基线与文件归属

- 实际 cwd：`D:\projects\badminton-miniapp\main`；branch：`master`；HEAD：`b571c68754e964e1a73800645f68a49d99f40f41`。
- 已读取 `AGENTS.md`、`docs/tasks/current.md`、[备份暂停记录](2026-10-03-backup-paused.md)，已有脏树原样保留。
- 本阶段文件：`scripts/backup-cloud-database.js`、`tests/backup-cloud-database.test.js`、本记录。

## 修复与合同

- `fetch` / `AbortSignal` 改为 `globalThis` 引用；两处无条件循环改为由实际分页结果驱动的 `hasMore` 循环。分页查询、页大小、最多三遍和只读 endpoint allowlist 保持现合同。
- 备份仍使用独立新目录；`fs.mkdir` 拒绝所有已存在目录，包括空目录。拒绝发生在 `runBackup` 的请求及文件写入前。CLI 获取 access token 先于此检查，但不写业务数据。
- API 响应原文件和 `data` 内的原始 JSON 字符串全部保留。原始字符串 hash 与 parsed canonical hash 都必须两遍匹配才能将集合标为 complete。parsed JSON/NDJSON 是便利用副本，可能丢失 unsafe integer 精度，**恢复必须使用 selected pass 的 raw API data strings**。
- 修正离线 `verifyRawPasses` 将重算 hash 直接覆盖旧 hash 的缺口：先比对原始字符串的已保存 hash、parsed canonical 内容 hash、分页/文档数量、ID 唯一性及导出文件大小/SHA-256，再保存验证结果。既有 manifest 尚无 raw hash 时仍要求 parsed hash 一致。失败时不写回 manifest。
- 独立验证函数会更新验证目标的 manifest；为保留旧 partial，不应对 `2026-10-03-0238` 调用它。旧证据需要另存只读核验结果，或核验复制件。

## 验证

- `node --test tests/backup-cloud-database.test.js`：7 通过，0 失败，0 跳过。
- 聚焦 ESLint：`$env:ESLINT_USE_FLAT_CONFIG = 'true'; node node_modules/eslint/bin/eslint.js scripts/backup-cloud-database.js tests/backup-cloud-database.test.js`，0 错误/0 警告。
- `git diff --check`：通过（工具/测试本次为未跟踪文件，Git 不会将其内容纳入 tracked diff；直接 lint 已覆盖）。
- 直接测试覆盖：完整页与尾页、保存 raw、已存在非空/空目录拒绝且请求/证据不变、重复 ID 拒绝、三遍不稳定拒绝 complete、unsafe integer 字面值 `9007199254740992` 与 `9007199254740993` parsed hash 相同但 raw hash 不同、raw/parsed 篡改拒绝、便利用文件损坏拒绝。
- 未运行业务全量测试、未执行远端导出、未完成真实备份/恢复。这些工作由主控按总计划继续。

## 安全续做入口

主控已选定本轮统一新备份根 `2026-10-03-0607`，数据库目标子目录目前不存在。执行前确保新父目录存在且数据库输出目录仍不存在，禁止使用旧 partial 路径。本阶段未执行此命令。

```powershell
node scripts/backup-cloud-database.js --output 'D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-0607\database'
```

若将数据库放入本轮新的统一备份根 `database` 子目录，先仅创建新的父目录，再向不存在的 `database` 子目录运行脚本。完成后可对新目录调用 `verifyRawPasses`。备份仍是在线非原子快照；两遍相等不能证明跨集合事务一致性。现场 14,025 与审查投影 13,925 的集合级差额原因不在本工具阶段判断范围内，须在主控续做前先完成对账。
