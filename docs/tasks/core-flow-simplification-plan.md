# 核心流程简化与 UI 重构计划

> 状态：历史技术完成；产品方向已于 2026-07-13 否定并关闭
> 启动日期：2026-06-22
> 原始分支：`master`（`5813ffc`）
> 工作分支：`feature/core-flow-simplification`
> 阅读规则：正文中的“当前、目标、待确认、阻塞、下一步”均为历史快照；当前权威状态只看 `docs/tasks/current.md`。

## 目标与边界

在不改变三种赛制、排名/计分规则、权限、主动加入、实时同步、失败重试、分享兼容和广告频控的前提下，缩短创建到开赛、录分、排名与分享的核心路径。禁止部署、上传和推送远程。

## 角色与职责

当前 VS Code 会话不启用并行子智能体，由同一执行者依次切换角色，并在本文件和会话日志中保留证据。

| 角色 | 权限 | 输出 |
|---|---|---|
| 产品流程审计 | 只读 | 路径、重复信息、低价值操作、风险 |
| 视觉审计 | 只读 | 基线截图、层级、密度、CTA 与一致性问题 |
| 分阶段执行 | 写入 | 测试先行、页面与共享模块实现 |
| 独立代码验收 | 原则只读 | 行为回归、权限、路由、广告、测试缺口 |
| 独立视觉验收 | 只读 | 实际打开 PNG，按 P0/P1/P2 记录 |

## 当前流程与目标流程

### 当前主链路

```text
发起
  -> 赛制卡“发起”
  -> create 独立确认页（赛事名称、赛制、创建后流程）
  -> “创建并进入”
  -> lobby（hero 摘要 + 准备清单 + 主任务 + 新人引导 + 名单 + 管理员面板 + 比赛信息）
  -> 开赛
  -> 顶部“比赛 | 排名 | 对阵”
  -> 对阵页
  -> 独立 match 录分页（本场对阵卡 + 重复队名的比分卡）
  -> ranking（3 个分享入口 + 分享横幅 + 行内分享）
  -> analytics 独立复盘页（结论、关键数据、TOP 3、折叠完整排名、更多看点）
```

关键冗余：创建前多 1 页/1 次点击；lobby 同时出现 5–7 个信息区块；match 双方名称出现两次；finished 结果分散在 ranking 与 analytics；home/share-entry 重复状态和增长文案。

### 目标主链路

```text
发起 -> 明确点击赛制创建 -> 赛事大厅 -> 开始比赛 -> 对阵 -> 录分 -> 排名
```

赛事内主导航统一为：`赛事 | 对阵 | 排名`。`analytics` 与 `create` 暂保留旧路由兼容，不作为新流程正式页面。

状态分支：

- draft 管理员：名单未就绪显示“邀请球友”；名单就绪时以当前默认参数一键“开始比赛”；参数管理进入“管理”。
- draft 参与者：显示名单与等待状态，不出现管理员操作。
- draft 观众：默认观赛，唯一主 CTA 为“加入比赛”，小队赛保留 A/B 队选择。
- running：默认进入“对阵”，第一场待录分比赛优先；排名为实时结果。
- finished：排名为唯一正式结果页；旧 analytics 链接重定向至 ranking。

## 产品流程审计

| 问题 | 证据 | 建议 | 涉及文件 | 风险 |
|---|---|---|---|---|
| 创建链路重复确认 | `launch/index.js` 导航到 create；create 再执行 `createTournament` | 将受保护的创建动作移到 launch 明确按钮；create 仅保留旧路由兼容 | launch/create、创建测试 | 资料门禁、重复点击、clientRequestId 必须保留 |
| lobby 同时表达多个“下一步” | `lobby-state-panel.wxml` 有准备清单和主 CTA；admin-panel 再含参数、导入和取消；底部还有比赛信息 | 删除新人引导/准备清单；名单后只保留单一状态 CTA；管理能力折叠 | lobby WXML/view model/actions | 管理员、参与者、观众、固定搭档和 A/B 队权限 |
| 默认参数仍要求再保存 | custom 草稿 `settingsConfigured=false`；已有 `saveAndStart()` 可串联 updateSettings/start | 名单就绪时主 CTA 直接“开始比赛”，内部安全保存当前默认参数再开赛 | lobby view model/lifecycle/quick settings | 两次写入的失败与重试语义 |
| 赛事导航语义和顺序不直观 | `matchPrimaryNav`: `比赛 | 排名 | 对阵`，其中“比赛”实际是 lobby | 保持 key，改为 `赛事 | 对阵 | 排名` | matchPrimaryNav 与页面测试 | 深链和当前项兼容 |
| match 信息重复 | `本场对阵`卡与比分舞台都显示双方名称 | 合并到单个比分舞台，保留轮次、场次、分制和锁状态 | match WXML/WXSS | 不触碰锁、校验、幂等、自动下一场 |
| finished 结果分裂 | ranking 已有完整榜；analytics 再重复结论/TOP3/完整榜 | ranking 承接最终结果；analytics 变兼容重定向并删除无引用复盘 UI/计算 | ranking/analytics/nav/share flow | 重定向循环、旧链接参数、分享海报 |
| 广告可能随 analytics 消失 | analytics 使用 `adGuard` 的 `analytics` slot | finished ranking 在排名内容后的自然断点复用同一 slot key 和频控 | ranking、adGuard 测试 | 不得插在排名首屏和主 CTA 之间 |
| home 过早展示管理控件 | 仅 2 项就显示 3 个排序和 4 个筛选；finished 卡有 3 条增长文案和 2 个动作 | 赛事数达到 4 才展示筛选排序；finished 卡只保留必要字段和“查看排名” | home | 排序、删除、滑动、缓存不变 |
| share-entry 重复摘要和竞争 CTA | hero pills、操作提示、状态预览、比赛摘要重复；running/finished 双 CTA | 按状态保留紧凑摘要、名单/排名预览和一个主 CTA；无真实时间地点不渲染 | shareMeta/share-entry | pending/timeout、显式加入、A/B 队、旧链接 |

## 视觉审计

审计来源：`tmp/ui-screenshots-actual/*.png`、WXML/WXSS、全局 token。既有 PNG 为当前样式审计证据，最终验收仍需在本分支重新生成。

### P0

- `shareDraft.png` 被 reveal/loading 透明层覆盖，关键信息和 CTA 不可用；截图脚本需等待稳定可见状态并断言关键 DOM。
- 既有 `home.png` 仅 15KB，未达到 20KB 非空白标准；最终矩阵不得把这类文件判为通过。

### P1

- lobby 首屏的新人引导卡占据完整视口，名单和下一步被推到下方。
- share running/finished 同时存在 hero 状态、操作提示、排名预览、比赛摘要和两个 CTA，三秒内任务不唯一。
- ranking 首屏有“生成战绩卡/朋友圈/保存后发群/分享横幅/前三行分享”，分享动作竞争。
- analytics 重复展示冠军、完赛数、结论、关键数据、TOP 3 和完整排名，卡片层级过深。
- home finished 卡同时展示“最终排名已出炉/可生成战绩卡/复盘已准备好/查看战绩/再办一场”。
- schedule finished hero 内再次嵌套完赛提示卡和双 CTA。

### P2

- 顶部导航和大量 chip 均为超圆胶囊，卡片、边框、阴影使用过密。
- 多个页面使用“hero 内卡片、卡片内 panel、panel 内 metric card”的嵌套结构。
- 空态使用 emoji，长赛事名/长昵称和小屏尚无专门截图覆盖。

视觉目标：保留绿色/白色和现有 token；每屏一个实心主按钮；用留白与细分隔代替卡片套卡片；列表行紧凑但保持 44px 触控区域。

## 阶段与文件所有权

| 阶段 | 状态 | 文件所有权 |
|---|---|---|
| 0. 基线与双审计 | 已完成 | 只读；计划、日志和截图输出除外 |
| 1. 合并发起与创建 | 已完成 | `pages/launch`, `pages/create`, 创建相关测试 |
| 2. 精简草稿大厅 | 已完成 | `pages/lobby`, lobby 相关测试 |
| 3. 统一导航与录分 | 已完成 | `core/matchPrimaryNav.js`, `pages/schedule`, `pages/match`, 相关测试 |
| 4. 合并排名与复盘 | 已完成 | `pages/ranking`, `pages/analytics`, `core/nav.js`, 广告/排名测试 |
| 5. 首页与分享入口 | 已完成 | `pages/home`, `pages/share-entry`, 相关测试 |
| 6. 全局视觉与截图矩阵 | 已完成 | `app.wxss`, 共用组件、`scripts/dev/weapp-ui-screenshot.js` |
| 7. 完整回归与终验 | 已完成 | 只读验收与必要返工 |

共享文件 `app.wxss`、`nav.js`、`uxFlow.js`、`matchPrimaryNav.js` 每次仅由当前阶段执行角色修改。

## 兼容、广告与回滚原则

- `pages/create/index` 保留注册，旧入口安全导向新创建入口或继续兼容参数。
- `pages/analytics/index` 保留注册，旧链接安全导向 ranking，必须防止循环。
- 排名页承接 analytics 原有合规广告曝光，保持 `adGuard` 频控和自然内容断点。
- 每阶段以小范围提交候选差异为边界；不使用破坏性 Git 命令，返工采用显式补丁。

## 测试与截图策略

- 修改前：`node --test tests/*.test.js`、`npm run check`、`npm run lint`、完整基线截图。
- 阶段内：先补行为测试，再实现；运行 `weapp-regression-guard` 映射出的 focused tests。
- 跨链路阶段包含 `auth`、`permission`、`sync`、`smoke` 回归。
- 最终：全量测试、check、lint、全部真实截图；截图需大于 20KB，并收集 DOM 文本、size、offset。
- 至少两轮实际 PNG 视觉审查；P0/P1 清零后才完成。

新增行为测试：

- launch 直接创建、资料门禁、双击幂等、失败重试和默认名称。
- create 旧路径不白屏且不会形成重定向循环。
- lobby 每个角色/状态只有一个主 CTA；未配置 custom 草稿一键保存默认值并开赛。
- 导航文本、顺序、底层 key 和路由保持兼容。
- match WXML 不再有独立对阵卡，锁/提交/自动下一场测试保持。
- analytics 旧路由转 ranking 并透传海报意图；ranking finished 广告复用 `analytics` slot。
- home 管理控件阈值与 finished 唯一主操作。
- share-entry 三状态单主 CTA、显式加入、pending/timeout 和占位字段隐藏。

截图矩阵：`launch`、`lobbyEmpty`、`lobbyWaiting`、`lobbyReady`、`scheduleRunning`、`matchIdle`、`matchEditing`、`rankingRunning`、`rankingFinished`、`home`、`shareDraft`、`shareRunning`、`shareFinished`，并追加长赛事名/长昵称与三种赛制可稳定用例。

## 验收记录

### 基线

- `node --test tests/*.test.js`：1108/1108 通过，0 失败，27.16s。
- `npm run check`：通过。
- `npm run lint`：通过，0 error；64 条既有 warning 已记录，不纳入本任务顺手清理。
- DevTools doctor/snapshot：runtime 正常，`ws://127.0.0.1:39420` 可用。
- 新基线截图：`App.captureScreenshot` 在 WSL 与 Windows 本机均超时；窗口检查显示 simulator webview 空白。已按 doctor/session/snapshot、重启 DevTools、重开 simulator、Windows 本机 probe 完成诊断，继续作为工具阻塞修复，不以 mock/layout 图替代终验。
- 用户已有改动：启动时工作区干净

### 发现的问题

- 基线产品与视觉问题见上文；实施后基线 P0/P1 已全部清零。
- 第一轮新发现 P1：排名页“更多”按钮显示为“更…”。已扩大次级按钮、补样式契约测试并重拍。
- 独立代码审查发现旧准备清单仍在 ViewModel 内计算但不渲染；已删除构建函数、初始状态和下发字段，不再只做隐藏。

### 返工轮次

- 第 1 轮：完整查看 13 张 PNG，修复排名“更多”文字挤压并恢复分享页长赛事名省略保护。
- 第 2 轮：重新生成并逐张查看全部 13 张 PNG；P0=0、P1=0。

### 最终验证

- `node --test tests/*.test.js`：1108/1108 通过，0 失败，25.66s。
- `npm run check`：通过；未发现废弃微信 API，共享云函数库同步一致。
- `npm run lint`：0 error / 59 warning；较基线减少 5 条本次页面死代码 warning，剩余均为既有 warning。
- `npm run ui:screenshot`：13/13 `ok=true`，输出目录 `tmp/ui-screenshots-actual/`；文件 29–134KB，均实际打开检查。
- 云函数变化：无。部署、上传、push：均未执行。

### 剩余风险

- 无阻断风险。真实截图依赖 Windows 微信开发者工具 `ws://127.0.0.1:39420` 的 live session；本轮已解决新版工具 simulator surface 归零导致的空白合成问题。
- 未执行真机、生产部署、体验版上传或远程推送；这些操作明确不在本任务授权范围内。

## 产品方向关闭（2026-07-13）

- 本计划在 `feature/core-flow-simplification` 上曾达到“技术实现完成”，但用户在真实使用与视觉复审后明确否定其产品方向；“技术完成”不代表产品验收通过。
- 该分支的创建直达、页面减法、导航/排名/复盘/首页/分享入口简化和全局扁平化视觉均不再作为后续开发基线，也不继续修补。
- 新工作从 `master@5813ffc` 创建 `codex/ui-optimization-v2`，保留 master 原有产品流程与视觉。
- 唯一获准提取的产品改动是 `pages/schedule/index` 对阵卡：待录分 `VS`、完赛比分位于双方头像与姓名之间，以释放姓名宽度；不得夹带该实验的其他 UI 或流程变化。
- 后续增量 UI 工作以 `docs/tasks/incremental-ui-optimization-plan.md` 为准。本文件仅保留为失败方向的历史审计记录。
