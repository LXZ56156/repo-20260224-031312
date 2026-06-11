# 排阵优化执行记录

- 日期: `2026-05-05`
- 对应检查文档: `docs/scheduler-fairness-check-2026-05-05.md`
- 刷新后的总审计: `docs/scheduler-full-audit.md`
- 执行范围: `multi_rotate`、`squad_doubles`
- 未改范围: 页面结构、页面文案、设置页默认选择、多人转默认场次

## 已执行项

### P1: squad_doubles total_rounds 复用质量搜索

变更:

- `total_rounds` 不再常态走 `greedy-total-rounds`。
- 将目标轮数转换为 `targetMatches = targetRounds * effectiveCourts`。
- 在目标总场数内复用 beam / deterministic 排阵质量路径。
- 仅当质量搜索无法给出完整赛程时再降级为 `greedy-fallback`。

影响:

- `total_rounds` 和等价 `total_matches` 的质量路径对齐。
- 修复优化前发现的 `total_rounds` 出场 spread excess 风险。
- `schedulerMeta.executionProfile` 从常态 greedy 回到 `beam-quality` / `beam-guarded`。

### P1: total_rounds 有效场次校验

变更:

- `startTournament` 和 `updateSettings` 在校验 `squad_doubles + total_rounds` 时，按实际可生成场次计算:
  - `effectiveCourts = min(requestedCourts, floor(squadA / 2), floor(squadB / 2))`
  - `scheduledMatches = targetRounds * effectiveCourts`
- 最大可选场次校验使用上述有效场次，而不是直接使用输入的 `totalMatches`。

影响:

- 设置保存与开赛前校验的口径与真实排阵输出一致。
- 当 `total_rounds * effectiveCourts` 超过可支持上限时，会提前拒绝。

### P1/P3: 固化审计与回归

变更:

- `scripts/scheduler-scenario-common.js` 增加 `squad_total_rounds_audit` 场景。
- 全量 scheduler 矩阵从 `990` 扩展到 `1038`。
- `docs/scheduler-full-audit.md` 增加 `squad_doubles total_rounds matrix`。
- `docs/scheduler-full-audit.md` 增加 `multi_rotate 默认/可选场次质量` 段。
- 新增/更新测试覆盖:
  - `total_rounds` 质量路径不退化到 greedy。
  - `total_rounds` 有效场次校验。
  - `squad_total_rounds_audit` 纳入审计矩阵。
  - `multi_rotate` 默认档质量守卫。

## 最新审计结果

`docs/scheduler-full-audit.md` 当前结果:

| item | result |
| --- | --- |
| 矩阵场景数 | `1038` |
| matrixWarnings | `0` |
| representativeWarnings | `0` |
| failures | `0` |
| `squad_doubles total_rounds` 场景 | `48` |
| `total_rounds` greedyFallbackRatio | `0/48 (0%)` |
| `multi_rotate` 默认/可选 case | `60` |
| `multi_rotate` preset 行数 | `180` |
| `4-10p` 默认档搭档全覆盖 | `10/10` |
| `multi_rotate` 默认档 exactRepeatExcess | `0` |
| `multi_rotate` 默认档 playSpreadExcess | `0` |

## 暂缓项

### P2: 小队转 repeat excess 调权

暂缓原因:

- 当前没有 failure/warning。
- 该项会改变部分场景的配对排序，属于更高风险算法取舍。
- 需要单独验证是否会牺牲 `playSpreadExcess=0`、`exactRepeatExcess=0`、完整输出。

### P2: 大人数多人转覆盖优先默认值

暂缓原因:

- 直接改默认场次会改变用户默认赛程长度，属于用户可见默认行为变更。
- 本次只把 `default vs highest coverage preset` 纳入报告，不改变默认选择。

## 验证命令

已运行:

```bash
node --test tests/multi-rotate-recommendation-rationality.test.js tests/scheduler-full-audit-report.test.js
npm run report:scheduler-full-audit
npm run audit:scheduler-scenarios
git diff --check
npm run check
node --test tests/*.test.js
```

结果:

- `npm run report:scheduler-full-audit`: `scenarios=1038 warnings=0 failures=0`
- `npm run audit:scheduler-scenarios`: `scenarios=1038 warnings=0 failures=0`
- `git diff --check`: pass
- `npm run check`: pass
- `node --test tests/*.test.js`: `869` pass / `0` fail
