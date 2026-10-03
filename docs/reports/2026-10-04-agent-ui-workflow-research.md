# Agent 小程序开发方式：选型、实测与本地交付

> 状态：当前工具选型的时点实测证据。适用范围为正文记录的日期、样本和检查窗口；不作实时状态或当前执行指令。当前范围/最新结果看 [current](../tasks/current.md)，已吸收规则以 [总索引](../README.md) 指向的正文为准。原结论与失败证据保留。


日期：2026-10-04。目标是让模型稳定获得真实画面、页面状态、几何与错误信息，缩短修改后的反馈链路；没有恢复原12项业务计划。

## 决策

当前项目的主通道选择 **常驻官方 DevTools + 已有状态 fixture + 一条命令编排**。无需更换原生框架，也无需叠加第三方 MCP。基础页面可以使用同源浏览器预览辅助探索；现阶段不能用它代替 Vant 账本、微信组件或最终验收。

理由来自本机实测：官方 PNG 和数据读取可用；本次导航故障经明确页面编译恢复。浏览器 POC 运行 launch 成功，但 water 的隐藏弹层表达式与 Vant 字符串 observer 未兼容。迁移框架或维护完整 wx/组件模拟层会把当前故障转化成另一套工具维护成本。

不能承诺所有未来 IDE 故障都已消失。交付改善的是固定动作编排、具体故障定位、证据获取和已发现的编译/导航恢复路径。

## 项目事实与真正瓶颈

- workdir `D:/projects/badminton-miniapp/main`，branch `master`，HEAD `b571c68754e964e1a73800645f68a49d99f40f41`。启动时285个 dirty/untracked 文件均保留；没有重置、commit、push。
- 当前是原生 WXML/WXSS/JS + 云开发，已经有52个截图状态、16/16页面覆盖、fixture隔离、PNG/source/nonce/selector校验和清理。缺口不是重新安装截图 SDK。
- `currentGitManifest()` 绑定全仓库 HEAD/status/dirty文件hash；82个文档、11个浏览器/QR材料也在变化范围。单次manifest实测646ms；主要损失是非渲染文件变化造成的重新编译步骤，而非hash本身。此次保留签名合同，由命令自动处理，不静默放宽旧证据门禁。
- 既有320/430卡点的历史证据是控件树与屏幕截图来自不同窗口；日常反馈改走接口，不继续用坐标点击作为主通道。
- 默认空参数全跑52个case、批次all-or-nothing不适合单点样式修改；新入口必须明确给case，日常1–3个关联状态。
- 大段重复JSON影响Agent使用；详细证据落文件，控制台只返回路径、耗时、错误和关键状态。

## 开源与官方工具比较

维护信息按2026-10-04公开仓库/API/已发布包核验，不能由搜索抓取日期或星数替代。

| 候选 | 实际能力与依赖 | 本项目选择 |
|---|---|---|
| 官方 `wechatide`/Skills | 编译、真实模拟器PNG、页面data、console/network、导航；依赖本机DevTools与运行时。现机skill0.3.11、版本equal、登录有效 | 主通道，沿用已配置Codex身份 |
| `miniprogram-automator` 0.12.1 | 官方automation SDK，launch/connect/state/screenshot；仍依赖DevTools。项目已经安装此版本 | 复用52个fixture及真实验收，不重复安装 |
| `WaterTian/wechat-devtools-mcp` | README0.9.18、Electron2.x/Windows支持；官方MCP以外补长图与结构日志；仍是IDE包装 | 可选能力补充，不能治本次IDE注册错误；此次未装 |
| `jiawei686/wechat-dev-mcp` | Node工具，截图/数据/日志；作者记录冷启动竞态、有状态并发丢状态；仍依赖IDE | 采用其批量快照思路，不叠工具 |
| `DoraemonHugU/miniprogram-browser` | beta CLI，Windows/Node22/24；仍需登录真实IDE，README记录Tool可连但App timeout | 指令简化候选，没有消除根依赖 |
| `@weapp-vite/web` | 原生模板、样式、Page/Component映射浏览器，文档明确实验阶段；npm1.6.0与GitHub主线能力有差异 | 独立POC；launch通过、water失败，暂不作为全项目默认 |
| `glass-easel` | 微信官方多backend组件框架、WXML/WXSS编译器；不包含view/image等内建组件完整实现 | 需额外宿主/组件适配，非当前最快路线 |
| `miniprogram-simulate` | 官方组件测试模拟器，单线程模拟；不是完整App/Page/原生API运行环境 | 用于组件测试，不充当完整视觉验收 |
| `weapp-tailwindcss` | 类名/选择器/rpx的编译适配 | 与IDE连接、截图稳定性无直接关系，不引入 |
| Taro/uni-app/H5重写 | 可获得浏览器工具，但当前原生代码需要迁移或维护第二套实现 | 当前任务没有迁移必要，未进行迁移试验 |
| `ai-mode-skills` | 面向终端用户AI调度的原子接口/组件，验证仍依赖登录Nightly | 与coding-agent视觉反馈不同，不混作替代 |

一手资料：

- [腾讯 DevTools 调试参考](https://github.com/TencentCloudBase/skills/blob/main/skills/miniprogram-development/references/devtools-debug-preview.md)
- [微信自动化文档](https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/quick-start.html)、[automator已发布包](https://registry.npmjs.org/miniprogram-automator/latest)
- [维护中的 DevTools MCP](https://github.com/WaterTian/wechat-devtools-mcp)、[作者变更记录](https://github.com/WaterTian/wechat-devtools-mcp/blob/main/CHANGELOG.md)
- [wechat-dev-mcp](https://github.com/jiawei686/wechat-dev-mcp)、[miniprogram-browser](https://github.com/DoraemonHugU/miniprogram-browser)
- [weapp-vite Web 配置](https://vite.weapp.dev/config/web)、[Web包能力边界](https://vite.weapp.dev/packages/web)、[源码](https://github.com/weapp-vite/weapp-vite)
- [glass-easel及其组件边界](https://github.com/wechat-miniprogram/glass-easel)、[adapter](https://github.com/wechat-miniprogram/glass-easel/tree/master/glass-easel-miniprogram-adapter)
- [miniprogram-simulate](https://github.com/wechat-miniprogram/miniprogram-simulate)、[已记录限制](https://github.com/wechat-miniprogram/miniprogram-simulate/blob/master/docs/todo.md)
- [weapp-tailwindcss](https://github.com/sonofmagic/weapp-tailwindcss)、[ai-mode-skills](https://github.com/wechat-miniprogram/ai-mode-skills)

## 多平台使用经验

这些是作者实践，不能当成工具兼容性或耗时基准；工作流建议是结合本项目实测后的推导。

| 平台/日期 | 可核验实践 | 对当前工作的启示 |
|---|---|---|
| V2EX / 2025-01-21 | [Cursor小程序原帖](https://www.v2ex.com/t/1106753)：AI无法看到渲染，复杂样式仍要人工调 | 换编码模型不能消除视觉反馈缺口 |
| V2EX / 2025-06-11 | [原帖](https://www.v2ex.com/t/1137766)：先HTML探索，再由Claude/Cursor实现小程序 | HTML适合方向探索，未证明原生等效 |
| 中文技术社区 / 2026-09-30 | [飞哥数智坊文章可读转载](https://jishuzhan.net/article/2105274574979739649)：Windows/TRAE明确调用官方Skills后编译、运行、截图成功 | 用明确工具入口，避免隐式技能触发；该链接为转载 |
| Hacker News / 2025-08-03 | [作者讨论](https://news.ycombinator.com/item?id=44746621)：Playwright MCP取得多宽度截图核UI | 截图驱动闭环有效，但这是Web项目经验 |
| Reddit / 约2025-05 | [原帖](https://www.reddit.com/r/ClaudeAI/comments/1kogbmn/claude_code_playwright_mcp_how_did_you_speed_up/)：Agent逐操作慢，固定脚本先进入待测状态 | 重复动作脚本化，Agent负责新判断 |
| Reddit / 约2026-03 | [CLI讨论](https://www.reddit.com/r/ClaudeCode/comments/1r03a0t/claude_code_playwright_cli_superpowers/)：逐步等模型决策依旧慢，CLI效果并非一致 | 节省上下文不能冒充稳定性提升 |

[微软 Playwright MCP](https://github.com/microsoft/playwright-mcp)和[CLI](https://github.com/microsoft/playwright-cli)的作者文档支持coding agent使用CLI/Skills减少工具schema和大树上下文；持续探索仍可使用MCP。它们不能直接运行微信渲染器。本项目浏览器实测依照browser-router使用Edge ChatGPT扩展。

X/Twitter已搜索，[@aehyok原帖](https://x.com/aehyok/status/2076855134752268519)和[@sonicdr1p线索](https://x.com/sonicdr1p/status/2097291987531538914)原站返回403/读取失败；[aehyok可读转载](https://www.jxxy.net/ai/articles/aehyok-2076855134752268519/)仍含人工打开IDE、扫码与上传，不能证明已消除IDE依赖。X原文未读到的内容没有列作已核验结论。

## 实验A：官方即时观察

固定官方接口：`simulator_screenshot --optimize false`、`automation_page_action --action getData`、`automation_runtime_info`、`get_simulator_console`。没有鼠标点击、安装、扫码或新授权。

- 真实PNG484×1042，主控打开看图，首页与launch正常。
- 正确selector `.launch-page` 的PNG获取10,635ms；读modeCards数据1,282ms。
- 初次测量误用了不存在的 `.launch-header`，11,376ms后明确selector超时；已修正，没有把失败算成功。
- console `grep -i error`返回空只代表无匹配行，不声明整个日志系统为空。
- 即时观察图不包含fixture/source/cleanup完整证明，不能代替正式验收。

本机证据：`tmp/agent-ui-native-spike/current.png`、`official-launch.png`。截图没有借用浏览器或旧图。

## 实验B：完整原生状态与自动编排

原有单case launch实测25,513ms，真实PNG/source/nonce/geometry与整轮清理通过。

新入口 `npm run ui:iterate -- <case...>`：只读doctor → 仅源码变化时challenge → 官方明确页面编译 → refresh证明 → 关联fixture/capture → 清理与发布。每阶段耗时与具体失败在JSON摘要，完整证据留 `tmp/ui-iterate-runs/<id>/`。

首跑launch+water耗时42,418ms：doctor5,094、challenge5,339、刷新3,929、签名6,642、capture20,791。该批次失败，没有发布覆盖旧图；launch 14项receiptValidation通过但整轮清理失败，water在导航早期失败，runtimeExceptions均0。

进一步带success/fail回调探针取到实际错误：`reLaunch:fail can not reLaunch with an unregistered page (pages/launch/index), please register it in app.json first`。源码和运行时`__wxConfig.pages`均包含全部16页；不是漏写app.json。单次 `simulator_open_page pages/water/index`后，同探针立即`reLaunch:ok`，官方导航到water也成功。因此编排改成明确页面编译，而不以`simulator_refresh`回执当就绪证据。没有伪造签名或删除清理门禁。

最终修复后的实机批次与验证结果见本文末尾交付核验；本节保留失败过程。

## 实验C：不依赖IDE的同源浏览器

独立目录 `tmp/agent-ui-web-spike/`；npm @weapp-vite/web1.6.0 + Vite8.3.1，130包，安装38,480ms，首次ready8,199ms，414模块构建约548–624ms。构建时间不是浏览器截图时间，也不是微信性能。

用当前miniprogram绝对路径，直接运行原生文件和已有fixture；没有手写另一套HTML页面。根依赖与业务源码未改。云调用为本地拒绝/mock，CSP与宿主阻止远端网络，fixture没有真实业务数据写入。

POC修正均限试验配置：CommonJS转换、Vant现有包alias、WXS相对路径、全局WXSS传递、stub被runtime重装覆盖、query在路由启动前读取。npm1.6.0 `registerApp(options,_meta)`忽略style元数据，而较新的GitHub文档已有相关描述，这个版本差导致最初严重缺样式。

- launch：主控Edge亲看，ready=true、consoleErrors=[]，六种玩法和按钮正常出现，全局样式恢复；浏览器外壳/原生按钮/tabBar仍有差异，不宣称像素等效。
- waterV2Member24：数据注入成功，但实际页面未可用。隐藏弹层表达式`directChoices[directFromIndex].name`在strict模式访问undefined；Vant的字符串observer触发`observer.call is not a function`。停止新增适配，没有修改业务源码迁就模拟器。
- `window.__agentUI.snapshot()`可读route/data/errors/blocked calls、fixture耗时与setData次数/字节；这些是Web环境指标，不能宣称手机P95或微信setData性能。

POC完整细节保留 `tmp/agent-ui-web-spike/RESEARCH-AND-POC.md`。因复杂页面不通过，未加到根依赖、未把实验浏览器设成全部页面默认。

## 日常方式

1. 维持一个main的热会话，窗口restored但在后台；接口截图，不以桌面控件树/坐标点击作为日常入口。
2. 改一个问题，明确选1–3个关联状态，先完成关联测试，再执行ui:iterate；模型打开返回PNG，再读取必要receipt/data/错误，不整篇灌日志。全量测试与视觉采集分开，避免本次已观察到的并发采集超时样本。
3. 调试当前真实页面时用官方data/console/network接口；需要完整状态渲染证据时用fixture通道。
4. 全仓库签名暂保留；日志/文档会自动触发一次编译编排，避免人工串三条命令。未来缩小编译输入fingerprint应作为独立工具改动实测，而非偷改receipt。
5. 浏览器仅对已验证的基础页面做快速探索，Vant/微信平台能力进入原生；交付仍遵守当前原生/真机门禁。

## 交付核验

- 19项工具聚焦测试通过；独立代理冷读新增编排及官方wrapper，未发现可确认的可达缺陷。
- 全量1663项：1657通过、6跳过、0失败；`npm run check`通过；完整lint0错误/35警告（未改这些警告所在业务文件）；`git diff --check`通过，Git仅提示既有文件CRLF转换。
- 修复后首批launch+water全通过：总68,676ms，doctor4,419、challenge4,938、明确页面编译4,425、编译证明7,648、两页capture46,652。run：`tmp/ui-iterate-runs/2026-10-03T21-12-59-099Z-49008-5a5512e4/`。
- 同一热会话单water两次：28,663ms（doctor4,714+capture23,934），28,143ms（doctor4,252+capture23,883），没有编译；run分别 `2026-10-03T21-14-23-013Z-1416-6048bc91`、`2026-10-03T21-16-43-682Z-53280-04a2c01c`。修复后这三轮共4张图片全部机器通过、runtimeExceptions0、fixture/storage/整批清理通过。
- 主控亲看当前源码launch与water原图；window390×671、PNG484×1042、SDK3.17.3。图片仍标reviewStatus pending，因为这次是工具验证，不借机宣布业务UI验收或真机通过。
- 新默认入口为 `npm run ui:iterate -- waterV2Member24`；默认simulator-frame，显式环境覆盖仍支持。将确属main/当前listener的合法launch-signed session选为ignored本地默认，旧默认保全为 `tmp/agent-ui-native-spike/default-session-before-20261004.json`。没有编辑或伪造签名字段。
- 摘要含图片/receipt路径、viewport、PNG尺寸、SDK、fixture数据校验、匹配元素数、runtime事件数与阶段时间；最后几何字段追加后另跑聚焦测试、全量及当前源码采集，终端回执留 `tmp/agent-ui-native-spike/`。
- 最终代码19聚焦及1663全量（1657通过/6跳过/0失败）再验通过，定向lint0/0。最终摘要实机成功：`dataVerified=true`、27个匹配元素、390×671、484×1042、SDK3.17.3、runtimeExceptions0、总28,096ms；run `tmp/ui-iterate-runs/2026-10-03T21-20-48-051Z-25768-4fc71efb/`。
- **仍有底层偶发超时**：最终截图与全量测试并行时有一批56,437ms失败，selector readiness/visual settle通过，但后续automation响应超时，未发布任何图片；清理仍通过。证据 `tmp/ui-iterate-runs/2026-10-03T21-19-14-776Z-4904-6e0524e5/`。全量结束后串行采集28,096ms成功。不能由这对样本证明CPU负载就是根因，也不能宣称IDE偶发故障全部消除；日常把重全量与截图分开，不在失败后自动盲重试。串行原生通道是当前已验证最合适选择，不是对未来零故障的承诺。
- 浏览器最后复核launch：ready=true、errors=[]，fixture应用29.6ms、navigation loadEventEnd176.8ms，均为本机Web环境指标；water仍未通过。
- 证据PNG：`tmp/ui-screenshots-actual/simulator-frame/launch.png`、`waterV2Member24.png`；失败candidate、旧图和原始失败日志保留。没有preview/QR、上传、发布、云部署、真实业务写入或Git提交。
