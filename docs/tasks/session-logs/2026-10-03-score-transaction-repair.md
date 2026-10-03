# 2026-10-03 录分锁与赛事提交事务修复

第5项本地实现已把赛事读取、权限/比分校验、锁读取、赛事比分/排名/版本写入及锁删除放入同一CloudBase事务；尚未部署，真实云事务冲突、双手机录分和生产规则引擎验收未完成。

## 证据与实现

- 基线main/master/b571c687，保留既有脏树。使用[weapp-cloud-contract-audit](D:/Relocated/LIZIXUAN/Codex/skills/weapp-cloud-contract-audit/SKILL.md)，只处理本次锁合同。
- 新确定性回归模拟A读锁后B接管，旧实现仍返回SCORE_SUBMITTED并写比分（先执行得到1失败）；按官方快照隔离语义调整stub后，单纯将锁读取搬入事务也复现1失败。最终把锁删除作为真实写操作纳入事务，冲突重试重新验证B锁，返回LOCK_OCCUPIED且比分未写入、B锁保留。
- 使用真实SDK已提供的db.runTransaction及transaction.collection().doc().update/remove；原来的赛事version单文档谓词改为同一事务的文档写冲突校验，version仍递增。没有runTransaction时不做非原子fallback。
- 同比分幂等回放仍在锁读取之前；缺lockSessionId的旧客户端合同保持。LOCK_EXPIRED/LOCK_OCCUPIED/VERSION_CONFLICT及结果根/data、traceId合同保持。
- callback每次重跑先清除分享局部状态；锁owner/expireAt/session校验后，锁删除与比分提交原子完成。锁删除失败将回滚比分，改变了原先比分可成功而best-effort清锁失败的内部行为，以关闭已证实接管漏洞。只有提交成功后执行已有best-effort分享更新；不在callback内调用外部分享API。
- 真实备份中的wx-server-sdk及@cloudbase/database源码已确认事务API及冲突callback重试存在。本地stub模拟冲突不代替平台实测。
- [官方CloudBase事务原理](https://docs.cloudbase.net/database/transaction)说明快照隔离、修改文档加锁、读取不加相同锁，故本次不能只依赖读集校验。事务仅使用doc，不使用where。

## 验证

- 最终直接handler及比分边界16项通过（handler15、边界1）；早期affected计划审阅后执行28文件125项通过、零失败/跳过，后续callback回放用例另经直接及全量验证。
- affected运行中已有fixture的预期错误/存储stub日志不等于失败，以上计数以node:test终态为准。
- 主控整合全量1529通过/6跳过/0失败，check通过、lint0错误42警告、diff检查通过；首次3处fixture失败及补齐合同见[整合回执](2026-10-03-local-stage-validation.md)。
- [Luna冷审](2026-10-03-score-transaction-cold-review.md)未发现可复现阻塞。审查曾仅按底层@cloudbase返回值质疑stats，主控逐层检查真实wx包装并实际执行无网络`tmp/sdk-transaction-wrapper-contract-20261003.cjs`，证明wx事务update.stats.updated与remove.stats.removed，审查据此撤回；没有为该误判修改业务代码或加入多形状兼容。

## 剩余门禁

13集合安全规则和索引已读入备份；[字段/规则方案和隔离引擎清单](2026-10-03-database-permission-preparation.md)已完成，真实规则引擎尚无隔离环境测试。tournaments任意登录可读/基于doc._openid客户端写的风险不能从存量无_openid推导关闭；候选保留read、客户端write=false尚未应用。已询问非生产envId，部署/测试写入仍需具体授权。

临近expireAt边界只按事务读取时Date.now验证，不声称提交瞬间严格未过期；真实CloudBase冲突调度/回滚、双手机与OpenAPI尚未验证。新submitScore部署、任何规则更改及真实写入仍各需新授权。
