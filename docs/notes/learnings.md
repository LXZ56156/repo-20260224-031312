# Learnings & Temporary Rules

> Accumulate discoveries, gotchas, and temporary constraints here.
> Periodically review: promote stable items to CLAUDE.md, delete resolved items.

## Active
- [2026-05-20] `npm run mp:preview` / `npm run mp:upload` 通过 miniprogram-ci 操作 Windows 镜像项目。配置从 `.env.local` 自动加载（无需手动 export）。上传备注应总结小程序实际变更，不要用 CI 工具提交信息。IP 白名单关闭后可跳过 IP 校验。密钥放在项目外 `.keys/` 目录（已 gitignore）。
<!-- Format: - [date] description. Why it matters. -->
- [2026-05-02] `scripts/*-common.template.js` 是云函数共享库唯一源；修改后先运行 `bash scripts/sync-cloud-common.sh`，再用 `bash scripts/check-cloud-common.sh` 校验，只部署实际受影响的云函数，避免手改 `cloudfunctions/*/lib/*` 造成漂移。

## Resolved / Archived
<!-- Move items here when no longer relevant, with resolution date. -->
