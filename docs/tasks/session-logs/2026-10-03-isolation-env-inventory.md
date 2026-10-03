# 隔离 CloudBase 环境只读清点

- 时间：2026-10-03 08:09（Asia/Shanghai，命令序列记录时间）
- 工作区：`D:\projects\badminton-miniapp\main`；branch `master`；HEAD `b571c68754e964e1a73800645f68a49d99f40f41`。
- 执行前读取 `AGENTS.md` 与 `docs/tasks/current.md`。工作区当时已有大量未提交改动，均予保留；仅新增本记录。
- `Get-Command tcb,cli` 找到 `tcb.ps1`；`tcb --version` 成功，版本为 CloudBase CLI 3.7.3。
- `tcb env --help` 与 `tcb env list --help` 成功；帮助说明 `env list` 只显示环境信息，默认地域为 `ap-shanghai`，支持通过 `--region` 指定地域。

## 查询结果

以下命令均为只读环境列表查询，退出码均为 0：

| 命令 | 结果 |
| --- | --- |
| `tcb env list --json`（默认 `ap-shanghai`） | 返回已知生产环境 `cloud1-1ghmqjyt6428702b`，`status=NORMAL`。JSON 未返回环境名称或函数 runtime 字段。 |
| `tcb env list --region ap-singapore --json` | CLI 返回当前授权可见范围内无 CloudBase 环境。 |
| `tcb env list --region ap-guangzhou --json` | CLI 返回当前授权可见范围内无 CloudBase 环境。 |

在本次 CLI 授权可见范围及已查询地域中，没有发现现成的非生产/隔离环境。环境列表没有提供名称或 runtime 信息，因此这些字段未核验。没有对生产环境执行测试写入，也没有创建或修改环境、函数、规则或数据；没有执行登录或登出。
