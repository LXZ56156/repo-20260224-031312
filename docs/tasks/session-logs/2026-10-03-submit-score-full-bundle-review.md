# submitScore 完整依赖候选冷审（2026-10-03）

只读核验已封口的 `tmp/submit-score-full-candidate-20261003/`，没有修改候选、原备份或业务源码，没有部署、云调用或业务测试。候选固定在 `master` / `b571c68754e964e1a73800645f68a49d99f40f41`。检查依据包括[完整候选记录](2026-10-03-submit-score-full-bundle.md)、打包脚本、ZIP/离线回执，以及旧备份的 `files.json`；未遍历旧备份目录，也未重算整份ZIP SHA256。

## 核验结果

- **源码**：13个当前 `submitScore` 文件分别与新manifest、候选 `bundle/` 副本的字节数和SHA256相同；再从ZIP中读取这13项，逐项核对通过。源树hash为 `2609ab7e7c7af888fe5e80022bcb97037b95d2be6c6bad1fc53bf715097c2d90`。与旧备份 `files.json` 的源路径/hash比较，差异仅为 `index.js`、`lib/share-activity.js`，与manifest声明相符。
- **依赖范围**：旧 `files.json` 有6,381条，按 `node_modules/` 前缀实际计数为6,368条，另有13个函数根源文件。新 `bundle-files.json` 中6,368条依赖的相对路径、字节数和SHA256与旧manifest逐项完全相等；累计36,382,006 bytes。新bundle合计6,381项、36,443,951 bytes。旧 `files.json` 的SHA256与候选记录中的值相符。
- **ZIP目录**：中央目录共6,381项，成员名和顺序与 `bundle-files.json` 完全相同；无重复、缺项或额外成员。所有成员名均为相对POSIX路径，没有绝对路径、盘符、反斜线、空路径段、`.`/`..` 段或ZIP符号链接。按文件名检查未发现 `.env`、`.pem`、`.key` 或 credential 项。ZIP为ZIP_STORED、1980-01-01时间戳、0644普通文件模式；实际大小37,594,753 bytes。另独立读取ZIP中的13个源文件并核对SHA256通过。
- **ZIP完整性回执**：`zip-verification.json` 与manifest一致，记载6,381项逐项大小/SHA及CRC验证通过、无额外成员、重建字节相同。构建脚本确实重开ZIP、逐成员读取并核对大小/SHA、执行 `testzip()`，随后在内存重建比较字节。冷审检查了目录、13个源payload及回执/脚本，不重复计算整份ZIP hash或重新读取全部依赖payload。
- **依赖安装开关**：manifest记载 `includesNodeModules=true`、`freshInstallPerformed=false`、`installDependencyPlanned=false`；打包脚本不执行 `npm install`，直接从经核验备份复制依赖。本机CloudBase CLI 3.7.3 的只读 `tcb functions:deploy --help` 明确列出 `--install-dependency <boolean>`，接受 `true/false` 并覆盖配置。因此“CLI支持显式 false、候选计划使用false”有证据；没有执行部署，不能声称平台部署时已经实际关闭自动安装。
- **离线require**：回执记载Windows / Node v24.18.0、使用真实SDK、`index.js` 可require且导出 `main` 函数但未调用、411个解析模块限于bundle内、网络守卫记录0次请求。解析到 `wx-server-sdk 2.6.3`、`@cloudbase/node-sdk 2.9.1`、`@cloudbase/database 1.4.1`。这是本机入口装载证据；没有证明CloudBase Nodejs16.13启动，也不验证未覆盖的网络/原生调用路径。
- **公开体积上限**：完整候选记录补充的[CloudBase系统限制](https://cloud.tencent.com/document/product/876/47177)显示单函数代码体积上限50MB；ZIP及未压缩bundle均低于50,000,000 bytes。该数值比较不证明本环境上传或平台构建实际接受。

## 仍未验证

真实CloudBase事务冲突、callback重试/回滚、双手机录分、Timeout3时限余量、权限规则、生产Nodejs16.13兼容性及平台上传/部署均未验证。离线require和候选审查不替代这些验收，也不构成部署授权。
