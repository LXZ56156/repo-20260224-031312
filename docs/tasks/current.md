# Current Task

> AI session handoff. Keep this file concise; detailed evidence belongs in the linked handoff.

## Status: incremental_ui_restart_from_master_plus_score_overlay

## Current User Decision (2026-07-29)

- “下一代羽毛球小程序全面升级计划”及其 C3/Home 全面重设计路线立即暂停；现有 next-gen 代码、浏览器稿、截图和本地预检只作历史证据，不再是产品实施基线。
- 后续 UI 改为从 `master@5813ffc` 加唯一已批准的 schedule 中央 `VS`/比分位置调整开始，一次只微调一个明确问题。
- 新对话的权威入口是 `AGENTS.md`、本文、`incremental-ui-restart-handoff-2026-07-29.md` 和 `incremental-ui-optimization-plan.md`。

## Exact Baseline

- 线上正式版与产品基线：`master` = `origin/master` = `5813ffc79f94c180fa5573eb25fb0d57f53b85df`。
- 唯一 overlay：`38d6ea4e716ac3ffad6213fd21f1f6301a1dffd8`（`fix(schedule): center score between teams`）。
- overlay 只修改 schedule `index.wxml`、`index.wxss` 和 `tests/schedule.ui-copy.test.js`。
- 相对 master 的产品代码差异必须只有上述两个 schedule 页面文件；`cloudfunctions/` 必须零差异。

## Worktree Safety

- `D:\projects(WIN)\badminton-miniapp` 当前位于 `codex/ui-optimization-v2@d0435f6`，该分支已包含比分调整之外的后续功能，**不得**作为新 UI 微调基线或直接 preview/upload。
- `nextgen-ui-redesign-20260724@f792b75` 已暂停并保留证据；不得复用、整体合并或从其 dirty 工作区复制视觉实现。
- 新对话应从 `master@5813ffc` 创建新的隔离 `codex/` branch/worktree，再精确 cherry-pick `38d6ea4`；不要在主工作区切分支。

## Incremental UI Contract

- 每次只选择一个页面或一个清晰视觉问题。
- 先在浏览器给近似方案；用户选定后才写原生 WXML/WXSS。
- 实现后用当前源码的真实微信 DevTools 截图验收；浏览器图不能代替实图。
- CTA、导航、文案、权限、业务流程、云写入和发布语义变化都必须单独批准。
- 禁止 push、PR、preview/upload、正式发布、云函数部署、真实数据写入和不可恢复删除，除非用户在新对话中明确授权。

## Next Action

新对话只先建立并验证“master + `38d6ea4`”干净隔离基线，然后等待用户指定第一个微调点；不要自动恢复 next-gen ROADMAP、NG-007、C3 或跨页面设计系统。
