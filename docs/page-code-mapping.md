# 页面代码映射表

## 审计页面 → 代码路径

| 审计页面 | 路径 | 关键状态 | 关键动作 | 痛点 | 骨架方案 |
|---------|------|---------|---------|------|---------|
| home | pages/home/index | loading/loadError/empty/heroCard/syncStatus/onboarding/profileNudge | 排序/筛选/左滑删/进入赛事/Hero CTA | Hero 过重、列表平权、不像工作台 | TopContext + 紧凑Hero + 分层列表 |
| launch | pages/launch/index | modeCards | 选模式/看规则/发起 | 像普通列表，无策略感 | Hero + 模式选择面板 |
| create | pages/create/index | networkOffline/createBusy/canRetry/squadEndCondition | 填参数/选预设/创建 | 字段堆叠、配置后台感 | Hero + 分组表单 + sticky CTA |
| lobby | pages/lobby/index | tournament状态(draft/running/finished)/角色(admin/player/viewer)/joinSheet/adminPanel/pairTeams/syncStatus | 加入/分享/导入/开赛/编辑设置 | 信息过载、多动作平权、角色混杂 | TopContext + Hero + ActionRail + 分层内容 |
| schedule | pages/schedule/index | roundsUi/syncStatus/loadError | 查看轮次/进入录分 | 单调列表、缺进程感 | Hero + 轮次进程板 |
| match | pages/match/index | lockState(idle/locked_by_me/locked_by_other)/canEdit/batchMode/submitBusy/syncStatus | 开始录分/快捷比分/撤销/提交 | sync banner layout shift、状态切换生硬、锁态像开发提示 | StatusRail + ScoreStage + sticky SubmitTray |
| ranking | pages/ranking/index | rankings/syncStatus/loadError | 查看排名 | 普通榜单、无视觉张力 | Hero + Top3强化 + 完整榜 |
| analytics | pages/analytics/index | summary/top3/focusFacts/fullRankings/syncStatus | 复制摘要/复制战报/再办一场 | 报表输出感、模块平权、无复盘叙事 | Hero结论 + 亮点卡 + 折叠排名 |
| share-entry | pages/share-entry/index | identityPending/identityTimedOut/joinBusy/joinSquadChoice/loadError/syncStatus | 加入/进入比赛/查看赛程排名 | 多状态结构不稳定、主动作不固定 | 固定Hero + 固定ActionRail + 状态槽 |
| mine | pages/mine/index | noPerformanceData | 编辑资料/查看比赛/反馈/设置 | 像通用个人页、模板感 | Hero仪表盘 + 战绩卡 + 服务网格 |
| profile | pages/profile/index | fieldErrors/avatarUploading/saving/quickFillLoading | 选头像/填昵称/选性别/保存 | 像输入表单、无仪式感 | Hero + 聚焦表单 + sticky保存 |
| settings | pages/settings/index | isDraft/isAdmin/settingsBusy/syncStatus/loadError | 编辑参数/保存 | 只读参数表感、缺整合 | Hero摘要 + 分组参数 + 编辑/只读切换 |
| preferences | pages/preferences/index | autoReturn/autoNext/motionLevel等偏好 | 切换偏好/清缓存 | 堆叠拥挤、不像系统偏好 | 分组设置列表 |
| feedback | pages/feedback/index | blocked/blockNeedProfile/submitting | 选类型/填内容/提交 | 工单表单感、缺友好度 | Hero + 轻对话表单 |

## 共用模块

- 云调用与错误: `core/cloud.js`
- 赛事同步: `core/pageTournamentSync.js`, `core/tournamentSync.js`
- 同步状态: `core/syncStatus.js`
- 导航: `core/nav.js`
- 赛事内导航: `core/matchPrimaryNav.js`, `styles/matchPrimaryNav.wxss`
- 重试: `core/retryAction.js`
- 防重入: `core/actionGuard.js`
- 全局样式: `app.wxss`

## sync banner 重复问题

以下 7 个页面各自复制了完全相同的 sync-banner CSS：
home, lobby, match, schedule, ranking, analytics, share-entry, settings

改造方案：提取到 `app.wxss` 作为全局状态条样式，各页面删除重复定义。
