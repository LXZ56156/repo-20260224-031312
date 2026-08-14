# 0003：正式线上版本 6.1.2-e60d827-r3

- 状态：Accepted
- 日期：2026-08-14
- 决策者：用户

## 已确认事实

当前正式线上小程序版本是 `6.1.2-e60d827-r3`。

该版本的 upload 机器回执位于 ba45 worktree 的 `.codex/receipts/feedback-contact-removal-upload-20260813.json`。回执记录 upload 成功；后续 byte-manifest 核对确认其 633 个 `miniprogram` 文件与提交 `55bfc4fa319ab74a33d406f05fbdab975ab8cfb7` 一致。用户于 2026-08-14 进一步确认该版本已经成为正式线上版本。

## 基准含义

- `55bfc4f` 是当前线上客户端源码身份；`master@5813ffc` 降为历史线上基线。
- ba45 worktree 当前包含未提交文档和未跟踪证据，因此 worktree 本身不是干净 production baseline。
- 后续产品任务应从 `55bfc4f` 创建新的干净隔离 worktree，不从 ba45 的 dirty 文件系统状态复制。
- 客户端版本不能证明云函数、集合、索引、feature config、迁移或 canary 状态；云端事实必须单独盘点和记账。

## 本决策未触发的动作

本记录不创建分支、不复制 worktree、不合并候选、不部署云函数、不执行 preview/upload、审核、发布或真实数据写入。
