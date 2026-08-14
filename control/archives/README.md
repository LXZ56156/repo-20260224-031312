# Worktree Archives

每个卸载 worktree 在本目录拥有独立 manifest。manifest 必须记录：原 path、branch/HEAD、dirty 清单、branch bundle、tracked binary patch、untracked archive、SHA-256、临时恢复验证结果和恢复命令。

仅有 branch 或仅有 patch 都不算完成归档。未完成恢复验证，或未获得具体路径授权时，不得移除 dirty worktree。
