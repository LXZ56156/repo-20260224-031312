# 客户端缺陷修复冷读（2026-10-03）

## 范围与现场

- checkout：`D:\projects\badminton-miniapp\main`，branch `master`，HEAD `b571c68754e964e1a73800645f68a49d99f40f41`。
- 冷读了设置页与赛程页指定改动、`tests/settings.draft-retry.test.js`、`tests/schedule.identity-recovery.test.js`，并查看了重试 CTA 和页面导航绑定。未读取实现代理结论，也未改源码或 `current.md`。
- 直接验证：`node --test tests/settings.draft-retry.test.js tests/schedule.identity-recovery.test.js`，10 项通过，0 失败。

## 发现

### P2：固定 payload 重试成功时，用户后来输入的草稿会随自动返回丢失

可触发步骤：用户第一次保存 payload P1 失败；用户把表单改成 P2；点击“重试上次操作”。重试闭包正确重放 P1 与原 `clientRequestId`。如果这次写入成功，保存流程会拉取 P1；`applyTournament` 因 P2 与旧基线不同而继续把 P2 显示在表单上；随后成功分支仍无条件在 420ms 后导航回 lobby。P2 没有机会以新请求 ID 保存，并在离开页面后丢失。

证据：`settingsActions.js:311-324` 成功后 fetch、清 retry、toast 并无条件安排自动返回；`settings/index.js:142-153` 按旧基线保留仍未提交的字段。现有 `settings.draft-retry.test.js` 的 retry case 把 `cloud.call` 每次都 mock 为失败，因此覆盖了“重试失败后再新保存使用新 ID”，没有覆盖“重试成功且页面上已有更新草稿”。

最小验收覆盖：先让 P1 写入失败，再改为 P2 并使原 payload 重试成功；断言重试仍使用 P1/原 ID，且 P2 仍可留在页面发起新保存；随后断言新保存提交 P2 且使用新 ID。成功重试存在较新的未保存字段时，不应自动离开页面。

## 已覆盖且未发现阻塞

- 名单同步保留本地已改字段，同时 `playersCount`、权限与比赛状态由新文档重算。变为非管理员或非草稿时，表单写入门禁读取新状态；名单降到 3 人时 `canConfigureSettings` 变为 false，retry 进入 `saveSettings` 后在 `cloud.call` 前退出。即使仍可配置，`maxMatches` 也取最新名单值并在保存/重试时检查 payload 总场次。
- 普通新保存从当前表单构造新 payload 和 request ID；重试显式复用冻结 payload 与原 ID。现有测试覆盖重试失败、其后新保存取得新 ID，以及名单缩减后不再发写请求。
- 赛程页通过身份代次和 active 标记丢弃 hide/unload 或旧代次的 `auth.login()` 结果；当前可见代次拿到迟到 openid 后会重新应用已有 tournament，从而恢复录分权限，无需再拉 tournament。新增测试覆盖迟到身份、hide/unload、hide/show 代次竞争和加载错误“返回首页”的导航调用。
- 未发现 P0/P1 或其他明确 P2 阻塞。真实微信 UI/手机仍未验证；本次只运行上述定向 Node 测试。
