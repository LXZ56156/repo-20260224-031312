# 默认分支设置（2026-10-03）

本记录保留首次默认分支设置的历史事实；随后按用户明确授权将 `master` 快进至同一HEAD并恢复为默认分支，当前状态见 [master快进记录](2026-10-03-master-fast-forward.md) 和 [current](../current.md)。

用户在确认线上版本所属分支后明确要求“把这个设为主分支”。本次将[GitHub仓库](https://github.com/LXZ56156/repo-20260224-031312)的默认分支从 `master` 改为已有 `codex/online-audit-optimizations-20260828`，保留该分支名称及所有现有分支。

- 仓库：`LXZ56156/repo-20260224-031312`。
- GitHub默认分支：`codex/online-audit-optimizations-20260828`；gh repo view回读核验通过。
- 本地origin/HEAD：`refs/remotes/origin/codex/online-audit-optimizations-20260828`，同步并核验通过。
- 当前checkout：`D:\projects\badminton-miniapp\main`，同名分支；本地与远端HEAD均为 `b571c68754e964e1a73800645f68a49d99f40f41`。
- 线上客户端仍是源码 `702625a3afeeffb4254a4d2c155ef7df28a9a2d8` / `6.1.2-702625a`，证据见[线上确认](2026-09-23-online-release-confirmed.md)；默认分支设置不改变已发布包。

执行入口为 `gh repo edit LXZ56156/repo-20260224-031312 --default-branch codex/online-audit-optimizations-20260828`，之后用 `git remote set-head origin codex/online-audit-optimizations-20260828` 同步本地符号引用。

修改前后HEAD、当前checkout分支、全部本地branch refs、staged diff以及完整dirty/untracked状态一致；只有仓库默认分支设置和本地origin/HEAD改变。随后增加本记录并更新current，属于明确的文档收口。回执存放在总目录 `backups/default-branch-2026-10-03/before.json` 和 `result.json`。

验证：远端默认分支与本地origin/HEAD回读通过；文档链接和git diff --check通过。本次没有业务实现改动，未重复运行此前已通过的测试/check/lint。未执行commit、push、分支重命名/合并、preview/upload、发布、云部署或真实业务数据写入。
