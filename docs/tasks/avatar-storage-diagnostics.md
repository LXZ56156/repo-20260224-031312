# 头像旧数据诊断与存储权限检查

## 开发态诊断

`lobby` 在非 `release` 环境首次收到每个赛事版本时，会扫描 `players`、`rounds`、`rankings` 中的头像并输出：

- `emptyAvatars`：空头像
- `temporaryAvatars`：`wxfile://`、`file://`、`http://tmp/` 等本机临时路径
- `unsupportedAvatars`：非 `cloud://` 且非 `http(s)` 的旧路径
- `cloudResolveFailed`：调用 `wx.cloud.getTempFileURL()` 后仍无法解析的 `cloud://` fileID

日志前缀为 `[avatar] tournament diagnostic`。诊断只读，不修改赛事数据。

## 一次性 Dry-run

从云开发控制台导出 `tournaments` JSON 后运行：

```bash
npm run audit:avatars -- path/to/exported-tournaments.json
```

脚本只输出报告，不连接云环境，也不会执行写入。确认报告后再单独设计迁移，避免默认清理真实数据。

## `avatars/` 存储读权限

在云开发控制台进入「云存储」→「权限设置」→「自定义安全规则」，确认 `avatars/` 允许其他小程序用户读取，否则其他参赛者调用 `getTempFileURL()` 会失败。

头像需要跨用户展示时，可把现有规则中的读取条件合并为：

```json
{
  "read": "/^avatars\\//.test(resource.path)",
  "write": "resource.openid == auth.openid || resource.openid == auth.uid"
}
```

不要直接覆盖已有规则；项目还有 `share-cards/` 等路径。修改后等待 1-3 分钟，再用开发态诊断确认 `cloudResolveFailed` 已清空。
