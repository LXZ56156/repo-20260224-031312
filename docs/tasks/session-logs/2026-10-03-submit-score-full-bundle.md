# submitScore 完整依赖候选（2026-10-03）

以下为第7/8实施前的候选快照：当时13个源码与原候选一致，并复用逐文件校验的原安装依赖。完整ZIP已重新打开逐成员核验、重复构建字节一致，真实SDK及入口在本机离线加载通过。第7/8随后更改logic/permission，最新候选见[整合验证](2026-10-03-integrated-feature-validation.md)；本文件旧哈希不能当作当前源码。未部署，线上 Nodejs16.13 和真实平台上传仍未验证。

## 交付与固定指纹

工作区 `D:\projects\badminton-miniapp\main`，branch `master`，HEAD `b571c68754e964e1a73800645f68a49d99f40f41`。既有脏树保留；本任务只新增下列脚本、候选目录与本日志，未改业务源码、root lock、current、原备份或旧候选。

- 构建脚本：`tmp/prepare-submit-score-full-candidate-20261003.cjs`。在main执行 `node tmp/prepare-submit-score-full-candidate-20261003.cjs`；固定目标 `tmp/submit-score-full-candidate-20261003/`，目标存在即拒绝，不能覆盖当前成品。后续重建须明确新目标，不能删除旧候选来绕过保护。
- 真实依赖离线检查：`tmp/verify-submit-score-full-bundle-offline-20261003.cjs`。
- 候选：`tmp/submit-score-full-candidate-20261003/`，含 `bundle/`、`package.zip`、`manifest.json`、`bundle-files.json`、`zip-verification.json`、`offline-require-verification.json`。回执均位于bundle外；ZIP只含函数13个源码及6,368个备份依赖文件。

| 对象 | 数量/大小 | SHA256 |
| --- | --- | --- |
| 当前及原候选源码树 | 13文件 | `2609ab7e7c7af888fe5e80022bcb97037b95d2be6c6bad1fc53bf715097c2d90` |
| 新bundle树 | 6,381文件 / 36,443,951 bytes | `b26eb42db2cff238d0cac02a3639862765c248e91fd5a3ad1562bfda0fac674e` |
| `package.zip` | **37,594,753 bytes**（ZIP_STORED） | `db65f962eff38598d983d512cf58575b7cc0c61cef91d343d8f4cc53d60405a4` |
| `manifest.json` | 5,505 bytes | `120c0419bbdc6379662e3223bc485e4cb1b47f1b1d556b742ba0135fd4f030e5` |
| `bundle-files.json` | 1,127,042 bytes | `7ef3aebe3d51fed8e05fcd164b845dc012466e2eac45f33abdcaa0b1bbc2dcb8` |
| `zip-verification.json` | 382 bytes | `23ce1ec4422b99d82107a48784d64a678e79bbf5136adb2c81186e90286abd86` |
| `offline-require-verification.json` | 21,261 bytes | `25cc5dc9e14959231904f7c18d1d30ea096b3681041e4b0def3cdf9892b6e4f0` |

树hash沿用原候选算法：文件名按相对POSIX路径ordinal排序，计算 `SHA256(JSON.stringify([{file,sha256},...]))`；每文件大小及SHA另列在对应回执。`package.zip` 按同一文件顺序、统一1980-01-01 00:00:00时间、普通文件0644模式，以ZIP_STORED生成，无压缩库版本漂移；再次在内存生成与成品逐字节相同。ZIP重开核验6,381个成员的大小、SHA、顺序、时间与CRC，无重复/额外成员。

## 来源与已关闭范围

依赖来源为 `D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-0238\cloud\functions\submitScore\code\node_modules`。构建前核对该备份 `files.json` 与真实完整文件集合一致、6,381文件共36,442,425 bytes逐SHA/bytes通过，再将6,368依赖文件逐项排他复制并复核。13个当前源码与旧候选manifest和旧source副本逐项相同，成品完成后再次核对当前源码和旧候选全部文件不变；备份manifest也未变。

manifest明确 `dependenciesReusedFromVerifiedBackup=true`、`includesNodeModules=true`、`freshInstallPerformed=false`、`installDependencyPlanned=false`。没有执行npm install，没有创建lock。相对原备份仍只有 `index.js` 与 `lib/share-activity.js` 两个源码差异；详见[原候选](2026-10-03-submit-score-deployment-candidate.md)。

入口、package.json与config.json直接处于ZIP根，node_modules也处于ZIP根，未带临时工具/回执或私有配置。路径清单检查未发现 `.env`、`.pem`、`.key`、credential 文件；仅两个 `secretManager` 为SDK实现文件。依赖不裁剪，保留备份原有已安装文件与版本。

## 离线启动与边界

使用真实bundle依赖，通过 `createRequire(bundle/index.js)` 及各父SDK的实际模块解析，确认：

- `wx-server-sdk 2.6.3` → `@cloudbase/node-sdk 2.9.1` → `@cloudbase/database 1.4.1`，路径分别为bundle内的 `node_modules/wx-server-sdk/index.js`、`node_modules/@cloudbase/node-sdk/lib/index.js`、`node_modules/@cloudbase/database/dist/commonjs/index.js`。
- 同时解析 `tcb-admin-node 1.23.0`；411个解析模块文件全部限于bundle，清单写入离线回执，不从main/node_modules或原备份借用依赖。
- require前封禁 `http/https.request/get`、`net/tls`连接、`dns.lookup/resolve*`及fetch。SDK及 `index.js` 实际加载完成，`exports.main` 是function，`requestsAttempted=0`；未调用main，未执行云请求或业务写入。

实际运行环境 **Windows / Node v24.18.0**，Python3.13.12用于确定性ZIP生成与重开校验。`@cloudbase/node-sdk`、`tcb-admin-node` 的声明 `engines.node >=8.6.0` 包含16，但声明不能证明CloudBase Nodejs16.13启动或事务兼容；另两项无engines声明。复用线上依赖不等于依赖升级、清除漏洞或新runtime验收。

只读执行 `tcb functions:deploy --help`，CloudBase CLI3.7.3明确列出 `--install-dependency <boolean>`，并说明true/false覆盖配置。因此已有关闭云端自动安装的**CLI参数能力**证据；没有执行deploy，没有验证云上传、平台是否接受37,594,753-byte ZIP、安装策略的现场效果或部署配置合并行为，也未确认平台包大小限制。本日志不提供可直接执行的部署命令。

本轮只验证源码一致、完整依赖逐文件hash、ZIP完整与可重复字节、真实SDK解析和本机入口加载，没有重新运行全量业务测试。真实CloudBase事务callback重试/回滚、双手机录分、Timeout3余量、规则、平台包接受及生产Node16仍待隔离环境及逐项授权。付款、部署、真实数据写入、commit/push/发布和cleanup均未执行。

## 主控后续只读核对公开体积限制

主控随后读取[腾讯云CloudBase系统限制](https://cloud.tencent.com/document/product/876/47177)（页面最近更新2024-10-14；本轮在线获取）：云函数表列单函数代码体积（CLI、SDK、控制台上传方式）50MB。当前ZIP37,594,753bytes及未压缩文件36,443,951bytes均低于50,000,000bytes。此项只证明与公开文档上限数值比较，不证明本环境实际上传/创建/代码校验接受；原段“未确认平台包大小限制”为构建时未查询的状态，现公开上限已核对，现场包接受仍未执行。没有上传COS、请求部署或触发构建。

[Luna独立范围复核](2026-10-03-submit-score-full-bundle-review.md)已封口：13源当前/bundle/ZIP一致，6368依赖path/bytes/SHA与备份一致，ZIP中央目录6381项精确匹配且无额外/重复/危险路径。该冷审不重复整ZIP hash，保留本机加载与真实云验收的区别。
