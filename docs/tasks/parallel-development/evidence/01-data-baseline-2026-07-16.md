# 工作线 01 数据基线执行报告（2026-07-16）

> 结论：`blocked_source_credentials`。分析工具与口径已落地，但当前独立 worktree 没有 We 分析凭据、缓存或赛事全量只读导出，不能生成当前线上数值。本文将“当前事实”“历史文档声称”“推断/建议”严格分开。

## 1. 当前事实

- 预期最近完整日：`2026-07-15`；预期窗口：最近 90 天与 180 天。
- 本次实际 We 分析覆盖：不可用（0 个可审计缓存文件）。
- 本次实际赛事数据库覆盖：不可用（0 条全量导出记录）。
- worktree 内不存在 `.env.local`、`.cache/wechat-access-token.json` 和 `data/we-analysis/`；进程环境也没有 We 分析或 CloudBase 凭据变量。
- 已用当前 worktree 启动微信开发者工具 CLI，会话绑定到本目录且 CLI 端口 `39421` 就绪；自动化端口 `39420` 在 60 秒内未就绪，因此没有执行数据库查询。
- 仓库没有全量云数据库只读导出器。`getMyPerformanceStats` 只覆盖当前用户的 finished 赛事，不能替代全量审计。
- 未读取主工作区配置，未请求用户在聊天中提供 secret，未执行任何远程写操作。

因此，下列当前指标均为“未计算”，不能写成 0：

- 4 周移动平均周有效完赛赛事数；
- 主理人 28 日复办率；
- 参与者 28 日再次加入率与转主理人率；
- 创建到开赛、开赛到首分、首分到完赛转化与耗时；
- 80% / 90% / 95% 赛事组合 Pareto；
- We 分析访问、页面、来源、分享和留存当前基线。

## 2. 已完成的可复跑能力

新增 `scripts/analysis/data-baseline-core.js` 与 `scripts/audit-product-data.js`：

- 读取当前 worktree 内的本地 JSON / JSON Lines 赛事导出，不连接云端、不调用写 API；
- 按 `_id` 去重并保留最新快照，显式报告坏时间、重复行、窗口外记录和守恒结果；
- 保留未知 mode、缺失人数/场地/场数和缺失 scheduler 元数据，不静默回填；
- 建立 `created → roster_ready → started → first_score → half_scores → all_scores → effective_completed → share_or_repeat_lower_bound` 单调漏斗；
- 固定严格“有效完赛”口径：已开赛、全部实际计划场均有合法非平局比分、`status=finished`、`rankings` 非空；
- 将 target-wins 等规则导致的 `canceled` finished 单列，不与普通数据损坏混在一起；
- 计算窗口内 first-observed 28 日主理人复办、参与者再次出现和参与者转主理人 proxy，排除管理员导入 guest；
- 按 `mode × playersCount × courts × totalMatches × presetKey × templateKey × engine` 输出数量、有效完成率、可观测首分到完赛耗时和累计覆盖率；
- 生成包含零周的周有效完赛序列及 4 周移动平均；
- 日/周窗口统一按 `Asia/Shanghai` 自然日，首尾不完整周标记 `isPartial` 且不进入 4 个完整周的移动平均；
- 公开输出只包含聚合数，维度值限制为受控标识符，并以源数据身份/资料 token 扫描作为写出前 fail-closed 检查；
- 输入和输出路径均限制在当前 worktree 内。

待取得安全本地数据后运行：

```powershell
node scripts/audit-product-data.js `
  --tournaments data/we-analysis/tournaments-export.json `
  --cutoff 2026-07-15 `
  --window-days 180 `
  --output-dir data/we-analysis/data-baseline
```

原始导出与本地分析目录继续由 `.gitignore` 隔离；只允许把人工审查后的脱敏聚合结果复制为 `01-*` 证据。

## 3. 数据库字段能力与硬限制

当前源码静态审计确认：

- `tournaments` 有 `createdAt` / `updatedAt`，但主表不持久化 `startedAt`、`finishedAt`、`joinedAt` 或 `addedAt`。
- 比分记录在 match 的 `scoredAt`；改分会覆盖该时间，所以只能代理当前最终比分的最后修改时点，不能证明首次完赛时点。
- `updatedAt` 会被资料同步、改分、重算排名等覆盖，不能代理开赛或完赛时间。
- `client_request_logs` 可为较新且带 `clientRequestId` 的 create/start/clone/delete 子集提供操作时间，但不含完整赛事配置、join 或 score 历史，必须先披露覆盖率才能用于校正。
- `shareActivityUpdatedAt` 只可为少量动态消息状态样本提供 finished 时间 proxy；`shareActivity*` 本身不是实际分享行为证据。
- `resetTournament` 会清空 rounds 和 scheduler 元数据并回到 draft；`deleteTournament` 物理删除赛事。当前集合漏斗存在 reset 丢历史与 survivor bias。
- `rankings` 在开赛时已非空；产品语义 `finished` 也允许 target-wins 下存在无比分 `canceled` 场，因此两者都不能单独代表严格有效完赛。
- 主动加入者与 guest 可在最终快照中区分，但认领、移除和 clone 会改写名单；无加入时间时，参与者 28 日指标只能是基于赛事 `createdAt` 的 survivor-based proxy。
- `templateKey` / `engine` 主要来自 JSON 字符串元数据，旧记录、reset、clone 或其他赛制可合法缺失；缺失不自动等于数据损坏，也不得填成 `custom`。

## 4. 历史文档声称（不可作为当前事实）

`docs/specs/growth-flywheel-optimization.md` 声称历史 We 数据最晚到 `2026-06-13`：

- dailyVisitTrend：2026-02-13 至 2026-06-13（121 天）；
- dailyRetain / dailySummary / visitDistribution：2026-02-12 至 2026-06-13（122 天）；
- visitPage：约 30 个采样日；userPortrait：5 个日期；
- 周数据最晚 2026-06-07，月数据最晚 2026-05。

这些原始缓存和被引用的详细分析报告从未进入 Git，当前 clean worktree 无法复验。历史文档中的 `0.1s share-entry 停留`、`5.7% 新用户次日留存`、`59.2% 会话来源`等只能标注为“历史文档声称”；其中“会话”来源也不能直接解释为单赛事分享转化。更早 v1.0 数据已被 v1.1 明确修正，不再使用。

## 5. 下游结论

### 事实

- 工作线 02 暂时没有可信的高频组合 Pareto，不能据此批量新增排阵模板。
- 工作线 04 不能靠现有 `growthTracker` 计算用户级 28 日指标：当前通道是 `console.info + wx.reportEvent` best-effort，payload 无用户标识，仓库也没有事件读取器或送达确认。
- 当前没有证据选择“最大漏斗掉点”，因此不应启动单点 UI 行为优化。

### 推断与建议

- 下一次只读审计应同时分页导出 `tournaments` 与可用的 `client_request_logs`，记录总数、分页上限、快照时间和截断状态。
- 事件管道后续应优先补可验证的 start/join/score/finish/clone/share 事实及幂等时间戳；这只是工作线 04 的输入建议，本工作线没有修改生产代码。
- 在拿到当前数据前，历史增长文档仅用于提出假设，不用于排序产品开发优先级。

## 6. 交付与远程操作声明

- 指标字典：`01-metric-dictionary.json`
- 数据质量：`01-data-quality-2026-07-16.json`
- 机器摘要：`01-product-data-summary-2026-07-16.json`
- Pareto 状态：`01-tournament-combination-pareto-2026-07-16.json`
- 验证记录：`01-validation-2026-07-16.md`

本次未 push、未创建 PR、未 preview/upload、未发布、未部署云函数、未创建集合、未写真实云数据。
