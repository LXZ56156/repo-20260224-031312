# 0002：当前线上版本作为产品基准

- 状态：Superseded by `0003-online-release-6.1.2-e60d827-r3.md`
- 日期：2026-08-14
- 决策者：用户

## 决策

当前产品先以用户已确认的线上版本为基准：

`master` = `origin/master` = `5813ffc79f94c180fa5573eb25fb0d57f53b85df`

> 2026-08-14 后续确认：当前正式线上版本实际为 `6.1.2-e60d827-r3`。本记录只保留此前决策历史，不再代表当前线上事实。

后续需求判断、现状复现、回归比较和新产品分支默认从该提交开始。`codex/ui-optimization-v2`、score-only overlay、协作打水 V2、share activity、local ops 和暂停的 Next-Gen 均不因本地存在、已批准、已 push、云函数已部署或形成 RC 而自动成为产品基准。

## 实施规则

1. 新产品任务从 `master@5813ffc` 创建新的隔离 `codex/` branch/worktree，不切换或覆盖现有 dirty worktree。
2. 候选路线只在具体需求获批后提取最小相关差异，不整分支合并。
3. 用户可见变化继续执行先审批、后实现、真实微信 DevTools 验收。
4. 如果未来确认了新的正式线上版本，先在发布账本记录可靠证据，再以新的决策追加或取代本记录；不能由 Git push、preview/upload 或云部署推断。

## 本次决策未授权的动作

- 不创建或切换产品分支；
- 不合并、cherry-pick 或丢弃任何候选成果；
- 不执行云部署、preview/upload、正式发布或真实数据写入；
- 不清理任何剩余 worktree。
