# 2026-10-03 备份执行预检与开赛函数回退准备

预检快照形成时，近期完整业务备份尚未执行；当时只检查了全字段只读导出、文件下载和本地完整性校验的准备条件。其后的备份已部分执行并暂停，当前状态见[暂停记录](2026-10-03-backup-paused.md)。下文“尚未执行”均指本预检形成时的计划，不代表目前的运行状态；完整数据库恢复、跨集合一致快照和独立故障域副本仍未验证。

## 已有材料与缺口

- 当前唯一可定位的历史备份日期为 `2026-09-11`，根目录 `D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-09-11`。当时16集合、10665文档、2239个已发现存储对象，详见[原始记录](2026-09-11-huawei-migration-backup.md)。这是在线非原子保全，未覆盖完整云环境恢复，也未证明整桶全部无引用对象齐全。
- `tmp/audit-20261003-data/*-metadata.json` 和 `summary.json` 是字段投影/脱敏统计，不能作为恢复源。10月3日读取到13集合，不应沿用旧16集合名单或旧计数替代现场清单。
- `tmp/export-cloud-db-http-readonly.js` 使用已有微信接口认证，只调用 `databasecollectionget` / `databasequery`，不带字段投影；按 `_id` 排序，最多读取3遍并比较内容哈希。但输出目录固定为旧日期 `data/we-analysis/db-admin-20260809`，且无集合参数时的数量检查会错误退出，**不可原样运行**。应先准备独立本地副本：改为新的仓库外备份目录，修正无参数即导出现场全部集合的检查，保留不稳定结果并使完整性验收失败；不覆盖旧备份。
- 旧 `database/verify_backup.py` 固定写回9月11日目录，会重建合并文件、清单和状态。存储 `verify-storage.js` / `check-storage-references.js` / `finalize-storage.js` 同样会改写所在备份目录。复用时必须复制到新工作目录并修正根路径，不能原地“验证”历史证据。
- PATH可见 `python`；未找到 `mongod`、`mongoimport`、`mongorestore`、`mongosh` 或 `docker`。这只说明当前命令入口不可用，未安装工具，也未启动本地数据库。

## 最近完整备份的执行顺序（尚未执行）

工作目录为 `D:\projects\badminton-miniapp\main`；目标建议使用全新 `D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-<时间>`，不使用审查投影目录。

1. 保存开始时间、环境ID、现场集合清单与计数；读取所有集合全字段，保留原始响应及完整文档文件。导出副本使用现有 `scripts/fetch-we-analysis` 认证入口，不打印令牌。完成后重新读取集合清单/计数，核对ID唯一、分页连续、内容哈希及本地文件SHA-256。多遍相同只证明所读内容稳定，不证明跨集合原子快照。
2. 对现场全部集合保存 `DescribeTable`（结构/索引）及 `DescribeSafeRule`（传正确 `WxAppId`）响应；现有10月3日审查已证实这些只读入口可用。保留规则原文，不能由客户端列表过滤推断权限。
3. 读取存储清单，逐文件下载到新备份根，核对大小、可用单分片ETag/MD5与SHA-256；提取完整数据库内所有 `cloud://` 引用并逐项核对。当前CLI有分页循环，但整桶覆盖仍需现场核验，不能仅因命令成功就宣称完整。
4. 保存云函数名单、详情/配置、触发器及完整代码包；源码工作树压缩包不能替代远端包。配置可能含敏感环境变量，只保存在受控本地目录。已有函数详情中的 `CodeInfo` 只核验了入口文件，不能替代ZIP。
5. 形成 manifest：每项来源、时间、计数、字节数、hash、读取前后差异及失败项；标记 `ONLINE_NON_ATOMIC_NOT_FINAL_SNAPSHOT`。完整性不通过的项目不得写为完成。

已由本机CLI 3.7.3帮助及实现核实的命令形式如下；这些备份命令在本预检中未执行：

```powershell
$backupEnvId = (Get-Content -LiteralPath 'cloudbaserc.json' -Raw | ConvertFrom-Json).envId
tcb --env-id $backupEnvId storage list --json
tcb --env-id $backupEnvId storage download '<已核实对象key>' '<新备份目录中的绝对目标文件>' --json
tcb --env-id $backupEnvId fn list --json
tcb --env-id $backupEnvId fn detail startTournament --json
tcb --env-id $backupEnvId fn code download startTournament '<新的隔离代码目录>' --json
```

CLI `storage list` 当前实现通过 `NextMarker` 循环，已不同于旧IDE工具的单批1000项限制；但初始marker为 `/`，不能在未核验键范围与现场清单前声称整桶零遗漏。旧存储脚本仍依赖DevTools会话，当前 `loginExpired` 不能靠旧配置绕过；优先用已登录CLI。

`tcb db nosql dump <集合> --file-type json --output-dir <本地目录>` 是另一种完整字段导出入口，但它会创建云端导出任务和 `database_export-*` 对象。它不修改原业务集合，却有云端副产物；本次未执行，不能列为纯读取操作。删除这些导出对象也不是自动授权动作。

## 隔离本地恢复能证明什么

无需生产写入即可完成：复制备份到全新本地沙盒，核验hash，解析JSON/NDJSON，检查 `_id` 唯一、集合计数、赛事轮次/比分结构、账本room/round/entry关联及文件引用可解析；以本地只读适配器运行少量业务读取。旧备份已保存原始响应，时间/数值等特殊类型须先确定恢复映射，不能把普通JSON往返当作数据库类型还原。

若准备好本地Mongo工具，可在仅绑定 `127.0.0.1` 的独立实例/独立数据库中导入转换后的NDJSON，再核对类型、索引及查询结果。命令模板（未执行；不应指向云端连接串）：

```powershell
mongod --dbpath '<隔离恢复目录>/db' --bind_ip 127.0.0.1 --port 27028 --logpath '<隔离恢复目录>/mongod.log'
mongoimport --uri 'mongodb://127.0.0.1:27028/badminton_restore_20261003' --collection '<集合名>' --file '<已核验类型映射的documents.ndjson>'
```

本地导入成功不能证明CloudBase安全规则、微信身份、事务重试、存储权限、分享OpenAPI或整套线上恢复可用。`mongorestore` 不能直接恢复现有JSON文件；现有备份不是BSON dump。完整云环境演练须另有隔离云环境与数据导入范围。

## 权限与外部后果

| 动作 | 本轮状态与后续边界 |
| --- | --- |
| 本地脚本准备、离线校验、隔离目录重建 | 可在备份实施任务内直接推进；本预检未进行恢复 |
| 全字段读取、存储下载、配置与函数完整包下载 | 只读保全；本预检仅具体执行文末列出的startTournament回退包准备 |
| 停写、修改数据库/存储规则、真实集合导入或回滚 | 改变生产行为/数据，必须另有对应授权 |
| `db nosql backup restore` | 写入云端集合，即使使用新集合名也不是本地演练；未执行 |
| 新建云环境、上传真实备份到云端/第二服务商 | 新资源、费用或真实数据外传；须明确目标与授权 |
| 续费、自动续费开关、支付 | 由用户决定；10月3日既有账单证据为10月12日23:59:59到期、自动续费关闭，尚未付款 |
| 生产函数部署/回退 | 与下载独立；须明确授权，仅备份不授权更新代码或配置 |

## startTournament 完整包回退

本机CLI实现已核实：`fn code download` 调用 SCF `GetFunctionAddress` 后下载并解压完整ZIP，不写远端代码或配置。`tcb api scf GetFunctionAddress --body <FunctionName/Namespace JSON>` 可取得原ZIP地址及 `CodeSha256`；签名URL只在本地进程中消费，不写入公开记录。下载后应保存包hash、逐文件hash及远端详情。

回退需要保留代码和配置两个维度。审查时远端是Nodejs16.13、timeout=3；不能为了代码回退自动恢复已知有问题的3秒限制。若未来只回退算法/代码，应明确保留10秒或其他已批准配置。`fn code update startTournament --dir <隔离旧包目录>` 和 `config update fn startTournament --timeout <明确选择值>` 都是生产写入命令，本次不执行；重新安装未锁定依赖也不等于逐字节恢复原运行包。

实际下载已完成，目录为 `tmp/audit-2026-10-03/startTournament-rollback/`：

- `code/` 来自真实远端 `fn code download`，包含已安装依赖，共 **6388文件、37,877,167字节**；不是本地HEAD生成包。
- `manifest.json` 保存每文件SHA-256；有序文件清单SHA-256为 `65edfbb49ef7426c7901c9f753a27ccda554dcf8374f46618e976cb5c2302b35`。原ZIP没有单独保留：可选的通用API取址响应格式未解析成功，随后已通过支持的CLI完成完整ZIP下载与解压；未输出签名URL或密钥。
- `detail-before.json` / `detail-after.json` 保存完整原配置；前后 `ModTime` / `CodeSize` 相同。远端为 **Timeout=3、Nodejs16.13、256MB、index.main、InstallDependency=TRUE、环境变量0项、Active/Available**；最后修改时间为2026-09-12 22:04:30，远端CodeSize为11,220,557字节。
- 下载的 `index.js` 哈希与远端详情 `CodeInfo` 一致。`rotation.js`、`rotationDoublesEngine.js`、`rotation.templates.js`、`scheduleModes.js`、`logic.js`、`package.json` 均与当前本地一致，未发现这些未改附属源码被部署覆盖的漂移。
- 本次只执行函数详情读取、完整代码下载和本地哈希，没有部署、函数调用、配置更改或数据库/存储业务写入。数据库备份、本地数据库恢复及续费仍未执行。

部署属性边界已核对本机CLI 3.7.3实现：已有函数 `--force` 覆盖时先更新代码再更新配置；配置更新只映射提供的白名单字段，未声明 `memorySize` 不发送MemorySize，未提供/空 `envVariables` 不发送Environment，Runtime不在已有函数配置更新白名单。代码更新仍会传Handler（默认 `index.main`）和InstallDependency，配置更新也带环境CLS标识。因此部署后应核对runtime、memory、handler、环境变量及日志配置与下载前一致，不能仅看timeout=10即宣布全部配置未变。

## 后续执行状态

本预检之后，第2项备份部分执行并由用户明确暂停。已完成范围、暂停时的数据库/存储/函数计数、遗留partial文件及恢复顺序，以[备份执行暂停记录](2026-10-03-backup-paused.md)和仓库外备份根的PAUSED.md为准。本文中的旧命令与预检清单不应直接用于覆盖或重跑现有partial目录。