# 2026-07-16 P05 复办基础：clone preset 契约修复

## 状态

- 工作线：`codex/roadmap-clone-retention`。
- 独立 worktree：`D:\projects(WIN)\badminton-miniapp-worktrees\clone-retention`。
- 起始文档 checkpoint：`70845c1`。
- 实现提交：`d1b6e04 fix: preserve rotation presets when cloning tournaments`。
- 当前状态：用户已批准、实现已完成、仅本地提交，等待总控集成。

## 审批记录

- 原线程先展示了完整复制行为矩阵，覆盖已知固定人数 preset、custom、未知或污染 preset、非多人转、名单人数不符、返回契约、历史数据和 UI/文案/导航。
- 用户随后明确回复“批准”，未附加其他产品范围。
- 该批准仅授权 clone preset allowlist 修复，不包含常用球友名单、名单 UI、页面入口、分享、历史回填或其他字段扩展。

## 实现与边界

`d1b6e04` 仅修改：

- `cloudfunctions/cloneTournament/index.js`：仅 `multi_rotate` 调用共享 `modeHelper.resolveRotationPreset()`；已知 preset 写 canonical `presetKey/playerLimit`，custom、缺失或未知 preset 写 `presetKey: 'custom'` 且省略 `playerLimit`，非多人转省略两字段。
- `tests/cloneTournament.index.test.js`：覆盖 `rotation_6/7/8`、canonical 化、污染源 `playerLimit`、custom/缺失/未知 preset、非多人转字段隔离，以及场数、场地、rules 和 dedupe code 保持。

未修改页面、`miniprogram/core/cloneTournament.js`、`logic.js`、其他云函数、`scripts/mode-common.template.js`、生成的 `cloudfunctions/*/lib/*`、权限、clientRequestId 幂等、返回结构或成员 ID 重映射语义。

## 验证

- 原线程测试执行记录：已知 preset 与 custom/缺失/未知 preset 用例在实现前按预期失败，最小实现后转绿；非多人转保护用例始终通过。
- `weapp-cloud-contract-audit` 的 clone 契约映射检查：52/52 通过。
- clone、core、squad preservation、readiness、lobby、start validation 与 cloud response 聚焦回归：64/64 通过。
- `npm run check:cloud-common`：9 个模板、22 个云函数无漂移。
- 实现阶段 `npm run verify:full`：1176 项测试中 1170 通过、0 失败、6 跳过；deprecated API、cloud-common、lint 和 `git diff --check` 均完成，其中 lint 为 0 errors，warnings 来自既有无关文件。
- 独立最终 diff review：无阻塞 findings；确认仅两个允许文件产生实现差异。

## 外部操作与部署边界

- 未 push、未创建 PR、未 preview/upload、未发布、未写真实云数据。
- 创建 `d1b6e04` 后，仓库 post-commit hook 自动识别到待部署函数 `cloneTournament` 并进入预部署检查；流程在执行 `tcb env list --json` 时因系统找不到 `tcb` 而失败，尚未进入函数部署步骤，也未调用 `tcb fn deploy`，实际未部署。
- 未重试 `npm run deploy:cloud:changed`。本次文档收口提交使用 `SKIP_CLOUD_POST_COMMIT_DEPLOY=1`，避免再次触发部署流程。
- 总控完成集成并取得独立部署授权后，未来待部署函数仅为 `cloneTournament`；本工作线不执行部署。

## 集成状态

- 实现提交 `d1b6e04` 与本次文档收口提交需由总控按顺序集成。
- 当前开发分支和线上正式版均未因本工作线发生发布变化；Git 提交不等于小程序发布或云函数部署。
- 常用名单、一键复办 UI、clone 埋点和历史修复继续留在后续独立任务。
