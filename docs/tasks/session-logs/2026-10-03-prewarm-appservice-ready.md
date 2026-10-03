# Prewarm AppService 准备竞态：最小本地修复

在生成和绑定nonce前，prewarm现会在同一automation connection上限时等待真实AppService API/应用可用。仅合法“尚未就绪”快照重试，evaluate异常、挂起和异常返回都失败退出；没有重复launch，没有伪造marker或放宽签名护栏。

## 输入证据与范围

主控提供的真实现象：DevTools2.02.2609292、SDK3.17.3成功打开main，但两次prewarm在auto启动后立即bind返回 `getApp unavailable`；随后同一39471 connection只读evaluate能看到getApp/getCurrentPages/App/Page函数和正确home。bind实际同时检查getApp函数和非空app；此前诊断不能区分即时失败是函数未定义还是app为空，按AppService/app实例初始化竞争处理，不能把先前失败当成有效签名或截图。

本轮经主控解除截图Git冻结后，只改 `scripts/dev/weapp-ui-prewarm.js`，新增 `tests/weapp-ui-prewarm-ready.test.js` 和本唯一日志。未改应用源码、registry、共享lib、current或其他日志；未启动DevTools、切设备、抓图或部署。

## 行为

新增 `waitForAppServiceReady`，复用既有 `screenshotTool.timeout` 和deadline/短轮询风格。使用既有 `WEAPP_PREWARM_TIMEOUT_MS` 作为就绪等待上限，默认60000ms；每次probe和轮询都受剩余deadline约束，默认轮询间隔200ms。没有新增framework或环境配置开关。

probe只读 `typeof getApp/getCurrentPages/App/Page`、`getApp()` 是否有真实非空应用对象、`getCurrentPages()` 是否返回数组。所有API为函数且应用/页面API可用才返回ready；不要求globalData或首屏已经完成业务加载，后续原有route/viewport/SDK/path验证继续负责签名条件。probe不写应用、storage、nonce或marker。

始终未就绪报 `AppService did not become ready within ...ms` 并附最后API快照；挂起evaluate报 `AppService readiness evaluate timed out ...`。evaluate抛错/拒绝立即传播，异常结构立即拒绝，没有把异常错误当作启动中或ready。

等待位置在进程身份/后台运行标志校验后、crypto nonce构造前。就绪后保持原有markerBinding精确比较、disconnect/reconnect marker核验、SDK版本/窗口宽度/项目路径/路由/监听者/源码稳定和最终session校验。成功输出额外记录实际readiness attempts/elapsed/snapshot作为诊断；没有修改session授权合同。完整流程仍只有一次 `automator.launch`。

## 验证

- 7项直接需求测试先全部失败（缺少等待函数/集成位置），实现后通过。
- 直接执行真实probe函数覆盖：API未出现→getApp返回undefined→真实app对象；应用不被probe写marker。fake clock覆盖始终未就绪达到deadline及最后API诊断；实际15ms deadline覆盖挂起evaluate。evaluate transport拒绝、getApp内部抛错、异常返回和非正/非有限deadline均拒绝。
- 集成位置检查确认wait先于nonce构造和binding、一次launch，原marker错误/源码稳定条件保留；既有前台显式授权守卫与截图session/nonce/source/width等工具测试继续通过。
- `node --test tests/weapp-ui-prewarm-ready.test.js tests/weapp-ui-prewarm-foreground-guard.test.js tests/weapp-ui-screenshot-cases.test.js tests/weapp-ui-screenshot-tool.test.js`：**89/89通过，0失败/跳过**。本轮没有运行应用全量测试。
- 定向ESLint：**0错误、0警告**。定向 `git diff --check` 通过。

代码/测试完成后交主控重新冻结并执行真实prewarm复核。上述是工具离线验证，**尚不能宣称真实prewarm已通过、已产生有效签名或有效截图**。
