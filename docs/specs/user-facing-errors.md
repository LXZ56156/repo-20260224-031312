# 用户侧错误呈现

所有小程序运行环境（开发、体验、正式）遵循同一规则：页面错误区、Toast 和弹窗只显示用户能理解并采取行动的业务提示，不展示 SDK 原始报错、堆栈、内部文件路径、模块名、traceId/requestId 或诊断号。

## 统一入口

- 需要保留清晰业务原文的局部提示使用 `miniprogram/core/cloud.js` 的 `getUserFacingErrorMessage(err, fallbackMessage)`。调用方提供与操作一致的兜底，例如“历史账本加载失败，请重试”。
- 既有统一错误策略继续使用 `getUnifiedErrorMessage` 或 `writeErrorUi.presentWriteError`；它们同样不泄露技术信息。不得直接把 `err.message`、`err.errMsg`、`rawMessage`、`rawResult` 或 `JSON.stringify(err)`绑定到 UI。
- 权限不足、数据冲突、锁过期、记录已结束、明确的参数校验等业务合同不因脱敏改变。已有友好业务原文保留；含技术细节的整段错误改用对应业务状态提示或操作兜底，不截取半段堆栈给用户。

## 诊断保留

原始信息保留在控制台以及错误对象的 `rawMessage`、`rawResult`、`code`、`state`、`traceId` 等诊断字段，供开发排查。禁止自动通过用户弹窗展示开发环境修复步骤。脱敏不意味着请求成功，不改变重试、幂等、冲突处理或权限判断。

直接回归见 `tests/cloud.user-facing-errors.test.js` 和 `tests/waterSession.v2-page.test.js` 的 SDK 堆栈场景。
