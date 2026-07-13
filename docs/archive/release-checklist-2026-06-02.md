# 上线前微信 MCP 自动验收清单

> 历史清单（2026-06-02）。下文旧 preview 路径仅记录当时环境；当前路径和命令见 `docs/tools/windows-dev-environment.md`，不得直接照此执行。

## 前提

1. 确认微信开发者工具已启动，自动化服务端口可连接。
2. 当时使用微信开发者工具 MCP / `weapp-dev` MCP 连接 Windows 镜像项目：`D:\projects\badminton-miniapp-preview`（现已废弃）。
3. 确认小程序已完成编译，首页可打开；如有编译错误，记录错误并停止后续 UI 验收。
4. 涉及云端真实能力时，先部署对应云函数。
5. MCP 无法真实验证微信群聊卡片最终展示形态，报告必须标注「需真机补充确认」。

## 自动验收步骤

1. 调用 MCP 检查连接状态；失败时记录端口、项目路径和原因，不跳过。
2. 打开首页并截图，确认页面正常渲染，检查控制台编译或运行错误。
3. 通过 MCP 创建固定人数上限的 draft 赛事，例如 `6人转` 或 `8人转`，进入 lobby 截图。
4. 等待动态分享预热，检查状态为「动态分享已准备好」或明确的普通分享降级；长时间停留在准备中视为失败。
5. 检查 3 个 `open-type="share"` 入口：准备中均禁用，ready 时文案明确为动态分享，error / unavailable 时允许普通分享并显示降级文案。
6. 触发分享入口，检查 `[dynamicShare]` 日志和 `showShareMenu -> manageActivityId.getOrCreate -> updateShareMenu` 准备路径。微信群聊卡片最终展示标注「需真机补充确认」。
7. 在 lobby 或 profile 触发头像选择；如 MCP 无法操作系统文件选择器，记录限制并使用测试或页面数据检查补充。确认长期字段不是 `wxfile://`、`file://`、`blob:`、`http://tmp` 或 `/tmp/`，上传后源字段为 `cloud://`，展示字段为可显示 URL。
8. 载入含空头像、临时路径、unsupported 路径、`cloud://` fileID 的测试赛事，进入 lobby 检查 `[avatar] tournament diagnostic` 分类。正式版不应刷成功解析明细日志。
9. 模拟分享入口进入 `share-entry` 或 lobby：默认只查看，不自动加入；点击加入后才加入，返回 lobby 后确认人数变化。
10. 通过 MCP 操作管理员开赛，确认进入赛程页，并检查 `startTournament` 动态卡片状态更新日志。微信群聊卡片最终变化标注「需真机补充确认」。
11. 头像仍显示首字母时，记录 `[avatar] getTempFileURL failed`、`[avatar] resolveCloudAvatarFileIds error`、`[avatar] tournament diagnostic`；`cloudResolveFailed` 时检查 `avatars/` 读权限，只合并权限，不直接覆盖现有规则。

## MCP 验收报告

执行结果现归档在 `docs/reports/wechat-mcp-release-report-2026-06-02.md`。
