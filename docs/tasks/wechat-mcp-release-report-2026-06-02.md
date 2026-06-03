# 微信 MCP 上线前自动验收报告

执行日期：2026-06-02

## 基本信息

- Windows 镜像项目：`D:\projects\badminton-miniapp-preview`
- MCP 服务：`ws://127.0.0.1:9420`
- MCP 连接：成功
- 镜像同步：成功
- 编译预览：成功，首页可打开
- 截图能力：`mp_screenshot` 两次调用均在 15 秒后超时，未生成截图文件。以下 UI 结论使用 MCP 页面数据、元素属性和控制台日志复核。
- 脱敏说明：报告不记录 openid、签名临时 URL、callId 或 trace 明细。

## 自动验收结果

| 步骤 | 结果 | 结论 |
| --- | --- | --- |
| 连接微信开发者工具 | 通过 | MCP 已连接当前 Windows 镜像项目，服务端口可用。 |
| 编译并打开首页 | 通过 | `npm run mp:preview` 实际完成编译预览；MCP 可读取首页页面数据。 |
| 固定人数 draft lobby | 部分通过 | 为避免未经确认写入真实云数据，复用现有 `6人转` draft 赛事。lobby 可打开，状态为 draft，存在分享入口。 |
| 动态分享预热 | 阻塞 | 页面明确降级为「动态分享不可用，使用普通分享」，未卡在准备中。当前已部署的 `manageActivityId` 运行时报错：缺少 `wx-server-sdk`。 |
| 分享按钮 gating | 通过 | 用 MCP `setData` 注入状态复核：准备中按钮禁用；ready 时文案为「动态分享」；error / unavailable 时按钮可用且文案为普通分享。源码中的 3 个 `open-type="share"` 入口均受相同条件约束；当前页面条件分支实际渲染 2 个入口。 |
| 触发分享入口 | 部分通过 | MCP 调用 `onShareButtonTouchStart` 后确认已进入 `showShareMenu -> manageActivityId.getOrCreate`。由于云端依赖缺失，未到达 `updateShareMenu`。微信群聊卡片最终展示需真机补充确认。 |
| 普通分享兜底 | 通过 | `onShareAppMessage()` 保持同步返回普通分享路径；源码和测试确认同时返回 `title/path`。 |
| custom / finished 降级 | 通过 | custom draft 返回 `player_limit_required`；finished 赛事返回 `not_draft`，均明确走普通分享。 |
| 头像展示 | 通过 | 现有 lobby 玩家长期头像字段为 `cloud://`，页面实际展示源为解析后的 HTTPS 临时 URL，头像图片可显示，不是只显示首字母。 |
| 头像选择上传 | 受限 | MCP 无法操作系统头像文件选择器。临时路径拒绝、上传后长期字段校验由自动测试覆盖。 |
| 旧头像诊断 | 通过 | MCP 调用开发态诊断入口，合成数据得到 `empty=1 / temporary=3 / unsupported=1 / cloud=1 / cloudResolveFailed=1`。故意使用不存在的 `cloud://` fileID 时，日志记录 `getTempFileURL failed`，页面渲染不中断。 |
| 分享入口观赛 | 部分通过 | MCP 打开 `share-entry` 后参数为 `intent=view`。当前 DEV 身份已在名单中，无法用同一身份真实验证跨用户点击加入；自动测试覆盖“不自动加入”。 |
| 加入后人数更新 | 未执行 | 涉及真实云数据写入，且动态分享云函数当前部署阻塞。部署修复后使用隔离验收赛事补跑。 |
| 开赛后状态更新 | 未执行 | 涉及真实云数据写入，且动态分享云函数当前部署阻塞。`startTournament` 自动测试已覆盖 `setUpdatableMsg` 调用。 |

## 控制台结论

- 发现 `[dynamicShare]` 报错：是。原因是当前云端 `manageActivityId` 部署缺少 `wx-server-sdk`，客户端正确降级普通分享。
- 现有有效头像发现 `[avatar]` 错误：否。实际 lobby 头像解析成功，`cloudResolveFailed=0`。
- 合成坏数据诊断发现 `[avatar] getTempFileURL failed`：是，符合预期，用于证明诊断和非阻塞降级有效。
- release 环境成功解析日志：已通过代码补丁和单测抑制；失败警告仍保留。

## 自动化命令复核

- `npm test`：最终 `1058 pass / 0 fail`。
- `npm run check`：通过。
- `npm run lint`：`0 errors / 53 warnings`，警告数量未增加。
- `npm run audit:avatars -- tmp/avatar-audit-release-check.json`：只读 dry-run 通过，输出 `empty=1 / temporary=3 / unsupported=1 / cloud=1 / cloudResolveFailed=0`。
- `npm run deploy:cloud:changed` dry-run：当前差异识别到 `deleteTournament`、`resetTournament`；完整上线文件列表可识别要求的 8 个云函数。

## 部署前阻塞项

1. 重新部署 `manageActivityId`，确认云端安装 `package.json` 中的 `wx-server-sdk` 依赖。
2. 至少部署：`createTournament`、`joinTournament`、`saveUserProfile`、`manageActivityId`、`startTournament`、`submitScore`、`resetTournament`、`deleteTournament`。
3. 部署后重新进入固定人数 draft lobby，确认页面显示「动态分享已准备好」，并触发分享入口确认日志到达 `updateShareMenu`。
4. 在真机微信群补充确认动态卡片初始人数、加入后人数、开赛跳转和结束状态。

## 是否建议上传开发版

暂不建议。先修复并验证云端 `manageActivityId` 依赖部署，再上传小程序开发版。
