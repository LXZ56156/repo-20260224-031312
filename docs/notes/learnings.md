# Learnings & Temporary Rules

> 这里只记录尚未提升为稳定规则、状态事实或正式 runbook 的短期发现。每次整理时将稳定内容迁往权威文件，并从 Active 移除。

## Active

- [2026-08-14] 用户已统一选择兼容云函数自动部署；精确兼容合同和仍需授权的范围已提升到 `docs/decisions/0001-compatible-cloud-auto-deploy.md`。
- [2026-08-14] 整理开始时 20 个 worktree 中 12 个 dirty；未提交成果分布在协作打水、Next-Gen、截图诊断和上传验收树。完整保护范围见 `docs/status/worktree-inventory.md`。

## Promoted / Archived

| 原始经验 | 当前权威位置 |
|---|---|
| 产品、branch、upload、cloud deploy 和线上版本必须分层 | `docs/status/project-state.md`、`docs/status/release-ledger.md` |
| UI 单点审批、浏览器近似稿和真实 DevTools 验收 | `AGENTS.md`、`docs/specs/incremental-ui-optimization.md` |
| 已关闭 core-flow 和暂停 parallel/Next-Gen 路线 | `docs/archive/2026/` |
| Windows 路径、launcher、端口恢复与截图窗口合同 | `docs/tools/windows-dev-environment.md`、`docs/tools/weapp-ui-screenshot-workflow.md` |
| 文档生命周期与 session log 归档 | `docs/README.md` |
| We 分析拉取和缓存 | `docs/tools/we-analysis-local-script.md` |
| 小程序 preview/upload 交付 | `docs/tools/weapp-preview-qrcode-delivery.md`、`docs/status/release-ledger.md` |
| 云函数共享模板唯一源 | `AGENTS.md`、`docs/context/architecture.md` |
| growth Phase 1 结论与 Phase 2 候选 | `docs/specs/growth-flywheel-optimization.md` |
