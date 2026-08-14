# Project Status

> 权威更新时间：2026-08-14。跨 worktree 的当前事实以本页及同目录机器可读文件为准。

## Production

- 正式线上版本：`6.1.2-e60d827-r3`
- 客户端源码身份：`55bfc4fa319ab74a33d406f05fbdab975ab8cfb7`
- PRODUCTION：`D:\projects(WIN)\badminton-miniapp-production`
- PRODUCTION branch：`codex/production-baseline-20260814`
- 客户端状态：已建立干净、只读用途的精确源码基线。
- 云函数、集合、索引、权限、开关与线上数据：不能由客户端版本推断，尚待独立盘点。

## Worktree Slots

- CONTROL：`D:\projects(WIN)\badminton-miniapp-control` / `codex/project-control`
- PRODUCTION：1 个，已占用并要求始终 clean。
- ACTIVE：0 个。
- RELEASE：0 个。
- 历史挂载树：8 个，全部登记为 `archive_pending`；另有 8 个已归档卸载。

## Current Work

- Phase 1 已完成：控制面、生产基线、18 棵已挂载树注册和 fail-closed 状态检查均已落地。
- Phase 2 已完成：3 个 clean 历史 worktree 的 bundle、SHA-256 和恢复 clone 均已验证，Git worktree 已卸载；branch 与 bundle 保留。
- `local-ops-dashboard` 的本地 Node 看板进程已停止；非 Git 残留已移动到备份区，原路径已清除。
- Phase 3 第一组已完成：`07af` 与 `a6ba` 的完整恢复验证通过并已卸载。
- Phase 3 upload 组已完成：三棵树及 6579 个私密证据文件均逐字节恢复验证并卸载。
- 下一动作：归档旧打水组；其余 8 个历史挂载树继续保持原状。
- 禁止在迁移完成前新增未登记 worktree。

## Verify

```powershell
npm run worktree:status
```
