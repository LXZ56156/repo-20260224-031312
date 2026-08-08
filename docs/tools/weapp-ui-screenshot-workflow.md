# WeChat DevTools UI Screenshot Workflow

> 用于当前隔离 worktree 的真实微信 DevTools UI 检查。本文只描述当前分支实际拥有的脚本能力，不套用旧分支的 schema-v3 records、三帧校验、窗口恢复或 screenshot alias。

## 适用范围

任何 `miniprogram/pages/**` 的 WXML、WXSS、用户可见文案、CTA 或页面状态变化，在向用户宣称完成前都必须生成当前源码的真实 DevTools 图并由主控人工检查。浏览器近似稿、旧截图、旧 QR、DOM 结构快照和数学换算不能替代该证据。

当前入口只有：

```powershell
npm run ui:screenshot -- --list
npm run ui:screenshot -- <case>
```

本分支没有 `screenshot:smoke`、`screenshot:schedule`、`screenshot:diagnose`、`weapp:probe` 或 `records:latest`。不要照抄其他 worktree 的命令；始终以本 worktree 的 `package.json` 为准。

## 端口不是固定角色

`scripts/dev/weapp-ui-screenshot.js` 当前仍以 `ws://127.0.0.1:39420` 为历史默认值，但该默认值不可信，正式截图必须显式传入已经验证的 mini-program automation endpoint：

```powershell
$env:WEAPP_WS_ENDPOINT = 'ws://127.0.0.1:<verified-automation-port>'
$env:WEAPP_SCREENSHOT_DIR = 'tmp/ui-screenshots-<task>'
npm run ui:screenshot -- <case>
Remove-Item Env:WEAPP_WS_ENDPOINT -ErrorAction SilentlyContinue
Remove-Item Env:WEAPP_SCREENSHOT_DIR -ErrorAction SilentlyContinue
```

一次已验收会话中观察到：

| Capture-time port | 当时角色 |
|---|---|
| `39420` | DevTools IDE HTTP；普通 HTTP 返回 404，不是 automator WebSocket |
| `39424` | Chrome/CDP（只在该会话存在时） |
| `39432` | mini-program automation；普通 HTTP 返回 426，要求 WebSocket upgrade |

这些数字是会话事实，不是协议固有分配。2026-08-08 复核时 `39420` 与 `39432` 仍在监听，`39424` 已不存在，进一步证明不能把端口号写成永久合同。

选择 endpoint 时必须同时确认：

1. listener 属于目标 DevTools 进程树；
2. DevTools 启动参数/会话对应当前 worktree，而不是 canonical、preview mirror 或其他 worktree；
3. automation 协议能返回真实 `Tool.getInfo` 与 `App.getCurrentPage`；只看到 TCP listener、404、CDP `/json/version` 或旧记录都不够；
4. 若有 CDP 项目信息，`projectpath` 必须与当前 worktree 精确匹配；没有 CDP 时不能用盲扫端口代替 provenance。

当前仓库没有封装上述完整 probe，这是已知工具债。正式结果必须在任务记录中写明 endpoint、worktree、当前源码/commit 和人工截图结论。

## 标准单页流程

1. 在当前 worktree 打开或重新绑定微信开发者工具，并确认已编译当前源码。
2. 验证 exact-worktree automation endpoint，显式设置 `WEAPP_WS_ENDPOINT`。
3. 先列出 case，再只运行本次页面：

   ```powershell
   npm run ui:screenshot -- --list
   npm run ui:screenshot -- launch
   ```

4. 查看命令输出的 `dom`、可选 `horizontalAlignment` 和 PNG；人工逐项检查。
5. 记录图像路径/尺寸/hash、endpoint、源码 provenance、真实宽度及用户确认状态。
6. 清理当前 PowerShell 进程中的临时环境变量；不要删除用户证据文件。

不传 case 会依次运行所有当前内置 case，但这不是强事务性 full matrix：脚本每个 case 独立连接，前面的 PNG 可能在后续失败前已经被写入。不能把“默认全跑”称为 canonical smoke 或原子验收。

## 当前内置用例

| Case | 页面 | 当前 fixture / 检查点 |
|---|---|---|
| `water` | `pages/water/index` | 本地 owner fixture；计分板、记一局、总账加减和最近记录 |
| `launch` | `pages/launch/index` | 无 `setData` fixture；真实入口页面及 quick-water/比赛 CTA 横向关系 |
| `home` | `pages/home/index` | 本地完赛赛事卡 fixture |
| `shareDraft` | `pages/share-entry/index` | draft 加入态 fixture |
| `shareRunning` | `pages/share-entry/index` | running 赛程/排名态 fixture |
| `shareFinished` | `pages/share-entry/index` | finished 最终排名/战报态 fixture |
| `lobbyGuide` | `pages/lobby/index` | 新人引导 fixture |
| `ranking` | `pages/ranking/index` | 最终排名及分享入口 fixture |
| `schedule` | `pages/schedule/index` | finished hero/share fixture；不是 `scheduleRunning` 中央比分 case |
| `analytics` | `pages/analytics/index` | 赛后战报 fixture |

`launch` 和 `home` 使用 `switchTab`，其余按脚本配置使用 `reLaunch`。多数 case 通过 `setData` 注入本地 fixture，只能验收页面渲染，不证明真实云数据链路。

## 当前脚本的成功合同

对所有 case，脚本会：

- 导航到配置页面，等待后注入 fixture；
- 收集 selector 的文本、size 和 offset；
- 调用 `App.captureScreenshot` 输出 PNG；
- 仅用文件大于 20KB 判断图片“看起来非空”。

`launch` 额外要求：

- `.launch-water-btn` 与 `.launch-card.is-default .launch-btn` 各精确命中一次；
- 两者 `left` 与 `width` 都是有限数值；
- 相对 `leftDelta` 和 `widthDelta` 不超过 1px。

该 validator 不检查绝对 viewport 边界、垂直位置、高度、触达面积、视觉主次或共同溢出；两颗按钮同时放错也可能通过。

## 当前脚本明确没有的能力

- 不绑定 Git HEAD、dirty files、worktree receipt 或 AppService runtime token；
- 不校验 PNG header/尺寸、selector 对应像素区域、探针变化或 restored frame 稳定性；
- 不检测 stale compile/stale pixel，不做 candidate/confirmation 三帧；
- 不管理、最大化或恢复 DevTools 窗口，不证明前台焦点已恢复；
- 失败前可能已经覆盖目标输出，不做 staging/transactional promotion；
- 不写 `docs/records/` success receipt。

因此 `ok=true` 只是最小脚本条件，不等于最终视觉验收。

## 后台截图与窗口规则

DevTools 最小化后，Chromium/NW.js surface 可能停止可靠绘制，`App.captureScreenshot` 会超时或得到 stale 图。为不占用用户整个窗口，优先保持 DevTools 为“已恢复但位于其他窗口后方”，不要最小化；当前脚本本身不会主动抢前台，但也不能证明或恢复焦点。

如果截图超时：

1. 先核对 endpoint 和 exact worktree，不连续盲重试；
2. 核对 DevTools 是否编译了当前源码，必要时对 exact project 做一次重新绑定；
3. 将 DevTools 从最小化恢复后放到后台，再跑单 case；
4. 仍失败就保留失败事实，不用浏览器稿、DOM 或旧图替代。

不得为了截图调用 `open`、preview、upload、正式发布或切换 canonical 主工作区分支。

## 证据表述

- “真实 DevTools 图”：当前源码、exact worktree、已验证 automation endpoint 的真实 PNG，并经过人工检查。
- “结构/数学检查”：WXML/WXSS 合同、DOM geometry 或 rpx 换算；必须注明不是截图。
- “浏览器近似稿”：方向选择证据；不得作为小程序验收。
- “preview QR”：某次 preview 构建入口；不得推导为当前 HEAD、`mp:upload` 或线上正式版。

涉及宽度时，只有分别捕获的图片才能称为 320/390/430 实图。未截图宽度必须逐一标注为结构/数学等效检查。

## 2026-08-08 Launch 验收

- 输出：`tmp/ui-screenshots-launch-align-20260807-final/launch.png`
- PNG：`717×1233`、`317391` bytes、SHA-256 `30e2c54f7613ac2e4abb0d24de9740274e24e42c95c1b9bab0d77c386ef9c305`
- 两个 CTA：`left=136.096939…px`、`width=184px`，相对 delta 为 0。
- 这是当前源码真实 DevTools 像素并已获用户确认；320/430 仅做结构/数学检查。
- 详细 provenance、测试和已知限制见 `docs/tasks/session-logs/2026-08-08-standalone-water-launch-acceptance.md`。
