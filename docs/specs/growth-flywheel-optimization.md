# 增长飞轮优化方案 — v1.2

> 版本: v1.2.2 · 状态: phase1_completed_and_pushed
> 日期: 2026-06-15
> 数据来源: we分析 121 天数据 (2026.02.13–2026.06.13) + CloudBase 后端审计
> v1.2 变更: 从 P0–P5 分散功能清单重构为"方案 A + E + 轻量 D"第一阶段增长方案。目标是最短可验证增长闭环，不再一次性做完所有增长功能。
> 最新状态: 第一阶段 Task 1–6 已完成实现、真实截图检查、回归验证，并推送到 `origin/master`。Task 7 保持 Backlog。

## 0. 版本结论

v1.2 做出以下明确决策：

1. **不再采用 P0–P5 分散功能清单**。原方案将分享入口、新人引导、再分享、订阅消息拆成独立优先级，但本质都是"分享入口转化 + 再分享闭环"，合并更聚焦。
2. **第一阶段采用"方案 A + E + 轻量 D"**：
   - **方案 A（Entry Conversion）**：share-entry 状态化落地页 + 新人轻引导，解决"分享进来的人看不懂/不加入/秒退"。
   - **方案 E（Event Tracking）**：最小增长埋点模块，解决"做完不知道有没有效果"。
   - **轻量 D（Distribution）**：ranking/analytics 战绩再分享 + schedule 完赛时刻分享 + home finished 赛事复盘，解决"排名/完赛高情绪节点没有转化成再分享"。
3. **第一阶段的唯一目标**：闭合最短增长链路 — 群分享 → 落地页转化 → 核心使用 → 战绩再分享 → 新用户进入。
4. **第一阶段暂不做**：完整订阅消息系统、新增云函数、新增数据库集合。
5. **订阅消息、添加到我的小程序引导、match 单场分享、mine 长期战绩分享等进入第二阶段 Backlog**。

---

## 0.1 第一阶段执行结果

更新时间：2026-06-15 20:37 +0800

### 实现状态

| Task | 状态 | 结果 |
|------|------|------|
| Task 1：share-entry 状态化落地页 | 已完成 | draft / running / finished 差异化展示，draft 参赛名单支持实际头像，running/finished 展示排名预览 |
| Task 2：加入后的新人轻引导 | 已完成 | 加入后 lobby 首次引导走本地 `wx.Storage` 标记，用户可关闭，按 tournamentId 去重 |
| Task 3：ranking / analytics 战绩再分享强化 | 已完成 | ranking 主 CTA 聚焦战绩卡，analytics 主 CTA 聚焦赛事战报卡，分享文案/保存链路复用现有基础设施 |
| Task 4：schedule 完赛时刻分享触发 | 已完成 | finished schedule 展示最终排名与分享战绩入口，隐藏无意义空对阵态 |
| Task 5：home finished 赛事卡片强化 | 已完成 | finished 卡片增加最终排名、战绩卡、复盘提示、查看战绩和再办一场路径 |
| Task 6：最小增长埋点模块 | 已完成 | 新增 `growthTracker`，事件脱敏，`console.info` + `wx.reportEvent` 双通道，失败不阻断主流程 |
| Task 7：第二阶段 Backlog | 未实现 | 继续保留订阅消息、添加到我的小程序、match 单场分享、mine 长期战绩等后续项 |

### 提交状态

已分批提交并推送到 `origin/master`：

| Commit | 内容 |
|--------|------|
| `03fb80e` | `chore(growth): add analysis and screenshot tooling` |
| `5f0aa67` | `feat(growth): wire lightweight flywheel tracking` |
| `08fa322` | `feat(growth): polish flywheel UI surfaces` |

### 最终验证

| 验证项 | 结果 |
|--------|------|
| `npm run ui:screenshot -- home shareDraft shareRunning shareFinished lobbyGuide ranking schedule analytics` | 8 个 case 均 `ok=true` |
| `node --test tests/*.test.js` | 1096 / 1096 pass |
| `npm run check` | deprecated wx API 与 cloud common 检查通过 |
| 云函数 / 数据库集合 | 未新增云函数，未新增数据库集合 |

详细执行记录见 `docs/tasks/session-logs/2026-06-15-growth-flywheel-phase1.md`。

---

## 1. 当前增长诊断

> 数据基于 121 天 we 分析 (2026.02.13–2026.06.13)，详细分析见 `data/we-analysis/user-behavior-analysis-2026-06-13.md`。

### 入口问题

| 指标 | 数值 | 诊断 |
|------|------|------|
| share-entry 日均流量 | 41.3 PV / 11.9 UV | 最大流量入口 |
| share-entry 停留时间 | **0.1s** | 🔴 用户点开即关，信息密度严重不足 |
| share-entry 当前展示 | 赛事名 + 加入按钮 | 无状态区分、无社交信号、无排名预览 |

### 新人问题

| 指标 | 数值 | 诊断 |
|------|------|------|
| 新用户占比（近30天） | 59.5% | 每天超过一半用户是新人 |
| 新用户次日留存（近30天） | **5.7%** | 每 20 个新用户只有 1 个第二天回来 |
| 次日留存 = 0 的天数 | 65.9% | 大部分日子无人回访 |
| 访问深度（全时期） | 2.31 页 | 新人逛 2–3 页就走 |
| 加入后无引导 | 无 | 加入成功后不知道下一步该干嘛 |

### 回访问题

| 指标 | 数值 | 诊断 |
|------|------|------|
| 下拉任务栏（主动回访） | **0.3%** | 用户几乎从不主动打开 |
| 会话（分享卡片进入） | 59.2% | 回访主要靠别人分享拉进来 |
| 搜索 | 16.1% | 有一定自然搜索 |

### 分享问题

| 指标 | 数值 | 诊断 |
|------|------|------|
| 日分享 PV | 1.88 | 日均不到 2 次分享 |
| 日均分享人数 | 1.12 | 每天只有 ~1 人在分享 |
| 分享率 | 0.5% | 每 200 次访问才有 1 次分享 |
| 分享来源占总流量 | **59.2%** | 极少量分享撬动大部分流量 — 杠杆极高 |
| ranking 退出率 | 50% | 用户看完排名就走，无下一步动作 |

### 核心使用判断

- 近 30 天人均停留 338.4s，访问深度 3.08 页。
- schedule/lobby/match 为 Top 3 页面。
- **留下来的用户使用深，核心功能不是最主要瓶颈**。

---

## 2. 为什么选择 A + E + 轻量 D

### 三种方案的定位

| 方案 | 解决什么 | 为什么第一阶段必须做 |
|------|---------|-------------------|
| **A — Entry Conversion（入口转化）** | share-entry 0.1s 秒退，新用户看不懂/不加入 | 这是漏斗最宽处。share-entry 是 59.2% 流量的入口，0.1s 停留意味绝大多数流量被浪费 |
| **E — Event Tracking（埋点验证）** | 做完不知道有没有效果，只能看宏观 we 分析 | 没有事件级埋点，无法判断是哪个环节掉了。we 分析有 1 天延迟且粒度粗 |
| **轻量 D — Distribution（战绩再分享）** | 分享率 0.5%，高情绪节点没有分享出口 | 分享杠杆极高（~2 次分享撬动 60% 流量）。rank/schedule finished 是天然分享时刻，当前完全浪费 |

### 为什么不优先做订阅消息（原 P1）

| 原因 | 说明 |
|------|------|
| 依赖模板 | 需要先在 MP 后台确认可用订阅消息模板，模板可能不匹配羽毛球场景 |
| 依赖授权 | `wx.requestSubscribeMessage` 需要用户主动授权，弹窗时机不当反而流失 |
| 需要云函数 | 发送订阅消息需要后端定时任务或事件触发，这是 P0–P5 中唯一需要新增云函数的项 |
| 当前杠杆不如入口转化 | 主动回访 0.3% 是结构性短板，但第一阶段先把"来了的人留下来"比"让走的人回来"更优先 |
| 进入第二阶段 | 等 A + E + D 闭环跑通后，订阅消息作为第二阶段的留存续航手段 |

---

## 3. 第一阶段核心闭环

```
微信群分享
  → share-entry 状态化落地页（draft/running/finished 差异化）
  → 用户 3 秒内看懂赛事 → 加入/查看比赛
  → lobby 新人轻引导（仅首次，3 步，可关闭）
  → schedule/match 核心使用
  → ranking/analytics 查看排名和复盘
  → 生成战绩卡/保存海报/复制文案 → 发回群
  → 新用户继续进入 share-entry
```

### 验证指标

这个闭环不只用单一留存衡量，而是用以下事件级指标：

| 环节 | 指标 | 埋点事件 |
|------|------|---------|
| 入口 | share-entry 停留时间 | `share_entry_view` |
| 入口 | 主按钮点击率 | `share_entry_primary_click` |
| 加入 | 加入成功率 | `share_entry_join_success` |
| 引导 | 引导卡片展示/关闭 | `lobby_first_guide_show/close` |
| 核心 | 进入 schedule/进入 match | `share_entry_go_schedule`, `match_open` |
| 战绩 | 海报生成率/保存率 | `ranking_generate_poster_click/success`, `ranking_save_poster_success` |
| 再分享 | 分享行为率 | `ranking_copy_share_text` |
| 复盘 | finished 赛事复盘点击率 | `home_finished_review_click` |
| 再办 | 再办一场点击率 | `home_clone_tournament_click`, `clone_tournament_success` |

---

## 4. 任务清单

### Task 1：share-entry 状态化落地页

**目标**：把 share-entry 从"赛事名 + 加入按钮"升级为"赛事状态预览页"，让用户 3 秒内知道这场比赛是什么、现在进行到哪、自己能做什么。

**涉及文件**：
- `miniprogram/core/shareMeta.js`
- `miniprogram/pages/share-entry/index.js`
- `miniprogram/pages/share-entry/index.wxml`
- `miniprogram/pages/share-entry/index.wxss`

**具体改动**：

1. 扩展 `shareMeta.buildShareEntryViewModel()` 的字段，至少输出：
   - `lifecycle` / `status`（draft / running / finished）
   - `eventSummaryText`（如「7人轮转 · 21场 · 1片场地」）
   - `socialProofText`（如「已有 6 人加入」）
   - `participantPreviewList`（前 6–8 个参赛者头像/首字头像）
   - `participantOverflowText`（如「+3 人」）
   - `rankingPreview`（前 3 名，含排名/队名/胜场等关键信息）
   - `showRankingPreview`（running/finished 为 true）
   - `showParticipantPreview`（draft 为 true）
   - `primaryCtaReason`（如「还差 2 人满员」「查看你的排名」）
   - `secondaryCtaText`（如「查看赛程」「查看排名」）

2. **draft 状态展示**：
   - 已有 N 人（如有 `playerLimit` 则展示还差/还剩 M 个名额）
   - 展示前 6–8 个参赛者头像/首字头像
   - 主按钮：「加入比赛」
   - 辅助文案：「加入后可看赛程、录分、查看排名」

3. **running 状态展示**：
   - 当前进度（如「第 3 轮 / 共 7 轮」）
   - 当前排名前 3 预览
   - 主按钮：「查看赛程」
   - 次按钮：「查看排名」

4. **finished 状态展示**：
   - 最终排名前 3
   - 主按钮：「查看战绩 / 复盘」
   - 次按钮：「查看排名」

5. **已加入用户再次进入**：
   - 不再重复强调"加入比赛"
   - 根据状态直接导向 lobby（draft）/ schedule（running）/ ranking 或 analytics（finished）

6. 保持现有身份识别 pending / timeout 逻辑，不破坏游客查看与手动加入原则。

**不做**：
- 不新增云函数
- 不新增数据库集合
- 不改变加入赛事的业务流程
- 不让用户打开分享链接后自动加入

**验收标准**：
- draft / running / finished 三种状态都有差异化 UI
- 未加入、已加入、身份识别中、身份识别超时都能正常显示
- 老分享链接仍能正常打开
- share-entry 不出现空白页、按钮错乱、状态误判

---

### Task 2：加入后的 30 秒新人轻引导

**目标**：让首次加入的用户知道接下来该看什么，降低加入后流失。

**涉及文件**：
- `miniprogram/pages/lobby/index.js`
- `miniprogram/pages/lobby/index.wxml`
- `miniprogram/pages/lobby/index.wxss`
- `miniprogram/core/storage.js`（复用现有 storage 方法）

**具体改动**：

1. 用户从 share-entry 加入成功后，在跳转 lobby 时带 entry 参数或本地标记（如 `wx.setStorageSync('growth:onboarding:pending', tournamentId)`）。
2. lobby 首次展示轻引导卡片，3 步：
   - 第一步：「看看有谁参加 👀」→ 引导点开参赛名单
   - 第二步：「了解赛制规则 📋」→ 赛制说明区域高亮
   - 第三步：「等待开赛 / 查看赛程 🏸」
3. 引导**只对当前 tournamentId 首次触发**。
4. 使用 `wx.Storage` 本地记录，key 格式：`growth:onboarding:lobby:<tournamentId>`。
5. 老用户、已看过引导的用户不再打扰。
6. 引导卡片**必须可关闭**（点击关闭按钮或卡片外区域）。

**不做**：
- 不做复杂多步遮罩教程
- 不做强制教程
- 不阻塞用户操作（引导卡片不阻止用户正常使用页面）

**验收标准**：
- 新加入用户能看到一次引导
- 关闭后不再出现
- 换一个 tournamentId 可重新触发
- 老用户无干扰

---

### Task 3：ranking / analytics 战绩再分享强化

**目标**：把"看排名"这个高情绪节点转化为再分享。

**涉及文件**：
- `miniprogram/pages/ranking/index.js`
- `miniprogram/pages/ranking/index.wxml`
- `miniprogram/pages/ranking/index.wxss`
- `miniprogram/pages/analytics/index.js` / `.wxml` / `.wxss`（如 analytics 已有分享能力则复用）
- `miniprogram/core/sharePageMixin.js`
- `miniprogram/core/shareCard.js`
- `miniprogram/core/sharePoster.js`（如需要）

**具体改动**：

1. ranking 顶部保留现有"生成海报 / 分享到朋友圈"能力，文案调整为更强动机：
   - 「生成我的战绩卡」
   - 「保存后发群」
2. 排名前 3 行增加轻量"分享"入口（icon 或文字链）。
3. 点击某一行分享时，**优先生成该用户/队伍的战绩卡**，而不是永远生成当前用户或榜首。
4. 如果无法识别当前用户，则**默认生成榜首卡**（已有此逻辑，保持）。
5. finished 状态下，ranking 顶部增加横幅：「最终排名已出炉 🎉」。
6. 海报文案按状态区分：
   - running：「实时排名更新中」
   - finished：「最终排名出炉」
7. 分享卡底部保留小程序码 / 进入下一场 / 扫码查看战绩的导向文案。

**不做**：
- 不重做整套海报视觉
- 不新增图片生成后端
- 不破坏现有 `sharePageMixin` 预热逻辑

**验收标准**：
- 当前用户能生成自己的战绩卡
- 前 3 名可单独生成对应战绩卡
- 无当前用户时能生成榜首卡
- 保存海报、复制文案、分享到朋友圈引导仍正常
- running / finished 文案区分明确

---

### Task 4：schedule 完赛时刻分享触发

**目标**：在比赛刚结束、用户情绪最高时，给出"分享战绩"入口。

**涉及文件**：
- `miniprogram/pages/schedule/index.js`
- `miniprogram/pages/schedule/index.wxml`
- `miniprogram/pages/schedule/index.wxss`
- `miniprogram/core/nav.js`（复用现有导航方法）

**具体改动**：

1. 当 `tournament.status === 'finished'` 时，schedule 顶部 hero 区域或完赛提示区域展示：
   - 「比赛已结束 🎉」
   - 「查看最终排名」→ 跳转 ranking
   - 「分享我的战绩」→ 跳转 ranking/analytics 并携带自动弹海报参数
2. 跳转 ranking/analytics 时携带参数（如 `autoPoster=1` 或 `shareIntent=poster`）。
3. ranking/analytics `onLoad` / `onShow` 识别参数后自动触发海报生成，但**必须避免重复弹**：
   - 使用页面内 flag 或 storage（如 `growth:autoPoster:fired:<tournamentId>`）
4. 如果海报生成失败，**降级为普通 ranking 页面**，不影响用户查看排名。

**不做**：
- 不在每一场比赛结束后强推弹窗
- 不影响继续录分流程（finished 后 schedule 页无录分入口，不冲突）
- 不改变比赛状态判断逻辑

**验收标准**：
- finished 赛事 schedule 显示"分享战绩"入口
- 点击后能到 ranking/analytics
- 自动海报只触发一次
- 失败可降级，不阻断页面

---

### Task 5：home finished 赛事卡片强化

**目标**：让用户回到首页时，finished 赛事有明确的复盘和再办一场路径。

**涉及文件**：
- `miniprogram/pages/home/index.js`
- `miniprogram/pages/home/index.wxml`
- `miniprogram/pages/home/index.wxss`

**具体改动**：

1. finished 赛事卡片强化两个入口：
   - 「查看战绩 / 复盘」→ 跳转 ranking 或 analytics
   - 「再办一场」→ 复用现有 `cloneTournament` 逻辑
2. 对 finished 赛事增加视觉标记：
   - 「最终排名已出炉」
   - 「可生成战绩卡」
3. 保留现有 `cloneTournament` 逻辑，不改变复制赛事后端。
4. 如果当前已有"查看复盘"和"再办一场"入口，只优化文案、层级和视觉突出度，不重复造轮子。

**不做**：
- 不重做首页架构
- 不改 `cloneTournament` 云函数
- 不新增推荐系统

**验收标准**：
- finished 赛事一眼能看到"查看战绩"和"再办一场"
- running / draft 赛事不受影响
- 删除、滑动、排序、筛选仍正常

---

### Task 6：最小增长埋点模块

**目标**：建立第一阶段增长闭环的事件级验证能力，避免只能看宏观 we 分析（1 天延迟、粒度粗）。

**涉及文件**：
- `miniprogram/core/growthTracker.js`（**新建**）
- `miniprogram/pages/share-entry/index.js`
- `miniprogram/pages/lobby/index.js`
- `miniprogram/pages/schedule/index.js`
- `miniprogram/pages/match/index.js`
- `miniprogram/pages/ranking/index.js`
- `miniprogram/pages/analytics/index.js`
- `miniprogram/pages/home/index.js`

**实现原则**：

1. 第一阶段使用 `console.info` + `wx.reportEvent` 双通道：
   - 如果 `wx.reportEvent` 可用（基础库 ≥ 2.11.1），调用之。
   - 如果不可用，只 `console.info`，不报错。
2. 不新增云函数。
3. 不新增数据库集合。
4. 事件参数**必须脱敏**，不上传 openid、昵称、头像。
5. event payload 只包含：
   - `t` — tournamentId 的短 hash（取前 8 位，或空字符串）
   - `s` — status（draft / running / finished）
   - `m` — mode（multi_rotate / squad_doubles / fixed_pair_rr）
   - `src` — source（如 share_entry / home / schedule / ranking）
   - `a` — action（行为描述，如 click / success / view）
   - `r` — result（success / fail / timeout）
   - `ts` — timestamp
6. `growthTracker.track(eventName, payload)` **必须 try/catch**，不能影响主流程：
   ```js
   // miniprogram/core/growthTracker.js 核心结构
   function track(eventName, payload = {}) {
     try {
       const data = { ...payload, _e: eventName, ts: Date.now() };
       console.info('[growth]', eventName, data);
       if (typeof wx !== 'undefined' && wx.reportEvent) {
         wx.reportEvent(eventName, data);
       }
     } catch (_) { /* 静默失败 */ }
   }
   module.exports = { track };
   ```

**事件清单**：

| 事件名 | 触发位置 | 触发时机 |
|--------|---------|---------|
| `share_entry_view` | share-entry | 页面 onShow / 首次渲染完成 |
| `share_entry_primary_click` | share-entry | 主按钮点击 |
| `share_entry_join_success` | share-entry | 加入赛事成功 |
| `share_entry_go_schedule` | share-entry | 点击"查看赛程" |
| `share_entry_go_ranking` | share-entry | 点击"查看排名" |
| `lobby_first_guide_show` | lobby | 新人引导卡片展示 |
| `lobby_first_guide_close` | lobby | 新人引导卡片关闭 |
| `schedule_finished_share_click` | schedule | finished 状态下点击"分享战绩" |
| `match_open` | match | 进入比赛录分页 |
| `score_submit_success` | match | 比分提交成功 |
| `ranking_view` | ranking | 排名页展示 |
| `ranking_generate_poster_click` | ranking | 点击"生成海报" |
| `ranking_generate_poster_success` | ranking | 海报生成成功 |
| `ranking_save_poster_success` | ranking | 海报保存成功 |
| `ranking_copy_share_text` | ranking | 复制分享文案 |
| `analytics_view` | analytics | 复盘页展示 |
| `home_finished_review_click` | home | 首页 finished 赛事点击"查看战绩" |
| `home_clone_tournament_click` | home | 首页点击"再办一场" |
| `clone_tournament_success` | home | 复制赛事成功 |

**不做**：
- 不上报任何隐私数据
- 不阻塞任何用户操作
- 不新增云函数或数据库集合

**验收标准**：
- 所有埋点失败都不影响用户操作
- 开发者工具控制台可以看到 `[growth]` 事件日志
- 真机不因 `wx.reportEvent` 不可用而报错
- 不出现隐私数据上传（openid / 昵称 / 头像 / 地理位置）

---

### Task 7：文档内保留第二阶段 Backlog

以下内容**明确不在第一阶段范围**，进入第二阶段 Backlog：

#### 订阅消息

- 开赛通知：加入赛事后引导订阅
- 完赛通知：全部比赛完赛时推送
- 排名更新通知：排名变化时推送
- 前置条件：MP 后台确认可用模板、`wx.requestSubscribeMessage` 授权策略、新增云函数 `subscribeMessage.send`

#### 添加到我的小程序引导

- 触发时机：创建赛事成功后 / 首次提交比分后
- 弹窗引导用户下拉添加
- 全生命周期最多弹 1 次（本地 storage 记录）

#### match 单场比分分享

- 录分完成后，轻量入口分享单场比分卡
- 需 Canvas 生成单场比分卡（对阵双方 + 比分 + 赛事名）

#### mine 长期个人战绩分享

- 累计战绩卡（胜率、排名、队友统计）
- 最近 10 场表现

#### 更细分的转化漏斗数据

- 入口转化率（share-entry view → join click → join success）
- 加入转化率（join success → schedule view → match open）
- 海报保存率（generate click → generate success → save success）
- 再办一场率（home finished review → clone click → clone success）

---

## 5. 第一阶段最终验收清单

- [x] share-entry 支持 draft / running / finished 差异化展示
- [x] share-entry / lobby / ranking / schedule / analytics / home 已按 `docs/tools/weapp-ui-screenshot-workflow.md` 完成真实截图检查
- [x] share-entry 展示参赛者头像 / 首字头像
- [x] share-entry running / finished 展示排名预览
- [x] 已加入用户再次进入能快速进入对应页面
- [x] 新加入用户 lobby 首次引导只出现一次
- [x] ranking 支持当前用户 / 前 3 名战绩卡生成
- [x] finished schedule 有"分享战绩"入口
- [x] home finished 赛事强化"查看战绩 / 再办一场"
- [x] `growthTracker` 最小埋点模块完成
- [x] 埋点不上传 openid、昵称、头像
- [x] 不新增数据库集合
- [x] 不新增云函数
- [x] 不破坏现有动态分享、海报、分享卡预热
- [x] `node --test tests/*.test.js` 全部通过
- [x] `./scripts/check-cloud-common.sh` 全部通过

---

## 6. 实施约束

- 所有改动仅限 `miniprogram/` 目录
- 第一阶段不新增/修改任何云函数
- 引导/标记全部走本地 `wx.Storage`，不新增数据库集合
- 分享类优化复用现有 `shareCard` / `sharePageMixin` / 动态消息基础设施
- `growthTracker` 双通道上报，不影响主流程
- 保持现有测试全量通过

---

## 附录 A：数据来源

| 数据类型 | 时间范围 | 最新日期 |
|---------|---------|---------|
| dailyVisitTrend | 2026.02.13–2026.06.13 | 121 天 |
| dailyRetain | 2026.02.12–2026.06.13 | 122 天 |
| dailySummary | 2026.02.12–2026.06.13 | 122 天 |
| visitDistribution | 2026.02.12–2026.06.13 | 122 天 |
| visitPage | 2026.02.13–2026.06.13 | 约 30 个采样日 |
| userPortrait | 2026.05.11, 05.12, 06.03, 06.12, 06.13 | 5 天 |
| weeklyVisitTrend | 2026.02.09–2026.06.07 | 连续周 |
| weeklyRetain | 2026.02.09–2026.06.07 | 连续周 |
| monthlyVisitTrend | 2026.02–2026.05 | 4 个月 |
| monthlyRetain | 2026.02–2026.05 | 4 个月 |

详细分析报告：`data/we-analysis/user-behavior-analysis-2026-06-13.md`

---

## 附录 B：版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-06-05 | 初版，P0–P5 功能清单，基于 104 天数据 |
| v1.1 | 2026-06-15 | 数据更新至 121 天，修正⑤回访节点错误数据，新增留存指标 |
| v1.2 | 2026-06-15 | 重构为"方案 A + E + 轻量 D"第一阶段方案，7 个可执行任务 + 第二阶段 Backlog |
| v1.2.1 | 2026-06-15 | 补充第一阶段 UI 真实截图验收流程入口 |
| v1.2.2 | 2026-06-15 | 记录第一阶段 Task 1–6 已完成、截图/测试验证通过，并推送到 `origin/master` |
