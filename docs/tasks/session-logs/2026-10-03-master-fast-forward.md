# master快进与默认分支统一（2026-10-03）

用户在项目路径迁移完成后要求使用 `master` 作为主分支，并明确授权快进远端与本地 `master`、切换当前checkout、恢复GitHub默认分支及同步本地origin/HEAD。项目总目录为 `D:\projects\badminton-miniapp`，实际源码仓库为其下的 `main`。

## 最终状态

- [GitHub仓库](https://github.com/LXZ56156/repo-20260224-031312)的 `master` 从 `5813ffc79f94c180fa5573eb25fb0d57f53b85df` 快进至 `b571c68754e964e1a73800645f68a49d99f40f41`，增加30个既有提交；祖先关系及GitHub compare核验通过，无分叉、无强制推送、无新增提交。
- 本地 `master`、`origin/master`、远端 `master` 和当前checkout的HEAD均为该目标提交；上游为 `origin/master`。
- GitHub默认分支为 `master`，本地origin/HEAD为 `refs/remotes/origin/master`，回读核验通过。
- 原 `codex/online-audit-optimizations-20260828` 保留在相同HEAD；其他本地分支refs未改变。`worktrees/control` 仍为 `codex/project-control` / `f36f964a`，`worktrees/production` 仍为 `codex/production-baseline-20260814` / `55bfc4fa`。
- 线上客户端仍是源码 `702625a3afeeffb4254a4d2c155ef7df28a9a2d8` / `6.1.2-702625a`，见 [线上确认](2026-09-23-online-release-confirmed.md)。此次分支整理不产生新发布。

## 执行与保留证据

最初SSH推送因本机密钥认证拒绝失败；仅覆盖 `remote.origin.url` 的尝试仍使用SSH。最终通过单次命令覆盖 `remote.origin.pushurl` 为HTTPS，并使用既有 `gh auth git-credential` 登录态完成普通 `git push origin b571c68754e964e1a73800645f68a49d99f40f41:refs/heads/master`，未改仓库原SSH地址或全局Git配置。推送回执为 `5813ffc..b571c68 -> master`。

远端SHA回读通过后，使用带预期旧SHA的 `git update-ref` 更新本地 `master`，设置上游并切换到同一源码树；随后设置GitHub默认分支和本地origin/HEAD。主分支切换前后完整dirty/untracked状态、working diff、staged diff逐项一致，33个已修改及未跟踪文件的SHA256全部一致，其他本地分支refs一致；暂存区保持为空。随后仅更新本记录、current、AGENTS中的旧基线措辞以及首次默认分支记录的接续链接。

原始回执位于总目录 `backups/master-fast-forward-2026-10-03/`：`before.json`、`working-file-hashes-before.json`、`push.log`、`after.json`、`result.json` 和 `execute.ps1`。文件内容及差异保留检查发生在本次文档收口之前，文档收口另行核验。

验证：分支、远端SHA、默认分支、origin/HEAD、上游及改动保留检查通过；文档链接和 `git diff --check` 通过。本次只有Git引用与文档变化，未重复执行此前通过的业务测试、check和lint。未执行新commit、preview/upload、发布、云函数部署或真实业务数据写入。
