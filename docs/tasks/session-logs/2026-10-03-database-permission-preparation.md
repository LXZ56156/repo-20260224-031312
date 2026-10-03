# 2026-10-03 数据库权限核验与隔离测试准备

当前结论：已只读保存13集合权限和索引，核查当前客户端数据库入口；没有真实安全规则引擎测试，没有生产规则更改。`tournaments`的登录可读范围覆盖整文档，包括内部身份字段；已有存量无`_openid`不能证明客户端新增也被拒绝。不能据此宣称发生越权事故。

## 证据与现行合同

新备份`2026-10-03-0607/cloud/database/<集合>/rule.json`保留原始API回执；只读规则归类与约01:42审查相同。

| 集合 | 实际AclTag | Rule |
| --- | --- | --- |
| tournaments | CUSTOM | read: auth != null；write: doc._openid == auth.openid |
| client_request_logs、waterEntries、waterMigrations、waterRoomMembers、waterRooms、waterRounds、water_feature_flags | ADMINONLY | 空（预设ACL，不解释为空规则=任意访问） |
| delete_tournament_requests、feedbacks、score_locks、user_profiles、waterSessions | PRIVATE | 空（预设ACL，不解释为空规则=任意访问） |

静态检索当前`miniprogram`非vendor源码：数据库调用仅见`home/index.js`的赛事ID批量get、`core/tournamentSync.js`的doc.get以及`sync/watch.js`的doc.get/watch；未发现客户端collection.add/update/set/remove。资料、名单、比分等写入通过既有云函数。该检索不能约束改造后的恶意客户端，也不能证明安全规则引擎实际拒绝。

`createTournament/index.js`由getWXContext取creatorId、首位players.id和playerIds；未手动写`_openid`。`permission-common.template.js`以creatorId作为主办身份，真实绑定participant可录分；客户端event.openid、姓名相同或导入guest不是授权身份。`submitScore`当前本地事务修复依赖此权限，再验证锁owner/session/过期及文档写冲突。

## 字段边界与待决方案

分享/看赛需要赛事名称、赛制、状态、场次、比分、排名及可展示的成员名/头像。内部字段包括creatorId、players.id、playerIds、refereeId、score.scorer.id、clientRequestId及分享动态消息内部凭据；不能因为页面没有显示就说后端没有向登录读者返回。当前整文档get/watch不能以文档级规则单独隐藏这些字段；新增公开投影会涉及读取/同步合同，应先定范围并测试，不能直接收紧read破坏已发布分享入口。

第一步候选规则只封闭客户端写入，保留现有分享读取：

```json
{
  "read": "auth != null",
  "write": false
}
```

这是可审候选，**未应用**。当前仓库静态入口支持该方向，但仍须隔离环境证明合法云函数创建、加入、录分、设置不受影响，客户端add/set/update/remove全部拒绝，再提交生产规则变更单独授权。公开字段分离属于后续合同，不能将这一候选称作隐私问题完全解决。

依据[CloudBase安全规则](https://docs.cloudbase.net/database/security-rules)：安全规则是文档级控制，create/update/delete未独立指定时继承write；查询条件还要满足规则约束。这支持需要逐操作实测的结论，不代表本轮已执行引擎。

## 隔离引擎验收清单（均未执行）

仅在用户明确指定的**非生产环境**运行；fixture命名使用专用测试前缀，身份A为主办、B为实际绑定参赛者、C为无关登录者、G为只有同名导入guest、U为未登录。禁止用生产赛事作攻击或写入试验，禁止用JS谓词模拟回执替代真实引擎。

| 操作 | 现行规则要查的结果 | 候选预期 |
| --- | --- | --- |
| U读取赛事 | 实际拒绝码 | 拒绝 |
| A/B/C读取已分享赛事、首页ID批量get、watch | 实际返回与查询限制 | 保持登录可读语义 |
| A客户端add，包括省略/自身/他人_openid及伪造creatorId | 分项保存实际拒绝/接受，不能凭存量判断 | 全部拒绝 |
| A/B/C客户端set（新ID和已有ID）、update/remove | 分项核对create/update/delete语义 | 全部拒绝，原doc不变 |
| 合法A云创建/配置/开赛、B录分 | 权威数据/version及业务结果 | 原合同成功 |
| C/G伪造event.openid/姓名调用配置/录分 | 业务拒绝且doc/锁不变 | 原合同拒绝 |
| A锁读后B接管再A提交；同锁并发两次 | 真实事务冲突与回调重试、score/锁最终状态 | A拒绝或事务重试后重新验证，不吞锁/覆盖比分 |
| A已提交后重复相同比分、锁已释放 | 幂等结果与version未重复增加 | deduped |
| score_locks、user_profiles等PRIVATE客户端自建/读取 | 预设ACL实际行为与后端读取影响 | 据证据决定是否有后续更改，不自动改13集合 |

每个case保存envId、SDK/runtime、身份角色标签、时间、请求关联、结果码、前后脱敏hash/version和清理回执；不公开token、openid或业务文本。隔离环境未指定、真实微信身份与引擎未运行，因此本项维持“本地修复/规则准备完成，云端验收未完成”。生产部署/规则写入/真实测试数据仍按用户明确的逐项授权边界。
