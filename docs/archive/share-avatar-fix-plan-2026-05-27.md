# 头像显示二次修复计划

日期：2026-05-27
状态：已实施；2026-05-27 补丁已收口

## 2026-05-27 补丁收口

上一版实现后复查发现 3 个阻塞问题，并已按补丁计划修正：

1. `profile_update` 现在是明确的云端动作语义：只更新已参赛成员；未参赛返回 `PLAYER_NOT_JOINED/not_joined`，不会绕过“加入比赛/确认加入”，也不会自动认领 guest。
2. 头像 image error 与 cloud temp URL 解析失败已拆分：真实图片加载失败会丢弃坏 URL 并立即允许重新解析；解析失败可以保留旧显示 URL，但 cooldown 后会继续后台刷新。
3. lobby 主路径已把旧 `displayPlayers` 传入 `buildDisplayPlayers()`，watcher/切页重建列表时可继承同一 `avatarRaw` 的旧 `avatarDisplay`，避免重新闪首字母。

验证：头像/lobby、profile、joinTournament、share-entry 聚焦测试通过；`git diff --check`、`node --check`、`bash scripts/check-cloud-common.sh`、`npm run check`、`node --test tests/*.test.js` 全部通过（982 pass / 0 fail）。本轮修改 `cloudfunctions/joinTournament/index.js`，上线前需要部署 `joinTournament` 云函数。

## 背景

真机复测仍存在两个明显问题：

1. 进入或切换页面后，参赛名单头像先显示首字母，停留一段时间后才闪成真实头像，延迟明显。
2. 只有当前用户自己的头像正常，其他用户即使保存了资料，在当前赛事名单里仍可能看不到头像。

上一轮修复已经完成：

- `avatarRaw` / `avatarDisplay` 分离，避免把 `cloud://` fileID 直接作为 `<image src>`。
- `avatarDisplay.getSharedAvatarCache()` 接入全局内存缓存。
- `profileCore.saveCloudProfile()` 改为云端保存成功后才写本地。

本轮结论：问题不再是单个页面渲染 bug，而是“赛事成员资料同步”和“cloud 头像临时 URL 缓存/刷新”两个链路叠加。

## 影响面与风险分类

按 `weapp-regression-guard` 分类：

- `user-visible`：profile 保存后同步当前赛事资料；名单头像首屏展示行为改变。
- `logic-only`：头像缓存、过期刷新、失败重试。
- `cloud-contract`：如调整 `saveUserProfile` 或 `joinTournament` 返回/写入行为，需要保持 `ok/state/code` contract。
- `sync-state`：lobby/share-entry/profile 之间的返回刷新、watcher 与本地缓存。

需要确认后再实施的用户可见变化：

| 变化 | 影响页面 | 用户可见影响 |
| --- | --- | --- |
| 从赛事入口进入 profile 保存后，额外同步当前赛事 player | `profile`、`lobby`、`share-entry` | 保存资料后名单头像/昵称/性别应立即在当前赛事生效 |
| lobby 头像解析期间不再主动清空已有头像 | `lobby` | 页面切换时不应先退回首字母 |
| 本地持久化 cloud 头像 temp URL cache | `lobby`、`schedule`、`ranking`、`profile`、`mine` | 冷启动/切页首屏更大概率直接显示头像 |

## 代码证据

### 1. 名单显示只读取赛事文档里的 player 头像

`miniprogram/pages/lobby/lobbyViewModel.js`：

- `buildDisplayPlayers()` 使用 `player.avatar || player.avatarUrl` 作为唯一头像来源。
- 如果该字段为空，`avatarRaw` 为空，后续没有任何机会从 `user_profiles` 补齐。

`miniprogram/pages/lobby/lobby-player-grid.wxml`：

- `item.avatarDisplay` 存在才渲染 `<image>`。
- 不存在就渲染 `item.initial`。

结论：其他人保存 profile 后，如果当前 `tournaments.players[]` 没有被更新，lobby 不会显示头像。

### 2. profile 页保存当前只强保证写 user profile

`miniprogram/pages/profile/index.js`：

- `onSave()` 调用 `profileCore.saveCloudProfile()`。
- 保存成功后按 `returnUrl` 导航返回。
- 当前没有基于 `returnUrl/tournamentId` 再调用 `joinTournament profile_update`。

`cloudfunctions/saveUserProfile/index.js`：

- 会尝试同步 draft/running 赛事头像。
- 查询条件依赖 `playerIds` 包含当前 `openid`。
- 只更新 `id/openid` 匹配且 `type !== 'guest'` 的 player 引用。

结论：profile 保存依赖后台同步兜底，不能保证当前赛事立即更新；如果云函数未部署、`playerIds` 不完整、用户仍是 guest/imported entry，赛事名单不会变。

### 3. joinTournament 已具备直接更新当前赛事 player 的能力

`cloudfunctions/joinTournament/index.js`：

- 已参赛成员 `idx >= 0` 时，会更新 `name/avatar/gender/squad`。
- guest claim 命中时，会把 guest player 重写为当前 `openid` 用户 player。

`miniprogram/pages/lobby/lobbyProfileActions.js`：

- lobby 的“保存我的资料”已经走 `joinTournament` 的 `profile_update`。
- 这条链路能直接写当前赛事，是应复用的强一致入口。

结论：最佳修复不是让 lobby 临时查别人 profile，而是让 profile/share-entry 返回当前赛事时也走同一条赛事更新链路。

### 4. 头像闪烁来自异步解析策略

`miniprogram/core/avatarDisplay.js`：

- 当前 cache 是 `getApp().globalData._avatarCache`，只在内存里。
- `TEMP_URL_TTL_MS = 9 * 60 * 1000`，有效期偏短。
- 冷启动或 cache 过期后必须重新 `wx.cloud.getTempFileURL()`。

`miniprogram/pages/lobby/lobbyProfileActions.js`：

- `resolveDisplayPlayersAvatars()` 没有 cache 时会先把 `avatarDisplay` 设为 `''`。
- 随后先 `applyPatch({ displayPlayers: list })`，页面立刻显示首字母。
- 等 `getTempFileURL` 返回后再次 patch，才显示真实头像。

结论：即使赛事里有 `cloud://` 头像，也会出现“首字母 -> 头像”的可见闪烁。

## 根因判断

### 根因 A：赛事 player 头像不是 profile 头像的实时投影

当前名单显示的数据源是 `tournaments.players[]`。别人保存 profile 后，如果未同步到该赛事 player，名单没有数据可显示。

高概率场景：

- 用户从 profile 页保存后直接返回，未触发 `joinTournament profile_update`。
- `saveUserProfile` 云函数未部署到生产，或生产仍是旧版本。
- 赛事里的用户仍是 guest/imported entry，`saveUserProfile` 不会把它当作当前 openid 的 player。
- `playerIds` 未包含该 openid，后台同步查询不到该赛事。

### 根因 B：cloud 头像 temp URL 解析是冷启动异步链路

`cloud://` 不能直接给 `<image src>`，必须先换临时 URL。当前只有内存 cache，且解析前会清空 display 字段，因此切页、重进、过期后会闪首字母。

### 根因 C：失败处理会放大闪烁

图片加载失败或解析失败时会写入短冷却失败状态，`getCachedAvatarUrl()` 返回空，UI 退回首字母。若失败只是临时 URL 过期或网络抖动，当前体验上仍表现为头像消失。

## 修复目标

1. 其他用户保存头像后，只要其已经绑定到当前赛事 player，所有人都能在赛事名单看到头像。
2. 从 lobby/share-entry 进入 profile 保存后，当前赛事 player 立即更新，不依赖后台同步碰运气。
3. 页面切换、冷启动、watcher 刷新时，不再主动从已有头像退回首字母。
4. cloud 头像临时 URL cache 可跨页面、跨冷启动复用，并支持后台刷新。
5. 保持 guest/imported player 的身份边界：未 claim 的 guest 不应被 profile 保存误绑定。

## 详细实施方案

### P0：补充失败赛事诊断

目的：上线前后能确认到底是“赛事 player 缺头像”还是“cloud URL 解析慢/失败”。

执行方式：

1. 在本地或 CloudBase 控制台检查复现赛事文档：
   - `tournaments.players[].id`
   - `tournaments.players[].type`
   - `tournaments.players[].name`
   - `tournaments.players[].avatar`
   - `tournaments.playerIds`
2. 判断：
   - 若问题用户 `avatar` 为空：数据同步问题。
   - 若 `avatar` 是 `cloud://...`：显示/缓存问题。
   - 若该用户 `type: guest` 或 `id` 不是 openid：需要通过 join/claim 绑定，不能靠 profile 保存直接改。

不建议把临时诊断日志长期暴露在 UI；如需代码辅助，只加开发态 console 或测试辅助，不做用户可见文案。

### P1：profile 保存后同步当前赛事 player

目标：profile 页保存完成后，如果是从赛事入口进入，直接更新当前赛事 player。

拟改文件：

- `miniprogram/pages/profile/index.js`
- `miniprogram/core/profile.js` 或新增轻量 helper
- `miniprogram/core/joinTournament.js`
- 必要时 `miniprogram/pages/share-entry/flow.js`

方案：

1. 解析 `returnUrl` 中的赛事上下文：
   - 支持 `/pages/lobby/index?tournamentId=...`
   - 支持 `/pages/share-entry/index?tournamentId=...&intent=...`
   - 只在能明确拿到 `tournamentId` 时启用。
2. `profile.onSave()` 在 `saveCloudProfile()` 成功后：
   - 构造 `joinTournamentCore.buildJoinPayload({ tournamentId, nickname, avatar, gender })`。
   - 调用 `joinTournamentCore.callJoinTournament(payload, { action: 'profile_update' })`。
   - 成功后 `nav.markRefreshFlag(tournamentId)`。
3. 如果 `profile_update` 返回 `PROFILE_MINIMUM_REQUIRED`、`PLAYER_LIMIT_REACHED` 等业务失败：
   - profile 保存仍已成功。
   - 不把 profile 保存整体回滚。
   - 记录/吞掉非关键同步失败，并返回原页面由 lobby/share-entry 自身刷新处理。
4. 对 guest/imported player：
   - 不在 profile 页直接改 guest。
   - 由 `joinTournament` 现有 guest claim 规则处理唯一姓名匹配。
   - 匹配不到或姓名重复时，保持未绑定，避免误把别人导入的 guest 绑定到当前用户。

注意：

- 这属于用户可见行为变化：保存 profile 后当前赛事资料会同步。实施前需要确认。
- 不新增用户操作步骤，不改 CTA 文案。

### P2：将 saveUserProfile 后台同步保留为兜底

目标：profile 保存后，即使不是从赛事入口进入，也尽量同步用户已加入的 draft/running 赛事头像。

拟改文件：

- `cloudfunctions/saveUserProfile/index.js`
- `tests/saveUserProfile.sync.test.js`

方案：

1. 保持现有 `playerIds` 查询作为主路径。
2. 不把 guest/imported player 纳入自动同步，避免误绑定。
3. 补充测试明确以下行为：
   - `playerIds` 包含 openid 且 `players[].id === openid` 时，同步 avatar。
   - `players[].type === 'guest'` 时，不同步。
   - `playerIds` 缺失时，当前实现不会同步，测试用例标注为既有边界，后续如需兼容旧数据再单独做迁移。
4. 如确认为生产存在大量旧赛事缺 `playerIds`，另开一次性数据修复或云函数补偿计划，不在本轮前端体验修复里混做。

部署提醒：

- 如果本轮改 `saveUserProfile`，必须通过微信开发者工具或 CloudBase CLI 部署该云函数。

### P3：头像 temp URL cache 持久化

目标：冷启动和切页首屏尽量命中缓存，避免每次都重新显示首字母。

拟改文件：

- `miniprogram/core/avatarDisplay.js`
- `miniprogram/core/storage` 相关文件，如已有合适 storage helper 则复用
- `tests/avatar-display.test.js`

方案：

1. 在 `avatarDisplay` 增加本地持久 cache：
   - storage key：例如 `avatar_temp_url_cache_v1`
   - key：cloud fileID
   - value：`{ url, expiresAt, updatedAt }`
2. `getSharedAvatarCache()` 初始化时：
   - 先读本地 cache。
   - 过滤过期、异常、非 `cloud://` key。
   - 合并到 `getApp().globalData._avatarCache`。
3. `setCachedAvatarUrl()` 成功时：
   - 写内存 cache。
   - 节流写入本地 storage，避免批量解析时频繁 setStorage。
4. `markAvatarUrlFailed()`：
   - 只标记内存失败状态。
   - 不覆盖本地最后一个仍未过期的好 URL，避免一次失败导致长期首字母。
5. TTL：
   - 当前 9 分钟偏短。
   - 调整为更保守但明显更长的值，例如 50 分钟。
   - 如果微信 `getTempFileURL` 返回值未来可读取真实过期时间，再优先使用真实过期时间。

### P4：解析刷新期间保留旧头像

目标：已有头像不因后台刷新或 cache miss 临时消失。

拟改文件：

- `miniprogram/pages/lobby/lobbyProfileActions.js`
- 可能同步调整 schedule/ranking 中同类解析逻辑
- `tests/lobby-avatar-resolution-stale-guard.test.js`

方案：

1. `resolveDisplayPlayersAvatars()` 中：
   - 如果 `player.avatarDisplay` 已有 URL 且 `avatarRaw` 未变，不在解析前清空。
   - cache miss 时只把 fileID 加入 `need`，保持当前 display 值。
   - 只有从未有过 display 的 player 才显示首字母兜底。
2. `onDisplayPlayerAvatarError()` 中：
   - 如果是 cloud avatar 且本地 cache 还有未过期旧 URL，先尝试刷新，不立即清空。
   - 连续失败或确认无可用 URL 时再退回首字母。
3. `buildDisplayPlayers()` 阶段：
   - 使用持久 cache 命中结果。
   - 支持从上一轮 `displayPlayers` 继承相同 `avatarRaw` 的 `avatarDisplay`，避免 watcher 推送同一赛事数据时重建列表造成闪烁。

### P5：上传成功后预热自己的 cloud 头像

目标：自己刚上传头像后，后续页面不必再等一次 `getTempFileURL`。

拟改文件：

- `miniprogram/pages/profile/index.js`
- `miniprogram/pages/lobby/lobbyProfileActions.js`
- `miniprogram/core/avatarDisplay.js`

方案：

1. `uploadPendingAvatar()` 获得 `fileID` 后：
   - 保留本地临时图作为当前页 preview。
   - 后台调用 `resolveCloudAvatarFileIds([fileID])`。
   - 成功后写入持久 cache。
2. lobby 中头像上传成功路径同样预热。
3. 预热失败不阻断保存，只影响后续首屏速度。

## 不做的方案

1. 不在 lobby 每次展示时批量查询所有人的 `user_profiles`。
   - 原因：会增加读放大、权限边界复杂、和赛事快照不一致。
2. 不把 `cloud://` 直接塞给 `<image src>`。
   - 原因：微信小程序 `<image>` 不能稳定显示 cloud fileID。
3. 不自动把同名 guest 强行绑定到当前用户。
   - 原因：重名时会误改别人，必须通过 `joinTournament` 的唯一 claim 规则。
4. 不把 profile 保存失败和赛事同步失败混成一个错误。
   - 原因：profile 保存成功但赛事同步失败时，应保留已保存资料。

## 测试计划

### 单元/聚焦测试

新增或调整：

- `tests/avatar-display.test.js`
  - 持久 cache 读写。
  - 过期 cache 清理。
  - 解析成功写入内存 + storage。
  - 失败不覆盖仍可用旧 URL。
- `tests/lobby-avatar-resolution-stale-guard.test.js`
  - cache miss 解析期间不清空已有 `avatarDisplay`。
  - watcher 重建同一 `avatarRaw` player 时继承旧头像。
  - 解析完成后替换为新 temp URL。
- `tests/profile.test.js`
  - profile 从 lobby returnUrl 保存后调用 `joinTournament profile_update`。
  - profile 从 share-entry returnUrl 保存后调用 `joinTournament profile_update`。
  - profile 普通入口保存不调用赛事更新。
  - 赛事同步失败不回滚 profile 保存。
- `tests/joinTournament.index.test.js`
  - 已参赛成员 `profile_update` 更新 avatar。
  - dedupe 返回中包含最新 avatar。
- `tests/joinTournament.claim.test.js`
  - 唯一 guest name 可 claim 并写 avatar。
  - 重名 guest 不误 claim。
- `tests/saveUserProfile.sync.test.js`
  - user player 同步 avatar。
  - guest player 不同步。
  - `syncTruncated` contract 保持。

### 聚焦命令

```bash
node --test tests/avatar-display.test.js tests/lobby-avatar-resolution-stale-guard.test.js
node --test tests/profile.test.js tests/profile.avatar-display.test.js tests/profile.storage.test.js
node --test tests/joinTournament.index.test.js tests/joinTournament.claim.test.js tests/joinTournament.core.test.js
node --test tests/saveUserProfile.sync.test.js tests/saveUserProfile.index.test.js
node --test tests/share-entry*.test.js tests/smoke.share-entry-profile-gate.test.js
```

### 项目级验证

```bash
git diff --check
npm run check
node --test tests/*.test.js
```

如修改云函数共享库或 `cloudfunctions/*/lib/*` 派生文件：

```bash
./scripts/sync-cloud-common.sh
./scripts/check-cloud-common.sh
```

本轮预计不需要修改共享模板；如果实际涉及模板，按模板为准。

## 真机验收清单

### 场景 1：当前用户从 lobby 编辑资料

1. 草稿赛事，当前用户已加入。
2. 点击“编辑我的资料”。
3. 更换头像并保存。
4. 回到 lobby。

预期：

- 自己头像立即显示。
- 切到排名/对阵再回来，不闪首字母。
- 其他设备打开同一赛事，也能看到新头像。

### 场景 2：其他用户从分享入口补资料后加入

1. A 创建草稿赛事并分享。
2. B 从分享入口进入，资料不完整时跳 profile。
3. B 上传头像、填昵称性别并保存。
4. B 返回分享入口或 lobby 完成加入。
5. A 的 lobby 名单刷新。

预期：

- A 能看到 B 的真实头像。
- B 在自己设备上也能看到头像。
- 页面切换不出现长时间首字母。

### 场景 3：导入 guest 后 claim

1. 管理员导入 guest 名单。
2. 用户使用与唯一 guest 相同的昵称从分享入口加入。

预期：

- 唯一匹配时 guest 被 claim 成用户 player。
- avatar 写入赛事 player。
- 若存在重名 guest，不自动 claim，避免误绑定。

### 场景 4：冷启动缓存

1. 成功显示一轮头像。
2. 关闭小程序再重新进入同一赛事。

预期：

- 未过期 cache 命中时首屏直接显示头像。
- 若后台刷新 temp URL，刷新期间不回退首字母。

### 场景 5：临时 URL 过期/失败

1. 模拟 cache 过期或 `getTempFileURL` 失败。
2. 进入 lobby。

预期：

- 有旧可用 URL 时先保留旧头像。
- 确认无法显示后才退回首字母。
- 失败不会污染持久 cache。

## 上线与部署

1. 若只改前端和测试：
   - 上传小程序开发版/体验版即可。
2. 若改 `joinTournament`：
   - 需要部署 `joinTournament` 云函数。
3. 若改 `saveUserProfile`：
   - 需要部署 `saveUserProfile` 云函数。
4. 上线前记录版本号和 commit hash 到 `docs/tasks/current.md`。
5. 上线后用一个真实复现赛事检查：
   - 问题用户 `players[].avatar` 是否已从空变成 `cloud://...`。
   - 其他设备是否能看到 temp URL 渲染后的头像。

## 实施顺序

1. 写测试锁定当前失败行为：
   - profile returnUrl 保存不更新赛事 player。
   - lobby cache miss 会先清空头像。
   - avatar cache 无持久化。
2. 实现 P1：profile 保存后同步当前赛事 player。
3. 实现 P3：avatar temp URL 持久 cache。
4. 实现 P4：解析刷新期间保留旧头像。
5. 实现 P5：上传成功后预热自己的 cloud 头像。
6. 复核 P2：只补测试或必要的后台兜底，不扩大 guest 自动绑定范围。
7. 跑聚焦测试、静态检查、全量测试。
8. 如触及云函数，部署对应函数并真机复测。

## 残余风险

1. 如果生产云函数未部署，profile 页保存仍可能只写本地/用户资料，无法同步赛事；上线时必须确认部署状态。
2. 微信临时 URL 的实际有效期受平台控制，持久 cache 只能降低闪烁，不能保证永久可用。
3. 旧赛事如果历史数据缺 `playerIds`，`saveUserProfile` 后台同步可能查不到；需要单独数据修复，不建议在本轮前端链路里扩大查询范围。
4. guest/imported player 不能无条件继承 profile 头像，否则存在误绑定风险。

## 完成标准

- 当前用户和其他已绑定用户的头像都来自赛事 player，并能稳定显示。
- lobby 页面切换/刷新时，已有头像不再明显闪回首字母。
- 从 share-entry/profile 补资料后，当前赛事能拿到 avatar。
- 聚焦测试、`npm run check`、全量测试通过。
- 如改云函数，最终汇报明确需要部署的函数名。
