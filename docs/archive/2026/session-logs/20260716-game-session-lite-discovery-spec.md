# 2026-07-16 组局 Lite discovery / spec

## 用户目标

在独立 worktree 的 P06 工作线上，只完成组局 Lite 的领域模型、状态机、权限、并发/幂等、AA 整数分和后续实施拆分；禁止生产实现、真实数据和远程/发布操作，并在验证后本地提交规格成果。

## 基线核对

- worktree：`D:\projects(WIN)\badminton-miniapp-worktrees\group-session-lite`
- branch：`codex/roadmap-group-session-lite`
- 启动 HEAD：`70845c1`
- 启动状态：工作区干净
- 产品差异基线：线上 `master@5813ffc`

## 完整阅读与只读审计

完整阅读：

- `AGENTS.md`
- `docs/tasks/current.md`
- `docs/archive/2026/plans/parallel-development-roadmap.md`
- `docs/tasks/parallel-development/06-game-session-lite-spec.md`
- `docs/context/architecture.md`
- `weapp-regression-guard` 与 `weapp-cloud-contract-audit` 的完整技能说明及相关 reference

只读审计了现有 create/join/share/clone/permission 契约和最相关测试，结论用于约束规格：

- 复用云端 OPENID、serverDate、统一 envelope、事务请求日志和稳定 conflict；不复用昵称认领、整组 players 覆写或本地 busy 伪幂等。
- 分享必须保持“落地只查看、显式 CTA 才写入”，并使用独立 `sessionId`。
- `cloneTournament` 不保留其他真实用户身份，`createTournament` 会自动把 creator 加入 players，二者都不能直接承担 present 名单转换。
- 组局权限必须与赛事 score-entry 权限隔离。

## 本次交付

- 新增 `docs/specs/game-session-lite-discovery-spec.md`。
- 规格覆盖范围/非目标、两个集合模型与索引、派生计数重建、生命周期/报名/到场/删除状态机、权限矩阵、稳定错误码、每个核心命令的事务和幂等边界、AA 守恒算法、分享/隐私/滥用、逐状态用户可见审批矩阵、Phase 0 审批门槛与四阶段实施拆分、验收用例、未决问题和残余风险。
- 更新 P06 工作线文档状态和成果链接，不修改总路线图或 `docs/tasks/current.md`。

## 关键规格决策

- `game_sessions` 与 `session_signups` 独立于 tournament；一人一局一条 signup。
- 候补按 `queueNo ASC, _id ASC`，取消重报名获得新 cycle 与队尾 queueNo。
- 最后名额、取消补位、到场计数和转赛事均以真实事务保护，缺少事务能力时 fail closed。
- mutation 必须使用完整 request key + keyed payload MAC；转换再以不可替换的 `convertedTournamentId/sourceSessionRef` 做跨 requestId 领域幂等。
- AA 只计算：非负安全整数分，按 present 的稳定顺序分余数，不创建账本或支付状态。
- 转赛事 roster 严格等于 present signups；主理人不自动加入，但该模式需在实现前验证现有赛事全链路。
- 两个新集合必须 cloud-only；首版只收昵称、不收头像；现有 tournament 身份投影和硬删除路径未安全改造前禁止开放转换。
- 删除先原子认领 `deletionState`；redacted tombstone 保留不可逆创建/查询锚点，清除旧业务日志，阻止旧 create key 复活或回放已删除 ID。

## 验证

验证结果：

- [x] AA 整数分：边界值 + 200,000 个确定性随机用例，共 200,320 组；总和恒等、最大差 1、同输入同结果。
- [x] 状态转换与任务卡九类必测场景人工走查；三轮只读交叉审查后无剩余 P0/P1。
- [x] 三份文档相对链接、Markdown 表格列数与关键契约标记检查通过。
- [x] P06 相关 create/join/share/clone/auth/permission/cloud-common 聚焦回归：138/138 通过。
- [x] `npm run check`：deprecated wx API 与 9 个模板/22 个云函数 shared-common 一致性通过。
- [ ] `npm run verify:full`：已执行；全量测试 1,133 项中 1,123 通过、6 跳过、4 失败。四个失败均因 worktree 未安装任务禁止新增的 `canvas` 模块（`share-card`、`share-poster`、`share-timeline-card`、`ui-screenshot-safety`），命令因此未继续到 lint/diff。
- [ ] `npm run lint`：已执行但 worktree 未安装 `eslint`，按任务禁止安装依赖，无法完成。
- [x] `git diff --cached --check` 通过；暂存差异严格只有 P06 规格、P06 任务卡和本 session log 三份文档（850 insertions、1 deletion）。

## 边界声明

未修改生产代码、测试或配置；未创建页面、云函数、集合、索引或依赖；未读取/写入真实数据；未执行 preview/upload、发布、云函数部署、push、PR 或 merge。
