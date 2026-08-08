# 增量 UI 优化计划

> 状态：初始 master + schedule overlay 基线已完成；独立打水与 launch CTA 对齐已逐项实现并确认至 `c2f438a`。继续等待用户下一个明确 UI 点。

## 1. 产品与发布基线

- 线上版本仍对应 `master` = `origin/master` = `5813ffc79f94c180fa5573eb25fb0d57f53b85df`。
- 当前开发路线位于隔离分支 `codex/water-court-vant-spike-20260807`；产品实现提交为 `c2f438a`，未 push、未 PR、未正式发布。
- 2026-07-29 的初始 overlay 是 `38d6ea4`，在当前树中等价为 `178e5dd`；两者 patch-id 相同。
- Git 提交、远端 push、preview QR、preview、`mp:upload`、正式发布、云函数部署和真实数据写入必须分别描述、分别授权。

## 2. 路线边界

下一代全面升级、C3/Home 全面重做和 next-gen ROADMAP 继续暂停。`codex/ui-optimization-v2`、`nextgen-integration`、`nextgen-ui-redesign-20260724` 及其代码、资产、截图、浏览器稿只作历史证据，不得整体合并、迁移或恢复为当前视觉基线。

当前路线允许的用户可见范围只有已经逐项批准的两部分：

1. schedule 对阵卡中央 `VS`/比分布局；
2. 独立打水入口、页面及其后续逐点交互/视觉优化，包括最终 launch CTA 对齐。

任何新的页面、CTA、导航、文案、权限、流程、云写入、分享或发布语义仍需新的明确批准。

## 3. 历史基线门槛（已完成）

初始新 worktree 曾要求：

- `git diff master -- miniprogram` 只出现 schedule 的 WXML/WXSS；
- `git diff master -- cloudfunctions` 为空；
- `node --test tests/schedule.ui-copy.test.js` 与 `git diff --check` 通过；
- 用当时当前源码重新生成真实 `scheduleRunning` 图，不沿用旧截图、QR、浏览器稿或 records。

这些是 2026-07-29 的建基线验收，不是当前完整分支的持续 diff 白名单。基线之后新增的 water、launch、Vant 和 `waterSession` 差异均来自后续用户逐点批准。

## 4. 当前批准范围

| 范围 | 当前合同 |
|---|---|
| schedule | pending 显示中央 `VS`，finished 在相同位置显示比分；名称最多两行，不改录分/路由/权限 |
| launch | 保留原完整比赛赛制；增加“快速打水”入口；其 CTA 与比赛“发起”CTA 同列对齐 |
| water page | 独立账本、手动/接龙/邀请添加、搜索、1v1 起等人数记局、直接加减、最近记录与撤销 |
| water sync | 8 秒补拉、回前台追平、stale response 防护、version conflict 刷新、client request 幂等 |
| cloud | 新增 `waterSession` 与 `waterSessions` 集合合同；一次部署已获授权并完成 |
| dependency | Vant Weapp 1.11.7 构建产物仅服务本轮原生组件使用，不授权全站重写 |
| tooling | `ab1e6c5` 是受 Windows shell 阻塞后独立提交的最小适配，不代表迁入旧完整工具链 |

独立打水详细语义以 `docs/specs/standalone-water-ledger.md` 为准。产品硬决定：不需要凑满 4 人；水数原生滚轮 1–99、默认 1；不提供用户可见结束选项。

## 5. 每个新 UI 点的执行闭环

```text
一个页面 / 一个明确问题
  → 明确保留项与可调整项
  → 浏览器中给多个高质量近似方案
  → 用户选择并批准
  → 测试先行
  → 原生 WXML / WXSS 最小实现
  → 当前源码真实 DevTools 实图
  → 用户确认
  → 必要的 320 / 390 / 430 与状态验证
  → 单独提交
```

硬规则：

- 浏览器稿只用于方向选择，不能作微信小程序最终验收。
- 视觉与流程不混批；不默认删除信息、入口、确认步骤、复盘能力或现有状态。
- 不自动建立全局设计系统，不跨页面统一，不继续 Next-Gen/C3。
- 涉及 UI 时加载 `frontend-design` 和 `weapp-regression-guard`；浏览器近似稿再加载 `browser-router`。
- 当前源码实图必须由主控逐张检查显著性、主次层级、文字稳定、对齐、裁剪、遮挡、溢出和任务相关状态。

## 6. 证据等级

| 证据 | 可证明 | 不可证明 |
|---|---|---|
| 浏览器近似稿 | 方向与方案选择 | 原生小程序像素和交互验收 |
| DOM/结构/数学量测 | 选择器、几何关系、rpx 换算 | 像素新鲜度、视觉质感、真实设备状态 |
| 当前源码 DevTools 图 | 指定会话的真实渲染像素 | 未单独截图的尺寸/状态、正式发布 |
| preview QR | 某一 preview 构建可扫码 | 当前 HEAD、`mp:upload`、正式线上版本 |
| Git commit/push | 源码历史/远端传输 | 微信小程序发布、云部署或真实数据状态 |

320/390/430 若未分别生成真实 DevTools 图，必须写“结构/数学等效检查”，不得用“三档截图通过”表述。

## 7. 测试与提交门槛

- 先运行与改动直接相关的结构、逻辑和工具测试，再按风险运行全量测试、`npm run check`、`npm run lint` 和 `git diff --check`。
- 全量失败只有在未改依赖闭包或 pre-change 基线可重复出现时才能标为既有波动；必须记录文件、失败数、复跑方式和结果。
- 基线波动不等于通过。只有用户看见完整事实并明确接受例外后，才能提交该批次。
- UI 点经真实图确认后单独提交；文档、工具和产品变更不混成一个无边界提交。

## 8. 当前已知待审批风险

- 共享 `.btn-sm` 高度为 `68rpx`，在 320/390/430 下约为 `29.01/35.36/38.99px`，低于 44px 触达建议。`c2f438a` 只修横向对齐，没有被授权扩大为全局按钮尺寸调整。
- 当前截图脚本默认 endpoint 已过时，且缺少 exact-worktree receipt、窗口恢复、stale 检测和事务性 promotion。工具事实见 `docs/tools/weapp-ui-screenshot-workflow.md`；不得因为工具较弱而降低原生实图门槛。
- `tests/squad.fairness.test.js` 存在可复现的墙钟 deadline 波动；在修复前不得宣称当前全量测试绿色。
