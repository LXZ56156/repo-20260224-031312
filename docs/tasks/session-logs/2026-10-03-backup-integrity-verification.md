# 2026-10-03 备份完整性本地复核

本记录只依据本机已保存的备份清单和文件进行只读重读，不调用远端接口，不写业务数据；没有修改 `current.md`、原始 partial、manifest 或源业务文件。

## 数据库与 Storage

- Storage：manifest 标记 `COMPLETE_VERIFIED`；记录 2735 条，实际重读 2735 个对象，共 28481879 bytes。字节差异 0、MD5差异 0、SHA-256差异 0、重复 fileId 0。逐对象结果见备份根 `verification/storage-reread-and-references.json`，仅编号及hash/大小，不含对象ID或路径。
- 数据库选定 raw pass：manifest `rawPassesVerified=true`；只扫描 selectedPass=2 一遍，共 259 页、13925 条文档，集合/页/文档数量不匹配 0，解析错误 0。259页来自各集合实际分页：`client_request_logs` 86页（pageSize=100）、`tournaments` 139页（pageSize=20）、其余11集合合计34页；这与旧投影采用不同分页大小，不是重复扫描。递归发现 cloud:// 引用 13072 次；精确匹配 13072 次，去除尾随标点后匹配 0 次，未匹配 0 次（不同引用 0 个，留存 SHA-256 指纹而不留明文）。
- 匹配到 2107 个 Storage 对象；清单中未被选定数据库 raw pass 引用的对象 628 个。

## 云函数包与清单

- 新完整 inventory 为 39 项；0238 成功包 20，0607 成功包 18。按不同函数名去重后实际核验 38 包（重复行 0），重读 238127 个文件、1703721906 bytes；SHA-256/大小差异分别 0/0，读错误 0，包级不完整 0。每个包的文件数、字节和校验计数见备份根 `verification/cloud-package-integrity.json`。
- 本地受管目录共 23 个；38个可用包覆盖受管 23 个、历史 15 个。inventory 另有 1 项不能下载：名称与 environmentId 相同=true，远端状态 `UpdateFailed`、CodeSize=0，可用 DownloadURL=false，落地代码文件=0。该环境同名项作为不可取缺口单列，不计入可用包，不把结果表述为 39/39 完整。
- 新备份 before/after 完整 inventory 的名称新增/移除数为 0/0；共有 39 项。对比 runtime/createTime/modifyTime/status 的变化条数为 {"runtime":0,"createTime":0,"modifyTime":0,"status":0}。因此两份完整 inventory 的这些字段可作时间点对照；CodeSize 不在该 inventory schema 中，不能据此做 before/after 代码大小比较。

## 旧 partial 保全

- 依据恢复前保存的 6 项 SHA-256/大小基线，在旧 partial 上只读复核：一致 6 项，变化或不可读 0 项。逐项结果见备份根 `verification/partial-preservation-after.json`，仅序号与校验值。

## 可重复核验

- 使用本地 Node.js 执行仓库 `tmp/verify-backup-integrity-0607.cjs`；参数为新备份根、旧备份根和仓库根。脚本逐条重读 Storage 对象及两批成功函数包文件，按数据库 manifest 的 selectedPass 扫描所有 raw page 并递归提取 cloud:// URI，然后比对 Storage 清单中的完整 fileId；只会写入上面列出的三份 verification JSON 和本日志。
- Storage 和云包一致只证明这些本地落盘文件与对应 manifest/files.json 中的期望大小/hash一致；不证明远端快照原子性或 CloudBase 在线可恢复。数据库此前标记 `ONLINE_NON_ATOMIC_NOT_FINAL_SNAPSHOT`，该限制仍成立。

耗时：260.6 秒。
