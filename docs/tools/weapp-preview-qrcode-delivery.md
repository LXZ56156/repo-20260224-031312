# 手机远程验收二维码交付

## Purpose and Boundary

`npm run mp:preview:deliver` 是唯一的一键二维码交付入口。它把当前 Windows 权威源码同步到 preview mirror，使用 `miniprogram-ci` 生成微信小程序 **preview-only** 二维码，并把经校验的历史图片、固定 latest 和脱敏元数据保存到项目内专用目录。

此命令会产生真实微信小程序 preview 外部行为。只有用户在当前任务中明确授权后才能运行。它不会调用 `ci.upload`，不代表 Git push、小程序 upload、正式发布、云函数部署或线上版本变更。

每次请求授权前必须提醒实际打包范围。当前 `codex/ui-optimization-v2` 的 preview 会包含尚未上线的 schedule 中央 `VS`/比分布局和 P03 打水 UI，也包含 P05 clone 修复以及默认关闭、未部署启用的 P04 事件管道基础设施。线上正式版仍是 `master = origin/master = 5813ffc`。

2026-07-29 起，该分支及既有二维码全部是历史扩展包证据，不能代表新的“master + 仅比分位置”基线。新隔离分支在获得单次 preview 明确授权前不得复用旧 latest、不得生成新 QR；授权后也必须重新记录实际打包 diff。

## Fixed Delivery Directory

专用绝对目录固定为：

```text
D:\projects(WIN)\badminton-miniapp\preview-qrcodes
```

目录内容由 `.gitignore` 排除，不进入 Git。成功交付会写入：

- `preview-qrcode-<UTC时间>-<短commit>.jpg`：本次历史二维码；同一毫秒重复运行会追加序号，绝不覆盖历史文件。
- `preview-qrcode-<UTC时间>-<短commit>.json`：与历史二维码同名的脱敏来源元数据。
- `latest-preview-qrcode.jpg`：手机端长期固定打开的最新成功二维码。
- `latest-preview-qrcode.json`：固定 latest 对应的来源、校验和与时效说明。

微信 preview 二维码可能过期或失效。latest 表示最近一次完整成功交付，不表示线上正式版；失效后需要重新取得授权并生成。

## Command

```powershell
npm run mp:preview:deliver
```

可沿用现有本地私密配置：`WX_APPID`、`WX_PRIVATE_KEY_PATH`、`MP_VERSION`、`MP_ROBOT` 和 `MP_DESC`。默认版本为 `package.json version + short HEAD`，默认 robot 为 `1`。私钥路径、secret、token、openid 与 unionid 不写入二维码元数据或公开 workflow evidence，也不会在运行时错误中原样输出。

不要用 `npm run mp:preview` 代替本入口交付给手机；旧命令仍写临时二维码，不提供历史/latest 事务保护。不要运行 `npm run mp:upload`，除非用户另行明确授权 upload。

## Fail-Closed Flow

命令按以下顺序执行：

1. 获取全流程独占锁并捕获严格 Git branch/HEAD/dirty 基线；并发交付、Git 命令失败或中途源码状态变化均 fail-closed。
2. 将 `D:\projects(WIN)\badminton-miniapp` 的受监控小程序内容事务同步到固定 sibling `D:\projects(WIN)\badminton-miniapp-preview`；非空旧 mirror 必须带可验证的 ownership marker。先构建 staging、计算源与 staging 的 SHA-1 tree signature，再原子替换旧 mirror。stale manifest 不能作为成功证据。
3. 复核 manifest 的权威源码路径、mirror 路径、preview 内容签名和权威源码内容签名。
4. 按 `project.config.json` 的实际根目录规则校验小程序布局、AppID、私钥存在性，并在远端动作前预检 `docs/records/` 与二维码目录可写性。
5. 仅调用 `miniprogram-ci` 的 `ci.preview`，先把二维码写入唯一 staging 文件。
6. preview 返回后再次复核 manifest、两侧内容签名和 Git branch/HEAD/dirty 状态；运行期间发生漂移就拒绝交付。
7. 校验 staging 和最终复制文件均为普通、非空、结构完整且不小于 `128x128` 的 JPEG，并确保尺寸、字节数和 SHA-256 一致。
8. 创建历史图片/JSON，事务更新固定 latest 图片/JSON，再事务写 `miniapp-ci` workflow record。record 写入失败会回滚 latest 并移除本次未完成的历史文件。

远端 preview 失败、二维码缺失/损坏、stale 或漂移、证据写入失败都不会覆盖上一份成功 latest。若微信侧 preview 已成功但本地证据写入失败，命令以专用 `remote action succeeded, evidence write failed` 错误退出；不要盲目重试，先检查本地证据存储。

## Evidence Contract

二维码 JSON 至少包含：

- `generatedAt`
- `git.branch`、`git.commit`、`git.shortCommit`、`git.dirty`
- `version`、`robot`
- 历史/latest 绝对路径
- JPEG 格式、字节数、宽高和 SHA-256
- `previewOnly=true`、`非正式版` 与二维码可能失效提示
- `docs/records/miniapp-ci.jsonl` 和 `miniapp-ci-latest.json` 的证据路径

workflow record 使用 `event=preview_delivery_success`，同时记录 manifest signature、源目录、mirror 目录和二维码证据。最终任务回复只需报告专用目录、`latest-preview-qrcode.jpg`、`latest-preview-qrcode.json`、branch/commit/version/robot/时间和 workflow record；不要求在回复中内嵌二维码图片。

## Local Verification Without Preview

下列命令不触发真实 preview：

```powershell
node --test tests/preview-qrcode-delivery.test.js tests/weapp-preview-workflow.test.js tests/workflow-records.test.js
npm run verify:light
npm run verify:full
```

测试使用临时目录和 mock preview writer，验证成功、远端失败、二维码缺失/损坏、record 失败、stale manifest、源码/mirror 漂移、脱敏和上一份 latest 保护。不要为了测试运行 `npm run mp:preview:deliver`。
