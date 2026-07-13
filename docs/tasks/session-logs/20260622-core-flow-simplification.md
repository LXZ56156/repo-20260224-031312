# 2026-06-22 核心流程简化与 UI 重构会话日志

## 启动记录

- 原始分支：`master`
- 原始提交：`5813ffc`
- 启动工作区：干净，无用户未提交改动
- 工作分支：`feature/core-flow-simplification`
- 远程操作：禁止 push、部署和上传
- Goal：持续执行至全量测试、真实截图、代码验收、视觉验收与返工全部完成

## 角色日志

### 总控

- 已读取任务附件、仓库规则、架构、当前任务、经验、增长方案、截图流程及回归守卫。
- 已建立阶段所有权，避免共享模块和同一页面并发编辑。

### 产品流程审计

- 状态：完成。
- 当前创建路径多 1 页/1 次点击；lobby 同时出现 hero、准备清单、主任务、新人引导、名单、管理面板和比赛信息；match 双方名称重复；finished 结果在 ranking/analytics 重复；home/share-entry 有重复增长文案和竞争 CTA。
- 建议：launch 直接创建；lobby 只保留名单和状态主 CTA；导航改为“赛事 | 对阵 | 排名”；match 合并比分舞台；ranking 成为唯一结果页；analytics 旧路由重定向；home/share-entry 按状态减法。
- 风险：资料/登录门禁、clientRequestId、角色权限、主动加入、stale response、广告频控和旧链接。

### 视觉审计

- 状态：首轮只读审计完成。
- P0：既有 shareDraft 截图被透明/加载层覆盖；既有 home 原始图低于 20KB。
- P1：lobby 引导遮蔽主任务；share-entry 摘要/CTA 重复；ranking 分享入口过多；analytics 卡片与数据重复；home finished 文案堆叠；schedule finished 嵌套提示卡。
- P2：胶囊/卡片/阴影过密；卡片套卡片；emoji 与长文本覆盖不足。

### 分阶段执行

- 阶段 1：完成。launch 在资料门禁通过后直接调用 `createTournament`，保留 actionGuard、clientRequestId 重试复用和旧 create 路由兼容；聚焦测试 6/6。
- 阶段 2：完成。lobby 调整为赛事摘要、成员名单、唯一下一步动作、折叠管理区；未设置参数时保存安全默认值后开赛，保存失败不会误开赛；聚焦测试 24/24。
- 阶段 3：完成。一级导航统一为“赛事｜对阵｜排名”；录分页删除重复对阵卡，将双方头像、姓名和比分合入同一舞台；录分锁、提交、超时恢复和权限聚焦测试 21/21。
- 阶段 4：完成。ranking 成为实时/最终排名唯一正式结果页；旧 analytics 路由一次重定向至 ranking，旧复盘计算与样式已清理；复制比赛进入“更多”，原 analytics 广告频控键迁至榜单之后；聚焦测试 50/50。
- 阶段 5：完成。home 在赛事数达到 4 时才显示排序/筛选，finished 卡只保留“查看排名”和次级“再办一场”；share-entry 按 draft/running/finished 只保留名单或排名预览与一个主 CTA；显式加入、身份超时和 A/B 队流程不变。
- 阶段 6：完成。统一页面留白、卡片表面、按钮主次和列表密度；删除 schedule finished 嵌套双 CTA、lobby 不可见准备清单数据和旧 analytics UI；截图矩阵更新为 13 个必需状态。
- 截图链路：新版 DevTools 宿主将 simulator shell 设为隐藏且容器宽度归零，导致 `App.captureScreenshot` 空白/挂起。通过宿主 renderer 定位并恢复真实 simulator surface 后，官方截图调用恢复；未使用 mock/layout 图。

### 独立代码验收

- 状态：完成，无阻断问题。
- 三赛制、draft/running/finished、管理员/参与者/观众/裁判、显式加入、创建幂等、录分锁与重试、排名一致性、stale response、旧路由、广告频控均由全量测试覆盖。
- 返工：更新 3 个旧 UI 断言；补 analytics 缺失 ID 回首页测试；删除 lobby 不可见 checklist 构建逻辑；更新广告执行单和 analytics 兼容页标题。

### 独立视觉验收

- 状态：完成。
- 第一轮：逐张打开 13 张 PNG；发现 P1 1 项，排名“更多”显示为“更…”。修复按钮宽度/内边距，并恢复 share-entry 长赛事名省略保护。
- 第二轮：重新运行完整矩阵并逐张打开；P0=0、P1=0。页面主任务、单一实心 CTA、文本完整性、间距、横向溢出和遮挡均通过。

## 验证记录

| 时间 | 命令/用例 | 结果 | 备注 |
|---|---|---|---|
| 2026-06-22 | `git status --short --branch` | 通过 | `master...origin/master`，工作区干净 |
| 2026-06-22 | 创建任务分支 | 通过 | `feature/core-flow-simplification` |
| 2026-06-22 | `node --test tests/*.test.js` | 通过 | 1108/1108，0 失败，27.16s |
| 2026-06-22 | `npm run check` | 通过 | deprecated API 与 cloud common sync 均通过 |
| 2026-06-22 | `npm run lint` | 通过 | 0 error，64 条既有 warning |
| 2026-06-22 | DevTools doctor/snapshot | 通过 | runtime 与 DOM 可访问，端口 39420 |
| 2026-06-22 | 新基线 `npm run ui:screenshot` | 阻塞 | WSL/Windows 本机 `App.captureScreenshot` 均超时；simulator webview 空白，未用 mock 替代 |
| 2026-06-22 | launch 直接创建聚焦测试 | 通过 | 6/6 |
| 2026-06-22 | lobby 结构与单主动作聚焦测试 | 通过 | 24/24 |
| 2026-06-22 | 主导航、录分与权限聚焦测试 | 通过 | 21/21 |
| 2026-06-22 | ranking、analytics 兼容与广告迁移聚焦测试 | 通过 | 50/50 |
| 2026-06-22 | home/share-entry 与全局视觉聚焦测试 | 通过 | 状态 CTA、渐进筛选、旧链接和样式契约通过 |
| 2026-06-22 | 第一轮 `npm run ui:screenshot` | 通过 | 13/13；实际逐图检查，发现“更多”截断 P1 |
| 2026-06-22 | 排名按钮与长标题返工测试 | 通过 | `list-density-motion.test.js` 8/8 |
| 2026-06-22 | 第二轮 `npm run ui:screenshot` | 通过 | 13/13；29–134KB；实际逐图检查，P0/P1=0 |
| 2026-06-22 | `node --test tests/*.test.js` | 通过 | 1108/1108，0 失败，25.66s |
| 2026-06-22 | `npm run check` | 通过 | deprecated API 与 cloud common sync 均通过 |
| 2026-06-22 | `npm run lint` | 通过 | 0 error，59 warning；比基线减少 5 条本次死代码 warning |
| 2026-06-22 | `git diff --check` | 通过 | 无空白错误 |
| 2026-06-22 | `./scripts/run-targeted-tests.sh create lobby permission` | 不适用 | 仓库不存在该脚本，改用实际测试文件执行 `node --test` |

## 问题与返工

- 工具问题：已解决 simulator surface 归零造成的 screenshot RPC 空白/挂起，并保留真实 PNG 证据。
- 视觉返工：排名“更多”按钮由 132rpx 调整为 144rpx 并显式设置 padding，第二轮完整截图显示文字完整。
- 代码返工：旧准备清单虽不渲染仍在 ViewModel 计算；现已删除相关函数、初始 state 与 patch 字段。

## 云函数与外部操作

- 云函数改动：无。
- 部署/上传/push：未执行。

## 2026-07-13 Closure Addendum

- This log remains an unchanged historical account of what was implemented and technically verified on `feature/core-flow-simplification`.
- The user later rejected the branch's overall UI and workflow direction: it removed too much information, visual hierarchy, confirmation, review, and sharing context.
- The branch is retired as a product baseline. No remaining repair work will continue on it.
- A new branch, `codex/ui-optimization-v2`, starts from `master@5813ffc`. It preserves the master product flow and extracts only the schedule-card layout with centered `VS` / finished score.
- This addendum records the product decision; it does not rewrite the historical test or screenshot evidence above.
