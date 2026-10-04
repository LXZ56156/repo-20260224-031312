# 用户侧错误呈现

状态：现行跨页面错误合同。仅涉及错误处理/展示时读取；任务路由见 [总索引](../README.md)。

所有小程序运行环境（开发、体验、正式）遵循同一规则：页面错误区、Toast 和弹窗只显示用户能理解并采取行动的业务提示，不展示 SDK 原始报错、堆栈、内部文件路径、模块名、traceId/requestId 或诊断号。

## 统一入口

- 需要保留清晰业务原文的局部提示使用 `miniprogram/core/cloud.js` 的 `getUserFacingErrorMessage(err, fallbackMessage)`。调用方提供与操作一致的兜底，例如“历史账本加载失败，请重试”。
- 既有统一错误策略继续使用 `getUnifiedErrorMessage` 或 `writeErrorUi.presentWriteError`；它们同样不泄露技术信息。不得直接把 `err.message`、`err.errMsg`、`rawMessage`、`rawResult` 或 `JSON.stringify(err)`绑定到 UI。
- 权限不足、数据冲突、锁过期、记录已结束、明确的参数校验等业务合同不因脱敏改变。已有友好业务原文保留；含技术细节的整段错误改用对应业务状态提示或操作兜底，不截取半段堆栈给用户。

## 诊断保留

原始信息保留在控制台以及错误对象的 `rawMessage`、`rawResult`、`code`、`state`、`traceId` 等诊断字段，供开发排查。禁止自动通过用户弹窗展示开发环境修复步骤。脱敏不意味着请求成功，不改变重试、幂等、冲突处理或权限判断。

直接回归见 `tests/cloud.user-facing-errors.test.js` 和 `tests/waterSession.v2-page.test.js` 的 SDK 堆栈场景。

## 后台同步状态

联网时的轮询、监听降级、重连、缓存先显、后台刷新和内部过期标记只用于诊断，不显示横幅、Toast、弹窗或技术刷新指引。不能把内部状态改成另一条文案继续提示用户，也不能通过清除内部错误或停止同步来隐藏问题。

确认为离线时保留“当前离线”和刷新入口；实际加载失败、写入失败、权限拒绝与冲突继续按业务合同提示。同步状态呈现统一经 `core/syncStatus.js`，保留内部 fallback 状态及错误诊断，直接回归见 `tests/syncStatus.test.js`、`tests/page-sync.contract.test.js`；监听恢复另由 `sync/watch.js` 的直接回归验证。没有客户端实收或设备错误码时，不把静默展示当作频繁降级根因已全部解决。
