# 手机远程验收二维码交付链路（2026-07-17）

## Baseline

- 权威工作区：`D:\projects(WIN)\badminton-miniapp`
- 分支/起点：`codex/ui-optimization-v2@e2670887ef1972440d9dbea268d174e5e7a02b20`
- 起点工作区：clean
- 线上正式版：`master = origin/master = 5813ffc`
- 开始时 preview mirror manifest 已显式 invalidated，未作为成功证据。

本任务未修改小程序页面、文案、导航、业务流程、云函数或真实云数据，也未执行 checkout/reset/clean。

## Local Delivery

新增 `npm run mp:preview:deliver`：

1. 获取覆盖 sync、preview、record 和 latest promotion 的独占锁，并在同步前捕获严格 Git branch/HEAD/dirty 基线。
2. 从 Windows 权威源码事务构建 preview mirror staging，沿用 manifest tree contract 的根文件、目录和排除规则，拒绝 symlink；非空旧 mirror 必须有可验证的 ownership marker。
3. 比较 source/staging SHA-1 tree signature，写新 manifest，验证后以 backup/rollback 替换旧 mirror。
4. preview 前复核 manifest 路径、mirror/source signature、小程序布局、私密配置存在性、workflow record 与二维码目录可写性。
5. 新命令只调用 `ci.preview`；`ci.upload` 保持在独立 upload 分支。
6. preview 返回后再次复核 manifest/signature 及 Git branch、HEAD、dirty、dirtyFiles；漂移即拒绝交付。
7. staging 与最终复制后的二维码均须为普通、非空、完整、至少 `128x128` 的 JPEG，并校验尺寸、字节数与 SHA-256 一致。
8. 成功时写带 UTC 毫秒和短 commit 的历史 JPG/JSON，事务更新固定 latest，再事务写 `miniapp-ci` 的 `preview_delivery_success` record。
9. 远端失败、二维码缺失/损坏、漂移、promotion 或 record 失败均不替换旧 latest；record 失败会回滚并删除未完成历史产物。

固定 Git-ignored 目录为 `D:\projects(WIN)\badminton-miniapp\preview-qrcodes`，手机固定入口为 `latest-preview-qrcode.jpg` 和 `latest-preview-qrcode.json`。元数据 allowlist 包含 branch、commit、dirty、生成时间、version/robot、绝对路径、尺寸/字节、SHA-256、preview-only/非正式版/可能过期提示。workflow 与运行时错误脱敏覆盖 secret、token、password、private-key、openid 和 unionid；远端返回对象不进入交付元数据。

## Coverage and Evidence

自动化覆盖成功 preview mock、远端失败、二维码缺失/空/非 JPEG/截断/尺寸过小、运行中漂移、record 失败、stale manifest、source/mirror 漂移、镜像事务与 ownership 保护、并发锁、布局根目录一致性、旧 latest 保护、脱敏、Git ignore，以及 delivery 分支只含 `ci.preview`。

- 聚焦测试：通过。
- `npm run verify:light`：115 tests，109 pass，6 个 Windows legacy WSL runtime static-check skip，0 fail。
- `npm run verify:full`：1345 tests，1338 pass，7 skip，0 fail；deprecated API、cloud common、lint 与 `git diff --check` 均通过（lint 仅 64 个既有 warning）。

## Real Preview Evidence Update

本地实现完成后，仓库 workflow evidence 已记录两次真实 `mp:preview:deliver` 成功：

- 2026-07-17 12:27（Asia/Shanghai）：生成首份 `preview_delivery_success` 记录和历史/latest 二维码。
- 2026-07-18 13:40（Asia/Shanghai）：再次交付成功并更新固定 latest；二维码为 `470x470` JPEG，SHA-256 为 `0fc18ce9b3c6b580b6a20a840e59443670fc0a2b8c7e77e24862a322ed4948e3`。

固定手机入口现为 `D:\projects(WIN)\badminton-miniapp\preview-qrcodes\latest-preview-qrcode.jpg`，对应元数据为同目录 `latest-preview-qrcode.json`；完整成功证据在 `docs/records/miniapp-ci.jsonl` 和 `miniapp-ci-latest.json`。两次记录均来自 `codex/ui-optimization-v2@e267088` 的 dirty 工作区，打包内容包含尚未上线的 schedule 中央 `VS`/比分布局、P03 打水 UI、P05 clone 修复，以及默认关闭且未部署启用的 P04 事件管道基础设施。

这些结果只证明 preview-only 二维码生成和本地交付链路成功，不代表手机端业务验收、Git push、小程序 upload、正式发布、云函数部署或线上版本变化。后续重新生成 preview、执行 upload 或部署仍须在当前任务中取得明确授权。

专属文档：`docs/tools/weapp-preview-qrcode-delivery.md`。
