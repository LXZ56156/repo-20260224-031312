# 排阵算法审计报告

日期：2026-04-06

## 审计范围

- `multi_rotate` / `doubles` / `mixed_fallback`
  - `cloudfunctions/startTournament/rotation.js`
  - `cloudfunctions/startTournament/rotationDoublesEngine.js`
- `squad_doubles`
  - `cloudfunctions/startTournament/scheduleModes.js`
  - `cloudfunctions/startTournament/squadDoublesEngine.js`
- `fixed_pair_rr`
  - `cloudfunctions/startTournament/scheduleModes.js`
- 相关入口与参数层
  - `cloudfunctions/startTournament/index.js`
  - `cloudfunctions/startTournament/logic.js`
  - `cloudfunctions/updateSettings/logic.js`
  - `miniprogram/pages/settings/settingsViewModel.js`
- 相关测试
  - `tests/rotation*.test.js`
  - `tests/squad*.test.js`
  - `tests/fixed-pair*.test.js`
  - `tests/mode-semantics.test.js`

## 当前实现概览

### 1. 多人转 `multi_rotate`

- 主入口：`generateSchedule()`，位于 `cloudfunctions/startTournament/rotation.js:1181`
- `mode === doubles` 时优先走 `rotationDoublesEngine.resolveRuntimeSchedule()`，命中模板则直接返回模板结果。
- 未命中模板或运行时预算不足时，会退到 beam / coverage / legacy 路径。

### 2. 小队转 `squad_doubles`

- 主入口：`buildSquadSchedule()`，位于 `cloudfunctions/startTournament/scheduleModes.js:196`
- `total_matches` 优先走 `squadDoublesEngine`。
- `total_rounds` 当前直接走 greedy fallback，不走 beam。
- `target_wins` 预生成 `2 * target - 1` 场，后续在 `submitScore` 阶段提前取消未打完的场次。

### 3. 固搭循环赛 `fixed_pair_rr`

- 主入口：`buildFixedPairSchedule()`，位于 `cloudfunctions/startTournament/scheduleModes.js:319`
- 采用 Berger 风格轮转，支持奇数队伍自动 BYE。
- 引擎本身支持重复循环；`cycleIndex > 0` 时通过旋转非锚点队伍改变重复循环的顺序。

## 当前存在的问题

### P1. `mixed_fallback` / `allowOpenTeam` 在实际开赛链路中基本不可达

#### 现象

- 全局业务模式会把 `mixed_fallback` 和 `doubles` 归一成 `multi_rotate`：
  - `miniprogram/core/mode.js:9-13`
  - `cloudfunctions/startTournament/lib/mode.js:9-13`
- 开赛前校验把 `allowOpenTeam` 强制写死为 `false`：
  - `cloudfunctions/startTournament/logic.js:62-64`
- 开赛真正调用多人转引擎时，固定传入的是 `mode: 'doubles'`，而不是把业务层的 `mixed_fallback` 传下去：
  - `cloudfunctions/startTournament/index.js:99-111`

#### 影响

- `rotation.js` 里整套 `mixed_fallback`、`allowOpen`、`typeTargets`、`OPEN` 分支仍在维护，但生产链路几乎走不到。
- `tests/rotation.mixed.test.js:23-66` 验证的是引擎裸调用能力，不是实际开赛能力。
- 这会造成“测试通过但产品实际上不可用”的错觉。

#### 复现依据

本地执行：

```bash
node - <<'NODE'
const { validateBeforeGenerate } = require('./cloudfunctions/startTournament/logic');
console.log(validateBeforeGenerate({
  players: [
    { id: 'p1', gender: 'male' },
    { id: 'p2', gender: 'male' },
    { id: 'p3', gender: 'female' },
    { id: 'p4', gender: 'unknown' }
  ],
  totalMatches: 1,
  courts: 1,
  mode: 'mixed_fallback',
  allowOpenTeam: true
}));
NODE
```

结果显示：

- `mode` 被归一成 `multi_rotate`
- `allowOpenTeam` 被固定为 `false`

#### 解决方案

- 方案 A：如果产品已经不准备继续支持 `mixed_fallback / OPEN`，直接删除这条算法分支、相关测试和元数据，降低维护成本。
- 方案 B：如果仍要支持，就不要用业务模式归一规则覆盖调度模式。
  - 新增独立的 `schedulerMode`
  - 开赛入口显式下传 `mixed_fallback`
  - `allowOpenTeam` 不要在校验层强制归零

### P2. 固搭重复循环能力在 UI / 设置 / 开赛三层定义不一致

#### 现象

- 开赛校验允许 `fixed_pair_rr` 最高到 `10 * C(n,2)`：
  - `cloudfunctions/startTournament/logic.js:74-78`
- 但设置保存层只允许到 `C(n,2)`：
  - `cloudfunctions/updateSettings/logic.js:92-101`
- 页面表单同样只展示到 `C(n,2)`：
  - `miniprogram/pages/settings/settingsViewModel.js:116-141`

#### 影响

- 引擎能力和产品配置能力不一致。
- 已有测试明确验证了重复循环：
  - `tests/fixed-pair.scheduling.test.js:56-95`
  - `tests/fixed-pair.edge.test.js:68-80`
- 但用户通过正常设置页无法把场次配置到重复循环范围。

#### 复现依据

4 支固搭队伍时，本地执行得到：

```json
{
  "settingsMaxMatches": 6,
  "startMaxMatches": 60,
  "updateMaxMatches": 6
}
```

#### 解决方案

- 把“固搭最多支持几轮循环”提炼成单一常量，例如 `FIXED_PAIR_MAX_CYCLES`。
- `settingsViewModel`、`updateSettings`、`startTournament` 共用同一份上限计算函数。
- 若产品上只想支持单循环，则反向收敛：删掉重复循环代码和对应测试，避免能力漂移。

### P3. 固搭模式的 `fairness` 与 `schedulerMeta` 存在失真

#### 现象 1：`fairness.playSpread` 不是队伍出场 spread

- 当前实现统计的是“每一组对阵出现次数的 spread”，不是“每支队伍出场次数的 spread”：
  - `cloudfunctions/startTournament/scheduleModes.js:386-397`
- 这会在部分截断场次下误报“公平”。

#### 复现依据

5 队、7 场时，本地执行得到：

```json
{
  "fairness": {
    "playSpread": 0,
    "totalMatches": 7,
    "uniquePairs": 7
  },
  "play": {
    "team2": 2,
    "team5": 3,
    "team3": 4,
    "team4": 2,
    "team1": 3
  },
  "actualTeamPlaySpread": 2
}
```

也就是说，元数据声称 spread 为 0，但真实队伍出场 spread 为 2。

#### 现象 2：`schedulerMeta.logicalRounds` 记录成了实际切分后的轮次数

- 当前返回值直接写 `logicalRounds: rounds.length`
  - `cloudfunctions/startTournament/scheduleModes.js:410-415`
- 但 `rounds.length` 是切过场地后的实际轮数，不是 Berger 逻辑轮数。

#### 复现依据

6 队、15 场、2 片场地时，本地执行得到：

```json
{
  "schedulerMeta": {
    "logicalRounds": 10,
    "cycles": 1
  },
  "actualLogicalRoundCount": 5,
  "actualRoundCount": 10
}
```

#### 影响

- 诊断字段会误导后续调优、日志分析和 QA 判断。
- 当前测试只验证字段存在，不验证语义正确：
  - `tests/fixed-pair.scheduling.test.js:102-114`

#### 解决方案

- `fairness.playSpread` 改为真实队伍出场次数 spread。
- 如果还需要“对阵重复度 spread”，新增独立字段，例如 `matchupRepeatSpread`。
- `schedulerMeta.logicalRounds` 改为 `new Set(matches.logicalRound).size`，实际切分轮次可单独记录为 `materializedRounds`。

### P4. 固搭开赛缺少防御性去重校验，脏数据会生成非法对阵

#### 现象

- 队伍管理链路其实已经有去重/去脏逻辑：
  - `cloudfunctions/managePairTeams/logic.js:48-69`
  - `cloudfunctions/managePairTeams/logic.js:105-116`
- 但开赛时没有复用这份校验。
- `buildFixedPairSchedule()` 只检查 `playerIds.length === 2` 且成员存在，不检查不同队之间是否共享成员：
  - `cloudfunctions/startTournament/scheduleModes.js:326-335`

#### 影响

- 一旦数据库里出现手工写入、历史脏数据或迁移残留，就可能排出“同一名球员同时在 teamA 和 teamB”的非法比赛。

#### 复现依据

构造重叠队伍后，本地得到如下非法比赛：

```json
{
  "unitAId": "t1",
  "unitBId": "t2",
  "teamA": ["p1", "p2"],
  "teamB": ["p2", "p3"]
}
```

#### 解决方案

- 在 `validateBeforeGenerate()` 或 `buildFixedPairSchedule()` 内复用 `sanitizeExistingTeams()` 的约束思想。
- 明确校验：
  - 队伍 ID 唯一
  - 队伍成员全局不重叠
  - 队伍成员数必须为 2
- 发现脏数据时直接阻止开赛，并返回结构化错误码。

### P5. legacy / mixed 路径缺失精确对阵覆盖诊断

#### 现象

- `generateLegacyScheduleOnce()` 返回的 `playerStats` / `fairness` 不包含 `uniqueMatchupCount` 与 `totalUniqueMatchups`：
  - `cloudfunctions/startTournament/rotation.js:724-754`
- `schedulerMeta` 最终又依赖这些字段回填：
  - `cloudfunctions/startTournament/rotation.js:1307-1345`

#### 影响

- 一旦落到 legacy 路径，`schedulerMeta.uniqueExactMatchupCount` 和 `schedulerMeta.totalUniqueMatchups` 会变成 0。
- 这对运行时诊断、埋点分析和跨引擎对比都不可靠。

#### 复现依据

`mixed_fallback` 裸调用结果：

```json
{
  "engine": "legacy",
  "uniqueExactMatchupCount": 0,
  "totalUniqueMatchups": 0,
  "matchTypeCounts": {
    "MX": 6,
    "MM": 0,
    "FF": 0,
    "OPEN": 0
  }
}
```

#### 解决方案

- 在 legacy 路径补齐 exact-matchup 统计。
- `objective`、`playerStats`、`fairness`、`schedulerMeta` 使用同一套字段来源，避免不同引擎各写一套。

## 可优化点

### 1. 把“业务模式”和“调度模式”拆开

- 现在 `normalizeMode()` 同时承担 UI 语义和调度语义，导致 `mixed_fallback` 这种能力只能在引擎侧裸调。
- 建议引入：
  - `businessMode`
  - `schedulerMode`
- 这样可以保留业务层文案稳定性，同时让算法能力单独演进。

### 2. 把场次数上限逻辑集中到单模块

- 目前至少有三套：
  - `startTournament/logic.js`
  - `updateSettings/logic.js`
  - `settingsViewModel.js`
- 建议抽成共享模块，避免再次出现“引擎支持 10 倍循环，UI 只给 1 倍循环”的漂移。

### 3. 为固定搭档补“元数据正确性”测试，而不只是“字段存在”测试

- 当前测试更偏向结构存在性。
- 建议新增：
  - 部分截断场次时的真实队伍出场 spread 断言
  - 多场地下 `logicalRounds` 与 `materializedRounds` 的断言
  - 脏 `pairTeams` 阻止开赛的断言

### 4. 为 runtime 调度补一份统一的审计脚本

- 建议增加例如 `scripts/audit-scheduler.js`，自动输出：
  - 命中模板比例
  - beam / legacy / greedy 命中比例
  - unique matchup 覆盖率
  - play spread / max consecutive play
  - 运行耗时分布

### 5. squad 的 `total_rounds` 可以评估是否值得补 beam 支持

- 当前 `total_rounds` 直接走 greedy fallback：
  - `cloudfunctions/startTournament/scheduleModes.js:218-220`
- 这不一定是 bug，但会导致同一个模式在不同结束条件下质量模型不一致。
- 若后续用户对“小队转打满 N 轮”的公平性敏感，可以把它列入下一轮优化。

### 6. 长尾非模板排阵的性能阈值在全量测试下不稳定

- 当前 `tests/rotation.performance.test.js` 中的长尾场景要求：
  - `17` 人
  - `12` 场
  - `1` 片场地
  - 总耗时 `< 12000ms`
- 单独运行该文件时我本地测到约 `8497ms`，可以通过。
- 但连续两次全量运行 `node --test tests/*.test.js` 时，分别测到约 `16696ms` 和 `13311ms`，都触发了阈值失败。

这说明当前长尾非模板路径至少存在下面两种问题中的一种：

- 真实运行时间波动过大
- 现有阈值没有给全量测试下的资源争用留缓冲

建议方案：

- 如果目标是保证线上性能，优先优化长尾调度路径本身，再保留严格阈值。
- 如果目标是降低 CI 偶发红灯，建议把这条测试改成：
  - 单独性能作业运行
  - 或按 `executionProfile` 分层验收
  - 或适度放宽全量测试阈值

## 建议的修复顺序

1. 先统一配置契约
   - 对齐 `fixed_pair_rr` 的最大场次数定义
   - 明确 `mixed_fallback / allowOpenTeam` 是删除还是重新接线
2. 再修正元数据
   - 修 `fixed_pair_rr` 的 `fairness.playSpread`
   - 修 `schedulerMeta.logicalRounds`
   - 补齐 legacy 的 exact-matchup 统计
3. 最后补防御性校验与测试
   - 固搭重叠成员拦截
   - 跨层一致性测试
   - 元数据语义测试

## 结论

当前排阵核心算法本身并不弱，尤其 `multi_rotate` 的模板化和 beam/guarded 组合已经比较成熟，`squad_doubles` 也有清晰的主备路径。真正的问题主要集中在三类：

- 产品层和算法层的能力没有对齐
- 固搭模式的诊断元数据不够准确
- 历史兼容分支仍在，但真实入口没有接通

如果只做一轮最有收益的整改，建议优先处理：

1. `fixed_pair_rr` 的场次上限一致性
2. `fixed_pair_rr` 的 fairness / logicalRounds 语义修正
3. `mixed_fallback / allowOpenTeam` 的去留决策
