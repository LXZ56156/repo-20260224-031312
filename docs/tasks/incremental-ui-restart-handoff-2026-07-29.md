# 增量 UI 重启交接（2026-07-29，2026-08-08 更新）

> 2026-08-08 当前结论：本文件最初规定的“从 master 建立干净基线”已经完成。继续工作应从本分支当前产品实现 `c2f438a` 和 `docs/tasks/current.md` 出发；不要再次从 master 重建，否则会丢失之后逐项获批的独立打水增量。

## 1. 历史重启决定

2026-07-29 用户暂停下一代全面升级及 C3/Home 全面重设计，要求：

1. 回到线上产品基线，仅先叠加已经批准的 schedule 中央 `VS`/比分布局；
2. 不整体复用 `codex/ui-optimization-v2`、`nextgen-integration` 或 `nextgen-ui-redesign-20260724`；
3. 每次只处理一个页面或一个明确问题；浏览器先选方向，原生实现后必须用当前源码的真实微信 DevTools 图验收；
4. CTA、导航、文案、权限、业务流程、云写入和发布语义变化逐项确认。

该决定仍有效。历史 next-gen 代码、资产、浏览器稿、截图和 QR 只能作研究证据，不能成为当前产品输入或验收图。

## 2. 已完成的精确基线建立

| 项目 | 权威事实 |
|---|---|
| 线上/主分支 | `master` = `origin/master` = `5813ffc79f94c180fa5573eb25fb0d57f53b85df` |
| 原始批准 overlay | `38d6ea4e716ac3ffad6213fd21f1f6301a1dffd8` |
| 当前树等价 cherry-pick | `178e5ddbac108ff58a548bb016425c26e62b18bb` |
| stable patch-id | `2cf91c83878e94c9b39fb57694c5b2cf09c4028d` |
| overlay 产品文件 | `miniprogram/pages/schedule/index.wxml`、`index.wxss` |
| overlay 测试文件 | `tests/schedule.ui-copy.test.js` |

隔离分支从 `master@5813ffc` 建立后只先 cherry-pick 该 overlay；当时已验证 `miniprogram/` 仅两个 schedule 文件有差异、`cloudfunctions/` 零差异、聚焦测试及 `git diff --check` 通过。该白名单是“基线建立门槛”的历史证据，不再代表今天整个开发分支只能有这三份文件。

## 3. 基线后的逐项批准增量

| Commit | 范围 |
|---|---|
| `34193f1` | 无需创建比赛的独立打水账本、launch 入口及 `waterSession` |
| `ce73118` | 独立打水控制与限定页面使用的 Vant Weapp 构建产物 |
| `6da0cc5` | 长名单下更紧凑的胜负方选择，允许 1v1 |
| `6939688` | 手动/接龙添加、接龙预览及大名单搜索 |
| `ab1e6c5` | 受阻后单独完成的最小 Windows shell 工具适配 |
| `7c6ba81` | 页面恢复、轮询和 stale response 防护 |
| `3449cad` | 重复写入幂等、冲突刷新和操作 guard |
| `c2f438a` | quick-water CTA 与比赛“发起”CTA 横向对齐 |

这些提交都来自本轮逐点选择与确认。它们不会反向授权 Next-Gen、全面 Home 重做、全局设计系统或跨页面统一。

## 4. 当前产品硬边界

- 独立打水不依附 tournament；支持手动添加、接龙导入、邀请/认领、名单搜索、1v1 起的等人数“记一局”、直接加减 1–99 水和撤销上一条。
- 不需要 4 人才开始。
- 不提供用户可见的“结束 / 完成 / 另开账本”选项。云函数现存 `finish` 兼容分支不是 UI 授权，也不应在无审批时删除。
- launch 对齐只改变布局结构，不改变“开始记水”或“发起”的文案、路由和语义。
- 旧全面 UI 路线仍暂停；不得以“精简”“一致性”或“组件化”为由扩大页面范围。

完整产品合同见 `docs/specs/standalone-water-ledger.md`。

## 5. 后续每个 UI 点的闭环

```text
用户指定一个页面 / 一个明确问题
  → 明确保留项、可调整项和不动项
  → 浏览器给少量高质量近似方案
  → 用户选择并批准可见变化
  → 测试先行
  → 原生 WXML / WXSS 最小实现
  → 当前源码真实微信 DevTools 实图 + 主控人工检查
  → 用户确认
  → 必要的 320 / 390 / 430 与状态矩阵
  → 单独提交
```

证据边界：浏览器稿、旧截图、旧 QR、结构快照和纯 DOM 量测都不能代替当前源码 DevTools 实图；320/430 若只做数学或结构检查，必须明确标注，不能称为真实截图。

## 6. 工具与测试现状

- 当前 branch 只有 `npm run ui:screenshot`，没有历史后续分支的 `verify:*`、`screenshot:smoke`、`screenshot:diagnose`、`weapp:probe` 或 records alias；命令始终以当前 `package.json` 为准。
- 当前截图脚本不能证明 Git/worktree 绑定、窗口恢复、stale 像素或三帧一致性。端口也必须按会话验证并通过 `WEAPP_WS_ENDPOINT` 显式传入；详见截图工具文档。
- `c2f438a` 聚焦测试 11/11 通过，真实 launch 图与 DOM 横向几何已获用户确认。
- 当前全量测试不能写成绿色：`tests/squad.fairness.test.js` 的既有墙钟 deadline 波动可独立复现。必须如实保留失败记录，不能把“基线波动”写成“全量通过”。

## 7. 发布状态

- `waterSession` 仅在一次明确授权下完成部署并核验远端 hash；后续云部署仍需新授权。
- 2026-08-07 曾生成一次 preview QR，但早于最终 `c2f438a` 对齐，不是当前产品验收或线上证据。
- 当前 branch 无 upstream、未 push、未建 PR、未执行 `mp:upload` 或正式发布，也未写真实业务数据。
- commit、push、PR、preview QR、preview、upload、正式发布和云函数部署是不同动作，授权不可互相推导。

## 8. 下一会话入口

依次读取：

1. `AGENTS.md`
2. `docs/tasks/current.md`
3. 本文
4. `docs/tasks/incremental-ui-optimization-plan.md`
5. 涉及独立打水时读取 `docs/specs/standalone-water-ledger.md`

不要切换 canonical 主工作区分支，不要重做已完成的 master + overlay 建基线，也不要从旧分支重新搬运代码。先核验当前 worktree/branch/status，再等待用户给出下一个单点。
