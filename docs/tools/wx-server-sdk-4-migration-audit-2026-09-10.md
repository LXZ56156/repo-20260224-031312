# wx-server-sdk 4.x 独立迁移审计

日期：2026-09-10。结论：完成离线迁移影响审计，当前不升级、不部署。后台截图不依赖云 SDK 升级。

## 事实与依据

- 项目 23 个云函数继续精确声明 `wx-server-sdk: 2.6.3`。
- 官方最新稳定包为 4.0.2，底层依赖 `@cloudbase/node-sdk: 3.17.2`；4.0.3-beta.1 为测试版。
- 官方 2.7.0 变更已明确 BigInt JSON 序列化由 number 转为 string；跨到 4.x 会包含该变化，不能只改版本号。
- 官方 4.0.1 从 `@cloudbase/node-sdk` 2.10.0 升至 3.17.2，移除旧 `tcb-admin-node` 依赖的变化也在迁移范围。

来源：[官方仓库及变更日志](https://github.com/wechat-miniprogram/wx-server-sdk)、[官方 npm 发布](https://www.npmjs.com/package/wx-server-sdk?activeTab=versions)。

## 当前合同与验证

| 合同面 | 本地审计 | 上线迁移门槛 |
|---|---|---|
| 身份与环境 | 现有 `DYNAMIC_CURRENT_ENV`、`init`、`getWXContext` 用法；4.0.2 离线导出可用，动态环境仍为 symbol | 隔离测试环境验证 OPENID、APPID、调用来源和事务环境 |
| 数据库 | `database`、`collection`、`runTransaction`、`command.inc` 在 4.0.2 离线实例中可用 | 验证 get/update/remove 返回 shape、条件更新计数、事务重试语义 |
| 数值/日期 | 当前业务人数、比分、版本、流水序号按 Number 使用，无显式业务 BigInt | 核对大整数、Date/serverDate、聚合结果序列化；禁止静默类型变化 |
| 响应 | 继续保持 ok/code/message/state/traceId/data 及旧客户端根级字段 | 对现有错误归一化、权限拒绝与业务幂等执行合同测试 |
| 并发写入 | scoreLock 代次、submitScore 乐观锁、waterSession version/clientRequestId 均不能随迁移删除 | 隔离数据集重放重复提交、旧锁释放、版本冲突和删除竞态 |
| 文件/OpenAPI | generateShareCode 使用 uploadFile/wxacode；manageActivityId 使用 updatableMessage | 隔离环境验证 Buffer、fileID、OpenAPI 字段及失败错误码 |

实际安装 4.0.2 到 gitignored `tmp/sdk4-audit/`，只检查导出并创建本地数据库句柄，没有调用 get/set/update/upload 或其他远程方法。项目依赖未变更。离线接口存在性不证明远程服务行为兼容。

## 决策

保持 2.6.3。本次审计已形成可审查结论，但“4.x 已迁移”不成立。未来升级应独立分支、锁定稳定依赖、隔离环境合同回归、单独部署授权和回退包；不能夹带在截图工具优化中。
