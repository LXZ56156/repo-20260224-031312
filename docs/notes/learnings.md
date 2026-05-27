# Learnings & Temporary Rules

> Accumulate discoveries, gotchas, and temporary constraints here.
> Periodically review: promote stable items to CLAUDE.md, delete resolved items.

## Active
- [2026-05-27] `npm run mp:upload` 上传小程序前，用 `git log <上次上传commit>..HEAD --oneline` 查看新增提交，总结为小程序用户可感知的变更摘要，通过 `MP_DESC` 环境变量传入。不要直接使用 git commit message（那是给开发者看的），要翻译成功能变化描述。上传完成后在 `current.md` 记录本次上传的 commit 和备注。示例：`MP_DESC="共享卡片动态消息修复不生效问题；头像全局共享缓存减少闪烁" npm run mp:upload`。IP 白名单关闭后可跳过 IP 校验。密钥放在项目外 `.keys/` 目录（已 gitignore）。
<!-- Format: - [date] description. Why it matters. -->
- [2026-05-02] `scripts/*-common.template.js` 是云函数共享库唯一源；修改后先运行 `bash scripts/sync-cloud-common.sh`，再用 `bash scripts/check-cloud-common.sh` 校验，只部署实际受影响的云函数，避免手改 `cloudfunctions/*/lib/*` 造成漂移。

## Resolved / Archived
<!-- Move items here when no longer relevant, with resolution date. -->
