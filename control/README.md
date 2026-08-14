# Project Control

这里是本项目唯一的跨 worktree 控制面。业务 worktree 中的 `docs/tasks/current.md` 只描述该分支本地任务，不能覆盖这里的线上、发布、云端或 worktree 事实。

会话入口：

1. `PROJECT.md`：一屏项目状态。
2. `worktrees.json`：全部已挂载 worktree 注册表。
3. `release-ledger.jsonl`：不可覆盖的发布事件流水。
4. `archives/`：卸载 worktree 的恢复清单。

只读检查：

```powershell
npm run worktree:status
```

该命令发现未登记 worktree、登记漂移、dirty PRODUCTION 或生产源码不匹配时返回非零状态。当前只实现 `status`；归档和删除仍需逐路径授权。
