# 每次独立打水账本：批准增量

批准日期：2026-09-12。本文覆盖此前“清零后新一轮、重新选择本轮球友”的提案；旧提案已撤回。基础业务与权限继续遵守 [V1 兼容规格](standalone-water-ledger.md)、[V2 多人账本规格](collaborative-water-ledger-v2.md)。

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
