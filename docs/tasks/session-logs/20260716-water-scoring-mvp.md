# 打水计分 MVP 验收日志 — 2026-07-16

## 工作边界

- 独立 worktree：`D:\projects(WIN)\badminton-miniapp-worktrees\water-mvp`
- 分支：`codex/roadmap-water-mvp`
- 实施基线：`70845c1688201f1b427aa6937efa9a904272d013`
- 用户已逐项批准任务 03 的九项产品矩阵；本任务分支获授权创建本地提交。
- 未执行 push、PR、preview/upload、发布、云函数部署或真实云数据写入。

## 已实现

- 在 `rules.water` 保存仅 `multi_rotate` 有效的开关和每名负方默认 `0 / 1 / 2` 瓶配置；历史/缺失/非法配置默认关闭。
- `submitScore` 将比分与最小 `match.water.unitsPerLoser` 快照放在同一次乐观锁写入中；同分同水幂等，同分异水需要持锁更新，正式排名算法不读取打水字段。
- 新增 `waterLedger` 纯派生账本，只从当前 `rounds` 全量计算赢水、请水、净水；修改比分或瓶数后旧结果自然消失。
- settings 增加打水开关，match 增加每局 `0 / 1 / 2` 选择，analytics 增加独立打水榜；未增加页面、导航或分享字段。
- 失败重试固定完整提交快照，避免刷新或继续编辑后混用新比分/旧瓶数；已完成比赛优先回显服务端打水快照。
- 旧客户端省略打水字段重试已完成比赛时保留原快照；pending 比赛仍按赛事默认值落库。
- 打水瓶数入口仅接受数值型整数或 `0 / 1 / 2` 数字字符串，布尔值、空白字符串、数组和对象均不会被隐式转换为合法瓶数。
- 已完成比赛只读重开时以服务端快照为准；持锁改分及版本冲突恢复期间以当前草稿为准，避免心跳或实时同步覆盖用户刚选择的瓶数。
- `miniprogram/pages/match/index.js` 的改动仅用于已批准瓶数选择器、草稿保存及冲突保留语义的必要页面事件接线，未新增页面、导航、文案范围或操作语义。

## 自动验证

- 任务文档指定聚焦回归：`83 pass / 0 fail`。
- 客户端、截图安全、克隆/重置等补充回归：`58 pass / 0 fail`；后续截图 fixture 专项：`14 pass / 0 fail`。
- 终审修复后的客户端、云契约、排名、锁、克隆/重置与截图矩阵合并聚焦回归：`133 pass / 0 fail`。
- `npm run check:cloud-common`：通过，9 个模板与 22 个云函数共享库一致。
- `npm run verify:full`：1200 项测试中 `1194 pass / 0 fail / 6 skipped`；deprecated API、cloud-common、lint、`git diff --check` 均通过。lint 为 `0 errors`，仅保留仓库既有 64 个 warning。

## 真实截图验收

通过 worktree 本地 Windows launcher 绑定微信开发者工具 `2.01.2510290`、基础库 `3.14.2`，协议探针返回 `App.getCurrentPage`。以下三页均完成三帧动态探针、DOM/文字、非空像素区域、时序一致性与窗口恢复校验：

- `settingsWater.png`：717×1384，159583 bytes。
- `matchWater.png`：717×1384，181088 bytes。
- `analytics.png`：717×1384，264860 bytes。
- runtime diagnostics：deprecated API warning 0，fake fixture sync error 0。

人工逐图确认开关和说明文案、比分与瓶数控件、提交 CTA、打水榜正负净水与列对齐均正常，无重叠、裁切或横向溢出。

## 待集成事项与残余风险

- 受影响且未来需要按发布流程部署的云函数：`updateSettings`、`submitScore`；本任务未部署。
- 本轮真实验收范围为微信开发者工具，没有进行实体手机兼容性复验，也没有读写真实云数据。
- 三张真实截图覆盖功能开启后的 settings、match、analytics；默认关闭及非 `multi_rotate` 的隐藏状态已由单测覆盖，但未另做独立真实截图。
- 正式集成仍需由主线维护者复核分支差异并决定合入、部署与发布时机。
