# 第9项 SDK codec：真实实现的本地离线证据

实际 `wx-server-sdk 2.6.3 / @cloudbase/database 1.4.1 / bson 4.7.2` codec 已分别在 **Node v16.13.0 和 v24.18.0** 运行；输入、输出和加载的源码hash跨运行时一致。有效Date和安全整数的本地结果满足下面列出的范围，**超安全int64不能按SDK默认读取保证无损**。本回执不代表云端wire、查询比较/排序/索引或事务引擎已验证。

本轮只新增 `tmp/sdk-codec-20261003/` 工具/receipts 和本日志。依赖使用已有逐文件验证包 `tmp/submit-score-full-candidate-20261003-coadmin-retry/bundle/node_modules`；未安装依赖、未改生产/产品源码/共享lib/其他日志、未调用云端。

## 实际入口与隔离

读取实际源码确认链路后，探针直接调用已安装模块的函数：

- 写入链 `serializer/datatype.serialize` → `utils/utils.stringifyByEJSON`，后者实际调用 `bson.EJSON.stringify(..., { relaxed: false })`。`document.create/set` 的实际源码使用这条链。
- 读回链 `utils/utils.parseByEJSON` → `bson.EJSON.parse` 默认 `relaxed:true` → `Util.formatResDocumentData`。`document.get/query.get` 实际源码直接采用同一默认EJSON解析和格式化；wx上层get包装返回其data。
- 查询链 `QuerySerializer.encodeEJSON` 和真实 `Command.lt/eq/gt/or/and`；对应 `where` 的实际编码入口。Date游标使用与找回分页相同的时间降序、ID升序续页条件。

没有自建codec、没有用普通 `JSON.stringify` 替代编码；工具中的 `JSON.stringify` 只写元数据回执。没有实例化云请求类或调用数据库API。receipt保留输入、实际EJSON字符串、读回类型/值、精确整数比较和源码hash。

主SDK实际加载的 **74个依赖文件** 均重新逐SHA-256核对既有 `bundle-files.json`，两个Node加载列表和hash一致；receipt记录Node可执行文件和探针本身hash。SDK4对照只使用已有 `tmp/sdk4-audit/node_modules`，版本为wx4.0.2/database1.4.3/bson4.7.2，记录实际源码hash，未把它标为已匹配主包manifest。

加载codec前阻断进程内HTTP/HTTPS、TCP连接/监听、TLS、HTTP2、UDP、DNS含Resolver、fetch、WebSocket和subprocess入口。HTTPS/TCP/DNS三项失败自检命中拦截，**codec期间网络或subprocess尝试为0**。未改系统网络/防火墙；这是当前离线进程入口隔离，不是宣称操作系统级断网。

## 观察到的行为

有效Date测试毫秒值为 `0`、`1`、`-1`、`1790985600123`、`-2208988800123` 和JS Date有效上下限 `±8640000000000000`：7例均严格编码为 `$date/$numberLong` 并读回同毫秒的Date，含epoch、单毫秒、负时间和远期边界。

普通数值/安全整数测试 `0`、`-0`、`42`、`-42`、`1.25`、`0.1`、int32最大值、int32最大值+1、JS安全整数正负上限。数值保持，**`-0` 符号丢失为 `0`**；因此不把全部样本标为Object.is等同。

实际SDK默认读取如下canonical int64 EJSON样本为JS Number：

| 输入十进制int64 | 读回Number的精确二进制整数值 | 精度损失 |
| --- | --- | --- |
| `9007199254740993` | `9007199254740992` | 是 |
| `-9007199254740993` | `-9007199254740992` | 是 |
| `9223372036854775807` | `9223372036854775808` | 是 |
| `-9223372036854775807` | `-9223372036854775808` | 是 |
| `-9223372036854775808` | `-9223372036854775808` | 此样本恰好可表示，仍不是safe integer |

其中最大int64对应的Number常规显示为 `9223372036854776000`，receipt同时用 `BigInt(decodedNumber)` 记录其真实整数值，避免把格式化输出误当精确十进制。额外验证从这些十进制构造JS Number再写入：4例在进入codec前已损失，不能由序列化恢复。

严格BSON控制 `EJSON.parse(..., {relaxed:false})` 能得到保持原十进制的BSON.Long；**实际SDK默认读链没有启用这个选项**。同时，直接EJSON写Long能产生正确 `$numberLong`，但完整SDK写链的 `datatype.serialize` 把Long克隆成 `low/high/unsigned` 普通对象，实际输出不是int64；因此不能把“直接BSON可无损”推导为“SDK写入Long可无损”。直接BigInt输入被实际EJSON写链以 `TypeError: Do not know how to serialize a BigInt` 拒绝。

无效 `new Date(NaN)` 未抛错：实际编码为 `$date:{$numberLong:"NaN"}`，默认解码后变成epoch Date。此为观察到的静默转换，不能当作有效日期支持或服务器会接受该输入的证据。探针初始按“无效Date应拒绝”和“-0应等同”断言失败后改为明确核验并报告真实转换，没有隐藏这两个限制。

查询Date比较覆盖 `0`、`1`、`-1`、`1790985600123`。真实 `or/and/lt/eq/gt` 续页编码保留Date毫秒，日期条件为 `$date:{$numberLong:...}`；对照数值条件只有 `$numberLong`，本地codec区分Date与Number。**这不证明服务端类型比较、边界续页、排序或索引语义。**

SDK4现有最小对照在上述7组结果（Date、普通数字、int64读、已损失Number写、Long写、无效/不支持输入、查询条件）与主SDK逐结构完全相同；没有扩展到SDK4完整业务兼容性或升级授权。

## 命令与交付物

- `tmp/node16-local-20261003/node.exe tmp/sdk-codec-20261003/verify-codec.cjs`：通过。
- `node tmp/sdk-codec-20261003/verify-codec.cjs`（v24.18.0）：通过。
- `node tmp/sdk-codec-20261003/compare-receipts.cjs`：通过，确认两运行时行为和已加载源码hash一致。

交付目录包含 `verify-codec.cjs`、`compare-receipts.cjs`、`node16.receipt.json`、`node24.receipt.json`、`comparison.receipt.json`。所有passed仅指探针针对实际本地行为的断言通过，不指所有输入无损、不指云测试通过。实际云wire/后端返回int64形式、Date与数值比较/排序/索引、运行时/身份/事务仍未验证。
