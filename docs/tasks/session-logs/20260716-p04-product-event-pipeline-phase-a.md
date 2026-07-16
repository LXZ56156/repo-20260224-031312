# 2026-07-16 P04 产品事件管道 Phase A 收口

## 范围与状态

- 工作线：04「产品事件管道 Phase A」。
- 分支：`codex/roadmap-product-events`。
- 实现提交：`4070f7b`（`feat: add fail-closed product event pipeline`）。
- 当前状态：Phase A 已完成，等待总控集成。
- 本轮收口仅更新 P04 任务文档和本 session log，不修改产品代码，不扩展 Phase B。

## 已实现契约

- 客户端配置固定 `enabled: false`；服务端仅接受严格的 `PRODUCT_EVENTS_ENABLED === 'true'`，缺失或其他值均关闭。
- 事件名固定为 19 个 allowlist 项，属性仅允许 `t`、`s`、`m`、`src`、`a`、`r`，不接受动态名称、原始赛事 ID、数组、嵌套值或自由文本；`t` 是 8 位 FNV-1a 假名化短标识，不是原始赛事 ID 或密码学匿名标识。
- `anonymousInstallId` 和 `eventId` 在客户端随机生成；`eventId` 重试保持稳定，云端只保存这两个标识经 domain separator 隔离的 SHA-256 摘要。
- 客户端队列最多 20 条一批，具备容量上限、发送中事件保护、10 秒请求超时、指数退避和重启恢复。
- `reportProductEvents` 对非法项逐条拒绝，使用稳定文档键和事务完成批内、跨批幂等，返回 `accepted`、`deduped`、`rejected` 计数。
- 禁止字段包括 `OPENID`、用户 ID、手机号、昵称、头像 URL、原始赛事 ID、群 ID、分享票据、地理位置、姓名、反馈正文和原始异常 payload。
- 原 `console.info + wx.reportEvent` 行为保持；自建队列或云函数失败不阻断业务、不弹提示。
- Phase A 未修改现有页面埋点调用，未接入 `createTournament`、`joinTournament`、`startTournament`、`submitScore`、`updateSettings`、`cloneTournament` 等业务热函数。

## 实现阶段验证记录

| 检查 | 结果 | 备注 |
| --- | --- | --- |
| 聚焦契约回归 | 通过，38/38 | 覆盖 growthTracker、队列、客户端/云端字典一致性、云函数 logic/index 和既有云写入契约 |
| `npm run check:cloud-common` | 通过 | `9 templates / 23 functions` |
| 针对性 ESLint | 通过 | 0 error；仅有仓库 `MODULE_TYPELESS_PACKAGE_JSON` 提示 |
| `npm run verify:full` | 通过 | 完整测试、deprecated API、cloud-common、全仓 lint、diff check 均通过；lint 为 0 error、64 条基线 warning |
| 排阵波动用例单独复跑 | 通过，16/16 | post-commit 部署前检查中的一次并发超时未复现；失败发生在部署函数调用之前，没有执行云函数部署 |

## 本轮文档收口验证

- P04 聚焦契约回归通过，38/38；覆盖 growthTracker、队列、客户端/云端字典一致性、云函数 logic/index 与既有云写入契约。
- `npm run check:cloud-common` 通过：`9 templates / 23 functions`。
- 文档与代码事实一致性检查通过：客户端默认关闭、服务端严格开关、19 个事件完整匹配、无自动建集合；业务热函数和页面禁区差异为 0。
- 文档格式检查通过：session log 唯一命名，无尾随空白，`git diff --cached --check` 无错误。

## 未验证与未执行

- 未在真实 CloudBase 环境验证 `product_events` collection、权限、服务端事务、serverDate 或 SDK 运行时行为。
- 本工作线未创建真实 collection、未部署 `reportProductEvents`、未启用客户端或服务端开关，也未写入或回填真实数据。
- 远端环境状态本轮未连接核验；上述“未执行”仅描述本工作线没有实施这些动作。
- 未执行小程序 preview/upload、正式发布、push、PR 或 merge。
- 未验证线上网络失败率、队列长期容量、真实设备存储生命周期和数据保留策略。
- 8 位 `t` 存在 32-bit 碰撞与被猜测风险，只适合作为粗粒度分析短标识，不能作为安全身份或唯一业务键。
- Phase B 的业务热函数成功事件、聚合、漏斗、cohort、运营后台、告警与历史回填均未开始。

## 启用前门槛

1. 先由总控集成 `4070f7b`，解决共享文件冲突并重新通过聚焦回归、cloud-common 和 `verify:full`。
2. 单独审批并预建 `product_events` collection，配置最小必要权限和数据保留策略；不得依赖运行时自动建集合。
3. 单独审批并部署 `reportProductEvents`，先在服务端开关保持关闭时验证 `EVENT_PIPELINE_DISABLED` 稳定契约和零写入。
4. 在隔离测试数据中验证事务幂等、部分失败、数据库失败映射、摘要字段和无 PII，再决定是否开启服务端开关。
5. 服务端验证与监控通过后，才可另行审批客户端 `enabled`；必须保留快速关闭能力，并验证失败不阻断业务。
6. Phase B 热函数事件必须另开任务逐函数审批、实现和回归，不得与 Phase A 启用捆绑。

## 收口结论

P04 Phase A 的本地实现已完成并保持双端默认关闭，当前只具备待集成资格，不具备部署或启用授权。
