# 独立打水账本：当前规格入口

> 状态：现行产品与合同导航。独立账本增量批准于 2026-09-12；本文不证明部署、发布或设备验收完成，不授予外部动作权限。当前状态与剩余验收见 [current](../tasks/current.md)。

## 阅读与优先级

打水任务先读本文，再按任务读取下表命中的章节，不默认加载 V1/V2 全文。本文覆盖此前“稳定共享房间内清零、新一轮、继承或重新选择名单”的产品提案；旧提案已撤回。当前产品是每次建立独立账本，继续最近账本、历史账本和旧链接均回到各自原账本。

| 要处理的任务 | 按需读取 | 适用范围 |
|---|---|---|
| 新建、继续、历史账本和分享归属 | 本文“用户体验”“云合同”“旧账本与交付边界” | 当前产品与新增 API；不恢复新一轮 UI |
| 记水计算、名单和身份 | [V2 账务与身份规则](collaborative-water-ledger-v2.md#v2-accounting-identity) | 多人协作通用规则；轮次只是底层/兼容概念 |
| 成员写入、更正和撤销 | [V2 角色与权限](collaborative-water-ledger-v2.md#v2-permissions)、[V2 核心流程](collaborative-water-ledger-v2.md#v2-core-flows) | 成员处理自己的记录，发起人处理当前账本记录；略过已撤回生命周期节 |
| 数据、返回结构、事务、开关或分页 | [V2 数据模型](collaborative-water-ledger-v2.md#v2-data-model)、[V2 云合同](collaborative-water-ledger-v2.md#v2-cloud-contract)、[V2 客户端合同](collaborative-water-ledger-v2.md#v2-client-contract) | 本文的 createLedger/listLedgers 补充优先；保留原权限、幂等、锁和止损保护 |
| 旧客户端、旧数据或迁移 | [V1 数据与云合同](standalone-water-ledger.md#v1-cloud-contract)、[V2 迁移与兼容](collaborative-water-ledger-v2.md#v2-migration) | 区分 V1 owner-only、V2 member 写入；不得隐式迁移 |
| 页面迭代、验证或交付 | [开发工作流](../tools/agent-development-workflow.md)、[UI 验收门禁](../tools/weapp-ui-acceptance.md)、[current](../tasks/current.md) | 工具与验收用当前入口；历史方案里的实施顺序、版本和截图不是完成证据 |

冲突时，当前产品以本文为准；V2 的多人权限、流水修订、事务和兼容合同继续有效；V1 只用于未迁移旧账本/旧客户端兼容，不把 owner-only、200 条文档上限或“不能另开账本”恢复为当前 V2 产品限制。当前云状态以 current 链接的实际回执为准，不能仅凭版本号、API 存在或本文批准日期推断已上线。

底层仍可保留 `create`、`createRound`、`finish` 等兼容能力；API 存在不等于允许新增用户可见动作。独立账本旧链接归属不变，并不意味着所有新账本共用一个长期房间或名单。

## 用户体验

- 每次打水建立独立账本、独立名单和邀请链接；新建仅初始化发起人，随后添加或邀请本次球友。
- 新建不关闭、不清空旧账本，不继承旧名单；旧流水和旧邀请链接继续归属原账本。
- 通过继续最近账本、历史账本或旧分享链接返回原账本，按原权限继续记账。
- UI 不提供新轮次或结束动作，也不要求用户理解底层轮次。

## 云合同

- `apiVersion: 2 / createLedger` 接收 `ownerName`、`clientRequestId`；账本 ID 由调用者 OpenID 与请求 ID 确定。相同意图重试返回同一账本，相同请求 ID 换载荷返回 `CLIENT_REQUEST_ID_REUSED`；新的请求 ID 创建独立账本。
- 响应沿用 V2 的 `room / round / viewer / entries / page / capabilities`；成功为 `WATER_ROOM_CREATED`，重试为 `WATER_WRITE_DEDUPED`。旧 `create` 的稳定发起人账本语义保留。
- `listLedgers` 接收 `limit / cursor`，仅列出调用者有效 owner/member 账本；摘要为 `id / title / participantCount / recordCount / updatedAtMs / isOwner / legacy`，按更新时间倒序、ID 降序破平，返回 `page.hasMore / nextCursor`。
- 列表逐项验证成员身份、房间与底层记录归属及功能开关；游标只负责分页，不授予读取权限。当前实现扫描本人全部成员记录并汇总排序，读取成本随本人账本数增长。
- V2 继续复用 room/round/entry 数据结构及已有权限、幂等、并发保护；底层 round 与旧 API 仅用于兼容，不等于 UI 仍采用新轮次模型。

## 旧账本与交付边界

- 未迁移的 V1 账本至少纳入本人作为发起人的稳定账本；V1 成员历史不自动发现，仍通过原分享链接进入。不执行隐式迁移。
- 新增索引声明 `waterRoomMembers_openid_id_asc`：`openid ASC, _id ASC`。声明位于 [bootstrap manifest](../../scripts/water-v2-cloud-bootstrap.manifest.json)，已于2026-09-12远程创建并核验字段方向。
- 本地实现、测试与批准范围不代表云部署、客户端上传或 UI 已验收。当前验证与未完成项见 [会话记录](../tasks/session-logs/2026-09-12-closeout-water-restart.md)。
