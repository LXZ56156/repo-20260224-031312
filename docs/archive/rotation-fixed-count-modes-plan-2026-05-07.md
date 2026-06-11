# 6/7/8 人转发起页入口方案

- 日期: `2026-05-07`
- 状态: 已实现（`82f93ee` feat: add fixed-count rotation presets），897 测试全部通过
- 目标: 在发起页增加 `6人转`、`7人转`、`8人转` 三个入口，底层继续复用 `multi_rotate` 排阵与排名能力

## 已确认规则

- 发起页新增入口顺序: `6人转` / `7人转` / `8人转` / `多人转` / `小队转` / `固搭循环赛`。
- 三个入口本质仍是多人转，不新增真实后端 `mode`，排阵继续走 `multi_rotate`。
- 人数限制:
  - `6人转`: 最多 6 人加入，开赛前必须正好 6 人。
  - `7人转`: 最多 7 人加入，开赛前必须正好 7 人。
  - `8人转`: 最多 8 人加入，开赛前必须正好 8 人。
- 达到上限后继续加入，提示类似 `该赛制最多 6 人参赛`。
- 管理员一键导入名单如果会超过剩余名额，整批拒绝，不部分导入。
- 后续展示需要显示 `6人转` / `7人转` / `8人转`，不是只显示 `多人转`。
- 创建后参数默认配置完成，人齐后无需再保存参数即可直接开赛。
- 用户仍可在草稿阶段修改总场次为其他可选档或自定义场次。
- 默认使用 `1` 场地；只有 `8人转` 可在草稿阶段选择 `1` 或 `2` 场地，`6人转` / `7人转` 固定只能 `1` 场地。
- 创建页、首页、大厅、分享入口等后续展示均显示 `6人转` / `7人转` / `8人转`。
- 用户修改总场次或场地后，仍保留固定人数转标签和人数限制。
- v1 不提供取消固定人数限制的设置入口。

## 最佳方案

使用“发起页模板入口 + 持久化 preset”的方式实现，而不是新增三个真实 `mode`。

推荐数据 contract:

```js
{
  mode: 'multi_rotate',
  presetKey: 'rotation_6', // rotation_6 / rotation_7 / rotation_8 / custom
  playerLimit: 6,          // 6 / 7 / 8，仅固定人数转存在
  settingsConfigured: true,
  totalMatches: 9,
  courts: 1,
  rules: {
    gamesPerMatch: 1,
    pointsPerGame: 21,
    endCondition: { type: 'total_matches', target: 8 },
    unfinishedPolicy: 'admin_decide'
  }
}
```

默认参数建议:

| 入口 | `presetKey` | `playerLimit` | 默认总场次 | 默认每轮最多场数 | 可选场地 |
| --- | --- | ---: | ---: | ---: | --- |
| `6人转` | `rotation_6` | 6 | 9 | 1 | `1` |
| `7人转` | `rotation_7` | 7 | 14 | 1 | `1` |
| `8人转` | `rotation_8` | 8 | 14 | 1 | `1 / 2` |

说明:

- `courts` 默认写入 `1`。设置页/大厅快捷参数里 `6人转` / `7人转` 只提供 `1`，`8人转` 提供 `1` / `2`。
- `6人转` 和 `7人转` 不提供 `2` 场地，因为双打同轮 2 场至少需要 8 人；后端设置写入也应拒绝这类无意义配置。
- `8人转` 选择 `2` 场地时可同轮排 2 场，但没有轮休空间，连续上场会更高；默认保留 `1` 场地。
- `playerLimit` 计入创建者本人。例如 `6人转` 创建后已有创建者 1 人，最多还能加入或导入 5 人。
- `presetKey` 负责展示与限制，`mode` 只负责算法分支。这样不会污染现有 `multi_rotate` 排阵、排名、录分、统计逻辑。

## 实现要点

前端展示:

- `miniprogram/core/uxFlow.js` 的发起页模式卡片增加三个固定人数入口，卡片点击时传 `mode=multi_rotate` 和 `presetKey=rotation_N`。
- `launch` 规则说明针对固定人数入口展示专属说明: 默认场次、最多人数、人齐后可直接开赛、仍可修改场次。
- `create` 页读取 `presetKey`，默认赛事名和已选赛制建议显示 `6人转` / `7人转` / `8人转`，避免用户刚选完又看到 `多人转`。
- `home`、`lobby`、`share-entry` 的 `modeLabel` 通过 `presetKey` 优先显示固定人数转标签；底层 `mode` 仍保留 `multi_rotate`。
- `lobby` 草稿态增加名额提示，例如 `5/6 人` 或 `名额 6 人`，并在人数未满时提示还差几人。
- 固定人数转的场地 picker 按模板限定: `6/7人转` 只有 `1`，`8人转` 为 `1 / 2`；普通多人转仍沿用现有场地 picker。

后端写入与限制:

- `createTournament` 接收并白名单校验 `presetKey`，对 `rotation_6/7/8` 写入默认参数、`playerLimit`、`settingsConfigured=true`。
- `joinTournament`:
  - 已在名单内更新资料不受上限影响。
  - 认领已有 guest 不改变人数，允许执行。
  - 新增成员时如果已达 `playerLimit`，返回结构化失败，建议 `code=PLAYER_LIMIT_REACHED`、`state=invalid`。
- `addPlayers`:
  - 计算实际会新增的有效唯一成员数。
  - 如果 `当前人数 + 本次新增数 > playerLimit`，整批拒绝，返回 `code=PLAYER_LIMIT_EXCEEDED`、`state=invalid`，不写入任何成员。
- `startTournament`:
  - 如果存在固定人数 `presetKey/playerLimit`，开赛前校验 `players.length === playerLimit`。
  - 不满足时返回 `START_VALIDATION_FAILED`，文案如 `6人转需要正好 6 人参赛，当前 5 人`。
- `removePlayer` 不需要限制，移除后赛事回到未满员状态，无法开赛直到补齐人数。
- `updateSettings` 允许用户修改总场次、场地、分制，但不允许绕过人数限制；`playerLimit` 不通过设置页修改。
- `updateSettings` 对固定人数转的 `courts` 做后端限制: `rotation_6/rotation_7` 只能写 `1`，`rotation_8` 只能写 `1` 或 `2`，避免前端以外调用写入无意义的大场地数。

共享 helper 建议:

- 前端 `miniprogram/core/mode.js` 和云端 `scripts/mode-common.template.js` 增加同名 helper:
  - `normalizePresetKey(value)`
  - `resolveRotationPreset(value)`
  - `getModeDisplayLabel(mode, presetKey)`
  - `getRotationPlayerLimit(tournament)`
- 修改模板后运行 `bash scripts/sync-cloud-common.sh`，再用 `bash scripts/check-cloud-common.sh` 校验。

## 测试计划

必须先补测试，再实现。

- `launch/create`:
  - 发起页暴露 6 个入口，前三个入口传 `presetKey=rotation_6/7/8` 且 `mode=multi_rotate`。
  - 创建页固定人数入口显示对应标签，并向 `createTournament` 传 `presetKey`。
- `createTournament.index.test.js`:
  - `rotation_6/7/8` 写入 `mode=multi_rotate`、正确 `presetKey/playerLimit/totalMatches/courts/rules/settingsConfigured`。
  - 非白名单 `presetKey` 回落 `custom`，不自动配置参数。
- `draftStartReadiness` / `lobby.viewmodel.test.js`:
  - 固定人数转未满员时 `checkPlayersOk=false`，提示还差人数。
  - 正好 N 人且参数已配置时 `checkStartReady=true`。
  - 标签显示 `6人转`，大厅显示名额。
- `joinTournament.index.test.js`:
  - 未满员可加入。
  - 达到上限新用户加入被拒绝。
  - 已在名单内更新资料允许。
  - 认领 guest 时人数不变，允许。
- `addPlayers.index.test.js`:
  - 导入后不超过上限可写入。
  - 超过剩余名额整批拒绝且不写入。
  - 重复名和无效名不计入实际新增数。
- `startTournament.logic.test.js` / `startTournament.index.test.js`:
  - 固定人数转人数不足拒绝开赛。
  - 固定人数转人数超过上限拒绝开赛。
  - `8人转` 配置 `courts=2` 时能按有效双场地生成。
  - 正好 N 人按 `multi_rotate` 正常生成赛程。
- `updateSettings.logic.test.js` / `updateSettings.index.test.js`:
  - `6/7人转` 写入 `courts=2` 返回 `SETTINGS_INVALID`。
  - `8人转` 允许写入 `courts=2`。
- `cloud.error-matrix.test.js` / `joinTournamentError`:
  - 新增 `PLAYER_LIMIT_REACHED`、`PLAYER_LIMIT_EXCEEDED` 按参数错误展示具体文案。
- 最终验证:
  - `bash scripts/check-cloud-common.sh`
  - `node --test tests/*.test.js`
  - `npm run check`

## 细节检查与可优化项

当前无阻塞实现的未确认细节；以下是实现时需要避免踩坑的优化点。

- 发起页建议把 `6/7/8人转` 作为“常用人数转”视觉组展示，三张卡的摘要直接写 `默认 9/14/14 场 · 满 N 人开赛`，减少用户点规则说明的需求。
- 创建页对固定人数转改用专属流程文案: `1. 邀请或导入至 N 人`、`2. 人齐后可直接开赛`，避免沿用现有“满 4 人后设置参数”造成误解。
- 大厅 hero 的人数 KPI 建议显示 `5/6` 而不是单独 `5`，同时把主任务 summary 写成 `还差 1 人`；达到 N 人后主任务直接切到 `开始比赛`。
- 参赛名单标题的 count-pill 建议同步显示 `5/6 人`；满员后访客加入入口应提前弱化或改成 `名额已满`，但后端仍保留最终校验。
- 一键导入前可在前端做预检查: 如果文本解析出的新增人数会超过剩余名额，直接提示 `还差 2 人，本次导入 3 人，未导入`，减少一次云函数往返；后端仍整批拒绝作为兜底。
- 分享入口预览应显示名额状态，例如 `已报名 5/6 人` 或 `名额已满`，让未加入用户在点击加入前就知道结果。
- 固定人数转的参数区默认折叠高级自定义，只展示 `默认场次 + 场地` 摘要；用户需要改场次时再进入高级自定义，避免“人齐即可开赛”的主路径被参数控件打断。
- 对 `8人转` 的 `2` 场地选项建议显示轻量提示 `更快打完，基本无轮休`；默认仍停在 `1` 场地。
- 场地选择文案要避免误导。`6/7人转` 不展示场地选择或只展示不可编辑的 `1`；`8人转` 才展示 `1 / 2` 选择。
- 固定人数转创建后已经 `settingsConfigured=true`，大厅主任务应优先引导“转发/导入名单”，人齐后直接聚焦“开始比赛”，不再要求管理员先保存参数。
- 首页、大厅、分享入口应统一通过同一个 display label helper 读取 `presetKey`，避免某个页面仍显示 `多人转`。
- 人数限制必须以后端为准。前端可隐藏或弱化加入入口，但不能只靠前端禁用。
- 新增错误码建议加入 `cloud.PARAM_CODES` 与 `joinTournamentError`，确保加入失败和导入失败都直接展示具体名额文案。
- `presetKey` 非白名单必须回落到 `custom`，避免历史脏数据或外部调用把赛事误判成固定人数转。
- 文档与实现中都应明确 `playerLimit` 包含创建者本人。

## 取舍结论

这个方案把“固定人数转”定义为 `multi_rotate` 的产品模板，而不是算法模式。优点是入口清晰、参数自动配置、人齐即可开赛，同时最大限度复用现有排阵审计通过的多人转能力。代价是需要在创建、加入、导入、开赛四个写路径统一维护人数 contract，但这是避免分享和导入绕过限制的必要成本。
