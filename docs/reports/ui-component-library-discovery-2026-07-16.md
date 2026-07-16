# P07：小程序 UI 组件库 discovery 报告

> 状态：`discovery_complete_pending_explicit_pilot_approval`
> 访问日期：2026-07-16
> 维护观察窗：2024-07-16 至 2026-07-16
> 启动分支 / 启动 HEAD：`codex/roadmap-ui-component-spike` / `70845c1`
> 开发基线：`codex/ui-optimization-v2@743b016`
> 产品/线上基线：`master@5813ffc`

## 0. 决策摘要

当前约束下的唯一推荐是 **WeUI Miniprogram，且只采用微信官方 `useExtendedLib` 路径**。

- 冻结权重后的评分：WeUI **77**、TDesign **72**、Vant **66**。
- TDesign 与 Vant 的 tag-pinned 官方 quickstart 都要求移除全局 `app.json` 的 `"style": "v2"`，否则组件样式可能错乱；本项目当前正启用该配置。二者因此不满足“单页试点、全局视觉基线不变”的硬门槛。
- 微信开放文档说明 `useExtendedLib.weui` 等价于引入 WeUI 最新 npm 包，并且**不占用小程序包体积**。它无需安装 npm 包，也无需在 `app.wxss` 导入实验性全局样式。
- 未来试点只推荐 `pages/feedback/index` 一个页面，限定 `mp-form`、`mp-cells`、`mp-cell` 三个组件。首版仅替换表单布局容器，不接管现有校验、提交、Toast、Modal、导航或云调用语义。

这不是试点实施授权。第 7 节矩阵中的页面、保留、调整、删除、文案/CTA、导航/分享、默认行为、组件清单、全局配置、包体预算、截图与回滚须由用户逐项批准；获批后应另开实现任务。

## 1. 范围与硬门槛

本报告只回答“在现有产品约束下，哪个组件库最适合作为低耦合技术试点”。组件库不能反向定义产品需求，也不能被解释为全量 UI 重构授权。

冻结的硬门槛：

1. 只允许一个页面、3–5 个组件；不一次迁移多个页面。
2. 保留 `master@5813ffc` 的信息、确认步骤、CTA、导航、分享和操作语义；当前唯一已批准的产品差异仍是 schedule 中央 `VS`/比分布局。
3. 不删除 `app.json.style = "v2"`，不在 `app.wxss` 做实验性覆盖，不全局声明组件。
4. 依赖必须可精确移除；页面不得直接散布供应商标签和事件协议。
5. 包体必须有可复算基线、软预算、硬停止线和真实构建后的同口径复测。

## 2. 当前本地事实

### 2.1 仓库与配置

| 项目 | 只读核验结果 |
|---|---|
| worktree | `D:\projects(WIN)\badminton-miniapp-worktrees\ui-component-spike` |
| 启动 branch / HEAD（基线） | `codex/roadmap-ui-component-spike` / `70845c1`；启动时工作区干净 |
| 页面 | `miniprogram/app.json` 声明 14 页，tabBar 为 home / launch / mine |
| 分包 | `subPackages: []`，当前没有分包 |
| 自定义组件 | 没有 `miniprogram/components`、`miniprogram_npm`、页面 `usingComponents` 或 `component: true` 配置 |
| UI 依赖 | `package.json` / lockfile 中没有 TDesign、WeUI、Vant；生产依赖仅 `canvas` |
| npm 构建 | `packNpmManually: false`，`packNpmRelationList: []`；根 `package.json` 位于 `miniprogramRoot` 外 |
| 基础库 / 样式 | `libVersion: 3.14.2`；`app.json` 使用 `"style": "v2"` |
| 全局视觉 | `app.wxss` 已有项目自有色彩、间距、圆角、阴影、表单、按钮、状态和骨架 token；不应由候选库全局覆盖 |
| 截图体系 | 现有 11 个真实 case，无 feedback case；smoke 固定为 launch / scheduleRunning / home |
| trial 页面 | feedback 共 5 个文件、6,051 B；非 tabBar、无分享和赛事路由，只有资料 gate、表单输入与一次 `feedbackSubmit` 写调用 |

### 2.2 不执行 preview/upload 的源码包基线

可复算方法：以 `project.config.json.srcMiniprogramRoot = miniprogram/` 为根，递归统计文件，按现有 `packOptions.ignore` 排除 `**/node_modules/**/*` 和三张 `share-bg-*.png`。该方法不触发编译、preview 或 upload。

| 类型 | 文件数 | 原始字节 |
|---|---:|---:|
| `.js` | 97 | 651,141 |
| `.wxss` | 15 | 117,076 |
| `.wxml` | 19 | 105,283 |
| `.json` | 16 | 4,124 |
| `.png` | 7 | 3,767 |
| `.md` | 2 | 2,574 |
| 合计 | **156** | **883,965 B（863.25 KiB）** |

这是“待打包源码原始字节”基线，不是微信开发者工具编译后的真实主包大小。项目开启 minify，最终包还受编译器、依赖分析和扩展库处理影响；真实包体必须在获批实现后用相同 DevTools/libVersion/config 做前后对照。

## 3. 官方证据窗口

三个候选均以 2026-07-16 可取得的最新 stable 为版本窗口，维护活跃度统一观察 2024-07-16 至 2026-07-16。搜索摘要和社区文章未用于评分。

### 3.1 候选版本

| 候选 | stable / 发布时间 | 仓库状态快照 | npm 与 License | 直接一手来源 |
|---|---|---|---|---|
| TDesign Miniprogram | `1.15.3`，2026-07-09；tag commit `d251faa` | 默认分支 2026-07-15 仍有提交；观察窗 41 个 stable | `tdesign-miniprogram`，MIT；npm unpacked 1,589,427 B | [Release](https://github.com/Tencent/tdesign-miniprogram/releases/tag/tdesign-miniprogram%401.15.3)、[tag](https://github.com/Tencent/tdesign-miniprogram/tree/tdesign-miniprogram%401.15.3)、[registry](https://registry.npmjs.org/tdesign-miniprogram)、[LICENSE](https://github.com/Tencent/tdesign-miniprogram/blob/tdesign-miniprogram%401.15.3/LICENSE) |
| WeUI Miniprogram | npm `1.5.6`，2024-11-15；publish commit `c2fe8e2` | master HEAD `5d04cad`，2026-04-28；npm 已约 20 个月未发版 | `weui-miniprogram`，MIT；npm unpacked 674,195 B | [官方仓库](https://github.com/wechat-miniprogram/weui-miniprogram)、[1.5.6 registry](https://registry.npmjs.org/weui-miniprogram/1.5.6)、[publish commit](https://github.com/wechat-miniprogram/weui-miniprogram/commit/c2fe8e2)、[LICENSE](https://github.com/wechat-miniprogram/weui-miniprogram/blob/master/LICENSE) |
| Vant Weapp | `1.11.7`，2024-10-14；npm gitHead `963b975` | dev HEAD 2026-02-27；stable 已 640 天未更新 | `@vant/weapp`，MIT；npm unpacked 889,219 B | [Release](https://github.com/youzan/vant-weapp/releases/tag/v1.11.7)、[package.json](https://github.com/youzan/vant-weapp/blob/v1.11.7/package.json)、[registry](https://registry.npmjs.org/%40vant%2Fweapp)、[LICENSE](https://github.com/youzan/vant-weapp/blob/v1.11.7/LICENSE) |

WeUI 的发布治理存在不一致：GitHub Releases latest 仍是 2021 年的 `v1.0.8`，GitHub tags 也未覆盖 npm `1.5.6`；因此版本事实以 npm registry 与对应 publish commit 交叉核对。

### 3.2 微信开放文档

| 主题 | 官方结论 | 来源 |
|---|---|---|
| npm | 基础库 2.2.1+ 支持；小程序 npm 包会把 `miniprogram` 指定的构建目录全部复制到 `miniprogram_npm`，不是按页面 `usingComponents` 自动物理裁剪 | [npm 支持](https://developers.weixin.qq.com/miniprogram/dev/devtools/npm.html) |
| ExtendedLib | `useExtendedLib.weui` 等价于引入对应扩展库最新 npm 包，不占用小程序包体积；最低基础库 2.2.1 | [全局配置 / useExtendedLib](https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html#useExtendedLib) |
| 页面声明 | `usingComponents` 可限定在页面 JSON，最低基础库 1.6.3 | [页面配置](https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/page.html) |
| 样式隔离 | 默认 `isolated`；`apply-shared` 允许页面样式进入组件；`shared` 双向影响；JSON `styleIsolation` 从 2.10.1 支持 | [组件模板和样式](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/wxml-wxss.html) |
| 分包 | `subPackages` 决定打包边界，tabBar 页面必须在主包 | [使用分包](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/basic.html) |

访问日的微信“使用分包”页未列出数字包体上限，因此本报告不拿记忆中的历史数字当当前官方事实。试点采用项目内更严格的增量预算，并以获批后 DevTools 的同口径 package report 为最终门槛。

## 4. 评分框架与结果

权重在查候选结论前冻结为任务文档给定的 100 分制。评分锚点如下：

| 维度 | 权重 | 评分锚点 |
|---|---:|---|
| 原生小程序兼容性 | 20 | 基础库、原生组件模型、DevTools/npm、与当前 `style:v2`/渲染配置兼容 |
| 包体与按需引入 | 20 | 真实构建复制范围、页面声明、分包/ExtendedLib、可复算度 |
| 维护与升级风险 | 15 | stable 新鲜度、观察窗发布、提交/PR、变更纪律 |
| 主题与现有视觉融合 | 15 | token、局部主题、样式隔离、暗色/字体/圆角及全局冲突 |
| 组件覆盖 | 10 | 项目所需表单、弹层、列表、空态、反馈，以及本试点可用性 |
| 文档、测试与可访问性 | 10 | 官方 API/demo、上游测试/类型、ARIA、错误与迁移说明 |
| 团队接入与回滚成本 | 10 | 版本锁、包装层、学习成本、全局改动与退出步骤 |

### 4.1 总分

| 候选 | 兼容 20 | 包体 20 | 维护 15 | 主题 15 | 覆盖 10 | 文档/测试/a11y 10 | 接入/回滚 10 | 总分 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **WeUI Miniprogram / ExtendedLib** | 19 | 18 | 8 | 9 | 7 | 7 | 9 | **77** |
| TDesign Miniprogram | 12 | 11 | 13 | 12 | 10 | 8 | 6 | **72** |
| Vant Weapp | 13 | 15 | 6 | 10 | 9 | 7 | 6 | **66** |

### 4.2 TDesign：72/100

- **兼容 12/20**：原生组件、项目 `libVersion 3.14.2` 高于 tag 文档的保守最低 `2.12.0`；但 [1.15.3 quickstart](https://github.com/Tencent/tdesign-miniprogram/blob/tdesign-miniprogram%401.15.3/packages/tdesign-miniprogram/site/docs/getting-started.md) 明确要求移除 `style:v2`，同 tag README 又写最低 `2.6.5`，官方口径不一致。
- **包体 11/20**：页面可路径声明，但微信 npm 会复制完整 `miniprogram_dist`；TDesign 维护者建议依赖 `ignoreUploadUnusedFiles` 过滤未使用文件，而当前项目未配置。见 [#3835](https://github.com/Tencent/tdesign-miniprogram/issues/3835)、[#3362](https://github.com/Tencent/tdesign-miniprogram/issues/3362)。Icon font 也没有按图标裁剪方案，见 [#2618](https://github.com/Tencent/tdesign-miniprogram/issues/2618)。
- **维护 13/15**：`1.15.3` 距访问日 7 天，观察窗 41 个 stable，仓库持续活跃；但 [CHANGELOG](https://github.com/Tencent/tdesign-miniprogram/blob/tdesign-miniprogram%401.15.3/packages/tdesign-miniprogram/CHANGELOG.md) 显示 patch 版本也出现 CSS token 删除/改名，升级必须锁精确版本并逐条复验。
- **主题 12/15**：有 [CSS Variables 全局/局部主题](https://github.com/Tencent/tdesign-miniprogram/blob/tdesign-miniprogram%401.15.3/packages/tdesign-miniprogram/site/docs/custom-theme.md)、[样式覆盖](https://github.com/Tencent/tdesign-miniprogram/blob/tdesign-miniprogram%401.15.3/packages/tdesign-miniprogram/site/docs/custom-style.md) 和 [Dark Mode](https://github.com/Tencent/tdesign-miniprogram/blob/tdesign-miniprogram%401.15.3/packages/tdesign-miniprogram/site/docs/dark-mode.md)；但组件普遍 `apply-shared`，且暗色和 `style:v2` 前置会扩大到全局。
- **覆盖 10/10**：官方 [导航配置](https://github.com/Tencent/tdesign-miniprogram/blob/tdesign-miniprogram%401.15.3/packages/tdesign-miniprogram/site/site.config.mjs) 有 65 个常规组件，覆盖项目所需类别。
- **文档/测试/a11y 8/10**：每组件文档、d.ts、unit/demo/e2e/coverage 脚本和通用 aria 属性均有源码证据，见 [根 package.json](https://github.com/Tencent/tdesign-miniprogram/blob/tdesign-miniprogram%401.15.3/package.json) 与 [ARIA decorator](https://github.com/Tencent/tdesign-miniprogram/blob/tdesign-miniprogram%401.15.3/packages/components/common/src/instantiationDecorator.ts)；未验证上游当前 CI/coverage。
- **接入/回滚 6/10**：包装层可隔离 API，但官方路径需要全局移除 `style:v2`，包体优化还可能改 `project.config.json`，退出不再是单页恢复。

### 4.3 WeUI：77/100

- **兼容 19/20**：由微信官方设计和小程序团队维护，支持原生组件；[quickstart](https://wechat-miniprogram.github.io/weui/docs/quickstart.html) 提供 ExtendedLib 与页面 `usingComponents` 路径，不要求移除 `style:v2`。需保守验证 `styleIsolation: apply-shared` 的 2.10.1+ 行为。
- **包体 18/20**：[微信全局配置](https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html#useExtendedLib) 明确 ExtendedLib 不占小程序包体；扣分是只能跟随“最新 npm 包”，无法项目内锁定版本。npm 方案会复制 668,861 B 的 `miniprogram_dist`，本试点不采用。
- **维护 8/15**：观察窗有 11 个 npm stable，但最后一个 `1.5.6` 停在 2024-11-15；master 2026-04-28 仍合并修复，说明并非停维，但发布链与 GitHub Release/tag 治理滞后。见 [commits](https://github.com/wechat-miniprogram/weui-miniprogram/commits/master/)、[releases](https://github.com/wechat-miniprogram/weui-miniprogram/releases)、[pulls](https://github.com/wechat-miniprogram/weui-miniprogram/pulls)。
- **主题 9/15**：WeUI WXSS 提供 `--weui-*` 变量、DarkMode 和 `ext-class`；21 个公开组件均使用 `apply-shared`。但完整 token 契约未版本化，radius/font 等覆盖有限，npm 路径还要求全局 WXSS，故只允许 ExtendedLib + 页面局部 wrapper。见 [weui-wxss v2.6.17](https://github.com/Tencent/weui-wxss/releases/tag/v2.6.17) 与 [quickstart](https://wechat-miniprogram.github.io/weui/docs/quickstart.html)。
- **覆盖 7/10**：[官方组件站](https://wechat-miniprogram.github.io/weui/docs/) 有 21 个公开组件，覆盖 cells/form/dialog/loading 等，但缺独立 Button、Input、Picker、Switch、Empty、Toast 等完整组件。
- **文档/测试/a11y 7/10**：有逐组件文档、Jest + `miniprogram-simulate` 配置和 1.2.0 无障碍适配记录；stable 源码多处包含 aria role/label。扣分是文档 mismatch issue 尚存且未验证 CI，见 [jest.config.js](https://github.com/wechat-miniprogram/weui-miniprogram/blob/master/jest.config.js)、[CHANGELOG](https://github.com/wechat-miniprogram/weui-miniprogram/blob/master/CHANGELOG.md)、[#263](https://github.com/wechat-miniprogram/weui-miniprogram/issues/263)。
- **接入/回滚 9/10**：不安装依赖、不生成 `miniprogram_npm`，只需 `useExtendedLib`、页面 wrapper 和局部声明；扣分为版本不可锁，必须保留截图 canary 和回归门槛。

### 4.4 Vant：66/100

- **兼容 13/20**：原生组件、最低基础库 2.6.5；但 [v1.11.7 quickstart](https://github.com/youzan/vant-weapp/blob/v1.11.7/docs/markdown/quickstart.md) 明确要求删除 `style:v2`，与当前硬门槛冲突。
- **包体 15/20**：零 runtime dependency，页面可逐组件声明；`lib` 仅 458,076 B，明显小于另两个 npm 构建目录。但官方没有承诺 DevTools 最终只保留可达闭包，因此以完整 `lib` 作保守估计。
- **维护 6/15**：`1.11.7` 已 640 天未发版，dev 虽在 2026-02-27 仍有依赖提交，但功能修复未形成 stable；见 [Release](https://github.com/youzan/vant-weapp/releases/tag/v1.11.7)、[commits](https://github.com/youzan/vant-weapp/commits/dev/)、[请求发版 #6021](https://github.com/youzan/vant-weapp/issues/6021)。
- **主题 10/15**：有 [CSS Variables 主题](https://github.com/youzan/vant-weapp/blob/v1.11.7/docs/markdown/theme.md) 和 [外部样式覆盖](https://github.com/youzan/vant-weapp/blob/v1.11.7/docs/markdown/custom-style.md)，但只覆盖部分属性、优先级有时需 `!important`，无 Weapp 完整暗色方案。
- **覆盖 9/10**：[官方导航配置](https://github.com/youzan/vant-weapp/blob/v1.11.7/vant.config.mjs) 覆盖 Button、Cell、Field、Picker、Dialog、Empty、Loading、Toast 等项目常用组件。
- **文档/测试/a11y 7/10**：有组件 API/demo、Jest、`miniprogram-simulate`；明确的 a11y 证据主要是 Button 转发 `aria-label`，不能外推 Vue 版声明。见 [jest.config.js](https://github.com/youzan/vant-weapp/blob/v1.11.7/jest.config.js) 与 [button WXML](https://github.com/youzan/vant-weapp/blob/v1.11.7/packages/button/index.wxml)。
- **接入/回滚 6/10**：页面声明和 wrapper 可撤回，但 npm 构建链与全局 `style:v2` 变化使单页退出成本上升。

### 4.5 敏感性与不确定性

- 对任一单一维度权重做 `±25%` 调整并把总权重重新归一到 100，WeUI 仍保持第一：WeUI 区间 `76.05–77.92`，TDesign `71.19–72.89`，Vant `65.06–67.01`。
- 证据不确定区间约为 WeUI `±4`、TDesign `±5`、Vant `±5`，WeUI 与 TDesign 的区间有重叠；最终差异不能只靠四舍五入分数解释。
- 决胜硬门槛是 `style:v2`：当前不允许全局移除时，TDesign/Vant 均不能形成严格单页试点。若未来单独批准移除 `style:v2`、全页截图回归和包体过滤配置，TDesign 因维护与覆盖优势应重新评分。
- 若团队把“版本必须精确锁定”设为绝对门槛，WeUI ExtendedLib 也不合格；此时结论应是“三者均暂不实施”，不能自动切换到 TDesign/Vant。

## 5. 包体估算与预算

### 5.1 同口径保守估算

官方 npm tarball 仅解包到本 worktree 的忽略目录做测量，未安装、未复制到生产目录。复算规则如下：从表 3.1 锁定的 registry 版本元数据取得官方 tarball，解包后读取包根 `package.json.miniprogram`，递归计入其指向目录内的全部普通文件，以文件原始 `Length` 求和；不做压缩、去重、扩展名排除或理论 tree-shaking。下表再把该整目录字节加到当前 883,965 B 源码基线。

微信 npm 会复制 `miniprogram` 指向的完整构建目录，因此每库列出的 3–5 个目标组件只定义拟用范围，默认 npm 包体估算仍采用可复算的整目录保守上限，不采用不可验证的静态依赖闭包。

| 候选路径 | 拟用组件（3–5 个） | 默认物理增量 | 默认 npm 后源码总量估算 | 结论 |
|---|---|---:|---:|---|
| TDesign npm | Button / Cell / Tag / Empty / Toast | `miniprogram_dist` 1,451,378 B | 2,335,343 B | 当前无 unused filter，且 `style:v2` 冲突；不适合作为本轮单页路径 |
| WeUI npm | `mp-form` / `mp-cells` / `mp-cell` | `miniprogram_dist` 668,861 B | 1,552,826 B | npm 仍整包复制且需要全局 WXSS；不采用 |
| Vant npm | Button / Cell / Empty / Loading | `lib` 458,076 B | 1,342,041 B | 整目录明显增加包体，且 `style:v2` 冲突 |
| **WeUI ExtendedLib** | **`mp-form` / `mp-cells` / `mp-cell`** | **官方口径 0 B** | **保持 883,965 B + 本地 wrapper/page delta** | **唯一进入审批的路径** |

真实验收只认相同 DevTools、基础库、minify 与配置下的前后 package report；上述源码原始字节不是编译后包体承诺。

### 5.2 WeUI 单页试点预算

| 门槛 | 预算 |
|---|---:|
| 扩展库代码包增量 | 官方口径 `0 B` |
| 项目自有 wrapper + 页面 JSON/WXML/WXSS/JS 原始增量软预算 | `≤ 16 KiB` |
| 项目自有原始增量硬停止线 | `≤ 32 KiB` |
| 对应源码总量硬上限 | `883,965 + 32,768 = 916,733 B` |
| DevTools 编译后主包增量硬停止线 | `≤ 32 KiB`，以获批后前后同口径实测为准 |
| 超限处理 | 停止试点、执行完整回滚；不得用 upload 试错 |

不为试点新建分包，也不移动 feedback 路由。这样避免把一次组件验证扩大为路由和加载策略变更。

## 6. 包装层、主题与样式隔离设计

未来获批实现时，页面不直接使用 `mp-*` 标签：

```text
pages/feedback/index
  -> 页面本地 feedback-form-shell（项目协议）
      -> mp-form
      -> mp-cells
      -> mp-cell
          -> 现有原生 picker / textarea / input
```

设计约束：

1. `feedback-form-shell` 放在 feedback 页面私有组件目录，不提前抽象成全项目组件库。
2. wrapper 接收现有 `categoryOptions/categoryIndex/content/contentLength/contact`，只发出标准化的 `categorychange/contentinput/contactinput`；页面 JS 继续拥有 gate、10 字校验、busy guard、Toast、Loading、Modal 和 cloud call。
3. vendor `usingComponents` 只写在 wrapper JSON；feedback 页面 JSON 只认识本地 wrapper；`app.json` 不配置全局 `usingComponents`。
4. wrapper 使用隔离样式；内部通过 WeUI `ext-class` 和 CSS variables 映射现有 token。赋值方向示例为 `--weui-BRAND: var(--brand-500)`，FG/BG 类变量分别引用项目 `--neutral-*` / `--bg-*`；实际可用的 WeUI 键名必须按运行时 ExtendedLib 版本复核后逐个列入试点 diff。
5. 不修改 `app.wxss`，不写全局 `.weui-*` 选择器，不启用 DarkMode 试验，不改变现有圆角/卡片层级。
6. `mp-form` 首版只作结构容器，不接管校验；避免把“组件接入”变成错误提示和默认行为重写。

## 7. 单页试点审批矩阵

> 以下矩阵的每一项均为“待用户逐项批准的提案”，不是已批准产品变化。

| 审批项 | 提案 | 审批状态 |
|---|---|---|
| 页面 | 仅 `pages/feedback/index`；不触及 tabBar、赛事核心链路、schedule 或分享页 | 待批准 |
| 保留 | Hero“意见反馈”；资料 gate 及三个重试/完善资料按钮；问题类型、反馈内容、联系方式三字段；500 字计数；“提交反馈”CTA；10 字校验；成功编号；失败提示 | 待批准；提案为全部保留 |
| 调整 | 只把表单卡内部三行布局换成 WeUI form/cells/cell，允许出现 WeUI 的行分隔、内边距和 label/value 对齐变化；外层 Hero、card、按钮视觉层级保持现状 | 待批准；须逐点确认 |
| 删除 | 无 | 待批准；提案为“无” |
| 文案与 CTA | 文案、顺序、主次、点击区域和 `loading/disabled` 条件不变；不新增营销或引导文案 | 待批准；提案为不改变 |
| 导航与分享 | `onGoCompleteProfile`、returnUrl、返回行为不变；页面无分享入口，不新增分享 | 待批准；提案为不改变 |
| 默认行为 | picker 仍为原生 selector；textarea/input 事件和值不变；至少 10 字校验、Toast、Loading、成功 Modal、失败重试、busy guard、清空字段时机均不变 | 待批准；提案为不改变 |
| 组件清单 | `mp-form`、`mp-cells`、`mp-cell`，恰好 3 个；不引入 Dialog/TopTips/Button 等额外组件 | 待批准；提案为限定三项 |
| 全局配置 | 只新增 `useExtendedLib.weui = true`；必须保留 `style: "v2"`；不加全局 usingComponents | 待批准；需协调 app.json 所有者 |
| 包体预算 | ExtendedLib 0 B；本地增量软限 16 KiB、硬限 32 KiB；编译后主包增量硬限 32 KiB | 待批准；提案为所列门槛 |
| 截图验收 | 新增 `feedbackReady`、`feedbackBlocked`；同时重跑现有 launch/scheduleRunning/home smoke，防止全局回归 | 待批准；提案为所列矩阵 |
| 回滚 | 反向应用试点专属 diff，恢复 feedback 页面，删除 page-local wrapper；若无其他使用者，删除 `useExtendedLib.weui`；确认无供应商引用 | 待批准；步骤已定义 |

## 8. 获批后测试先行方案

1. **先固化现状契约**
   - 新增 feedback 结构/文案测试，锁定三个字段、placeholder、500 字计数、CTA、blocked 各分支下三种按钮的文案与出现条件，以及“删除为无”。
   - 复用 `feedback.auth-gate.test.js`、`cloud.write-result-consumers.test.js`、`critical-write-timeout-reentry.test.js`，确认 gate、structured error、超时 busy 行为未变。
2. **包装层单测**
   - 用现有 `node:test` mock 组件，验证输入/选择事件被标准化为当前页面 handler 需要的 `detail.value`。
   - 验证 wrapper 不发 submit、不调用 cloud、不拥有导航和 Toast/Modal。
3. **配置与样式契约**
   - 断言 `style` 仍为 `v2`、app 无全局 `usingComponents`、仅 `useExtendedLib.weui` 新增。
   - 断言 package/lockfile 无 `weui-miniprogram`、TDesign、Vant 依赖，无 `miniprogram_npm`。
   - 断言 `app.wxss` 零差异、vendor selector 只存在于 page-local wrapper。
4. **包体门槛**
   - 记录获批实现前后的源码原始字节和 DevTools package report；固定 DevTools、`libVersion 3.14.2`、minify 与 ignore 配置。
   - 任一项目自有或编译后增量超过 32 KiB，测试失败并回滚。
5. **真实截图**
   - `feedbackReady`：默认分类、10+ 字内容、可选联系方式和计数器可见；检查 label/input 对齐、换行、裁切、键盘区和 CTA 主次。
   - `feedbackBlocked`：need_profile 标题、说明、“去完善资料”“我已完成，刷新状态”均保留；login_failed 的“重新尝试”单按钮态由既有 gate 单测和新增结构测试覆盖，不为本轮再扩大截图 case。
   - 人工验证原生 picker、textarea、input 可操作；不通过真实云提交制造截图数据。
   - 因 `useExtendedLib` 是全局配置，再跑 launch / scheduleRunning / home smoke，确认现有产品像素无回归。
6. **聚焦与全量回归**
   - 先跑 feedback/配置/截图矩阵聚焦测试，再按风险运行 `npm run verify:full` 和 `git diff --check`。

## 9. 精确回滚步骤

1. 实施前记录试点专属 commit/diff；回滚时反向应用该试点 diff。若其后已有无关改动，只反向应用试点 hunks，禁止覆盖后续变更。
2. 确认 `pages/feedback/index.js`、`index.json`、`index.wxml`、`index.wxss` 恢复为试点前版本，既有 `gate.js` 保持无差异。
3. 删除 `pages/feedback` 下的 page-local wrapper 目录。
4. 用 `rg` 确认生产树没有 `mp-form`、`mp-cells`、`mp-cell`、`weui-miniprogram` 或 `--weui-` 残留。
5. 若没有其他获批消费者，从 `app.json` 删除 `useExtendedLib.weui`；`style: "v2"` 始终保留。
6. 不需要删除 npm dependency、lockfile 条目或 `miniprogram_npm`，因为推荐路径从不安装 npm 包；若出现这些文件，视为实现偏离并一并清理。
7. 重跑 feedback 聚焦测试、包体基线、feedback 两个截图 case 和现有三页 smoke；回滚后页面与原基线截图/结构契约一致才算完成。

## 10. 验证、未验证与残余风险

### 已验证

- 当前仓库没有 UI 组件依赖、usingComponents、自定义组件或分包。
- 三个候选的 stable、发布时间、npm 构建目录、License、维护状态和官方接入文档均已核对。
- 官方 tarball 仅在 worktree 忽略目录做体积测量；没有安装、构建或复制到生产树。
- TDesign/Vant 的 `style:v2` 冲突均来自对应 stable tag 的官方 quickstart。
- WeUI ExtendedLib 的 0 B 包体结论来自微信开放文档，而非推测。

### 未验证

- 未执行任何候选的 npm install、构建 npm、组件运行、真机或 DevTools 实图。
- 未得到当前项目编译后的真实主包字节；883,965 B 只是可复算源码基线。
- 未验证 ExtendedLib 在所有目标客户端上解析到的确切 WeUI 版本；官方机制不支持项目内锁版本。
- 未验证 WeUI `apply-shared` 与现有 1,246 行 `app.wxss` 的实际视觉碰撞。
- 未做读屏、焦点、键盘、Skyline/WebView 或弱网交互验收，也未验证上游 CI 当前为绿。
- 微信当前分包文档未给数字上限，数字平台限额不在本报告中作已验证事实。

### 残余风险

1. **ExtendedLib 漂移**：平台“最新 npm 包”升级可能在项目无依赖变更时改变渲染；需固定基础库截图 canary，并在微信基础库/DevTools 升级时复验。
2. **样式隔离**：WeUI stable 使用 `apply-shared`，宽泛页面选择器可能进入组件；必须通过 page-local wrapper 隔离，禁止全局 `.weui-*`。
3. **版本与维护**：WeUI npm 约 20 个月未发版，master 修复未必进入 ExtendedLib；必须把实际行为而非仓库 HEAD 当验收对象。
4. **产品错觉**：替换组件只解决技术一致性和回滚验证，不自动改善反馈转化；真实 UI 优化优先级仍由 P01 数据决定。
5. **全局文件冲突**：`miniprogram/app.json` 属高冲突文件；即使只加 `useExtendedLib`，未来实施也要与集成对话协调并单独提交。

## 11. 本轮声明

本轮未安装依赖，未修改 `package.json`、lockfile、`miniprogram/app.json`、`app.wxss`、任何页面/组件/脚本/测试或云函数；未新增 demo 页；未执行 preview/upload、发布、部署或真实数据写入。交付物仅为本 discovery 报告、P07 任务状态和对应 session log。
