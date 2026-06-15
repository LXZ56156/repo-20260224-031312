# Learnings & Temporary Rules

> Accumulate discoveries, gotchas, and temporary constraints here.
> Periodically review: promote stable items to CLAUDE.md, delete resolved items.

## Active
- [2026-06-15] 小程序 UI 改动必须走真实截图检查：先用 `miniprogram-browser doctor` / `snapshot -i --layout` 确认 DevTools 运行态，再用 `npm run ui:screenshot -- <case>` 生成真实页面截图。当前稳定自动化端口是 `39420`，不要使用旧端口 `9420`；`miniprogram-browser screenshot --mode page` 在 WSL 下可能超时或空白，`layout` 只作结构辅助。完整流程见 `docs/tools/weapp-ui-screenshot-workflow.md`。
- [2026-06-11] 文档生命周期规则：
  1. `docs/tasks/current.md` 保持 ≤50 行，会话结束后将验证细节提取到 `docs/tasks/session-logs/`
  2. 一次性计划/审计/报告完成后移入 `docs/reports/`（审计/报告类）或 `docs/archive/`（历史计划类）
  3. 功能设计文档和实现计划放在 `docs/specs/`
  4. 定期清理 `docs/archive/`，确认不再需要后可以删除
- [2026-06-05] 拉取微信 we分析数据时，直接使用已有的 `scripts/fetch-we-analysis.js` 本地脚本，不要通过 CloudBase MCP 或其他途径。该脚本支持 10 种 datacube API（dailyVisitTrend/monthlyVisitTrend/visitPage/userPortrait 等），从 `.env.local` 读取 WX_APPID/WX_APPSECRET，token 缓存在 `.cache/`，输出 JSON/CSV 到 `data/we-analysis/`。完整文档见 `docs/tools/we-analysis-local-script.md`。之前的拉取数据（100+ 天）已全量存在于 `data/we-analysis/` 目录，新建会话时先检查该目录已有数据避免重复拉取。
- [2026-05-27] `npm run mp:upload` 上传小程序前，用 `git log <上次上传commit>..HEAD --oneline` 查看新增提交，总结为小程序用户可感知的变更摘要，通过 `MP_DESC` 环境变量传入。不要直接使用 git commit message（那是给开发者看的），要翻译成功能变化描述。上传完成后在 `current.md` 记录本次上传的 commit 和备注。示例：`MP_DESC="共享卡片动态消息修复不生效问题；头像全局共享缓存减少闪烁" npm run mp:upload`。IP 白名单关闭后可跳过 IP 校验。密钥放在项目外 `.keys/` 目录（已 gitignore）。
<!-- Format: - [date] description. Why it matters. -->
- [2026-05-02] `scripts/*-common.template.js` 是云函数共享库唯一源；修改后先运行 `bash scripts/sync-cloud-common.sh`，再用 `bash scripts/check-cloud-common.sh` 校验，只部署实际受影响的云函数，避免手改 `cloudfunctions/*/lib/*` 造成漂移。

## Resolved / Archived
<!-- Move items here when no longer relevant, with resolution date. -->
