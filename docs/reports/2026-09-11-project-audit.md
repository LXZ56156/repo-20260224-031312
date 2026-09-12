# 全项目只读审查（2026-09-11）

> 处理状态：用户于2026-09-11明确“先记录，暂时不修复”。本报告全部发现保留为待办，未执行修复、停用hook、提交或部署；下方优先级与建议顺序仅为记录，不构成自动继续执行的授权。等待后续明确指示。

## 结论与范围

项目仍有明确待修问题，不只是文档或代码风格。审查当前工作树：`codex/online-audit-optimizations-20260828` / HEAD `6827efa3cf00182f4edacaefc5d399d58f82f260`，包含既有未提交修改。下面P1表示优先修复，不代表已确认线上事故；P2是可靠性/维护问题。

覆盖客户端赛事主要链路与共享同步、water兼容/UI合同、23云函数入口扫描及关键写入路径精读、测试/截图/选测/上传部署工具、活跃文档。采用源码审查、本地stub和现有测试，不是所有实现逐行穷尽，也未访问真实云数据、核验线上规则/索引/部署版本、执行真机或DevTools视觉验收。仅新增本报告，未修业务或变更本机hook。

## 优先发现

### P1：本机提交钩子仍自动部署云函数

- `.git/hooks/post-commit:3` 已安装，执行 `scripts/git-hooks/post-commit-cloud-deploy.sh`；脚本7–13行默认部署，只有显式SKIP环境变量才跳过。
- `scripts/deploy-changed-cloudfunctions.sh:285` 对选中函数执行`--force`。部署相关文件干净且检查/登录通过时，云相关commit会继续走部署，违背项目commit与部署分离的边界。
- 这是当前本机实际hook，不是只存在仓库中的模板。没有执行commit或hook；并不声称部署已发生。
- 建议优先停用自动部署，把部署保留为独立显式命令。检查前不要执行云相关commit。

### P1：录分提交没有校验锁会话代次

- `cloudfunctions/submitScore/index.js:118–136`只检查owner/expiry；180–184清锁也没有lockSessionId；前端`miniprogram/pages/match/matchSubmitService.js:363`未透传该字段。
- 使用已有内存DB harness，本地锁是同用户NEW_SESSION，请求是STALE_SESSION，仍返回`ok:true/SCORE_SUBMITTED`、写入1次并清锁。
- 同一用户旧页/旧设备的迟到提交可以借新会话锁写入。建议透传、验证session并纳入清理条件；保留旧客户端兼容策略需明确设计。
- 读锁到写赛事之间不在同一事务，还存在可推导的takeover竞态，但本轮没有独立并发复现该项。

### P1：读取失败被误判为文档不存在

- `scripts/cloud-common.template.js:19–21`把任何`document.get:fail`当不存在。
- 本地诊断`database document.get:fail request timeout`、`... permission denied`均返回true。
- 消费包括scoreLock读锁、submitScore读锁、water可选文档和共享幂等日志读取；可能将真实错误误报缺失或进入无记录分支。未断言已造成线上重复写入。
- 建议只匹配明确不存在的错误，保留timeout/permission原语义；改模板后同步派生库，补三类错误回归。

### P1：legacy账本可记账但撤销入口失联，详情按钮无响应

- `miniprogram/pages/water/index.js:836–840`的legacyCapabilities没有canReverse；1111将其算成false；WXML92–96只有item.canReverse时才有撤销按钮。
- `onUndoLast`方法仍存在，但WXML无对应绑定。本地legacy房主fixture产生`legacyMode:true/canWrite:true/entryCount:1/feedItems.canReverse:false`。
- WXML85–90仍显示“查看详情”，`openEntryDetail`在legacy直接返回。
- 建议恢复legacy实际支持的撤销入口，详情提供兼容行为或不显示虚假可操作提示。是否线上落入legacy取决于云能力，本轮未核验开关。

### P1（交付工具）：上传来源与版本标记未绑定

- `scripts/mp-ci.js:161`默认项目仍为旧路径`D:\projects\badminton-miniapp-preview`，与当前工作区不一致；172–173却从脚本所在仓库取版本/提交摘要。
- 代码只检查目录/config/app.json及凭据存在，不验证目标源码与当前Git快照一致。若目标镜像存在但过期，可把旧内容标成当前commit版本上传；若不存在则直接失败。
- 建议取消旧默认值或强制明确目标，并在preview/upload前校验实际目标来源/内容快照；本轮没有执行任何上传或读取私密环境值。

## P2：可靠性与工程效率

1. **当前全量测试不通过。** `tests/waterSession.ui-copy.test.js:372`精确匹配`class="water-sheet water-form-sheet"`，前次截图定位改为含`water-direct-sheet`后失败。不是随机波动，是前次改动漏更新相邻测试。应按class token验证原布局合同，保留新selector及单滚动容器检查。
2. **空云响应伪成功。** `miniprogram/core/cloud.js:92–97,370–375`将null/undefined归一成ok:true；本地assertWriteResult两者均成功，`core/profile.js:60–67`随后保存本地资料。建议调用边界拒绝无效返回，保留合法旧root/data兼容。
3. **隐藏页重连恢复后台监听。** `core/pageTournamentSync.js:370–384`不检查页面活跃态；本地`_pageActive:false`触发网络恢复仍fetch=1/watch=1。涉及lobby/match/ranking/schedule/settings。只限制重连新任务；不要破坏ranking隐藏时已在途fetch可完成的现有测试合同。
4. **排名页卸载后头像回调仍应用页面。** `pages/ranking/index.js:330–337`await后不验证generation，而onUnload:221虽递增却未消费。本地卸载后仍applyTournament=1。应保留共享缓存但丢弃旧页面副作用。
5. **test:affected对未知页面漏报覆盖不确定性。** `scripts/test-affected.js:23–28`把所有smoke/async-stale/sync作为匹配，所以不存在的页面仍选23/266文件且full:false；真实launch.wxss也选同样23项。建议分别判断领域自身覆盖与邻接覆盖，未知领域明确提示/回退；已知样式按风险避免广泛邻接测试。它目前不是完整依赖图，不能作为唯一覆盖证明。
6. **活跃架构/产品文档仍有漂移。** `docs/context/architecture.md:7–8`仍列5813ffc/c2f438a和旧worktree为当前；63–68与README仍把V1 owner-only/最近记录当完整现状。源码已含V2成员写、完整流水、新轮与legacy分支；应将V1/V2/云flags区分并链接现行规范。包含V2客户端源码不等于线上V2云开关已启用。

## 已知未完成及不宜扩大的工作

- simulator-frame完整30case批次仍有偶发官方响应超时，27+3独立重跑不等于单批30/30；原同SDK页面图15×10 A/B未完成。不要重复安装来替代定位。
- 文档变化也使截图Git manifest失效，需要重编译挑战：是现有合同的操作成本，可另评估证据快照与运行时代码判定分离，不在本轮放宽。
- UI每个点均走浏览器方案偏重，可讨论缩窄到方向未定/新设计；真实DevTools图、权限和交付边界仍保留。
- 不建议趁审查全面重构页面、统一设计系统、升级云SDK或迁移基础设施；先修已复现问题。

## 验证

- `npm test`：1425 total / 1418 pass / 1 fail / 6 skip，97.46秒；唯一失败如上。日志`tmp/project-audit-tests.log`。
- `npm run check`：通过（V2 bootstrap声明、deprecated API、cloud common）；`tmp/project-audit-check.log`。
- `npm run lint`：0 errors / 42 warnings；`tmp/project-audit-lint.log`。
- 客户端聚焦既有测试28/28通过，但没有覆盖本次发现的隐藏重连/头像卸载边界。
- `git diff --check`通过。未调用mp:quality（需凭据/官方工具）、未跑线上权限/性能测试、未生成真实UI图；测试通过不能替代这些验收。

建议修复顺序：先解除自动部署风险 → 锁会话/错误分类 → legacy入口与空返回/异步回调 → 全量失败及选测 → 上传来源和文档状态对齐。每项只补直接回归，不默认引入新框架。
